# Implementation Evidence

Branch: `bridge-ecosystem-platform`  
Captured: 2026-09-09

| Check | Result | Evidence |
|-------|--------|----------|
| Git checkpoint | PASS | Initial commit `603af84` baseline scaffold |
| Unit tests (`node --test`) | PASS | 5/5 in `services/platform-api/test` |
| Syntax check API modules | PASS | `node --check` on server + libs |
| Docker stack health | PASS | `/health` → healthy |
| `Test-Bridge.ps1` api.health | PASS | |
| tenants.list | PASS | |
| apps.multi-app-demo (≥3 apps) | PASS | Demo now has WP, React, AI Hub, Online Store |
| command-center.real-metrics | PASS | DB-backed counts |
| billing.first-payment | PASS | |
| billing.idempotent-replay | PASS | duplicate=true on second webhook |
| ai.phone.preview-requires-approval | PASS | |
| ai.phone.multi-app-changesets | PASS | ≥2 website apps |
| ai.phone.publish (per changeset) | PASS | 3 changesets published |
| tenant.isolation | PASS | |
| provision.saga.completed | PASS | Worker step persistence |
| Keycloak JWKS enforcement | PASS (code) | jose + JWKS; set `BRIDGE_REQUIRE_JWT=1` to force |
| Cloudflare purge | UNVERIFIED | Credentials not configured (fail-closed 503) |
| AI chat completions | UNVERIFIED | Provider env unset (fail-closed 503) |
| SQL Server / Mongo providers | UNVERIFIED | Registered; local infra absent |
| Redis application usage | PASS | Rate-limit + command-center cache |
| ClickHouse event writers | PASS (soft) | Writers when `CLICKHOUSE_URL` set |
| ZIP import malware scan | PASS | Quarantine + EICAR/magic adapter |
| Backup/Restore scripts | PASS (syntax/present) | Runtime restore drill not fully evidenced this run |
| Puck/Gutenberg deep builders | PASS (API) | Schema/pages + Site Editor deep links |

## Release-blocking scenario

Request: change phone across websites with preview before publish.

| Step | Result |
|------|--------|
| Resolve Bridge Demo tenant | PASS |
| Discover WP + React (+ commerce) apps | PASS |
| Create changesets via website providers | PASS |
| Require approval before publish | PASS |
| Publish after approve | PASS |
| Audit trail | PASS (capability/changeset audits) |
| Cross-tenant isolation probe | PASS |
