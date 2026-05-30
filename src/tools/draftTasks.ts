import { continuumClient } from '../api/continuumClient.js';
import type {
  ConfirmTasksResponse,
  GenerateTasksResponse,
  GeneratedTask,
  WikiConfirmTaskItem,
} from '../api/types.js';

export async function generateDraftTasks(
  discordUserId: string,
  projectId: number,
  prompt: string,
  maxTasks: number,
): Promise<GenerateTasksResponse> {
  return continuumClient.post<GenerateTasksResponse>(
    discordUserId,
    `/projects/${projectId}/wiki/generate`,
    { prompt, max_tasks: maxTasks },
  );
}

export function mapGeneratedToConfirm(
  task: GeneratedTask,
  projectId: number,
  milestoneId: number | null | undefined,
): WikiConfirmTaskItem {
  return {
    title: task.title,
    description: task.description ?? null,
    project_id: projectId,
    milestone_id: milestoneId ?? null,
    priority: task.priority ?? 'medium',
    estimated_hours: task.estimated_hours ?? null,
    scope_weight: task.scope_weight,
    status: 'todo',
    checklists:
      task.checklist && task.checklist.length > 0
        ? task.checklist.map((c) => ({ text: c.title, done: c.is_completed ?? false }))
        : null,
    labels: task.labels && task.labels.length > 0 ? task.labels : null,
  };
}

export async function confirmDraftedTasks(
  discordUserId: string,
  projectId: number,
  items: WikiConfirmTaskItem[],
): Promise<ConfirmTasksResponse> {
  return continuumClient.post<ConfirmTasksResponse>(
    discordUserId,
    `/projects/${projectId}/wiki/confirm`,
    { tasks: items },
  );
}
