# ADR: NATS JetStream

- **Status:** Accepted (outbox relay + consumer inbox)
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

Provisioning and future async work need a bus separate from HTTP.

## Decision

Use **NATS with JetStream enabled** in Compose. Persist intent in Postgres `outbox` + `sagas`. A background **outbox relay** publishes unpublished rows and sets `published_at` (no dual HTTP+NATS publish). Provision worker claims events in `consumer_inbox` (idempotent by `event_id`).

## Consequences

- API `/api/provision` only inserts saga + outbox; relay owns NATS publish.
- Duplicate deliveries are skipped by the worker.
- JetStream durable consumers remain a future hardening step; current path is core NATS subject + inbox table.
