# ADR: NATS JetStream

- **Status:** Accepted (PARTIAL durability)
- **Date:** 2026-09-09

## Context

Provisioning and future async work need a bus separate from HTTP.

## Decision

Use **NATS with JetStream enabled** in Compose. Platform API publishes `provision.requested`; worker emits `provision.completed` / `provision.failed`. Persist intent in Postgres `outbox` + `sagas`.

## Consequences

- Decouples API from long-running provision.
- Current code also publishes immediately (not only via outbox relay) — dual-path risk.
- Consumer idempotency table still required for production.
