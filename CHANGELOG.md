# Changelog

All notable changes to this project will be documented in this file.

## [2026.2.10] - 2026-02-10

### Added

- **Structural Loop Guard Filter** - High-confidence, name-independent pattern matching to prevent bot self-reply loops
  - `thinking_marker`: Filters `> Xxx is thinking...` with any bot name, optional emoji, and Chinese variant (`正在思考`)
  - `answer_wrapper`: Filters `> ---answer---` / `> ---end---` with variable dash count
  - `queued_busy`: Filters `Queued messages while agent was busy` (case-insensitive)
  - `queued_number`: Filters `Queued #N` pattern
  - Explicitly does **not** filter `media:attachment`, `System:` prefix, or `RingCentral user:` prefix
- **Attachment Placeholder Silent Discard** - Messages containing only `media:attachment` or `<media:attachment>` are silently dropped; messages with placeholder + real text pass through normally

### Fixed

- **Publish Note False Failure** - `publishRingCentralNote()` no longer throws `Unexpected end of JSON input` on empty 2xx responses; returns `{status: "Active"}` on success instead of misreporting `status: partial, noteStatus: Draft`

## [2026.2.9] - 2026-02-10

### Added

- **Chat Cache System** - Cache all chats (Personal/Direct/Group/Team/Everyone) to local file with search capability
  - `action=search-chat` - Find a chat by name or person name and get its chatId
  - `action=refresh-chat-cache` - Manually refresh the chat list cache (no auto-sync to avoid 429)
  - `action=find-direct-chat` - Look up DM chatId by senderId with exact `{selfId, memberId}` matching
  - Persists cache to `memory/ringcentral-chat-cache.json` with `ownerId` for precise DM resolution
- **Notes Actions** - Full notes lifecycle support
  - `action=create-note` - Create a note, defaults to Active (published) instead of Draft
  - `action=update-note` - Update an existing note
  - `action=publish-note` - Publish a Draft note to Active
  - `create-note` supports `publish=false` to keep Draft; returns `status: 'partial'` with error if publish fails
- **Tasks Actions** - `list-tasks`, `create-task`, `update-task`, `complete-task`
- **Events Actions** - `list-events`, `create-event`, `update-event`, `delete-event`
- **WebSocket Self-Healing Watchdog** - 30s health check for long-running resilience
  - Detects system sleep/wake via timer drift (>10s)
  - Monitors WS readyState degradation
  - Detects stale inbound (>5min no messages) and forces reconnect
  - Unlimited retry with exponential backoff (5s→5min) + ±25% jitter
- **Thinking Indicator** - Sends `🦞 {botName} is thinking...` before reply, then updates in-place with first chunk (follows Google Chat official pattern)
- **Answer Delimiters** - Wraps bot reply text with `> --------answer--------` / `> ---------end----------` to distinguish AI from human messages
- **Agent Prompt Hints** - Guide agent for chat search, cache refresh triggers (CN/EN), and "send to me" → DM routing
- **Session Management** - Only create sessions for groups in allowlist
- **Plugin Capabilities** - Onboarding adapter, mentions strip patterns, groups tool policy, live directory, account audit, gateway logout, config schema, threading support, quickstart allowFrom

### Changed

- **API URL Paths** - Corrected Team Messaging API paths for tasks (`/tasks/{taskId}`) and events (`/groups/{groupId}/events`, `/events/{eventId}`)
- **Direct Chat Members** - Normalized from `{id:string}[]` to `string[]` for proper peer ID matching
- **Persons API Throttling** - 500ms delay between `/persons` requests to avoid 429 rate limiting
- **Reconnect Strategy** - Removed max attempts cap (was 10), added jitter, `isReconnecting` guard to prevent overlapping attempts

### Fixed

- 404 errors on `complete-task`, `update-task`, `list-events` due to incorrect URL paths
- `TypeError: c.name.toLowerCase is not a function` in chat cache search
- `find-direct-chat` returning wrong DM by matching only memberId without selfId verification
- Stale inbound health check causing reconnect loop on quiet accounts (reset `lastInboundAt` on trigger)

## [2026.2.1] - 2026-02-02

### Added

- **Message Actions** - Agent can now read, edit, delete messages and get chat info via tools
  - `action=read` - Fetch message history from a chat
  - `action=edit` - Edit an existing message
  - `action=delete` - Delete a message
  - `action=channel-info` - Get chat/channel information
- **Agent Prompt Hints** - Guide agent to save chat name→chatId mappings to memory
- **CI/CD** - GitHub Actions workflow for publishing beta packages to GitHub Packages

### Changed

- Use OpenClaw standard session key format (`agent:{agentId}:{channel}:{peerKind}:{peerId}`)
- Map RingCentral chat types to OpenClaw peerKind (Personal/Direct→dm, Group→group, Team→channel)

### Fixed

- WebSocket auto-reconnect on disconnect (handles laptop sleep/network changes)
- Remove WebSocket notification log truncation for better debugging
- Install script now auto-restarts gateway after plugin installation

## [2026.1.31] - 2026-01-31

### Added

- WebSocket auto-reconnect feature
- Support for npm registry installation in install-local.sh

### Fixed

- Beta versioning logic to use current date format

## [2026.1.30] - 2026-01-30

### Added

- Initial release with RingCentral Team Messaging support
- WebSocket-based real-time messaging
- JWT authentication
- Self-only mode (talk to AI as yourself)
- Support for text messages and attachments
- Typing indicators
- Adaptive Cards support (create, read, update, delete)
