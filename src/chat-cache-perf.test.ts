
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

  it("should resolve direct chat names efficiently", async () => {
    // Setup: 6 unnamed direct chats
    const NUM_CHATS = 6;
    const API_DELAY = 50; // mocked API latency

    vi.mocked(api.getCurrentRingCentralUser).mockResolvedValue({ id: "self-id" } as any);

    vi.mocked(api.listRingCentralChats).mockImplementation(async ({ type }) => {
      if (type && type[0] === "Direct") {
        return Array.from({ length: NUM_CHATS }, (_, i) => ({
          id: `chat-${i}`,
          type: "Direct",
          members: [{ id: "self-id" }, { id: `peer-${i}` }],
          // name is missing, triggering resolution
        })) as any[];
      }
      return [];
    });

    vi.mocked(api.getRingCentralUser).mockImplementation(async ({ userId }) => {
      await new Promise((resolve) => setTimeout(resolve, API_DELAY));
      return { firstName: "User", lastName: userId } as any;
    });

    const start = Date.now();
    await fetchAllChats(mockAccount, mockLogger);
    const end = Date.now();
    const duration = end - start;

    console.log(`Resolution took ${duration}ms`);

    // Current implementation:
    // 6 chats.
    // Loop 1: sleep 0 (i=0), call api (50ms) -> total 50ms
    // Loop 2: sleep 500ms, call api (50ms) -> total 550ms
    // ...
    // Loop 6: sleep 500ms, call api (50ms) -> total 550ms
    // Total approx: 50 + 5 * 550 = 2800ms

    // With batching (size 3, delay 200ms):
    // Batch 1 (3 chats): sleep 0, call api parallel (50ms) -> total 50ms
    // Batch 2 (3 chats): sleep 200ms, call api parallel (50ms) -> total 250ms
    // Total approx: 300ms

    // Assert that it's faster than the sequential worst case
    // We expect < 1000ms with optimization
    expect(duration).toBeLessThan(2000);
  });
});
