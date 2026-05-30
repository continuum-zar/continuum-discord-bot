import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { generatePkce } from '../../auth/pkce.js';
import { signState } from '../../auth/state.js';
import { buildAuthorizationUrl, ensureClientId } from '../../auth/oauthClient.js';

export const data = new SlashCommandBuilder()
  .setName('link')
  .setDescription('Link your Discord account to Continuum');

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pkce = generatePkce();
  const state = await signState({
    discord_user_id: interaction.user.id,
    verifier: pkce.verifier,
    nonce: randomUUID(),
  });
  const clientId = await ensureClientId();
  const url = buildAuthorizationUrl({
    clientId,
    codeChallenge: pkce.challenge,
    state,
  });

  await interaction.editReply({
    content:
      `**Link Continuum**\n\n` +
      `Open this link in your browser to authorize:\n${url}\n\n` +
      `_Link expires in 10 minutes. After consenting, return here and run \`/status\` to confirm._`,
  });
}
