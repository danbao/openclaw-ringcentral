import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import { downloadRingCentralAttachment } from "./api.js";

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

describe("downloadRingCentralAttachment Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error if Content-Length exceeds maxBytes BEFORE calling arrayBuffer", async () => {
    const { getRingCentralPlatform } = await import("./auth.js");
    const mockArrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(10)); // Small buffer, but header says huge

    const mockPlatform = {
      get: vi.fn().mockResolvedValue({
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-length") return "1000000"; // 1MB
            if (name.toLowerCase() === "content-type") return "text/plain";
            return null;
          },
        },
        arrayBuffer: mockArrayBuffer,
      }),
    };

    (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);

    // Set maxBytes to 100 bytes
    await expect(
      downloadRingCentralAttachment({
        account: mockAccount,
        contentUri: "/restapi/v1.0/content/123",
        maxBytes: 100,
      })
    ).rejects.toThrow("RingCentral attachment exceeds max bytes (100)");

    // CRITICAL: Ensure arrayBuffer was NEVER called
    expect(mockArrayBuffer).not.toHaveBeenCalled();
  });

  it("should download file if Content-Length is within limit", async () => {
    const { getRingCentralPlatform } = await import("./auth.js");
    const mockArrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(50));

    const mockPlatform = {
      get: vi.fn().mockResolvedValue({
        headers: {
          get: (name: string) => {
            if (name.toLowerCase() === "content-length") return "50";
            return null;
          },
        },
        arrayBuffer: mockArrayBuffer,
      }),
    };

    (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);

    const result = await downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: "/restapi/v1.0/content/123",
      maxBytes: 100,
    });

    expect(result.buffer).toBeDefined();
    expect(mockArrayBuffer).toHaveBeenCalled();
  });
});
