import { continuumClient } from '../api/continuumClient.js';
import type { KanbanBoardResponse, KanbanColumn } from '../api/types.js';

export async function getKanbanBoard(
  discordUserId: string,
  projectId: number,
): Promise<KanbanColumn[]> {
  const board = await continuumClient.get<KanbanBoardResponse>(
    discordUserId,
    `/projects/${projectId}/kanban-board`,
  );
  return board.columns ?? [];
}
