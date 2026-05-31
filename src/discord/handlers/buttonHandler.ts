import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type Client,
  EmbedBuilder,
  Events,
  type Interaction,
  MessageFlags,
} from 'discord.js';
import { logger } from '../../logger.js';
import {
  deletePendingAction,
  getPendingAction,
  updatePayload,
  type PendingAction,
} from '../../db/pendingActions.js';
import { executeCreateTask } from '../../tools/createTask.js';
import { executeSetTaskStatus } from '../../tools/setTaskStatus.js';
import { executeAddComment } from '../../tools/addComment.js';
import { confirmDraftedTasks, mapGeneratedToConfirm } from '../../tools/draftTasks.js';
import { executeLinkBranch } from '../../tools/linkBranch.js';
import { executeAttachLink } from '../../tools/attachLink.js';
import { executeCreateGitBranch } from '../../tools/createGitBranch.js';
import { executeStartBuild, cancelAgentRun } from '../../tools/startBuild.js';
import { executeStartReview } from '../../tools/startReview.js';
import { createWatcher, deleteWatcher } from '../../db/buildWatchers.js';
import { createReviewWatcher } from '../../db/reviewWatchers.js';
import type {
  AgentRunMode,
  CreateTaskInput,
} from '../../api/types.js';
import type {
  AttachLinkPayload,
  CreateAndLinkBranchPayload,
  DraftTaskPayload,
  LinkBranchPayload,
  StartBuildPayload,
  StartReviewPayload,
} from '../../agent/tools.js';
import { ContinuumApiError } from '../../api/continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../../auth/tokenManager.js';

const CONFIRM_PREFIX = 'pa:confirm:';
const CANCEL_PREFIX = 'pa:cancel:';
const MODE_PREFIX = 'pa:mode:';
const CANCEL_BUILD_PREFIX = 'pa:cancelbuild:';
const REVIEW_PREFIX = 'pa:review:';
export const MILESTONE_SELECT_PREFIX = 'pa:milestone:';

export function buildReviewCustomId(taskId: number, runId: string): string {
  return `${REVIEW_PREFIX}${taskId}:${runId}`;
}

export function buildCustomIds(pendingActionId: string): {
  confirm: string;
  cancel: string;
  milestoneSelect: string;
  modeOpenPr: string;
  modeDirectPush: string;
} {
  return {
    confirm: `${CONFIRM_PREFIX}${pendingActionId}`,
    cancel: `${CANCEL_PREFIX}${pendingActionId}`,
    milestoneSelect: `${MILESTONE_SELECT_PREFIX}${pendingActionId}`,
    modeOpenPr: `${MODE_PREFIX}open_pr:${pendingActionId}`,
    modeDirectPush: `${MODE_PREFIX}direct_push:${pendingActionId}`,
  };
}

export function buildCancelRunCustomId(taskId: number, runId: string): string {
  return `${CANCEL_BUILD_PREFIX}${taskId}:${runId}`;
}

export function attachButtonHandler(client: Client): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isButton()) return;
    const id = interaction.customId;
    if (
      !id.startsWith(CONFIRM_PREFIX) &&
      !id.startsWith(CANCEL_PREFIX) &&
      !id.startsWith(MODE_PREFIX) &&
      !id.startsWith(CANCEL_BUILD_PREFIX) &&
      !id.startsWith(REVIEW_PREFIX)
    ) {
      return;
    }
    void handle(interaction);
  });
}

