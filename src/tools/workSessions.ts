import { continuumClient } from '../api/continuumClient.js';
import type { WorkSession } from '../api/types.js';

export async function getActiveSession(discordUserId: string): Promise<WorkSession | null> {
  return continuumClient.get<WorkSession | null>(discordUserId, '/work-sessions/active');
}

export async function executeStartWorkSession(
  discordUserId: string,
  input: { project_id: number; task_id?: number; note?: string },
): Promise<WorkSession> {
  return continuumClient.post<WorkSession>(discordUserId, '/work-sessions/', input);
}

export async function executePauseWorkSession(
  discordUserId: string,
  sessionId: number,
): Promise<WorkSession> {
  return continuumClient.post<WorkSession>(discordUserId, `/work-sessions/${sessionId}/pause`);
}

export async function executeResumeWorkSession(
  discordUserId: string,
  sessionId: number,
): Promise<WorkSession> {
  return continuumClient.post<WorkSession>(discordUserId, `/work-sessions/${sessionId}/resume`);
}

export async function executeStopWorkSession(
  discordUserId: string,
  sessionId: number,
  note?: string,
): Promise<WorkSession> {
  return continuumClient.post<WorkSession>(
    discordUserId,
    `/work-sessions/${sessionId}/stop`,
    note ? { note } : {},
  );
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
