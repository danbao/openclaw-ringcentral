# Sentinel's Journal

## 2026-02-10 - [DoS Risk] Unchecked File Download Size
**Vulnerability:** `downloadRingCentralAttachment` fetched the entire response body into memory using `arrayBuffer()` before checking if it exceeded `maxBytes`. This allowed large files to consume server memory, leading to potential Denial of Service.
**Learning:** Functions consuming external content must validate size constraints as early as possible (e.g., via headers) before allocating memory for the full payload.
**Prevention:** Check `Content-Length` header against limits before calling `arrayBuffer()` or consuming streams. Keep post-download checks as a fallback for missing or spoofed headers.
