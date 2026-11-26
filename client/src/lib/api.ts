const TOKEN_KEY = 'tianshu_token';

export function getStoredToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token: string): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function apiRequest<T = any>(path: string, options?: { method?: string; body?: any }): Promise<T> {
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
