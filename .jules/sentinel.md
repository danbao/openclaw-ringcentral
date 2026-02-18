## 2026-02-10 - RingCentral SDK Response Handling
**Vulnerability:** `downloadRingCentralAttachment` buffered entire files into memory before checking `maxBytes`, exposing the service to DoS/OOM via large file downloads.
**Learning:** `platform.get()` returns a standard Response object. Using `.arrayBuffer()` consumes the entire body into memory.
**Prevention:** Always check `Content-Length` header first. Use `response.body` (ReadableStream) to process large files in chunks and enforce size limits during streaming.
