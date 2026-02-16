## 2026-02-10 - Synchronous I/O Blocking
**Learning:** Synchronous file I/O (`fs.readFileSync`, `fs.writeFileSync`) blocks the Node.js event loop, which can degrade performance in high-throughput plugins. Converting to `fs.promises` improves concurrency without adding complexity.
**Action:** Always prefer `fs.promises` for file operations in async contexts, especially for cache or log management.
