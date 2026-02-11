## 2026-02-10 - [Repeated API lookups in message loop]
**Learning:** Nameless group chats triggered 3+ API calls per message to resolve member names (plus 1 for chat info), causing severe rate limit risks and latency. This was hidden in the fallback name resolution logic.
**Action:** Always check if metadata lookups in the hot path (message processing) are cached. Added in-memory TTL cache for chats and users.
