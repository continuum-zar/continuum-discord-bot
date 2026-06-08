import type { Request, Response } from 'express';
import { verifyState, StateVerificationError } from '../auth/state.js';
import {
  exchangeCode,
  ensureClientId,
  introspect,
  resolveAccessTokenExpiry,
} from '../auth/oauthClient.js';
import { upsertUserLink } from '../db/userLinks.js';
import { logger } from '../logger.js';

const PAGE = (title: string, body: string): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         display: flex; align-items: center; justify-content: center;
         min-height: 100vh; margin: 0; background: #1a1a1d; color: #f0f0f0; }
  .card { max-width: 480px; padding: 2rem; background: #2a2a2e; border-radius: 12px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.4); text-align: center; }
  h1 { margin: 0 0 1rem; font-size: 1.5rem; }
  p { margin: 0.5rem 0; color: #c5c5c8; line-height: 1.5; }
  .ok { color: #4ade80; }
  .err { color: #f87171; }
</style></head><body><div class="card">${body}</div></body></html>`;

export async function handleOAuthCallback(req: Request, res: Response): Promise<void> {
  const code = typeof req.query.code === 'string' ? req.query.code : undefined;
  const state = typeof req.query.state === 'string' ? req.query.state : undefined;
  const error = typeof req.query.error === 'string' ? req.query.error : undefined;

  if (error) {
    res
      .status(400)
      .send(PAGE('Continuum link failed', `<h1 class="err">Continuum link failed</h1><p>${error}</p>`));
    return;
  }

  if (!code || !state) {
    res
      .status(400)
      .send(PAGE('Missing parameters', '<h1 class="err">Missing code or state</h1>'));
    return;
  }

  try {
    const payload = await verifyState(state);
    const clientId = await ensureClientId();
    const tokens = await exchangeCode({
      code,
      verifier: payload.verifier,
      clientId,
    });

    const intro = await introspect(tokens.access_token);
    if (!intro.active || !intro.sub) {
      throw new Error('Introspection returned inactive token');
    }

    await upsertUserLink({
      discordUserId: payload.discord_user_id,
      continuumUserId: intro.sub,
      continuumUsername: intro.username ?? null,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      accessTokenExpiresAt: await resolveAccessTokenExpiry(tokens),
    });

    logger.info(
      { discordUserId: payload.discord_user_id, continuumUserId: intro.sub },
      'user linked',
    );

    res.send(
      PAGE(
        'Continuum linked',
        `<h1 class="ok">All set — you're linked!</h1>
         <p>You can close this tab and return to Discord.</p>
         <p>Linked as <strong>${escapeHtml(intro.username ?? intro.sub)}</strong>.</p>`,
      ),
    );
  } catch (err) {
    const msg =
      err instanceof StateVerificationError
        ? 'Link expired or invalid. Please run /link again in Discord.'
        : 'Something went wrong completing the link. Please try again.';
    logger.error({ err }, 'oauth callback failed');
    res.status(400).send(PAGE('Link failed', `<h1 class="err">Link failed</h1><p>${msg}</p>`));
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&#39;';
    }
  });
}