async function handle(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId;

  if (id.startsWith(CANCEL_BUILD_PREFIX)) {
    await handleCancelBuild(interaction);
    return;
  }

  if (id.startsWith(REVIEW_PREFIX)) {
    await handleStartReview(interaction);
    return;
  }

  if (id.startsWith(MODE_PREFIX)) {
    await handleModeSelect(interaction);
    return;
  }

  const isConfirm = id.startsWith(CONFIRM_PREFIX);
  const pendingId = id.slice((isConfirm ? CONFIRM_PREFIX : CANCEL_PREFIX).length);

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
      content: "That confirmation belongs to someone else.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (!isConfirm) {
    await deletePendingAction(pendingId);
    await interaction.editReply({ content: '❌ Cancelled.', components: [], embeds: [] });
    return;
  }

  if (pa.action === 'start_build') {
    const payload = pa.payload as unknown as StartBuildPayload;
    if (!payload.mode) {
      await interaction.followUp({
        content: 'Pick **Open PR** or **Direct push** first.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
  }

  try {
    const result = await executeAction(pa, interaction);
    await deletePendingAction(pendingId);
    await interaction.editReply({
      content: result.content,
      components: result.components ?? [],
      embeds: result.embeds ?? [],
    });
  } catch (err) {
    await deletePendingAction(pendingId);
    const msg = errorMessage(err);
    logger.error({ err, pendingId, action: pa.action }, 'pending action execution failed');
    await interaction.editReply({
      content: `⚠️ ${msg}`,
      components: [],
      embeds: [],
    });
  }
}

async function handleModeSelect(interaction: ButtonInteraction): Promise<void> {
  // pa:mode:open_pr:{id} or pa:mode:direct_push:{id}
  const rest = interaction.customId.slice(MODE_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return;
  const mode = rest.slice(0, sep) as AgentRunMode;
  const pendingId = rest.slice(sep + 1);

  if (mode !== 'open_pr' && mode !== 'direct_push') return;

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
      content: "That confirmation belongs to someone else.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (pa.action !== 'start_build') return;

  const payload = pa.payload as unknown as StartBuildPayload;
  payload.mode = mode;
  await updatePayload(pendingId, payload as unknown as Record<string, unknown>);

  const ids = buildCustomIds(pendingId);
  const modeLabel = mode === 'open_pr' ? 'Open PR' : 'Direct push';
  const embed = new EmbedBuilder()
    .setTitle('Confirm build')
    .setDescription(
      `**Build task #${payload.task_id}**\n` +
        `• Repo: \`${payload.linked_repo}\`\n` +
        `• Branch: \`${payload.linked_branch}\`\n` +
        `• Mode: **${modeLabel}**` +
        (payload.instructions ? `\n• Instructions: ${truncate(payload.instructions, 240)}` : ''),
    )
    .setFooter({ text: 'Expires in 5 minutes' });

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ids.confirm).setLabel('Confirm').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(ids.cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );

  await interaction.editReply({ embeds: [embed], components: [buttons] });
}

async function handleStartReview(interaction: ButtonInteraction): Promise<void> {
  const rest = interaction.customId.slice(REVIEW_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return;
  const taskId = Number.parseInt(rest.slice(0, sep), 10);
  const runId = rest.slice(sep + 1);
  if (!Number.isFinite(taskId) || !runId) return;

  await interaction.deferUpdate();

  try {
    const review = await executeStartReview(interaction.user.id, taskId, runId);
    await createReviewWatcher({
      reviewId: review.id,
      buildRunId: runId,
      taskId,
      discordUserId: interaction.user.id,
      channelId: interaction.channelId ?? '',
      messageId: interaction.message?.id ?? null,
    });
    await interaction.editReply({
      content: `🔎 Review started for build \`${runId.slice(0, 8)}\` (task #${taskId}). I'll DM you the verdict.`,
      components: [],
      embeds: [],
    });
  } catch (err) {
    const msg = errorMessage(err);
    logger.warn({ err, taskId, runId }, 'start review failed');
    await interaction.followUp({
      content: `Couldn't start review: ${msg}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

async function handleCancelBuild(interaction: ButtonInteraction): Promise<void> {
  const rest = interaction.customId.slice(CANCEL_BUILD_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return;
  const taskId = Number.parseInt(rest.slice(0, sep), 10);
  const runId = rest.slice(sep + 1);
  if (!Number.isFinite(taskId) || !runId) return;

  await interaction.deferUpdate();

  try {
    await cancelAgentRun(interaction.user.id, taskId, runId);
    await deleteWatcher(runId);
    await interaction.editReply({
      content: `🛑 Cancelled build for task #${taskId}.`,
      components: [],
      embeds: [],
    });
  } catch (err) {
    const msg = errorMessage(err);
    logger.warn({ err, taskId, runId }, 'cancel build failed');
    await interaction.followUp({
      content: `Couldn't cancel: ${msg}`,
      flags: MessageFlags.Ephemeral,
    });
  }
}

interface ExecuteResult {
  content: string;
  components?: ActionRowBuilder<ButtonBuilder>[];
  embeds?: EmbedBuilder[];
}

async function executeAction(
  pa: PendingAction,
  interaction: ButtonInteraction,
): Promise<ExecuteResult> {
  switch (pa.action) {
    case 'create_task': {
      const input = pa.payload as unknown as CreateTaskInput;
      const task = await executeCreateTask(pa.discord_user_id, input);
      return { content: `✅ Created task **#${task.id}**: ${task.title}` };
    }
    case 'draft_task': {
      const payload = pa.payload as unknown as DraftTaskPayload;
      const items = payload.tasks.map((t) =>
        mapGeneratedToConfirm(t, payload.project_id, payload.milestone_id ?? null),
      );
      const res = await confirmDraftedTasks(pa.discord_user_id, payload.project_id, items);
      if (res.created_count === 1 && res.task_ids[0] != null) {
        return { content: `✅ Created task **#${res.task_ids[0]}**: ${items[0].title}` };
      }
      return {
        content: `✅ Created ${res.created_count} task(s): ${res.task_ids
          .map((id) => `#${id}`)
          .join(', ')}`,
      };
    }
    case 'set_task_status': {
      const input = pa.payload as { task_id: number; status: 'todo' | 'in_progress' | 'done' };
      const task = await executeSetTaskStatus(pa.discord_user_id, input);
      return { content: `✅ Task **#${task.id}** → \`${task.status}\`` };
    }
    case 'add_comment': {
      const input = pa.payload as { task_id: number; content: string };
      const comment = await executeAddComment(pa.discord_user_id, input);
      return {
        content: `✅ Comment added to task **#${input.task_id}** (comment #${comment.id})`,
      };
    }
    case 'link_branch': {
      const payload = pa.payload as unknown as LinkBranchPayload;
      await executeLinkBranch(pa.discord_user_id, payload.task_id, {
        linked_repo: payload.linked_repo,
        linked_branch: payload.linked_branch,
        ...(payload.linked_branch_full_ref
          ? { linked_branch_full_ref: payload.linked_branch_full_ref }
          : {}),
      });
      return {
        content:
          `✅ Linked \`${payload.linked_repo}\` / \`${payload.linked_branch}\` to task **#${payload.task_id}**`,
      };
    }
    case 'create_and_link_branch': {
      const payload = pa.payload as unknown as CreateAndLinkBranchPayload;
      let branchCreatedNote = '';
      try {
        await executeCreateGitBranch(pa.discord_user_id, payload.project_id, payload.repository_id, {
          name: payload.branch_name,
          ...(payload.from_ref ? { from_ref: payload.from_ref } : {}),
        });
        branchCreatedNote = `🌱 Created branch \`${payload.branch_name}\``;
      } catch (err) {
        if (err instanceof ContinuumApiError && err.status === 409) {
          branchCreatedNote = `ℹ️ Branch \`${payload.branch_name}\` already existed — linking instead`;
        } else {
          throw err;
        }
      }
      await executeLinkBranch(pa.discord_user_id, payload.task_id, {
        linked_repo: payload.linked_repo,
        linked_branch: payload.branch_name,
      });
      return {
        content: `${branchCreatedNote}\n✅ Linked to task **#${payload.task_id}**`,
      };
    }
    case 'attach_link': {
      const payload = pa.payload as unknown as AttachLinkPayload;
      const att = await executeAttachLink(pa.discord_user_id, payload.task_id, {
        name: payload.name,
        url: payload.url,
      });
      return {
        content: `✅ Attached **${att.name}** to task **#${payload.task_id}**`,
      };
    }
    case 'start_build': {
      const payload = pa.payload as unknown as StartBuildPayload;
      if (!payload.mode) {
        throw new Error('Mode not selected');
      }
      const run = await executeStartBuild(pa.discord_user_id, payload.task_id, {
        linked_repo: payload.linked_repo,
        linked_branch: payload.linked_branch,
        mode: payload.mode,
        ...(payload.instructions ? { instructions: payload.instructions } : {}),
      });
      await createWatcher({
        runId: run.id,
        taskId: payload.task_id,
        discordUserId: pa.discord_user_id,
        channelId: interaction.channelId ?? '',
        messageId: interaction.message?.id ?? null,
        mode: payload.mode,
      });
      const modeLabel = payload.mode === 'open_pr' ? 'Open PR' : 'Direct push';
      const cancelRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(buildCancelRunCustomId(payload.task_id, run.id))
          .setLabel('Cancel build')
          .setStyle(ButtonStyle.Danger),
      );
      return {
        content:
          `🚀 Build started for task **#${payload.task_id}** (${modeLabel}) — run \`${run.id.slice(
            0,
            8,
          )}\`. I'll DM you when it finishes.`,
        components: [cancelRow],
      };
    }
    case 'start_review': {
      const payload = pa.payload as unknown as StartReviewPayload;
      const review = await executeStartReview(
        pa.discord_user_id,
        payload.task_id,
        payload.run_id,
      );
      await createReviewWatcher({
        reviewId: review.id,
        buildRunId: payload.run_id,
        taskId: payload.task_id,
        discordUserId: pa.discord_user_id,
        channelId: interaction.channelId ?? '',
        messageId: interaction.message?.id ?? null,
      });
      return {
        content:
          `🔎 Review started for build \`${payload.run_id.slice(0, 8)}\` ` +
          `(task **#${payload.task_id}**). I'll DM you the verdict.`,
      };
    }
    default:
      throw new Error(`Unknown action: ${pa.action as string}`);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function errorMessage(err: unknown): string {
  if (err instanceof NotLinkedError) return 'You are not linked. Run `/link`.';
  if (err instanceof LinkExpiredError) return 'Your link expired. Run `/link` to reconnect.';
  if (err instanceof ContinuumApiError) {
    if (err.status === 400) {
      const body = err.body.toLowerCase();
      if (body.includes('linked_branch') || body.includes('branch not linked')) {
        return 'That branch isn\'t linked to the task yet. Link it first, then build.';
      }
      return `Validation error: ${err.body.slice(0, 200)}`;
    }
    if (err.status === 403) {
      const body = err.body.toLowerCase();
      if (body.includes('repo') || body.includes('credential') || body.includes('token')) {
        return 'Git credentials missing for this repo — fix in Continuum project settings.';
      }
      return "You don't have permission to do that.";
    }
    if (err.status === 404) return 'Not found.';
    if (err.status === 409) {
      const body = err.body.toLowerCase();
      if (body.includes('already') && body.includes('exist')) {
        return 'Branch already exists on the remote.';
      }
      if (body.includes('active') || body.includes('running') || body.includes('queued')) {
        return 'A build is already running for this project. Wait for it or cancel it in Continuum.';
      }
      return `Conflict: ${err.body.slice(0, 200)}`;
    }
    if (err.status === 422) return `Validation error: ${err.body.slice(0, 200)}`;
    if (err.status === 429) return 'Rate limit hit — try again shortly.';
    if (err.status === 503) return 'Build queue unavailable — try again shortly.';
    return `Continuum API error (${err.status}).`;
  }
  return 'Something went wrong.';
}
