import type { Message, Client } from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
} from 'discord.js';
import { logger } from '../../logger.js';
import { loadConfig } from '../../config.js';
import { runAgent } from '../../agent/loop.js';
import {
  appendHistory,
  loadRecentHistory,
} from '../../db/conversationHistory.js';
import { getUserLink } from '../../db/userLinks.js';
import { LinkExpiredError, NotLinkedError } from '../../auth/tokenManager.js';
import { chunkMessage } from '../formatters.js';
import { buildCustomIds } from './buttonHandler.js';
import { attachMessage } from '../../db/pendingActions.js';

const config = loadConfig();
const allowedGuilds = new Set(config.ALLOWED_GUILD_IDS);

export function attachMessageHandler(client: Client): void {
  client.on(Events.MessageCreate, (message) => {
    void handle(client, message);
  });
}

async function handle(client: Client, message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.content?.trim()) return;

  const isDM = message.channel.type === ChannelType.DM;
  const mentionsBot = client.user ? message.mentions.has(client.user) : false;

  if (!isDM && !mentionsBot) return;
  if (!isDM && message.guildId && !allowedGuilds.has(message.guildId)) return;

  const link = await getUserLink(message.author.id);
  if (!link) {
    await replyChunks(message, 'You need to link your Continuum account first — run `/link`.');
    return;
  }

  let userText = message.content.trim();
  if (!isDM && client.user) {
    userText = userText.replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '').trim();
    if (!userText) return;
  }

  if ('sendTyping' in message.channel) {
    try {
      await message.channel.sendTyping();
    } catch {
      // ignore
    }
  }

  try {
    const history = await loadRecentHistory(message.author.id);
    const result = await runAgent({
      discordUserId: message.author.id,
      history,
      userMessage: userText,
    });

    await appendHistory(message.author.id, { role: 'user', content: userText });
    await appendHistory(message.author.id, { role: 'assistant', content: result.reply });

    if (result.stagedPendingAction) {
      const { id, preview } = result.stagedPendingAction;
      const ids = buildCustomIds(id);
      const embed = new EmbedBuilder()
        .setTitle('Confirm action')
        .setDescription(preview)
        .setFooter({ text: 'Expires in 5 minutes' });
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ids.confirm).setLabel('Confirm').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(ids.cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
      );
      const replyContent = result.reply.trim().length > 0 ? result.reply : undefined;
      const sent = await message.reply({
        content: replyContent,
        embeds: [embed],
        components: [row],
      });
      await attachMessage(id, sent.id, sent.channelId);
    } else {
      await replyChunks(message, result.reply);
    }
  } catch (err) {
    if (err instanceof NotLinkedError) {
      await replyChunks(message, 'You need to link your Continuum account first — run `/link`.');
      return;
    }
    if (err instanceof LinkExpiredError) {
      await replyChunks(
        message,
        'Your Continuum link expired (refresh tokens last 24h). Please run `/link` again.',
      );
      return;
    }
    logger.error({ err, userId: message.author.id }, 'message handler failed');
    await replyChunks(message, 'Something went wrong. Please try again.');
  }
}

async function replyChunks(message: Message, text: string): Promise<void> {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await message.reply(chunk);
  }
}
