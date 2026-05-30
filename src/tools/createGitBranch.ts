import { continuumClient } from '../api/continuumClient.js';
import type { CreateBranchInput, CreateBranchResponse } from '../api/types.js';

export async function executeCreateGitBranch(
  discordUserId: string,
  projectId: number,
  repositoryId: number,
  input: CreateBranchInput,
): Promise<CreateBranchResponse> {
  return continuumClient.post<CreateBranchResponse>(
    discordUserId,
    `/projects/${projectId}/repositories/${repositoryId}/branches`,
    input,
  );
}
