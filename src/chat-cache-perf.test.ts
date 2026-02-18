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

describe("fetchAllChats performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should batch direct chat name resolution", async () => {
    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);

    // Mock getRingCentralUser to take 50ms
    vi.mocked(api.getRingCentralUser).mockImplementation(async ({ userId }) => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { firstName: "User", lastName: userId } as any;
    });

    // Return 5 Direct chats without names
    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type?.[0] === "Direct") {
        return Array.from({ length: 5 }, (_, i) => ({
            id: `direct-${i}`,
            type: "Direct",
            members: [{ id: "self-id" }, { id: `peer-${i}` }]
        })) as any[];
      }
      return [];
    });

    const start = Date.now();
    await fetchAllChats(mockAccount, mockLogger);
    const duration = Date.now() - start;

    console.log(`Duration: ${duration}ms`);

    // Optimized implementation expected behavior (Batch 3, Delay 200ms):
    // Batch 1 (3 items): 50ms exec (parallel)
    // Wait 200ms
    // Batch 2 (2 items): 50ms exec (parallel)
    // Total wait: 200ms. Total exec: 50ms + 50ms = 100ms. Total ~300ms.

    // We expect it to be much faster now.
    expect(duration).toBeLessThan(1000);
  });
});
