import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { getBotConfig, setBotConfig } from '../db/botConfig.js';

const config = loadConfig();

const ACCESS_TOKEN_TTL_FALLBACK_SECONDS = 30 * 60;

export interface OAuthTokenResponse {
  access_token: string;
  token_type: 'bearer';
  refresh_token: string;
  /** Present on authorization_code exchange; absent on refresh — falls back to 30 min. */
  expires_in?: number;
  scope?: string;
}

export interface IntrospectionResponse {
  active: boolean;
  sub?: string;
  username?: string;
  exp?: number;
  scope?: string;
  client_id?: string;
}

export class OAuthError extends Error {
  constructor(message: string, public readonly status?: number, public readonly body?: string) {
    super(message);
    this.name = 'OAuthError';
  }
}

function oauthBase(): string {
  return `${config.CONTINUUM_OAUTH_ISSUER_URL.replace(/\/$/, '')}/api/v1/oauth`;
}

async function registerClient(): Promise<string> {
  const res = await fetch(`${oauthBase()}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      redirect_uris: [config.CONTINUUM_OAUTH_REDIRECT_URI],
      client_name: config.CONTINUUM_OAUTH_CLIENT_NAME,
    }),
  });
  if (!res.ok) {
    throw new OAuthError(`register failed (${res.status})`, res.status, await res.text());
  }
  const data = (await res.json()) as { client_id: string };
  return data.client_id;
}

/**
 * Resolves the OAuth client_id, registering one if needed.
 * Order: env var (CONTINUUM_OAUTH_CLIENT_ID) > bot_config table > new registration.
 */
export async function ensureClientId(): Promise<string> {
  if (config.CONTINUUM_OAUTH_CLIENT_ID) {
    return config.CONTINUUM_OAUTH_CLIENT_ID;
  }
  const stored = await getBotConfig('oauth_client_id');
  if (stored) return stored;
  logger.info('registering OAuth client with Continuum backend');
  const clientId = await registerClient();
  await setBotConfig('oauth_client_id', clientId);
  logger.info({ clientId }, 'OAuth client registered');
  return clientId;
}

export function buildAuthorizationUrl(opts: {
  clientId: string;
  codeChallenge: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: opts.clientId,
    redirect_uri: config.CONTINUUM_OAUTH_REDIRECT_URI,
    code_challenge: opts.codeChallenge,
    code_challenge_method: 'S256',
    state: opts.state,
    scope: 'openid mcp:tools',
  });
  return `${oauthBase()}/authorize?${params.toString()}`;
}

export async function exchangeCode(opts: {
  code: string;
  verifier: string;
  clientId: string;
}): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: opts.code,
    redirect_uri: config.CONTINUUM_OAUTH_REDIRECT_URI,
    client_id: opts.clientId,
    code_verifier: opts.verifier,
  });
  const res = await fetch(`${oauthBase()}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new OAuthError(`token exchange failed (${res.status})`, res.status, await res.text());
  }
  return (await res.json()) as OAuthTokenResponse;
}

export async function refreshTokens(refreshToken: string): Promise<OAuthTokenResponse> {
  const form = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
  const res = await fetch(`${oauthBase()}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new OAuthError(`refresh failed (${res.status})`, res.status, await res.text());
  }
  return (await res.json()) as OAuthTokenResponse;
}

export async function introspect(accessToken: string): Promise<IntrospectionResponse> {
  const form = new URLSearchParams({ token: accessToken });
  const res = await fetch(`${oauthBase()}/introspect`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  if (!res.ok) {
    throw new OAuthError(`introspect failed (${res.status})`, res.status, await res.text());
  }
  return (await res.json()) as IntrospectionResponse;
}

export function accessTokenExpiresAt(tokens: OAuthTokenResponse): Date {
  const seconds = tokens.expires_in ?? ACCESS_TOKEN_TTL_FALLBACK_SECONDS;
  return new Date(Date.now() + seconds * 1000);
}
