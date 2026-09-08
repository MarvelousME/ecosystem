# 04 — Duplication Analysis

## Intentional reuse (not duplication debt)

CMS/config concepts from `bridge-ecosystem-platform-enterprise-starter` were **ported into Postgres SoR**, not copied as a second kernel:

| Starter concept | Bridge location | Conflict risk |
|-----------------|-----------------|---------------|
| Content models/entries | `content_models`, `content_entries` + `/api/cms/*` | Low — platform-owned |
| Scoped config | `scoped_config` | Low |
| Brand profile | `brand_profiles` | Low |
| Visual component catalog | `visual_components` | Low — seed only |
| Provider/capability registries | `providers`, `capabilities`, `subsystems` | Low |

**Rejected:** WP-kernel as tenancy authority. WordPress remains an app runtime.

## Residual dual surfaces

| Surface A | Surface B | Notes | Status |
|-----------|-----------|-------|--------|
| Legacy `/api/resources` lifecycle | Apps + capabilities fabric | Both live; resources remain for Control Center v1 | PARTIAL |
| Envelope responses (`x-bridge-envelope:1`) | Legacy bare JSON | Compat layer in `server.js` | PASS (intentional) |
| Header actor identity | Keycloak JWT stub | Parallel auth modes | PARTIAL |
| WordPress page content | Platform CMS entries | Dual content stores by design for WP apps | PARTIAL |
| Next.js “pages” in provider | Synthetic drafts in `website.js` | Not a second CMS DB; stub pages | UNVERIFIED depth |

## Eliminated / avoided duplicates

- No second Postgres schema owned by WordPress for tenants.
- No duplicate billing ledger outside `orders`/`payments`/`subscriptions`.
- Capability IDs seeded once in `002`; not redefined per app type in WP.

## Remaining cleanup candidates

1. Collapse or formally deprecate `managed_resources` once UI fully uses apps/capabilities.
2. Replace synthetic Next.js page stubs with real content entries.
3. Remove Redis from Compose **or** wire a client (current: dead dependency).
4. Align provider seed rows for Puck/Gutenberg with real implementations or mark `status=stub`.

## Verdict

**PARTIAL** — consolidation direction is correct; dual auth and dual content paths remain by design until builders and OIDC land.
