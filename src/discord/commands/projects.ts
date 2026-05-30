import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { listProjects } from '../../tools/listProjects.js';
import { getUserLink } from '../../db/userLinks.js';

export const data = new SlashCommandBuilder()
  .setName('projects')
  .setDescription('Quick list of your Continuum projects');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const link = await getUserLink(interaction.user.id);
  if (!link) {
    await interaction.editReply('Not linked. Run `/link` to connect your Continuum account.');
    return;
  }
  const projects = await listProjects(interaction.user.id);
  if (!projects.length) {
    await interaction.editReply('No projects found.');
    return;
  }
  const lines = projects.map(
    (p) =>
      `• **${p.name}** — ${p.status} · ${Math.round(p.progress * 100)}% · ${p.team_size} member(s)`,
  );
  await interaction.editReply(lines.join('\n').slice(0, 1900));
}
