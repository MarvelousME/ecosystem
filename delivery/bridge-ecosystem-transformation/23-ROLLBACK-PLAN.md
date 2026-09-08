# 23 — Rollback Plan

## Code rollback

1. Identify checkpoint: `603af84` — `checkpoint: baseline Bridge all-in-one scaffold before consolidation`.
2. On branch `bridge-ecosystem-platform`:
   - Prefer `git revert` of consolidation commits if committed.
   - If uncommitted only: `git checkout -- .` / restore tracked files; remove untracked consolidation files carefully.
3. Do **not** force-push shared main without explicit approval.

## Data rollback

| Asset | Method | Status |
|-------|--------|--------|
| Postgres | `scripts/Restore-Bridge.ps1` / `restore-bridge.sh` from `.bridge-backups` | PARTIAL — scripts present; drill UNVERIFIED |
| Env | `.bridge-backups/env-*.bak` observed | PARTIAL |
| WordPress volumes | Compose volume restore / WP export | UNVERIFIED |
| Redis | Disposable cache; flush OK | N/A (unused) |
| NATS | Replay not guaranteed; re-drive provision | PARTIAL |

## Schema caution

- Rolling code back while leaving `002` tables is usually safe (forward-compatible reads may fail).
- Rolling schema back requires restore from pre-`002` backup — **no down-migration SQL provided** (FAIL).

## Feature flags / runtime

- Disable JWT gate: unset `BRIDGE_REQUIRE_JWT`.
- Disable AI/Cloudflare: clear related env vars (fail-closed).

## Decision tree

| Symptom | Action |
|---------|--------|
| API regression after consolidation | Revert API modules; keep schema if possible |
| Migration applied on wrong volume | Restore Postgres backup |
| Worker poison messages | Stop worker; fix; replay `provision.requested` carefully |
| Full stack unhealthy | `Stop-Bridge` then restore backup then `Start-Bridge` |

## Verdict

Rollback **procedures exist in draft**; automated proven drill is **UNVERIFIED**. Missing down-migrations = residual risk.
