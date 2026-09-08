# 03 — Repository Inventory

**Root:** `ecosystem-enterprise/ecosystem`  
**Branch:** `bridge-ecosystem-platform`  
**Checkpoint:** `603af84` baseline scaffold; subsequent uncommitted/working-tree consolidation present at assessment time.

## Top-level layout

| Path | Role | Status |
|------|------|--------|
| `apps/control-center/` | React/Vite UI | PARTIAL — expanded tabs + metrics |
| `services/platform-api/` | Fastify SoR API | PASS (code) — modularized |
| `services/provision-worker/` | NATS saga consumer | PARTIAL — real steps |
| `services/frontend-mcp/` | MCP + ThreeUI metadata | PASS (prior VERIFICATION.md health) |
| `wordpress/plugins/bridge-connector/` | WP capability adapter | PARTIAL |
| `infra/postgres/` | `001-init.sql`, `002-platform-expansion.sql` | PASS |
| `infra/keycloak/bridge-realm.json` | Dev realm | PASS (file present) |
| `infra/clickhouse/init.sql` | Analytics DDL | UNVERIFIED (no writers) |
| `infra/observability/prometheus.yml` | Scrape api + nats | PARTIAL |
| `scripts/` | Start/Stop/Test/Backup/Restore | PARTIAL |
| `docs/` | Architecture + test plan | Updated in this pack |
| `delivery/bridge-ecosystem-transformation/` | This evidence pack | Created |
| `.github/` | CI | FAIL — absent |
| `FULL-SOURCE-MANIFEST.txt` | Manifest artifact | Present |

## platform-api modules (post-consolidation)

| Module | Path |
|--------|------|
| Kernel (pool, context, audit, envelope) | `src/lib/kernel.js` |
| RBAC | `src/lib/rbac.js` |
| Capabilities / entitlements | `src/lib/capabilities.js` |
| Website providers | `src/providers/website.js` |
| Domain routes | `src/routes/domains.js` |
| Legacy + AI/CF routes | `src/server.js` |
| Unit tests | `test/kernel.test.js`, `test/rbac.test.js` |

## Scripts inventory

| Script | Purpose |
|--------|---------|
| `Start-Bridge.ps1` / `start-bridge.sh` | Compose up |
| `Stop-Bridge.ps1` / `stop-bridge.sh` | Compose down |
| `Test-Bridge.ps1` / `test-bridge.sh` | Golden API path (needs live API) |
| `Backup-Bridge.ps1` / `backup-bridge.sh` | Backup helper |
| `Restore-Bridge.ps1` / `restore-bridge.sh` | Restore helper |

## What is not in-repo

- Enterprise-starter full monorepo (only conceptual reuse)
- Puck/Gutenberg builder apps
- ZIP import service
- Secrets manager / TLS termination config
- CI workflow YAML
