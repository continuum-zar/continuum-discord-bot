import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { getUserLink } from '../../db/userLinks.js';
import { listWatchersForUser } from '../../db/buildWatchers.js';
import { getAgentRun } from '../../tools/startBuild.js';
import { logger } from '../../logger.js';

export const data = new SlashCommandBuilder()
  .setName('builds')
  .setDescription('Show your active Continuum agent builds');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const link = await getUserLink(interaction.user.id);
  if (!link) {
    await interaction.editReply('Not linked. Run `/link` to connect your Continuum account.');
    return;
  }

  const watchers = await listWatchersForUser(interaction.user.id);
  if (watchers.length === 0) {
    await interaction.editReply('No active builds. Ask me to build a task in DM.');
    return;
  }

  const lines: string[] = ['**Active builds**'];
  for (const w of watchers.slice(0, 10)) {
    const modeLabel = w.mode === 'open_pr' ? 'PR' : 'push';
    let status = 'unknown';
    try {
      const run = await getAgentRun(interaction.user.id, w.task_id, w.run_id);
      status = run.status;
    } catch (err) {
      logger.debug({ err, runId: w.run_id }, '/builds: status fetch failed');
    }
    lines.push(
      `• task **#${w.task_id}** · \`${w.run_id.slice(0, 8)}\` · ${modeLabel} · ${status}`,
    );
  }
  await interaction.editReply(lines.join('\n').slice(0, 1900));
}
