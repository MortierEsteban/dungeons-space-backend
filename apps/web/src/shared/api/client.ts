import type { ApiErrorBody } from '@ds/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorBody['error']['code'] | 'network',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

/** Client HTTP unique : cookies de session httpOnly (même origine), erreurs typées et lisibles. */
async function request<T>(method: Method, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined && !(body instanceof FormData) ? { 'content-type': 'application/json' } : undefined,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'Le portail est injoignable. Vérifiez votre connexion.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!res.ok) {
    const err = data?.error;
    throw new ApiError(res.status, err?.code ?? 'internal', err?.message ?? 'Un sortilège a mal tourné.', err?.details);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  del: (path: string) => request<void>('DELETE', path),
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ url: string }>('POST', '/uploads', form);
  },
};

export function toQuery(params: Record<string, string | number | undefined | null>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : '';
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Un sortilège a mal tourné.';
}

/** Clés de cache centralisées : une seule source de vérité pour l'invalidation. */
export const qk = {
  me: ['me'] as const,
  invitations: ['invitations'] as const,
  campaigns: ['campaigns'] as const,
  discover: ['campaigns', 'discover'] as const,
  campaign: (id: string) => ['campaign', id] as const,
  sessions: (id: string) => ['campaign', id, 'sessions'] as const,
  events: (id: string) => ['campaign', id, 'events'] as const,
  eventLinks: (id: string) => ['campaign', id, 'event-links'] as const,
  characters: (id: string) => ['campaign', id, 'characters'] as const,
  encounters: (id: string) => ['campaign', id, 'encounters'] as const,
  constellation: (id: string) => ['campaign', id, 'constellation'] as const,
  suggestions: (id: string) => ['campaign', id, 'constellation', 'suggestions'] as const,
  myCharacters: ['characters', 'mine'] as const,
  character: (id: string) => ['character', id] as const,
  notes: (id: string) => ['character', id, 'notes'] as const,
  encounter: (id: string) => ['encounter', id] as const,
  compendium: ['compendium'] as const,
  creations: ['creations'] as const,
  rulesets: ['rulesets'] as const,
};
