import {
  OAuthError,
  refreshTokens,
  resolveAccessTokenExpiry,
} from './oauthClient.js';
import {
  getUserLink,
  updateTokensForUser,
  deleteUserLink,
  UserLink,
} from '../db/userLinks.js';
import { logger } from '../logger.js';

const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh if <5 min remaining

export class NotLinkedError extends Error {
  constructor() {
    super('User is not linked to Continuum');
    this.name = 'NotLinkedError';
  }
}

export class LinkExpiredError extends Error {
  constructor() {
    super('Continuum link has expired — user must /link again');
    this.name = 'LinkExpiredError';
  }
}

const inFlight = new Map<string, Promise<string>>();

/**
 * Returns a valid access token for the given Discord user.
 * Proactively refreshes when <5 minutes remain; falls back to refresh on 401-driven invalidation.
 * Concurrent calls for the same user collapse into a single refresh.
 */
export async function getAccessTokenForUser(discordUserId: string): Promise<string> {
  const existing = inFlight.get(discordUserId);
  if (existing) return existing;

  const link = await getUserLink(discordUserId);
  if (!link) throw new NotLinkedError();

  if (link.access_token && link.access_token_expires_at) {
    const remaining = link.access_token_expires_at.getTime() - Date.now();
    if (remaining > REFRESH_BUFFER_MS) return link.access_token;
  }

  const promise = doRefresh(link).finally(() => inFlight.delete(discordUserId));
  inFlight.set(discordUserId, promise);
  return promise;
}

/**
 * Forces a refresh — call this after a 401 from the API to invalidate cached token.
 */
export async function forceRefresh(discordUserId: string): Promise<string> {
  const existing = inFlight.get(discordUserId);
  if (existing) return existing;

  const link = await getUserLink(discordUserId);
  if (!link) throw new NotLinkedError();

  const promise = doRefresh(link).finally(() => inFlight.delete(discordUserId));
  inFlight.set(discordUserId, promise);
  return promise;
}

async function doRefresh(link: UserLink): Promise<string> {
  try {
    const tokens = await refreshTokens(link.refresh_token);
    const expiresAt = await resolveAccessTokenExpiry(tokens);
    await updateTokensForUser({
      discordUserId: link.discord_user_id,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: expiresAt,
    });
    return tokens.access_token;
  } catch (err) {
    if (err instanceof OAuthError && (err.status === 401 || err.status === 400)) {
      logger.warn(
        { discordUserId: link.discord_user_id, status: err.status },
        'refresh token rejected — deleting link',
      );
      await deleteUserLink(link.discord_user_id);
      throw new LinkExpiredError();
    }
    throw err;
  }
}
