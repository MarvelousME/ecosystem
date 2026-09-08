# ADR: Multi-Tenant Isolation

- **Status:** Accepted (lab); production hardening open
- **Date:** 2026-09-09

## Context

Bridge must host many customers without WordPress acting as tenancy authority.

## Decision

Use **shared PostgreSQL schema** with `tenant_id` on business tables (`isolation_mode` default `SHARED`). Enforce tenant scope in `platform-api` via `x-tenant-id` / `requireTenant`. Clients are commercial entities linked through `client_tenants`.

## Consequences

- Simple ops for lab; strong query discipline required.
- Dedicated DB-per-tenant remains future (`isolation_mode`); not fully automated.
- Header-based tenant selection is insufficient once JWT membership exists.
