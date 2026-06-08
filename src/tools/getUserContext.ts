import { getMe } from './me.js';
import { listProjects } from './listProjects.js';
import type { GlobalRole, Project } from '../api/types.js';
import { logger } from '../logger.js';

export interface UserContextProjectRef {
  id: number;
  name: string;
  member_role: string | null;
}

export interface UserContext {
  user_id: number;
  display_name: string;
  global_role: GlobalRole;
  projects: UserContextProjectRef[];
  is_admin_or_pm: boolean;
}

const CACHE_TTL_MS = 2 * 60 * 1000;
const cache = new Map<string, { value: UserContext; expiresAt: number }>();

export async function getUserContext(discordUserId: string): Promise<UserContext> {
  const hit = cache.get(discordUserId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const [me, projects] = await Promise.all([
    getMe(discordUserId),
    safeListProjects(discordUserId),
  ]);

  const refs: UserContextProjectRef[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
    member_role: p.member_role,
  }));
  const isAdminOrPm =
    me.role === 'admin' ||
    me.role === 'project_manager' ||
    refs.some((r) => r.member_role === 'project_manager');

  const value: UserContext = {
    user_id: me.id,
    display_name: me.display_name || me.username || `user #${me.id}`,
    global_role: me.role,
    projects: refs,
    is_admin_or_pm: isAdminOrPm,
  };

  cache.set(discordUserId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

export function invalidateUserContext(discordUserId: string): void {
  cache.delete(discordUserId);
}

async function safeListProjects(discordUserId: string): Promise<Project[]> {
  try {
    return await listProjects(discordUserId);
  } catch (err) {
    logger.warn({ err }, 'failed to list projects for user context');
    return [];
  }
}
