import { continuumClient } from '../api/continuumClient.js';
import type { TaskSummary } from '../api/types.js';

export async function executeLinkTaskMilestone(
  discordUserId: string,
  input: { task_id: number; milestone_id: number | null },
): Promise<TaskSummary> {
  return continuumClient.patch<TaskSummary>(
    discordUserId,
    `/tasks/${input.task_id}/milestone`,
    { milestone_id: input.milestone_id },
  );
}
