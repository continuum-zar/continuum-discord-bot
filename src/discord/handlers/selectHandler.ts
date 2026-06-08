import {
  ActionRowBuilder,
  ButtonBuilder,
  Events,
  MessageFlags,
  StringSelectMenuBuilder,
  type Client,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from '../../logger.js';
import {
  getPendingAction,
  updatePayload,
  type PendingAction,
} from '../../db/pendingActions.js';
import { listMilestones } from '../../tools/listMilestones.js';
import { listProjectMembers, memberDisplayName } from '../../tools/projectMembers.js';
import {
  buildCreateTaskPreview,
  buildDraftTaskPreview,
  buildLinkTaskMilestonePreview,
  buildAssignTaskPreview,
  buildInviteMemberPreview,
  type DraftTaskPayload,
  type LinkTaskMilestonePayload,
  type AssignTaskPayload,
  type InviteMemberPayload,
  type PickerKind,
} from '../../agent/tools.js';
import type { CreateTaskInput, ProjectMember } from '../../api/types.js';
import { buildCustomIds } from './buttonHandler.js';
import {
  ASSIGNEE_SELECT_PREFIX,
  buildConfirmButtons,
  buildConfirmEmbed,
  buildPickerRows,
  KANBAN_COLUMN_SELECT_PREFIX,
  MILESTONE_SELECT_PREFIX,
  NO_MILESTONE_VALUE,
  ROLE_SELECT_PREFIX,
  type SelectedPickerValues,
} from './uiHelpers.js';
import { getKanbanBoard } from '../../tools/getKanbanBoard.js';

const PREFIX_TO_KIND: Array<{ prefix: string; kind: PickerKind }> = [
  { prefix: MILESTONE_SELECT_PREFIX, kind: 'milestone' },
  { prefix: ASSIGNEE_SELECT_PREFIX, kind: 'assignee' },
  { prefix: ROLE_SELECT_PREFIX, kind: 'member_role' },
  { prefix: KANBAN_COLUMN_SELECT_PREFIX, kind: 'kanban_column' },
];

export function attachSelectHandler(client: Client): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (!PREFIX_TO_KIND.some((p) => interaction.customId.startsWith(p.prefix))) return;
    void handle(interaction);
  });
}

async function handle(interaction: StringSelectMenuInteraction): Promise<void> {
  const match = PREFIX_TO_KIND.find((p) => interaction.customId.startsWith(p.prefix));
  if (!match) return;
  const pendingId = interaction.customId.slice(match.prefix.length);
  const choice = interaction.values[0];

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

  let pickerSelected: SelectedPickerValues = {};
  let destructive = false;
  let projectId: number | undefined;

  switch (match.kind) {
    case 'milestone':
      pickerSelected = handleMilestonePick(pa, choice);
      projectId = milestonePickerProjectId(pa);
      break;
    case 'assignee':
      pickerSelected = handleAssigneePick(pa, choice);
      projectId = assigneePickerProjectId(pa);
      break;
    case 'member_role':
      pickerSelected = handleRolePick(pa, choice);
      projectId = rolePickerProjectId(pa);
      destructive = false;
      break;
    case 'kanban_column':
      pickerSelected = handleKanbanColumnPick(pa, choice);
      projectId = kanbanColumnPickerProjectId(pa);
      break;
  }

  if (pa.action === 'delete_task' || pa.action === 'delete_milestone' || pa.action === 'remove_member' || pa.action === 'decline_invitation') {
    destructive = true;
  }

  await updatePayload(pendingId, pa.payload);

  let newPreview: string;
  try {
    newPreview = await rebuildPreview(interaction.user.id, pa);
  } catch (err) {
    logger.warn({ err, action: pa.action }, 'failed to rebuild preview after pick');
    newPreview = '(updated)';
  }

  const ids = buildCustomIds(pendingId);
  const embed = buildConfirmEmbed(newPreview, { destructive });

  // Rebuild pickers so the chosen option stays highlighted; preserve any other pickers.
  let pickerRows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  const pickers = derivePickersForAction(pa, projectId);
  if (pickers.length > 0) {
    pickerRows = await buildPickerRows(interaction.user.id, pendingId, pickers, pickerSelected);
  }

  const buttonRow = buildConfirmButtons(ids, { destructive });

  const components: ActionRowBuilder<ButtonBuilder | StringSelectMenuBuilder>[] = [];
  for (const row of pickerRows) components.push(row);
  components.push(buttonRow);

  await interaction.editReply({ embeds: [embed], components });
}

function handleMilestonePick(pa: PendingAction, choice: string): SelectedPickerValues {
  const mutable = pa.payload as Record<string, unknown>;
  if (choice === NO_MILESTONE_VALUE) {
    if (pa.action === 'link_task_milestone') {
      mutable.milestone_id = null;
    } else {
      delete mutable.milestone_id;
    }
  } else {
    const id = Number.parseInt(choice, 10);
    if (Number.isFinite(id)) mutable.milestone_id = id;
  }
  return { milestone: choice };
}

function handleAssigneePick(pa: PendingAction, choice: string): SelectedPickerValues {
  const id = Number.parseInt(choice, 10);
  if (!Number.isFinite(id)) return { assignee: choice };
  const mutable = pa.payload as Record<string, unknown>;
  mutable.user_ids = [id];
  return { assignee: choice };
}

