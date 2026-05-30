import { continuumClient } from '../api/continuumClient.js';
import type { AgentRun, StartBuildInput } from '../api/types.js';

export async function executeStartBuild(
  discordUserId: string,
  taskId: number,
  input: StartBuildInput,
): Promise<AgentRun> {
  return continuumClient.post<AgentRun>(
    discordUserId,
    `/tasks/${taskId}/agent/runs`,
    input,
  );
}

export async function getAgentRun(
  discordUserId: string,
  taskId: number,
  runId: string,
): Promise<AgentRun> {
  return continuumClient.get<AgentRun>(
    discordUserId,
    `/tasks/${taskId}/agent/runs/${runId}`,
  );
}

export async function cancelAgentRun(
  discordUserId: string,
  taskId: number,
  runId: string,
): Promise<AgentRun> {
  return continuumClient.post<AgentRun>(
    discordUserId,
    `/tasks/${taskId}/agent/runs/${runId}/cancel`,
  );
}
