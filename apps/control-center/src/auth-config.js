/**
 * Pure OIDC settings builder (unit-testable; no browser APIs).
 * @param {Record<string, string | undefined>} env
 */
export function buildOidcSettings(env = {}) {
  return {
    authority: env.VITE_OIDC_AUTHORITY || 'http://localhost:8081/realms/bridge',
    client_id: env.VITE_OIDC_CLIENT_ID || 'bridge-control-center',
    redirect_uri: env.VITE_OIDC_REDIRECT_URI || 'http://localhost:5173/auth/callback',
    post_logout_redirect_uri:
      env.VITE_OIDC_POST_LOGOUT_REDIRECT_URI || 'http://localhost:5173/',
    scope: env.VITE_OIDC_SCOPE || 'openid profile email',
    response_type: 'code',
    response_mode: 'query',
    code_challenge_method: 'S256'
  };
}

/**
 * Whether Control Center must gate the app behind login.
 * @param {Record<string, string | undefined>} env
 */
export function isAuthRequired(env = {}) {
  if (env.VITE_OIDC_ENABLED === '1') return true;
  if (env.VITE_OIDC_AUTHORITY && env.VITE_REQUIRE_AUTH === '1') return true;
  return false;
}

/**
 * @param {Record<string, string | undefined>} env
 */
export function resolveApiBaseUrl(env = {}) {
  return (
    env.VITE_BRIDGE_API_URL ||
    env.VITE_API_BASE_URL ||
    'http://localhost:4000'
  );
}
