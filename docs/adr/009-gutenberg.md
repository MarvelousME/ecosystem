# ADR: Gutenberg

- **Status:** Proposed / catalog-only
- **Date:** 2026-09-09

## Context

WordPress-native editing is expected for WP apps.

## Decision

Register `gutenberg-builder` as an `IVisualBuilderProvider` in the providers catalog. **Deep Gutenberg builder integration is not implemented** in this consolidation.

## Consequences

- Catalog communicates intent without fake UI.
- Until implemented, edits go through connector page apply / platform changesets only.
- Status for delivery evidence: **FAIL** (depth) / seed **PASS**.
