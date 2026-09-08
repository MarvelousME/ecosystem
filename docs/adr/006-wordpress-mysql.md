# ADR: WordPress MySQL

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

WordPress remains a first-class tenant application but must not own tenancy.

## Decision

Run WordPress against **MariaDB** (`wordpress-db`). Content (posts/pages/media) stays in WP storage. Platform reaches WP only through **`bridge-connector`** REST capabilities (`/health`, `/pages`, `/pages/apply`).

## Consequences

- Dual content stores for WP-typed apps.
- Connector may return unverified when WP unreachable.
- Multisite / multi-instance fleet routing is out of scope for v1 Compose.
