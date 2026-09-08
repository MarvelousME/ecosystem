# ADR: Workflow Durability

- **Status:** Accepted interim; engine TBD
- **Date:** 2026-09-09

## Context

Automation needs persisted definitions/executions without adopting a heavy engine prematurely.

## Decision

Store `workflows` and `workflow_executions` in Postgres. Execute endpoint records runs and completes with output passthrough. **Not** a durable step orchestrator (Temporal/etc.) yet. Long-running provision uses **sagas**, not workflows table.

## Consequences

- Adequate for lab automation CRUD.
- Must not market as durable workflow engine.
- Future: either deepen executions with step state or integrate external orchestrator behind the same tables.
