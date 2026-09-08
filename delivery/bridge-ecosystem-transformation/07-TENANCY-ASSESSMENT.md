# 07 — Tenancy Assessment

## Model

- **Tenant** is the primary isolation boundary (`tenants` table).
- **Client** is commercial entity; `client_tenants` and `tenants.client_id` link CRM 360 views.
- `isolation_mode` column defaults to `SHARED` (row-level shared Postgres).
- WordPress is **not** the tenancy authority.

## Enforcement (as-built)

| Mechanism | Status |
|-----------|--------|
| `x-tenant-id` required via `requireTenant` | PASS (code) |
| SQL filters `WHERE tenant_id=$1` on tenant resources | PARTIAL — consistently used on core domains |
| Membership from authenticated token | FAIL — headers only |
| Cross-tenant leak probe | PASS (code) — `/api/isolation/check` |
| Test assertion in `Test-Bridge.ps1` | PASS (script) — needs live API |
| Per-tenant DB isolation mode | UNVERIFIED — column exists; dedicated DBs not fully automated |
| WP multisite tenancy | FAIL / N/A — single WP instance in Compose |

## Seed

- Slug `bridge-demo`, plan `enterprise`, linked demo client.
- Multiple apps under one tenant (WP, React, AI Hub, Store).

## Residual risks

1. Platform-admin routes that list all clients/tenants are intentional but amplify blast radius if JWT stub remains.
2. Foreign-key cascades delete tenant children — correct, but backup drills required before prod.
3. Connector calls use internal WP URL without tenant routing for multi-WP fleets.

## Verdict

**PARTIAL** — shared-schema tenancy is implemented for API data; identity-bound membership and dedicated isolation modes are not production-ready.
