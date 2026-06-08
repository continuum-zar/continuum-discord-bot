import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { getUserLink } from '../../db/userLinks.js';

export const data = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Show your Continuum link status');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const link = await getUserLink(interaction.user.id);
  if (!link) {
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: 'Not linked. Run `/link` to connect your Continuum account.',
    });
    return;
  }
  const expiresAt = link.access_token_expires_at;
  const expiresIn = expiresAt
    ? Math.max(0, Math.round((expiresAt.getTime() - Date.now()) / 60000))
    : null;
  const ageHours = Math.round((Date.now() - link.updated_at.getTime()) / (1000 * 60 * 60));
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    content:
      `**Continuum link status**\n` +
      `• Account: \`${link.continuum_username ?? link.continuum_user_id}\`\n` +
      `• Access token: ${expiresIn !== null ? `expires in ~${expiresIn} min (auto-refreshed before expiry)` : 'unknown'}\n` +
      `• Last refresh: ${ageHours}h ago\n\n` +
      `_Your session stays alive as long as the refresh chain is valid (refresh tokens last 24h after the last activity)._`,
  });
}
