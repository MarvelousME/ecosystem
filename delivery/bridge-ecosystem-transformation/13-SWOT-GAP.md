# 13 — SWOT / Gap Analysis

## Strengths

- Clear SoR: Postgres + platform-api.
- Expanded schema covering clients, billing, CMS, agents, capabilities.
- Modular kernel/RBAC/capabilities/providers.
- Fail-closed external providers (AI, Cloudflare).
- Real provision saga steps + billing idempotency design.
- WordPress demoted to connector runtime (correct tenancy stance).

## Weaknesses

- Optional JWT without JWKS.
- Redis/ClickHouse present but unwired.
- Visual builders catalog-only.
- No CI; E2E UNVERIFIED.
- Workflow “engine” is shallow.
- Secrets are env/stub ciphertext.

## Opportunities

- Complete OIDC and drop header trust.
- Wire Redis for sessions/rate limits; ClickHouse for audit analytics.
- Implement Puck/Gutenberg providers behind capability contracts.
- Add GitHub Actions: unit + compose smoke.
- ZIP import for site bootstrap.

## Threats

- False production confidence from Compose “full” profile.
- Spoofable admin headers in shared environments.
- Dual content stores drift (WP vs platform CMS).
- SQL Server/Mongo marked READY incorrectly if callers ignore UNVERIFIED status (API sets UNVERIFIED — good).

## Gap matrix (target vs now)

| Target | Now | Gap status |
|--------|-----|------------|
| Identity authority enforced | Optional stub | FAIL |
| Capability fabric | Seeded + execute helper | PARTIAL |
| Multi-tenant isolation | Shared schema + header tenant | PARTIAL |
| Durable workflows | DB rows + sync execute | PARTIAL |
| Observability plane | Metrics stub | PARTIAL |
| Builder UX | Absent | FAIL |
| Evidence E2E | Missing | UNVERIFIED |

## Overall

**PARTIALLY TRANSFORMED** — architecture direction locked; production completeness incomplete.
