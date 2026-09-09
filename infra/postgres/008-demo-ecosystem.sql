-- Development-only, repeatable ecosystem seed. Mounted by docker-compose.yml,
-- never by production compose. Historical rows are explicitly marked in JSON
-- metadata where their table supports it; provider runtime health is not seeded.

INSERT INTO products(code,name,description,billing_cycle,price_cents,entitlements) VALUES
  ('bridge-business','Bridge Business','Business control plane plan (demo)','monthly',149900,'{"apps":10,"databases":3,"storage_gb":100,"ai_executions":1000,"users":10,"support":"standard"}'),
  ('bridge-enterprise','Bridge Enterprise','Enterprise control plane plan (demo)','monthly',499900,'{"apps":30,"databases":12,"storage_gb":500,"ai_executions":5000,"users":50,"support":"premium","security":true}'),
  ('managed-wordpress','Managed WordPress','Managed WordPress service (demo)','monthly',79900,'{"wordpress":true}'),
  ('automation-pack','Automation Pack','Workflow automation add-on (demo)','monthly',49900,'{"automation":true}'),
  ('analytics-pack','Analytics Pack','Analytics add-on (demo)','monthly',69900,'{"analytics":true}'),
  ('security-pack','Security Pack','Security Center add-on (demo)','monthly',99900,'{"security":true}'),
  ('premium-support','Premium Support','Premium support add-on (demo)','monthly',89900,'{"support":"premium"}')
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, price_cents=EXCLUDED.price_cents, entitlements=EXCLUDED.entitlements;

UPDATE clients SET name='Demo Company', status='active', metadata=metadata || '{"demo":true,"organization":"Demo Company Holdings (Pty) Ltd","industry":"Professional Services / Digital Commerce","country":"ZA","currency":"ZAR","timezone":"Africa/Johannesburg","vatNumber":"4123456789","registrationNumber":"2023/123456/07","phone":"+27 31 555 0100","address":"12 Innovation Drive, Umhlanga Ridge, KwaZulu-Natal, 4319, South Africa","billingEmail":"billing@democompany.test","supportEmail":"support@democompany.test"}'::jsonb
WHERE email='demo@bridge.local';
UPDATE clients SET name='Northstar-Ops', status='active', metadata=metadata || '{"demo":true,"organization":"Northstar Operations (Pty) Ltd","industry":"Infrastructure / Managed Operations / Technology","country":"ZA","currency":"ZAR","timezone":"Africa/Johannesburg","vatNumber":"4987654321","registrationNumber":"2024/654321/07","phone":"+27 11 555 0200","address":"88 Meridian Avenue, Sandton, Gauteng, 2196, South Africa","billingEmail":"accounts@northstar-ops.test","supportEmail":"noc@northstar-ops.test"}'::jsonb
WHERE email='ops@northstar.example';
UPDATE tenants SET name='Demo Company', plan='business', status='active' WHERE slug='bridge-demo';
UPDATE tenants SET name='Northstar-Ops', plan='enterprise', status='active' WHERE slug='northstar-ops';

INSERT INTO tenant_memberships(tenant_id,actor_id,roles)
SELECT t.id, u.actor_id, u.roles
FROM tenants t JOIN (VALUES
 ('bridge-demo','demo.owner',ARRAY['tenant.admin']::text[]),('bridge-demo','demo.billing',ARRAY['tenant.admin']::text[]),
 ('bridge-demo','demo.ops',ARRAY['tenant.editor']::text[]),('bridge-demo','demo.content',ARRAY['tenant.editor']::text[]),
 ('northstar-ops','northstar.owner',ARRAY['tenant.admin']::text[]),('northstar-ops','northstar.security',ARRAY['tenant.admin']::text[]),
 ('northstar-ops','northstar.developer',ARRAY['tenant.editor']::text[]),('northstar-ops','northstar.billing',ARRAY['tenant.admin']::text[])
) AS u(slug,actor_id,roles) ON t.slug=u.slug
ON CONFLICT(tenant_id,actor_id) DO UPDATE SET roles=EXCLUDED.roles;

