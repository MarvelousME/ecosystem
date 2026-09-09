# ADR: Provisioning Saga

- **Status:** Accepted
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

App provisioning spans DB allocation, app registration, domain bind, and health.

## Decision

Use Postgres `sagas` + `saga_steps` and NATS `provision.requested` delivered **only** via transactional outbox relay. Worker steps: `validate_request` → `allocate_database` → `register_application` → `bind_domain` → `verify_health` → `complete`. Support `forceFailAt` for tests. Emit completed/failed events. Consumer idempotency via `consumer_inbox`.

## Consequences

- Observable step history for demos.
- Not a full cloud provisioner (no real DNS/TLS/hosting provider).
- Outbox + inbox close the dual-publish / at-least-once duplicate gap for lab production-readiness.
