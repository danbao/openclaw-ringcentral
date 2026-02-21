## 2026-02-10 - [Optimization of RingCentral API Calls]
**Learning:** High frequency API calls in message processing pipelines (like `getRingCentralChat` and `getRingCentralUser`) can significantly impact throughput and risk rate limiting. Implementing a simple in-memory TTL cache for immutable or slowly-changing resources is a highly effective optimization.
**Action:** When integrating external APIs in hot paths (e.g. `processMessageWithPipeline`), always evaluate if the resource is cacheable and implement a short TTL cache (e.g. 5 minutes) to reduce network overhead.