INSERT INTO entitlements(tenant_id,limits,usage)
SELECT id, CASE slug WHEN 'bridge-demo' THEN '{"apps":10,"databases":3,"storage_gb":100,"ai_executions":1000,"users":10,"wordpress":1,"crm":1,"automation":1,"analytics":1,"ai":1}'::jsonb
                         ELSE '{"apps":30,"databases":12,"storage_gb":500,"ai_executions":5000,"users":50,"security":1,"automation":1,"analytics":1,"ai":1,"premium_support":1}'::jsonb END,
           CASE slug WHEN 'bridge-demo' THEN '{"apps":6,"databases":3,"storage_gb":42,"ai_executions":38,"users":4}'::jsonb
                         ELSE '{"apps":6,"databases":5,"storage_gb":187,"ai_executions":71,"users":4}'::jsonb END
FROM tenants WHERE slug IN ('bridge-demo','northstar-ops')
ON CONFLICT(tenant_id) DO UPDATE SET limits=EXCLUDED.limits,usage=EXCLUDED.usage,updated_at=now();

INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,environment,lifecycle_status,status,health,capabilities)
SELECT t.id, s.name,s.app_type,s.launch_url,s.database_engine,'production',s.lifecycle_status,lower(s.lifecycle_status),s.health,s.capabilities
FROM tenants t JOIN (VALUES
 ('bridge-demo','Corporate Website','wordpress','http://localhost:8080','mysql','RUNNING','HEALTHY','["website.read","website.edit"]'::jsonb),
 ('bridge-demo','Online Store','commerce','http://localhost:8080/shop','mysql','RUNNING','HEALTHY','["commerce.product.read"]'::jsonb),
 ('bridge-demo','Customer CRM','crm','/#/apps/crm','postgresql','RUNNING','HEALTHY','["crm.read"]'::jsonb),
 ('bridge-demo','Marketing Automation','automation','/#/automation','postgresql','RUNNING','HEALTHY','["workflow.read"]'::jsonb),
 ('bridge-demo','Analytics Dashboard','dashboard','/#/analytics','postgresql','READY','UNKNOWN','["analytics.read"]'::jsonb),
 ('bridge-demo','AI Workspace','ai-hub','/#/ai','none','RUNNING','HEALTHY','["ai.chat.use"]'::jsonb),
 ('northstar-ops','Operations Portal','nextjs','/#/apps/operations','postgresql','RUNNING','HEALTHY','["operations.read"]'::jsonb),
 ('northstar-ops','Infrastructure Dashboard','dashboard','/#/infra','clickhouse','RUNNING','HEALTHY','["infrastructure.read"]'::jsonb),
 ('northstar-ops','Incident Manager','internal','/#/support','postgresql','RUNNING','HEALTHY','["support.read"]'::jsonb),
 ('northstar-ops','Automation Hub','automation','/#/automation','postgresql','RUNNING','HEALTHY','["workflow.read"]'::jsonb),
 ('northstar-ops','Security Console','security','/#/security','none','READY','UNKNOWN','["security.read"]'::jsonb),
 ('northstar-ops','AI Operations Assistant','ai-hub','/#/ai','none','RUNNING','HEALTHY','["ai.chat.use"]'::jsonb)
) AS s(slug,name,app_type,launch_url,database_engine,lifecycle_status,health,capabilities) ON t.slug=s.slug
WHERE NOT EXISTS (SELECT 1 FROM apps a WHERE a.tenant_id=t.id AND a.name=s.name);

