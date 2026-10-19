// Cliente da API. O token fica no localStorage; 401 derruba a sessão.
const TOKEN_KEY = 'pixel.token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (t: string | null) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* sem storage */ } };

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(`/api${url}`, {
      method,
      headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}), ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Não foi possível falar com o servidor. Confira a conexão.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !url.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, data?.error || 'Algo deu errado. Tente novamente.');
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** Endereço para abrir/baixar um arquivo (o token vai na URL porque abre em nova aba). */
export const fileUrl = (id: string, download = false) => `/api/files/${id}/download?token=${encodeURIComponent(getToken() || '')}${download ? '&download=1' : ''}`;

/** PDF do orçamento/OS (abre em nova aba ou no iframe; o token vai na URL). */
export const pdfUrl = (kind: 'quotes' | 'orders', id: string, download = false) => `/api/${kind}/${id}/pdf?token=${encodeURIComponent(getToken() || '')}${download ? '&download=1' : ''}`;

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado. Tente novamente.');
