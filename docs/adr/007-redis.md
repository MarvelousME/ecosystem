# ADR: Redis

- **Status:** Accepted substrate; usage PENDING
- **Date:** 2026-09-09

## Context

Enterprise starter patterns expect cache/session substrate.

## Decision

Include **Redis 7** in Compose and pass `REDIS_URL` to API. **Do not claim session/cache features until a client is wired.** Current API code does not use Redis.

## Consequences

- Avoids false readiness claims.
- Either implement rate-limit/session adapters or remove Redis from critical-path docs.
- AOF enabled for future durability experiments.
