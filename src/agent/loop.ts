import OpenAI from 'openai';
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from 'openai/resources/chat/completions.js';
import { loadConfig } from '../config.js';
import { logger } from '../logger.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { allTools, type ToolContext } from './tools.js';
import { ContinuumApiError } from '../api/continuumClient.js';
import { getUserContext } from '../tools/getUserContext.js';

const config = loadConfig();
const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });

const MAX_TOOL_ROUNDS = 5;

export interface AgentResult {
  reply: string;
  stagedPendingAction: ToolContext['stagedPendingAction'];
}

export async function runAgent(opts: {
  discordUserId: string;
  history: ChatCompletionMessageParam[];
  userMessage: string;
}): Promise<AgentResult> {
  const tools = allTools();
  const toolSchemas: ChatCompletionTool[] = Object.values(tools).map((t) => t.schema);
  const ctx: ToolContext = { discordUserId: opts.discordUserId, stagedPendingAction: null };

  let userContext = null;
  try {
    userContext = await getUserContext(opts.discordUserId);
  } catch (err) {
    logger.warn({ err, discordUserId: opts.discordUserId }, 'getUserContext failed; falling back to static prompt');
  }

  const messages: ChatCompletionMessageParam[] = [
    { role: 'system', content: buildSystemPrompt(userContext) },
    ...opts.history,
    { role: 'user', content: opts.userMessage },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await openai.chat.completions.create({
      model: config.OPENAI_MODEL,
      messages,
      tools: toolSchemas,
      tool_choice: 'auto',
    });
    const choice = completion.choices[0];
    const msg = choice.message;
    messages.push(msg);

    const toolCalls = msg.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return { reply: msg.content?.trim() || '(no reply)', stagedPendingAction: ctx.stagedPendingAction };
    }

    for (const call of toolCalls) {
      if (call.type !== 'function') continue;
      const tool = tools[call.function.name];
      let toolResultText: string;
      if (!tool) {
        toolResultText = JSON.stringify({ error: `Unknown tool: ${call.function.name}` });
      } else {
        try {
          const args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
          const result = await tool.handler(args, ctx);
          toolResultText = JSON.stringify(result ?? null);
        } catch (err) {
          toolResultText = JSON.stringify(formatToolError(err));
        }
      }
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: toolResultText,
      });
    }
  }

  logger.warn({ discordUserId: opts.discordUserId }, 'agent hit tool round limit');
  return {
    reply:
      'I ran out of steps trying to answer that. Try splitting your request into smaller questions.',
    stagedPendingAction: ctx.stagedPendingAction,
  };
}

function formatToolError(err: unknown): { error: string; status?: number } {
  if (err instanceof ContinuumApiError) {
    if (err.status === 403) {
      return {
        error:
          "You don't have access to that resource. If you guessed an id, do NOT retry with another guess — " +
          'verify the id via the matching list/resolve tool (resolve_project, list_milestones, list_project_members, ' +
          'list_repositories, list_pending_invitations) or ask the user.',
        status: 403,
      };
    }
    if (err.status === 404) {
      return {
        error:
          'Not found — the id you passed does not exist. Do NOT retry with a different guess. Verify the id via ' +
          'the matching list/resolve tool (resolve_project, get_task, list_milestones, list_project_members, ' +
          'list_repositories, list_pending_invitations) or ask the user for the right value.',
        status: 404,
      };
    }
    if (err.status === 429) return { error: 'Rate limit hit — try again in a moment.', status: 429 };
    return { error: `API error ${err.status}`, status: err.status };
  }
  if (err instanceof Error) return { error: err.message };
  return { error: 'unknown error' };
}
