import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Client,
  type TextBasedChannel,
} from 'discord.js';
import { logger } from '../logger.js';
import {
  deleteWatcher,
  incrementFailures,
  listActiveWatchers,
  markPolled,
  type BuildWatcher,
} from '../db/buildWatchers.js';
import { getAgentRun } from '../tools/startBuild.js';
import { ContinuumApiError } from '../api/continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../auth/tokenManager.js';
import { buildReviewCustomId } from '../discord/handlers/buttonHandler.js';
import type { AgentRun, AgentRunStatus } from '../api/types.js';

const POLL_INTERVAL_MS = 25_000;
const MAX_POLL_FAILURES = 20;
const TERMINAL_STATUSES: ReadonlySet<AgentRunStatus> = new Set([
  'succeeded',
  'failed',
  'cancelled',
]);

export function startBuildWatcher(client: Client): { stop: () => void } {
  const tick = async (): Promise<void> => {
    let watchers: BuildWatcher[];
    try {
      watchers = await listActiveWatchers();
    } catch (err) {
      logger.warn({ err }, 'build watcher: failed to list watchers');
      return;
    }
    for (const w of watchers) {
      try {
        await pollOne(client, w);
      } catch (err) {
        logger.warn({ err, runId: w.run_id }, 'build watcher: pollOne crashed');
      }
    }
  };

  const timer = setInterval(() => {
    void tick();
  }, POLL_INTERVAL_MS);
  timer.unref();

  // Fire once shortly after startup so a restart doesn't wait a full interval.
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

async function pollOne(client: Client, w: BuildWatcher): Promise<void> {
  let run: AgentRun;
  try {
    run = await getAgentRun(w.discord_user_id, w.task_id, w.run_id);
  } catch (err) {
    if (err instanceof NotLinkedError || err instanceof LinkExpiredError) {
      logger.info({ runId: w.run_id, userId: w.discord_user_id }, 'watcher: user unlinked');
      await notifyUnlinked(client, w);
      await deleteWatcher(w.run_id);
      return;
    }
    if (err instanceof ContinuumApiError && err.status === 404) {
      logger.info({ runId: w.run_id }, 'watcher: run no longer exists');
      await deleteWatcher(w.run_id);
      return;
    }
    const failures = await incrementFailures(w.run_id);
    if (failures >= MAX_POLL_FAILURES) {
      logger.warn({ runId: w.run_id, failures }, 'watcher: giving up after repeated failures');
      await notifyGaveUp(client, w);
      await deleteWatcher(w.run_id);
    } else {
      logger.debug({ err, runId: w.run_id, failures }, 'watcher: transient poll error');
    }
    return;
  }

  await markPolled(w.run_id);

  if (!TERMINAL_STATUSES.has(run.status)) return;

  await notifyTerminal(client, w, run);
  await deleteWatcher(w.run_id);
}

async function notifyTerminal(
  client: Client,
  w: BuildWatcher,
  run: AgentRun,
): Promise<void> {
  const lines: string[] = [`**Build finished — task #${w.task_id}**`, `Status: \`${run.status}\``];
  if (run.status === 'succeeded') {
    if (run.pr_url) lines.push(`PR: ${run.pr_url}`);
    if (run.commit_sha) lines.push(`Commit: \`${run.commit_sha.slice(0, 12)}\``);
    if (run.summary) lines.push(`\n${truncate(run.summary, 1500)}`);
  } else if (run.status === 'failed') {
    if (run.error) lines.push(`\nError: ${truncate(run.error, 1500)}`);
    else if (run.summary) lines.push(`\n${truncate(run.summary, 1500)}`);
  } else if (run.status === 'cancelled') {
    lines.push('_Cancelled._');
  }

  // Attach a Review button on success when the build produced something to review.
  const reviewable =
    run.status === 'succeeded' &&
    ((run.mode === 'open_pr' && !!run.pr_url) ||
      (run.mode === 'direct_push' && !!run.commit_sha));
  const components = reviewable
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(buildReviewCustomId(w.task_id, run.id))
            .setLabel('Review')
            .setEmoji('🔎')
            .setStyle(ButtonStyle.Primary),
        ),
      ]
    : [];

  await deliver(client, w, lines.join('\n'), components);
}

async function notifyUnlinked(client: Client, w: BuildWatcher): Promise<void> {
  await deliver(
    client,
    w,
    `**Build #${w.run_id.slice(0, 8)} for task #${w.task_id}** — I lost access to your Continuum account. Run \`/link\` to reconnect and check the build in Continuum.`,
  );
}

async function notifyGaveUp(client: Client, w: BuildWatcher): Promise<void> {
  await deliver(
    client,
    w,
    `**Build #${w.run_id.slice(0, 8)} for task #${w.task_id}** — I lost track of this build after repeated polling errors. Check the status in Continuum directly.`,
  );
}

async function deliver(
  client: Client,
  w: BuildWatcher,
  content: string,
  components: ActionRowBuilder<ButtonBuilder>[] = [],
): Promise<void> {
  // Prefer DM. Fall back to original channel if the DM fails.
  try {
    const user = await client.users.fetch(w.discord_user_id);
    await user.send({ content, components });
    return;
  } catch (err) {
    logger.debug({ err, userId: w.discord_user_id }, 'watcher: DM failed, trying channel');
  }
  try {
    if (!w.channel_id) return;
    const channel = await client.channels.fetch(w.channel_id);
    if (channel && channel.isTextBased() && 'send' in channel) {
      await (
        channel as TextBasedChannel & {
          send: (m: {
            content: string;
            components?: ActionRowBuilder<ButtonBuilder>[];
            reply?: { messageReference: string };
          }) => Promise<unknown>;
        }
      ).send({
        content,
        components,
        ...(w.message_id ? { reply: { messageReference: w.message_id } } : {}),
      });
    }
  } catch (err) {
    logger.warn({ err, runId: w.run_id }, 'watcher: channel notify failed too');
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
