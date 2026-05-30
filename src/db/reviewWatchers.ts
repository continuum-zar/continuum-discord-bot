import { query } from './pool.js';

export interface ReviewWatcher {
  review_id: string;
  build_run_id: string;
  task_id: number;
  discord_user_id: string;
  channel_id: string;
  message_id: string | null;
  poll_failures: number;
  created_at: Date;
  last_polled_at: Date | null;
}

export async function createReviewWatcher(input: {
  reviewId: string;
  buildRunId: string;
  taskId: number;
  discordUserId: string;
  channelId: string;
  messageId: string | null;
}): Promise<void> {
  await query(
    `INSERT INTO review_watchers (review_id, build_run_id, task_id, discord_user_id, channel_id, message_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (review_id) DO NOTHING`,
    [
      input.reviewId,
      input.buildRunId,
      input.taskId,
      input.discordUserId,
      input.channelId,
      input.messageId,
    ],
  );
}

export async function listActiveReviewWatchers(): Promise<ReviewWatcher[]> {
  const res = await query<ReviewWatcher>(
    `SELECT review_id, build_run_id, task_id, discord_user_id, channel_id, message_id,
            poll_failures, created_at, last_polled_at
       FROM review_watchers
       ORDER BY last_polled_at NULLS FIRST, created_at ASC`,
  );
  return res.rows;
}

export async function markReviewPolled(reviewId: string): Promise<void> {
  await query(
    `UPDATE review_watchers
        SET last_polled_at = NOW(), poll_failures = 0
      WHERE review_id = $1`,
    [reviewId],
  );
}

export async function incrementReviewFailures(reviewId: string): Promise<number> {
  const res = await query<{ poll_failures: number }>(
    `UPDATE review_watchers
        SET last_polled_at = NOW(), poll_failures = poll_failures + 1
      WHERE review_id = $1
      RETURNING poll_failures`,
    [reviewId],
  );
  return res.rows[0]?.poll_failures ?? 0;
}

export async function deleteReviewWatcher(reviewId: string): Promise<void> {
  await query('DELETE FROM review_watchers WHERE review_id = $1', [reviewId]);
}
