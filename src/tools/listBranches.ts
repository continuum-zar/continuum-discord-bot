import { continuumClient } from '../api/continuumClient.js';
import type { BranchSummary, PaginatedResponse } from '../api/types.js';

export async function listBranches(
  discordUserId: string,
  projectId: number,
  repositoryId: number,
): Promise<BranchSummary[]> {
  const res = await continuumClient.get<BranchSummary[] | PaginatedResponse<BranchSummary>>(
    discordUserId,
    `/projects/${projectId}/repositories/${repositoryId}/branches`,
  );
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as PaginatedResponse<BranchSummary>).data)) {
    return (res as PaginatedResponse<BranchSummary>).data;
  }
  return [];
}
