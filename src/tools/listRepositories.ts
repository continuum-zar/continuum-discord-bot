import { continuumClient } from '../api/continuumClient.js';
import type { Repository } from '../api/types.js';

export async function listRepositories(
  discordUserId: string,
  projectId: number,
): Promise<Repository[]> {
  return continuumClient.get<Repository[]>(
    discordUserId,
    `/projects/${projectId}/repositories`,
  );
}
