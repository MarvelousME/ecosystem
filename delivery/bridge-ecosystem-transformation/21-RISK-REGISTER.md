# 21 — Risk Register

| ID | Risk | Likelihood | Impact | Status | Mitigation |
|----|------|------------|--------|--------|------------|
| R1 | Spoofable `x-actor-roles` without JWT | High in shared env | Critical | MITIGATED | JWKS + `BRIDGE_REQUIRE_JWT` / `BRIDGE_TRUST_HEADERS=0` |
| R2 | `BRIDGE_REQUIRE_JWT` stub creates false security | Medium | Critical | CLOSED | jose JWKS validation |
| R3 | Existing PG volumes miss `002`/`003` migration | High on upgrade | High | MITIGATED | Boot `ensureGapSchema` + `003-gap-closures.sql` |
| R4 | Docker hang blocks E2E evidence | Medium | High | OPEN | CI with timeouts; health retries |
| R5 | Redis/ClickHouse assumed used but unused | Medium | Medium | CLOSED | Rate-limit/cache + CH writers |
| R6 | WP/platform content drift | Medium | Medium | OPEN | Changeset-only writes; audit |
| R7 | Saga dual-publish (outbox + immediate NATS) | Medium | Medium | CLOSED | Outbox relay only + consumer_inbox |
| R8 | SQL Server/Mongo callers expect live DB | Low | Medium | OPEN | Keep UNVERIFIED status; docs |
| R9 | Secret_store stub mistaken for KMS | Medium | High | MITIGATED | AES-GCM lab seal; ADR still requires external SM for prod |
| R10 | No CI → regressions ship silently | High | High | CLOSED | GitHub Actions unit/worker/php/compose |
| R11 | Builder catalog implies Puck/Gutenberg ready | Medium | Medium | CLOSED | Deep-link + puck_pages APIs READY |
| R12 | Permissive CORS in lab left on in prod | Medium | High | OPEN | Env-based origin allowlist |

## Residual acceptance

Lab demos may accept R1 with headers when JWT is off. Production must enable JWT, close R4/R6/R12, and use external SM (R9).

## Verdict

Risk posture matches **LAB-COMPLETE / PARTIALLY HARDENED** — critical identity/outbox/CI gaps closed; KMS/TLS/CORS remain.
