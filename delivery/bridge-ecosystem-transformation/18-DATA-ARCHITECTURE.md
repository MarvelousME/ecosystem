# 18 — Data Architecture

## Stores

| Store | Technology | Role | Status |
|-------|------------|------|--------|
| Platform SoR | PostgreSQL 17 | Control plane + business data | PASS (schema 001+002) |
| WP content | MariaDB 11.8 | WordPress posts/media | PARTIAL |
| Cache | Redis 7.4 | Intended sessions/cache | FAIL — unused |
| Events bus | NATS JetStream | Provisioning events | PARTIAL |
| Analytics | ClickHouse 25.8 | `bridge_events` | UNVERIFIED — DDL only |
| Identity | Keycloak (realm import) | Users/OIDC | PARTIAL |

## Schema layers

1. **001-init**: tenants, apps, managed_resources, affiliates, conversions, security_rules, audit_log, outbox, sagas + demo seed.
2. **002-platform-expansion**: clients/orgs, billing, CMS, brand, databases, secrets stub, domains, workflows, agents/changesets, capabilities/providers/subsystems, support, saga_steps, deployments/backups + seeds.

## Key relationships

```
clients ──< client_tenants >── tenants ──< apps
tenants ──< content_models ──< content_entries
tenants ──< subscriptions >── products
orders ──< payments (idempotent by provider+external_event_key)
sagas ──< saga_steps
apps ──< changesets
```

## Migration discipline

- `schema_migrations` records `002-platform-expansion`.
- Scripts are idempotent (`IF NOT EXISTS`, `ON CONFLICT`).

## Gaps

- No ClickHouse writer pipeline.
- Secret ciphertext not KMS-backed.
- No formal OLTP→OLAP CDC.
- ZIP import schema absent.

## Verdict

**PARTIAL** — SoR data model is the strongest completed layer of the transformation.
