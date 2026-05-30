import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  MessageFlags,
} from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('What can the Continuum bot do?');

const HELP_TEXT = `**Continuum bot**

Slash commands:
• \`/link\` — connect your Continuum account
• \`/unlink\` — disconnect
• \`/status\` — show link health
• \`/projects\` — quick list (no AI)
• \`/help\` — this message

Or just DM me. Example phrases:
> What projects do I have?
> What's blocked on Acme App?
> Show me my open tasks
> What's the status of Internal Tools?
> Create a security review task in Acme App, scope M
> Mark task 142 as done
> Add a comment to task 87: "blocked on legal"

Write actions need explicit Confirm/Cancel before they execute.`;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: HELP_TEXT, flags: MessageFlags.Ephemeral });
}
