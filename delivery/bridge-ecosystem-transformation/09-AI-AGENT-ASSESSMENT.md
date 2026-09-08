# 09 — AI / Agent Assessment

## Implemented

| Capability | Status | Notes |
|------------|--------|-------|
| `/api/ai/chat` OpenAI-compatible proxy | PASS (code) | Fail-closed 503 without config |
| Agents table + seed `website-architect` | PASS (schema) | Demo seed |
| Capability approval ranks AUTO/CONFIRM/ADMIN | PASS (code) | `lib/capabilities.js` |
| Multi-site phone-change path | PASS (code) | Creates changesets across apps |
| Changeset approve → provider publish | PARTIAL | WP may return unverified |
| `agent_executions`, `ai_artifacts`, `ai_memory` | PARTIAL | Schema + phone path uses memory/brand |
| Frontend MCP | PASS (prior verify) | Separate service; tools/list previously healthy |

## Phone-change golden path (code)

1. Load tenant apps (exclude ai-hub).
2. Build replace_phone diffs per provider.
3. Persist changesets `pending_approval`.
4. Require approval (`requiresApproval: true`).
5. On approve, call website provider `publish`.

`Test-Bridge.ps1` asserts multi-changeset + approve — **UNVERIFIED** until Docker/API run succeeds.

## Not implemented / shallow

| Item | Status |
|------|--------|
| Full agent planner loop / tool runtime | FAIL |
| Token/cost metering beyond columns | PARTIAL (columns exist) |
| Model governance / content safety | FAIL |
| Puck/Gutenberg AI builders | FAIL |
| Persistent vector memory | FAIL |

## Risk

AI can propose multi-app mutations; publish path must stay behind ADMIN/CONFIRM. Current approve endpoint is RBAC-gated but identity is spoofable in header mode.

## Verdict

**PARTIAL** — control-plane + one multi-site approval demo exists; general agent autonomy is not production-grade.
