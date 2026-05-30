import { continuumClient } from '../api/continuumClient.js';
import type { CreateTaskInput, TaskSummary } from '../api/types.js';

export async function executeCreateTask(
  discordUserId: string,
  input: CreateTaskInput,
): Promise<TaskSummary> {
  return continuumClient.post<TaskSummary>(discordUserId, '/tasks/', input);
}
