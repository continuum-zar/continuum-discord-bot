import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} from 'discord.js';
import { logger } from '../../logger.js';
import type {
  PickerKind,
  PickerSpec,
} from '../../agent/tools.js';
import { listMilestones } from '../../tools/listMilestones.js';
import { listProjectMembers, memberDisplayName } from '../../tools/projectMembers.js';
import { getKanbanBoard } from '../../tools/getKanbanBoard.js';

export const MILESTONE_SELECT_PREFIX = 'pa:milestone:';
export const ASSIGNEE_SELECT_PREFIX = 'pa:assignee:';
export const ROLE_SELECT_PREFIX = 'pa:role:';
export const KANBAN_COLUMN_SELECT_PREFIX = 'pa:kanban_column:';

export const NO_MILESTONE_VALUE = 'none';
const SELECT_OPTION_LIMIT = 24;

export function customIdForPicker(kind: PickerKind, pendingActionId: string): string {
  switch (kind) {
    case 'milestone':
      return `${MILESTONE_SELECT_PREFIX}${pendingActionId}`;
    case 'assignee':
      return `${ASSIGNEE_SELECT_PREFIX}${pendingActionId}`;
    case 'member_role':
      return `${ROLE_SELECT_PREFIX}${pendingActionId}`;
    case 'kanban_column':
      return `${KANBAN_COLUMN_SELECT_PREFIX}${pendingActionId}`;
  }
}

export function buildConfirmEmbed(
  preview: string,
  opts: { destructive?: boolean } = {},
): EmbedBuilder {
  const footer = opts.destructive
    ? 'Expires in 5 minutes · destructive action'
    : 'Expires in 5 minutes';
  return new EmbedBuilder()
    .setTitle(opts.destructive ? 'Confirm destructive action' : 'Confirm action')
    .setDescription(preview)
    .setFooter({ text: footer });
}

export function buildConfirmButtons(
  ids: { confirm: string; cancel: string },
  opts: { destructive?: boolean } = {},
): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ids.confirm)
      .setLabel(opts.destructive ? 'Delete' : 'Confirm')
      .setStyle(opts.destructive ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder().setCustomId(ids.cancel).setLabel('Cancel').setStyle(ButtonStyle.Secondary),
  );
}

export type SelectedPickerValues = Partial<Record<PickerKind, string>>;

export async function buildPickerRows(
  discordUserId: string,
  pendingActionId: string,
  pickers: PickerSpec[],
  selected: SelectedPickerValues,
): Promise<ActionRowBuilder<StringSelectMenuBuilder>[]> {
  const rows: ActionRowBuilder<StringSelectMenuBuilder>[] = [];
  for (const picker of pickers) {
    try {
      const row = await buildSinglePickerRow(discordUserId, pendingActionId, picker, selected[picker.kind]);
      if (row) rows.push(row);
    } catch (err) {
      logger.warn({ err, picker }, 'failed to build picker row');
    }
  }
  return rows;
}

async function buildSinglePickerRow(
  discordUserId: string,
  pendingActionId: string,
  picker: PickerSpec,
  selectedValue?: string,
): Promise<ActionRowBuilder<StringSelectMenuBuilder> | null> {
  const options = await loadPickerOptions(discordUserId, picker);
  if (options.length === 0) return null;
  const builders = options.slice(0, SELECT_OPTION_LIMIT + 1).map((opt) => {
    const b = new StringSelectMenuOptionBuilder()
      .setLabel(opt.label.slice(0, 100))
      .setValue(opt.value);
    if (opt.description) b.setDescription(opt.description.slice(0, 100));
    if (selectedValue === opt.value) b.setDefault(true);
    else if (selectedValue == null && opt.defaultSelected) b.setDefault(true);
    return b;
  });
  const select = new StringSelectMenuBuilder()
    .setCustomId(customIdForPicker(picker.kind, pendingActionId))
    .setPlaceholder(picker.placeholder ?? defaultPlaceholder(picker.kind))
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(builders);
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

interface PickerOption {
  label: string;
  value: string;
  description?: string;
  defaultSelected?: boolean;
}

async function loadPickerOptions(discordUserId: string, picker: PickerSpec): Promise<PickerOption[]> {
  switch (picker.kind) {
    case 'milestone': {
      if (picker.projectId == null) return [];
      const milestones = await listMilestones(discordUserId, picker.projectId);
      const options: PickerOption[] = [
        {
          label: 'No milestone',
          value: NO_MILESTONE_VALUE,
          description: 'Leave unassigned',
          defaultSelected: true,
        },
      ];
      for (const m of milestones.slice(0, SELECT_OPTION_LIMIT)) {
        const descParts: string[] = [];
        if (m.status) descParts.push(m.status.replace('_', ' '));
        if (m.due_date) descParts.push(`due ${m.due_date.slice(0, 10)}`);
        options.push({
          label: m.name,
          value: String(m.id),
          description: descParts.join(' · '),
        });
      }
      return options.length === 1 ? [] : options;
    }
    case 'assignee': {
      if (picker.projectId == null) return [];
      const members = await listProjectMembers(discordUserId, picker.projectId);
      return members.slice(0, SELECT_OPTION_LIMIT + 1).map((m) => ({
        label: memberDisplayName(m),
        value: String(m.user_id),
        description: typeof m.role === 'string' ? m.role.replace('_', ' ') : undefined,
      }));
    }
    case 'member_role':
      return [
        { label: 'Developer', value: 'developer', description: 'Default — read/write project member', defaultSelected: true },
        { label: 'Project manager', value: 'project_manager', description: 'Can assign tasks, manage milestones and members' },
        { label: 'Client', value: 'client', description: 'Read-only client portal access' },
      ];
    case 'kanban_column': {
      if (picker.projectId == null) return [];
      const columns = await getKanbanBoard(discordUserId, picker.projectId);
      return columns.slice(0, SELECT_OPTION_LIMIT + 1).map((c) => ({
        label: c.title,
        value: c.id,
        description: c.kind.replace('_', ' '),
      }));
    }
  }
}

function defaultPlaceholder(kind: PickerKind): string {
  switch (kind) {
    case 'milestone':
      return 'Pick a milestone (optional)';
    case 'assignee':
      return 'Pick an assignee';
    case 'member_role':
      return 'Pick a role';
    case 'kanban_column':
      return 'Pick a Kanban column';
  }
}
