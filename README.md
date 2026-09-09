# Bridge Ecosystem Platform — Enterprise All-in-One v1

A runnable, multi-tenant SaaS ecosystem reference implementation combining:

- React/Vite Control Center and tenant App Launcher
- Node/Fastify platform API
- PostgreSQL tenant-aware core data
- Redis cache/session substrate
- NATS JetStream event bus
- durable provisioning saga worker
- Keycloak OIDC realm for production-style identity boundaries
- WordPress 7.1 application runtime + Bridge connector
- Bridge-owned Frontend MCP service with ThreeUI provider metadata
- affiliate/acquisition domain
- managed capabilities/features lifecycle
- security/IP rule control plane and Cloudflare adapter
- optional ClickHouse/Prometheus/Grafana full-stack profile

## Start everything in one pass

PowerShell:

```powershell
Copy-Item .env.example .env
./scripts/Start-Bridge.ps1 -Full
```

Linux/macOS:

```bash
cp .env.example .env
./scripts/start-bridge.sh --full
```

Or directly:

```bash
docker compose --profile full up --build -d
```

## URLs

- Control Center: http://localhost:5173
- Platform API health: http://localhost:4000/health
- Keycloak: http://localhost:8081
- WordPress: http://localhost:8080
- Frontend MCP health: http://localhost:3100/health
- NATS monitoring: http://localhost:8222
- Prometheus (full profile): http://localhost:9090
- Grafana (full profile): http://localhost:3001

## Seed credentials

Keycloak realm import creates a development user:

- username: `bridgeadmin`
- password: `BridgeAdmin!123`

Change all example credentials before any shared or production use.

## Core scenario

One tenant can register:

1. a WordPress website,
2. a React website,
3. an AI Hub,
4. any additional applications.

The AI Hub and Control Center operate through platform capabilities rather than direct database/filesystem access.

## Current execution contract

This repository is designed to fail closed when optional external providers are not configured. Cloudflare and AI calls return explicit configuration errors; they do not return fake success.

## Production hardening

Start production configuration from `.env.production.example`; it requires JWTs, disables trusted identity headers, enables OIDC in the compiled Control Center, and selects AWS KMS. Deploy with `docker compose -f docker-compose.prod.yml --env-file .env up -d`.

Run `./scripts/Test-Bridge.ps1 -Mode Production` before deployment, then add `-Full -AccessToken <JWT>` against the live stack to verify JWT enforcement, API health, the Control Center, and provisioning/outbox processing.

Lab gap closures already include: jose JWKS, outbox relay + consumer inbox, Redis rate-limit/cache, ClickHouse writers (when `CLICKHOUSE_URL` set), ZIP quarantine, Puck/Gutenberg builder APIs, CI workflow.
