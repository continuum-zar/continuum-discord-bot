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
} from '../api/types.js';
import { generateDraftTasks } from '../tools/draftTasks.js';

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

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
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
        projectId,
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
};

export function allTools(): Record<string, ToolHandler> {
  return { ...readTools, ...writeTools };
}
