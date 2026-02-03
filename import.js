#!/usr/bin/env node

/**
 * DRIFT-Import
 * Import Discord Chat Exporter JSON files into Discord forum posts
 *
 * Usage: node import.js <export.json> <forum-channel-id>
 */

import { Client, GatewayIntentBits, ChannelType, AttachmentBuilder } from 'discord.js';
import { readFile, stat, access } from 'fs/promises';
import { dirname, join, basename } from 'path';
import 'dotenv/config';

// Configuration
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const RATE_LIMIT_DELAY = parseInt(process.env.RATE_LIMIT_DELAY) || 1500;
const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024; // 25MB
const MAX_ATTACHMENTS_PER_MESSAGE = 10;

/**
 * Sanitize username for webhook (Discord reserved words)
 */
function sanitizeUsername(name) {
  if (!name || name.trim().length === 0) {
    return 'Unknown User';
  }

  let sanitized = name
    .replace(/discord/gi, 'Disc∙rd')
    .replace(/clyde/gi, 'Cl∙de')
    .trim();

  // Discord webhook username must be 1-80 characters
  if (sanitized.length > 80) {
    sanitized = sanitized.substring(0, 80);
  }

  if (sanitized.length === 0) {
    return 'Unknown User';
  }

  return sanitized;
}

/**
 * Convert ISO timestamp to Discord timestamp format
 */
function formatDiscordTimestamp(isoTimestamp) {
  const date = new Date(isoTimestamp);
  const unixTimestamp = Math.floor(date.getTime() / 1000);
  return `<t:${unixTimestamp}:f>`;
}

/**
 * Check if a message is a system message type
 */
function isSystemMessage(message) {
  // Discord Chat Exporter includes a 'type' field
  // Default type is "Default" for regular messages
  const systemTypes = [
    'RecipientAdd',
    'RecipientRemove',
    'Call',
    'ChannelNameChange',
    'ChannelIconChange',
    'ChannelPinnedMessage',
    'GuildMemberJoin',
    'UserPremiumGuildSubscription',
    'UserPremiumGuildSubscriptionTier1',
    'UserPremiumGuildSubscriptionTier2',
    'UserPremiumGuildSubscriptionTier3',
    'ChannelFollowAdd',
    'GuildDiscoveryDisqualified',
    'GuildDiscoveryRequalified',
    'GuildDiscoveryGracePeriodInitialWarning',
    'GuildDiscoveryGracePeriodFinalWarning',
    'ThreadCreated',
    'Reply', // We handle replies separately
    'ChatInputCommand',
    'ThreadStarterMessage',
    'GuildInviteReminder',
    'ContextMenuCommand',
    'AutoModerationAction',
    'RoleSubscriptionPurchase',
    'InteractionPremiumUpsell',
    'StageStart',
    'StageEnd',
    'StageSpeaker',
    'StageTopic'
  ];

  // Skip actual system messages but allow Default and Reply
  if (message.type && systemTypes.includes(message.type) && message.type !== 'Reply') {
    return true;
  }

  return false;
}

/**
 * Sleep for a specified duration
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load and validate the export JSON file
 */
