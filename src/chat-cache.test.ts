import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAllChats } from "./chat-cache.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import * as api from "./api.js";

// Mock the API module
vi.mock("./api.js", () => ({
  listRingCentralChats: vi.fn(),
  getCurrentRingCentralUser: vi.fn(),
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

describe("fetchAllChats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should fetch chats of all types in parallel", async () => {
    // Setup delays to verify parallelism
    const DELAY = 100;

    vi.mocked(api.getCurrentRingCentralUser).mockImplementation(async () => {
      await new Promise((resolve) => setTimeout(resolve, DELAY));
      return { id: "self-id" } as any;
    });

    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      await new Promise((resolve) => setTimeout(resolve, DELAY));
      // Return a dummy chat for each type
      return [{ id: `chat-${type}`, name: `${type} Chat`, type: type?.[0] }] as any[];
    });

    const start = Date.now();
    const result = await fetchAllChats(mockAccount, mockLogger);
    const end = Date.now();
    const duration = end - start;

    // Verify correct calls
    expect(api.getCurrentRingCentralUser).toHaveBeenCalledTimes(1);
    // listRingCentralChats is called for each type: Personal, Direct, Group, Team, Everyone
    expect(api.listRingCentralChats).toHaveBeenCalledTimes(5);

    // Verify parallelism
    // If sequential: duration >= 6 * DELAY (1 user fetch + 5 chat fetches) = 600ms
    // If parallel: duration >= DELAY (approx 100ms).
    // We allow up to 300ms to account for overhead and test runner variability,
    // but definitely less than sequential execution time.
    expect(duration).toBeLessThan(DELAY * 4);

    // Verify ownerId resolved
    expect(result.ownerId).toBe("self-id");

    // Verify result content
    expect(result.chats).toHaveLength(5);
    expect(result.chats.map(c => c.id).sort()).toEqual([
      "chat-Direct",
      "chat-Everyone",
      "chat-Group",
      "chat-Personal",
      "chat-Team",
    ]);
  });

  it("should handle errors in one chat type gracefully", async () => {
    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);

    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Direct") {
        throw new Error("Direct chats failed");
      }
      return [{ id: `chat-${type}`, name: `${type} Chat`, type: type?.[0] }] as any[];
    });

    const result = await fetchAllChats(mockAccount, mockLogger);

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringContaining("Failed to fetch Direct chats"));
    // Should have 4 results (missing Direct)
    expect(result.chats).toHaveLength(4);
    expect(result.chats.find(c => c.id === "chat-Direct")).toBeUndefined();
  });

  it("should resolve direct chat names in batches", async () => {
    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);

    // Return 4 direct chats
    const directChats = Array.from({ length: 4 }, (_, i) => ({
      id: `chat-${i}`,
      type: "Direct",
      members: [{ id: "self-id" }, { id: `user-${i}` }],
    }));

    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Direct") {
        return directChats as any[];
      }
      return [];
    });

    vi.mocked(api.getRingCentralUser).mockImplementation(async ({ userId }) => {
      await new Promise(resolve => setTimeout(resolve, 50)); // simulate network delay
      return { firstName: "User", lastName: userId } as any;
    });

    const start = Date.now();
    await fetchAllChats(mockAccount, mockLogger);
    const end = Date.now();
    const duration = end - start;

    // Current implementation:
    // 4 items.
    // i=0: fetch, sleep(500) if i>0 (no sleep)
    // i=1: sleep(500), fetch
    // i=2: sleep(500), fetch
    // i=3: sleep(500), fetch
    // Total sleep = 1500ms.
    // Total fetch time = 4 * 50ms = 200ms (sequential).
    // Total approx = 1700ms.

    // Optimized implementation (batch size 3):
    // Batch 1 (0, 1, 2): fetch parallel. sleep(200) if i>0 (no sleep).
    // Batch 2 (3): sleep(200), fetch parallel.
    // Total sleep = 200ms.
    // Total fetch time = 50ms + 50ms = 100ms.
    // Total approx = 300ms.

    // We assert < 1000ms to prove optimization.
    expect(duration).toBeLessThan(1000);

    // Verify all users were resolved
    expect(api.getRingCentralUser).toHaveBeenCalledTimes(4);
  });
});
