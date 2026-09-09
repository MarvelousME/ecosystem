# ADR: ZIP Import Quarantine

- **Status:** Accepted
- **Date:** 2026-09-09

## Context

Site bootstrap via ZIP must not execute or promote untrusted archives.

## Decision

- `POST /api/imports/zip` accepts base64 ZIP payloads, writes to quarantine dir (`BRIDGE_QUARANTINE_DIR`), runs malware scanner adapter, records `zip_imports`.
- Lab scanner: reject EICAR + non-ZIP magic; optional `BRIDGE_MALWARE_SCAN_URL` external webhook (fail-closed if unreachable).
- Promotion requires explicit `POST /api/imports/:id/release`. Rejected imports cannot be released.

## Consequences

- Fail-closed by default for malware/scanner failures.
- No automatic unpack into WordPress/runtime — release is a control-plane status only until a future promote worker is added.
