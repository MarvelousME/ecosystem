# 08 — API / Event / Workflow Assessment

## HTTP API

| Area | Routes (selected) | Status |
|------|-------------------|--------|
| Health / metrics | `/health`, `/metrics` | PASS (code) |
| Navigation / command center | `/api/navigation`, `/api/command-center` | PASS (code) |
| Clients / tenants / apps | `/api/clients*`, `/api/tenants`, `/api/apps` | PASS (code) |
| Billing | `/api/products`, `/api/orders`, `/api/payments/webhook` | PASS (code) — idempotent |
| CMS | `/api/cms/models*`, entries | PASS (code) |
| AI phone-change / changesets | `/api/ai/website/phone-change`, `/api/changesets/:id/approve` | PASS (code) |
| Databases | `/api/databases` | PARTIAL — sqlserver/mongodb UNVERIFIED |
| Workflows | `/api/workflows*` | PARTIAL — execute records completion; not durable engine |
| Catalog reads | capabilities, providers, subsystems, components, brand | PASS (code) |
| Legacy resources/affiliates/security | `/api/resources*`, affiliates, rules | PASS (code) |
| Provision / sagas | `/api/provision`, `/api/sagas/:id` | PARTIAL |
| AI chat / Cloudflare | `/api/ai/chat`, `/api/cloudflare/purge` | PASS fail-closed |

Envelope: `ok()` meta when `x-bridge-envelope:1` or `?envelope=1`; legacy routes support both.

## Events

| Subject | Producer | Consumer | Status |
|---------|----------|----------|--------|
| `provision.requested` | API (outbox insert + publish) | provision-worker | PARTIAL |
| `provision.completed` / `failed` | worker | none durable | PARTIAL |
| Outbox relay transaction | — | — | FAIL |
| Consumer idempotency table | — | — | FAIL (payments inbox exists separately) |

## Workflows

- Tables: `workflows`, `workflow_executions`.
- Execute endpoint creates execution and marks completed with passthrough output — **not** a Temporal/durable step engine.
- Status: **PARTIAL**.

## Gaps

- ZIP import pipeline: **FAIL** (absent).
- Full OpenAPI/spec: **UNVERIFIED** / absent.
- NATS JetStream durable consumers with ack: **UNVERIFIED** (simple subscribe).

## Verdict

**PARTIAL** — rich control-plane API; event durability and workflow engine depth incomplete.
