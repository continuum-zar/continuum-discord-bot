import { continuumClient } from '../api/continuumClient.js';
import type { MeUser } from '../api/types.js';

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { value: MeUser; expiresAt: number }>();

export async function getMe(discordUserId: string): Promise<MeUser> {
  const hit = cache.get(discordUserId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const me = await continuumClient.get<MeUser>(discordUserId, '/users/me');
  cache.set(discordUserId, { value: me, expiresAt: Date.now() + CACHE_TTL_MS });
  return me;
}

export function invalidateMe(discordUserId: string): void {
  cache.delete(discordUserId);
}
