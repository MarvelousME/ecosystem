export type EnvLike = Record<string, string | boolean | undefined>;

export function resolveApiBaseUrl(env: EnvLike = import.meta.env): string {
  return String(env.VITE_API_BASE_URL || env.VITE_BRIDGE_API_URL || 'http://localhost:4000').replace(/\/$/, '');
}

export function isAuthRequired(env: EnvLike = import.meta.env): boolean {
  if (String(env.VITE_OIDC_ENABLED) === '1') return true;
  return Boolean(env.VITE_OIDC_AUTHORITY) && String(env.VITE_REQUIRE_AUTH) === '1';
}

export function buildOidcSettings(env: EnvLike = import.meta.env) {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  return {
    authority: String(env.VITE_OIDC_AUTHORITY || 'http://localhost:8181/realms/bridge'),
    client_id: String(env.VITE_OIDC_CLIENT_ID || 'bridge-control-center'),
    redirect_uri: String(env.VITE_OIDC_REDIRECT_URI || `${origin}/auth/callback`),
    post_logout_redirect_uri: String(env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI || `${origin}/`),
    response_type: 'code',
    scope: String(env.VITE_OIDC_SCOPE || 'openid profile email'),
    automaticSilentRenew: true,
    loadUserInfo: true
  };
}
