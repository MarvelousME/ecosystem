# Architecture

```mermaid
graph TB
  CF[Cloudflare WAF/CDN] --> UI[React Control Center]
  CF --> WP[WordPress Tenant App]
  UI --> API[Bridge Platform API]
  API --> KC[Keycloak/OIDC]
  API --> PG[(PostgreSQL)]
  API --> R[(Redis)]
  API --> N[NATS JetStream]
  N --> W[Provisioning Saga Worker]
  API --> MCP[Bridge Frontend MCP]
  MCP --> T[ThreeUI Provider]
  N -. optional .-> CH[(ClickHouse)]
  API -. metrics .-> P[Prometheus/Grafana]
```

## Tenancy

All business records are tenant-owned. The local v1 API requires explicit `x-tenant-id` on tenant-bound operations. Production identity integration should resolve tenant membership from authenticated claims and enforce it server-side.

## Events

Provisioning requests are persisted to `outbox` and published to NATS. The worker advances saga state and emits completion/failure events. Production should add an outbox relay transaction and consumer idempotency table.
