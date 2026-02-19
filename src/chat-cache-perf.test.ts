
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchAllChats } from "./chat-cache.js";
import type { ResolvedRingCentralAccount } from "./accounts.js";

// Mock API
const api = await import("./api.js");

vi.mock("./api.js", () => ({
  listRingCentralChats: vi.fn(),
  getCurrentRingCentralUser: vi.fn(),
  getRingCentralUser: vi.fn(),
}));

const mockAccount: ResolvedRingCentralAccount = {
  accountId: "perf-test",
  enabled: true,
  credentialSource: "config",
  clientId: "cid",
  clientSecret: "sec",
  jwt: "jwt",
  server: "https://platform.devtest.ringcentral.com",
  config: {},
};

const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe("Chat Cache Performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve direct chat names efficiently (< 1000ms for 5 chats)", async () => {
    const OWNER_ID = "owner-1";
    const PEER_COUNT = 5; // Start small
    const API_DELAY = 10; // Simulate network latency

    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: OWNER_ID } as any);

    // Mock listRingCentralChats to return N direct chats without names
    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Direct") {
        return Array.from({ length: PEER_COUNT }).map((_, i) => ({
          id: `chat-${i}`,
          type: "Direct",
          members: [{ id: OWNER_ID }, { id: `peer-${i}` }],
          // Name is missing, triggering resolution
        })) as any[];
      }
      return [];
    });

    // Mock getRingCentralUser with delay
    vi.mocked(api.getRingCentralUser).mockImplementation(async ({ userId }) => {
      await new Promise((resolve) => setTimeout(resolve, API_DELAY));
      return { id: userId, firstName: "User", lastName: userId } as any;
    });

    const start = Date.now();
    await fetchAllChats(mockAccount, mockLogger);
    const end = Date.now();
    const duration = end - start;

    console.log(`Resolved ${PEER_COUNT} chats in ${duration}ms`);

    // With current implementation: ~2050ms
    // With optimization: ~250ms
    expect(duration).toBeLessThan(1000);
  });
});
