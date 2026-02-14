## 2026-02-14 - [DoS Protection]
**Vulnerability:** `downloadRingCentralAttachment` read the entire response body into memory before checking `maxBytes`. This allowed attackers (or accidental large files) to cause memory exhaustion (DoS).
**Learning:** Always validate `Content-Length` headers before consuming the response body when dealing with user-supplied or potentially large content.
**Prevention:** Added a pre-flight check against `Content-Length` in `src/api.ts`.
