import { continuumClient } from '../api/continuumClient.js';
import type { IssueReport } from '../api/types.js';

export async function executeSubmitIssueReport(
  discordUserId: string,
  input: { message: string; contact_email?: string },
): Promise<IssueReport> {
  return continuumClient.post<IssueReport>(discordUserId, '/issue-reports/', input);
}
