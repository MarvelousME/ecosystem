# Acceptance Tests

1. Start stack with `docker compose --profile full up --build -d`.
2. `GET http://localhost:4000/health` returns healthy.
3. Open Control Center and select Bridge Demo Company.
4. App Launcher shows WordPress, React and AI Hub apps.
5. Register a managed resource and exercise legal/illegal lifecycle transitions.
6. Configure AI provider; chat returns provider output. Without configuration it returns 503.
7. Create affiliate; record the same conversion key twice and verify one logical conversion.
8. Create IP rule and confirm it is tenant-scoped.
9. POST `/api/provision`; inspect saga transition to completed and NATS monitoring.
10. Configure Cloudflare credentials; purge endpoint must either succeed with Cloudflare evidence or fail explicitly.
11. Activate Bridge Connector in WordPress and verify `/wp-json/bridge-connector/v1/health`.
12. Verify MCP `/health`, initialize, tools/list and bounded preview plan.