async function loadExportFile(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Validate required fields
    if (!data.channel) {
      throw new Error('Invalid export file: missing channel data');
    }
    if (!data.messages || !Array.isArray(data.messages)) {
      throw new Error('Invalid export file: missing or invalid messages array');
    }

    return data;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Export file not found: ${filePath}`);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in export file: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Get the attachments directory path for an export file
 */
function getAttachmentsDir(exportFilePath) {
  const dir = dirname(exportFilePath);
  const baseName = basename(exportFilePath, '.json');
  return join(dir, `${baseName}_files`);
}

/**
 * Try to load a local attachment file
 */
async function loadLocalAttachment(attachmentsDir, attachment) {
  // Try different possible file paths
  const possiblePaths = [
    join(attachmentsDir, attachment.fileName),
    join(attachmentsDir, `${attachment.id}_${attachment.fileName}`),
    join(attachmentsDir, attachment.id.toString(), attachment.fileName)
  ];

  for (const filePath of possiblePaths) {
    try {
      await access(filePath);
      const stats = await stat(filePath);
      return { path: filePath, size: stats.size };
    } catch {
      // Try next path
    }
  }

  return null;
}

/**
 * Process attachments for a message
 */
async function processAttachments(attachments, attachmentsDir) {
  const files = [];
  const oversizedLinks = [];

  if (!attachments || attachments.length === 0) {
    return { files, oversizedLinks };
  }

  for (const attachment of attachments) {
    // Check file size from export data
    const fileSize = attachment.fileSizeBytes || 0;

    if (fileSize > MAX_ATTACHMENT_SIZE) {
      // File too large, add link instead
      oversizedLinks.push(`📎 [${attachment.fileName}](${attachment.url}) *(${formatFileSize(fileSize)} - too large to upload)*`);
      continue;
    }

    // Try to load local file
    const localFile = await loadLocalAttachment(attachmentsDir, attachment);

    if (localFile) {
      if (localFile.size > MAX_ATTACHMENT_SIZE) {
        oversizedLinks.push(`📎 [${attachment.fileName}](${attachment.url}) *(${formatFileSize(localFile.size)} - too large to upload)*`);
        continue;
      }

      if (files.length < MAX_ATTACHMENTS_PER_MESSAGE) {
        files.push(new AttachmentBuilder(localFile.path, { name: attachment.fileName }));
      } else {
        oversizedLinks.push(`📎 [${attachment.fileName}](${attachment.url}) *(attachment limit reached)*`);
      }
    } else {
      // Local file not found, provide original URL
      oversizedLinks.push(`📎 [${attachment.fileName}](${attachment.url}) *(local file not found)*`);
    }
  }

  return { files, oversizedLinks };
}

/**
 * Format file size for display
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Build message content with timestamp and attachment links
 */
function buildMessageContent(message, oversizedLinks) {
  let content = message.content || '';

  // Add attachment links if any
  if (oversizedLinks.length > 0) {
    if (content) content += '\n';
    content += oversizedLinks.join('\n');
  }

  // Add timestamp suffix
  const timestamp = formatDiscordTimestamp(message.timestamp);
  if (content) {
    content += `\n-# ${timestamp}`;
  } else {
    content = `-# ${timestamp}`;
  }

  return content;
}

/**
 * Get author display name
 */
function getAuthorDisplayName(author) {
  return author.nickname || author.name || author.username || 'Unknown User';
}

/**
 * Get author avatar URL
 */
function getAuthorAvatarUrl(author) {
  if (author.avatarUrl) {
    return author.avatarUrl;
  }
  return null;
}

/**
 * Send a message via webhook with retry logic
 */
async function sendWebhookMessage(webhook, options, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await webhook.send(options);
    } catch (error) {
      if (error.status === 429 && attempt < retries) {
        // Rate limited, wait and retry
        const retryAfter = error.retryAfter || 5;
        console.log(`  ⏳ Rate limited, waiting ${retryAfter}s...`);
        await sleep(retryAfter * 1000 + 500);
        continue;
      }
      throw error;
    }
  }
}

/**
 * Main import function
 */
