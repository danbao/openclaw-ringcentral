import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import { downloadRingCentralAttachment } from "./api.js";
import { getRingCentralPlatform } from "./auth.js";

// Mock the auth module
vi.mock("./auth.js", () => ({
  getRingCentralPlatform: vi.fn(),
}));

const mockAccount: ResolvedRingCentralAccount = {
  accountId: "test",
  enabled: true,
  credentialSource: "config",
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  jwt: "test-jwt",
  server: "https://platform.ringcentral.com",
  config: {},
};

describe("Security: downloadRingCentralAttachment", () => {
  const mockPlatform = {
    get: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);
  });

  it("should prevent download if Content-Length exceeds maxBytes", async () => {
    const maxBytes = 1024; // 1KB
    const contentLength = 2048; // 2KB

    const arrayBufferSpy = vi.fn().mockResolvedValue(new ArrayBuffer(contentLength));

    mockPlatform.get.mockResolvedValue({
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-length") return String(contentLength);
          if (name.toLowerCase() === "content-type") return "text/plain";
          return null;
        },
      },
      arrayBuffer: arrayBufferSpy,
    });

    await expect(
      downloadRingCentralAttachment({
        account: mockAccount,
        contentUri: "https://example.com/file.txt",
        maxBytes,
      })
    ).rejects.toThrow(/exceeds max bytes/);

    // CRITICAL: arrayBuffer must NOT be called if Content-Length check works
    expect(arrayBufferSpy).not.toHaveBeenCalled();
  });

  it("should succeed if Content-Length is within limit", async () => {
    const maxBytes = 1024;
    const contentLength = 512;

    const arrayBufferSpy = vi.fn().mockResolvedValue(new ArrayBuffer(contentLength));

    mockPlatform.get.mockResolvedValue({
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-length") return String(contentLength);
          if (name.toLowerCase() === "content-type") return "text/plain";
          return null;
        },
      },
      arrayBuffer: arrayBufferSpy,
    });

    const result = await downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: "https://example.com/file.txt",
      maxBytes,
    });

    expect(result.buffer.byteLength).toBe(contentLength);
    expect(arrayBufferSpy).toHaveBeenCalled();
  });
});
