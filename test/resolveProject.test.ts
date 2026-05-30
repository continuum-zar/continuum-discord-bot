import { describe, expect, it, vi, beforeEach } from 'vitest';

process.env.DISCORD_BOT_TOKEN ??= 'test';
process.env.DISCORD_APPLICATION_ID ??= 'test';
process.env.CONTINUUM_API_BASE_URL ??= 'http://localhost:8001/api/v1';
process.env.CONTINUUM_OAUTH_ISSUER_URL ??= 'http://localhost:8001';
process.env.CONTINUUM_OAUTH_REDIRECT_URI ??= 'http://localhost:3000/oauth/callback';
process.env.BOT_PUBLIC_URL ??= 'http://localhost:3000';
process.env.TOKEN_ENCRYPTION_KEY ??= '0'.repeat(64);
process.env.BOT_STATE_SIGNING_KEY ??= 'test-key-must-be-at-least-thirty-two-chars-long';
process.env.DATABASE_URL ??= 'postgres://localhost/test';
process.env.OPENAI_API_KEY ??= 'test';

vi.mock('../src/tools/listProjects.js', () => ({
  listProjects: vi.fn(),
  invalidateProjectsCache: vi.fn(),
}));

const { listProjects } = await import('../src/tools/listProjects.js');
const { resolveProject } = await import('../src/tools/resolveProject.js');

const sampleProjects = [
  { id: 1, name: 'Acme App', status: 'active', progress: 0.5, team_size: 4, last_active: '2026-05-01', member_role: 'developer', description: null, start_date: null, due_date: null, client_id: null },
  { id: 2, name: 'Acme Marketing', status: 'active', progress: 0.3, team_size: 2, last_active: '2026-05-01', member_role: 'developer', description: null, start_date: null, due_date: null, client_id: null },
  { id: 3, name: 'Internal Tools', status: 'active', progress: 0.7, team_size: 3, last_active: '2026-05-01', member_role: 'developer', description: null, start_date: null, due_date: null, client_id: null },
];

describe('resolveProject', () => {
  beforeEach(() => {
    vi.mocked(listProjects).mockResolvedValue(sampleProjects);
  });

  it('returns kind:one on exact match (case-insensitive)', async () => {
    const r = await resolveProject('u1', 'acme app');
    expect(r.kind).toBe('one');
    if (r.kind === 'one') expect(r.project.id).toBe(1);
  });

  it('returns kind:one on close single fuzzy match', async () => {
    const r = await resolveProject('u1', 'internal');
    expect(r.kind).toBe('one');
    if (r.kind === 'one') expect(r.project.id).toBe(3);
  });

  it('returns kind:many when ambiguous', async () => {
    const r = await resolveProject('u1', 'acme');
    expect(r.kind).toBe('many');
    if (r.kind === 'many') expect(r.projects.length).toBeGreaterThanOrEqual(2);
  });

  it('returns kind:none when no match', async () => {
    const r = await resolveProject('u1', 'completely unknown name xyz');
    expect(r.kind).toBe('none');
  });

  it('returns kind:none when there are zero projects', async () => {
    vi.mocked(listProjects).mockResolvedValueOnce([]);
    const r = await resolveProject('u1', 'anything');
    expect(r.kind).toBe('none');
  });
});
