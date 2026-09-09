# ADR: Identity Authority

- **Status:** Accepted; JWKS implemented
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

Need production-style OIDC while keeping local DX simple.

## Decision

- **Keycloak** is the identity provider (realm import in Compose).
- Lab default: trust `x-actor-*` headers when `BRIDGE_REQUIRE_JWT` is unset/`0` and `BRIDGE_TRUST_HEADERS` is not `0`.
- `BRIDGE_REQUIRE_JWT=1` requires Bearer token validated via **jose** against Keycloak JWKS (`BRIDGE_JWT_ISSUER` + `/protocol/openid-connect/certs`).
- Audience check accepts `aud` or Keycloak `azp` matching `BRIDGE_JWT_AUDIENCE`.
- Realm roles map: `platform_admin` → `platform.admin`, `tenant_admin` → `tenant.admin`, `tenant_user` → `tenant.viewer`.
- In `NODE_ENV=production`, headers are untrusted unless `BRIDGE_TRUST_HEADERS=1`.

## Consequences

- Shared/staging environments should set `BRIDGE_REQUIRE_JWT=1` and `BRIDGE_TRUST_HEADERS=0`.
- Control Center lab still uses headers until it is switched to OIDC login.
- Tokens without mappable realm roles are rejected (403).
