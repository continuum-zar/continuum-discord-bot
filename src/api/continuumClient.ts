import { loadConfig } from '../config.js';
import {
  forceRefresh,
  getAccessTokenForUser,
} from '../auth/tokenManager.js';

const config = loadConfig();

export class ContinuumApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: string,
  ) {
    super(`Continuum API ${status}: ${body.slice(0, 800)}`);
    this.name = 'ContinuumApiError';
  }
}

function baseUrl(): string {
  return config.CONTINUUM_API_BASE_URL.replace(/\/$/, '');
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request<T>(
  discordUserId: string,
  method: Method,
  path: string,
  body?: unknown,
  attempt = 0,
): Promise<T> {
  const token = await getAccessTokenForUser(discordUserId);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401 && attempt === 0) {
    await forceRefresh(discordUserId);
    return request<T>(discordUserId, method, path, body, attempt + 1);
  }

  const text = await res.text();
  if (!res.ok) throw new ContinuumApiError(res.status, text);
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export const continuumClient = {
  get: <T>(discordUserId: string, path: string) =>
    request<T>(discordUserId, 'GET', path),
  post: <T>(discordUserId: string, path: string, body?: unknown) =>
    request<T>(discordUserId, 'POST', path, body),
  patch: <T>(discordUserId: string, path: string, body?: unknown) =>
    request<T>(discordUserId, 'PATCH', path, body),
  put: <T>(discordUserId: string, path: string, body?: unknown) =>
    request<T>(discordUserId, 'PUT', path, body),
  delete: <T>(discordUserId: string, path: string) =>
    request<T>(discordUserId, 'DELETE', path),
};
