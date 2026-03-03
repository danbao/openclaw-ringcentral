import { describe, expect, it, vi, beforeEach } from "vitest";
import { searchCachedChats, startChatCacheSync } from "./chat-cache.js";

// Mock fs.promises for startChatCacheSync
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
  },
}));

describe("searchCachedChats performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Use an internal function to reset if available, otherwise startChatCacheSync
  });

  it("should find matching chats efficiently in 50k chats", async () => {
    // Inject large data via startChatCacheSync
    const mockChats = Array.from({ length: 50000 }, (_, i) => ({
      id: `chat-${i}`,
      name: i === 49000 ? "Target Chat" : `Random Chat ${i}`,
      type: "Group"
    }));

    const fs = await import("fs");
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({
      chats: mockChats
    }));

    await startChatCacheSync({
      account: { accountId: "test" } as any,
      workspace: "/tmp",
      logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      abortSignal: new AbortController().signal,
    });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
        searchCachedChats("target");
    }
    const end = performance.now();

    const results = searchCachedChats("target");
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("chat-49000");
    console.log(`Time taken for 100 searches in 50k items: ${end - start}ms`);
  });
});