async function importToForum(exportFilePath, forumChannelId) {
  console.log('🚀 DRIFT-Import Starting...\n');

  // Validate token
  if (!DISCORD_TOKEN) {
    throw new Error('DISCORD_TOKEN environment variable is required');
  }

  // Load export data
  console.log(`📂 Loading export file: ${exportFilePath}`);
  const exportData = await loadExportFile(exportFilePath);
  const attachmentsDir = getAttachmentsDir(exportFilePath);

  console.log(`   Channel: #${exportData.channel.name}`);
  console.log(`   Messages: ${exportData.messages.length}`);
  if (exportData.guild) {
    console.log(`   Guild: ${exportData.guild.name}`);
  }
  console.log('');

  // Initialize Discord client
  console.log('🔌 Connecting to Discord...');
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  await client.login(DISCORD_TOKEN);
  console.log(`   Logged in as: ${client.user.tag}\n`);

  let webhook = null;

  try {
    // Fetch the forum channel
    console.log('📍 Fetching forum channel...');
    const forumChannel = await client.channels.fetch(forumChannelId);

    if (!forumChannel) {
      throw new Error(`Channel not found: ${forumChannelId}`);
    }

    if (forumChannel.type !== ChannelType.GuildForum) {
      throw new Error(`Channel is not a forum channel (type: ${forumChannel.type})`);
    }

    console.log(`   Forum: #${forumChannel.name}\n`);

    // Create the forum post
    console.log('📝 Creating forum post...');
    const postTitle = exportData.channel.name.substring(0, 100); // Discord title limit

    // Build initial post content
    const channelTopic = exportData.channel.topic ? `> ${exportData.channel.topic}\n\n` : '';
    const importInfo = `${channelTopic}📥 **Imported from #${exportData.channel.name}**\n` +
      `📊 ${exportData.messages.length} messages\n` +
      `-# Imported ${formatDiscordTimestamp(new Date().toISOString())}`;

    const thread = await forumChannel.threads.create({
      name: postTitle,
      message: {
        content: importInfo
      },
      reason: `DRIFT-Import: Importing #${exportData.channel.name}`
    });

    console.log(`   Created: "${thread.name}"\n`);

    // Create webhook for the thread
    console.log('🔗 Creating webhook...');
    webhook = await forumChannel.createWebhook({
      name: 'DRIFT-Import',
      reason: `DRIFT-Import: Importing #${exportData.channel.name}`
    });
    console.log('   Webhook ready\n');

    // Filter out system messages and sort by timestamp
    const messages = exportData.messages
      .filter(msg => !isSystemMessage(msg))
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(`📨 Sending ${messages.length} messages (delay: ${RATE_LIMIT_DELAY}ms)...\n`);

    let sent = 0;
    let errors = 0;

    for (const message of messages) {
      try {
        // Process attachments
        const { files, oversizedLinks } = await processAttachments(
          message.attachments,
          attachmentsDir
        );

        // Build message content
        const content = buildMessageContent(message, oversizedLinks);

        // Skip if no content and no files
        if (!content.trim() && files.length === 0) {
          continue;
        }

        // Prepare webhook options
        const webhookOptions = {
          content: content || undefined,
          username: sanitizeUsername(getAuthorDisplayName(message.author)),
          avatarURL: getAuthorAvatarUrl(message.author),
          threadId: thread.id,
          files: files.length > 0 ? files : undefined
        };

        // Send message
        await sendWebhookMessage(webhook, webhookOptions);
        sent++;

        // Progress indicator
        if (sent % 10 === 0 || sent === messages.length) {
          const progress = ((sent / messages.length) * 100).toFixed(1);
          process.stdout.write(`\r   Progress: ${sent}/${messages.length} (${progress}%)`);
        }

        // Rate limit delay
        await sleep(RATE_LIMIT_DELAY);

      } catch (error) {
        errors++;
        console.error(`\n   ❌ Error sending message ${message.id}: ${error.message}`);
      }
    }

    console.log('\n');

    // Summary
    console.log('✅ Import complete!');
    console.log(`   📨 Sent: ${sent} messages`);
    if (errors > 0) {
      console.log(`   ❌ Errors: ${errors}`);
    }
    console.log(`   🔗 Forum post: https://discord.com/channels/${forumChannel.guildId}/${thread.id}`);

  } finally {
    // Cleanup webhook
    if (webhook) {
      try {
        await webhook.delete('DRIFT-Import: Cleanup');
        console.log('\n🧹 Webhook cleaned up');
      } catch (error) {
        console.error('\n⚠️  Could not delete webhook:', error.message);
      }
    }

    // Disconnect client
    client.destroy();
    console.log('👋 Disconnected from Discord');
  }
}

/**
 * CLI Entry Point
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    console.log(`
DRIFT-Import - Import Discord Chat Exporter JSON files into forum posts

Usage:
  node import.js <export.json> <forum-channel-id>

Arguments:
  export.json       Path to Discord Chat Exporter JSON file
  forum-channel-id  ID of the destination forum channel

Environment Variables:
  DISCORD_TOKEN     Discord bot token (required)
  RATE_LIMIT_DELAY  Delay between messages in ms (default: 1500)

Example:
  node import.js ./exports/general.json 1234567890123456789

Export folder structure:
  exports/
  ├── channel.json
  └── channel_files/
      ├── image1.png
      └── document.pdf
`);
    process.exit(args.includes('--help') || args.includes('-h') ? 0 : 1);
  }

  const [exportFilePath, forumChannelId] = args;

  try {
    await importToForum(exportFilePath, forumChannelId);
    process.exit(0);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  }
}

main();
