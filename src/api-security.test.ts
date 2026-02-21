import { describe, expect, it, vi } from "vitest";
import { downloadRingCentralAttachment } from "./api.js";
import { Readable } from "stream";

// Mock auth
vi.mock("./auth.js", () => ({
  getRingCentralPlatform: vi.fn(),
}));

import { getRingCentralPlatform } from "./auth.js";

describe("downloadRingCentralAttachment Security", () => {
  it("should stream (Node Readable) and abort download if size exceeds maxBytes", async () => {
    const mockAccount: any = { accountId: "test" };
    const maxBytes = 10;

    // Create a stream that is larger than maxBytes
    const largeContent = Buffer.alloc(maxBytes + 100);
    const bodyStream = Readable.from(largeContent);

    const mockResponse = {
      headers: { get: () => "text/plain" },
      // arrayBuffer should NOT be called in the improved implementation
      arrayBuffer: vi.fn().mockRejectedValue(new Error("Should not use arrayBuffer")),
      body: bodyStream,
    };

    (getRingCentralPlatform as any).mockResolvedValue({
      get: vi.fn().mockResolvedValue(mockResponse),
    });

    await expect(downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: "http://example.com/file",
      maxBytes
    })).rejects.toThrow(/exceeds max bytes/);
  });

  it("should stream (Web ReadableStream) and abort download if size exceeds maxBytes", async () => {
    const mockAccount: any = { accountId: "test" };
    const maxBytes = 10;

    // Mock a Web ReadableStream
    const largeContent = new Uint8Array(maxBytes + 100);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(largeContent);
        controller.close();
      }
    });

    // Mock cancellation spy
    const cancelSpy = vi.fn();
    // We need to inject the cancel spy into the stream reader or stream itself
    // But since ReadableStream is standard, we can verify the behavior by the error thrown.
    // However, to be precise, let's just rely on the error thrown by our code.

    // In our implementation we call reader.cancel().
    // We can spy on the reader.

    const mockReader = {
      read: vi.fn()
        .mockResolvedValueOnce({ done: false, value: largeContent })
        .mockResolvedValueOnce({ done: true, value: undefined }),
      cancel: cancelSpy,
      releaseLock: vi.fn(),
    };

    const mockBody = {
      getReader: () => mockReader
    };

    const mockResponse = {
      headers: { get: () => "text/plain" },
      arrayBuffer: vi.fn().mockRejectedValue(new Error("Should not use arrayBuffer")),
      body: mockBody,
    };

    (getRingCentralPlatform as any).mockResolvedValue({
      get: vi.fn().mockResolvedValue(mockResponse),
    });

    await expect(downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: "http://example.com/webstream",
      maxBytes
    })).rejects.toThrow(/exceeds max bytes/);

    expect(cancelSpy).toHaveBeenCalled();
  });
});
