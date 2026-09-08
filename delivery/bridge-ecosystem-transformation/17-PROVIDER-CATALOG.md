# 17 — Provider Catalog

Seeded in `providers` (`002`) + `/api/providers`. Website runtime in `src/providers/website.js`.

| Provider ID | Contract | Implementation | Status |
|-------------|----------|----------------|--------|
| `wordpress-website` | IWebsiteProvider | WordPressWebsiteProvider via connector | PARTIAL |
| `nextjs-website` | IWebsiteProvider | NextJsWebsiteProvider (platform-managed stubs) | PARTIAL |
| `mariadb-database` | IDatabaseProvider | MySqlProvider (control-plane host mapping) | PARTIAL |
| `postgresql-database` | IDatabaseProvider | PostgreSqlProvider | PARTIAL |
| `manual-payment` | IPaymentProvider | ManualPaymentProvider (webhook) | PASS (code) |
| `gutenberg-builder` | IVisualBuilderProvider | GutenbergProvider | FAIL — seed only |
| `puck-builder` | IVisualBuilderProvider | PuckProvider | FAIL — seed only |

## Engine notes (`POST /api/databases`)

| Engine | Local status set by API |
|--------|-------------------------|
| postgresql / mysql / mariadb | `READY` (mapped hosts) |
| sqlserver | `UNVERIFIED` |
| mongodb | `UNVERIFIED` |

## External adapters (not in providers table)

| Adapter | Status |
|---------|--------|
| OpenAI-compatible chat | PASS fail-closed |
| Cloudflare purge | PASS fail-closed |
| Frontend MCP / ThreeUI | PARTIAL |

## Rule

AI and UI call **capabilities**, not engines directly. Providers are swappable behind contracts.

## Verdict

**PARTIAL** — website/billing/database stubs real enough for lab; visual builders and non-PG/MySQL engines UNVERIFIED/FAIL.
