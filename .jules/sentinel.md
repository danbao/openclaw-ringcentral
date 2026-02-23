## 2025-10-27 - File Download Memory Exhaustion
**Vulnerability:** The `downloadRingCentralAttachment` function used `response.arrayBuffer()` to load entire files into memory before checking `maxBytes`, exposing the application to Denial of Service (DoS) via memory exhaustion.
**Learning:** `fetch` API methods like `arrayBuffer()` buffer the entire response. Size limits must be enforced during stream consumption, not after buffering.
**Prevention:** Always use streaming (Web Streams or Node Streams) for file downloads and enforce size limits incrementally as chunks are received.
