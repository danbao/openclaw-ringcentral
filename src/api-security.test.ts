import { describe, expect, it, vi, beforeEach } from "vitest";
import { downloadRingCentralAttachment } from "./api.js";
import { Readable } from "stream";
import { getRingCentralPlatform } from "./auth.js";

// Mock the auth module
vi.mock("./auth.js", () => ({
  getRingCentralPlatform: vi.fn(),
}));

const mockAccount = {
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

  it("should enforce maxBytes limit using stream and NOT call arrayBuffer", async () => {
    const hugeSize = 1024 * 1024 * 10; // 10MB
    const maxBytes = 1024 * 1024 * 1; // 1MB

    const mockResponse = {
      headers: {
        get: () => "application/octet-stream",
      },
      arrayBuffer: vi.fn().mockImplementation(async () => {
        return new ArrayBuffer(hugeSize);
      }),
      // Simulate Node.js Readable stream
      body: Readable.from(async function* () {
        // Yield chunks
        for (let i = 0; i < 10; i++) {
          yield Buffer.alloc(1024 * 1024); // 1MB chunks
        }
      }()),
    };

    (getRingCentralPlatform as any).mockResolvedValue({
      get: vi.fn().mockResolvedValue(mockResponse),
    });

    await expect(downloadRingCentralAttachment({
      account: mockAccount as any,
      contentUri: "https://example.com/hugefile",
      maxBytes: maxBytes,
    })).rejects.toThrow(/RingCentral attachment exceeds max bytes/);

    // KEY CHECK: arrayBuffer should NOT be called because we used the stream
    expect(mockResponse.arrayBuffer).not.toHaveBeenCalled();
  });

  it("should enforce maxBytes limit with Web Streams", async () => {
      const maxBytes = 10;
      const cancelSpy = vi.fn();
      const readSpy = vi.fn()
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(5) })
          .mockResolvedValueOnce({ done: false, value: new Uint8Array(10) }) // Total 15 > 10
          .mockResolvedValue({ done: true, value: undefined });

      const mockReader = {
          read: readSpy,
          cancel: cancelSpy,
          releaseLock: vi.fn(),
      };

      const mockResponse = {
          headers: { get: () => "text/plain" },
          body: {
              getReader: () => mockReader,
          },
          arrayBuffer: vi.fn(),
      };

      (getRingCentralPlatform as any).mockResolvedValue({
          get: vi.fn().mockResolvedValue(mockResponse),
      });

      await expect(downloadRingCentralAttachment({
          account: mockAccount as any,
          contentUri: "https://example.com/stream",
          maxBytes: maxBytes,
      })).rejects.toThrow(/RingCentral attachment exceeds max bytes/);

      expect(cancelSpy).toHaveBeenCalled();
      expect(mockResponse.arrayBuffer).not.toHaveBeenCalled();
  });

  it("should download valid file correctly using stream", async () => {
    const content = Buffer.from("Hello World");
    const mockResponse = {
      headers: {
        get: () => "text/plain",
      },
      body: Readable.from([content]),
      arrayBuffer: vi.fn(),
    };

    (getRingCentralPlatform as any).mockResolvedValue({
      get: vi.fn().mockResolvedValue(mockResponse),
    });

    const result = await downloadRingCentralAttachment({
      account: mockAccount as any,
      contentUri: "https://example.com/file",
      maxBytes: 100,
    });

    expect(result.buffer.toString()).toBe("Hello World");
    expect(result.contentType).toBe("text/plain");
    expect(mockResponse.arrayBuffer).not.toHaveBeenCalled();
  });
});
