# Moltbot RingCentral Channel

RingCentral Team Messaging channel plugin for Moltbot. Enables bidirectional messaging with AI assistants through RingCentral Team Messaging.

## Features

- WebSocket-based real-time messaging (no public webhook required)
- JWT authentication
- Self-only mode (talk to AI as yourself)
- Support for text messages and attachments
- Typing indicators

## Prerequisites

1. A RingCentral account with Team Messaging enabled
2. A RingCentral REST API App (not Bot Add-in)

## Installation

```bash
moltbot plugin install moltbot-ringcentral
```

Or install from tarball:

```bash
moltbot plugin install ./moltbot-ringcentral-2026.1.25.tgz
```

## RingCentral App Setup

1. Go to [RingCentral Developer Portal](https://developers.ringcentral.com/)
2. Create a new app:
   - **App Type**: REST API App
   - **Auth**: JWT auth flow
3. Add permissions:
   - **Team Messaging** - Read and send messages
   - **WebSocket Subscriptions** - Real-time event subscriptions
   - **Read Accounts** - Read user information
4. Generate a JWT token for your user

## Configuration

Add to `~/.moltbot/moltbot.json`:

```json
{
  "channels": {
    "ringcentral": {
      "enabled": true,
      "clientId": "your-client-id",
      "clientSecret": "your-client-secret",
      "jwt": "your-jwt-token",
      "server": "https://platform.ringcentral.com"
    }
  }
}
```

Or use environment variables:

```bash
export RINGCENTRAL_CLIENT_ID="your-client-id"
export RINGCENTRAL_CLIENT_SECRET="your-client-secret"
export RINGCENTRAL_JWT="your-jwt-token"
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable the RingCentral channel |
| `clientId` | string | - | RingCentral app client ID |
| `clientSecret` | string | - | RingCentral app client secret |
| `jwt` | string | - | JWT token for authentication |
| `server` | string | `https://platform.ringcentral.com` | RingCentral API server URL |
| `selfOnly` | boolean | `true` | Only respond to JWT user in Personal chat |
| `name` | string | - | Bot display name |
| `textChunkLimit` | number | `4000` | Maximum characters per message chunk |
| `dmPolicy` | string | `"allowlist"` | DM policy (only when `selfOnly: false`) |
| `groupPolicy` | string | `"allowlist"` | Group policy (only when `selfOnly: false`) |

> **Note:** When `selfOnly: true` (default), the bot only responds to the JWT user in their Personal chat. All other policy settings (`dmPolicy`, `allowFrom`, `groupPolicy`, etc.) are ignored.

## Usage

1. Start the Moltbot gateway:

```bash
moltbot gateway run
```

2. Open RingCentral app and go to your "Personal" chat (conversation with yourself)

3. Send a message - the AI will respond!

## How It Works

This plugin uses JWT authentication, which means:

- **Messages appear from your own account** (not a separate bot)
- **Default mode (`selfOnly: true`)**: Only processes messages you send to yourself
- **Personal chat only**: By default, only responds in your "Personal" chat

This is ideal for personal AI assistant use without needing to set up a separate bot account.

## Advanced Configuration

### Allow Group Chats

To enable the bot in group chats:

```json
{
  "channels": {
    "ringcentral": {
      "enabled": true,
      "selfOnly": false,
      "groupPolicy": "open",
      "dmPolicy": "open"
    }
  }
}
```

### Multiple Accounts

```json
{
  "channels": {
    "ringcentral": {
      "enabled": true,
      "defaultAccount": "work",
      "accounts": {
        "work": {
          "clientId": "work-client-id",
          "clientSecret": "work-client-secret",
          "jwt": "work-jwt-token"
        },
        "personal": {
          "clientId": "personal-client-id",
          "clientSecret": "personal-client-secret",
          "jwt": "personal-jwt-token"
        }
      }
    }
  }
}
```

## Troubleshooting

### "Unauthorized for this grant type"

Your app type is wrong. Create a **REST API App** (not Bot Add-in) with JWT auth flow.

### "In order to call this API endpoint, application needs to have [WebSocket] permission"

Add **WebSocket Subscriptions** permission in your app settings. Permission changes may take a few minutes to propagate.

### Messages not being processed

1. Check that `selfOnly` mode matches your use case
2. Verify you're sending messages in a "Personal" chat (conversation with yourself)
3. Check gateway logs: `tail -f /tmp/moltbot/moltbot-*.log | grep ringcentral`

### Rate limit errors

RingCentral has API rate limits. If you see "Request rate exceeded", wait a minute before retrying.

## License

MIT
