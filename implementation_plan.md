# Address SWOT Weaknesses, Threats, and Gaps

This plan outlines the steps to address the Weaknesses, Threats, and Gaps identified in the SWOT analysis, followed by running the system using real-world/production defaults.

## User Review Required

> [!WARNING]
> **Secrets Management (AWS KMS)**
> Setting `BRIDGE_SECRETS_PROVIDER=aws-kms` is the required real-world default. However, this requires a valid `BRIDGE_KMS_KEY_ID` and AWS credentials available in the environment to actually boot up without crashing. 
> 
> **Question:** Do you want me to set this to `aws-kms` and have you provide the real KMS Key ID and AWS credentials, or should I use the fallback `BRIDGE_ALLOW_LAB_SECRETS_IN_PROD=1` to allow the system to boot while still enforcing all other production defaults?

> [!CAUTION]
> **Production Identity Enforced**
> I will be enabling `BRIDGE_REQUIRE_JWT=1` and `BRIDGE_TRUST_HEADERS=0`. Once applied, you will no longer be able to use raw HTTP headers (like `x-actor-id`) to fake authentication. You will need to obtain a real JWT from Keycloak to interact with the API.

## Proposed Changes

### Database Migrations

Update the existing `003-gap-closures.sql` to explicitly register the missing capabilities so that legacy routes can be transitioned to the centralized capability architecture.

#### [MODIFY] [003-gap-closures.sql](file:///c:/Users/marvi/Downloads/ecosystem-enterprise/ecosystem/infra/postgres/003-gap-closures.sql)
Add the following SQL to insert the missing capabilities into the `capabilities` table:
```sql
INSERT INTO capabilities(id, description, approval_default, owner_subsystem) VALUES
('resource.read', 'Read managed resources', 'AUTO', 'platform'),
('resource.manage', 'Manage resources lifecycle', 'ADMIN_APPROVAL', 'platform'),
('affiliate.manage', 'Manage affiliates and conversions', 'AUTO', 'platform'),
('security.manage', 'Manage security and IP rules', 'ADMIN_APPROVAL', 'platform')
ON CONFLICT DO NOTHING;
```

### API Refactoring (Addressing Weakness: Inconsistent Architecture)

Refactor the legacy routes in `server.js` to utilize the `executeCapability` pattern instead of raw SQL queries and RBAC checks.

#### [MODIFY] [server.js](file:///c:/Users/marvi/Downloads/ecosystem-enterprise/ecosystem/services/platform-api/src/server.js)
1. Import `executeCapability` from `lib/capabilities.js`.
2. Wrap the logic for `GET /api/resources`, `POST /api/resources`, `POST /api/resources/:id/lifecycle` in `executeCapability` using `capabilityId: 'resource.read'` or `'resource.manage'`.
3. Wrap `GET /api/affiliates`, `POST /api/affiliates`, `POST /api/conversions` using `capabilityId: 'affiliate.manage'`.
4. Wrap `GET /api/security/rules` and `POST /api/security/rules` using `capabilityId: 'security.manage'`.
5. Inside the handler provided to `executeCapability`, perform the SQL operations.

### Configuration (Addressing Gaps & Threats)

Set up the environment variables to enforce production standards.

#### [NEW/MODIFY] [.env](file:///c:/Users/marvi/Downloads/ecosystem-enterprise/ecosystem/.env)
Create or update the `.env` file from `.env.example` with the following overrides:
```env
NODE_ENV=production
BRIDGE_REQUIRE_JWT=1
BRIDGE_TRUST_HEADERS=0
BRIDGE_SECRETS_PROVIDER=aws-kms
# Pending your decision on AWS KMS vs Lab Fallback:
BRIDGE_ALLOW_LAB_SECRETS_IN_PROD=1 
```

## Verification Plan

### Automated Tests
- Run `npm run check` and `npm run test:unit` inside `services/platform-api` to ensure the refactored code passes syntax and unit tests.

### Manual Verification
- After applying the changes, I will run `./scripts/Start-Bridge.ps1 -Full` (or `docker compose up --build -d`) to start the entire ecosystem.
- I will verify the API health endpoint `http://localhost:4000/health` to confirm that `jwtRequired: true` and `headersTrusted: false` are reflected.
- The system should successfully boot up with NATS JetStream enabled (which is the default via the `-js` flag) and the durable provision worker running.
