import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { deleteUserLink } from '../../db/userLinks.js';

export const data = new SlashCommandBuilder()
  .setName('unlink')
  .setDescription('Remove your stored Continuum credentials');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const removed = await deleteUserLink(interaction.user.id);
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content: removed
      ? 'Continuum credentials removed. Run `/link` to connect again.'
      : 'You were not linked.',
  });
}
