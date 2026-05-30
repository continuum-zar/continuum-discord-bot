import { beforeAll, describe, expect, it } from 'vitest';

// Set required env BEFORE importing modules that touch config.
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

const { signState, verifyState, StateVerificationError } = await import('../src/auth/state.js');

describe('signState/verifyState', () => {
  it('round-trips a payload', async () => {
    const token = await signState({
      discord_user_id: '123',
      verifier: 'abc',
      nonce: 'nonce-1',
    });
    const out = await verifyState(token);
    expect(out.discord_user_id).toBe('123');
    expect(out.verifier).toBe('abc');
    expect(out.nonce).toBe('nonce-1');
  });

  it('rejects a tampered token', async () => {
    const token = await signState({
      discord_user_id: '123',
      verifier: 'abc',
      nonce: 'nonce-1',
    });
    const tampered = token.slice(0, -2) + (token.endsWith('A') ? 'B' : 'A');
    await expect(verifyState(tampered)).rejects.toBeInstanceOf(StateVerificationError);
  });

  it('rejects a totally invalid token', async () => {
    await expect(verifyState('not-a-jwt')).rejects.toBeInstanceOf(StateVerificationError);
  });
});

// Quiet unused import warning when running vitest --no-isolate
beforeAll(() => {});
