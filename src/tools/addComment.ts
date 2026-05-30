import { continuumClient } from '../api/continuumClient.js';
import type { Comment } from '../api/types.js';

export async function executeAddComment(
  discordUserId: string,
  input: { task_id: number; content: string },
): Promise<Comment> {
  return continuumClient.post<Comment>(
    discordUserId,
    `/tasks/${input.task_id}/comments`,
    { content: input.content },
  );
}
