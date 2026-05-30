import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  Events,
  MessageFlags,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type Client,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from '../../logger.js';
import {
  getPendingAction,
  updatePayload,
} from '../../db/pendingActions.js';
import { listMilestones } from '../../tools/listMilestones.js';
import { buildCreateTaskPreview } from '../../agent/tools.js';
import type { CreateTaskInput } from '../../api/types.js';
import { buildCustomIds, MILESTONE_SELECT_PREFIX } from './buttonHandler.js';

const NO_MILESTONE_VALUE = 'none';

export function attachSelectHandler(client: Client): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!interaction.customId.startsWith(MILESTONE_SELECT_PREFIX)) return;
    void handle(interaction);
  });
}

async function handle(interaction: StringSelectMenuInteraction): Promise<void> {
  const pendingId = interaction.customId.slice(MILESTONE_SELECT_PREFIX.length);
  await interaction.deferUpdate();

  const pa = await getPendingAction(pendingId);
  if (!pa) {
    await interaction.editReply({
      content: '⏱️ This action expired (5 min limit). Ask me again to start a new one.',
      components: [],
      embeds: [],
    });
    return;
  }

  if (pa.discord_user_id !== interaction.user.id) {
    await interaction.followUp({
      content: 'That selection belongs to someone else.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (pa.action !== 'create_task') {
    return;
  }

  const choice = interaction.values[0];
  const payload = pa.payload as unknown as CreateTaskInput;

  let milestoneName: string | null = null;
  if (choice === NO_MILESTONE_VALUE) {
    delete payload.milestone_id;
  } else {
    const milestoneId = Number.parseInt(choice, 10);
    if (!Number.isFinite(milestoneId)) return;
    payload.milestone_id = milestoneId;

    try {
      const milestones = await listMilestones(pa.discord_user_id, payload.project_id);
      milestoneName = milestones.find((m) => m.id === milestoneId)?.name ?? null;
    } catch (err) {
      logger.warn({ err, milestoneId }, 'failed to look up milestone name');
    }
  }

  await updatePayload(pendingId, payload as unknown as Record<string, unknown>);

  const ids = buildCustomIds(pendingId);
  const newPreview = buildCreateTaskPreview(payload, milestoneName);
  const embed = new EmbedBuilder()
    .setTitle('Confirm action')
    .setDescription(newPreview)
    .setFooter({ text: 'Expires in 5 minutes' });

  // Rebuild the select menu so the chosen option stays highlighted.
  let rebuiltSelectRow: ActionRowBuilder<StringSelectMenuBuilder> | null = null;
  try {
    const milestones = await listMilestones(pa.discord_user_id, payload.project_id);
    rebuiltSelectRow = buildMilestoneSelectRow(ids.milestoneSelect, milestones, choice);
  } catch (err) {
    logger.warn({ err }, 'failed to rebuild milestone select after pick');
  }

  const buttonRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ids.confirm).setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(ids.cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  if (rebuiltSelectRow) components.push(rebuiltSelectRow);
  components.push(buttonRow);

  await interaction.editReply({ embeds: [embed], components });
}

function buildMilestoneSelectRow(
  customId: string,
  milestones: { id: number; name: string; status: string; due_date: string | null }[],
  selectedValue: string,
): ActionRowBuilder<StringSelectMenuBuilder> | null {
  const options: StringSelectMenuOptionBuilder[] = [
    new StringSelectMenuOptionBuilder()
      .setLabel('No milestone')
      .setValue(NO_MILESTONE_VALUE)
      .setDescription('Leave this task unassigned to any milestone')
      .setDefault(selectedValue === NO_MILESTONE_VALUE),
  ];

  for (const m of milestones.slice(0, 24)) {
    const label = m.name.length > 100 ? `${m.name.slice(0, 97)}…` : m.name;
    const descParts: string[] = [];
    if (m.status) descParts.push(m.status.replace('_', ' '));
    if (m.due_date) descParts.push(`due ${m.due_date.slice(0, 10)}`);
    const description = descParts.join(' · ').slice(0, 100);
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(label)
      .setValue(String(m.id))
      .setDefault(selectedValue === String(m.id));
    if (description) opt.setDescription(description);
    options.push(opt);
  }

  if (options.length === 1) return null;

  const select = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder('Pick a milestone (optional)')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}
