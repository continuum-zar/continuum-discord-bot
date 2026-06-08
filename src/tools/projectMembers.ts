import { continuumClient } from '../api/continuumClient.js';
import type { ProjectMember, ProjectMemberRole } from '../api/types.js';

export async function listProjectMembers(
  discordUserId: string,
  projectId: number,
): Promise<ProjectMember[]> {
  return continuumClient.get<ProjectMember[]>(
    discordUserId,
    `/projects/${projectId}/members`,
  );
}

export async function executeInviteMember(
  discordUserId: string,
  projectId: number,
  input: { email: string; role: ProjectMemberRole },
): Promise<unknown> {
  return continuumClient.post<unknown>(
    discordUserId,
    `/projects/${projectId}/members`,
    input,
  );
}

export async function executeRemoveMember(
  discordUserId: string,
  projectId: number,
  userId: number,
): Promise<void> {
  await continuumClient.delete<void>(
    discordUserId,
    `/projects/${projectId}/members/${userId}`,
  );
}

export function memberDisplayName(m: ProjectMember): string {
  return (
    m.user?.display_name?.trim() ||
    m.user?.username?.trim() ||
    m.user?.email?.trim() ||
    `user #${m.user_id}`
  );
}
