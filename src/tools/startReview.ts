import { continuumClient } from '../api/continuumClient.js';
import type { ReviewRun } from '../api/types.js';

export async function executeStartReview(
  discordUserId: string,
  taskId: number,
  runId: string,
): Promise<ReviewRun> {
  return continuumClient.post<ReviewRun>(
    discordUserId,
    `/tasks/${taskId}/agent/runs/${runId}/review`,
  );
}

export async function getReviewRun(
  discordUserId: string,
  taskId: number,
  reviewId: string,
): Promise<ReviewRun> {
  return continuumClient.get<ReviewRun>(
    discordUserId,
    `/tasks/${taskId}/agent/reviews/${reviewId}`,
  );
}
