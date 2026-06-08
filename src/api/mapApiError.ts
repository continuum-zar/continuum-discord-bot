import { ContinuumApiError } from './continuumClient.js';
import { LinkExpiredError, NotLinkedError } from '../auth/tokenManager.js';

export interface MappedError {
  user: string;
  status?: number;
}

export interface MapApiErrorContext {
  /** Optional hint about what was being attempted, used to pick context-specific 400/409 messages. */
  kind?: string;
}

export function mapApiError(err: unknown, ctx: MapApiErrorContext = {}): MappedError {
  if (err instanceof NotLinkedError) {
    return { user: 'You are not linked. Run `/link`.' };
  }
  if (err instanceof LinkExpiredError) {
    return { user: 'Your Continuum link expired. Run `/link` to reconnect.' };
  }
  if (err instanceof ContinuumApiError) {
    return mapContinuumApiError(err, ctx);
  }
  if (err instanceof Error) {
    return { user: err.message };
  }
  return { user: 'Something went wrong.' };
}

function mapContinuumApiError(err: ContinuumApiError, ctx: MapApiErrorContext): MappedError {
  const body = (err.body || '').toLowerCase();
  const trimmed = err.body ? err.body.slice(0, 200) : '';

  switch (err.status) {
    case 400: {
      if (body.includes('linked_branch') || body.includes('branch not linked')) {
        return { user: "That branch isn't linked to the task yet. Link it first, then build.", status: 400 };
      }
      if (body.includes('milestone') && body.includes('different project')) {
        return { user: "That milestone belongs to a different project.", status: 400 };
      }
      if (body.includes('task') && body.includes('does not belong')) {
        return { user: 'That task belongs to a different project than the one specified.', status: 400 };
      }
      return { user: trimmed ? `Validation error: ${trimmed}` : 'Validation error.', status: 400 };
    }
    case 403: {
      if (ctx.kind === 'start_build' && (body.includes('repo') || body.includes('credential') || body.includes('token'))) {
        return { user: 'Git credentials missing for this repo — fix in Continuum project settings.', status: 403 };
      }
      if (body.includes('admin') || body.includes('project manager') || body.includes('projectmanager')) {
        return { user: "You don't have permission for that — needs project-manager or admin access.", status: 403 };
      }
      return { user: "You don't have permission for that (needs PM/admin or project membership).", status: 403 };
    }
    case 404:
      return { user: 'Not found.', status: 404 };
    case 409: {
      if (body.includes('already') && body.includes('exist')) {
        return { user: 'Already exists.', status: 409 };
      }
      if (body.includes('active') || body.includes('running') || body.includes('queued')) {
        return { user: 'A build is already running for this project. Wait or cancel it in Continuum.', status: 409 };
      }
      return { user: trimmed ? `Conflict: ${trimmed}` : 'Conflict.', status: 409 };
    }
    case 422:
      return { user: trimmed ? `Validation error: ${trimmed}` : 'Validation error.', status: 422 };
    case 429:
      return { user: 'Rate limit hit — try again shortly.', status: 429 };
    case 503:
      return { user: 'Service unavailable — try again shortly.', status: 503 };
    default:
      return { user: `Continuum API error (${err.status}).`, status: err.status };
  }
}
