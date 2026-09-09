-- 006 Marketplace, agents, and frontend catalog governance. Safe on existing databases.

ALTER TABLE marketplace_versions ADD COLUMN IF NOT EXISTS checksum text;
ALTER TABLE marketplace_versions ADD COLUMN IF NOT EXISTS signature text;
ALTER TABLE marketplace_versions ADD COLUMN IF NOT EXISTS security_review_status text NOT NULL DEFAULT 'REVIEW_PENDING';
ALTER TABLE marketplace_installations ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE marketplace_installations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_installations_tenant_package_active_uq
  ON marketplace_installations(tenant_id, package_id) WHERE state <> 'uninstalled';
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_installations_idempotency_uq
  ON marketplace_installations(tenant_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketplace_visibility_rules(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES marketplace_packages(id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK(rule_type IN ('PUBLIC_TO_ALL_TENANTS','PLAN_BASED','TENANT_ALLOWLIST','TENANT_DENYLIST','PRIVATE','INTERNAL')),
  rule_value jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_visibility_rules_package_idx ON marketplace_visibility_rules(package_id);

CREATE TABLE IF NOT EXISTS tenant_dashboard_preferences(
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id text NOT NULL DEFAULT '',
  application_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  pinned boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id, actor_id, application_id)
);

CREATE TABLE IF NOT EXISTS frontend_components(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL REFERENCES frontend_mcp_providers(id) ON DELETE RESTRICT,
  component_key text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  license text,
  props_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_props jsonb NOT NULL DEFAULT '{}'::jsonb,
  responsive_behavior jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  preview_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  security_review_status text NOT NULL DEFAULT 'REVIEW_PENDING' CHECK(security_review_status IN ('DISCOVERED','REVIEW_PENDING','APPROVED','DEPRECATED','BLOCKED')),
  accessibility_status text NOT NULL DEFAULT 'PENDING',
  status text NOT NULL DEFAULT 'REVIEW_PENDING' CHECK(status IN ('DISCOVERED','REVIEW_PENDING','APPROVED','DEPRECATED','BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, component_key, version)
);
CREATE TABLE IF NOT EXISTS frontend_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_id text NOT NULL REFERENCES frontend_mcp_providers(id) ON DELETE RESTRICT,
  template_key text NOT NULL,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  page_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  dependencies jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'REVIEW_PENDING' CHECK(status IN ('DISCOVERED','REVIEW_PENDING','APPROVED','DEPRECATED','BLOCKED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(provider_id, template_key, version)
);
CREATE TABLE IF NOT EXISTS frontend_installations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  component_id uuid REFERENCES frontend_components(id) ON DELETE RESTRICT,
  template_id uuid REFERENCES frontend_templates(id) ON DELETE RESTRICT,
  configuration jsonb NOT NULL DEFAULT '{}'::jsonb,
  state text NOT NULL DEFAULT 'REQUESTED' CHECK(state IN ('REQUESTED','READY','FAILED','REMOVED')),
  installed_by text NOT NULL,
  installed_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((component_id IS NOT NULL) <> (template_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS frontend_installations_tenant_app_idx ON frontend_installations(tenant_id, application_id);

CREATE TABLE IF NOT EXISTS agent_definitions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  scope text NOT NULL DEFAULT 'TENANT' CHECK(scope IN ('PLATFORM','TENANT','APPLICATION')),
  owner_subsystem text NOT NULL DEFAULT 'ai',
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  memory_requirements jsonb NOT NULL DEFAULT '{}'::jsonb,
  default_budget jsonb NOT NULL DEFAULT '{"maxExecutions":100,"maxCostCents":0}'::jsonb,
  policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_mode text NOT NULL DEFAULT 'CONFIRM',
  version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'READY',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS agent_skills(
  id text PRIMARY KEY,
  name text NOT NULL,
  description text,
  version text NOT NULL DEFAULT '1.0.0',
  capabilities_required jsonb NOT NULL DEFAULT '[]'::jsonb,
  tools_required jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  output_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  risk_level text NOT NULL DEFAULT 'LOW'
);
CREATE TABLE IF NOT EXISTS agent_tool_bindings(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_definition_id uuid NOT NULL REFERENCES agent_definitions(id) ON DELETE CASCADE,
  tool_key text NOT NULL,
  capability_id text NOT NULL REFERENCES capabilities(id) ON DELETE RESTRICT,
  provider_id text REFERENCES frontend_mcp_providers(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'ACTIVE',
  UNIQUE(agent_definition_id, tool_key)
);
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS agent_definition_id uuid REFERENCES agent_definitions(id) ON DELETE SET NULL;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES apps(id) ON DELETE CASCADE;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS lifecycle_state text NOT NULL DEFAULT 'READY';
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;
ALTER TABLE agent_instances ADD COLUMN IF NOT EXISTS budget jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS agent_instance_id uuid REFERENCES agent_instances(id) ON DELETE SET NULL;
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS application_id uuid REFERENCES apps(id) ON DELETE SET NULL;
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS actor_id text;
ALTER TABLE agent_executions ADD COLUMN IF NOT EXISTS prompt text;

INSERT INTO capabilities(id, description, approval_default, owner_subsystem) VALUES
('marketplace.app.configure','Configure tenant marketplace installation','CONFIRM','marketplace'),
('marketplace.admin.read','Read marketplace administration','AUTO','marketplace'),
('marketplace.app.publish','Publish marketplace package','ADMIN_APPROVAL','marketplace'),
('marketplace.app.suspend','Suspend marketplace package','ADMIN_APPROVAL','marketplace'),
('agent.read','Read available agents','AUTO','ai'),
('agent.install','Install tenant agent','CONFIRM','ai'),
('agent.configure','Configure tenant agent','CONFIRM','ai'),
('agent.execute','Execute agent','CONFIRM','ai'),
('agent.pause','Pause tenant agent','CONFIRM','ai'),
('agent.disable','Disable tenant agent','ADMIN_APPROVAL','ai'),
('agent.admin.read','Read agent definitions','AUTO','ai'),
('agent.admin.manage','Manage agent definitions','ADMIN_APPROVAL','ai'),
('skill.read','Read agent skills','AUTO','ai'),
('tool.read','Read approved agent tools','AUTO','ai'),
('frontend.component.read','Read approved frontend components','AUTO','frontend-mcp'),
('frontend.component.install','Install approved frontend component','CONFIRM','frontend-mcp'),
('frontend.component.approve','Approve frontend component','ADMIN_APPROVAL','frontend-mcp'),
('frontend.template.read','Read approved frontend templates','AUTO','frontend-mcp'),
('frontend.template.install','Install approved frontend template','CONFIRM','frontend-mcp'),
('frontend.page.read','Read frontend page specification','AUTO','frontend-mcp'),
('frontend.page.edit','Edit frontend page specification','CONFIRM','frontend-mcp'),
('frontend.preview.create','Create frontend preview','AUTO','frontend-mcp')
ON CONFLICT DO NOTHING;

INSERT INTO agent_skills(id,name,description,capabilities_required,tools_required,risk_level) VALUES
('website.ui.design','UI Design','Creates structured, preview-only frontend plans','["frontend.component.read","frontend.preview.create"]','["frontend.components.search","frontend.preview.create"]','MEDIUM'),
('website.seo.optimization','SEO Optimization','Audits and proposes SEO improvements','["website.page.read"]','[]','LOW'),
('marketplace.recommend','Marketplace Recommendations','Finds compatible, entitled marketplace packages','["marketplace.read"]','[]','LOW')
ON CONFLICT DO NOTHING;

INSERT INTO agent_definitions(agent_key,name,description,skills,capabilities,tools,approval_mode) VALUES
('ui-designer','UI Designer','Builds structured frontend plans through the governed Frontend MCP','["website.ui.design"]','["frontend.component.read","frontend.preview.create"]','["frontend.components.search","frontend.preview.create"]','CONFIRM'),
('seo-agent','SEO Agent','Audits website content and SEO opportunities','["website.seo.optimization"]','["website.page.read"]','[]','CONFIRM'),
('marketplace-agent','Marketplace Agent','Recommends compatible marketplace packages without installing them','["marketplace.recommend"]','["marketplace.read"]','[]','AUTO')
ON CONFLICT(agent_key) DO NOTHING;

INSERT INTO frontend_components(provider_id,component_key,name,category,description,license,props_schema,default_props,responsive_behavior,preview_metadata,security_review_status,accessibility_status,status)
VALUES ('threeui-community','glass-hero','Glass Hero','Hero','ThreeUI-backed hero represented as a structured Puck component','provider-license','{"type":"object","properties":{"title":{"type":"string"},"subtitle":{"type":"string"},"cta":{"type":"string"}}}','{"title":"Build with Bridge","subtitle":"Governed component catalog","cta":"Get started"}','{"breakpoints":["mobile","tablet","desktop"]}','{"adapter":"puck","component":"ThreeUiGlassHero"}','APPROVED','REVIEWED','APPROVED')
ON CONFLICT(provider_id,component_key,version) DO NOTHING;

INSERT INTO schema_migrations(id) VALUES ('006-marketplace-agent-frontend-governance') ON CONFLICT DO NOTHING;
