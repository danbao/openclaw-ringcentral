import { describe, expect, it, vi, beforeEach } from "vitest";
import { startChatCacheSync, refreshChatCache } from "./chat-cache.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import * as fs from "fs";

// Mock fs.promises
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
}));

// Mock API
vi.mock("./api.js", () => ({
  listRingCentralChats: vi.fn().mockResolvedValue([]),
  getCurrentRingCentralUser: vi.fn().mockResolvedValue({ id: "self-id" }),
  getRingCentralUser: vi.fn(),
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

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("Chat Cache File I/O", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should read cache file asynchronously on start", async () => {
    const mockData = {
      updatedAt: "2023-01-01T00:00:00Z",
      ownerId: "self-id",
      chats: [{ id: "chat-1", name: "Chat 1", type: "Group" }],
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockData));

    await startChatCacheSync({
      account: mockAccount,
      workspace: "/tmp/workspace",
      logger: mockLogger,
      abortSignal: new AbortController().signal,
    });

    expect(fs.promises.readFile).toHaveBeenCalledWith(
      expect.stringContaining("ringcentral-chat-cache.json"),
      "utf-8"
    );
    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.stringContaining("Restored 1 chats")
    );
  });

  it("should write cache file asynchronously on refresh", async () => {
    // First init context
    await startChatCacheSync({
      account: mockAccount,
      workspace: "/tmp/workspace",
      logger: mockLogger,
      abortSignal: new AbortController().signal,
    });

    // Mock API to return a new chat
    const { listRingCentralChats } = await import("./api.js");
    vi.mocked(listRingCentralChats).mockResolvedValue([
      { id: "chat-2", name: "New Chat", type: "Group" } as any
    ]);

    await refreshChatCache();

    expect(fs.promises.mkdir).toHaveBeenCalled();
    expect(fs.promises.writeFile).toHaveBeenCalledWith(
      expect.stringContaining("ringcentral-chat-cache.json"),
      expect.stringContaining("chat-2"),
      "utf-8"
    );
  });
});
