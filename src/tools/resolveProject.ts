import Fuse from 'fuse.js';
import { listProjects } from './listProjects.js';
import type { Project } from '../api/types.js';

export type ResolveResult =
  | { kind: 'none'; query: string }
  | { kind: 'one'; project: Project }
  | { kind: 'many'; projects: Project[]; query: string };

export async function resolveProject(
  discordUserId: string,
  query: string,
): Promise<ResolveResult> {
  const projects = await listProjects(discordUserId);
  if (!projects.length) return { kind: 'none', query };

  const exact = projects.find((p) => p.name.toLowerCase() === query.toLowerCase());
  if (exact) return { kind: 'one', project: exact };

  const fuse = new Fuse(projects, {
    keys: ['name'],
    threshold: 0.4,
    includeScore: true,
  });
  const matches = fuse.search(query).slice(0, 5);
  if (matches.length === 0) return { kind: 'none', query };
  if (matches.length === 1) return { kind: 'one', project: matches[0].item };
  // Strong-match short-circuit: top is excellent AND clearly beats runner-up.
  const top = matches[0].score;
  const second = matches[1].score;
  if (top !== undefined && second !== undefined && top < 0.05 && second - top > 0.15) {
    return { kind: 'one', project: matches[0].item };
  }
  return { kind: 'many', projects: matches.map((m) => m.item), query };
}
