import { continuumClient } from '../api/continuumClient.js';
import type { TaskSummary } from '../api/types.js';

export async function executeSetTaskStatus(
  discordUserId: string,
  input:
    | { task_id: number; status: 'todo' | 'in_progress' | 'done'; column_id?: undefined }
    | { task_id: number; status?: undefined; column_id: string },
): Promise<TaskSummary> {
  const value = input.column_id ?? input.status;
  return continuumClient.patch<TaskSummary>(
    discordUserId,
    `/tasks/${input.task_id}/status`,
    { status: value },
  );
}
