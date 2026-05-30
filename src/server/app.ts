import express, { type Express } from 'express';
import { handleOAuthCallback } from './oauthCallback.js';
import { logger } from '../logger.js';

export function buildApp(): Express {
  const app = express();
  app.disable('x-powered-by');

  app.get('/health', (_req, res) => {
    res.json({ ok: true });
  });

  app.get('/oauth/callback', (req, res) => {
    handleOAuthCallback(req, res).catch((err) => {
      logger.error({ err }, 'unhandled oauth callback error');
      if (!res.headersSent) res.status(500).send('Internal error');
    });
  });

  return app;
}
