CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  plan text NOT NULL DEFAULT 'starter',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS apps(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL, app_type text NOT NULL, launch_url text NOT NULL, database_engine text NOT NULL DEFAULT 'none',
  status text NOT NULL DEFAULT 'ready', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS managed_resources(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  kind text NOT NULL, resource_key text NOT NULL, name text NOT NULL, version text NOT NULL DEFAULT '1.0.0',
  state text NOT NULL DEFAULT 'installed', config jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(tenant_id,resource_key)
);
CREATE TABLE IF NOT EXISTS affiliates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL, email text NOT NULL, commission_rate numeric(7,4) NOT NULL DEFAULT .10,
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,code)
);
CREATE TABLE IF NOT EXISTS conversions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  affiliate_id uuid NOT NULL REFERENCES affiliates(id), external_key text NOT NULL, amount numeric(14,2) NOT NULL,
  commission numeric(14,2) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,external_key)
);
CREATE TABLE IF NOT EXISTS security_rules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  action text NOT NULL CHECK(action IN ('BLOCK','ALLOW','CHALLENGE','OBSERVE')), target text NOT NULL,
  reason text NOT NULL, provider text NOT NULL DEFAULT 'bridge', expires_at timestamptz, enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_log(
  id bigserial PRIMARY KEY, tenant_id uuid, actor text NOT NULL, action text NOT NULL, resource_type text NOT NULL,
  resource_id text, request_id uuid NOT NULL DEFAULT gen_random_uuid(), metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox(
  id bigserial PRIMARY KEY, event_id uuid NOT NULL DEFAULT gen_random_uuid(), tenant_id uuid, subject text NOT NULL,
  payload jsonb NOT NULL, published_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(event_id)
);
CREATE TABLE IF NOT EXISTS sagas(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  saga_type text NOT NULL, state text NOT NULL, step int NOT NULL DEFAULT 0, input jsonb NOT NULL,
  error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO tenants(slug,name,plan) VALUES ('bridge-demo','Bridge Demo Company','enterprise') ON CONFLICT(slug) DO NOTHING;
INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine)
SELECT id,'Corporate WordPress Website','wordpress','http://localhost:8080','mysql' FROM tenants WHERE slug='bridge-demo'
ON CONFLICT DO NOTHING;
INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine)
SELECT id,'React Marketing Website','react','http://localhost:5173','postgresql' FROM tenants WHERE slug='bridge-demo'
ON CONFLICT DO NOTHING;
INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine)
SELECT id,'AI Hub','ai-hub','http://localhost:5173/#/ai','none' FROM tenants WHERE slug='bridge-demo'
ON CONFLICT DO NOTHING;
