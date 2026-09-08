# 15 — Subsystem Catalog

Seeded in `subsystems` (migration `002`) and readable via `/api/subsystems`.

| ID | Version | Owner | Description | Status |
|----|---------|-------|-------------|--------|
| `website` | 1.0.0 | platform | Website capabilities (read/update/preview/publish) | PARTIAL — provider adapters exist; builders shallow |
| `billing` | 1.0.0 | platform | Payment authorize + subscription activate | PASS (code) — manual provider + idempotency |
| `ai` | 1.0.0 | platform | Agent execute capability | PARTIAL — phone-change demo; not full agent runtime |
| `database` | 1.0.0 | platform | Database provision capability | PARTIAL — control-plane rows; sqlserver/mongo UNVERIFIED |

## Implied subsystems (code present, not all seeded as rows)

| Name | Evidence | Status |
|------|----------|--------|
| Identity | Keycloak + optional JWT hook | PARTIAL |
| Tenancy/kernel | `lib/kernel.js` | PASS (code) |
| Security rules / Cloudflare | API routes | PARTIAL |
| Affiliate/growth | affiliates/conversions | PASS (code) |
| Support/CRM | tickets, leads, clients 360 | PARTIAL |
| Observability | /metrics + Prometheus | PARTIAL |
| Provisioning | sagas + worker | PARTIAL |
| CMS/brand | models/entries/brand/components | PARTIAL |
| MCP frontend | `services/frontend-mcp` | PARTIAL |

## Ownership rule

Subsystems expose capabilities; apps consume capabilities; providers implement contracts. WordPress is a provider target, not a subsystem authority.
