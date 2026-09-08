# 22 — Test Plan (Delivery Evidence)

Aligned with `docs/TEST-PLAN.md` and `scripts/Test-Bridge.*`. Status reflects **this delivery pack**, not aspirational greens.

## A. Static / unit (no Docker)

| ID | Case | Expected | Status |
|----|------|----------|--------|
| U1 | Kernel `ok`/`fail` | Envelope + statusCode | PASS (code) — run `node --test` |
| U2 | RBAC admin/viewer | Grants correct | PASS (code) |
| U3 | Website provider resolve | wordpress/nextjs/null | PASS (code) |

## B. Compose smoke (requires Docker)

| ID | Case | Expected | Status |
|----|------|----------|--------|
| S1 | `docker compose up` core | Containers healthy | UNVERIFIED |
| S2 | `GET /health` | healthy | UNVERIFIED |
| S3 | `Test-Bridge.ps1` | All asserts PASS | UNVERIFIED |
| S4 | WP connector `/health` | healthy | UNVERIFIED |
| S5 | MCP `/health` + tools/list | healthy | UNVERIFIED (historically PASS in VERIFICATION.md) |
| S6 | Full profile Prometheus scrape | targets up | UNVERIFIED |

## C. Acceptance scenarios (docs)

| ID | Scenario | Status |
|----|----------|--------|
| A1 | Control Center demo tenant + app launcher | UNVERIFIED |
| A2 | Managed resource legal/illegal transitions | UNVERIFIED |
| A3 | AI chat configured vs 503 | UNVERIFIED (code fail-closed PASS) |
| A4 | Affiliate conversion idempotency | UNVERIFIED |
| A5 | Tenant-scoped IP rules | UNVERIFIED |
| A6 | Provision saga completed + NATS | UNVERIFIED (worker code PASS) |
| A7 | Cloudflare purge success or explicit fail | UNVERIFIED (code fail-closed PASS) |

## D. Explicit non-goals this cycle

- Full OIDC JWKS proof
- Puck/Gutenberg E2E
- ZIP import
- Redis/ClickHouse write proofs
- SQL Server/Mongo live

## Gate for “fully transformed”

All of B (S1–S3 minimum) PASS with attached logs **and** JWKS validation PASS. Until then verdict remains **PARTIALLY TRANSFORMED**.
