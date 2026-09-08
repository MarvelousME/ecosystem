# 19 — RBAC Policy Matrix

Source: `services/platform-api/src/lib/rbac.js` (deny by default). Unit-tested for admin/viewer grants.

## Roles → permissions

| Permission | platform.admin | tenant.admin | tenant.editor | tenant.viewer | support.impersonate |
|------------|:--------------:|:------------:|:-------------:|:-------------:|:-------------------:|
| tenant.read | Y | Y | Y | Y | Y |
| tenant.manage | Y | Y | | | |
| app.read | Y | Y | Y | Y | Y |
| app.create / app.manage | Y | Y | Y | | |
| app.delete | Y | Y | | | |
| website.read | Y | Y | Y | Y | Y |
| website.edit / publish | Y | Y | Y | | |
| wordpress.manage / nextjs.manage | Y | Y | Y | | |
| database.provision | Y | Y | | | |
| deployment.preview | Y | Y | Y | | |
| deployment.publish | Y | Y | | | |
| ai.chat.use | Y | Y | Y | Y | |
| ai.agent.execute | Y | Y | Y | | |
| billing.read | Y | Y | Y | Y | |
| billing.manage | Y | Y | | | |
| cms.read / cms.manage | Y | Y | Y | read only for viewer | |
| affiliate.manage | Y | Y | | | |
| security.manage | Y | Y | | | |
| support.impersonate | Y | | | | Y |
| platform.admin | Y | | | | |

`tenant.admin` = all permissions except `platform.admin` and `support.impersonate`.

## Binding reality

| Concern | Status |
|---------|--------|
| Permission checks on routes via `authorize` | PASS (code) |
| Role source: headers or JWT stub | PARTIAL / FAIL for prod |
| Keycloak realm role mapping | FAIL — not wired |
| Navigation filtered by permissions | PASS (code) |

## Verdict

Matrix is **PASS at code level**; enforcement of authentic role provenance is **FAIL/PARTIAL**.
