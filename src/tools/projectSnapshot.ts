import { continuumClient } from '../api/continuumClient.js';
import type { ProjectSnapshot } from '../api/types.js';

export async function projectSnapshot(
  discordUserId: string,
  projectId: number,
): Promise<ProjectSnapshot> {
  return continuumClient.get<ProjectSnapshot>(
    discordUserId,
    `/projects/${projectId}/snapshot`,
  );
}
