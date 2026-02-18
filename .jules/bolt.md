## 2026-02-10 - RingCentral API Batching Strategy
**Learning:** Sequential API calls with large delays (500ms) for name resolution were a major bottleneck. RingCentral API rate limits allow for small concurrent batches (size 3) with reduced inter-batch delays (200ms).
**Action:** Prefer small concurrent batches (size 3-5) with inter-batch delays over strictly sequential calls when resolving multiple entities from RingCentral API.
