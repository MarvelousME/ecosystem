# ADR: Identity Authority

- **Status:** Accepted direction; implementation PARTIAL
- **Date:** 2026-09-09

## Context

Need production-style OIDC while keeping local DX simple.

## Decision

- **Keycloak** is the identity provider (realm import in Compose).
- Lab default: trust `x-actor-*` headers.
- Optional gate: `BRIDGE_REQUIRE_JWT=1` requires Bearer token.
- **Full JWKS validation is not yet implemented** (stub sets `unverifiedJwt: true`).

## Consequences

- Safe for local demo only when headers are trusted.
- Must not enable JWT mode in shared environments until jose/JWKS lands.
- Role mapping from Keycloak → Bridge permissions is future work.
