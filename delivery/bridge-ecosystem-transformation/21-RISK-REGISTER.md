# 21 — Risk Register

| ID | Risk | Likelihood | Impact | Status | Mitigation |
|----|------|------------|--------|--------|------------|
| R1 | Spoofable `x-actor-roles` without JWT | High in shared env | Critical | OPEN | JWKS + disable headers |
| R2 | `BRIDGE_REQUIRE_JWT` stub creates false security | Medium | Critical | OPEN | Implement jose validation |
| R3 | Existing PG volumes miss `002` migration | High on upgrade | High | OPEN | Document manual migrate; version check |
| R4 | Docker hang blocks E2E evidence | Medium | High | OPEN | CI with timeouts; health retries |
| R5 | Redis/ClickHouse assumed used but unused | Medium | Medium | OPEN | Wire or remove from “required” docs |
| R6 | WP/platform content drift | Medium | Medium | OPEN | Changeset-only writes; audit |
| R7 | Saga dual-publish (outbox + immediate NATS) | Medium | Medium | OPEN | Transactional outbox relay |
| R8 | SQL Server/Mongo callers expect live DB | Low | Medium | OPEN | Keep UNVERIFIED status; docs |
| R9 | Secret_store stub mistaken for KMS | Medium | High | OPEN | ADR + block prod until real SM |
| R10 | No CI → regressions ship silently | High | High | OPEN | Add workflow |
| R11 | Builder catalog implies Puck/Gutenberg ready | Medium | Medium | OPEN | Mark providers inactive/stub |
| R12 | Permissive CORS in lab left on in prod | Medium | High | OPEN | Env-based origin allowlist |

## Residual acceptance

Lab demos may accept R1/R5/R11 with explicit labeling. Production must close R1, R2, R9, R10, R12.

## Verdict

Risk posture matches **PARTIALLY TRANSFORMED** — several critical identity/ops risks remain OPEN.
