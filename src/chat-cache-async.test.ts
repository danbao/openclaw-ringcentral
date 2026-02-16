import { describe, expect, it, vi, beforeEach } from "vitest";
import { initChatCache, refreshChatCache, stopChatCacheSync } from "./chat-cache.js";
import * as fs from "fs";
import * as api from "./api.js";

// Mock fs
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
    },
    // We still need readFileSync/etc for other modules potentially,
    // but chat-cache uses promises now.
  };
});

// Mock API
vi.mock("./api.js", () => ({
  listRingCentralChats: vi.fn(),
  getCurrentRingCentralUser: vi.fn(),
  getRingCentralUser: vi.fn(),
}));

const mockAccount = {
  accountId: "test-account",
  config: {},
} as any;

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("chat-cache async I/O", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stopChatCacheSync();
  });

  it("initChatCache should read cache file asynchronously", async () => {
    const mockCacheData = {
      updatedAt: "2023-01-01T00:00:00Z",
      ownerId: "owner-1",
      chats: [{ id: "chat-1", name: "Chat 1", type: "Group" }],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockCacheData));

    await initChatCache({
      account: mockAccount,
      workspace: "/tmp/workspace",
      logger: mockLogger,
      abortSignal: new AbortController().signal,
    });

    expect(fs.promises.readFile).toHaveBeenCalledWith(
      expect.stringContaining("ringcentral-chat-cache.json"),
      "utf-8"
    );
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining("Restored 1 chats"));
  });

  it("refreshChatCache should write cache file asynchronously", async () => {
    // First setup the context
    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify({ chats: [] }));
    await initChatCache({
      account: mockAccount,
      workspace: "/tmp/workspace",
      logger: mockLogger,
      abortSignal: new AbortController().signal,
    });

    // Mock API responses for refresh
    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "owner-1" } as any);
    vi.mocked(api.listRingCentralChats).mockResolvedValue([{ id: "chat-2", name: "Chat 2", type: "Group" }] as any);

    // Run refresh
    await refreshChatCache();

    expect(fs.promises.mkdir).toHaveBeenCalled();
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("ringcentral-chat-cache.json"),
      expect.stringContaining("Chat 2"),
      "utf-8"
    );
  });
});
