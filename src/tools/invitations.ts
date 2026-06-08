import { continuumClient } from '../api/continuumClient.js';
import type { PendingInvitation } from '../api/types.js';

export async function listPendingInvitations(discordUserId: string): Promise<PendingInvitation[]> {
  return continuumClient.get<PendingInvitation[]>(discordUserId, '/invitations/pending');
}

export async function executeAcceptInvitation(
  discordUserId: string,
  invitationId: number,
): Promise<void> {
  await continuumClient.post<void>(discordUserId, `/invitations/${invitationId}/accept`);
}

export async function executeDeclineInvitation(
  discordUserId: string,
  invitationId: number,
): Promise<void> {
  await continuumClient.post<void>(discordUserId, `/invitations/${invitationId}/decline`);
}
