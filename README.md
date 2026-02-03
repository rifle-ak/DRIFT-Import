# DRIFT-Import

Import Discord Chat Exporter JSON files into Discord forum posts, preserving author attribution via webhooks.

## Features

- Imports Discord Chat Exporter JSON files into forum posts
- Preserves original author names and avatars via webhooks
- Re-uploads local attachment files from export folder
- Adds Discord timestamp format to each message
- Handles rate limits with configurable delay
- Gracefully handles oversized attachments (>25MB)
- Sanitizes webhook usernames (Discord reserved words)
- Skips system messages

## Requirements

- Node.js 18.0.0 or higher
- Discord bot with the following permissions:
  - Manage Webhooks
  - Send Messages
  - Create Public Threads
  - Send Messages in Threads

## Installation

```bash
# Clone the repository
git clone https://github.com/rifle-ak/DRIFT-Import.git
cd DRIFT-Import

# Install dependencies
npm install

# Copy environment file and add your token
cp .env.example .env
```

## Configuration

Edit `.env` with your settings:

```env
# Discord bot token (required)
DISCORD_TOKEN=your_bot_token_here

# Delay between messages in milliseconds (optional, default: 1500)
RATE_LIMIT_DELAY=1500
```

## Usage

```bash
node import.js <export.json> <forum-channel-id>
```

### Arguments

| Argument | Description |
|----------|-------------|
| `export.json` | Path to Discord Chat Exporter JSON file |
| `forum-channel-id` | ID of the destination forum channel |

### Example

```bash
node import.js ./exports/general.json 1234567890123456789
```

## Export Folder Structure

When exporting with Discord Chat Exporter, use the "Download media" option. The tool expects this folder structure:

```
exports/
├── channel.json
└── channel_files/
    ├── image1.png
    ├── document.pdf
    └── ...
```

The `_files` directory should match the JSON filename (e.g., `general.json` → `general_files/`).

## How It Works

1. Reads the Discord Chat Exporter JSON file
2. Connects to Discord with your bot token
3. Creates a new forum post with the channel name
4. Creates a temporary webhook for message attribution
5. Replays all messages chronologically with:
   - Original author's name and avatar
   - Message content and attachments
   - Discord timestamp suffix (`<t:UNIX:f>`)
6. Cleans up the webhook when done

## Message Handling

### Attachments
- Files under 25MB are re-uploaded from local storage
- Files over 25MB show a link to the original URL
- Maximum 10 attachments per message (Discord limit)

### System Messages
The following message types are skipped:
- Member join/leave messages
- Pin notifications
- Boost messages
- Thread creation messages
- Other non-user messages

### Username Sanitization
Usernames containing Discord reserved words are sanitized:
- `discord` → `Disc∙rd`
- `clyde` → `Cl∙de`

## Rate Limiting

Default delay between messages is 1500ms. If you encounter rate limits:
- Increase `RATE_LIMIT_DELAY` in your `.env` file
- The tool automatically retries on 429 errors

## Creating a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token to your `.env` file
5. Enable "Message Content Intent" if needed
6. Go to "OAuth2" → "URL Generator"
7. Select scopes: `bot`
8. Select permissions:
   - Manage Webhooks
   - Send Messages
   - Create Public Threads
   - Send Messages in Threads
9. Use the generated URL to invite the bot to your server

## License

MIT License - see [LICENSE](LICENSE) for details.

## Related Projects

- [DRIFT](https://github.com/rifle-ak/DRIFT) - Discord Rich Integration for Forum Threads (live migration)
- [Discord Chat Exporter](https://github.com/Tyrrrz/DiscordChatExporter) - Export Discord chat history
