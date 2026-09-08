# ADR: Capability Fabric

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

AI and UI must not call database engines or WordPress APIs directly.

## Decision

Introduce capability IDs (`capabilities` table) with approval defaults, executed through `executeCapability` (Tenant → Entitlement → RBAC → Capability → Provider → Audit). Subsystems own capability sets; providers implement contracts.

## Consequences

- Uniform governance path for new features.
- Legacy routes still bypass the helper — migrate gradually.
- Catalog seed can outpace implementations (e.g., notifications).
