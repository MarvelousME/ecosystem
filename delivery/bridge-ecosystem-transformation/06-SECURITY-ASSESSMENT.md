# 06 — Security Assessment

## Findings

| Control | Status | Evidence / gap |
|---------|--------|----------------|
| Tenant filter on queries | PARTIAL | Most tenant routes use `requireTenant`; clients list is platform-wide |
| RBAC deny-by-default | PASS (code) | `lib/rbac.js` + unit tests |
| JWT required in prod | FAIL / PARTIAL | Optional `BRIDGE_REQUIRE_JWT`; no JWKS |
| JWT signature validation | FAIL | Stub user with `unverifiedJwt: true` |
| Keycloak present | PASS (compose) | `infra/keycloak/bridge-realm.json` |
| CORS | PARTIAL | `origin: true` — permissive for lab |
| Secrets in env files | FAIL (prod) | `.env.example` plaintext placeholders |
| Secret store table | PARTIAL | Schema stub; not envelope-encryption/KMS |
| Cloudflare purge fail-closed | PASS (code) | 503 if unset |
| AI fail-closed | PASS (code) | 503 if unset |
| Audit trail | PARTIAL | `audit_log` writes; not immutable sink |
| WP connector auth | PARTIAL | `edit_pages` or service auth helper |
| Isolation probe API | PASS (code) | `/api/isolation/check` |
| TLS termination | FAIL | Local HTTP ports only |
| Dependency/CI scanning | FAIL | No CI workflow |

## Threat notes (lab)

- Header-based roles (`x-actor-roles`) are **spoofable** when JWT not required — acceptable only for local demo.
- Enabling `BRIDGE_REQUIRE_JWT=1` without JWKS creates a **false sense of security**.
- Impersonation headers exist in Control Center client; server-side impersonation policy not fully evidenced as locked down.

## Recommendations (ordered)

1. Implement jose + JWKS against Keycloak; map realm roles → Bridge permissions.
2. Remove header role trust when JWT mode is on.
3. Bind secrets to a real manager; rotate demo passwords.
4. Tighten CORS and add TLS in reverse proxy.
5. Add CI SAST + image scan.

## Verdict

**PARTIAL** for a lab scaffold; **FAIL** against production security bar.
