import { describe, expect, it } from 'vitest';
import { buildOidcSettings, isAuthRequired, resolveApiBaseUrl } from '../auth/auth-config';

describe('auth-config', () => {
  it('builds PKCE code flow settings', () => {
    const s = buildOidcSettings({
      VITE_OIDC_AUTHORITY: 'http://localhost:8181/realms/bridge',
      VITE_OIDC_CLIENT_ID: 'bridge-control-center'
    });
    expect(s.response_type).toBe('code');
    expect(s.client_id).toBe('bridge-control-center');
    expect(s.scope).toContain('openid');
  });

  it('requires auth when enabled', () => {
    expect(isAuthRequired({ VITE_OIDC_ENABLED: '1' })).toBe(true);
    expect(isAuthRequired({ VITE_OIDC_AUTHORITY: 'x', VITE_REQUIRE_AUTH: '1' })).toBe(true);
    expect(isAuthRequired({})).toBe(false);
  });

  it('resolves API base', () => {
    expect(resolveApiBaseUrl({ VITE_BRIDGE_API_URL: 'http://localhost:4000/' })).toBe('http://localhost:4000');
  });
});
