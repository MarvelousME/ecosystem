# ADR: PostgreSQL Platform Data

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

Need a single System of Record for multi-tenant SaaS control plane.

## Decision

**PostgreSQL** (Compose: postgres 17) is SoR for tenants, apps, billing, CMS metadata, brand, databases control plane, workflows, agents, capabilities, audit, sagas. Schema evolves via `001-init.sql` and `002-platform-expansion.sql`.

## Consequences

- Clear ownership vs WordPress content DB.
- Existing volumes need manual apply of new SQL files.
- Platform API is the only intended writer for SoR tables.
