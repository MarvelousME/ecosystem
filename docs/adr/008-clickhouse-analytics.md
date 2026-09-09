# ADR: ClickHouse Analytics

- **Status:** Accepted optional; writers implemented (soft-fail)
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

Need an analytics plane for high-volume events without burdening Postgres.

## Decision

Ship ClickHouse under Compose profile `full` with `bridge_events` MergeTree table. When `CLICKHOUSE_URL` is set, the API:

- Writes audit sinks asynchronously after Postgres `audit_log` inserts
- Relays outbox publish events into `bridge_events`

ClickHouse is **never** SoR for tenancy. Writers soft-fail if CH is unreachable.

## Consequences

- Safe to omit in core profile (`CLICKHOUSE_URL` empty).
- For `full` profile, set `CLICKHOUSE_URL=http://clickhouse:8123` on the API service.
- Analytics queries remain operator/BI tooling, not control-plane APIs.
