# 16 — Capability Catalog

Seeded in `capabilities` (`002`) and exposed at `/api/capabilities`.

| Capability ID | Approval default | Owner subsystem | Implementation status |
|---------------|------------------|-----------------|------------------------|
| `website.page.read` | AUTO | website | PARTIAL — WP fetch / Next stub pages |
| `website.page.update` | CONFIRM | website | PARTIAL — changeset path |
| `website.deploy.preview` | AUTO | website | PARTIAL — preview URLs synthesized |
| `website.deploy.publish` | ADMIN_APPROVAL | website | PARTIAL — approve → publish |
| `database.provision` | ADMIN_APPROVAL | database | PARTIAL — inserts `database_instances` |
| `payment.authorize` | AUTO | billing | PASS (code) — webhook path |
| `subscription.activate` | AUTO | billing | PASS (code) — on payment |
| `agent.execute` | CONFIRM | ai | PARTIAL — phone-change uses approval model |
| `notification.send` | AUTO | notifications | FAIL — template table only |

## Execution path (code)

`executeCapability`: Tenant → Entitlement check → RBAC permission → capability approval gate → handler → audit.

## RBAC permissions (related)

See `17`/`19`; permissions such as `website.edit`, `ai.agent.execute`, `billing.manage` gate HTTP before/alongside capabilities.

## Gaps

- Not every HTTP route goes through `executeCapability` (legacy resources/affiliates direct).
- Notification capability unused.
- Commerce product capabilities on Online Store app JSON are declarative only.

## Verdict

**PARTIAL** — catalog and helper exist; universal enforcement incomplete.
