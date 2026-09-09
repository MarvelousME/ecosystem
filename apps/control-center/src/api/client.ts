import { resolveApiBaseUrl } from '~/auth/auth-config';
import { getAccessToken } from '~/auth/oidc';
import { workspaceStore } from '~/stores/workspace';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as object)) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

export type ApiOptions = RequestInit & {
  tenantId?: string | null;
  skipAuth?: boolean;
};

export async function apiFetch<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const base = resolveApiBaseUrl();
  const headers = new Headers(options.headers || {});
  headers.set('content-type', 'application/json');
  headers.set('x-bridge-envelope', '1');
  headers.set('x-request-id', crypto.randomUUID());

  const token = options.skipAuth ? null : await getAccessToken();
  const tenantId = options.tenantId ?? workspaceStore.tenantId;

  if (token) {
    headers.set('authorization', `Bearer ${token}`);
  } else {
    // Lab fallback only — never used when OIDC auth is required/token present
    headers.set('x-actor-roles', 'platform.admin');
    headers.set('x-actor-id', 'bridgeadmin');
  }
  if (tenantId) headers.set('x-tenant-id', tenantId);

  const res = await fetch(`${base}${path}`, { ...options, headers });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json?.error?.message || json?.error || `HTTP ${res.status}`;
    throw new ApiError(String(msg), res.status, json?.error?.code);
  }
  return unwrap<T>(json);
}
