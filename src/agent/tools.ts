import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';
import { listProjects } from '../tools/listProjects.js';
import { listTasks } from '../tools/listTasks.js';
import { getTask } from '../tools/getTask.js';
import { projectSnapshot } from '../tools/projectSnapshot.js';
import { projectQuery } from '../tools/projectQuery.js';
import { resolveProject } from '../tools/resolveProject.js';
import { listMilestones } from '../tools/listMilestones.js';
import { listRepositories } from '../tools/listRepositories.js';
import { createPendingAction } from '../db/pendingActions.js';
import type {
  AgentRunMode,
  CreateTaskInput,
  GeneratedTask,
  LoggedHourCreateInput,
  ProjectMemberRole,
  TaskUpdateInput,
  WorkSession,
} from '../api/types.js';
import { generateDraftTasks } from '../tools/draftTasks.js';
import { listMyTasks } from '../tools/listMyTasks.js';
import { getTaskTimeline } from '../tools/getTaskTimeline.js';
import { listPendingInvitations } from '../tools/invitations.js';
import { getKanbanBoard } from '../tools/getKanbanBoard.js';
import {
  formatDuration,
  getActiveSession,
} from '../tools/workSessions.js';
import { normalizeLoggedHourDate } from '../tools/logTime.js';
import { listProjectMembers, memberDisplayName } from '../tools/projectMembers.js';

export type PickerKind = 'milestone' | 'assignee' | 'member_role' | 'kanban_column';

export interface PickerSpec {
  kind: PickerKind;
  /** Project context for data loaders that need it (milestone/assignee). Required for those kinds. */
  projectId?: number;
  placeholder?: string;
}

export interface StagedPendingActionUi {
  /** Project context shared by pickers + previews. */
  projectId?: number;
  /** Selects to render alongside Confirm/Cancel. */
  pickers?: PickerSpec[];
  /** Destructive actions get a red Confirm button and a warning footer. */
  destructive?: boolean;
}

export interface ToolContext {
  discordUserId: string;
  /** When non-null, indicates the agent staged a pending action that needs UI confirmation. */
  stagedPendingAction: {
    id: string;
    action: string;
    preview: string;
    ui?: StagedPendingActionUi;
  } | null;
}

