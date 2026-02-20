import { describe, expect, it, vi, beforeEach } from "vitest";
import { downloadRingCentralAttachment } from "./api.js";
import { getRingCentralPlatform } from "./auth.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";

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

  it("aborts stream when maxBytes is exceeded", async () => {
    const maxBytes = 15;
    const chunkSize = 10;
    const chunksToSend = 5; // Total 50 bytes
    let bytesConsumed = 0;
    let streamCancelled = false;

    // Create a source stream
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < chunksToSend; i++) {
          controller.enqueue(new Uint8Array(chunkSize).fill(65));
        }
        controller.close();
      },
      cancel() {
        streamCancelled = true;
      }
    });

    // Wrap to track consumption
    const [trackStream1, trackStream2] = stream.tee();

    // We need to use trackStream1 for the response, but teeing locks the original.
    // Actually simpler: just wrap the start/pull/cancel logic.

    let reader: ReadableStreamDefaultReader<Uint8Array>;

    const trackedStream = new ReadableStream({
      async start(controller) {
        reader = trackStream1.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytesConsumed += value.byteLength;
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
      cancel() {
        streamCancelled = true;
        if (reader) {
          reader.cancel();
        } else {
          trackStream1.cancel();
        }
      }
    });

    const mockResponse = {
      headers: new Headers({ "content-type": "text/plain" }),
      body: trackedStream,
      arrayBuffer: async () => {
        // Emulate behavior of Response.arrayBuffer(): read everything
        const reader = trackedStream.getReader();
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const total = chunks.reduce((acc, c) => acc + c.byteLength, 0);
        const result = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return result.buffer;
      }
    };

    const platform = {
      get: vi.fn().mockResolvedValue(mockResponse),
    };
    (getRingCentralPlatform as any).mockResolvedValue(platform);

    await expect(
      downloadRingCentralAttachment({
        account: mockAccount,
        contentUri: "https://example.com/large-file",
        maxBytes,
      })
    ).rejects.toThrow(/exceeds max bytes/);

    // Verify behavior
    // With current implementation (arrayBuffer), it reads everything -> bytesConsumed = 50
    // With fix (streaming), it should stop early -> bytesConsumed approx 20 (2 chunks)

    // Verify behavior: Expect early abort (less than full 50 bytes)
    // Current implementation reads all 50 bytes via arrayBuffer()
    expect(bytesConsumed).toBeLessThan(50);
  });

  it("downloads valid small file correctly", async () => {
    const maxBytes = 100;
    const content = new TextEncoder().encode("Hello World");

    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(content);
        controller.close();
      }
    });

    const mockResponse = {
      headers: new Headers({ "content-type": "text/plain" }),
      body: stream,
      arrayBuffer: async () => content.buffer
    };

    const platform = {
      get: vi.fn().mockResolvedValue(mockResponse),
    };
    (getRingCentralPlatform as any).mockResolvedValue(platform);

    const result = await downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: "https://example.com/small-file",
      maxBytes,
    });

    expect(result.contentType).toBe("text/plain");
    expect(result.buffer.toString()).toBe("Hello World");
  });
});
