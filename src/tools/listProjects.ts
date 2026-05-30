import { continuumClient } from '../api/continuumClient.js';
import type { PaginatedResponse, Project } from '../api/types.js';

interface CacheEntry {
  expiresAt: number;
  projects: Project[];
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

export async function listProjects(discordUserId: string): Promise<Project[]> {
  const now = Date.now();
  const cached = cache.get(discordUserId);
  if (cached && cached.expiresAt > now) return cached.projects;

  const res = await continuumClient.get<PaginatedResponse<Project>>(
    discordUserId,
    '/projects/?limit=200',
  );
  cache.set(discordUserId, { expiresAt: now + CACHE_TTL_MS, projects: res.data });
  return res.data;
}

export function invalidateProjectsCache(discordUserId: string): void {
  cache.delete(discordUserId);
}
