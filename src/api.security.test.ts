import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import { downloadRingCentralAttachment } from "./api.js";

// Mock getRingCentralPlatform
const mockPlatform = {
  get: vi.fn(),
};

vi.mock("./auth.js", () => ({
  getRingCentralPlatform: vi.fn(() => Promise.resolve(mockPlatform)),
}));

const mockAccount: ResolvedRingCentralAccount = {
  accountId: "test-account",
  enabled: true,
  credentialSource: "config",
  clientId: "client-id",
  clientSecret: "client-secret",
  jwt: "jwt-token",
  server: "https://platform.ringcentral.com",
  config: {},
};

describe("downloadRingCentralAttachment Security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should throw error BEFORE reading body if Content-Length exceeds maxBytes", async () => {
    const maxBytes = 100;
    const largeSize = maxBytes + 10;

    const arrayBufferMock = vi.fn().mockResolvedValue(new ArrayBuffer(largeSize));

    mockPlatform.get.mockResolvedValue({
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-length") return String(largeSize);
          if (name.toLowerCase() === "content-type") return "text/plain";
          return null;
        },
      },
      arrayBuffer: arrayBufferMock,
    });

    await expect(
      downloadRingCentralAttachment({
        account: mockAccount,
        contentUri: "https://example.com/file",
        maxBytes,
      })
    ).rejects.toThrow(`RingCentral attachment exceeds max bytes (${maxBytes})`);

    // KEY CHECK: ensure arrayBuffer was NOT called
    expect(arrayBufferMock).not.toHaveBeenCalled();
  });

  it("should throw error AFTER reading body if Content-Length is missing but body exceeds maxBytes", async () => {
    const maxBytes = 100;
    const largeSize = maxBytes + 10;

    const arrayBufferMock = vi.fn().mockResolvedValue(new ArrayBuffer(largeSize));

    mockPlatform.get.mockResolvedValue({
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === "content-type") return "text/plain";
          return null; // Content-Length missing
        },
      },
      arrayBuffer: arrayBufferMock,
    });

    await expect(
      downloadRingCentralAttachment({
        account: mockAccount,
        contentUri: "https://example.com/file",
        maxBytes,
      })
    ).rejects.toThrow(`RingCentral attachment exceeds max bytes (${maxBytes})`);

    // KEY CHECK: ensure arrayBuffer WAS called (fallback behavior)
    expect(arrayBufferMock).toHaveBeenCalled();
  });
});
