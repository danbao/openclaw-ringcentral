## 2026-02-10 - DoS via large file downloads in RingCentral attachments
**Vulnerability:** `downloadRingCentralAttachment` read the entire response body into memory via `arrayBuffer()` before checking if it exceeded `maxBytes`. This could lead to a Denial of Service (DoS) via memory exhaustion if a malicious actor sent a very large file.
**Learning:** Checking size limits *after* downloading defeats the purpose of the limit for memory protection.
**Prevention:** Always check `Content-Length` header (if available) before consuming the response body. Ideally, use stream processing with a byte counter for robust protection even when `Content-Length` is missing or spoofed.
