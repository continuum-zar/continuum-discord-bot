import { continuumClient } from '../api/continuumClient.js';
import type { BranchSummary } from '../api/types.js';

export async function listBranches(
  discordUserId: string,
  projectId: number,
  repositoryId: number,
): Promise<BranchSummary[]> {
  return continuumClient.get<BranchSummary[]>(
    discordUserId,
    `/projects/${projectId}/repositories/${repositoryId}/branches`,
  );
}
