import { query } from './pool.js';
import { decryptToken, encryptToken } from '../auth/tokenStore.js';

export interface UserLink {
  discord_user_id: string;
  continuum_user_id: string;
  continuum_username: string | null;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface UserLinkRow {
  discord_user_id: string;
  continuum_user_id: string;
  continuum_username: string | null;
  refresh_token_ciphertext: Buffer;
  refresh_token_iv: Buffer;
  refresh_token_tag: Buffer;
  access_token: string | null;
  access_token_expires_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

function fromRow(row: UserLinkRow): UserLink {
  return {
    discord_user_id: row.discord_user_id,
    continuum_user_id: row.continuum_user_id,
    continuum_username: row.continuum_username,
    refresh_token: decryptToken({
      ciphertext: row.refresh_token_ciphertext,
      iv: row.refresh_token_iv,
      tag: row.refresh_token_tag,
    }),
    access_token: row.access_token,
    access_token_expires_at: row.access_token_expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function getUserLink(discordUserId: string): Promise<UserLink | null> {
  const res = await query<UserLinkRow>(
    'SELECT * FROM user_links WHERE discord_user_id = $1',
    [discordUserId],
  );
  const row = res.rows[0];
  return row ? fromRow(row) : null;
}

export async function upsertUserLink(input: {
  discordUserId: string;
  continuumUserId: string;
  continuumUsername: string | null;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}): Promise<void> {
  const enc = encryptToken(input.refreshToken);
  await query(
    `INSERT INTO user_links (
       discord_user_id, continuum_user_id, continuum_username,
       refresh_token_ciphertext, refresh_token_iv, refresh_token_tag,
       access_token, access_token_expires_at, updated_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (discord_user_id) DO UPDATE SET
       continuum_user_id = EXCLUDED.continuum_user_id,
       continuum_username = EXCLUDED.continuum_username,
       refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
       refresh_token_iv = EXCLUDED.refresh_token_iv,
       refresh_token_tag = EXCLUDED.refresh_token_tag,
       access_token = EXCLUDED.access_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       updated_at = NOW()`,
    [
      input.discordUserId,
      input.continuumUserId,
      input.continuumUsername,
      enc.ciphertext,
      enc.iv,
      enc.tag,
      input.accessToken,
      input.accessTokenExpiresAt,
    ],
  );
}

export async function updateTokensForUser(input: {
  discordUserId: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: Date;
}): Promise<void> {
  const enc = encryptToken(input.refreshToken);
  await query(
    `UPDATE user_links SET
       refresh_token_ciphertext = $2,
       refresh_token_iv = $3,
       refresh_token_tag = $4,
       access_token = $5,
       access_token_expires_at = $6,
       updated_at = NOW()
     WHERE discord_user_id = $1`,
    [
      input.discordUserId,
      enc.ciphertext,
      enc.iv,
      enc.tag,
      input.accessToken,
      input.accessTokenExpiresAt,
    ],
  );
}

export async function deleteUserLink(discordUserId: string): Promise<boolean> {
  const res = await query('DELETE FROM user_links WHERE discord_user_id = $1', [discordUserId]);
  return (res.rowCount ?? 0) > 0;
}
