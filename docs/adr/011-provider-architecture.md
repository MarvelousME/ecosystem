# ADR: Provider Architecture

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

Multiple engines (WP, Next, DBs, payments) must be swappable without rewriting AI/UI.

## Decision

Providers implement named contracts (`IWebsiteProvider`, `IDatabaseProvider`, `IPaymentProvider`, `IVisualBuilderProvider`) registered in `providers` table. Runtime website adapter lives in `src/providers/website.js`. Database engines `sqlserver`/`mongodb` are explicitly **UNVERIFIED** until live adapters exist.

## Consequences

- Capability fabric stays engine-agnostic.
- Seed rows may reference unimplemented builders — mark carefully in docs.
- Fail-closed external HTTP providers (AI, Cloudflare) remain outside the table but follow the same honesty rule.
