# ADR: Observability

- **Status:** Accepted PARTIAL
- **Date:** 2026-09-09

## Context

Operators need health, metrics, and audit for a multi-service lab stack.

## Decision

- Structured logs via Fastify/pino.
- Prometheus text metrics at `/metrics`; scrape config for API + NATS under `full` profile; optional Grafana.
- Correlation/trace IDs on request context and provision events.
- Postgres `audit_log` for control-plane actions.
- ClickHouse reserved for future analytics writers.

## Consequences

- Enough for local ops; not a full APM/alerting stack.
- No OTLP tracing yet.
- Do not treat Compose `full` profile as proven observability without scrape evidence.
