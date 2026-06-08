import { continuumClient } from '../api/continuumClient.js';
import type { TaskSummary } from '../api/types.js';

export async function executeAssignTask(
  discordUserId: string,
  input: { task_id: number; user_ids: number[] },
): Promise<TaskSummary> {
  return continuumClient.patch<TaskSummary>(
    discordUserId,
    `/tasks/${input.task_id}/assign`,
    { user_ids: input.user_ids },
  );
}
