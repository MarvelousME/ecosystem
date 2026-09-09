# Demo Accounts

LAB ONLY. These deterministic credentials are imported by the local Keycloak
realm in `infra/keycloak/bridge-realm.json`. They must not be used outside a
development environment.

| Scope | Username | Password |
| --- | --- | --- |
| Platform administrator | `bridgeadmin` | `BridgeAdmin!Demo2026` |
| Demo Company owner | `demo.owner` | `DemoOwner!2026` |
| Demo Company billing | `demo.billing` | `DemoBilling!2026` |
| Demo Company operations | `demo.ops` | `DemoOps!2026` |
| Demo Company content | `demo.content` | `DemoContent!2026` |
| Northstar-Ops owner | `northstar.owner` | `NorthstarOwner!2026` |
| Northstar-Ops security | `northstar.security` | `NorthstarSec!2026` |
| Northstar-Ops developer | `northstar.developer` | `NorthstarDev!2026` |
| Northstar-Ops billing | `northstar.billing` | `NorthstarBilling!2026` |

Use the tenant header selector only for local header-auth API development. JWT
login is the expected browser path. Tenant membership is still checked on the
server; choosing another tenant identifier does not grant cross-tenant access.

