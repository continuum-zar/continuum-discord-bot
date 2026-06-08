import type { Message, Client } from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Events,
  StringSelectMenuBuilder,
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
import {
  buildConfirmButtons,
  buildConfirmEmbed,
  buildPickerRows,
} from './uiHelpers.js';

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
      const { id, action, preview, ui } = result.stagedPendingAction;
      const ids = buildCustomIds(id);
      const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

      if (ui?.pickers && ui.pickers.length > 0) {
        const pickerRows = await buildPickerRows(message.author.id, id, ui.pickers, {});
        components.push(...pickerRows);
      }

      const embed = buildConfirmEmbed(preview, { destructive: ui?.destructive });

      let buttonRow: ActionRowBuilder<ButtonBuilder>;
      if (action === 'start_build') {
        buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ids.modeOpenPr)
            .setLabel('Open PR')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(ids.modeDirectPush)
            .setLabel('Direct push')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(ids.cancel)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        );
      } else {
        buttonRow = buildConfirmButtons(ids, { destructive: ui?.destructive });
      }
      components.push(buttonRow);

      const replyContent = result.reply.trim().length > 0 ? result.reply : undefined;
      const sent = await message.reply({
        content: replyContent,
        embeds: [embed],
        components,
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
        'Your Continuum link expired — the refresh token is no longer valid (24h of inactivity, or the refresh chain was broken). Please run `/link` again.',
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
