# ADR: Gutenberg

- **Status:** Accepted; deep-link provider READY
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

WordPress-native editing is expected for WP apps.

## Decision

`gutenberg-builder` implements `IVisualBuilderProvider` via API deep links:

- `GET /api/builders/gutenberg/:appId` → Site Editor + pages list + connector health URLs
- `GET /api/builders/apps/:appId` routes WordPress/commerce apps to Gutenberg

Content apply still goes through `bridge-connector` + platform changesets (approval path unchanged).

## Consequences

- Control Center Build tab can open Site Editor links without embedding the WP admin SPA.
- Full in-iframe Gutenberg host remains future work; deep-link + connector is the supported integration.
