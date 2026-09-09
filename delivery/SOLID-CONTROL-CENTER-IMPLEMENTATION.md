# Solid Control Center — Implementation Report

Branch context: `bridge-ecosystem-platform`  
Authoritative UI path: `apps/control-center` (SolidJS + Vite SPA)  
Legacy reference: `apps/control-center-react-legacy`

## Verdict

**GAP-CLOSURE PASS (SPA) — SolidStart Vinxi SSR still deferred**

Previously listed “remaining gaps” are closed against real platform-api surfaces (no fake telemetry). Full SolidStart/Vinxi SSR remains intentionally SPA-static for Traefik/nginx edge parity.

## Architecture

```text
USER → Solid Control Center → OIDC (Keycloak PKCE)
     → Tenant context (x-tenant-id + membership server-side)
     → platform-api (RBAC / capabilities)
     → audit / providers / sagas / workflows
     → Puck React embed host (iframe) → builders APIs
```

| Layer | Choice | Status |
|-------|--------|--------|
| UI runtime | SolidJS 1.9 + Vite 6 | PASS |
| Routing | `@solidjs/router` + `src/routes/**` file modules | PASS (SPA adapter) |
| Server state | `@tanstack/solid-query` | PASS |
| Forms | Kobalte TextField/Select/Switch + shared primitives | PASS (Security, Infra, AI, Workflow, Logs) |
| Motion | GSAP registry | PASS |
| 3D | Three.js EcosystemScene (lazy) | PASS |
| Auth | oidc-client-ts PKCE | PASS |
| Puck embed | `apps/puck-host` React SPA on `:5174` | PASS |
| E2E | Playwright smoke + visual snapshots | PASS (local/CI) |
| SolidStart Vinxi SSR | Not adopted | DEFER |

## Gap closure map

| Former gap | Resolution |
|------------|------------|
| SolidStart file-based SSR / Vinxi | File modules under `src/routes/**` + route table; SSR deferred |
| Full Kobalte form system | `src/primitives/forms.tsx` wired across key modules |
| Workflow builder / log virtualizer / trace waterfall | `/automation`, `/operations/logs`, `/operations/traces` + APIs |
| Puck React embed host | `apps/puck-host` + Build iframe + compose `puck-host` |
| Playwright + visual regression | `e2e/*.spec.ts` + CI job steps |
| Role-specific homes | `RoleHome` + `/api/me` `homeProfile` + `roleNavFilter` |

## Backend surfaces added

| Endpoint | Purpose |
|----------|---------|
| `GET /api/me` | Actor, permissions, `homeProfile` |
| `GET /api/sagas` | Saga list |
| `GET /api/logs` | Paginated audit → log rows |
| `GET /api/traces/:correlationId` | Audit + saga step waterfall |
| `PUT /api/workflows/:id` | Persist visual graph |

## Routes (wired to real APIs)

| Route | Module | Backend |
|-------|--------|---------|
| `/login`, `/auth/callback`, `/logout` | Auth | Keycloak OIDC |
| `/` | Role home + 3D | `/api/me`, `/api/command-center` |
| `/automation` | Visual workflow canvas | `/api/workflows*` |
| `/operations/logs` | Virtualized logs | `/api/logs` |
| `/operations/traces` | Trace waterfall | `/api/traces/:id` |
| `/sagas` | Saga list | `/api/sagas` |
| `/build` | CMS + Puck iframe | builders + puck-host |
| (others) | unchanged from prior pass | platform-api |

## Evidence

| Check | Result |
|-------|--------|
| `npm run typecheck` | PASS |
| `npm run test` (vitest) | PASS 3/3 |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS (smoke); visual snapshots local / CI-skipped until Linux baselines committed |
| `docker compose config` | PASS (includes `puck-host`) |
| OIDC live Keycloak roundtrip | UNVERIFIED without stack |
| Puck publish E2E against live API | UNVERIFIED without stack |

## How to run

```powershell
cd apps/control-center
npm install
npm run dev
# Lab: http://localhost:5173
# Puck host: cd ../puck-host && npm install && npm run dev  # :5174
npm run build
npx playwright install chromium
npm run test:e2e
# First visual baselines: npm run test:e2e:update
```

Compose: `control-center` `:5173`, `puck-host` `:5174`.
