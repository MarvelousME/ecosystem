# 13 — SWOT / Gap Analysis

## Strengths

- Clear SoR: Postgres + platform-api.
- Expanded schema covering clients, billing, CMS, agents, capabilities.
- Modular kernel/RBAC/capabilities/providers.
- Fail-closed external providers (AI, Cloudflare).
- Real provision saga steps + billing idempotency design.
- WordPress demoted to connector runtime (correct tenancy stance).

## Weaknesses

- Control Center still uses lab identity headers by default (OIDC login UX pending).
- Workflow “engine” is shallow (CRUD + sync execute).
- External KMS / edge TLS not wired.
- SQL Server/Mongo providers UNVERIFIED without engines.

## Opportunities

- Control Center OIDC login; drop header trust in shared envs.
- JetStream durable consumers + DLQ.
- ZIP promote worker after quarantine release.
- Compose E2E CI with Docker Engine.

## Threats

- False production confidence from Compose “full” profile without KMS/TLS.
- Dual content stores drift (WP vs platform CMS / puck_pages).
- SQL Server/Mongo marked READY incorrectly if callers ignore UNVERIFIED status (API sets UNVERIFIED — good).

## Gap matrix (target vs now)

| Target | Now | Gap status |
|--------|-----|------------|
| Identity authority enforced | jose JWKS + gated headers | PASS (lab); enable `BRIDGE_REQUIRE_JWT=1` for shared |
| Capability fabric | Seeded + execute helper | PARTIAL |
| Multi-tenant isolation | Shared schema + header tenant | PARTIAL |
| Durable workflows | DB rows + sync execute | PARTIAL |
| Observability plane | Metrics + audit + optional CH writers | PARTIAL |
| Builder UX | Puck schema/pages + Gutenberg deep links | PASS (API); SPA host optional |
| Evidence E2E | Unit + CI config; Docker E2E env-dependent | PARTIAL |

## Overall

**LAB-COMPLETE** — architecture direction locked; production completeness requires KMS/TLS/OIDC UX/JetStream durables.
