import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ReadableStream } from 'stream/web';
import { downloadRingCentralAttachment } from './api.js';
import { getRingCentralPlatform } from './auth.js';

// Mock the auth module
vi.mock('./auth.js', () => ({
  getRingCentralPlatform: vi.fn(),
}));

describe('downloadRingCentralAttachment Security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should stream download and abort if maxBytes exceeded without reading entire body', async () => {
    const CHUNK_SIZE = 1024; // 1KB
    const TOTAL_SIZE = 10 * 1024 * 1024; // 10MB
    const MAX_BYTES = 5 * 1024; // 5KB

    let bytesRead = 0;
    let streamCancelled = false;

    const stream = new ReadableStream({
      start(controller) {
        // Initially enqueue nothing, pull will be called
      },
      pull(controller) {
        if (bytesRead >= TOTAL_SIZE) {
          controller.close();
          return;
        }
        const chunk = new Uint8Array(CHUNK_SIZE);
        bytesRead += CHUNK_SIZE;
        controller.enqueue(chunk);
      },
      cancel() {
        streamCancelled = true;
      }
    });

    const mockResponse = {
      headers: {
        get: (name: string) => name === 'content-type' ? 'application/octet-stream' : null,
      },
      body: stream,
      // Simulate arrayBuffer reading the whole stream (current implementation behavior)
      arrayBuffer: async () => {
        const reader = stream.getReader();
        let total = 0;
        const chunks = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          total += value.byteLength;
          chunks.push(value);
        }
        // Create a buffer of the total size
        return new ArrayBuffer(total);
      }
    };

    (getRingCentralPlatform as any).mockResolvedValue({
      get: vi.fn().mockResolvedValue(mockResponse),
    });

    const account = { accountId: 'test' } as any;

    // We expect it to fail with "exceeds max bytes"
    await expect(downloadRingCentralAttachment({
      account,
      contentUri: 'https://example.com/file',
      maxBytes: MAX_BYTES,
    })).rejects.toThrow(/exceeds max bytes/);

    // VERIFICATION:
    // If the implementation buffers the whole stream (vulnerable), bytesRead will be TOTAL_SIZE (10MB).
    // If the implementation streams properly (secure), bytesRead should be slightly more than MAX_BYTES (5KB).

    // We assert that we read LESS than the full stream.
    // This assertion will FAIL with the current implementation.
    expect(bytesRead).toBeLessThan(TOTAL_SIZE / 2);
    expect(streamCancelled).toBe(true);
  });

  it('should reject immediately if Content-Length exceeds maxBytes', async () => {
    const mockResponse = {
      headers: {
        get: (name: string) => {
          if (name.toLowerCase() === 'content-length') return '10000';
          return null;
        },
      },
      body: new ReadableStream(),
      arrayBuffer: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    };

    (getRingCentralPlatform as any).mockResolvedValue({
      get: vi.fn().mockResolvedValue(mockResponse),
    });

    await expect(downloadRingCentralAttachment({
      account: {} as any,
      contentUri: 'test',
      maxBytes: 500, // 500 < 10000
    })).rejects.toThrow(/exceeds max bytes/);

    // Should not even try to read body (arrayBuffer) if Content-Length is checked first
    // Note: The current implementation calls arrayBuffer() first, so this test might fail or pass depending on where the check is.
    // But since current implementation doesn't check Content-Length, it will call arrayBuffer (or in our mock, we'd see it called).
    // Actually, current implementation:
    // 1. arrayBuffer()
    // 2. check size
    // So mockResponse.arrayBuffer WOULD be called currently.
    // We want it NOT to be called.
    expect(mockResponse.arrayBuffer).not.toHaveBeenCalled();
  });
});
