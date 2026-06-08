import { describe, expect, it, vi } from 'vitest';

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

vi.mock('../src/tools/getTask.js', () => ({
  getTask: vi.fn(),
}));

const { getTask } = await import('../src/tools/getTask.js');
const { applyTaskProjectId, resolveProjectIdForTask } = await import(
  '../src/tools/resolveTaskProject.js'
);

describe('applyTaskProjectId', () => {
  it('overrides project_id while preserving other fields', () => {
    const input = {
      project_id: 99,
      task_id: 1361,
      description: 'work',
      hours: 1.5,
    };
    const out = applyTaskProjectId(input, 27);
    expect(out).toEqual({
      project_id: 27,
      task_id: 1361,
      description: 'work',
      hours: 1.5,
    });
    expect(input.project_id).toBe(99);
  });

  it('overrides even when no task_id is set on the payload', () => {
    const out = applyTaskProjectId({ project_id: 1 }, 42);
    expect(out.project_id).toBe(42);
  });
});

describe('resolveProjectIdForTask', () => {
  it('returns the task project_id from getTask', async () => {
    vi.mocked(getTask).mockResolvedValueOnce({
      id: 1361,
      project_id: 27,
      title: 't',
      description: null,
      checklists: [],
      branch: null,
      comments: [],
    });
    const projectId = await resolveProjectIdForTask('u1', 1361);
    expect(projectId).toBe(27);
    expect(getTask).toHaveBeenCalledWith('u1', 1361);
  });
});
