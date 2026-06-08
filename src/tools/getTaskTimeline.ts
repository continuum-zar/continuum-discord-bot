import { continuumClient } from '../api/continuumClient.js';

export interface TaskTimelineActivity {
  type: string;
  at?: string;
  actor?: { id?: number; display_name?: string | null; username?: string | null } | null;
  [key: string]: unknown;
}

export interface TaskTimelineResponse {
  task_id?: number;
  activities: TaskTimelineActivity[];
  total?: number;
  skip?: number;
  limit?: number;
}

export async function getTaskTimeline(
  discordUserId: string,
  taskId: number,
  opts: { limit?: number; skip?: number } = {},
): Promise<TaskTimelineResponse> {
  const params = new URLSearchParams();
  if (opts.skip != null) params.set('skip', String(opts.skip));
  params.set('limit', String(opts.limit ?? 50));
  return continuumClient.get<TaskTimelineResponse>(
    discordUserId,
    `/tasks/${taskId}/timeline?${params}`,
  );
}