INSERT INTO database_instances(tenant_id,application_id,engine,version,host,port,database_name,status,secret_ref,backup_policy)
SELECT t.id,a.id,s.engine,s.version,'demo-metadata-only',s.port,s.database_name,'DEMO_METADATA_ONLY',NULL,'{"retentionDays":14,"demo":true}'::jsonb
FROM tenants t JOIN (VALUES
 ('bridge-demo','Corporate Website','mariadb','11.8',3306,'demo_wordpress'),('bridge-demo','Customer CRM','postgresql','17',5432,'demo_crm'),('bridge-demo','Analytics Dashboard','postgresql','17',5432,'demo_analytics'),
 ('northstar-ops','Operations Portal','postgresql','17',5432,'northstar_operations'),('northstar-ops','Infrastructure Dashboard','clickhouse','25.8',8123,'northstar_analytics'),('northstar-ops','Automation Hub','postgresql','17',5432,'northstar_automation'),('northstar-ops','Incident Manager','mongodb','8',27017,'northstar_incidents'),('northstar-ops','Security Console','mssql','2022',1433,'northstar_integration')
) AS s(slug,app_name,engine,version,port,database_name) ON t.slug=s.slug JOIN apps a ON a.tenant_id=t.id AND a.name=s.app_name
WHERE NOT EXISTS (SELECT 1 FROM database_instances d WHERE d.tenant_id=t.id AND d.database_name=s.database_name);

INSERT INTO domains(tenant_id,application_id,hostname,status,ssl_status)
SELECT t.id,a.id,s.hostname,s.status,s.ssl_status FROM tenants t JOIN (VALUES
 ('bridge-demo','Corporate Website','democompany.test','verified','VALID'),('bridge-demo','Online Store','shop.democompany.test','verified','EXPIRING'),('bridge-demo','Customer CRM','portal.democompany.test','pending','PENDING'),
 ('northstar-ops','Operations Portal','northstar-ops.test','verified','VALID'),('northstar-ops','Operations Portal','ops.northstar-ops.test','verified','VALID'),('northstar-ops','Security Console','status.northstar-ops.test','misconfigured','FAILED')
) AS s(slug,app_name,hostname,status,ssl_status) ON t.slug=s.slug JOIN apps a ON a.tenant_id=t.id AND a.name=s.app_name
ON CONFLICT(tenant_id,hostname) DO UPDATE SET status=EXCLUDED.status,ssl_status=EXCLUDED.ssl_status;

INSERT INTO support_tickets(tenant_id,subject,priority,status,assignee,created_at)
SELECT t.id, x.subject,x.priority,x.status,x.assignee,now()-(x.days||' days')::interval FROM tenants t JOIN (VALUES
 ('bridge-demo','Update billing address','normal','open','demo.billing',1),('bridge-demo','WordPress plugin compatibility','high','in_progress','demo.ops',3),('bridge-demo','Invoice query for March','normal','waiting_customer','demo.billing',8),('bridge-demo','CRM import mapping','low','resolved','demo.ops',12),('bridge-demo','Email delivery review','high','closed','demo.ops',19),('bridge-demo','Checkout tax configuration','normal','resolved','demo.billing',23),('bridge-demo','Analytics dashboard access','low','closed','demo.content',31),('bridge-demo','Homepage content update','normal','open','demo.content',2),
 ('northstar-ops','Database latency investigation','critical','in_progress','northstar.developer',1),('northstar-ops','SSL renewal verification','high','open','northstar.security',4),('northstar-ops','Security alert triage','critical','waiting_customer','northstar.security',6),('northstar-ops','Deployment rollback review','high','resolved','northstar.developer',10),('northstar-ops','Automation worker retry','normal','closed','northstar.developer',15),('northstar-ops','Backup retention policy','normal','open','northstar.security',18),('northstar-ops','NATS consumer backlog','high','resolved','northstar.developer',22),('northstar-ops','Access review evidence','low','closed','northstar.security',35)
) AS x(slug,subject,priority,status,assignee,days) ON t.slug=x.slug
WHERE NOT EXISTS (SELECT 1 FROM support_tickets st WHERE st.tenant_id=t.id AND st.subject=x.subject);

