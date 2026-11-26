import { demoRequest } from './backend';

const TOKEN_KEY = 'tianshu_token';
let memoryToken = '';

export function getStoredToken(): string {
  if (demoRequest) return memoryToken;
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return memoryToken;
  }
}

export function setStoredToken(token: string): void {
  memoryToken = token;
  if (demoRequest) return;
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable */
  }
}

export async function apiRequest<T = any>(path: string, options?: { method?: string; body?: any }): Promise<T> {
  if (demoRequest) return demoRequest(path, options) as Promise<T>;
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resp = await fetch(`/api${path}`, {
    method: options?.method || (options?.body ? 'POST' : 'GET'),
    headers,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    if (resp.status === 401) {
      setStoredToken('');
    }
    throw new Error(data.error || `请求失败 (${resp.status})`);
  }
  return data as T;
}
