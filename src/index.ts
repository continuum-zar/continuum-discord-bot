import { loadConfig } from './config.js';
import { logger } from './logger.js';
import { runMigrations } from './db/migrate.js';
import { ensureClientId } from './auth/oauthClient.js';
import { registerCommands } from './discord/commands/index.js';
import { buildClient, startClient } from './discord/client.js';
import { buildApp } from './server/app.js';
import { shutdownPool } from './db/pool.js';
import { startCleanupCron } from './db/cleanupCron.js';

async function main(): Promise<void> {
  const config = loadConfig();
  logger.info({ env: config.NODE_ENV }, 'starting continuum-discord-bot');

  await runMigrations();
  await ensureClientId();
  await registerCommands();

  const app = buildApp();
  const server = app.listen(config.PORT, () => {
    logger.info({ port: config.PORT }, 'HTTP server listening');
  });

  const client = buildClient();
  await startClient(client);

  const cleanup = startCleanupCron();

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'shutting down');
    cleanup.stop();
    server.close();
    await client.destroy();
    await shutdownPool();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.fatal({ err }, 'fatal startup error');
  process.exit(1);
});