INSERT INTO workflows(tenant_id,name,definition,status)
SELECT t.id,w.name,w.definition,'active' FROM tenants t JOIN (VALUES
 ('bridge-demo','New Client Onboarding','{"demo":true,"trigger":"client.created","nodes":["welcome","setup-guide","check-in"]}'::jsonb),('bridge-demo','Payment Failed','{"demo":true,"trigger":"payment.failed","nodes":["email","retry","escalate"]}'::jsonb),('bridge-demo','Invoice Overdue','{"demo":true,"trigger":"invoice.overdue","nodes":["reminder","grace","suspend"]}'::jsonb),('bridge-demo','App Installed','{"demo":true,"trigger":"app.installed","nodes":["welcome","notify"]}'::jsonb),
 ('northstar-ops','Security Incident','{"demo":true,"trigger":"security.event","nodes":["triage","approval","notify"]}'::jsonb),('northstar-ops','Deployment Failure','{"demo":true,"trigger":"deployment.failed","nodes":["rollback","ticket","notify"]}'::jsonb),('northstar-ops','Database Backup Failed','{"demo":true,"trigger":"backup.failed","nodes":["retry","escalate"]}'::jsonb),('northstar-ops','Service Health Degraded','{"demo":true,"trigger":"health.changed","nodes":["diagnose","notify"]}'::jsonb)
) AS w(slug,name,definition) ON t.slug=w.slug
WHERE NOT EXISTS (SELECT 1 FROM workflows wf WHERE wf.tenant_id=t.id AND wf.name=w.name);

INSERT INTO workflow_executions(workflow_id,tenant_id,status,input,output,error,created_at,updated_at)
SELECT w.id,w.tenant_id,x.status,'{"demo":true}'::jsonb,'{"historical":true}'::jsonb,x.error,now()-(x.days||' days')::interval,now()-(x.days||' days')::interval
FROM workflows w JOIN (VALUES ('New Client Onboarding','completed',NULL,2),('Payment Failed','failed','payment provider sandbox timeout',5),('Invoice Overdue','running',NULL,1),('Security Incident','completed',NULL,3),('Deployment Failure','completed',NULL,7),('Database Backup Failed','failed','verification mismatch',4),('Service Health Degraded','running',NULL,1)) AS x(name,status,error,days) ON x.name=w.name
WHERE NOT EXISTS (SELECT 1 FROM workflow_executions we WHERE we.workflow_id=w.id AND we.status=x.status);

INSERT INTO backups(tenant_id,application_id,kind,location,status,verified,created_at)
SELECT t.id,a.id,x.kind,'demo://historical/'||replace(lower(a.name),' ','-')||'/'||x.kind,x.status,x.verified,now()-(x.days||' days')::interval
FROM tenants t JOIN apps a ON a.tenant_id=t.id JOIN (VALUES ('database','completed',true,1),('files','completed',true,4),('configuration','failed',false,9)) AS x(kind,status,verified,days) ON true
WHERE a.name IN ('Corporate Website','Operations Portal','Automation Hub') AND NOT EXISTS (SELECT 1 FROM backups b WHERE b.application_id=a.id AND b.kind=x.kind AND b.location LIKE 'demo://historical/%');

INSERT INTO deployments(tenant_id,application_id,environment,version,status,actor,started_at,completed_at)
SELECT a.tenant_id,a.id,'production','demo-'||x.version,x.status,x.actor,now()-(x.days||' days')::interval,CASE WHEN x.status='running' THEN NULL ELSE now()-(x.days||' days')::interval+interval '4 minutes' END
FROM apps a JOIN (VALUES ('2026.03.1','success','demo.ops',2),('2026.02.4','rolled_back','demo.ops',11),('2026.03.2','failed','northstar.developer',1),('2026.02.8','success','northstar.developer',6)) AS x(version,status,actor,days) ON true
WHERE a.name IN ('Corporate Website','Operations Portal') AND NOT EXISTS (SELECT 1 FROM deployments d WHERE d.application_id=a.id AND d.version='demo-'||x.version);

