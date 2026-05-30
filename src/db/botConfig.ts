import { query } from './pool.js';

export async function getBotConfig(key: string): Promise<string | null> {
  const res = await query<{ value: string }>('SELECT value FROM bot_config WHERE key = $1', [key]);
  return res.rows[0]?.value ?? null;
}

export async function setBotConfig(key: string, value: string): Promise<void> {
  await query(
    `INSERT INTO bot_config (key, value, updated_at) VALUES ($1, $2, NOW())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [key, value],
  );
}
