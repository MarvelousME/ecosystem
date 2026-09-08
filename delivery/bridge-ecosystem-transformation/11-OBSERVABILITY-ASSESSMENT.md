# 11 — Observability Assessment

## Present

| Signal | Mechanism | Status |
|--------|-----------|--------|
| API process logs | Fastify/pino logger | PASS (code) |
| Prometheus text metrics | `/metrics` counters tenants/apps | PARTIAL |
| Prometheus scrape | `infra/observability/prometheus.yml` → api + nats | PARTIAL (`full` profile) |
| Grafana | Compose service | UNVERIFIED dashboards |
| Correlation / trace IDs | Kernel context fields | PARTIAL — propagated on provision |
| Audit log | Postgres `audit_log` | PARTIAL |
| NATS monitoring port | `:8222` | PASS (compose) |
| ClickHouse events table | `bridge_events` DDL | UNVERIFIED — **no writers** |
| Distributed tracing (OTLP) | — | FAIL |
| Alerting rules | — | FAIL |

## Gaps

1. Redis unused → no cache hit/miss metrics.
2. No structured log shipping (Loki/ELK).
3. Saga failures countable in command center SQL, but no alert route.
4. WP/connector metrics absent.

## Verdict

**PARTIAL** — basic metrics + logs for lab; analytics plane and production observability incomplete.
