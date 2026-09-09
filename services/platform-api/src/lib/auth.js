import { createRemoteJWKSet, jwtVerify } from 'jose';
import { fail } from './kernel.js';

const ROLE_MAP = {
  platform_admin: 'platform.admin',
  tenant_admin: 'tenant.admin',
  tenant_user: 'tenant.viewer',
  'platform.admin': 'platform.admin',
  'tenant.admin': 'tenant.admin',
  'tenant.editor': 'tenant.editor',
  'tenant.viewer': 'tenant.viewer',
  'support.impersonate': 'support.impersonate'
};

let jwks;

function issuer() {
  return process.env.BRIDGE_JWT_ISSUER || '';
}

function audience() {
  return process.env.BRIDGE_JWT_AUDIENCE || 'bridge-api';
}

function jwksUrl() {
  const iss = issuer().replace(/\/$/, '');
  if (!iss) return '';
  return process.env.BRIDGE_JWKS_URL || `${iss}/protocol/openid-connect/certs`;
}

function getJwks() {
  const url = jwksUrl();
  if (!url) return null;
  if (!jwks) jwks = createRemoteJWKSet(new URL(url));
  return jwks;
}

export function mapRealmRoles(claimRoles = []) {
  const out = new Set();
  for (const r of claimRoles) {
    const mapped = ROLE_MAP[r] || ROLE_MAP[String(r).replace(/-/g, '_')];
    if (mapped) out.add(mapped);
  }
  return [...out];
}

export function extractRolesFromPayload(payload) {
  const realm = payload?.realm_access?.roles || [];
  const resource = payload?.resource_access?.[audience()]?.roles || [];
  const bridge = payload?.bridge_roles || payload?.roles || [];
  return mapRealmRoles([...realm, ...resource, ...bridge]);
}

/** True when headers must not be trusted for identity/roles. */
export function headersUntrusted() {
  if (process.env.BRIDGE_REQUIRE_JWT === '1') return true;
  if (process.env.BRIDGE_TRUST_HEADERS === '0') return true;
  if (process.env.NODE_ENV === 'production' && process.env.BRIDGE_TRUST_HEADERS !== '1') return true;
  return false;
}

export async function verifyBearerToken(authorization) {
  if (!authorization?.startsWith('Bearer ')) {
    throw fail('UNAUTHORIZED', 'Bearer token required', 401);
  }
  const token = authorization.slice(7).trim();
  if (!token) throw fail('UNAUTHORIZED', 'Bearer token required', 401);

  const keySet = getJwks();
  const iss = issuer();
  if (!keySet || !iss) {
    throw fail('AUTH_MISCONFIGURED', 'BRIDGE_JWT_ISSUER / JWKS not configured', 503);
  }

  try {
    const { payload } = await jwtVerify(token, keySet, {
      issuer: iss
      // Keycloak often sets azp=clientId and aud=account — validate below
    });
    const aud = audience();
    if (aud) {
      const audOk =
        payload.aud === aud ||
        (Array.isArray(payload.aud) && payload.aud.includes(aud)) ||
        payload.azp === aud;
      if (!audOk) {
        throw fail('UNAUTHORIZED', `JWT audience/azp mismatch (expected ${aud})`, 401);
      }
    }
    const roles = extractRolesFromPayload(payload);
    if (!roles.length) {
      throw fail('FORBIDDEN', 'token has no mappable Bridge roles', 403);
    }
    return {
      sub: payload.sub || 'unknown',
      email: payload.email || payload.preferred_username || null,
      roles,
      claims: {
        iss: payload.iss,
        aud: payload.aud,
        azp: payload.azp,
        exp: payload.exp
      },
      unverifiedJwt: false
    };
  } catch (e) {
    if (e.statusCode) throw e;
    throw fail('UNAUTHORIZED', `JWT validation failed: ${e.message}`, 401);
  }
}

/**
 * Resolve request identity.
 * Lab default: trust x-actor-* headers unless JWT required / headers untrusted.
 */
export async function resolveIdentity(req) {
  const requireJwt =
    process.env.BRIDGE_REQUIRE_JWT === '1' ||
    (process.env.NODE_ENV === 'production' && process.env.BRIDGE_REQUIRE_JWT !== '0');
  const auth = req.headers.authorization || '';

  if (requireJwt || auth.startsWith('Bearer ')) {
    if (requireJwt && !auth.startsWith('Bearer ')) {
      throw fail('UNAUTHORIZED', 'Bearer token required', 401);
    }
    if (auth.startsWith('Bearer ')) {
      return verifyBearerToken(auth);
    }
  }

  if (headersUntrusted()) {
    throw fail('UNAUTHORIZED', 'identity headers disabled; provide Bearer JWT', 401);
  }

  return {
    sub: req.headers['x-actor-id'] || 'bridgeadmin',
    roles: String(req.headers['x-actor-roles'] || 'platform.admin').split(',').filter(Boolean),
    email: req.headers['x-actor-email'] || 'bridgeadmin@local',
    unverifiedJwt: false,
    labHeaders: true
  };
}
