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
• \`/builds\` — show active Continuum agent builds
• \`/branch task:<id>\` — attach an existing branch or create a new one for a task
• \`/help\` — this message

Or just DM me. Example phrases:

**Reads (no confirmation needed):**
> What projects do I have?
> Show me my open tasks
> What's blocked on Acme App?
> What's the timeline on task 142?
> Do I have a session running right now?

**Member writes (any project member · Confirm in Discord):**
> Create a security review task in Acme App, scope M
> Mark task 142 as done
> Update task 87: change due date to 2026-06-15, scope L
> Delete task 200
> Add a comment to task 87: "blocked on legal"
> Link task 142 to a milestone _(pick from dropdown)_
> Log 2.5h on Acme App today: "wired up Stripe webhook"
> Start a work session on Internal Tools
> Stop my work session, note: "finished invoice export"
> Submit an issue report: "the digest email is missing assignees"
> Accept my pending invitation to Beta Project
> Create branch task-42-fix from main on myorg/acme-app and link to task 42
> Attach https://figma.com/file/... to task 42 as Design
> Build task 42

**PM / admin writes (project_manager or admin on the project):**
> Assign task 42 to Alex _(picker shows project members)_
> Create milestone "Q3 release" in Acme App, due 2026-09-01
> Update milestone 18: name "Q3 release v2"
> Delete milestone 18
> Invite alice@example.com to Acme App _(role picker defaults to developer)_
> Remove Bob from Acme App

Write actions need an explicit Confirm/Cancel tap before they execute. Destructive actions (delete task/milestone, remove member, decline invitation) render with a red Confirm button.`;

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await interaction.reply({ content: HELP_TEXT, flags: MessageFlags.Ephemeral });
}
