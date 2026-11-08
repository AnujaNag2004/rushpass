import type { AuthResponse } from '@rushpass/shared';
import { useAuth } from '../store/auth';

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

interface Options {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
  /** Retry once with a refreshed access token on 401. */
  retry?: boolean;
}

let refreshing: Promise<string | null> | null = null;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function doRefresh(): Promise<string | null> {
  // Retry network errors / 5xx (e.g. the API restarting); only a real 401 means "logged out".
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, { method: 'POST', credentials: 'include' });
      if (res.ok) {
        const body = (await res.json()) as { data: AuthResponse };
        useAuth.getState().setSession(body.data.user, body.data.accessToken);
        return body.data.accessToken;
      }
      if (res.status < 500) break;
    } catch {
      /* network error — retry */
    }
    await wait(600 * (attempt + 1));
  }
  useAuth.getState().clear();
  return null;
}

/** Single-flight refresh: concurrent 401s share one /auth/refresh call. */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = doRefresh().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request<T>(path: string, opts: Options = {}): Promise<T> {
  const token = useAuth.getState().accessToken;
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    method: opts.method ?? 'GET',
    credentials: 'include',
    headers: {
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (res.status === 401 && opts.retry !== false && token && !path.startsWith('/auth/')) {
    const fresh = await refreshAccessToken();
    if (fresh) return request<T>(path, { ...opts, retry: false });
  }

  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const err = json?.error ?? {};
    throw new ApiError(res.status, err.code ?? 'HTTP_ERROR', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return json as T;
}

/** Helpers return the `data` field of the standard `{ data }` envelope. */
export const api = {
  get: <T>(path: string) => request<{ data: T }>(path).then((r) => r.data),
  list: <T>(path: string) => request<{ data: T[]; meta: { page: number; pageSize: number; total: number } }>(path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<{ data: T }>(path, { method: 'POST', body: body ?? {}, headers }).then((r) => r.data),
  patch: <T>(path: string, body: unknown) => request<{ data: T }>(path, { method: 'PATCH', body }).then((r) => r.data),
  put: <T>(path: string, body: unknown) => request<{ data: T }>(path, { method: 'PUT', body }).then((r) => r.data),
  del: <T>(path: string) => request<{ data: T }>(path, { method: 'DELETE' }).then((r) => r.data),
};

/** Downloads an authenticated file (e.g. the PDF ticket). */
export async function downloadFile(path: string, filename: string) {
  const doFetch = () =>
    fetch(`${API_URL}/api/v1${path}`, {
      credentials: 'include',
      headers: { Authorization: `Bearer ${useAuth.getState().accessToken ?? ''}` },
    });
  let res = await doFetch();
  if (res.status === 401 && (await refreshAccessToken())) res = await doFetch();
  if (!res.ok) throw new ApiError(res.status, 'DOWNLOAD_FAILED', 'Could not download the file');
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function errorMessage(err: unknown) {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Something went wrong';
}
