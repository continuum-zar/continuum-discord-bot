import { getTask } from './getTask.js';

export async function resolveProjectIdForTask(
  discordUserId: string,
  taskId: number,
): Promise<number> {
  const task = await getTask(discordUserId, taskId);
  return task.project_id;
}

export function applyTaskProjectId<T extends { project_id: number; task_id?: number }>(
  payload: T,
  resolvedProjectId: number,
): T {
  return { ...payload, project_id: resolvedProjectId };
}
