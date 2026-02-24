import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAllChats } from "./chat-cache.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";
import * as api from "./api.js";

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

describe("fetchAllChats batched resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve direct chat names in batches of 3", async () => {
    const chatCount = 7;
    const directChats = Array.from({ length: chatCount }, (_, i) => ({
      id: `chat-${i}`,
      type: "Direct",
      members: [{ id: "self-id" }, { id: `user-${i}` }],
    }));

    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);
    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Direct") return directChats as any[];
      return [];
    });
    vi.mocked(api.getRingCentralUser).mockResolvedValue({
      firstName: "User",
      lastName: "Name",
    } as any);

    const result = await fetchAllChats(mockAccount, mockLogger);

    // All 7 direct chats should have resolved names
    const directResults = result.chats.filter((c) => c.type === "Direct");
    expect(directResults).toHaveLength(chatCount);
    for (const chat of directResults) {
      expect(chat.name).toBe("User Name");
    }

    // getRingCentralUser should be called once per direct chat
    expect(api.getRingCentralUser).toHaveBeenCalledTimes(chatCount);
  });

  it("should not call getRingCentralUser for chats with existing names", async () => {
    const directChats = [
      { id: "chat-1", name: "Already Named", type: "Direct", members: ["self-id", "user-1"] },
      { id: "chat-2", type: "Direct", members: ["self-id", "user-2"] },
    ];

    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);
    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Direct") return directChats as any[];
      return [];
    });
    vi.mocked(api.getRingCentralUser).mockResolvedValue({
      firstName: "Resolved",
      lastName: "User",
    } as any);

    const result = await fetchAllChats(mockAccount, mockLogger);

    // Only the unnamed chat should trigger a user lookup
    expect(api.getRingCentralUser).toHaveBeenCalledTimes(1);
    const named = result.chats.find((c) => c.id === "chat-1");
    const resolved = result.chats.find((c) => c.id === "chat-2");
    expect(named?.name).toBe("Already Named");
    expect(resolved?.name).toBe("Resolved User");
  });
});
