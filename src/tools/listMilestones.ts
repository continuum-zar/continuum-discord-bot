import { continuumClient } from '../api/continuumClient.js';
import type { Milestone, MilestoneList } from '../api/types.js';

interface CacheEntry {
  expiresAt: number;
  milestones: Milestone[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function cacheKey(discordUserId: string, projectId: number): string {
  return `${discordUserId}:${projectId}`;
}

export async function listMilestones(
  discordUserId: string,
  projectId: number,
): Promise<Milestone[]> {
  const now = Date.now();
  const key = cacheKey(discordUserId, projectId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.milestones;

  const res = await continuumClient.get<MilestoneList>(
    discordUserId,
    `/milestones/?project_id=${projectId}&limit=200`,
  );
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, milestones: res.data });
  return res.data;
}

export function invalidateMilestonesCache(discordUserId: string, projectId: number): void {
  cache.delete(cacheKey(discordUserId, projectId));
}
