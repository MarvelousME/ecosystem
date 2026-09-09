# ADR: Redis

- **Status:** Accepted; wired for rate-limit + cache
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

Enterprise starter patterns expect cache/session substrate.

## Decision

Include **Redis 7** in Compose and pass `REDIS_URL` to API. Application uses Redis for:

- Per-IP/route **rate limiting** (`BRIDGE_RATE_LIMIT`, default 300/min)
- Short TTL **cache** for command-center metrics

If Redis is down, API soft-bypasses limits/cache (availability over strict enforcement in lab).

## Consequences

- `/health` reports Redis ping status.
- Session cookies are still not implemented; rate-limit/cache are the first consumers.
- AOF remains enabled for durability experiments.
