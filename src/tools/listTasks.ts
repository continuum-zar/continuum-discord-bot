import { continuumClient } from '../api/continuumClient.js';
import type { TaskSummary } from '../api/types.js';

export async function listTasks(
  discordUserId: string,
  opts: {
    project_id?: number;
    status?: 'todo' | 'in_progress' | 'done';
    assigned_to?: number;
    limit?: number;
  },
): Promise<TaskSummary[]> {
  const params = new URLSearchParams();
  if (opts.project_id !== undefined) params.set('project_id', String(opts.project_id));
  if (opts.status) params.set('status', opts.status);
  if (opts.assigned_to !== undefined) params.set('assigned_to', String(opts.assigned_to));
  params.set('limit', String(opts.limit ?? 50));
  return continuumClient.get<TaskSummary[]>(discordUserId, `/tasks/?${params}`);
}
