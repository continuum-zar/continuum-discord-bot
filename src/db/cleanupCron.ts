import { cleanupExpired } from './pendingActions.js';
import { trimOldHistory } from './conversationHistory.js';
import { logger } from '../logger.js';

const FIVE_MINUTES = 5 * 60 * 1000;

export function startCleanupCron(): { stop: () => void } {
  const timer = setInterval(() => {
    void (async () => {
      try {
        const expired = await cleanupExpired();
        if (expired > 0) logger.debug({ expired }, 'cleaned up expired pending actions');
        await trimOldHistory();
      } catch (err) {
        logger.warn({ err }, 'cleanup cron error');
      }
    })();
  }, FIVE_MINUTES);
  timer.unref();
  return { stop: () => clearInterval(timer) };
}