INSERT INTO audit_log(tenant_id,actor,action,resource_type,resource_id,metadata,created_at)
SELECT t.id,CASE WHEN t.slug='bridge-demo' THEN 'demo.owner' ELSE 'northstar.owner' END,'demo.'||x.action,x.resource_type,x.n::text,'{"demo":true,"historical":true}'::jsonb,now()-(x.n||' hours')::interval
FROM tenants t CROSS JOIN (SELECT n, CASE WHEN n%5=0 THEN 'payment.recorded' WHEN n%5=1 THEN 'app.configured' WHEN n%5=2 THEN 'workflow.executed' WHEN n%5=3 THEN 'agent.executed' ELSE 'security.reviewed' END action, CASE WHEN n%2=0 THEN 'application' ELSE 'tenant' END resource_type FROM generate_series(1,55) n) x
WHERE t.slug IN ('bridge-demo','northstar-ops') AND NOT EXISTS (SELECT 1 FROM audit_log a WHERE a.tenant_id=t.id AND a.action='demo.'||x.action AND a.resource_id=x.n::text);

INSERT INTO marketplace_packages(package_key,name,description,publisher_id,category,status,featured) VALUES
 ('bridge-crm','Bridge CRM','Customer relationship management','bridge','business','published',true),('bridge-automation','Bridge Automation','Workflow automation','bridge','automation','published',true),('bridge-analytics','Bridge Analytics','Tenant analytics','bridge','analytics','published',true),('wordpress-website','WordPress Website','Managed website package','bridge','website','published',true),('bridge-ai-hub','Bridge AI Hub','Native AI workspace','bridge','ai-agents','published',true),('affiliate-management','Affiliate Management','Affiliate tracking','bridge','business','published',false),('bridge-security-center','Bridge Security Center','Security posture and incidents','bridge','security','published',true),('support-desk','Support Desk','Tenant support operations','bridge','business','published',false),('frontend-builder','Frontend Builder','Governed visual frontend builder','bridge','website','published',false)
ON CONFLICT(package_key) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,status='published',featured=EXCLUDED.featured,updated_at=now();

INSERT INTO marketplace_versions(package_id,version,changelog,compatibility,requires_entitlement,manifest,status,published_at,checksum,signature,security_review_status)
SELECT p.id,'1.0.0','Initial demo catalog release','{"platform":"bridge","demo":true}'::jsonb,NULL,'{"demo":true,"installMode":"managed"}'::jsonb,'published',now(),'demo-sha256','demo-signature','APPROVED' FROM marketplace_packages p
WHERE NOT EXISTS (SELECT 1 FROM marketplace_versions v WHERE v.package_id=p.id AND v.version='1.0.0');

INSERT INTO marketplace_visibility_rules(package_id,rule_type,rule_value)
SELECT p.id,'PUBLIC_TO_ALL_TENANTS','{}'::jsonb FROM marketplace_packages p
WHERE NOT EXISTS (SELECT 1 FROM marketplace_visibility_rules r WHERE r.package_id=p.id AND r.rule_type='PUBLIC_TO_ALL_TENANTS');

INSERT INTO marketplace_installations(tenant_id,package_id,version_id,installation_key,state,config,app_id,installed_at,idempotency_key)
SELECT t.id,p.id,v.id,t.slug||':'||p.package_key,'ready','{"demo":true,"historical":true}'::jsonb,a.id,now()-interval '10 days','demo:'||t.slug||':'||p.package_key
FROM tenants t JOIN (VALUES
 ('bridge-demo','bridge-crm','Customer CRM'),('bridge-demo','bridge-automation','Marketing Automation'),('bridge-demo','bridge-analytics','Analytics Dashboard'),('bridge-demo','wordpress-website','Corporate Website'),('bridge-demo','bridge-ai-hub','AI Workspace'),('bridge-demo','affiliate-management','Online Store'),
 ('northstar-ops','bridge-automation','Automation Hub'),('northstar-ops','bridge-analytics','Infrastructure Dashboard'),('northstar-ops','bridge-security-center','Security Console'),('northstar-ops','bridge-ai-hub','AI Operations Assistant'),('northstar-ops','support-desk','Incident Manager'),('northstar-ops','frontend-builder','Operations Portal')
) AS x(slug,package_key,app_name) ON t.slug=x.slug JOIN marketplace_packages p ON p.package_key=x.package_key JOIN marketplace_versions v ON v.package_id=p.id AND v.version='1.0.0' JOIN apps a ON a.tenant_id=t.id AND a.name=x.app_name
WHERE NOT EXISTS (SELECT 1 FROM marketplace_installations mi WHERE mi.tenant_id=t.id AND mi.package_id=p.id AND mi.state<>'uninstalled');

