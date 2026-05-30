import {
  ActionRowBuilder,
  Events,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  type ButtonInteraction,
  type Client,
  type Interaction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { logger } from '../../logger.js';
import { getTask } from '../../tools/getTask.js';
import { listRepositories } from '../../tools/listRepositories.js';
import { listBranches } from '../../tools/listBranches.js';
import { executeLinkBranch } from '../../tools/linkBranch.js';
import { executeCreateGitBranch } from '../../tools/createGitBranch.js';
import { ContinuumApiError } from '../../api/continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../../auth/tokenManager.js';
import type { Repository } from '../../api/types.js';

export const BRANCH_MODE_PREFIX = 'branch:mode:'; // branch:mode:{attach|create}:{taskId}
export const BRANCH_REPO_PREFIX = 'branch:repo:'; // branch:repo:{attach|create}:{taskId}
export const BRANCH_PICK_PREFIX = 'branch:pick:'; // branch:pick:{taskId}:{repoId}

type Mode = 'attach' | 'create';

export function attachBranchHandler(client: Client): void {
  client.on(Events.InteractionCreate, (interaction: Interaction) => {
    if (interaction.isButton() && interaction.customId.startsWith(BRANCH_MODE_PREFIX)) {
      void handleMode(interaction);
      return;
    }
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId.startsWith(BRANCH_REPO_PREFIX)) {
        void handleRepoSelect(interaction);
        return;
      }
      if (interaction.customId.startsWith(BRANCH_PICK_PREFIX)) {
        void handleBranchPick(interaction);
        return;
      }
    }
  });
}

