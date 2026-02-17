import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'stream';
import { downloadRingCentralAttachment } from './api.js';

// Mock auth module
vi.mock('./auth.js', () => ({
  getRingCentralPlatform: vi.fn(),
}));

// Import the mocked function
import { getRingCentralPlatform } from './auth.js';

describe('downloadRingCentralAttachment Security', () => {
  const mockAccount = { accountId: 'test-account' } as any;
  const mockGet = vi.fn();
  const mockPlatform = {
    get: mockGet,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    (getRingCentralPlatform as any).mockResolvedValue(mockPlatform);
  });

  it('should download file within maxBytes limit', async () => {
    const text = 'hello world';
    const content = Buffer.from(text);
    const stream = Readable.from(content);

    // Create a clean ArrayBuffer for the mock
    const ab = new ArrayBuffer(content.length);
    const view = new Uint8Array(ab);
    content.copy(view);

    mockGet.mockResolvedValue({
      headers: { get: () => 'text/plain' },
      body: stream,
      arrayBuffer: async () => ab,
    });

    const result = await downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: 'http://example.com/file',
      maxBytes: 100,
    });

    expect(result.buffer.toString()).toBe(text);
    expect(result.contentType).toBe('text/plain');
  });

  it('should throw error when file exceeds maxBytes using streaming', async () => {
    const maxBytes = 10;
    // content larger than maxBytes
    const content = Buffer.alloc(maxBytes + 5);
    const stream = Readable.from(content);

    mockGet.mockResolvedValue({
      headers: { get: () => 'application/octet-stream' },
      body: stream,
      // We explicitly omit arrayBuffer to ensure the new implementation
      // doesn't rely on it.
    });

    await expect(downloadRingCentralAttachment({
      account: mockAccount,
      contentUri: 'http://example.com/large',
      maxBytes,
    })).rejects.toThrow(/max bytes/);
  });
});
