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

describe("fetchAllChats Performance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should resolve Direct chat names efficiently", async () => {
    const NUM_CHATS = 6;
    const API_DELAY = 10;

    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);

    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type.includes("Direct")) {
        // Return multiple Direct chats needing resolution
        return Array.from({ length: NUM_CHATS }, (_, i) => ({
          id: `chat-${i}`,
          type: "Direct",
          members: [{ id: "self-id" }, { id: `peer-${i}` }],
        })) as any[];
      }
      return [];
    });

    vi.mocked(api.getRingCentralUser).mockImplementation(async ({ userId }) => {
      await new Promise((resolve) => setTimeout(resolve, API_DELAY));
      return { id: userId, firstName: "User", lastName: userId } as any;
    });

    const start = Date.now();
    await fetchAllChats(mockAccount, mockLogger);
    const end = Date.now();
    const duration = end - start;

    console.log(`Duration for ${NUM_CHATS} chats: ${duration}ms`);

    // With optimized implementation (batch 3, 200ms delay):
    // Batch 1 (3 items): ~10ms
    // Delay: 200ms
    // Batch 2 (3 items): ~10ms
    // Total: ~220ms
    expect(duration).toBeLessThan(1000);
  });
});
