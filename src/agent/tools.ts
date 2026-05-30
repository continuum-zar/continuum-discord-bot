import type { ChatCompletionTool } from 'openai/resources/chat/completions.js';
import { listProjects } from '../tools/listProjects.js';
import { listTasks } from '../tools/listTasks.js';
import { getTask } from '../tools/getTask.js';
import { projectSnapshot } from '../tools/projectSnapshot.js';
import { projectQuery } from '../tools/projectQuery.js';
import { resolveProject } from '../tools/resolveProject.js';
import { listMilestones } from '../tools/listMilestones.js';
import { createPendingAction } from '../db/pendingActions.js';
import type { CreateTaskInput } from '../api/types.js';

export interface ToolContext {
  discordUserId: string;
  /** When non-null, indicates the agent staged a pending action that needs UI confirmation. */
  stagedPendingAction: {
    id: string;
    action: string;
    preview: string;
    /** Present for create_task — used to render the milestone picker. */
    projectId?: number;
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
        description: 'List tasks, optionally filtered by project, status, or assignee.',
        parameters: {
          type: 'object',
          properties: {
            project_id: { type: 'number' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
            assigned_to: { type: 'number' },
            limit: { type: 'number', minimum: 1, maximum: 100 },
          },
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) =>
      listTasks(ctx.discordUserId, {
        project_id: optNum(args, 'project_id'),
        status: optStr(args, 'status') as 'todo' | 'in_progress' | 'done' | undefined,
        assigned_to: optNum(args, 'assigned_to'),
        limit: optNum(args, 'limit'),
      }),
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
        projectId: payload.project_id,
      };
      return { pending_action_id: pa.id, preview };
    },
  },

  set_task_status: {
    schema: {
      type: 'function',
      function: {
        name: 'set_task_status',
        description:
          'Stage a task status change. Does NOT execute — the user must tap Confirm.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'done'] },
          },
          required: ['task_id', 'status'],
          additionalProperties: false,
        },
      },
    },
    handler: async (args, ctx) => {
      const payload = {
        task_id: num(args, 'task_id'),
        status: str(args, 'status') as 'todo' | 'in_progress' | 'done',
      };
      const pa = await createPendingAction({
        discordUserId: ctx.discordUserId,
        action: 'set_task_status',
        payload,
      });
      const preview = `**Set status** of task #${payload.task_id} → \`${payload.status}\``;
      ctx.stagedPendingAction = { id: pa.id, action: 'set_task_status', preview };
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
};

export function allTools(): Record<string, ToolHandler> {
  return { ...readTools, ...writeTools };
}
