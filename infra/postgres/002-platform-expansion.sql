-- Bridge Ecosystem Platform expansion (idempotent)
CREATE TABLE IF NOT EXISTS schema_migrations(
  id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Clients (distinct from tenants)
CREATE TABLE IF NOT EXISTS clients(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS organizations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS client_tenants(
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  PRIMARY KEY(client_id, tenant_id)
);

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS isolation_mode text NOT NULL DEFAULT 'SHARED';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id);
ALTER TABLE apps ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'production';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS lifecycle_status text NOT NULL DEFAULT 'READY';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS launch_mode text NOT NULL DEFAULT 'url';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT '1.0.0';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS capabilities jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE apps ADD COLUMN IF NOT EXISTS health text NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE apps ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Products / billing
CREATE TABLE IF NOT EXISTS products(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  billing_cycle text NOT NULL DEFAULT 'monthly',
  price_cents int NOT NULL DEFAULT 0,
  entitlements jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES clients(id),
  tenant_id uuid REFERENCES tenants(id),
  product_id uuid NOT NULL REFERENCES products(id),
  status text NOT NULL DEFAULT 'pending',
  amount_cents int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS payments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id),
  provider text NOT NULL DEFAULT 'manual',
  external_event_key text NOT NULL,
  amount_cents int NOT NULL,
  status text NOT NULL DEFAULT 'succeeded',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_event_key)
);
CREATE TABLE IF NOT EXISTS subscriptions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id),
  status text NOT NULL DEFAULT 'active',
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE(tenant_id, product_id)
);
CREATE TABLE IF NOT EXISTS invoices(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  order_id uuid REFERENCES orders(id),
  amount_cents int NOT NULL,
  status text NOT NULL DEFAULT 'paid',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS event_inbox(
  id bigserial PRIMARY KEY,
  provider text NOT NULL,
  external_event_key text NOT NULL,
  payload jsonb NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider, external_event_key)
);

-- Entitlements snapshot
CREATE TABLE IF NOT EXISTS entitlements(
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  limits jsonb NOT NULL DEFAULT '{}'::jsonb,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- CMS (ported conceptually from enterprise-starter)
CREATE TABLE IF NOT EXISTS content_models(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, slug)
);
CREATE TABLE IF NOT EXISTS content_entries(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  model_id uuid NOT NULL REFERENCES content_models(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS scoped_config(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  app_id uuid REFERENCES apps(id) ON DELETE CASCADE,
  config_key text NOT NULL,
  config_value jsonb NOT NULL,
  version int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, app_id, config_key)
);

-- Brand + visual components
CREATE TABLE IF NOT EXISTS brand_profiles(
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  profile jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS visual_components(
  id text PRIMARY KEY,
  category text NOT NULL,
  schema jsonb NOT NULL,
  providers text[] NOT NULL DEFAULT ARRAY['wordpress','nextjs','puck','gutenberg']
);

-- Databases control plane
CREATE TABLE IF NOT EXISTS database_instances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES apps(id) ON DELETE SET NULL,
  engine text NOT NULL,
  version text,
  host text,
  port int,
  database_name text,
  status text NOT NULL DEFAULT 'PROVISIONING',
  secret_ref text,
  backup_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Secrets (references only; values in secret_store table encrypted-at-rest stub)
CREATE TABLE IF NOT EXISTS secret_store(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  ciphertext text NOT NULL,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  rotated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, name)
);

-- Domains
CREATE TABLE IF NOT EXISTS domains(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES apps(id),
  hostname text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, hostname)
);

