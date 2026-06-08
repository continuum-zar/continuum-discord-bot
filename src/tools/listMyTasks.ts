import { listTasks } from './listTasks.js';
import { getMe } from './me.js';

export async function listMyTasks(
  discordUserId: string,
  opts: {
    project_id?: number;
    status?: 'todo' | 'in_progress' | 'done';
    column_id?: string;
    limit?: number;
  } = {},
) {
  const me = await getMe(discordUserId);
  return listTasks(discordUserId, {
    assigned_to: me.id,
    ...(opts.project_id != null ? { project_id: opts.project_id } : {}),
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.column_id ? { column_id: opts.column_id } : {}),
    ...(opts.limit != null ? { limit: opts.limit } : {}),
  });
}
