import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRingCentralReportUploadTool,
  loadReport,
  RINGCENTRAL_REPORT_TARGET_PARAM,
  validateReportName,
} from "./report-upload-tool.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(data: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Map(),
  };
}

async function reportFixture(hex = "a") {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "rc-report-"));
  const fileName = `report-${hex.repeat(32)}.html`;
  const data = Buffer.from("<!doctype html><html><body>report</body></html>");
  await writeFile(path.join(rootDir, fileName), data);
  return { rootDir, fileName, data };
}

function cfg(rootDir: string, enabled = true) {
  return {
    channels: {
      ringcentral: {
        botToken: "bot-token",
        server: "https://api.example.com",
        reportUploads: { enabled, rootDir, maxBytes: 1024 },
      },
    },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe("RingCentral report upload tool", () => {
  it("requires an opaque report basename", () => {
    expect(() => validateReportName(`report-${"a".repeat(32)}.html`)).not.toThrow();
    expect(() => validateReportName("trace-request-id.html")).toThrow();
    expect(() => validateReportName(`../report-${"a".repeat(32)}.html`)).toThrow();
  });

  it("loads a bounded self-contained report and rejects an escaping symlink", async () => {
    const fixture = await reportFixture("b");
    const outside = await reportFixture("c");
    await symlink(
      path.join(outside.rootDir, outside.fileName),
      path.join(fixture.rootDir, outside.fileName),
    );

    const loaded = await loadReport(fixture.rootDir, fixture.fileName, 1024);
    expect(loaded.size).toBe(fixture.data.byteLength);
    expect(loaded.sha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(loadReport(fixture.rootDir, outside.fileName, 1024)).rejects.toThrow("escapes");
  });

  it.each([
    '<!doctype html><html><script src="https://example.com/x.js"></script></html>',
    '<!doctype html><html><script>fetch("https://example.com")</script></html>',
    '<!doctype html><html><body onload="alert(1)"></body></html>',
    '<!doctype html><html><style>@import "https://example.com/x.css"</style></html>',
    '<!doctype html><html><div style="background:url(//example.com/x)"></div></html>',
    '<!doctype html><html><img src=https://example.com/x></html>',
  ])("rejects active or remote HTML content", async (html) => {
    const fixture = await reportFixture("d");
    await writeFile(path.join(fixture.rootDir, fixture.fileName), html);
    await expect(loadReport(fixture.rootDir, fixture.fileName, 2048)).rejects.toThrow(
      "self-contained",
    );
  });

  it("uploads to the current Team chat injected by the runtime hook", async () => {
    const fixture = await reportFixture("e");
    mockFetch.mockResolvedValueOnce(jsonResponse({ id: "post-1" }));
    const tool = createRingCentralReportUploadTool(cfg(fixture.rootDir));

    const result = await tool.execute("call-1", {
      file_name: fixture.fileName,
      [RINGCENTRAL_REPORT_TARGET_PARAM]: "team:team-1",
    } as never);

    expect(result.details).toMatchObject({
      success: true,
      file_name: fixture.fileName,
      post_id: "post-1",
    });
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`groupId=team-1`),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "text/html; charset=utf-8" }),
      }),
    );
  });

  it("resolves a current DM user target before uploading", async () => {
    const fixture = await reportFixture("f");
    mockFetch
      .mockResolvedValueOnce(jsonResponse({ id: "dm-chat-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "post-2" }));
    const tool = createRingCentralReportUploadTool(cfg(fixture.rootDir));

    const result = await tool.execute("call-1", {
      file_name: fixture.fileName,
      [RINGCENTRAL_REPORT_TARGET_PARAM]: "user:person-1",
    } as never);

    expect(result.details).toMatchObject({ success: true, post_id: "post-2" });
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      "https://api.example.com/team-messaging/v1/conversations",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ members: [{ id: "person-1" }] }),
      }),
    );
    expect(String(mockFetch.mock.calls[1]?.[0])).toContain("groupId=dm-chat-1");
  });

  it("fails closed when disabled or outside a RingCentral conversation", async () => {
    const fixture = await reportFixture("a");
    const disabled = createRingCentralReportUploadTool(cfg(fixture.rootDir, false));
    const noContext = createRingCentralReportUploadTool(cfg(fixture.rootDir));

    await expect(
      disabled.execute("call-1", {
        file_name: fixture.fileName,
        [RINGCENTRAL_REPORT_TARGET_PARAM]: "team:team-1",
      } as never),
    ).resolves.toMatchObject({ details: { success: false, error: expect.stringContaining("disabled") } });
    await expect(
      noContext.execute("call-2", { file_name: fixture.fileName } as never),
    ).resolves.toMatchObject({
      details: { success: false, error: expect.stringContaining("current RingCentral") },
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
