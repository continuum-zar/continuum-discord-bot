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

vi.mock('../src/api/continuumClient.js', () => ({
  continuumClient: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../src/tools/getTask.js', () => ({
  getTask: vi.fn(),
}));

const { continuumClient } = await import('../src/api/continuumClient.js');
const { getTask } = await import('../src/tools/getTask.js');
const { executeStartWorkSession } = await import('../src/tools/workSessions.js');

describe('executeStartWorkSession', () => {
  beforeEach(() => {
    vi.mocked(continuumClient.post).mockReset();
    vi.mocked(getTask).mockReset();
  });

  it('posts payload as-is when no task_id is provided', async () => {
    vi.mocked(continuumClient.post).mockResolvedValueOnce({});
    await executeStartWorkSession('u1', { project_id: 5, note: 'starting' });
    expect(getTask).not.toHaveBeenCalled();
    expect(continuumClient.post).toHaveBeenCalledWith('u1', '/work-sessions/', {
      project_id: 5,
      note: 'starting',
    });
  });

  it('overrides project_id with the task project when task_id is provided', async () => {
    vi.mocked(getTask).mockResolvedValueOnce({
      id: 1361,
      project_id: 27,
      title: 't',
      description: null,
      checklists: [],
      branch: null,
      comments: [],
    });
    vi.mocked(continuumClient.post).mockResolvedValueOnce({});
    await executeStartWorkSession('u1', { project_id: 99, task_id: 1361 });
    expect(getTask).toHaveBeenCalledWith('u1', 1361);
    expect(continuumClient.post).toHaveBeenCalledWith('u1', '/work-sessions/', {
      project_id: 27,
      task_id: 1361,
    });
  });
});
