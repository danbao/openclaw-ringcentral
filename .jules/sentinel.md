## 2026-02-10 - DoS via Memory Exhaustion in File Downloads
**Vulnerability:** `downloadRingCentralAttachment` buffered entire files into memory using `response.arrayBuffer()` before checking size limits.
**Learning:** Standard `fetch` response methods like `arrayBuffer()` or `text()` read the entire stream. For size-limited downloads, manual stream consumption is required.
**Prevention:** Always check `Content-Length` first (if available) and use `response.body` (ReadableStream) to read chunks incrementally, enforcing `maxBytes` limits during the read loop.
