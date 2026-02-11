import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getCachedChat, getCachedUser } from "./monitor.js";
import * as api from "./api.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";

// Mock api.js
vi.mock("./api.js", () => ({
  getRingCentralChat: vi.fn(),
  getRingCentralUser: vi.fn(),
}));

// Mock fs to avoid issues with other imports in monitor.ts
vi.mock("fs", async () => ({
  promises: {
    mkdir: vi.fn(),
    access: vi.fn(),
    appendFile: vi.fn(),
  }
}));

describe("monitor cache", () => {
  const mockAccount: ResolvedRingCentralAccount = {
    accountId: "acc1",
    server: "https://platform.devtest.ringcentral.com",
    clientId: "client1",
    clientSecret: "secret1",
    jwt: "jwt1",
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
    it("should call API only once for repeated calls", async () => {
      const chatId = "chat_test_1";
      const mockChat = { id: chatId, type: "Group" };
      vi.mocked(api.getRingCentralChat).mockResolvedValue(mockChat as any);

      // First call
      const result1 = await getCachedChat(mockAccount, chatId);
      expect(result1).toEqual(mockChat);
      expect(api.getRingCentralChat).toHaveBeenCalledTimes(1);

      // Second call (should be cached)
      const result2 = await getCachedChat(mockAccount, chatId);
      expect(result2).toEqual(mockChat);
      expect(api.getRingCentralChat).toHaveBeenCalledTimes(1);
    });

    it("should expire cache after TTL", async () => {
      const chatId = "chat_test_ttl";
      const mockChat = { id: chatId, type: "Group" };
      vi.mocked(api.getRingCentralChat).mockResolvedValue(mockChat as any);

      await getCachedChat(mockAccount, chatId);
      expect(api.getRingCentralChat).toHaveBeenCalledTimes(1);

      // Fast forward time > 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000 + 100);

      // Should call API again
      await getCachedChat(mockAccount, chatId);
      expect(api.getRingCentralChat).toHaveBeenCalledTimes(2);
    });

    it("should separate cache by accountId", async () => {
      const chatId = "chat_test_acc";
      const mockChat1 = { id: chatId, type: "Group", name: "Account1" };
      const mockChat2 = { id: chatId, type: "Group", name: "Account2" };

      vi.mocked(api.getRingCentralChat)
        .mockResolvedValueOnce(mockChat1 as any)
        .mockResolvedValueOnce(mockChat2 as any);

      const acc2 = { ...mockAccount, accountId: "acc2" };

      await getCachedChat(mockAccount, chatId);
      await getCachedChat(acc2, chatId);

      expect(api.getRingCentralChat).toHaveBeenCalledTimes(2);
    });

    it("should return null on API failure and NOT cache null", async () => {
      const chatId = "chat_test_error";
      vi.mocked(api.getRingCentralChat).mockRejectedValue(new Error("API Error"));

      const result1 = await getCachedChat(mockAccount, chatId);
      expect(result1).toBeNull();

      // Should try again (not cached)
      const result2 = await getCachedChat(mockAccount, chatId);
      expect(result2).toBeNull();

      expect(api.getRingCentralChat).toHaveBeenCalledTimes(2);
    });
  });

  describe("getCachedUser", () => {
     it("should call API only once for repeated calls", async () => {
      const userId = "user_test_1";
      const mockUser = { id: userId, firstName: "Alice" };
      vi.mocked(api.getRingCentralUser).mockResolvedValue(mockUser as any);

      // First call
      const result1 = await getCachedUser(mockAccount, userId);
      expect(result1).toEqual(mockUser);
      expect(api.getRingCentralUser).toHaveBeenCalledTimes(1);

      // Second call
      const result2 = await getCachedUser(mockAccount, userId);
      expect(result2).toEqual(mockUser);
      expect(api.getRingCentralUser).toHaveBeenCalledTimes(1);
    });

    it("should expire cache after TTL", async () => {
      const userId = "user_test_ttl";
      const mockUser = { id: userId, firstName: "Bob" };
      vi.mocked(api.getRingCentralUser).mockResolvedValue(mockUser as any);

      await getCachedUser(mockAccount, userId);
      expect(api.getRingCentralUser).toHaveBeenCalledTimes(1);

      // Fast forward time > 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000 + 100);

      // Should call API again
      await getCachedUser(mockAccount, userId);
      expect(api.getRingCentralUser).toHaveBeenCalledTimes(2);
    });
  });
});
