import { describe, expect, it } from 'vitest';

process.env.DISCORD_BOT_TOKEN ??= 'test';
process.env.DISCORD_APPLICATION_ID ??= 'test';
process.env.CONTINUUM_API_BASE_URL ??= 'http://localhost:8001/api/v1';
process.env.CONTINUUM_OAUTH_ISSUER_URL ??= 'http://localhost:8001';
process.env.CONTINUUM_OAUTH_REDIRECT_URI ??= 'http://localhost:3000/oauth/callback';
process.env.BOT_PUBLIC_URL ??= 'http://localhost:3000';
process.env.TOKEN_ENCRYPTION_KEY ??= '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
process.env.BOT_STATE_SIGNING_KEY ??= 'test-key-must-be-at-least-thirty-two-chars-long';
process.env.DATABASE_URL ??= 'postgres://localhost/test';
process.env.OPENAI_API_KEY ??= 'test';

const { encryptToken, decryptToken } = await import('../src/auth/tokenStore.js');

describe('tokenStore', () => {
  it('round-trips a plaintext', () => {
    const enc = encryptToken('super-secret-refresh-token-value');
    const out = decryptToken(enc);
    expect(out).toBe('super-secret-refresh-token-value');
  });

  it('produces different ciphertext per call (random IV)', () => {
    const a = encryptToken('hello');
    const b = encryptToken('hello');
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
    expect(a.iv.equals(b.iv)).toBe(false);
  });

  it('throws on tampered ciphertext', () => {
    const enc = encryptToken('msg');
    enc.ciphertext[0] = (enc.ciphertext[0] ?? 0) ^ 0xff;
    expect(() => decryptToken(enc)).toThrow();
  });
});
