## 2026-02-10 - Batched API Request Patterns
**Learning:** Sequential processing with large fixed delays (e.g., 500ms) for API calls (like Direct chat name resolution) leads to unacceptable performance when list size > 10.
**Action:** Use batched processing (e.g., batch size 3, 200ms delay) to balance throughput with rate limits, achieving ~10x speedup while respecting API constraints.
