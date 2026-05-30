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

const { buildCustomIds, buildCancelRunCustomId } = await import(
  '../src/discord/handlers/buttonHandler.js'
);

describe('build button custom IDs', () => {
  it('produces parseable mode IDs', () => {
    const ids = buildCustomIds('pending-1');
    expect(ids.modeOpenPr).toBe('pa:mode:open_pr:pending-1');
    expect(ids.modeDirectPush).toBe('pa:mode:direct_push:pending-1');
  });

  it('round-trips mode + pending id', () => {
    const ids = buildCustomIds('uuid-build');
    // Replicate the handler's parsing: strip prefix, split on first ':'.
    const rest = ids.modeOpenPr.slice('pa:mode:'.length);
    const sep = rest.indexOf(':');
    expect(rest.slice(0, sep)).toBe('open_pr');
    expect(rest.slice(sep + 1)).toBe('uuid-build');
  });

  it('encodes cancel-build IDs with both task and run', () => {
    const id = buildCancelRunCustomId(42, 'run-abc-123');
    expect(id).toBe('pa:cancelbuild:42:run-abc-123');
    const rest = id.slice('pa:cancelbuild:'.length);
    const sep = rest.indexOf(':');
    expect(rest.slice(0, sep)).toBe('42');
    expect(rest.slice(sep + 1)).toBe('run-abc-123');
  });
});
