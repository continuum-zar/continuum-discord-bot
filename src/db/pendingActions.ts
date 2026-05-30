import { randomUUID } from 'node:crypto';
import { query } from './pool.js';

export type PendingActionKind = 'create_task' | 'set_task_status' | 'add_comment';

export interface PendingAction {
  id: string;
  discord_user_id: string;
  action: PendingActionKind;
  payload: Record<string, unknown>;
  message_id: string | null;
  channel_id: string | null;
  created_at: Date;
  expires_at: Date;
}

const TTL_MS = 5 * 60 * 1000;

export async function createPendingAction(input: {
  discordUserId: string;
  action: PendingActionKind;
  payload: Record<string, unknown>;
}): Promise<PendingAction> {
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + TTL_MS);
  await query(
    `INSERT INTO pending_actions (id, discord_user_id, action, payload, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [id, input.discordUserId, input.action, input.payload, expiresAt],
  );
  return {
    id,
    discord_user_id: input.discordUserId,
    action: input.action,
    payload: input.payload,
    message_id: null,
    channel_id: null,
    created_at: new Date(),
    expires_at: expiresAt,
  };
}

export async function getPendingAction(id: string): Promise<PendingAction | null> {
  const res = await query<PendingAction>(
    `SELECT id, discord_user_id, action, payload, message_id, channel_id, created_at, expires_at
       FROM pending_actions WHERE id = $1`,
    [id],
  );
  const row = res.rows[0];
  if (!row) return null;
  if (row.expires_at.getTime() < Date.now()) {
    await deletePendingAction(id);
    return null;
  }
  return row;
}

export async function updatePayload(
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await query('UPDATE pending_actions SET payload = $2 WHERE id = $1', [id, payload]);
}

export async function attachMessage(id: string, messageId: string, channelId: string): Promise<void> {
  await query(
    'UPDATE pending_actions SET message_id = $2, channel_id = $3 WHERE id = $1',
    [id, messageId, channelId],
  );
}

export async function deletePendingAction(id: string): Promise<void> {
  await query('DELETE FROM pending_actions WHERE id = $1', [id]);
}

export async function cleanupExpired(): Promise<number> {
  const res = await query('DELETE FROM pending_actions WHERE expires_at < NOW()');
  return res.rowCount ?? 0;
}
