# ADR: Provisioning Saga

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

App provisioning spans DB allocation, app registration, domain bind, and health.

## Decision

Use Postgres `sagas` + `saga_steps` and NATS `provision.requested`. Worker steps: `validate_request` → `allocate_database` → `register_application` → `bind_domain` → `verify_health` → `complete`. Support `forceFailAt` for tests. Emit completed/failed events.

## Consequences

- Observable step history for demos.
- Not a full cloud provisioner (no real DNS/TLS/hosting provider).
- Needs outbox relay + idempotent consumers before production.
