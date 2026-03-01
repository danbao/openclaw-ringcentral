import { describe, expect, it, vi, beforeEach } from "vitest";
import { startChatCacheSync, searchCachedChats, __resetChatCacheForTest, refreshChatCache } from "./chat-cache.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import * as fs from "fs";

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

describe("searchCachedChats performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    __resetChatCacheForTest();
  });

  it("should search cache quickly with O(N) complexity using searchCache optimization", async () => {
    // Generate large dataset
    const numChats = 10000;
    const mockChats = Array.from({ length: numChats }, (_, i) => ({
      id: `chat-${i}`,
      name: `Project Team ${i} - ${Math.random().toString(36).substring(7)}`,
      type: "Team",
    }));

    // Insert needle into the haystack
    mockChats[4567] = {
      id: "chat-4567",
      name: "The Special Secret Project",
      type: "Team",
    };

    const mockData = {
      updatedAt: "2023-01-01T00:00:00Z",
      ownerId: "self-id",
      chats: mockChats,
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockData));

    // Initialize the cache with the mock data
    await startChatCacheSync({
      account: mockAccount,
      workspace: "/tmp/workspace",
      logger: mockLogger,
      abortSignal: new AbortController().signal,
    });

    const query = "special secret";

    // Benchmark the search
    const start = performance.now();
    const result = searchCachedChats(query);
    const end = performance.now();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("chat-4567");

    // Check execution time limits
    const duration = end - start;
    expect(duration).toBeLessThan(15); // Search should be practically instant, allocating no new strings.
  });

  it("should sync search cache properly when API changes are merged", async () => {
    // Initial data
    const mockChats = [
      { id: "chat-1", name: "Initial Project", type: "Team" },
    ];

    const mockData = {
      updatedAt: "2023-01-01T00:00:00Z",
      ownerId: "self-id",
      chats: mockChats,
    };

    vi.mocked(fs.promises.readFile).mockResolvedValue(JSON.stringify(mockData));

    // Initial cache sync
    await startChatCacheSync({
      account: mockAccount,
      workspace: "/tmp/workspace",
      logger: mockLogger,
      abortSignal: new AbortController().signal,
    });

    let result = searchCachedChats("initial");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("chat-1");

    // Mock an API change (refreshing via network sync)
    const { listRingCentralChats } = await import("./api.js");
    vi.mocked(listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Team") {
        return [
          { id: "chat-1", name: "Initial Project Renamed", type: "Team" },
          { id: "chat-2", name: "New Team Task", type: "Team" }
        ] as any[];
      }
      return [];
    });

    await refreshChatCache();

    // The cache should be updated properly and queries reflecting it
    result = searchCachedChats("renamed");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("chat-1");

    result = searchCachedChats("task");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("chat-2");
  });
});
