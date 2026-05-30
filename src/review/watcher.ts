import type { Client, TextBasedChannel } from 'discord.js';
import { logger } from '../logger.js';
import {
  deleteReviewWatcher,
  incrementReviewFailures,
  listActiveReviewWatchers,
  markReviewPolled,
  type ReviewWatcher,
} from '../db/reviewWatchers.js';
import { getReviewRun } from '../tools/startReview.js';
import { ContinuumApiError } from '../api/continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../auth/tokenManager.js';
import type { ReviewRun, ReviewRunStatus } from '../api/types.js';

const POLL_INTERVAL_MS = 12_000;
const MAX_POLL_FAILURES = 20;
const TERMINAL_STATUSES: ReadonlySet<ReviewRunStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export function startReviewWatcher(client: Client): { stop: () => void } {
  const tick = async (): Promise<void> => {
    let watchers: ReviewWatcher[];
    try {
      watchers = await listActiveReviewWatchers();
    } catch (err) {
      logger.warn({ err }, 'review watcher: failed to list watchers');
      return;
    }
    for (const w of watchers) {
      try {
        await pollOne(client, w);
      } catch (err) {
        logger.warn({ err, reviewId: w.review_id }, 'review watcher: pollOne crashed');
      }
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  timer.unref();

  const initial = setTimeout(() => {
    void tick();
  }, 5_000);
  initial.unref();

  return {
    stop: () => {
      clearInterval(timer);
      clearTimeout(initial);
    },
  };
}

async function pollOne(client: Client, w: ReviewWatcher): Promise<void> {
  let review: ReviewRun;
  try {
    review = await getReviewRun(w.discord_user_id, w.task_id, w.review_id);
  } catch (err) {
    if (err instanceof NotLinkedError || err instanceof LinkExpiredError) {
      logger.info(
        { reviewId: w.review_id, userId: w.discord_user_id },
        'review watcher: user unlinked',
      );
      await notifyUnlinked(client, w);
      await deleteReviewWatcher(w.review_id);
      return;
    }
    if (err instanceof ContinuumApiError && err.status === 404) {
      logger.info({ reviewId: w.review_id }, 'review watcher: review no longer exists');
      await deleteReviewWatcher(w.review_id);
      return;
    }
    const failures = await incrementReviewFailures(w.review_id);
    if (failures >= MAX_POLL_FAILURES) {
      logger.warn(
        { reviewId: w.review_id, failures },
        'review watcher: giving up after repeated failures',
      );
      await notifyGaveUp(client, w);
      await deleteReviewWatcher(w.review_id);
    } else {
      logger.debug(
        { err, reviewId: w.review_id, failures },
        'review watcher: transient poll error',
      );
    }
    return;
  }

  await markReviewPolled(w.review_id);

  if (!TERMINAL_STATUSES.has(review.status)) return;

  await notifyTerminal(client, w, review);
  await deleteReviewWatcher(w.review_id);
}

async function notifyTerminal(
  client: Client,
  w: ReviewWatcher,
  review: ReviewRun,
): Promise<void> {
  const lines: string[] = [`**Review complete — task #${w.task_id}**`];

  if (review.status === 'failed') {
    lines.push(`Status: \`failed\``);
    if (review.error) lines.push(`\nError: ${truncate(review.error, 1000)}`);
    await deliver(client, w, lines.join('\n'));
    return;
  }
  if (review.status === 'cancelled') {
    lines.push('_Review was cancelled._');
    await deliver(client, w, lines.join('\n'));
    return;
  }

  // succeeded
  const verdictLabel =
    review.verdict === 'ready_to_merge' ? '✅ Ready to merge' : '⚠️ Issues found';
  const issueCount = review.issues?.length ?? 0;
  lines.push(`Verdict: **${verdictLabel}**${issueCount ? ` — ${issueCount} issue(s)` : ''}`);

  if (review.summary) lines.push(`\n${truncate(review.summary, 800)}`);

  if (review.issues && review.issues.length > 0) {
    lines.push('');
    for (const issue of review.issues.slice(0, 5)) {
      const loc = issue.file
        ? ` — \`${issue.file}${issue.line ? `:${issue.line}` : ''}\``
        : '';
      lines.push(`• **[${issue.severity}]** ${issue.title}${loc}`);
    }
    if (review.issues.length > 5) {
      lines.push(`_…and ${review.issues.length - 5} more._`);
    }
  }

  if (review.delivery_target === 'github_pr_comment' && review.github_comment_url) {
    lines.push(`\nPR comment: ${review.github_comment_url}`);
  } else if (review.delivery_target === 'task_comment') {
    lines.push(`\nPosted as a comment on task #${w.task_id} in Continuum.`);
  }

  await deliver(client, w, truncate(lines.join('\n'), 1900));
}

async function notifyUnlinked(client: Client, w: ReviewWatcher): Promise<void> {
  await deliver(
    client,
    w,
    `**Review for task #${w.task_id}** — I lost access to your Continuum account. Run \`/link\` to reconnect.`,
  );
}

async function notifyGaveUp(client: Client, w: ReviewWatcher): Promise<void> {
  await deliver(
    client,
    w,
    `**Review for task #${w.task_id}** — I lost track of this review after repeated polling errors. Check the result in Continuum.`,
  );
}

async function deliver(client: Client, w: ReviewWatcher, content: string): Promise<void> {
  try {
    const user = await client.users.fetch(w.discord_user_id);
    await user.send({ content });
    return;
  } catch (err) {
    logger.debug(
      { err, userId: w.discord_user_id },
      'review watcher: DM failed, trying channel',
    );
  }
  try {
    if (!w.channel_id) return;
    const channel = await client.channels.fetch(w.channel_id);
    if (channel && channel.isTextBased() && 'send' in channel) {
      await (
        channel as TextBasedChannel & {
          send: (m: {
            content: string;
            reply?: { messageReference: string };
          }) => Promise<unknown>;
        }
      ).send({
        content,
        ...(w.message_id ? { reply: { messageReference: w.message_id } } : {}),
      });
    }
  } catch (err) {
    logger.warn(
      { err, reviewId: w.review_id },
      'review watcher: channel notify failed too',
    );
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
