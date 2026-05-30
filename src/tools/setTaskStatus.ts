import { continuumClient } from '../api/continuumClient.js';
import type { TaskSummary } from '../api/types.js';

export async function executeSetTaskStatus(
  discordUserId: string,
  input: { task_id: number; status: 'todo' | 'in_progress' | 'done' },
): Promise<TaskSummary> {
  return continuumClient.patch<TaskSummary>(
    discordUserId,
    `/tasks/${input.task_id}/status`,
    { status: input.status },
  );
}
