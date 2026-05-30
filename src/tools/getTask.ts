import { continuumClient } from '../api/continuumClient.js';
import type { TaskCursorMcpDetail } from '../api/types.js';

export async function getTask(
  discordUserId: string,
  taskId: number,
): Promise<TaskCursorMcpDetail> {
  return continuumClient.get<TaskCursorMcpDetail>(
    discordUserId,
    `/tasks/${taskId}/cursor-mcp`,
  );
}
