## 2026-02-10 - Unbounded Memory Consumption in File Downloads
**Vulnerability:** The `downloadRingCentralAttachment` function buffered entire file downloads into memory using `response.arrayBuffer()` before checking `maxBytes`, allowing malicious or large files to cause Out-Of-Memory (OOM) crashes (DoS).
**Learning:** Checking size limits *after* a full download defeats the purpose of resource protection. Stream processing is essential for handling untrusted external content.
**Prevention:** Always consume response bodies as streams (Web `ReadableStream` or Node `Readable`), accumulate chunks incrementally, and abort the stream immediately if a size limit is exceeded.
