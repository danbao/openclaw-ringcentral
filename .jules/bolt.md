## 2026-02-10 - [Batching RingCentral Direct Chat Resolution]
**Learning:** Sequential API calls with fixed delays (to avoid rate limits) can be a major bottleneck during cache initialization. For RingCentral `Direct` chat name resolution, 10 chats took ~5s due to a hardcoded 500ms delay per item.
**Action:** Replace sequential loops with batched `Promise.all` (e.g., batch size 3) and smaller delays between batches. This reduced 10-chat resolution time from ~5s to <500ms while still respecting API rate limits.