function handleRolePick(pa: PendingAction, choice: string): SelectedPickerValues {
  const mutable = pa.payload as Record<string, unknown>;
  const role = (['client', 'developer', 'project_manager'] as const).find((r) => r === choice);
  if (role) mutable.role = role;
  return { member_role: choice };
}

function handleKanbanColumnPick(pa: PendingAction, choice: string): SelectedPickerValues {
  const mutable = pa.payload as Record<string, unknown>;
  mutable.column_id = choice;
  delete mutable.status;
  return { kanban_column: choice };
}

function kanbanColumnPickerProjectId(pa: PendingAction): number | undefined {
  if (pa.action === 'set_task_status') {
    const p = pa.payload as { project_id?: number };
    return typeof p.project_id === 'number' ? p.project_id : undefined;
  }
  return undefined;
}

function milestonePickerProjectId(pa: PendingAction): number | undefined {
  if (pa.action === 'create_task') return (pa.payload as unknown as CreateTaskInput).project_id;
  if (pa.action === 'draft_task') return (pa.payload as unknown as DraftTaskPayload).project_id;
  if (pa.action === 'link_task_milestone') return (pa.payload as unknown as LinkTaskMilestonePayload).project_id;
  return undefined;
}

function assigneePickerProjectId(pa: PendingAction): number | undefined {
  if (pa.action === 'assign_task') return (pa.payload as unknown as AssignTaskPayload).project_id;
  return undefined;
}

function rolePickerProjectId(pa: PendingAction): number | undefined {
  if (pa.action === 'invite_member') return (pa.payload as unknown as InviteMemberPayload).project_id;
  return undefined;
}

function derivePickersForAction(
  pa: PendingAction,
  projectId: number | undefined,
): Array<{ kind: PickerKind; projectId?: number }> {
  if (projectId == null) return [];
  switch (pa.action) {
    case 'create_task':
    case 'draft_task':
    case 'link_task_milestone':
      return [{ kind: 'milestone', projectId }];
    case 'assign_task':
      return [{ kind: 'assignee', projectId }];
    case 'invite_member':
      return [{ kind: 'member_role', projectId }];
    case 'set_task_status':
      return [{ kind: 'kanban_column', projectId }];
    default:
      return [];
  }
}

async function rebuildPreview(discordUserId: string, pa: PendingAction): Promise<string> {
  switch (pa.action) {
    case 'create_task': {
      const payload = pa.payload as unknown as CreateTaskInput;
      const milestoneName = await lookupMilestoneName(discordUserId, payload.project_id, payload.milestone_id ?? null);
      return buildCreateTaskPreview(payload, milestoneName);
    }
    case 'draft_task': {
      const payload = pa.payload as unknown as DraftTaskPayload;
      const milestoneName = await lookupMilestoneName(discordUserId, payload.project_id, payload.milestone_id ?? null);
      return buildDraftTaskPreview(payload, milestoneName);
    }
    case 'link_task_milestone': {
      const payload = pa.payload as unknown as LinkTaskMilestonePayload;
      const milestoneName = await lookupMilestoneName(discordUserId, payload.project_id, payload.milestone_id ?? null);
      return buildLinkTaskMilestonePreview(payload, milestoneName);
    }
    case 'assign_task': {
      const payload = pa.payload as unknown as AssignTaskPayload;
      const name = await lookupAssigneeName(discordUserId, payload.project_id, payload.user_ids?.[0]);
      if (name) payload.assignee_name = name;
      return buildAssignTaskPreview(payload);
    }
    case 'invite_member': {
      const payload = pa.payload as unknown as InviteMemberPayload;
      // role is already in payload; preview reads it directly
      return buildInviteMemberPreview(payload);
    }
    case 'set_task_status': {
      const payload = pa.payload as unknown as {
        task_id: number;
        project_id?: number;
        status?: string;
        column_id?: string;
      };
      const target = payload.column_id ?? payload.status ?? '(none)';
      let label = target;
      if (payload.column_id && payload.project_id != null) {
        try {
          const columns = await getKanbanBoard(discordUserId, payload.project_id);
          const match = columns.find((c) => c.id === payload.column_id);
          if (match?.title) label = `${match.title} (${payload.column_id})`;
        } catch (err) {
          logger.warn({ err, payload }, 'kanban column lookup failed');
        }
      }
      return `**Set status** of task #${payload.task_id} → \`${label}\``;
    }
    default:
      return '(updated)';
  }
}

async function lookupMilestoneName(
  discordUserId: string,
  projectId: number,
  milestoneId: number | null | undefined,
): Promise<string | null> {
  if (milestoneId == null) return null;
  try {
    const milestones = await listMilestones(discordUserId, projectId);
    return milestones.find((m) => m.id === milestoneId)?.name ?? null;
  } catch (err) {
    logger.warn({ err, projectId, milestoneId }, 'milestone lookup failed');
    return null;
  }
}

async function lookupAssigneeName(
  discordUserId: string,
  projectId: number,
  userId: number | undefined,
): Promise<string | null> {
  if (userId == null) return null;
  try {
    const members = await listProjectMembers(discordUserId, projectId);
    const m = members.find((x: ProjectMember) => x.user_id === userId);
    return m ? memberDisplayName(m) : null;
  } catch (err) {
    logger.warn({ err, projectId, userId }, 'assignee lookup failed');
    return null;
  }
}

