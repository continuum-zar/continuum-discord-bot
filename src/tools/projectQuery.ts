import { continuumClient } from '../api/continuumClient.js';
import type { ProjectQueryResponse } from '../api/types.js';

interface CacheEntry {
  expiresAt: number;
  response: ProjectQueryResponse;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000;

function key(discordUserId: string, projectId: number, query: string): string {
  return `${discordUserId}:${projectId}:${query.trim().toLowerCase()}`;
}

export async function projectQuery(
  discordUserId: string,
  projectId: number,
  query: string,
): Promise<ProjectQueryResponse> {
  const k = key(discordUserId, projectId, query);
  const cached = cache.get(k);
  if (cached && cached.expiresAt > Date.now()) return cached.response;

  const response = await continuumClient.post<ProjectQueryResponse>(
    discordUserId,
    `/projects/${projectId}/query`,
    { query },
  );
  cache.set(k, { expiresAt: Date.now() + CACHE_TTL_MS, response });
  return response;
}
