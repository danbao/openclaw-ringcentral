# Bolt's Journal

## 2026-02-10 - [Parallelizing Direct Chat Name Resolution]
**Learning:** RingCentral's API rate limits are conservative, but simple batching (size=3, delay=200ms) for `resolvePersonName` calls significantly outperforms sequential execution (delay=500ms) without triggering 429s.
**Action:** Use batched `Promise.all` with small concurrency for list processing instead of full sequential loops when dealing with rate-limited APIs.
