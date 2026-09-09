/**
 * Ensure gap-closure + production-hardening tables exist on boot (brownfield volumes).
 */
export async function ensureGapSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations(
      id text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consumer_inbox(
      consumer text NOT NULL,
      event_id uuid NOT NULL,
      subject text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      processed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(consumer, event_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS consumer_dead_letters(
      id bigserial PRIMARY KEY,
      consumer text NOT NULL,
      event_id uuid,
      subject text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      delivery_count int NOT NULL DEFAULT 0,
      last_error text,
      tenant_id uuid,
      correlation_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
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
  `);
  await pool.query(`
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
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tenant_memberships(
      tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      actor_id text NOT NULL,
      roles text[] NOT NULL DEFAULT ARRAY['tenant.viewer']::text[],
      created_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(tenant_id, actor_id)
    );
  `);
  await pool.query(`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text`);
  await pool.query(`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS locked_at timestamptz`);
  await pool.query(`ALTER TABLE outbox ADD COLUMN IF NOT EXISTS message_id uuid`);
  await pool.query(`UPDATE outbox SET message_id = event_id WHERE message_id IS NULL`);
  await pool.query(`ALTER TABLE database_instances ADD COLUMN IF NOT EXISTS version text`);
  await pool.query(`ALTER TABLE database_instances ADD COLUMN IF NOT EXISTS backup_policy text NOT NULL DEFAULT 'none'`);
  await pool.query(`ALTER TABLE database_instances ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now()`);
  await pool.query(`ALTER TABLE secret_store ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'lab'`);
  await pool.query(`ALTER TABLE secret_store ADD COLUMN IF NOT EXISTS key_ref text`);
  await pool.query(`ALTER TABLE sagas ADD COLUMN IF NOT EXISTS application_id uuid`);
  await pool.query(`ALTER TABLE sagas ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE sagas ADD COLUMN IF NOT EXISTS current_step text`);
  await pool.query(`ALTER TABLE sagas ADD COLUMN IF NOT EXISTS last_error text`);
  await pool.query(`
    INSERT INTO tenant_memberships(tenant_id, actor_id, roles)
    SELECT t.id, 'bridgeadmin', ARRAY['platform.admin']::text[]
    FROM tenants t WHERE t.slug = 'bridge-demo'
    ON CONFLICT DO NOTHING
  `).catch(() => {});
  await pool.query(`INSERT INTO schema_migrations(id) VALUES ('003-gap-closures') ON CONFLICT DO NOTHING`).catch(() => {});
  await pool.query(`INSERT INTO schema_migrations(id) VALUES ('004-production-hardening') ON CONFLICT DO NOTHING`).catch(() => {});
}