export interface ToolHandler {
  schema: ChatCompletionTool;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

function num(args: Record<string, unknown>, key: string): number {
  const v = args[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${key} must be a number`);
  return v;
}

function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== 'string' || v.length === 0) throw new Error(`${key} must be a non-empty string`);
  return v;
}

function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function optNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function sessionElapsedSeconds(session: WorkSession): number {
  if (typeof session.current_duration_seconds === 'number') {
    return session.current_duration_seconds;
  }
  if (session.status === 'active' && session.last_resumed_at) {
    const resumed = new Date(session.last_resumed_at).getTime();
    if (Number.isFinite(resumed)) {
      const extra = Math.max(0, Math.floor((Date.now() - resumed) / 1000));
      return (session.duration_seconds ?? 0) + extra;
    }
  }
  return session.duration_seconds ?? 0;
}

export interface DraftTaskPayload {
  project_id: number;
  prompt: string;
  tasks: GeneratedTask[];
  source_files_used: string[];
  confidence: number;
  milestone_id?: number | null;
}

export interface LinkBranchPayload {
  task_id: number;
  linked_repo: string;
  linked_branch: string;
  linked_branch_full_ref?: string;
}

export interface CreateAndLinkBranchPayload {
  task_id: number;
  project_id: number;
  repository_id: number;
  repository_name?: string;
  branch_name: string;
  from_ref?: string;
  linked_repo: string;
}

export interface AttachLinkPayload {
  task_id: number;
  name: string;
  url: string;
}

export interface StartBuildPayload {
  task_id: number;
  linked_repo: string;
  linked_branch: string;
  instructions?: string;
  mode?: AgentRunMode;
}

export interface StartReviewPayload {
  task_id: number;
  run_id: string;
}

export interface UpdateTaskPayload {
  task_id: number;
  updates: TaskUpdateInput;
}

export interface DeleteTaskPayload {
  task_id: number;
  title?: string;
}

export interface LinkTaskMilestonePayload {
  task_id: number;
  project_id: number;
  milestone_id?: number | null;
}

export interface LogTimePayload extends LoggedHourCreateInput {
  project_name?: string;
  task_title?: string;
}

export interface StartWorkSessionPayload {
  project_id: number;
  project_name?: string;
  task_id?: number;
  task_title?: string;
  note?: string;
}

export interface PauseWorkSessionPayload {
  session_id: number;
  project_id: number;
  project_name?: string;
}

export interface ResumeWorkSessionPayload {
  session_id: number;
  project_id: number;
  project_name?: string;
}

export interface StopWorkSessionPayload {
  session_id: number;
  project_id: number;
  project_name?: string;
  elapsed_seconds: number;
  note?: string;
}

export interface SubmitIssueReportPayload {
  message: string;
  contact_email?: string;
}

export interface InvitationPayload {
  invitation_id: number;
  project_id: number;
  project_name: string;
  role: string;
}

export interface AssignTaskPayload {
  task_id: number;
  project_id: number;
  user_ids?: number[];
  assignee_name?: string;
}

export interface CreateMilestonePayload {
  project_id: number;
  project_name?: string;
  name: string;
  due_date?: string;
  description?: string;
}

export interface UpdateMilestonePayload {
  milestone_id: number;
  milestone_name?: string;
  updates: { name?: string; due_date?: string; description?: string };
}

export interface DeleteMilestonePayload {
  milestone_id: number;
  milestone_name: string;
}

export interface InviteMemberPayload {
  project_id: number;
  project_name?: string;
  email: string;
  role?: ProjectMemberRole;
}

export interface RemoveMemberPayload {
  project_id: number;
  project_name?: string;
  user_id: number;
  member_name: string;
}

export function buildDraftTaskPreview(
  payload: DraftTaskPayload,
  milestoneName?: string | null,
): string {
  const t = payload.tasks[0];
  if (!t) {
    return `**AI assistant** couldn't draft a task for that prompt in project ${payload.project_id}.`;
  }
  const filesLine =
    payload.source_files_used.length > 0
      ? `\n• Repo context: ${payload.source_files_used.slice(0, 3).join(', ')}${
          payload.source_files_used.length > 3 ? ` +${payload.source_files_used.length - 3}` : ''
        }`
      : '';
  const relevantLine =
    t.relevant_files.length > 0
      ? `\n• Relevant files: ${t.relevant_files.slice(0, 3).join(', ')}${
          t.relevant_files.length > 3 ? ` +${t.relevant_files.length - 3}` : ''
        }`
      : '';
  const checklistLine =
    t.checklist && t.checklist.length > 0 ? `\n• Checklist: ${t.checklist.length} items` : '';
  const rationaleLine = t.rationale ? `\n• Why: ${truncate(t.rationale, 240)}` : '';
  const descLine = t.description ? `\n• Description: ${truncate(t.description, 240)}` : '';
  const labelsLine =
    t.labels && t.labels.length > 0 ? `\n• Labels: ${t.labels.join(', ')}` : '';
  const milestoneLine =
    payload.milestone_id != null
      ? `\n• Milestone: ${milestoneName ? `${milestoneName} (#${payload.milestone_id})` : `#${payload.milestone_id}`}`
      : '\n• Milestone: _(none — pick one from the dropdown below)_';
  const extraTasksLine =
    payload.tasks.length > 1
      ? `\n_+ ${payload.tasks.length - 1} more drafted task(s) — all will be created on Confirm._`
      : '';

  return (
    `**Draft task** (AI, repo-aware) in project ${payload.project_id}\n` +
    `• Title: ${t.title}\n` +
    `• Scope: ${t.scope_weight}` +
    (t.priority ? ` · priority: ${t.priority}` : '') +
    (t.estimated_hours != null ? ` · ~${t.estimated_hours}h` : '') +
    descLine +
    rationaleLine +
    relevantLine +
    checklistLine +
    labelsLine +
    filesLine +
    milestoneLine +
    extraTasksLine
  );
}

export function buildCreateTaskPreview(payload: CreateTaskInput, milestoneName?: string | null): string {
  const milestoneLine =
    payload.milestone_id != null
      ? `\n• Milestone: ${milestoneName ? `${milestoneName} (#${payload.milestone_id})` : `#${payload.milestone_id}`}`
      : '\n• Milestone: _(none — pick one from the dropdown below)_';
  return (
    `**Create task** in project ${payload.project_id}\n` +
    `• Title: ${payload.title}\n` +
    `• Scope: ${payload.scope_weight}` +
    (payload.description ? `\n• Description: ${payload.description}` : '') +
    (payload.due_date ? `\n• Due: ${payload.due_date}` : '') +
    milestoneLine
  );
}

export function buildUpdateTaskPreview(payload: UpdateTaskPayload): string {
  const lines = [`**Update task #${payload.task_id}**`];
  const u = payload.updates;
  if (u.title != null) lines.push(`• Title → ${u.title}`);
  if (u.description != null) lines.push(`• Description → ${truncate(u.description, 200)}`);
  if (u.due_date != null) lines.push(`• Due → ${u.due_date}`);
  if (u.scope_weight != null) lines.push(`• Scope → ${u.scope_weight}`);
  if (u.priority != null) lines.push(`• Priority → ${u.priority}`);
  if (u.estimated_hours != null) lines.push(`• Estimate → ${u.estimated_hours}h`);
  if (u.labels != null) lines.push(`• Labels → ${u.labels.length === 0 ? '(none)' : u.labels.join(', ')}`);
  return lines.join('\n');
}

export function buildDeleteTaskPreview(payload: DeleteTaskPayload): string {
  return (
    `**Delete task #${payload.task_id}**` +
    (payload.title ? `\n• Title: ${payload.title}` : '') +
    '\n_This is permanent._'
  );
}

export function buildLinkTaskMilestonePreview(
  payload: LinkTaskMilestonePayload,
  milestoneName?: string | null,
): string {
  const line =
    payload.milestone_id == null
      ? '_(pick a milestone from the dropdown — or pick No milestone to unlink)_'
      : milestoneName
        ? `${milestoneName} (#${payload.milestone_id})`
        : `#${payload.milestone_id}`;
  return `**Set milestone** for task #${payload.task_id}\n• Milestone: ${line}`;
}

export function buildLogTimePreview(payload: LogTimePayload): string {
  const project = payload.project_name ? `${payload.project_name} (#${payload.project_id})` : `project #${payload.project_id}`;
  const task = payload.task_id != null
    ? payload.task_title ? ` · task ${payload.task_title} (#${payload.task_id})` : ` · task #${payload.task_id}`
    : '';
  const hours = payload.hours != null
    ? `${payload.hours}h`
    : payload.duration_minutes != null
      ? `${payload.duration_minutes}min`
      : '(unspecified)';
  return (
    `**Log time** in ${project}${task}\n` +
    `• Hours: ${hours}\n` +
    `• Date: ${payload.date}\n` +
    `• Description: ${truncate(payload.description, 240)}`
  );
}

export function buildStartWorkSessionPreview(payload: StartWorkSessionPayload): string {
  const project = payload.project_name ?? `project #${payload.project_id}`;
  const task = payload.task_id != null
    ? payload.task_title ? `\n• Task: ${payload.task_title} (#${payload.task_id})` : `\n• Task: #${payload.task_id}`
    : '';
  return (
    `**Start work session** in ${project}${task}` +
    (payload.note ? `\n• Note: ${truncate(payload.note, 200)}` : '')
  );
}

export function buildPauseWorkSessionPreview(payload: PauseWorkSessionPayload): string {
  const project = payload.project_name ?? `project #${payload.project_id}`;
  return `**Pause work session** in ${project}`;
}

export function buildResumeWorkSessionPreview(payload: ResumeWorkSessionPayload): string {
  const project = payload.project_name ?? `project #${payload.project_id}`;
  return `**Resume work session** in ${project}`;
}

export function buildStopWorkSessionPreview(payload: StopWorkSessionPayload): string {
  const project = payload.project_name ?? `project #${payload.project_id}`;
  return (
    `**Stop work session** in ${project}\n` +
    `• Elapsed: ${formatDuration(payload.elapsed_seconds)}` +
    (payload.note ? `\n• Note: ${truncate(payload.note, 200)}` : '')
  );
}

export function buildSubmitIssueReportPreview(payload: SubmitIssueReportPayload): string {
  return (
    `**Submit issue report**\n` +
    `• Message: ${truncate(payload.message, 240)}` +
    (payload.contact_email ? `\n• Contact email: ${payload.contact_email}` : '')
  );
}

export function buildAcceptInvitationPreview(payload: InvitationPayload): string {
  return `**Accept invitation** to ${payload.project_name} (#${payload.project_id})\n• Role: ${payload.role}`;
}

export function buildDeclineInvitationPreview(payload: InvitationPayload): string {
  return `**Decline invitation** to ${payload.project_name} (#${payload.project_id})\n• Role: ${payload.role}`;
}

export function buildAssignTaskPreview(payload: AssignTaskPayload): string {
  const assignee = payload.assignee_name
    ? payload.assignee_name
    : payload.user_ids && payload.user_ids.length > 0
      ? `user #${payload.user_ids[0]}`
      : '_(pick from the dropdown)_';
  return `**Assign task #${payload.task_id}** to ${assignee}`;
}

export function buildCreateMilestonePreview(payload: CreateMilestonePayload): string {
  const project = payload.project_name ? `${payload.project_name} (#${payload.project_id})` : `project #${payload.project_id}`;
  return (
    `**Create milestone** in ${project}\n` +
    `• Name: ${payload.name}` +
    (payload.due_date ? `\n• Due: ${payload.due_date.slice(0, 10)}` : '') +
    (payload.description ? `\n• Description: ${truncate(payload.description, 240)}` : '')
  );
}

export function buildUpdateMilestonePreview(payload: UpdateMilestonePayload): string {
  const lines = [`**Update milestone #${payload.milestone_id}**` + (payload.milestone_name ? ` (${payload.milestone_name})` : '')];
  if (payload.updates.name != null) lines.push(`• Name → ${payload.updates.name}`);
  if (payload.updates.due_date != null) lines.push(`• Due → ${payload.updates.due_date.slice(0, 10)}`);
  if (payload.updates.description != null) lines.push(`• Description → ${truncate(payload.updates.description, 240)}`);
  return lines.join('\n');
}

export function buildDeleteMilestonePreview(payload: DeleteMilestonePayload): string {
  return `**Delete milestone #${payload.milestone_id}** (${payload.milestone_name})\n_This is permanent._`;
}

export function buildInviteMemberPreview(payload: InviteMemberPayload): string {
  const project = payload.project_name ? `${payload.project_name} (#${payload.project_id})` : `project #${payload.project_id}`;
  return (
    `**Invite member** to ${project}\n` +
    `• Email: ${payload.email}\n` +
    `• Role: ${payload.role ?? 'developer'} _(pick a different role from the dropdown if needed)_`
  );
}

export function buildRemoveMemberPreview(payload: RemoveMemberPayload): string {
  const project = payload.project_name ? `${payload.project_name} (#${payload.project_id})` : `project #${payload.project_id}`;
  return `**Remove ${payload.member_name}** from ${project}\n_This is permanent — the user loses access._`;
}

export const readTools: Record<string, ToolHandler> = {
  list_projects: {
    schema: {
      type: 'function',
      function: {
        name: 'list_projects',
        description: "List the user's Continuum projects.",
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const projects = await listProjects(ctx.discordUserId);
      return projects.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        progress: p.progress,
        team_size: p.team_size,
      }));
    },
  },

  resolve_project: {
    schema: {
      type: 'function',
      function: {
        name: 'resolve_project',
        description:
          'Resolve a project name (fuzzy match) to a project_id. Returns one of: ' +
          '{kind:"none"}, {kind:"one", project}, or {kind:"many", projects}. ' +
          'Always call this before other tools that need a project_id.',
        parameters: {
          type: 'object',
          properties: { query: { type: 'string', description: 'Project name as the user typed it' } },
          required: ['query'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => resolveProject(ctx.discordUserId, str(args, 'query')),
  },

  list_tasks: {
    schema: {
      type: 'function',
      function: {
        name: 'list_tasks',
        description:
          'List tasks, optionally filtered by project, semantic status, exact Kanban column, ' +
          'or assignee. Use column_id (requires project_id; mutually exclusive with status) to ' +
          'filter to a specific swimlane like "QA Review"; discover column ids with get_kanban_board.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            column_id: {
              type: 'string',
              description:
                'Exact Kanban column id for project_id (mutually exclusive with status).',
            },
            assigned_to: { type: 'number' },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const columnId = optStr(args, 'column_id');
      const status = optStr(args, 'status') as 'todo' | 'in_progress' | 'done' | undefined;
      if (columnId && status) {
        return { error: 'status and column_id are mutually exclusive — pass one or the other.' };
      }
      if (columnId && optNum(args, 'project_id') == null) {
        return { error: 'column_id requires project_id.' };
      }
      return listTasks(ctx.discordUserId, {
        project_id: optNum(args, 'project_id'),
        status,
        column_id: columnId,
        assigned_to: optNum(args, 'assigned_to'),
        limit: optNum(args, 'limit'),
      });
    },
  },

  get_kanban_board: {
    schema: {
      type: 'function',
      function: {
        name: 'get_kanban_board',
        description:
          'Fetch the Kanban swimlane layout for a project: ordered columns with id, title, kind ' +
          '(todo/in_progress/done). Call this before moving a task to a named custom column or ' +
          'filtering list_tasks by column_id, so you know the exact column id to use.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'number' } },
          required: ['project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const columns = await getKanbanBoard(ctx.discordUserId, num(args, 'project_id'));
      return columns.map((c) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        task_status: c.task_status,
      }));
    },
  },

  get_task: {
    schema: {
      type: 'function',
      function: {
        name: 'get_task',
        description: 'Fetch a single task with checklists, branch, and comments.',
        parameters: {
          type: 'object',
          properties: { task_id: { type: 'number' } },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => getTask(ctx.discordUserId, num(args, 'task_id')),
  },

  project_snapshot: {
    schema: {
      type: 'function',
      function: {
        name: 'project_snapshot',
        description: 'Get project stats, health score, and risks.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'number' } },
          required: ['project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => projectSnapshot(ctx.discordUserId, num(args, 'project_id')),
  },

  list_milestones: {
    schema: {
      type: 'function',
      function: {
        name: 'list_milestones',
        description:
          "List milestones for a project. Use this when the user wants to know what milestones exist, " +
          "or before staging a create_task if you want to mention specific milestone names. " +
          "Note: when create_task is staged, the user always sees a milestone dropdown in Discord, " +
          "so you do NOT need to ask the user which milestone in chat — they'll pick from the gauge.",
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'number' } },
          required: ['project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const milestones = await listMilestones(ctx.discordUserId, num(args, 'project_id'));
      return milestones.map((m) => ({
        id: m.id,
        name: m.name,
        status: m.status,
        due_date: m.due_date,
      }));
    },
  },

  list_repositories: {
    schema: {
      type: 'function',
      function: {
        name: 'list_repositories',
        description:
          'List Git repositories linked to a project. Use this before create_and_link_branch ' +
          'when the user references a repo by name and you need its id, or when the project may ' +
          'have multiple repos and you need to disambiguate. Returns id, name, provider, full_name.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'number' } },
          required: ['project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const repos = await listRepositories(ctx.discordUserId, num(args, 'project_id'));
      return repos.map((r) => ({
        id: r.id,
        name: r.name,
        provider: r.provider,
        full_name: r.full_name ?? null,
        default_branch: r.default_branch ?? null,
      }));
    },
  },

  project_query: {
    schema: {
      type: 'function',
      function: {
        name: 'project_query',
        description:
          'RAG question-answer over a project. Use for "what is blocked", "what was decided about X" type questions. Rate-limited (10/min).',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            query: { type: 'string' },
          },
          required: ['project_id', 'query'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) =>
      projectQuery(ctx.discordUserId, num(args, 'project_id'), str(args, 'query')),
  },

  list_my_tasks: {
    schema: {
      type: 'function',
      function: {
        name: 'list_my_tasks',
        description:
          'List tasks assigned to the linked user. Convenience wrapper around list_tasks with assigned_to=me. ' +
          'Optional filters: project_id, status, column_id (requires project_id; mutually exclusive ' +
          'with status), limit.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            column_id: {
              type: 'string',
              description:
                'Exact Kanban column id for project_id (mutually exclusive with status).',
            },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const columnId = optStr(args, 'column_id');
      const status = optStr(args, 'status') as 'todo' | 'in_progress' | 'done' | undefined;
      if (columnId && status) {
        return { error: 'status and column_id are mutually exclusive — pass one or the other.' };
      }
      if (columnId && optNum(args, 'project_id') == null) {
        return { error: 'column_id requires project_id.' };
      }
      return listMyTasks(ctx.discordUserId, {
        ...(optNum(args, 'project_id') != null ? { project_id: optNum(args, 'project_id')! } : {}),
        ...(status ? { status } : {}),
        ...(columnId ? { column_id: columnId } : {}),
        ...(optNum(args, 'limit') != null ? { limit: optNum(args, 'limit')! } : {}),
      });
    },
  },

  get_task_timeline: {
    schema: {
      type: 'function',
      function: {
        name: 'get_task_timeline',
        description:
          'Fetch the activity timeline for a task (status changes, comments, assignments, logged hours, commits) in chronological order.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            limit: { type: 'number', minimum: 1, maximum: 200 },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) =>
      getTaskTimeline(ctx.discordUserId, num(args, 'task_id'), {
        ...(optNum(args, 'limit') != null ? { limit: optNum(args, 'limit')! } : {}),
      }),
  },

  get_active_session: {
    schema: {
      type: 'function',
      function: {
        name: 'get_active_session',
        description:
          "Get the user's current active or paused work session, or null if none. Call this before staging pause/resume/stop.",
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => getActiveSession(ctx.discordUserId),
  },

  list_pending_invitations: {
    schema: {
      type: 'function',
      function: {
        name: 'list_pending_invitations',
        description:
          'List project invitations awaiting the linked user. Use this before staging accept_invitation / decline_invitation to confirm the invitation_id and project name.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => listPendingInvitations(ctx.discordUserId),
  },

  list_project_members: {
    schema: {
      type: 'function',
      function: {
        name: 'list_project_members',
        description:
          'List members of a project (id, user_id, role, display name/email). Use before staging assign_task or remove_member.',
        parameters: {
          type: 'object',
          properties: { project_id: { type: 'number' } },
          required: ['project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const members = await listProjectMembers(ctx.discordUserId, num(args, 'project_id'));
      return members.map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        display_name: memberDisplayName(m),
        email: m.user?.email ?? null,
      }));
    },
  },
};

export const writeTools: Record<string, ToolHandler> = {
  create_task: {
    schema: {
      type: 'function',
      function: {
        name: 'create_task',
        description:
          'Stage a new task for creation. Does NOT execute — the user must tap Confirm in Discord. ' +
          'Returns {pending_action_id, preview} that you should include in your reply.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            title: { type: 'string' },
            scope_weight: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
            description: { type: 'string' },
            due_date: { type: 'string', description: 'ISO 8601 date (YYYY-MM-DD)' },
            assigned_to: { type: 'number' },
            labels: { type: 'array', items: { type: 'string' } },
            milestone_id: {
              type: 'number',
              description:
                'Optional. Usually leave unset — the user picks the milestone from a dropdown in Discord after staging. ' +
                'Only pass this if the user explicitly named a specific milestone and you resolved it via list_milestones.',
            },
          },
          required: ['project_id', 'title', 'scope_weight'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: CreateTaskInput = {
        project_id: num(args, 'project_id'),
        title: str(args, 'title'),
        scope_weight: str(args, 'scope_weight') as 'XS' | 'S' | 'M' | 'L' | 'XL',
        ...(optStr(args, 'description') ? { description: optStr(args, 'description')! } : {}),
        ...(optStr(args, 'due_date') ? { due_date: optStr(args, 'due_date')! } : {}),
        ...(optNum(args, 'assigned_to') ? { assigned_to: optNum(args, 'assigned_to')! } : {}),
        ...(Array.isArray(args.labels) ? { labels: args.labels as string[] } : {}),
        ...(optNum(args, 'milestone_id') !== undefined
          ? { milestone_id: optNum(args, 'milestone_id')! }
          : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'create_task',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildCreateTaskPreview(payload);
      ctx.stagedPendingAction = {
        id: pa.id,
        action: 'create_task',
        preview,
        ui: {
          projectId: payload.project_id,
          pickers: [{ kind: 'milestone', projectId: payload.project_id }],
        },
      };
      return { pending_action_id: pa.id, preview };
    },
  },

  draft_task: {
    schema: {
      type: 'function',
      function: {
        name: 'draft_task',
        description:
          "Ask the repo-aware AI task assistant to DRAFT a task from a free-text prompt, using " +
          "the project's scanned Code Wiki (source files, design docs, etc.) as context. " +
          "Use this whenever the user wants the bot to flesh out a task (description, scope, " +
          "checklist, relevant files) rather than dictate one verbatim — e.g. 'draft a task to " +
          "wire up Stripe refunds', 'add a task for fixing the auth race condition'. " +
          "For terse one-liners where the user clearly already wrote the title themselves, " +
          "prefer create_task. Does NOT execute — returns a staged pending action that the user " +
          "confirms in Discord. The milestone picker appears automatically.",
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            prompt: {
              type: 'string',
              description:
                "What the task should be about, as a natural-language brief. Pass the user's " +
                'request through largely verbatim — the AI assistant will use repo context to ' +
                'expand it. Avoid pre-writing a title; let the assistant draft it.',
            },
            max_tasks: {
              type: 'number',
              description:
                'How many tasks to draft. Default 1 (single-task UX). Only raise this if the ' +
                "user explicitly asked for multiple tasks ('draft a few tasks for X'). Capped at 5.",
              minimum: 1,
              maximum: 5,
            },
          },
          required: ['project_id', 'prompt'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const projectId = num(args, 'project_id');
      const prompt = str(args, 'prompt');
      const maxRaw = optNum(args, 'max_tasks');
      const maxTasks = Math.max(1, Math.min(5, maxRaw ?? 1));

      const gen = await generateDraftTasks(ctx.discordUserId, projectId, prompt, maxTasks);

      if (!gen.tasks || gen.tasks.length === 0) {
        // The assistant returned a clarification or no-results reply.
        return {
          drafted: false,
          reply: gen.reply ?? null,
          confidence: gen.confidence,
        };
      }

      const payload: DraftTaskPayload = {
        project_id: projectId,
        prompt: gen.prompt,
        tasks: gen.tasks,
        source_files_used: gen.source_files_used,
        confidence: gen.confidence,
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'draft_task',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildDraftTaskPreview(payload);
      ctx.stagedPendingAction = {
        id: pa.id,
        action: 'draft_task',
        preview,
        ui: {
          projectId,
          pickers: [{ kind: 'milestone', projectId }],
        },
      };
      return {
        pending_action_id: pa.id,
        preview,
        drafted: true,
        task_count: gen.tasks.length,
        confidence: gen.confidence,
      };
    },
  },

  set_task_status: {
    schema: {
      type: 'function',
      function: {
        name: 'set_task_status',
        description:
          'Stage a task status / Kanban column change. Pass either `status` (todo/in_progress/done — ' +
          'semantic bucket; backend maps to the first column of that kind) or `column_id` (exact ' +
          'swimlane id from get_kanban_board). Prefer column_id when the user named a specific custom ' +
          'column like "QA Review". After staging, Discord shows a swimlane dropdown so the user can ' +
          'override before confirming. Does NOT execute — the user must tap Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            column_id: {
              type: 'string',
              description:
                'Exact Kanban column id for the task\'s project (mutually exclusive with status).',
            },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const taskId = num(args, 'task_id');
      const status = optStr(args, 'status') as 'todo' | 'in_progress' | 'done' | undefined;
      const columnId = optStr(args, 'column_id');
      if (!status && !columnId) {
        return { error: 'Pass either status (todo/in_progress/done) or column_id.' };
      }
      if (status && columnId) {
        return { error: 'status and column_id are mutually exclusive — pass one or the other.' };
      }
      const task = await getTask(ctx.discordUserId, taskId);
      const projectId = task.project_id;
      const payload: {
        task_id: number;
        project_id: number;
        status?: 'todo' | 'in_progress' | 'done';
        column_id?: string;
      } = { task_id: taskId, project_id: projectId };
      if (status) payload.status = status;
      if (columnId) payload.column_id = columnId;

      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'set_task_status',
        payload,
      });
      const target = columnId ?? status!;
      const preview = `**Set status** of task #${taskId} → \`${target}\``;
      ctx.stagedPendingAction = {
        id: pa.id,
        action: 'set_task_status',
        preview,
        ui: {
          projectId,
          pickers: [{ kind: 'kanban_column', projectId }],
        },
      };
      return { pending_action_id: pa.id, preview };
    },
  },

  add_comment: {
    schema: {
      type: 'function',
      function: {
        name: 'add_comment',
        description: 'Stage a comment for a task. Does NOT execute — user must tap Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            content: { type: 'string', minLength: 1, maxLength: 5000 },
          },
          required: ['task_id', 'content'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload = {
        task_id: num(args, 'task_id'),
        content: str(args, 'content'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'add_comment',
        payload,
      });
      const trimmed = payload.content.length > 200
        ? `${payload.content.slice(0, 200)}…`
        : payload.content;
      const preview = `**Add comment** to task #${payload.task_id}\n> ${trimmed}`;
      ctx.stagedPendingAction = { id: pa.id, action: 'add_comment', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  link_branch: {
    schema: {
      type: 'function',
      function: {
        name: 'link_branch',
        description:
          'Stage linking an EXISTING Git branch to a task. Use when the branch already exists ' +
          'on the remote. Does NOT execute — user must tap Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            linked_repo: {
              type: 'string',
              description: 'Repo identifier, e.g. "myorg/acme-app".',
            },
            linked_branch: { type: 'string', description: 'Branch name, e.g. "feature/foo".' },
          },
          required: ['task_id', 'linked_repo', 'linked_branch'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: LinkBranchPayload = {
        task_id: num(args, 'task_id'),
        linked_repo: str(args, 'linked_repo'),
        linked_branch: str(args, 'linked_branch'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'link_branch',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview =
        `**Link branch** to task #${payload.task_id}\n` +
        `• Repo: \`${payload.linked_repo}\`\n` +
        `• Branch: \`${payload.linked_branch}\``;
      ctx.stagedPendingAction = { id: pa.id, action: 'link_branch', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  create_and_link_branch: {
    schema: {
      type: 'function',
      function: {
        name: 'create_and_link_branch',
        description:
          'Stage CREATE a new Git branch on the remote AND link it to the task in one confirm. ' +
          'Use when the user wants a fresh branch for the task. If the project has multiple ' +
          'repos, call list_repositories first to resolve repository_id. Does NOT execute — ' +
          'user must tap Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            project_id: { type: 'number' },
            repository_id: { type: 'number' },
            repository_name: {
              type: 'string',
              description: 'Display name for the preview (e.g. "myorg/acme-app").',
            },
            branch_name: { type: 'string', description: 'New branch to create.' },
            from_ref: {
              type: 'string',
              description: 'Base branch or ref. Defaults to repo default (e.g. main) if omitted.',
            },
            linked_repo: {
              type: 'string',
              description:
                'Repo identifier stored on the task. Usually matches repository_name (e.g. "myorg/acme-app").',
            },
          },
          required: [
            'task_id',
            'project_id',
            'repository_id',
            'branch_name',
            'linked_repo',
          ],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: CreateAndLinkBranchPayload = {
        task_id: num(args, 'task_id'),
        project_id: num(args, 'project_id'),
        repository_id: num(args, 'repository_id'),
        branch_name: str(args, 'branch_name'),
        linked_repo: str(args, 'linked_repo'),
        ...(optStr(args, 'repository_name')
          ? { repository_name: optStr(args, 'repository_name')! }
          : {}),
        ...(optStr(args, 'from_ref') ? { from_ref: optStr(args, 'from_ref')! } : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'create_and_link_branch',
        payload: payload as unknown as Record<string, unknown>,
      });
      const repoLabel = payload.repository_name ?? payload.linked_repo;
      const preview =
        `**Create + link branch** for task #${payload.task_id}\n` +
        `• Repo: \`${repoLabel}\`\n` +
        `• New branch: \`${payload.branch_name}\`` +
        (payload.from_ref ? ` (from \`${payload.from_ref}\`)` : ' (from default)');
      ctx.stagedPendingAction = { id: pa.id, action: 'create_and_link_branch', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  attach_link: {
    schema: {
      type: 'function',
      function: {
        name: 'attach_link',
        description:
          'Stage attaching a URL (http/https only) to a task as a named link. Does NOT execute — ' +
          'user must tap Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            name: { type: 'string', minLength: 1, maxLength: 200 },
            url: { type: 'string', description: 'Must start with http:// or https://' },
          },
          required: ['task_id', 'name', 'url'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const url = str(args, 'url');
      if (!/^https?:\/\//i.test(url)) {
        return { error: 'URL must start with http:// or https://' };
      }
      const payload: AttachLinkPayload = {
        task_id: num(args, 'task_id'),
        name: str(args, 'name'),
        url,
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'attach_link',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview =
        `**Attach link** to task #${payload.task_id}\n` +
        `• Name: ${payload.name}\n` +
        `• URL: ${payload.url}`;
      ctx.stagedPendingAction = { id: pa.id, action: 'attach_link', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  stage_build: {
    schema: {
      type: 'function',
      function: {
        name: 'stage_build',
        description:
          'Stage a Continuum agent build for a task. The user picks mode (Open PR vs Direct push) ' +
          'via Discord buttons, then Confirms — only then does the build start. Prerequisites: ' +
          'task must have a linked branch matching (linked_repo, linked_branch); if not, link one ' +
          'first via link_branch / create_and_link_branch. If the task has multiple linked ' +
          "branches, disambiguate in chat before calling — don't guess. Does NOT include mode " +
          "(it's chosen via UI buttons after staging).",
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            linked_repo: { type: 'string' },
            linked_branch: { type: 'string' },
            instructions: {
              type: 'string',
              description:
                'Optional extra instructions for the build agent (e.g. acceptance criteria).',
              maxLength: 4000,
            },
          },
          required: ['task_id', 'linked_repo', 'linked_branch'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: StartBuildPayload = {
        task_id: num(args, 'task_id'),
        linked_repo: str(args, 'linked_repo'),
        linked_branch: str(args, 'linked_branch'),
        ...(optStr(args, 'instructions')
          ? { instructions: optStr(args, 'instructions')! }
          : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'start_build',
        payload: payload as unknown as Record<string, unknown>,
      });
      const instructionsLine = payload.instructions
        ? `\n• Instructions: ${truncate(payload.instructions, 240)}`
        : '';
      const preview =
        `**Build task #${payload.task_id}**\n` +
        `• Repo: \`${payload.linked_repo}\`\n` +
        `• Branch: \`${payload.linked_branch}\`` +
        instructionsLine +
        `\n\nChoose **Open PR** or **Direct push** below, then Confirm.`;
      ctx.stagedPendingAction = { id: pa.id, action: 'start_build', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  update_task: {
    schema: {
      type: 'function',
      function: {
        name: 'update_task',
        description:
          'Stage edits to a task (any project member). Use for editing title, description, due date, scope, priority, ' +
          'estimate, or labels. For status changes use set_task_status; for milestone use link_task_milestone; ' +
          'for assignment use assign_task; for branches use the branch tools. Does NOT execute — user must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            title: { type: 'string', minLength: 1, maxLength: 255 },
            description: { type: 'string', maxLength: 10000 },
            due_date: { type: 'string', description: 'ISO date (YYYY-MM-DD) or full datetime.' },
            scope_weight: { type: 'string', enum: ['XS', 'S', 'M', 'L', 'XL'] },
            priority: { type: 'string', enum: ['high', 'medium', 'low', 'info'] },
            estimated_hours: { type: 'number', minimum: 0 },
            labels: { type: 'array', items: { type: 'string' } },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const updates: TaskUpdateInput = {};
      if (optStr(args, 'title') != null) updates.title = optStr(args, 'title')!;
      if (optStr(args, 'description') != null) updates.description = optStr(args, 'description')!;
      if (optStr(args, 'due_date') != null) updates.due_date = optStr(args, 'due_date')!;
      const sw = optStr(args, 'scope_weight');
      if (sw != null) updates.scope_weight = sw as TaskUpdateInput['scope_weight'];
      const pr = optStr(args, 'priority');
      if (pr != null) updates.priority = pr as TaskUpdateInput['priority'];
      if (optNum(args, 'estimated_hours') != null) updates.estimated_hours = optNum(args, 'estimated_hours')!;
      if (Array.isArray(args.labels)) updates.labels = args.labels as string[];

      if (Object.keys(updates).length === 0) {
        return { error: 'No fields to update — pass at least one of title/description/due_date/scope_weight/priority/estimated_hours/labels.' };
      }

      const payload: UpdateTaskPayload = { task_id: num(args, 'task_id'), updates };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'update_task',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildUpdateTaskPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'update_task', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  delete_task: {
    schema: {
      type: 'function',
      function: {
        name: 'delete_task',
        description:
          'Stage permanent deletion of a task (any project member). Destructive. ' +
          'Pass the task title in `title` for a clearer preview. Does NOT execute — user must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            title: { type: 'string' },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: DeleteTaskPayload = {
        task_id: num(args, 'task_id'),
        ...(optStr(args, 'title') ? { title: optStr(args, 'title')! } : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'delete_task',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildDeleteTaskPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'delete_task', preview, ui: { destructive: true } };
      return { pending_action_id: pa.id, preview };
    },
  },

  link_task_milestone: {
    schema: {
      type: 'function',
      function: {
        name: 'link_task_milestone',
        description:
          'Stage linking/unlinking a task to a milestone. After staging, Discord shows a milestone dropdown ' +
          '(including "No milestone" to clear). The user picks then Confirms. Do NOT pass milestone_id ' +
          "yourself unless the user explicitly named one and you resolved it via list_milestones.",
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            project_id: { type: 'number', description: 'Project the task belongs to — needed to populate the picker.' },
          },
          required: ['task_id', 'project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: LinkTaskMilestonePayload = {
        task_id: num(args, 'task_id'),
        project_id: num(args, 'project_id'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'link_task_milestone',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildLinkTaskMilestonePreview(payload);
      ctx.stagedPendingAction = {
        id: pa.id,
        action: 'link_task_milestone',
        preview,
        ui: {
          projectId: payload.project_id,
          pickers: [{ kind: 'milestone', projectId: payload.project_id }],
        },
      };
      return { pending_action_id: pa.id, preview };
    },
  },

  log_time: {
    schema: {
      type: 'function',
      function: {
        name: 'log_time',
        description:
          'Stage a time-log entry (any project member). Pass `task_id` when logging against a task — the project is ' +
          'resolved from the task automatically, so `project_id` is optional in that case. Otherwise pass `project_id`. ' +
          'Requires description and one of `hours` or `duration_minutes`. Optional: date (defaults to today). User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number', description: 'Optional when task_id is provided; resolved from the task.' },
            project_name: { type: 'string', description: 'For preview only.' },
            task_id: { type: 'number' },
            task_title: { type: 'string', description: 'For preview only.' },
            hours: { type: 'number', minimum: 0.01, maximum: 24, description: 'Hours as a decimal (e.g. 1.5).' },
            duration_minutes: { type: 'number', minimum: 1, maximum: 1440 },
            description: { type: 'string', minLength: 1, maxLength: 1000 },
            date: { type: 'string', description: 'ISO date YYYY-MM-DD. Defaults to today.' },
          },
          required: ['description'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const hours = optNum(args, 'hours');
      const durationMinutes = optNum(args, 'duration_minutes');
      if (hours == null && durationMinutes == null) {
        return { error: 'Pass either hours or duration_minutes.' };
      }
      const taskId = optNum(args, 'task_id');
      let projectId = optNum(args, 'project_id');
      let taskTitle = optStr(args, 'task_title');
      if (taskId == null && projectId == null) {
        return { error: 'Pass project_id or task_id.' };
      }
      if (taskId != null) {
        const task = await getTask(ctx.discordUserId, taskId);
        projectId = task.project_id;
        if (!taskTitle) taskTitle = task.title;
      }
      const payload: LogTimePayload = {
        project_id: projectId!,
        ...(optStr(args, 'project_name') ? { project_name: optStr(args, 'project_name')! } : {}),
        ...(taskId != null ? { task_id: taskId } : {}),
        ...(taskTitle ? { task_title: taskTitle } : {}),
        ...(hours != null ? { hours } : {}),
        ...(durationMinutes != null ? { duration_minutes: durationMinutes } : {}),
        description: str(args, 'description'),
        date: normalizeLoggedHourDate(optStr(args, 'date')),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'log_time',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildLogTimePreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'log_time', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  start_work_session: {
    schema: {
      type: 'function',
      function: {
        name: 'start_work_session',
        description:
          'Stage starting a new work session (clocks the user in to a project, optionally a task). Pass `task_id` when ' +
          'starting on a task — the project is resolved from the task automatically, so `project_id` is optional in that case. ' +
          'Otherwise pass `project_id`. The user must Confirm. ' +
          'If they already have an active session, the API may reject — call get_active_session first if unsure.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number', description: 'Optional when task_id is provided; resolved from the task.' },
            project_name: { type: 'string', description: 'For preview only.' },
            task_id: { type: 'number' },
            task_title: { type: 'string', description: 'For preview only.' },
            note: { type: 'string', maxLength: 500 },
          },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const taskId = optNum(args, 'task_id');
      let projectId = optNum(args, 'project_id');
      let taskTitle = optStr(args, 'task_title');
      if (taskId == null && projectId == null) {
        return { error: 'Pass project_id or task_id.' };
      }
      if (taskId != null) {
        const task = await getTask(ctx.discordUserId, taskId);
        projectId = task.project_id;
        if (!taskTitle) taskTitle = task.title;
      }
      const payload: StartWorkSessionPayload = {
        project_id: projectId!,
        ...(optStr(args, 'project_name') ? { project_name: optStr(args, 'project_name')! } : {}),
        ...(taskId != null ? { task_id: taskId } : {}),
        ...(taskTitle ? { task_title: taskTitle } : {}),
        ...(optStr(args, 'note') ? { note: optStr(args, 'note')! } : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'start_work_session',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildStartWorkSessionPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'start_work_session', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  pause_work_session: {
    schema: {
      type: 'function',
      function: {
        name: 'pause_work_session',
        description:
          'Stage pausing the active work session. Internally calls GET /work-sessions/active to find the session id; ' +
          'if none, returns no_active_session=true. Does NOT execute — user must Confirm.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const session = await getActiveSession(ctx.discordUserId);
      if (!session) return { no_active_session: true };
      const payload: PauseWorkSessionPayload = {
        session_id: session.id,
        project_id: session.project_id,
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'pause_work_session',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildPauseWorkSessionPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'pause_work_session', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  resume_work_session: {
    schema: {
      type: 'function',
      function: {
        name: 'resume_work_session',
        description:
          'Stage resuming a paused work session. Internally calls GET /work-sessions/active to find the session id; ' +
          'if none, returns no_active_session=true. Does NOT execute — user must Confirm.',
        parameters: { type: 'object', properties: {}, additionalProperties: false },
      },
    },
    handler: async (_args, ctx) => {
      const session = await getActiveSession(ctx.discordUserId);
      if (!session) return { no_active_session: true };
      const payload: ResumeWorkSessionPayload = {
        session_id: session.id,
        project_id: session.project_id,
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'resume_work_session',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildResumeWorkSessionPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'resume_work_session', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  stop_work_session: {
    schema: {
      type: 'function',
      function: {
        name: 'stop_work_session',
        description:
          'Stage stopping the active work session (logs it as a LoggedHour). Optional note becomes the LoggedHour description. ' +
          'Internally calls GET /work-sessions/active to find the session id; if none, returns no_active_session=true. ' +
          'Does NOT execute — user must Confirm.',
        parameters: {
          type: 'object',
          properties: { note: { type: 'string', maxLength: 1000 } },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const session = await getActiveSession(ctx.discordUserId);
      if (!session) return { no_active_session: true };
      const elapsed = sessionElapsedSeconds(session);
      const payload: StopWorkSessionPayload = {
        session_id: session.id,
        project_id: session.project_id,
        elapsed_seconds: elapsed,
        ...(optStr(args, 'note') ? { note: optStr(args, 'note')! } : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'stop_work_session',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildStopWorkSessionPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'stop_work_session', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  submit_issue_report: {
    schema: {
      type: 'function',
      function: {
        name: 'submit_issue_report',
        description: "Stage submitting an issue/bug report to the Continuum team. User must Confirm.",
        parameters: {
          type: 'object',
          properties: {
            message: { type: 'string', minLength: 1, maxLength: 20000 },
            contact_email: { type: 'string', description: 'Optional email for follow-up.' },
          },
          required: ['message'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: SubmitIssueReportPayload = {
        message: str(args, 'message'),
        ...(optStr(args, 'contact_email') ? { contact_email: optStr(args, 'contact_email')! } : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'submit_issue_report',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildSubmitIssueReportPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'submit_issue_report', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  accept_invitation: {
    schema: {
      type: 'function',
      function: {
        name: 'accept_invitation',
        description:
          'Stage accepting a project invitation. Call list_pending_invitations first to find invitation_id and project name. User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            invitation_id: { type: 'number' },
            project_id: { type: 'number' },
            project_name: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['invitation_id', 'project_id', 'project_name', 'role'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: InvitationPayload = {
        invitation_id: num(args, 'invitation_id'),
        project_id: num(args, 'project_id'),
        project_name: str(args, 'project_name'),
        role: str(args, 'role'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'accept_invitation',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildAcceptInvitationPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'accept_invitation', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  decline_invitation: {
    schema: {
      type: 'function',
      function: {
        name: 'decline_invitation',
        description:
          'Stage declining a project invitation (destructive). Call list_pending_invitations first. User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            invitation_id: { type: 'number' },
            project_id: { type: 'number' },
            project_name: { type: 'string' },
            role: { type: 'string' },
          },
          required: ['invitation_id', 'project_id', 'project_name', 'role'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: InvitationPayload = {
        invitation_id: num(args, 'invitation_id'),
        project_id: num(args, 'project_id'),
        project_name: str(args, 'project_name'),
        role: str(args, 'role'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'decline_invitation',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildDeclineInvitationPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'decline_invitation', preview, ui: { destructive: true } };
      return { pending_action_id: pa.id, preview };
    },
  },

  assign_task: {
    schema: {
      type: 'function',
      function: {
        name: 'assign_task',
        description:
          'Stage assigning a task to a project member (PM/admin only). Discord shows an assignee dropdown populated ' +
          "from project members. Do NOT pass user_ids — the user picks. Stage with task_id and project_id. " +
          'User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            project_id: { type: 'number' },
          },
          required: ['task_id', 'project_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: AssignTaskPayload = {
        task_id: num(args, 'task_id'),
        project_id: num(args, 'project_id'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'assign_task',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildAssignTaskPreview(payload);
      ctx.stagedPendingAction = {
        id: pa.id,
        action: 'assign_task',
        preview,
        ui: {
          projectId: payload.project_id,
          pickers: [{ kind: 'assignee', projectId: payload.project_id }],
        },
      };
      return { pending_action_id: pa.id, preview };
    },
  },

  create_milestone: {
    schema: {
      type: 'function',
      function: {
        name: 'create_milestone',
        description:
          'Stage creating a new milestone in a project (PM/admin only). due_date must be today or in the future. User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            project_name: { type: 'string' },
            name: { type: 'string', minLength: 1, maxLength: 255 },
            due_date: { type: 'string', description: 'ISO date YYYY-MM-DD (or full datetime).' },
            description: { type: 'string', maxLength: 2000 },
          },
          required: ['project_id', 'name'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: CreateMilestonePayload = {
        project_id: num(args, 'project_id'),
        ...(optStr(args, 'project_name') ? { project_name: optStr(args, 'project_name')! } : {}),
        name: str(args, 'name'),
        ...(optStr(args, 'due_date') ? { due_date: optStr(args, 'due_date')! } : {}),
        ...(optStr(args, 'description') ? { description: optStr(args, 'description')! } : {}),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'create_milestone',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildCreateMilestonePreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'create_milestone', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  update_milestone: {
    schema: {
      type: 'function',
      function: {
        name: 'update_milestone',
        description:
          'Stage edits to a milestone (PM/admin only). Provide at least one of name/due_date/description. User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            milestone_id: { type: 'number' },
            milestone_name: { type: 'string', description: 'For preview only.' },
            name: { type: 'string', minLength: 1, maxLength: 255 },
            due_date: { type: 'string' },
            description: { type: 'string', maxLength: 2000 },
          },
          required: ['milestone_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const updates: UpdateMilestonePayload['updates'] = {};
      if (optStr(args, 'name') != null) updates.name = optStr(args, 'name')!;
      if (optStr(args, 'due_date') != null) updates.due_date = optStr(args, 'due_date')!;
      if (optStr(args, 'description') != null) updates.description = optStr(args, 'description')!;
      if (Object.keys(updates).length === 0) {
        return { error: 'No fields to update — pass at least one of name/due_date/description.' };
      }
      const payload: UpdateMilestonePayload = {
        milestone_id: num(args, 'milestone_id'),
        ...(optStr(args, 'milestone_name') ? { milestone_name: optStr(args, 'milestone_name')! } : {}),
        updates,
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'update_milestone',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildUpdateMilestonePreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'update_milestone', preview };
      return { pending_action_id: pa.id, preview };
    },
  },

  delete_milestone: {
    schema: {
      type: 'function',
      function: {
        name: 'delete_milestone',
        description: 'Stage permanent deletion of a milestone (PM/admin only). Destructive. User must Confirm.',
        parameters: {
          type: 'object',
          properties: {
            milestone_id: { type: 'number' },
            milestone_name: { type: 'string' },
          },
          required: ['milestone_id', 'milestone_name'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: DeleteMilestonePayload = {
        milestone_id: num(args, 'milestone_id'),
        milestone_name: str(args, 'milestone_name'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'delete_milestone',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildDeleteMilestonePreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'delete_milestone', preview, ui: { destructive: true } };
      return { pending_action_id: pa.id, preview };
    },
  },

  invite_member: {
    schema: {
      type: 'function',
      function: {
        name: 'invite_member',
        description:
          'Stage inviting a user to a project by email (PM/admin only). Role defaults to developer; Discord shows a role ' +
          'dropdown (client/developer/project_manager) so the user can change it before Confirming.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            project_name: { type: 'string' },
            email: { type: 'string', description: 'Invitee email address.' },
            role: { type: 'string', enum: ['client', 'developer', 'project_manager'] },
          },
          required: ['project_id', 'email'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const role = (optStr(args, 'role') as ProjectMemberRole | undefined) ?? 'developer';
      const payload: InviteMemberPayload = {
        project_id: num(args, 'project_id'),
        ...(optStr(args, 'project_name') ? { project_name: optStr(args, 'project_name')! } : {}),
        email: str(args, 'email'),
        role,
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'invite_member',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildInviteMemberPreview(payload);
      ctx.stagedPendingAction = {
        id: pa.id,
        action: 'invite_member',
        preview,
        ui: {
          projectId: payload.project_id,
          pickers: [{ kind: 'member_role', projectId: payload.project_id }],
        },
      };
      return { pending_action_id: pa.id, preview };
    },
  },

  remove_member: {
    schema: {
      type: 'function',
      function: {
        name: 'remove_member',
        description:
          'Stage removing a member from a project (PM/admin only). Destructive. ' +
          'Call list_project_members first to find user_id and display name.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            project_name: { type: 'string' },
            user_id: { type: 'number' },
            member_name: { type: 'string' },
          },
          required: ['project_id', 'user_id', 'member_name'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: RemoveMemberPayload = {
        project_id: num(args, 'project_id'),
        ...(optStr(args, 'project_name') ? { project_name: optStr(args, 'project_name')! } : {}),
        user_id: num(args, 'user_id'),
        member_name: str(args, 'member_name'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'remove_member',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview = buildRemoveMemberPreview(payload);
      ctx.stagedPendingAction = { id: pa.id, action: 'remove_member', preview, ui: { destructive: true } };
      return { pending_action_id: pa.id, preview };
    },
  },

  stage_review: {
    schema: {
      type: 'function',
      function: {
        name: 'stage_review',
        description:
          'Stage a Continuum automated review of a previous build run. The user ' +
          'Confirms via a Discord button, then a review starts that compares the ' +
          "build's diff against the task's requirements and posts a verdict. " +
          'Requires the build run_id; if the user just says "review the last build", ' +
          "ask them to specify the run_id or task — don't guess.",
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            run_id: {
              type: 'string',
              description: 'The agent build run ID (UUID) to review.',
            },
          },
          required: ['task_id', 'run_id'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload: StartReviewPayload = {
        task_id: num(args, 'task_id'),
        run_id: str(args, 'run_id'),
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'start_review',
        payload: payload as unknown as Record<string, unknown>,
      });
      const preview =
        `**Review build \`${payload.run_id.slice(0, 8)}\`** for task #${payload.task_id}\n` +
        `I'll compare the diff against the task's requirements and post a verdict ` +
        `(PR comment for Open-PR builds, task comment for Direct-push builds).`;
      ctx.stagedPendingAction = { id: pa.id, action: 'start_review', preview };
      return { pending_action_id: pa.id, preview };
    },
  },
};

export function allTools(): Record<string, ToolHandler> {
  return { ...readTools, ...writeTools };
}