async function handleMode(interaction: ButtonInteraction): Promise<void> {
  await interaction.deferUpdate();

  const rest = interaction.customId.slice(BRANCH_MODE_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return;
  const mode = rest.slice(0, sep) as Mode;
  const taskId = Number.parseInt(rest.slice(sep + 1), 10);
  if ((mode !== 'attach' && mode !== 'create') || !Number.isFinite(taskId)) return;

  const task = await safeGetTask(interaction, taskId);
  if (!task) return;

  let repos: Repository[];
  try {
    repos = await listRepositories(interaction.user.id, task.project_id);
  } catch (err) {
    await editError(interaction, err, "Couldn't load repositories for this project.");
    return;
  }

  if (repos.length === 0) {
    await interaction.editReply({
      content: '⚠️ No repositories are connected to this project. Connect one in Continuum first.',
      embeds: [],
      components: [],
    });
    return;
  }

  const options = repos.slice(0, 25).map((r) => {
    const label = truncate(r.full_name ?? r.name, 100);
    const desc = truncate(
      [r.provider, r.default_branch ? `default: ${r.default_branch}` : null]
        .filter(Boolean)
        .join(' · '),
      100,
    );
    const opt = new StringSelectMenuOptionBuilder().setLabel(label).setValue(String(r.id));
    if (desc) opt.setDescription(desc);
    return opt;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${BRANCH_REPO_PREFIX}${mode}:${taskId}`)
    .setPlaceholder(
      mode === 'attach' ? 'Pick a repo to attach a branch from' : 'Pick a repo for the new branch',
    )
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  const header =
    mode === 'attach'
      ? `**Attach branch** · task #${taskId}\nPick the repo:`
      : `**Create branch** · task #${taskId}\nPick the repo (branch name will be derived from the task title):`;

  await interaction.editReply({
    content: header,
    embeds: [],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

async function handleRepoSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();

  const rest = interaction.customId.slice(BRANCH_REPO_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return;
  const mode = rest.slice(0, sep) as Mode;
  const taskId = Number.parseInt(rest.slice(sep + 1), 10);
  const repoId = Number.parseInt(interaction.values[0] ?? '', 10);
  if ((mode !== 'attach' && mode !== 'create') || !Number.isFinite(taskId) || !Number.isFinite(repoId)) {
    return;
  }

  const task = await safeGetTask(interaction, taskId);
  if (!task) return;

  const repo = await safeFindRepo(interaction, task.project_id, repoId);
  if (!repo) return;
  const repoLabel = repo.full_name ?? repo.name;

  if (mode === 'attach') {
    await renderBranchPicker(interaction, taskId, task.project_id, repo, repoLabel);
    return;
  }

  // Create mode: slugify task title → create branch → link to task.
  const branchName = slugifyTitle(task.title);
  if (!branchName) {
    await interaction.editReply({
      content: '⚠️ Could not derive a branch name from the task title.',
      embeds: [],
      components: [],
    });
    return;
  }

  let createdNote: string;
  try {
    await executeCreateGitBranch(interaction.user.id, task.project_id, repo.id, {
      name: branchName,
    });
    createdNote = `🌱 Created branch \`${branchName}\` in \`${repoLabel}\``;
  } catch (err) {
    if (err instanceof ContinuumApiError && err.status === 409) {
      createdNote = `ℹ️ Branch \`${branchName}\` already existed in \`${repoLabel}\` — linking instead`;
    } else {
      logger.warn({ err, taskId, repoId, branchName }, '/branch create: createGitBranch failed');
      await editError(interaction, err, "Couldn't create branch.");
      return;
    }
  }

  try {
    await executeLinkBranch(interaction.user.id, taskId, {
      linked_repo: repoLabel,
      linked_branch: branchName,
    });
  } catch (err) {
    logger.warn({ err, taskId, repoId, branchName }, '/branch create: linkBranch failed');
    await interaction.editReply({
      content: `${createdNote}\n⚠️ ${friendlyMessage(err, "Couldn't link branch to task.")}`,
      embeds: [],
      components: [],
    });
    return;
  }

  await interaction.editReply({
    content: `${createdNote}\n✅ Linked to task **#${taskId}**`,
    embeds: [],
    components: [],
  });
}

async function renderBranchPicker(
  interaction: StringSelectMenuInteraction,
  taskId: number,
  projectId: number,
  repo: Repository,
  repoLabel: string,
): Promise<void> {
  let branches;
  try {
    branches = await listBranches(interaction.user.id, projectId, repo.id);
  } catch (err) {
    logger.warn({ err, taskId, repoId: repo.id }, '/branch attach: listBranches failed');
    await editError(interaction, err, "Couldn't list branches for that repo.");
    return;
  }

  if (branches.length === 0) {
    await interaction.editReply({
      content: `⚠️ No branches found in \`${repoLabel}\`.`,
      embeds: [],
      components: [],
    });
    return;
  }

  // Put default branch first if we can identify it.
  const sorted = [...branches].sort((a, b) => {
    if (a.is_default && !b.is_default) return -1;
    if (!a.is_default && b.is_default) return 1;
    return a.name.localeCompare(b.name);
  });

  const options = sorted.slice(0, 25).map((b) => {
    const opt = new StringSelectMenuOptionBuilder()
      .setLabel(truncate(b.name, 100))
      .setValue(b.name);
    if (b.is_default) opt.setDescription('default branch');
    return opt;
  });

  const select = new StringSelectMenuBuilder()
    .setCustomId(`${BRANCH_PICK_PREFIX}${taskId}:${repo.id}`)
    .setPlaceholder('Pick a branch to attach')
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(options);

  await interaction.editReply({
    content: `**Attach branch** · task #${taskId} · \`${repoLabel}\`\nPick the branch:`,
    embeds: [],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select)],
  });
}

async function handleBranchPick(interaction: StringSelectMenuInteraction): Promise<void> {
  await interaction.deferUpdate();

  const rest = interaction.customId.slice(BRANCH_PICK_PREFIX.length);
  const sep = rest.indexOf(':');
  if (sep < 0) return;
  const taskId = Number.parseInt(rest.slice(0, sep), 10);
  const repoId = Number.parseInt(rest.slice(sep + 1), 10);
  const branchName = interaction.values[0];
  if (!Number.isFinite(taskId) || !Number.isFinite(repoId) || !branchName) return;

  const task = await safeGetTask(interaction, taskId);
  if (!task) return;

  const repo = await safeFindRepo(interaction, task.project_id, repoId);
  if (!repo) return;
  const repoLabel = repo.full_name ?? repo.name;

  try {
    await executeLinkBranch(interaction.user.id, taskId, {
      linked_repo: repoLabel,
      linked_branch: branchName,
    });
  } catch (err) {
    logger.warn({ err, taskId, repoId, branchName }, '/branch attach: linkBranch failed');
    await editError(interaction, err, "Couldn't link branch to task.");
    return;
  }

  await interaction.editReply({
    content: `✅ Linked \`${repoLabel}\` / \`${branchName}\` to task **#${taskId}**`,
    embeds: [],
    components: [],
  });
}

async function safeGetTask(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  taskId: number,
) {
  try {
    return await getTask(interaction.user.id, taskId);
  } catch (err) {
    logger.warn({ err, taskId }, '/branch: getTask failed');
    await editError(interaction, err, `Couldn't load task #${taskId}.`);
    return null;
  }
}

async function safeFindRepo(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  projectId: number,
  repoId: number,
): Promise<Repository | null> {
  let repos: Repository[];
  try {
    repos = await listRepositories(interaction.user.id, projectId);
  } catch (err) {
    await editError(interaction, err, "Couldn't load repositories.");
    return null;
  }
  const repo = repos.find((r) => r.id === repoId);
  if (!repo) {
    await interaction.editReply({
      content: '⚠️ Repository no longer available.',
      embeds: [],
      components: [],
    });
    return null;
  }
  return repo;
}

async function editError(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  err: unknown,
  fallback: string,
): Promise<void> {
  await interaction.editReply({
    content: `⚠️ ${friendlyMessage(err, fallback)}`,
    embeds: [],
    components: [],
  });
}

function friendlyMessage(err: unknown, fallback: string): string {
  if (err instanceof NotLinkedError) return 'You are not linked. Run `/link`.';
  if (err instanceof LinkExpiredError) return 'Your link expired. Run `/link` to reconnect.';
  if (err instanceof ContinuumApiError) {
    if (err.status === 404) return 'Not found.';
    if (err.status === 403) {
      const body = err.body.toLowerCase();
      if (body.includes('credential') || body.includes('token')) {
        return 'Git credentials missing for this repo — fix in Continuum project settings.';
      }
      return "You don't have permission to do that.";
    }
    if (err.status === 422) return `Validation error: ${err.body.slice(0, 200)}`;
    if (err.status === 429) return 'Rate limit hit — try again shortly.';
    return `${fallback} (API ${err.status})`;
  }
  return fallback;
}

export function slugifyTitle(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/^-+|-+$/g, '');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
