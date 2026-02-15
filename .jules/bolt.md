## 2026-02-10 - Batched API Resolution for Chat Names
**Learning:** Sequential API calls with fixed delays (e.g., 500ms per item) for name resolution are a major performance bottleneck in `chat-cache.ts`.
**Action:** Use batched `Promise.all` (e.g., batch size 3) with a smaller delay (e.g., 200ms) to respect rate limits while significantly improving throughput (6x faster for 5 items).
