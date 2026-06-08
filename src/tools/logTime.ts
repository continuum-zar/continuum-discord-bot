import { continuumClient } from '../api/continuumClient.js';
import type { LoggedHour, LoggedHourCreateInput } from '../api/types.js';

export async function executeLogTime(
  discordUserId: string,
  input: LoggedHourCreateInput,
): Promise<LoggedHour> {
  return continuumClient.post<LoggedHour>(discordUserId, '/logged-hours/', input);
}

/**
 * Normalize an ISO date string (YYYY-MM-DD or full datetime) to the noon-UTC
 * ISO timestamp the backend expects, avoiding timezone day-roll surprises.
 */
export function normalizeLoggedHourDate(input: string | undefined): string {
  if (!input) {
    const today = new Date().toISOString().slice(0, 10);
    return `${today}T12:00:00Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return `${input}T12:00:00Z`;
  return input;
}