INSERT INTO installation_saga_steps(installation_id,step_name,status,detail)
SELECT mi.id,s.step_name,'completed','{"demo":true}'::jsonb FROM marketplace_installations mi CROSS JOIN (VALUES ('validate_catalog'),('create_application'),('health_check'),('activate')) s(step_name)
WHERE mi.installation_key LIKE '%:%' AND NOT EXISTS (SELECT 1 FROM installation_saga_steps iss WHERE iss.installation_id=mi.id AND iss.step_name=s.step_name);

INSERT INTO agent_definitions(agent_key,name,description,skills,capabilities,tools,approval_mode,status)
SELECT x.agent_key,x.name,'Demo native agent definition',x.skills,'[]'::jsonb,'[]'::jsonb,'CONFIRM','READY' FROM (VALUES
 ('bridge-planner','Bridge Planner','["planning"]'::jsonb),('content-writer','Content Writer','["content"]'::jsonb),('crm-agent','CRM Agent','["crm"]'::jsonb),('billing-agent','Billing Agent','["billing"]'::jsonb),('support-agent','Support Agent','["support"]'::jsonb),('devops-agent','DevOps Agent','["devops"]'::jsonb),('database-agent','Database Agent','["database"]'::jsonb),('workflow-agent','Workflow Agent','["workflow"]'::jsonb),('qa-agent','QA Agent','["qa"]'::jsonb),('security-agent','Security Agent','["security"]'::jsonb)
) x(agent_key,name,skills) ON CONFLICT(agent_key) DO NOTHING;

INSERT INTO agent_instances(tenant_id,agent_key,name,description,agent_definition_id,skills,capabilities,model,status,config,lifecycle_state,enabled,budget)
SELECT t.id,x.agent_key,d.name,'Demo tenant agent',d.id,d.skills,d.capabilities,'demo-model','active','{"demo":true}'::jsonb,'READY',true,'{"maxExecutions":100,"demo":true}'::jsonb
FROM tenants t JOIN (VALUES
 ('bridge-demo','bridge-planner'),('bridge-demo','ui-designer'),('bridge-demo','content-writer'),('bridge-demo','seo-agent'),('bridge-demo','crm-agent'),('bridge-demo','billing-agent'),('bridge-demo','support-agent'),
 ('northstar-ops','bridge-planner'),('northstar-ops','devops-agent'),('northstar-ops','security-agent'),('northstar-ops','database-agent'),('northstar-ops','workflow-agent'),('northstar-ops','qa-agent'),('northstar-ops','support-agent')
) x(slug,agent_key) ON t.slug=x.slug JOIN agent_definitions d ON d.agent_key=x.agent_key
ON CONFLICT(tenant_id,agent_key) DO UPDATE SET agent_definition_id=EXCLUDED.agent_definition_id,lifecycle_state='READY',enabled=true;

INSERT INTO agent_executions(tenant_id,agent_instance_id,application_id,actor_id,prompt,goal,status,approval_level,approval_status,result,input_tokens,output_tokens,cost_cents,created_at,updated_at)
SELECT ai.tenant_id,ai.id,NULL,CASE WHEN t.slug='bridge-demo' THEN 'demo.owner' ELSE 'northstar.owner' END,x.prompt,x.prompt,x.status,'CONFIRM',x.approval,'{"demo":true,"seededHistorical":true}'::jsonb,0,0,0,now()-(x.days||' days')::interval,now()-(x.days||' days')::interval
FROM agent_instances ai JOIN tenants t ON t.id=ai.tenant_id JOIN (VALUES
 ('bridge-demo','seo-agent','Optimize homepage SEO','completed','approved',2),('bridge-demo','billing-agent','Summarize overdue invoices','waiting_approval','pending',1),('bridge-demo','content-writer','Create a Q4 email campaign','completed','approved',4),
 ('northstar-ops','devops-agent','Review infrastructure health','completed','approved',2),('northstar-ops','database-agent','Investigate database latency','failed','rejected',3),('northstar-ops','security-agent','Summarize security events','waiting_approval','pending',1)
) x(slug,agent_key,prompt,status,approval,days) ON t.slug=x.slug AND ai.agent_key=x.agent_key
WHERE NOT EXISTS (SELECT 1 FROM agent_executions ae WHERE ae.agent_instance_id=ai.id AND ae.prompt=x.prompt);

