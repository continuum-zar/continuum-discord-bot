import {
  type ButtonInteraction,
  type Client,
  Events,
  type Interaction,
  MessageFlags,
} from 'discord.js';
import { logger } from '../../logger.js';
import {
  deletePendingAction,
  getPendingAction,
  type PendingAction,
} from '../../db/pendingActions.js';
import { executeCreateTask } from '../../tools/createTask.js';
import { executeSetTaskStatus } from '../../tools/setTaskStatus.js';
import { executeAddComment } from '../../tools/addComment.js';
import type { CreateTaskInput } from '../../api/types.js';
import { ContinuumApiError } from '../../api/continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../../auth/tokenManager.js';

const CONFIRM_PREFIX = 'pa:confirm:';
const CANCEL_PREFIX = 'pa:cancel:';

export function buildCustomIds(pendingActionId: string): {
  confirm: string;
  cancel: string;
} {
  return {
    confirm: `${CONFIRM_PREFIX}${pendingActionId}`,
    cancel: `${CANCEL_PREFIX}${pendingActionId}`,
  };
}

export function attachButtonHandler(client: Client): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    if (
      !interaction.customId.startsWith(CONFIRM_PREFIX) &&
      !interaction.customId.startsWith(CANCEL_PREFIX)
    ) {
      return;
    }
    void handle(interaction);
  });
}

async function handle(interaction: ButtonInteraction): Promise<void> {
  const isConfirm = interaction.customId.startsWith(CONFIRM_PREFIX);
  const pendingId = interaction.customId.slice(
    (isConfirm ? CONFIRM_PREFIX : CANCEL_PREFIX).length,
  );

  await interaction.deferUpdate();

  const pa = await getPendingAction(pendingId);
  if (!pa) {
    await interaction.editReply({
      content: '⏱️ This action expired (5 min limit). Ask me again to start a new one.',
      components: [],
    });
    return;
  }

  if (pa.discord_user_id !== interaction.user.id) {
    await interaction.followUp({
      content: "That confirmation belongs to someone else.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isConfirm) {
    await deletePendingAction(pendingId);
    await interaction.editReply({ content: '❌ Cancelled.', components: [] });
    return;
  }

  try {
    const resultMessage = await executeAction(pa);
    await deletePendingAction(pendingId);
    await interaction.editReply({ content: resultMessage, components: [] });
  } catch (err) {
    await deletePendingAction(pendingId);
    const msg = errorMessage(err);
    logger.error({ err, pendingId }, 'pending action execution failed');
    await interaction.editReply({ content: `⚠️ ${msg}`, components: [] });
  }
}

async function executeAction(pa: PendingAction): Promise<string> {
  switch (pa.action) {
    case 'create_task': {
      const input = pa.payload as unknown as CreateTaskInput;
      const task = await executeCreateTask(pa.discord_user_id, input);
      return `✅ Created task **#${task.id}**: ${task.title}`;
    }
    case 'set_task_status': {
      const input = pa.payload as { task_id: number; status: 'todo' | 'in_progress' | 'done' };
      const task = await executeSetTaskStatus(pa.discord_user_id, input);
      return `✅ Task **#${task.id}** → \`${task.status}\``;
    }
    case 'add_comment': {
      const input = pa.payload as { task_id: number; content: string };
      const comment = await executeAddComment(pa.discord_user_id, input);
      return `✅ Comment added to task **#${input.task_id}** (comment #${comment.id})`;
    }
    default:
      throw new Error(`Unknown action: ${pa.action as string}`);
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof NotLinkedError) return 'You are not linked. Run `/link`.';
  if (err instanceof LinkExpiredError) return 'Your link expired. Run `/link` to reconnect.';
  if (err instanceof ContinuumApiError) {
    if (err.status === 403) return "You don't have permission to do that.";
    if (err.status === 404) return 'Not found.';
    if (err.status === 422) return `Validation error: ${err.body.slice(0, 200)}`;
    return `Continuum API error (${err.status}).`;
  }
  return 'Something went wrong.';
}
