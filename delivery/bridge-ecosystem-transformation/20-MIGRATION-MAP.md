# 20 — Migration Map

## Journey

| Stage | Description | Status |
|-------|-------------|--------|
| 0 | Brownfield all-in-one scaffold | PASS — checkpoint `603af84` |
| 1 | Expand Postgres schema (`002`) | PASS (file present; applied on fresh Compose volumes) |
| 2 | Modularize API (kernel/rbac/capabilities/providers/routes) | PASS (code) |
| 3 | Clients/billing idempotency + CMS/brand/databases/workflows | PASS (code) |
| 4 | Agents/changesets multi-site phone-change | PASS (code) |
| 5 | Command center metrics + provision worker real steps | PASS (code) |
| 6 | Test/Backup/Restore scripts | PASS (files) — runtime UNVERIFIED |
| 7 | Full OIDC JWKS | FAIL — next |
| 8 | Builders (Puck/Gutenberg) + ZIP import | FAIL — next |
| 9 | Redis/ClickHouse writers + CI + E2E evidence | FAIL / UNVERIFIED — next |
| 10 | Production TLS/secrets | FAIL — later |

## Data migration notes

- Fresh environments: Compose mounts `001` then `002` into `docker-entrypoint-initdb.d`.
- Existing volumes created before `002` **will not** auto-apply SQL — manual `psql` apply required (operational risk).
- WordPress content not migrated into Postgres CMS; dual-write via connector on approve.

## Cutover strategy (recommended)

1. Lab: recreate volumes or apply `002` manually; run `Test-Bridge`.
2. Staging: enable `BRIDGE_REQUIRE_JWT=1` only after JWKS lands.
3. Prod: secrets manager + TLS + CI green + backup drill PASS.

## Rollback of consolidation code

See `23-ROLLBACK-PLAN.md` — git revert to checkpoint; volume restore via Backup scripts.

## Verdict

**PARTIALLY TRANSFORMED** through stage 6; stages 7–10 open.
