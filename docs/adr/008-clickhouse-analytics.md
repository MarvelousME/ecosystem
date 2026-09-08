# ADR: ClickHouse Analytics

- **Status:** Accepted optional; writers PENDING
- **Date:** 2026-09-09

## Context

Need an analytics plane for high-volume events without burdening Postgres.

## Decision

Ship ClickHouse under Compose profile `full` with `bridge_events` MergeTree table. **No application writers yet** — status UNVERIFIED for analytics value.

## Consequences

- Safe to omit in core profile.
- Future: outbox/audit relay into ClickHouse; never make CH SoR for tenancy.
