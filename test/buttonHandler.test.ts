import { describe, expect, it } from 'vitest';

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

const { buildCustomIds } = await import('../src/discord/handlers/buttonHandler.js');

describe('buildCustomIds', () => {
  it('produces parseable confirm/cancel IDs', () => {
    const ids = buildCustomIds('abc-123');
    expect(ids.confirm).toBe('pa:confirm:abc-123');
    expect(ids.cancel).toBe('pa:cancel:abc-123');
  });

  it('round-trips the action ID via slice', () => {
    const ids = buildCustomIds('uuid-xyz');
    const slicedConfirm = ids.confirm.slice('pa:confirm:'.length);
    const slicedCancel = ids.cancel.slice('pa:cancel:'.length);
    expect(slicedConfirm).toBe('uuid-xyz');
    expect(slicedCancel).toBe('uuid-xyz');
  });
});
