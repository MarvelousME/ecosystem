# React → Solid Control Center Migration Inventory

| Area | Classification | Notes |
|------|----------------|-------|
| OIDC (`auth.js`, `auth-config.js`) | REUSE | Ported to Solid `src/auth/` — same PKCE + oidc-client-ts |
| API base URL / unwrap envelope | REUSE | `src/api/client.ts` |
| Tabs: command, apps, build, AI, commerce, infra, growth, security, audit | REWRITE | Solid routes + feature modules |
| Header identity roles | REWRITE | Bearer-first; lab headers only when OIDC off |
| Tenant switcher | REWRITE | Solid store + query invalidation |
| Styles | REWRITE | Design tokens dark-first |
| Dockerfile / nginx | PORT | SPA try_files preserved |
| Tests | REWRITE | Vitest + Playwright stubs |

Authoritative path after migration: `apps/control-center` (Solid).
Legacy reference: `apps/control-center-react-legacy`.
