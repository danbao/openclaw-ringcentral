import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCachedChat, getCachedUser } from "./monitor.js";
import { getRingCentralChat, getRingCentralUser } from "./api.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";

// Mock API functions
vi.mock("./api.js", () => ({
  getRingCentralChat: vi.fn(),
  getRingCentralUser: vi.fn(),
  // Mock other exports used by monitor.ts to avoid errors
  sendRingCentralMessage: vi.fn(),
  updateRingCentralMessage: vi.fn(),
  deleteRingCentralMessage: vi.fn(),
  downloadRingCentralAttachment: vi.fn(),
  uploadRingCentralAttachment: vi.fn(),
  extractRcApiError: vi.fn(),
  formatRcApiError: vi.fn(),
  getRingCentralSDK: vi.fn(),
}));

// Mock runtime
vi.mock("./runtime.js", () => ({
  getRingCentralRuntime: vi.fn(() => ({
    logging: {
      getChildLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      }),
    },
  })),
}));

// Mock chat-cache
vi.mock("./chat-cache.js", () => ({
  startChatCacheSync: vi.fn(),
  stopChatCacheSync: vi.fn(),
}));

// Mock other dependencies
vi.mock("@ringcentral/subscriptions", () => ({
  Subscriptions: class {},
}));

vi.mock("@rc-ex/ws", () => ({
  default: class {},
}));

vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn(),
    access: vi.fn(),
    appendFile: vi.fn(),
  },
}));

describe("Monitor Cache", () => {
  const account: ResolvedRingCentralAccount = {
    accountId: "test-account-id",
    server: "https://platform.devtest.ringcentral.com",
    clientId: "test-client-id",
    clientSecret: "test-client-secret",
    jwt: "test-jwt",
    config: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("getCachedChat", () => {
    it("should fetch from API on first call", async () => {
      const chat = { id: "chat1", type: "Group" };
      vi.mocked(getRingCentralChat).mockResolvedValue(chat as any);

      const result = await getCachedChat({ account, chatId: "chat1" });

      expect(result).toEqual(chat);
      expect(getRingCentralChat).toHaveBeenCalledTimes(1);
    });

    it("should return cached value on second call", async () => {
      const chat = { id: "chat2", type: "Group" };
      vi.mocked(getRingCentralChat).mockResolvedValue(chat as any);

      // First call - fetches from API
      await getCachedChat({ account, chatId: "chat2" });

      // Second call - should return from cache
      const result = await getCachedChat({ account, chatId: "chat2" });

      expect(result).toEqual(chat);
      expect(getRingCentralChat).toHaveBeenCalledTimes(1);
    });

    it("should expire cache after TTL", async () => {
      const chat = { id: "chat3", type: "Group" };
      vi.mocked(getRingCentralChat).mockResolvedValue(chat as any);

      // First call
      await getCachedChat({ account, chatId: "chat3" });

      // Fast forward time by 5 minutes + 1ms
      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      // Second call - should fetch again
      await getCachedChat({ account, chatId: "chat3" });

      expect(getRingCentralChat).toHaveBeenCalledTimes(2);
    });

    it("should handle separate accounts correctly", async () => {
      const chat1 = { id: "chatA", type: "Group", name: "Account1" };
      const chat2 = { id: "chatA", type: "Group", name: "Account2" };

      const account2 = { ...account, accountId: "other-account" };

      vi.mocked(getRingCentralChat)
        .mockResolvedValueOnce(chat1 as any)
        .mockResolvedValueOnce(chat2 as any);

      await getCachedChat({ account, chatId: "chatA" });
      await getCachedChat({ account: account2, chatId: "chatA" });

      expect(getRingCentralChat).toHaveBeenCalledTimes(2);
    });
  });

  describe("getCachedUser", () => {
    it("should fetch from API on first call", async () => {
      const user = { id: "user1", firstName: "Alice" };
      vi.mocked(getRingCentralUser).mockResolvedValue(user as any);

      const result = await getCachedUser({ account, userId: "user1" });

      expect(result).toEqual(user);
      expect(getRingCentralUser).toHaveBeenCalledTimes(1);
    });

    it("should return cached value on second call", async () => {
      const user = { id: "user2", firstName: "Bob" };
      vi.mocked(getRingCentralUser).mockResolvedValue(user as any);

      // First call
      await getCachedUser({ account, userId: "user2" });

      // Second call
      const result = await getCachedUser({ account, userId: "user2" });

      expect(result).toEqual(user);
      expect(getRingCentralUser).toHaveBeenCalledTimes(1);
    });

    it("should expire cache after TTL", async () => {
      const user = { id: "user3", firstName: "Charlie" };
      vi.mocked(getRingCentralUser).mockResolvedValue(user as any);

      await getCachedUser({ account, userId: "user3" });

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await getCachedUser({ account, userId: "user3" });

      expect(getRingCentralUser).toHaveBeenCalledTimes(2);
    });
  });
});
