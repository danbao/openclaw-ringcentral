## 2026-02-24 - Missing Default Limits for File Downloads
**Vulnerability:** The `downloadRingCentralAttachment` function allowed downloading files of arbitrary size into memory when the optional `maxBytes` parameter was omitted. This created a potential Denial of Service (DoS) vector via memory exhaustion (OOM).
**Learning:** Optional security parameters in utility functions often lead to insecure defaults. Callers may assume a safe default exists or simply forget to provide the parameter.
**Prevention:** Enforce safe defaults within the utility function itself. If a parameter is critical for security (like resource limits), make it mandatory or provide a conservative default value that safeguards the system.
