# ADR: Secret Management

- **Status:** Accepted lab envelope; external SM still required for production customer secrets
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

Database instances and integrations need credentials without baking secrets into app rows.

## Decision

- Lab: environment files (`.env.example` placeholders).
- Schema: `secret_store` holds `ciphertext` + metadata references (`secret_ref` on `database_instances`).
- When `BRIDGE_SECRETS_KEY` is set, values are sealed with **AES-256-GCM** (`lib/secrets.js`). Without the key, lab falls back to base64 (explicitly marked in meta).
- Ciphertext is never returned to the browser on provision APIs.

## Consequences

- Demo can rotate/seal secrets locally.
- Production still requires an external secrets manager / KMS before handling real customer credentials.
- Rotate all example passwords before shared use.
