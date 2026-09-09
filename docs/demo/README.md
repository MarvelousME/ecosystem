# Bridge Demo Ecosystem

This is a local, development-only dataset for exercising the Bridge Control
Center with two materially different tenants: Demo Company (business, commerce,
CRM and marketing) and Northstar-Ops (operations, security and infrastructure).

Start the stack with:

```powershell
docker compose --env-file .env.example --profile full up --build -d
```

The development compose file mounts `008-demo-ecosystem.sql`; the production
compose file deliberately does not. The seed is idempotent and is reapplied by
the `db-migrate` job. It never probes external `.test` domains or calls payment
or email providers.

Useful local endpoints:

- Control Center: `http://localhost:5173/login`
- API health: `http://localhost:4000/health`
- Keycloak: `http://localhost:8181`

For a clean local re-seed, remove only this project's development volumes:

```powershell
docker compose --env-file .env.example --profile full down -v --remove-orphans
docker compose --env-file .env.example --profile full up --build -d
```

This removes local Docker data for the Bridge Compose project only. Do not use
it against a production environment.

Seeded history is marked `demo` or `historical` in metadata where the current
domain model supports metadata. Database resources are explicitly marked
`DEMO_METADATA_ONLY`; no seeded record asserts live provider health.

