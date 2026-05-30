import { continuumClient } from '../api/continuumClient.js';
import type { LinkBranchInput, TaskBranch } from '../api/types.js';

export async function executeLinkBranch(
  discordUserId: string,
  taskId: number,
  input: LinkBranchInput,
): Promise<TaskBranch> {
  return continuumClient.post<TaskBranch>(
    discordUserId,
    `/tasks/${taskId}/linked-branch`,
    input,
  );
}
