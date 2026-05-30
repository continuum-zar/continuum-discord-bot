import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions.js';
import { query } from './pool.js';

const MAX_TURNS = 12; // ~6 user + 6 assistant

export async function appendHistory(
  discordUserId: string,
  message: ChatCompletionMessageParam,
): Promise<void> {
  await query(
    `INSERT INTO conversation_history (discord_user_id, role, content) VALUES ($1, $2, $3)`,
    [discordUserId, message.role, JSON.stringify(message)],
  );
}

export async function loadRecentHistory(
  discordUserId: string,
): Promise<ChatCompletionMessageParam[]> {
  const res = await query<{ content: ChatCompletionMessageParam }>(
    `SELECT content FROM conversation_history
       WHERE discord_user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
    [discordUserId, MAX_TURNS],
  );
  return res.rows.map((r) => r.content).reverse();
}

export async function clearHistory(discordUserId: string): Promise<void> {
  await query('DELETE FROM conversation_history WHERE discord_user_id = $1', [discordUserId]);
}

export async function trimOldHistory(): Promise<void> {
  await query(
    `DELETE FROM conversation_history WHERE id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (PARTITION BY discord_user_id ORDER BY created_at DESC) AS rn
           FROM conversation_history
       ) ranked WHERE rn > $1
     )`,
    [MAX_TURNS * 2],
  );
}
