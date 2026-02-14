## 2025-05-23 - RingCentral API Rate Limiting Pattern
**Learning:** RingCentral API rate limits are best handled by batching small concurrent requests (e.g., 3) with a short delay (e.g., 200ms) between batches, rather than strictly sequential requests with long delays (e.g., 500ms).
**Action:** Use `Promise.all` for batches and `sleep()` between batches when iterating over multiple API calls to improve throughput while respecting rate limits.