-- Workflows
CREATE TABLE IF NOT EXISTS workflows(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  version int NOT NULL DEFAULT 1,
  definition jsonb NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS workflow_executions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running',
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AI / agents
CREATE TABLE IF NOT EXISTS agents(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  name text NOT NULL,
  description text,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  status text NOT NULL DEFAULT 'active',
  UNIQUE(tenant_id, agent_key)
);
CREATE TABLE IF NOT EXISTS agent_executions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id),
  goal text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  approval_level text NOT NULL DEFAULT 'AUTO',
  approval_status text NOT NULL DEFAULT 'not_required',
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id uuid NOT NULL DEFAULT gen_random_uuid(),
  trace_id uuid NOT NULL DEFAULT gen_random_uuid(),
  input_tokens int NOT NULL DEFAULT 0,
  output_tokens int NOT NULL DEFAULT 0,
  cost_cents numeric(12,4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_artifacts(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES apps(id),
  agent_execution_id uuid REFERENCES agent_executions(id),
  artifact_type text NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'draft',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ai_memory(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  scope text NOT NULL,
  scope_id text,
  key text NOT NULL,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, scope, scope_id, key)
);
CREATE TABLE IF NOT EXISTS changesets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  agent_execution_id uuid REFERENCES agent_executions(id),
  status text NOT NULL DEFAULT 'pending_approval',
  summary text,
  diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

-- Capabilities / providers / subsystems
CREATE TABLE IF NOT EXISTS capabilities(
  id text PRIMARY KEY,
  description text NOT NULL,
  approval_default text NOT NULL DEFAULT 'AUTO',
  owner_subsystem text
);
CREATE TABLE IF NOT EXISTS providers(
  id text PRIMARY KEY,
  contract text NOT NULL,
  implementation text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS subsystems(
  id text PRIMARY KEY,
  version text NOT NULL,
  owner text NOT NULL,
  description text,
  manifest jsonb NOT NULL
);

-- Support / CRM / notifications (foundation)
CREATE TABLE IF NOT EXISTS leads(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  name text NOT NULL,
  email text,
  source text,
  score int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'new',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS support_tickets(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject text NOT NULL,
  priority text NOT NULL DEFAULT 'normal',
  status text NOT NULL DEFAULT 'open',
  assignee text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notification_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  channel text NOT NULL,
  name text NOT NULL,
  subject text,
  body text NOT NULL,
  UNIQUE(tenant_id, channel, name)
);

-- Saga step persistence
CREATE TABLE IF NOT EXISTS saga_steps(
  id bigserial PRIMARY KEY,
  saga_id uuid NOT NULL REFERENCES sagas(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Deployments / backups
CREATE TABLE IF NOT EXISTS deployments(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  environment text NOT NULL,
  version text,
  status text NOT NULL DEFAULT 'pending',
  actor text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE IF NOT EXISTS backups(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES apps(id),
  kind text NOT NULL,
  location text NOT NULL,
  status text NOT NULL DEFAULT 'completed',
  verified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed products
INSERT INTO products(code,name,description,price_cents,entitlements) VALUES
('starter-website','Starter Website','Managed starter site',2900,'{"apps":3,"databases":1,"storage_gb":5,"ai_executions":100,"users":5}'),
('business-website','Business Website','Business website pack',7900,'{"apps":10,"databases":3,"storage_gb":25,"ai_executions":1000,"users":25}'),
('ecommerce','Ecommerce','Online store pack',14900,'{"apps":15,"databases":5,"storage_gb":50,"ai_executions":2000,"users":50,"commerce":true}'),
('ai-workspace','AI Workspace','AI agent workspace',9900,'{"apps":5,"databases":2,"storage_gb":20,"ai_executions":5000,"users":20,"ai":true}')
ON CONFLICT(code) DO NOTHING;

-- Seed client for demo tenant
INSERT INTO clients(name,email) SELECT 'Bridge Demo Client','demo@bridge.local'
WHERE NOT EXISTS (SELECT 1 FROM clients WHERE email='demo@bridge.local');
INSERT INTO client_tenants(client_id, tenant_id)
SELECT c.id, t.id FROM clients c, tenants t
WHERE c.email='demo@bridge.local' AND t.slug='bridge-demo'
ON CONFLICT DO NOTHING;
UPDATE tenants SET client_id=c.id FROM clients c
WHERE tenants.slug='bridge-demo' AND c.email='demo@bridge.local';

INSERT INTO entitlements(tenant_id, limits, usage)
SELECT id, '{"apps":15,"databases":5,"storage_gb":50,"ai_executions":5000,"users":50}'::jsonb, '{"apps":3,"databases":1,"ai_executions":0}'::jsonb
FROM tenants WHERE slug='bridge-demo'
ON CONFLICT(tenant_id) DO NOTHING;

INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,lifecycle_status,capabilities)
SELECT id,'Online Store','commerce','http://localhost:8080/shop','mysql','READY','["commerce.product.read","commerce.product.update"]'::jsonb
FROM tenants WHERE slug='bridge-demo'
AND NOT EXISTS (SELECT 1 FROM apps a JOIN tenants t ON a.tenant_id=t.id WHERE t.slug='bridge-demo' AND a.name='Online Store');

INSERT INTO brand_profiles(tenant_id, profile)
SELECT id, '{"company":"Bridge Demo Company","phone":"+1-555-0100","colors":{"primary":"#0B6E4F"},"voice":"confident, clear"}'::jsonb
FROM tenants WHERE slug='bridge-demo'
ON CONFLICT(tenant_id) DO NOTHING;

INSERT INTO ai_memory(tenant_id, scope, scope_id, key, value)
SELECT id, 'tenant', id::text, 'contact.phone', '"+1-555-0100"'::jsonb FROM tenants WHERE slug='bridge-demo'
ON CONFLICT DO NOTHING;

INSERT INTO agents(tenant_id, agent_key, name, description, skills, capabilities)
SELECT id, 'website-architect', 'Website Architect', 'Plans and applies website changes via capabilities',
 '["content","seo","multi-site"]'::jsonb,
 '["website.page.read","website.page.update","website.deploy.preview","website.deploy.publish"]'::jsonb
FROM tenants WHERE slug='bridge-demo'
ON CONFLICT DO NOTHING;

INSERT INTO capabilities(id, description, approval_default, owner_subsystem) VALUES
('website.page.read','Read website pages','AUTO','website'),
('website.page.update','Update website pages (draft/changeset)','CONFIRM','website'),
('website.deploy.preview','Generate preview','AUTO','website'),
('website.deploy.publish','Publish to production','ADMIN_APPROVAL','website'),
('database.provision','Provision database','ADMIN_APPROVAL','database'),
('payment.authorize','Authorize payment','AUTO','billing'),
('subscription.activate','Activate subscription','AUTO','billing'),
('agent.execute','Execute agent goal','CONFIRM','ai'),
('notification.send','Send notification','AUTO','notifications')
ON CONFLICT DO NOTHING;

INSERT INTO providers(id, contract, implementation, config) VALUES
('wordpress-website','IWebsiteProvider','WordPressWebsiteProvider','{"baseUrl":"http://wordpress"}'),
('nextjs-website','IWebsiteProvider','NextJsWebsiteProvider','{"mode":"platform-managed"}'),
('mariadb-database','IDatabaseProvider','MySqlProvider','{"engine":"mariadb"}'),
('postgresql-database','IDatabaseProvider','PostgreSqlProvider','{"engine":"postgresql"}'),
('manual-payment','IPaymentProvider','ManualPaymentProvider','{}'),
('gutenberg-builder','IVisualBuilderProvider','GutenbergProvider','{}'),
('puck-builder','IVisualBuilderProvider','PuckProvider','{}')
ON CONFLICT DO NOTHING;

INSERT INTO subsystems(id, version, owner, description, manifest) VALUES
('website','1.0.0','platform','Website capability subsystem','{"capabilitiesProvided":["website.page.read","website.page.update","website.deploy.preview","website.deploy.publish"]}'),
('billing','1.0.0','platform','Billing and entitlements','{"capabilitiesProvided":["payment.authorize","subscription.activate"]}'),
('ai','1.0.0','platform','AI agent control plane','{"capabilitiesProvided":["agent.execute"]}'),
('database','1.0.0','platform','Database control plane','{"capabilitiesProvided":["database.provision"]}')
ON CONFLICT DO NOTHING;

INSERT INTO visual_components(id, category, schema) VALUES
('Hero','layout','{"props":["title","subtitle","cta"]}'),
('Navigation','layout','{"props":["items"]}'),
('Footer','layout','{"props":["links","phone"]}'),
('Text','content','{"props":["body"]}'),
('RichText','content','{"props":["html"]}'),
('Image','media','{"props":["src","alt"]}'),
('CTA','conversion','{"props":["label","href"]}'),
('Contact','conversion','{"props":["phone","email","address"]}'),
('Pricing','commerce','{"props":["plans"]}'),
('ProductGrid','commerce','{"props":["products"]}')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations(id) VALUES ('002-platform-expansion') ON CONFLICT DO NOTHING;
