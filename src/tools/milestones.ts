import { continuumClient } from '../api/continuumClient.js';
import type {
  Milestone,
  MilestoneCreateInput,
  MilestoneUpdateInput,
} from '../api/types.js';

export async function executeCreateMilestone(
  discordUserId: string,
  input: MilestoneCreateInput,
): Promise<Milestone> {
  return continuumClient.post<Milestone>(discordUserId, '/milestones/', input);
}

export async function executeUpdateMilestone(
  discordUserId: string,
  milestoneId: number,
  updates: MilestoneUpdateInput,
): Promise<Milestone> {
  return continuumClient.put<Milestone>(discordUserId, `/milestones/${milestoneId}`, updates);
}

export async function executeDeleteMilestone(
  discordUserId: string,
  milestoneId: number,
): Promise<void> {
  await continuumClient.delete<void>(discordUserId, `/milestones/${milestoneId}`);
}
