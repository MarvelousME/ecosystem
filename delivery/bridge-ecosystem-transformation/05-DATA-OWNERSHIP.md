# 05 — Data Ownership

## System of Record

| Domain | Owner store | Writer | Status |
|--------|-------------|--------|--------|
| Tenants, clients, orgs | Postgres | platform-api | PASS |
| Apps, domains, deployments | Postgres | platform-api / provision-worker | PASS / PARTIAL |
| Billing (products, orders, payments, subscriptions, invoices) | Postgres | platform-api | PASS |
| Event inbox / payment idempotency | Postgres `event_inbox`, `payments UNIQUE` | platform-api | PASS |
| CMS models/entries, scoped config, brand | Postgres | platform-api | PASS |
| Capabilities, providers, subsystems | Postgres seed + API read | migrations | PASS |
| Workflows / executions | Postgres | platform-api | PARTIAL |
| Agents, executions, changesets, ai_memory, artifacts | Postgres | platform-api | PARTIAL |
| Audit log, outbox, sagas, saga_steps | Postgres | api + worker | PASS (code) |
| Database instance control plane | Postgres `database_instances` | api + worker | PARTIAL |
| Secrets | Postgres `secret_store` ciphertext stub | schema only | FAIL (not real KMS) |
| WordPress posts/pages/media | MariaDB (WP) | WordPress + connector | PARTIAL |
| Redis keys | Redis | **none** | FAIL |
| Analytics events | ClickHouse `bridge_events` | **none** | UNVERIFIED |

## Ownership rules (as-built)

1. **Platform Postgres is SoR** for multi-tenant SaaS control-plane data.
2. **WordPress MySQL/MariaDB** owns WP content for WP-typed apps only.
3. **Connectors must not invent tenants**; tenant_id always comes from platform context.
4. **Payments** use provider + `external_event_key` uniqueness; duplicates return `duplicate: true`.

## Cross-store consistency

| Flow | Mechanism | Status |
|------|-----------|--------|
| Provision | saga + outbox + NATS | PARTIAL — publish not transactional relay |
| Phone change publish to WP | changeset approve → connector `/pages/apply` | PARTIAL — may return `unverified` |
| Entitlements usage bump | `bumpUsage` on capability paths | PARTIAL |

## Verdict

Data ownership model is **clear and partially enforced**. Operational durability (outbox relay, secret storage, analytics writers) remains incomplete.
