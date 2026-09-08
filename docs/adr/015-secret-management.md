# ADR: Secret Management

- **Status:** Accepted interim stub; production FAIL
- **Date:** 2026-09-09

## Context

Database instances and integrations need credentials without baking secrets into app rows.

## Decision

- Lab: environment files (`.env.example` placeholders).
- Schema: `secret_store` holds `ciphertext` + metadata references (`secret_ref` on `database_instances`).
- **No real KMS/envelope encryption or external secrets manager is wired.**

## Consequences

- Demo can reference secrets without claiming vault readiness.
- Production requires external SM (e.g., cloud KMS) before handling customer credentials.
- Rotate all example passwords before shared use.
