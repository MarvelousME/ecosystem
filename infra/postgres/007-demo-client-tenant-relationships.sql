-- 007 Repeatable local demo data. No secrets and no fabricated provider health.
-- Fresh initdb runs this seed before the incremental hardening directory, so
-- create the membership boundary it needs rather than depending on API startup.
CREATE TABLE IF NOT EXISTS tenant_memberships(
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_id text NOT NULL,
  roles text[] NOT NULL DEFAULT ARRAY['tenant.viewer']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(tenant_id, actor_id)
);

INSERT INTO clients(name,email,status,metadata)
SELECT seed.name, seed.email, seed.status, seed.metadata
FROM (VALUES
  ('Bridge Demo Client','demo@bridge.local','active','{"segment":"enterprise","seed":true}'::jsonb),
  ('Northstar Operations','ops@northstar.example','active','{"segment":"business","seed":true}'::jsonb)
) AS seed(name,email,status,metadata)
WHERE NOT EXISTS (SELECT 1 FROM clients c WHERE c.email=seed.email);

INSERT INTO organizations(client_id,name)
SELECT c.id, c.name || ' Organization' FROM clients c
WHERE c.email IN ('demo@bridge.local','ops@northstar.example')
AND NOT EXISTS (SELECT 1 FROM organizations o WHERE o.client_id=c.id);

INSERT INTO tenants(slug,name,plan,status,isolation_mode,client_id)
SELECT 'bridge-demo','Bridge Demo Company','enterprise','active','SHARED',
  (SELECT c.id FROM clients c WHERE c.email='demo@bridge.local' ORDER BY c.created_at, c.id LIMIT 1)
ON CONFLICT(slug) DO UPDATE SET client_id=EXCLUDED.client_id, plan=EXCLUDED.plan;
INSERT INTO tenants(slug,name,plan,status,isolation_mode,client_id)
SELECT 'northstar-ops','Northstar Operations Workspace','business','active','SHARED',
  (SELECT c.id FROM clients c WHERE c.email='ops@northstar.example' ORDER BY c.created_at, c.id LIMIT 1)
ON CONFLICT(slug) DO UPDATE SET client_id=EXCLUDED.client_id, plan=EXCLUDED.plan;

INSERT INTO client_tenants(client_id,tenant_id)
SELECT c.id,t.id FROM clients c JOIN tenants t ON t.client_id=c.id
WHERE c.email IN ('demo@bridge.local','ops@northstar.example') ON CONFLICT DO NOTHING;

INSERT INTO tenant_memberships(tenant_id,actor_id,roles)
SELECT id,'bridgeadmin',ARRAY['platform.admin']::text[] FROM tenants WHERE slug IN ('bridge-demo','northstar-ops') ON CONFLICT DO NOTHING;
INSERT INTO tenant_memberships(tenant_id,actor_id,roles)
SELECT id,'northstar-admin',ARRAY['tenant.admin']::text[] FROM tenants WHERE slug='northstar-ops' ON CONFLICT DO NOTHING;

INSERT INTO entitlements(tenant_id,limits,usage)
SELECT id, CASE WHEN slug='bridge-demo' THEN '{"apps":15,"databases":5,"ai_executions":5000,"users":50}'::jsonb ELSE '{"apps":8,"databases":2,"ai_executions":1000,"users":15}'::jsonb END,
  '{"apps":0,"databases":0,"ai_executions":0}'::jsonb FROM tenants WHERE slug IN ('bridge-demo','northstar-ops') ON CONFLICT DO NOTHING;

INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,lifecycle_status,status,health)
SELECT t.id,'Northstar Marketing','react','http://localhost:5173','none','READY','ready','UNKNOWN' FROM tenants t WHERE t.slug='northstar-ops'
AND NOT EXISTS (SELECT 1 FROM apps a WHERE a.tenant_id=t.id AND a.name='Northstar Marketing');
INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,lifecycle_status,status,health)
SELECT t.id,'Northstar Support','marketplace','/#/apps/support','none','READY','ready','UNKNOWN' FROM tenants t WHERE t.slug='northstar-ops'
AND NOT EXISTS (SELECT 1 FROM apps a WHERE a.tenant_id=t.id AND a.name='Northstar Support');

INSERT INTO subscriptions(tenant_id,product_id,status)
SELECT t.id,p.id,'active' FROM tenants t JOIN products p ON p.code='business-website' WHERE t.slug='northstar-ops' ON CONFLICT DO NOTHING;
INSERT INTO orders(client_id,tenant_id,product_id,status,amount_cents)
SELECT c.id,t.id,p.id,'paid',p.price_cents FROM clients c JOIN tenants t ON t.client_id=c.id JOIN products p ON p.code='business-website'
WHERE c.email='ops@northstar.example' AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id=t.id AND o.product_id=p.id);
INSERT INTO invoices(tenant_id,order_id,amount_cents,status)
SELECT o.tenant_id,o.id,o.amount_cents,'paid' FROM orders o JOIN tenants t ON t.id=o.tenant_id WHERE t.slug='northstar-ops'
AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id=o.id);
INSERT INTO payments(order_id,provider,external_event_key,amount_cents,status)
SELECT o.id,'manual','seed-northstar-order',o.amount_cents,'succeeded' FROM orders o JOIN tenants t ON t.id=o.tenant_id WHERE t.slug='northstar-ops'
AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.provider='manual' AND p.external_event_key='seed-northstar-order');

INSERT INTO support_tickets(tenant_id,subject,priority,status)
SELECT id,'Welcome to Northstar Operations','normal','open' FROM tenants WHERE slug='northstar-ops'
AND NOT EXISTS (SELECT 1 FROM support_tickets s JOIN tenants t ON t.id=s.tenant_id WHERE t.slug='northstar-ops' AND s.subject='Welcome to Northstar Operations');
INSERT INTO workflows(tenant_id,name,definition,status)
SELECT id,'Northstar onboarding','{"nodes":[{"id":"trigger","type":"trigger"},{"id":"welcome","type":"email"}]}'::jsonb,'active' FROM tenants WHERE slug='northstar-ops'
AND NOT EXISTS (SELECT 1 FROM workflows w JOIN tenants t ON t.id=w.tenant_id WHERE t.slug='northstar-ops' AND w.name='Northstar onboarding');
INSERT INTO agent_instances(tenant_id,agent_key,name,description,skills,capabilities,model,status,config,lifecycle_state,enabled,budget)
SELECT id,'northstar-seo','Northstar SEO Agent','Seeded tenant agent','["website.seo.optimization"]'::jsonb,'["website.page.read"]'::jsonb,'default','active','{}'::jsonb,'READY',true,'{}'::jsonb FROM tenants WHERE slug='northstar-ops'
ON CONFLICT(tenant_id,agent_key) DO NOTHING;
INSERT INTO domains(tenant_id,hostname,status,ssl_status)
SELECT id,'northstar.example','pending','none' FROM tenants WHERE slug='northstar-ops' ON CONFLICT DO NOTHING;
INSERT INTO schema_migrations(id) VALUES ('007-demo-client-tenant-relationships') ON CONFLICT DO NOTHING;
