import { continuumClient } from '../api/continuumClient.js';
import type { PaginatedResponse, Repository } from '../api/types.js';

export async function listRepositories(
  discordUserId: string,
  projectId: number,
): Promise<Repository[]> {
  const res = await continuumClient.get<Repository[] | PaginatedResponse<Repository>>(
    discordUserId,
    `/projects/${projectId}/repositories`,
  );
  if (Array.isArray(res)) return res;
  if (res && Array.isArray((res as PaginatedResponse<Repository>).data)) {
    return (res as PaginatedResponse<Repository>).data;
  }
  return [];
}
