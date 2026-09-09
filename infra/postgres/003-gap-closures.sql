-- Gap closures: consumer idempotency, ZIP quarantine, Puck pages
CREATE TABLE IF NOT EXISTS consumer_inbox(
  consumer text NOT NULL,
  event_id uuid NOT NULL,
  subject text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(consumer, event_id)
);

CREATE TABLE IF NOT EXISTS zip_imports(
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES apps(id) ON DELETE SET NULL,
  filename text NOT NULL,
  stored_path text NOT NULL,
  status text NOT NULL,
  scan_engine text,
  scan_detail text,
  bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  released_at timestamptz
);

CREATE TABLE IF NOT EXISTS puck_pages(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  application_id uuid REFERENCES apps(id) ON DELETE CASCADE,
  slug text NOT NULL,
  title text NOT NULL,
  document jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, application_id, slug)
);

UPDATE providers SET status='READY', config = COALESCE(config,'{}'::jsonb) || '{"deepLink":true}'::jsonb
WHERE id IN ('puck-builder','gutenberg-builder');

INSERT INTO capabilities(id, description, approval_default, owner_subsystem) VALUES
('resource.read', 'Read managed resources', 'AUTO', 'platform'),
('resource.manage', 'Manage resources lifecycle', 'ADMIN_APPROVAL', 'platform'),
('affiliate.manage', 'Manage affiliates and conversions', 'AUTO', 'platform'),
('security.manage', 'Manage security and IP rules', 'ADMIN_APPROVAL', 'platform')
ON CONFLICT DO NOTHING;

INSERT INTO schema_migrations(id) VALUES ('003-gap-closures') ON CONFLICT DO NOTHING;
