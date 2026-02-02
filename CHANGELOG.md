# Changelog

All notable changes to this project will be documented in this file.

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
