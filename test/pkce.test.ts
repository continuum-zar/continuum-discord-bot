import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { generatePkce } from '../src/auth/pkce.js';

describe('generatePkce', () => {
  it('produces a base64url verifier of at least 43 chars', () => {
    const { verifier } = generatePkce();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

  it('computes a matching S256 challenge', () => {
    const { verifier, challenge, method } = generatePkce();
    expect(method).toBe('S256');
    const expected = createHash('sha256')
      .update(verifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    expect(challenge).toBe(expected);
  });

  it('produces unique verifiers across calls', () => {
    const a = generatePkce();
    const b = generatePkce();
    expect(a.verifier).not.toBe(b.verifier);
  });
});
