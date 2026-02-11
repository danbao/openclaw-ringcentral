## 2026-02-10 - [DoS Protection for File Downloads]
**Vulnerability:** `downloadRingCentralAttachment` in `src/api.ts` downloaded entire file content into memory using `response.arrayBuffer()` before checking `maxBytes`. This could lead to Memory Exhaustion DoS if a large file is sent.
**Learning:** `fetch` API's `arrayBuffer()` method reads the entire body. Checking size *after* this call is too late for availability protection.
**Prevention:** Always check `Content-Length` header before consuming the response body when handling untrusted or potentially large content.
