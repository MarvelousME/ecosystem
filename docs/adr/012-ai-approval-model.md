# ADR: AI Approval Model

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

Agents can propose multi-site mutations; uncontrolled publish is unsafe.

## Decision

Capabilities carry `approval_default`: `AUTO`, `CONFIRM`, `ADMIN_APPROVAL`, `FORBIDDEN`. `executeCapability` and the phone-change path create **changesets** requiring approve before provider publish. Publish is RBAC-gated.

## Consequences

- Multi-site phone-change demo matches governance intent.
- Header-spoofable actors undermine approval in lab mode — JWT required for real trust.
- General autonomous agent loops remain out of scope.