INSERT INTO subscriptions(tenant_id,product_id,status,started_at,expires_at)
SELECT t.id,p.id,x.status,now()-(x.months||' months')::interval,CASE WHEN x.status='cancelled' THEN now()-interval '1 month' ELSE now()+interval '1 month' END
FROM tenants t JOIN (VALUES ('bridge-demo','bridge-business','active',12),('bridge-demo','managed-wordpress','active',11),('bridge-demo','automation-pack','active',8),('northstar-ops','bridge-enterprise','active',14),('northstar-ops','security-pack','active',10),('northstar-ops','analytics-pack','active',9),('northstar-ops','premium-support','active',6)) x(slug,product_code,status,months) ON t.slug=x.slug JOIN products p ON p.code=x.product_code
ON CONFLICT(tenant_id,product_id) DO UPDATE SET status=EXCLUDED.status,expires_at=EXCLUDED.expires_at;

INSERT INTO orders(client_id,tenant_id,product_id,status,amount_cents,created_at)
SELECT t.client_id,t.id,p.id,CASE WHEN n=1 AND t.slug='bridge-demo' THEN 'pending' ELSE 'paid' END,p.price_cents,now()-(n||' months')::interval
FROM tenants t JOIN products p ON p.code=CASE WHEN t.slug='bridge-demo' THEN 'bridge-business' ELSE 'bridge-enterprise' END CROSS JOIN generate_series(0,11) n
WHERE t.slug IN ('bridge-demo','northstar-ops') AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.tenant_id=t.id AND o.product_id=p.id AND o.created_at::date=(now()-(n||' months')::interval)::date);

INSERT INTO invoices(tenant_id,order_id,amount_cents,status,created_at)
SELECT o.tenant_id,o.id,o.amount_cents,CASE WHEN extract(month FROM age(now(),o.created_at))=0 AND t.slug='bridge-demo' THEN 'partially_paid' WHEN extract(month FROM age(now(),o.created_at))=2 AND t.slug='bridge-demo' THEN 'overdue' WHEN extract(month FROM age(now(),o.created_at))=5 THEN 'cancelled' WHEN extract(month FROM age(now(),o.created_at))=8 THEN 'refunded' ELSE 'paid' END,o.created_at+interval '1 day'
FROM orders o JOIN tenants t ON t.id=o.tenant_id
WHERE o.created_at >= now()-interval '12 months' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.order_id=o.id);

INSERT INTO payments(order_id,provider,external_event_key,amount_cents,status,created_at)
SELECT i.order_id,CASE WHEN t.slug='bridge-demo' THEN 'demo-eft' ELSE 'demo-card' END,'demo-payment-'||i.id::text,CASE WHEN i.status='partially_paid' THEN i.amount_cents/2 ELSE i.amount_cents END,CASE WHEN i.status='overdue' THEN 'failed' ELSE 'succeeded' END,i.created_at+interval '2 days'
FROM invoices i JOIN tenants t ON t.id=i.tenant_id
WHERE i.order_id IS NOT NULL AND i.status IN ('paid','partially_paid','overdue','refunded') AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.external_event_key='demo-payment-'||i.id::text);

INSERT INTO schema_migrations(id) VALUES ('008-demo-ecosystem') ON CONFLICT DO NOTHING;
