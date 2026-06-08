import type { Message, Client } from 'discord.js';
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
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
import { listMilestones } from '../../tools/listMilestones.js';
import type { Milestone } from '../../api/types.js';
import { StringSelectMenuOptionBuilder } from 'discord.js';

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
      const { id, action, preview } = result.stagedPendingAction;
      const ids = buildCustomIds(id);
      const embed = new EmbedBuilder()
        .setTitle('Confirm action')
        .setDescription(preview)
        .setFooter({ text: 'Expires in 5 minutes' });
      const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];

      if (
        (action === 'create_task' || action === 'draft_task') &&
        result.stagedPendingAction.ui?.projectId != null
      ) {
        const projectId = result.stagedPendingAction.ui.projectId;
        try {
          const milestones = await listMilestones(message.author.id, projectId);
          const selectRow = buildMilestoneSelectRow(ids.milestoneSelect, milestones);
          if (selectRow) components.push(selectRow);
        } catch (err) {
          logger.warn({ err, projectId }, 'failed to load milestones for picker');
        }
      }

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
        buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ids.confirm)
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId(ids.cancel)
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Secondary),
        );
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
        'Your Continuum link expired (refresh tokens last 24h). Please run `/link` again.',
      );
      return;
    }
    logger.error({ err, userId: message.author.id }, 'message handler failed');
    await replyChunks(message, 'Something went wrong. Please try again.');
  }
}

const NO_MILESTONE_VALUE = 'none';
const MILESTONE_OPTION_LIMIT = 24; // Discord allows 25 options; reserve one for "No milestone"

function buildMilestoneSelectRow(
  customId: string,
  milestones: Milestone[],
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const options: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder()
      .setLabel('No milestone')
      .setValue(NO_MILESTONE_VALUE)
      .setDescription('Leave this task unassigned to any milestone')
      .setDefault(true),
  ];

  for (const m of milestones.slice(0, MILESTONE_OPTION_LIMIT)) {
    const label = m.name.length > 100 ? `${m.name.slice(0, 97)}…` : m.name;
    const descParts: string[] = [];
    if (m.status) descParts.push(m.status.replace('_', ' '));
    if (m.due_date) descParts.push(`due ${m.due_date.slice(0, 10)}`);
    const description = descParts.join(' · ').slice(0, 100);
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(String(m.id));
    if (description) opt.setDescription(description);
    options.push(opt);
  }

  if (options.length === 1) {
    // Only the "No milestone" option — no point showing the picker.
    return null;
  }

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Pick a milestone (optional)')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

async function replyChunks(message: Message, text: string): Promise<void> {
  const chunks = chunkMessage(text);
  for (const chunk of chunks) {
    await message.reply(chunk);
  }
}
