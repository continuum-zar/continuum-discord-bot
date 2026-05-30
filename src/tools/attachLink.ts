import { continuumClient } from '../api/continuumClient.js';
import type { AttachLinkInput, AttachmentResponse } from '../api/types.js';

export async function executeAttachLink(
  discordUserId: string,
  taskId: number,
  input: AttachLinkInput,
): Promise<AttachmentResponse> {
  return continuumClient.post<AttachmentResponse>(
    discordUserId,
    `/tasks/${taskId}/attachments/link`,
    input,
  );
}
