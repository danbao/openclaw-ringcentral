## 2025-02-18 - Sequential API Calls with Fixed Delays
**Learning:** `src/chat-cache.ts` was resolving chat names using a sequential loop with a hardcoded 500ms delay to avoid rate limits. This caused extreme slowness (e.g., 2.5s for 5 users). Batched parallel requests (e.g., chunks of 3 with smaller delays) significantly improve throughput while still respecting rate limits.
**Action:** Always look for loops with `await` and `sleep` inside. Replace them with `Promise.all` batches or a concurrency-limited queue.
