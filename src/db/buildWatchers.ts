import { query } from './pool.js';
import type { AgentRunMode } from '../api/types.js';

export interface BuildWatcher {
  run_id: string;
  task_id: number;
  discord_user_id: string;
  channel_id: string;
  message_id: string | null;
  mode: AgentRunMode;
  poll_failures: number;
  created_at: Date;
  last_polled_at: Date | null;
}

export async function createWatcher(input: {
  runId: string;
  taskId: number;
  discordUserId: string;
  channelId: string;
  messageId: string | null;
  mode: AgentRunMode;
}): Promise<void> {
  await query(
    `INSERT INTO build_watchers (run_id, task_id, discord_user_id, channel_id, message_id, mode)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (run_id) DO NOTHING`,
    [
      input.runId,
      input.taskId,
      input.discordUserId,
      input.channelId,
      input.messageId,
      input.mode,
    ],
  );
}

export async function listActiveWatchers(): Promise<BuildWatcher[]> {
  const res = await query<BuildWatcher>(
    `SELECT run_id, task_id, discord_user_id, channel_id, message_id, mode,
            poll_failures, created_at, last_polled_at
       FROM build_watchers
       ORDER BY last_polled_at NULLS FIRST, created_at ASC`,
  );
  return res.rows;
}

export async function listWatchersForUser(discordUserId: string): Promise<BuildWatcher[]> {
  const res = await query<BuildWatcher>(
    `SELECT run_id, task_id, discord_user_id, channel_id, message_id, mode,
            poll_failures, created_at, last_polled_at
       FROM build_watchers
       WHERE discord_user_id = $1
       ORDER BY created_at DESC`,
    [discordUserId],
  );
  return res.rows;
}

export async function markPolled(runId: string): Promise<void> {
  await query(
    `UPDATE build_watchers
        SET last_polled_at = NOW(), poll_failures = 0
      WHERE run_id = $1`,
    [runId],
  );
}

export async function incrementFailures(runId: string): Promise<number> {
  const res = await query<{ poll_failures: number }>(
    `UPDATE build_watchers
        SET last_polled_at = NOW(), poll_failures = poll_failures + 1
      WHERE run_id = $1
      RETURNING poll_failures`,
    [runId],
  );
  return res.rows[0]?.poll_failures ?? 0;
}

export async function deleteWatcher(runId: string): Promise<void> {
  await query('DELETE FROM build_watchers WHERE run_id = $1', [runId]);
}
