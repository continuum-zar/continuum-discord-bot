import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { getUserLink } from '../../db/userLinks.js';
import { getTask } from '../../tools/getTask.js';
import { logger } from '../../logger.js';
import { ContinuumApiError } from '../../api/continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../../auth/tokenManager.js';
import {
  BRANCH_MODE_PREFIX,
} from '../handlers/branchHandler.js';

export const data = new SlashCommandBuilder()
  .setName('branch')
  .setDescription('Attach an existing Git branch to a task, or create a new one')
  .addIntegerOption((o) =>
    o
      .setName('task')
      .setDescription('Task ID')
      .setRequired(true)
      .setMinValue(1),
  );

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const link = await getUserLink(interaction.user.id);
  if (!link) {
    await interaction.editReply('Not linked. Run `/link` to connect your Continuum account.');
    return;
  }

  const taskId = interaction.options.getInteger('task', true);

  let task;
  try {
    task = await getTask(interaction.user.id, taskId);
  } catch (err) {
    logger.warn({ err, taskId }, '/branch: getTask failed');
    await interaction.editReply(taskLoadError(err, taskId));
    return;
  }

  const currentLink = task.branch
    ? `\n\n_Currently linked: \`${task.branch.linked_repo}\` / \`${task.branch.linked_branch}\`_`
    : '';

  const embed = new EmbedBuilder()
    .setTitle(`Branch · task #${task.id}`)
    .setDescription(`**${task.title}**${currentLink}\n\nWhat do you want to do?`);

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${BRANCH_MODE_PREFIX}attach:${task.id}`)
      .setLabel('Attach existing')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`${BRANCH_MODE_PREFIX}create:${task.id}`)
      .setLabel('Create new')
      .setStyle(ButtonStyle.Success),
  );

  await interaction.editReply({ embeds: [embed], components: [buttons] });
}

function taskLoadError(err: unknown, taskId: number): string {
  if (err instanceof NotLinkedError) return 'You are not linked. Run `/link`.';
  if (err instanceof LinkExpiredError) return 'Your link expired. Run `/link` to reconnect.';
  if (err instanceof ContinuumApiError) {
    if (err.status === 404) return `Task #${taskId} not found.`;
    if (err.status === 403) return "You don't have access to that task.";
    return `Couldn't load task #${taskId} (API ${err.status}).`;
  }
  return `Couldn't load task #${taskId}.`;
}
