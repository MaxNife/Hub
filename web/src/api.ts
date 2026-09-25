// Every call to Hub's API goes through here: state-changing requests carry
// the X-Hub-Request header the server requires, and a 401 tells the shell
// to show the sign-in screen.

export const UNAUTHORIZED = 'hub:unauthorized';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Init = Omit<RequestInit, 'body'> & { body?: BodyInit; json?: unknown };

export async function api(path: string, init: Init = {}): Promise<Response> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  if (method !== 'GET' && method !== 'HEAD') headers.set('X-Hub-Request', '1');
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  const r = await fetch(path, { ...init, method, headers, body, credentials: 'same-origin' });
  if (r.status === 401 && path.startsWith('/api/') && path !== '/api/login') {
    window.dispatchEvent(new Event(UNAUTHORIZED));
  }
  return r;
}

export async function apiJSON<T>(path: string, init: Init = {}): Promise<T> {
  const r = await api(path, init);
  const text = await r.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON error page
  }
  if (!r.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `${r.status} ${r.statusText}`;
    throw new ApiError(r.status, msg);
  }
  return data as T;
}
