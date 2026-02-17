## 2026-02-10 - DoS via Unbounded File Downloads
**Vulnerability:** The `downloadRingCentralAttachment` function buffered the entire file into memory using `response.arrayBuffer()` before checking if it exceeded `maxBytes`. This allowed attackers to cause memory exhaustion (DoS) by sending large files.
**Learning:** Convenience methods like `arrayBuffer()` or `text()` on Response objects load the entire body into memory. They should be avoided when handling potentially large or untrusted content.
**Prevention:** Use streaming (`response.body`) to process large files. Check `Content-Length` headers for early rejection, and enforce size limits incrementally while reading the stream.
