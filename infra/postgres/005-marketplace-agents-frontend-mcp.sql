-- 005 Marketplace, Native Agents, and Frontend MCP Integration
-- Full multi-version marketplace, agent templates/instances, governed Frontend MCP

-- Marketplace packages and versions
CREATE TABLE IF NOT EXISTS marketplace_packages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  publisher_id text NOT NULL,
  category text NOT NULL,
  icon_url text,
  screenshots jsonb DEFAULT '[]'::jsonb,
  documentation_url text,
  source_url text,
  status text NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS marketplace_versions(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES marketplace_packages(id) ON DELETE CASCADE,
  version text NOT NULL,
  changelog text,
  compatibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  requires_entitlement text,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(package_id, version)
);

CREATE TABLE IF NOT EXISTS marketplace_installations(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES marketplace_packages(id) ON DELETE CASCADE,
  version_id uuid NOT NULL REFERENCES marketplace_versions(id) ON DELETE CASCADE,
  installation_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'pending',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  app_id uuid REFERENCES apps(id) ON DELETE SET NULL,
  installed_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, installation_key)
);

-- Agent templates (platform-provided base agents)
CREATE TABLE IF NOT EXISTS agent_templates(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL DEFAULT 'active',
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Tenant agent instances (from templates or custom)
CREATE TABLE IF NOT EXISTS agent_instances(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_key text NOT NULL,
  name text NOT NULL,
  description text,
  template_id uuid REFERENCES agent_templates(id) ON DELETE SET NULL,
  skills jsonb NOT NULL DEFAULT '[]'::jsonb,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  model text,
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE(tenant_id, agent_key)
);

-- Frontend MCP provider governance
CREATE TABLE IF NOT EXISTS frontend_mcp_providers(
  id text PRIMARY KEY,
  name text NOT NULL,
  package text NOT NULL,
  role text NOT NULL,
  control_plane text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS frontend_mcp_approvals(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  agent_execution_id uuid REFERENCES agent_executions(id) ON DELETE CASCADE,
  request_type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_level text NOT NULL DEFAULT 'AUTO',
  approval_status text NOT NULL DEFAULT 'pending',
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Publisher management
CREATE TABLE IF NOT EXISTS marketplace_publishers(
  id text PRIMARY KEY,
  name text NOT NULL,
  email text,
  website_url text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Marketplace categories
CREATE TABLE IF NOT EXISTS marketplace_categories(
  id text PRIMARY KEY,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  sort_order int NOT NULL DEFAULT 0
);

-- Installation saga steps
CREATE TABLE IF NOT EXISTS installation_saga_steps(
  id bigserial PRIMARY KEY,
  installation_id uuid NOT NULL REFERENCES marketplace_installations(id) ON DELETE CASCADE,
  step_name text NOT NULL,
  status text NOT NULL,
  attempt int NOT NULL DEFAULT 1,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for tenant isolation and performance
CREATE INDEX IF NOT EXISTS idx_marketplace_installations_tenant ON marketplace_installations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_installations_state ON marketplace_installations(state);
CREATE INDEX IF NOT EXISTS idx_agent_instances_tenant ON agent_instances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_frontend_mcp_approvals_tenant ON frontend_mcp_approvals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_frontend_mcp_approvals_status ON frontend_mcp_approvals(approval_status);
CREATE INDEX IF NOT EXISTS idx_marketplace_versions_package ON marketplace_versions(package_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_versions_status ON marketplace_versions(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_packages_category ON marketplace_packages(category);
CREATE INDEX IF NOT EXISTS idx_marketplace_packages_status ON marketplace_packages(status);

-- Seed Categories
INSERT INTO marketplace_categories(id, name, slug, description, sort_order) VALUES
('featured', 'Featured', 'featured', 'Highlighted applications', 0),
('business', 'Business', 'business', 'Business and productivity tools', 1),
('ai-agents', 'AI & Agents', 'ai-agents', 'AI-powered agents and assistants', 2),
('automation', 'Automation', 'automation', 'Workflow automation', 3),
('commerce', 'Commerce', 'commerce', 'E-commerce solutions', 4),
('analytics', 'Analytics', 'analytics', 'Data analytics and reporting', 5),
('security', 'Security', 'security', 'Security and compliance', 6),
('website', 'Website', 'website', 'Website builders and CMS', 7),
('integrations', 'Integrations', 'integrations', 'Third-party integrations', 8)
ON CONFLICT DO NOTHING;

-- Seed Publishers
INSERT INTO marketplace_publishers(id, name, email, website_url) VALUES
('bridge', 'Bridge Platform', 'platform@bridge.local', 'https://bridge.local'),
('ecosystem', 'Bridge Ecosystem', 'ecosystem@bridge.local', 'https://bridge.local/ecosystem')
ON CONFLICT DO NOTHING;

-- Seed Agent Templates (platform-provided)
INSERT INTO agent_templates(template_key, name, description, category, skills, capabilities, model, version) VALUES
('seo-agent', 'SEO Optimizer', 'Analyzes and optimizes content for search engines', 'AI & Agents',
 '["content-analysis", "keyword-research", "seo-audit"]'::jsonb,
 '["website.page.read", "website.page.update", "cms.read"]'::jsonb,
 'gpt-4', '1.0.0'),
('security-agent', 'Security Scanner', 'Scans applications for security vulnerabilities', 'AI & Agents',
 '["vulnerability-scan", "dependency-check", "config-audit"]'::jsonb,
 '["security.read", "security.manage", "app.read"]'::jsonb,
 'gpt-4', '1.0.0'),
('crm-agent', 'CRM Assistant', 'Manages customer relationships and sales pipelines', 'AI & Agents',
 '["lead-management", "contact-sync", "pipeline-tracking"]'::jsonb,
 '["cms.read", "cms.manage", "app.read"]'::jsonb,
 'gpt-4', '1.0.0'),
('marketing-agent', 'Marketing Campaign Manager', 'Designs and manages marketing campaigns', 'AI & Agents',
 '["campaign-design", "content-generation", "analytics"]'::jsonb,
 '["cms.read", "cms.manage", "app.read"]'::jsonb,
 'gpt-4', '1.0.0'),
('website-agent', 'Website Architect', 'Plans and applies website changes', 'AI & Agents',
 '["content", "seo", "multi-site"]'::jsonb,
 '["website.page.read", "website.page.update", "website.deploy.preview", "website.deploy.publish"]'::jsonb,
 'gpt-4', '1.0.0')
ON CONFLICT DO NOTHING;

-- Seed Frontend MCP Provider (ThreeUI)
INSERT INTO frontend_mcp_providers(id, name, package, role, control_plane, status, config, health_url) VALUES
('threeui-community', 'ThreeUI Community', '@designcodeio/threeui', 'frontend-component-provider', 'Bridge', 'active',
 '{"deepLink": true, "approvalRequired": true}'::jsonb,
 'http://localhost:3100/health')
ON CONFLICT DO NOTHING;

-- Add new capabilities
INSERT INTO capabilities(id, description, approval_default, owner_subsystem) VALUES
('marketplace.install', 'Install marketplace application', 'CONFIRM', 'marketplace'),
('marketplace.uninstall', 'Uninstall marketplace application', 'ADMIN_APPROVAL', 'marketplace'),
('marketplace.manage', 'Manage marketplace packages (platform admin)', 'ADMIN_APPROVAL', 'marketplace'),
('agent.template.instantiate', 'Instantiate agent from template', 'AUTO', 'ai'),
('agent.instance.manage', 'Manage tenant agent instances', 'CONFIRM', 'ai'),
('frontend.mcp.use', 'Use Frontend MCP for frontend generation', 'CONFIRM', 'frontend-mcp'),
('frontend.mcp.publish', 'Publish frontend generated via MCP', 'ADMIN_APPROVAL', 'frontend-mcp')
ON CONFLICT DO NOTHING;

-- Update permissions list (this extends the existing PERMISSIONS array in rbac.js)
-- These permissions will be added to the rbac.js file separately

INSERT INTO schema_migrations(id) VALUES ('005-marketplace-agents-frontend-mcp') ON CONFLICT DO NOTHING;
