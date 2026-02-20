## 2026-02-12 - RingCentral Attachment Download DoS
**Vulnerability:** `downloadRingCentralAttachment` buffered entire files into memory using `response.arrayBuffer()` before checking `maxBytes`, allowing potential DoS via memory exhaustion.
**Learning:** `fetch` response methods like `arrayBuffer()` consume the entire stream. Checking limits *after* consumption is too late.
**Prevention:** Use streaming (Web `ReadableStream` or Node `Readable`) to process data chunk-by-chunk and enforce limits dynamically during download.
