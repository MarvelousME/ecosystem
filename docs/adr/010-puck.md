# ADR: Puck

- **Status:** Accepted; schema + page documents READY
- **Date:** 2026-09-09
- **Updated:** 2026-09-09

## Context

React/Next marketing sites need a visual builder distinct from Gutenberg.

## Decision

`puck-builder` provides:

- `GET /api/builders/puck/schema` — Puck-shaped component catalog from `visual_components`
- `POST/GET /api/builders/puck/pages` — durable page documents in `puck_pages`
- App open route returns editor/preview URLs + default document (Hero/Contact/CTA)

Control Center Build tab can save Puck drafts for React/Next apps.

## Consequences

- No full standalone Puck SPA yet; control plane owns schema/documents.
- Next.js website provider can later hydrate from `puck_pages` instead of synthetic pages.
