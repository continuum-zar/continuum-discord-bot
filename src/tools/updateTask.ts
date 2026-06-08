import { continuumClient } from '../api/continuumClient.js';
import type { TaskSummary, TaskUpdateInput } from '../api/types.js';

export async function executeUpdateTask(
  discordUserId: string,
  input: { task_id: number; updates: TaskUpdateInput },
): Promise<TaskSummary> {
  return continuumClient.put<TaskSummary>(
    discordUserId,
    `/tasks/${input.task_id}`,
    input.updates,
  );
}

export async function executeDeleteTask(
  discordUserId: string,
  taskId: number,
): Promise<void> {
  await continuumClient.delete<void>(discordUserId, `/tasks/${taskId}`);
}
