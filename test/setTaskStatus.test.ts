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

const patchMock = vi.fn();

vi.mock('../src/api/continuumClient.js', () => ({
  continuumClient: {
    patch: (...args: unknown[]) => patchMock(...args),
  },
}));

const { executeSetTaskStatus } = await import('../src/tools/setTaskStatus.js');

beforeEach(() => {
  patchMock.mockReset();
  patchMock.mockResolvedValue({ id: 42, status: 'qa_review', project_id: 7 });
});

describe('executeSetTaskStatus', () => {
  it('PATCHes column_id under the status field when column_id is provided', async () => {
    await executeSetTaskStatus('user-1', { task_id: 42, column_id: 'qa_review' });
    expect(patchMock).toHaveBeenCalledWith('user-1', '/tasks/42/status', {
      status: 'qa_review',
    });
  });

  it('PATCHes semantic status when status is provided', async () => {
    await executeSetTaskStatus('user-1', { task_id: 42, status: 'done' });
    expect(patchMock).toHaveBeenCalledWith('user-1', '/tasks/42/status', {
      status: 'done',
    });
  });

  it('column_id wins when both are present at runtime', async () => {
    // TS prevents this at compile time, but the executor must not double-send.
    await executeSetTaskStatus('user-1', {
      task_id: 42,
      column_id: 'qa_review',
    } as { task_id: number; column_id: string });
    expect(patchMock).toHaveBeenCalledWith('user-1', '/tasks/42/status', {
      status: 'qa_review',
    });
  });
});
