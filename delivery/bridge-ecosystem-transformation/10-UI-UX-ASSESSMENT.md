# 10 — UI / UX Assessment

## Surface

- App: `apps/control-center` (React + Vite), served on `:5173`.
- Talks to `VITE_BRIDGE_API_URL` with `x-actor-roles: platform.admin` and selected `x-tenant-id`.

## Implemented UX (code)

| Feature | Status |
|---------|--------|
| Tenant selector + multi-app launcher | PASS (code) |
| Command Center metrics from `/api/command-center` | PASS (code) — real DB counts |
| Capability-driven navigation fetch | PASS (code) |
| Tabs: Command, Apps, Build, AI, Commerce, Infra, Growth, Security, Audit | PARTIAL |
| Ctrl/Cmd+K palette toggle | PARTIAL |
| Idempotent billing path button | PASS (code) |
| Impersonation header plumbing in client | PARTIAL — policy incomplete |
| Deep visual builders (Puck/Gutenberg) | FAIL |
| Production design system / a11y audit | UNVERIFIED |

## Gaps

- UI still assumes admin roles in headers (lab UX).
- Build tab cannot host real Puck/Gutenberg editors — catalog/components API only.
- No authenticated Keycloak login UI flow evidenced.
- WordPress admin UX remains separate at `:8080`.

## Verdict

**PARTIAL** — functional lab Control Center with command metrics; not a finished product UX or builder suite.
