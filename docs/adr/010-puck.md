# ADR: Puck

- **Status:** Proposed / catalog-only
- **Date:** 2026-09-09

## Context

React/Next marketing sites need a visual builder distinct from Gutenberg.

## Decision

Register `puck-builder` as an `IVisualBuilderProvider`. Visual component seeds (`Hero`, `CTA`, etc.) live in Postgres for future Puck schemas. **No Puck app/runtime is shipped yet.**

## Consequences

- Avoids coupling Control Center to an unfinished builder.
- Next.js provider currently returns synthetic pages — replace when Puck lands.
- Delivery status: **FAIL** for deep builder; seed present.
