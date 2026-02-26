import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ResolvedRingCentralAccount } from "./accounts.js";

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

describe("downloadRingCentralAttachment DoS protection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses streaming path with default limit when maxBytes is missing (safe behavior)", async () => {
    const { getRingCentralPlatform } = await import("./auth.js");
    const { downloadRingCentralAttachment } = await import("./api.js");

    const mockArrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(10));
    const mockGetReader = vi.fn().mockReturnValue({
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
      releaseLock: vi.fn(),
      cancel: vi.fn(),
    });

    const response = {
      headers: {
        get: () => "application/octet-stream",
      },
      body: {
        getReader: mockGetReader,
      },
      arrayBuffer: mockArrayBuffer,
    };

    vi.mocked(getRingCentralPlatform).mockResolvedValue({
      get: vi.fn().mockResolvedValue(response),
    } as any);

    // Call without maxBytes
    await downloadRingCentralAttachment({ account: mockAccount, contentUri: "/safe" });

    // Assert that we used the safe streaming path
    expect(mockArrayBuffer).not.toHaveBeenCalled();
    expect(mockGetReader).toHaveBeenCalled();
  });
});
