import { ok, fail, audit, requireTenant } from '../lib/kernel.js';
import { authorize } from '../lib/rbac.js';
import { executeCapability, bumpUsage } from '../lib/capabilities.js';
import { enqueueOutbox } from '../lib/outbox.js';
import { assertInstallableVersion, isVisibleToTenant } from '../lib/marketplace-policy.js';

export function registerMarketplaceRoutes(app, { pool }) {
  // --- Marketplace Package Management (Platform Admin) ---
  app.get('/api/marketplace/packages', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.manage');
    const rows = (await pool.query(
      'SELECT p.*, pv.version as latest_version FROM marketplace_packages p LEFT JOIN marketplace_versions pv ON p.id = pv.package_id AND pv.status = $1 ORDER BY p.created_at DESC',
      ['published']
    )).rows;
    return ok(rows, ctx);
  });

  app.post('/api/marketplace/packages', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.manage');
    const { packageKey, name, description, publisherId, category, iconUrl, screenshots, documentationUrl, sourceUrl } = req.body || {};
    if (!packageKey || !name || !publisherId || !category) {
      throw fail('VALIDATION', 'packageKey, name, publisherId, and category required', 400);
    }
    const r = await pool.query(
      `INSERT INTO marketplace_packages(package_key,name,description,publisher_id,category,icon_url,screenshots,documentation_url,source_url)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [packageKey, name, description, publisherId, category, iconUrl, JSON.stringify(screenshots || []), documentationUrl, sourceUrl]
    );
    await audit(pool, ctx, 'marketplace.package.create', 'marketplace_package', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  app.get('/api/marketplace/packages/:id', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.read');
    const pkg = (await pool.query('SELECT * FROM marketplace_packages WHERE id=$1', [req.params.id])).rows[0];
    if (!pkg) throw fail('NOT_FOUND', 'package not found', 404);
    const versions = (await pool.query('SELECT * FROM marketplace_versions WHERE package_id=$1 ORDER BY version DESC', [pkg.id])).rows;
    return ok({ ...pkg, versions }, ctx);
  });

  app.post('/api/marketplace/packages/:id/versions', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.manage');
    const { version, changelog, compatibility, requiresEntitlement, manifest } = req.body || {};
    if (!version) throw fail('VALIDATION', 'version required', 400);
    const r = await pool.query(
      `INSERT INTO marketplace_versions(package_id,version,changelog,compatibility,requires_entitlement,manifest)
       VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.params.id, version, changelog, JSON.stringify(compatibility || {}), requiresEntitlement, JSON.stringify(manifest || {})]
    );
    await audit(pool, ctx, 'marketplace.version.create', 'marketplace_version', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  app.get('/api/marketplace/packages/:id/versions', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.read');
    const versions = (await pool.query(
      'SELECT * FROM marketplace_versions WHERE package_id=$1 ORDER BY version DESC',
      [req.params.id]
    )).rows;
    return ok(versions, ctx);
  });

  app.post('/api/marketplace/packages/:id/publish', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.manage');
    const { versionId } = req.body || {};
    if (!versionId) throw fail('VALIDATION', 'versionId required', 400);
    const r = await pool.query(
      `UPDATE marketplace_versions SET status='published', published_at=now() WHERE id=$1 RETURNING *`,
      [versionId]
    );
    if (!r.rows[0]) throw fail('NOT_FOUND', 'version not found', 404);
    await audit(pool, ctx, 'marketplace.version.publish', 'marketplace_version', versionId);
    return ok(r.rows[0], ctx);
  });

  // --- Tenant Marketplace Discovery ---
  app.get('/api/marketplace/discover', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'marketplace.read');
    
    const tenant = (await pool.query('SELECT id,plan FROM tenants WHERE id=$1', [t])).rows[0];
    const entitlements = (await pool.query('SELECT limits FROM entitlements WHERE tenant_id=$1', [t])).rows[0]?.limits || {};
    const rows = (await pool.query("SELECT * FROM marketplace_packages WHERE status='published' ORDER BY featured DESC, created_at DESC")).rows;
    const rules = (await pool.query('SELECT * FROM marketplace_visibility_rules')).rows;
    const versions = (await pool.query("SELECT id,package_id,version,requires_entitlement,compatibility FROM marketplace_versions WHERE status='published'")).rows;
    const filtered = rows.filter((pkg) => isVisibleToTenant(rules.filter((rule) => rule.package_id === pkg.id), tenant)).map((pkg) => ({
      ...pkg,
      versions: versions.filter((version) => version.package_id === pkg.id && (!version.requires_entitlement || Number(entitlements[version.requires_entitlement] || 0) > 0))
    })).filter((pkg) => pkg.versions.length);
    
    return ok(filtered, ctx);
  });

  app.get('/api/marketplace/categories', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'marketplace.read');
    const categories = (await pool.query('SELECT * FROM marketplace_categories ORDER BY sort_order')).rows;
    return ok(categories, ctx);
  });

  // --- Installation ---
  app.post('/api/marketplace/install', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    const { packageId, versionId, config } = req.body || {};
    const idempotencyKey = String(req.headers['idempotency-key'] || req.body?.idempotencyKey || '').trim() || null;
    if (!packageId || !versionId) throw fail('VALIDATION', 'packageId and versionId required', 400);
    
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'marketplace.install',
      permission: 'marketplace.install',
      entitlementKey: 'apps',
      handler: async ({ tenantId }) => {
        // Verify package and version exist
        const pkg = (await pool.query("SELECT * FROM marketplace_packages WHERE id=$1 AND status='published'", [packageId])).rows[0];
        if (!pkg) throw fail('NOT_FOUND', 'package not found', 404);
        
        const version = (await pool.query('SELECT * FROM marketplace_versions WHERE id=$1 AND package_id=$2', [versionId, packageId])).rows[0];
        if (!version) throw fail('NOT_FOUND', 'version not found', 404);
        
        assertInstallableVersion(version, { production: process.env.NODE_ENV === 'production' });
        const tenant = (await pool.query('SELECT id,plan FROM tenants WHERE id=$1', [tenantId])).rows[0];
        const rules = (await pool.query('SELECT * FROM marketplace_visibility_rules WHERE package_id=$1', [packageId])).rows;
        if (!isVisibleToTenant(rules, tenant)) throw fail('FORBIDDEN', 'package is not visible to this tenant', 403);
        if (version.requires_entitlement) {
          const limits = (await pool.query('SELECT limits FROM entitlements WHERE tenant_id=$1', [tenantId])).rows[0]?.limits || {};
          if (Number(limits[version.requires_entitlement] || 0) <= 0) throw fail('ENTITLEMENT_EXCEEDED', 'package entitlement unavailable', 402);
        }
        const existing = (await pool.query(
          'SELECT * FROM marketplace_installations WHERE tenant_id=$1 AND package_id=$2 AND state <> $3', [tenantId, packageId, 'uninstalled']
        )).rows[0];
        if (existing) return { ...existing, idempotent: true };
        
        // Create installation record
        const installationKey = `${tenantId}-${pkg.package_key}-${idempotencyKey || Date.now()}`;
        const r = await pool.query(
          `INSERT INTO marketplace_installations(tenant_id,package_id,version_id,installation_key,state,config,idempotency_key)
           VALUES($1,$2,$3,$4,'pending',$5,$6) RETURNING *`,
          [tenantId, packageId, versionId, installationKey, JSON.stringify(config || {}), idempotencyKey]
        );
        
        // Create saga and enqueue install request
        const saga = await pool.query(
          `INSERT INTO sagas(tenant_id,saga_type,state,input) VALUES($1,'app.install','pending',$2) RETURNING *`,
          [tenantId, { installationId: r.rows[0].id, packageId, versionId, config }]
        );
        
        await enqueueOutbox(pool, {
          tenantId: tenantId,
          subject: 'install.requested',
          payload: {
            installationId: r.rows[0].id,
            tenantId: tenantId,
            packageId,
            versionId,
            config,
            correlationId: ctx.correlationId,
            traceId: ctx.traceId
          }
        });
        
        await bumpUsage(pool, tenantId, 'apps', 1);
        await audit(pool, ctx, 'marketplace.install.request', 'marketplace_installation', r.rows[0].id);
        
        return r.rows[0];
      }
    });
    
    return sendCompat(req, reply, result, 202);
  });

  app.get('/api/marketplace/installations', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'marketplace.read');
    const rows = (await pool.query(
      `SELECT mi.*, p.name as package_name, p.package_key, v.version as version_number
       FROM marketplace_installations mi
       JOIN marketplace_packages p ON mi.package_id = p.id
       JOIN marketplace_versions v ON mi.version_id = v.id
       WHERE mi.tenant_id=$1 ORDER BY mi.created_at DESC`,
      [t]
    )).rows;
    return ok(rows, ctx);
  });

  app.get('/api/marketplace/installations/:id', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'marketplace.read');
    const installation = (await pool.query(
      `SELECT mi.*, p.name as package_name, p.package_key, p.description, v.version as version_number, v.changelog
       FROM marketplace_installations mi
       JOIN marketplace_packages p ON mi.package_id = p.id
       JOIN marketplace_versions v ON mi.version_id = v.id
       WHERE mi.id=$1 AND mi.tenant_id=$2`,
      [req.params.id, t]
    )).rows[0];
    if (!installation) throw fail('NOT_FOUND', 'installation not found', 404);
    
    const steps = (await pool.query(
      'SELECT * FROM installation_saga_steps WHERE installation_id=$1 ORDER BY id',
      [installation.id]
    )).rows;
    
    return ok({ ...installation, steps }, ctx);
  });

  app.post('/api/marketplace/installations/:id/configure', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'marketplace.app.configure');
    const { config } = req.body || {};
    const r = await pool.query(
      `UPDATE marketplace_installations SET config=$2, updated_at=now() WHERE id=$1 AND tenant_id=$3 RETURNING *`,
      [req.params.id, JSON.stringify(config || {}), t]
    );
    if (!r.rows[0]) throw fail('NOT_FOUND', 'installation not found', 404);
    await audit(pool, ctx, 'marketplace.installation.configure', 'marketplace_installation', req.params.id);
    return ok(r.rows[0], ctx);
  });

  app.post('/api/marketplace/installations/:id/uninstall', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    
    return sendCompat(req, reply, await executeCapability(pool, ctx, {
      capabilityId: 'marketplace.uninstall',
      permission: 'marketplace.uninstall',
      handler: async () => {
        const installation = (await pool.query(
          'SELECT * FROM marketplace_installations WHERE id=$1 AND tenant_id=$2',
          [req.params.id, t]
        )).rows[0];
        if (!installation) throw fail('NOT_FOUND', 'installation not found', 404);
        
        // Preserve tenant data and audit history; disable the runtime instead of deleting it.
        if (installation.app_id) {
          await pool.query("UPDATE apps SET lifecycle_status='DISABLED', status='disabled', updated_at=now() WHERE id=$1 AND tenant_id=$2", [installation.app_id, t]);
        }
        await pool.query("UPDATE marketplace_installations SET state='uninstalled', updated_at=now() WHERE id=$1 AND tenant_id=$2", [req.params.id, t]);
        
        await bumpUsage(pool, t, 'apps', -1);
        await audit(pool, ctx, 'marketplace.installation.uninstall', 'marketplace_installation', req.params.id);
        
        return { success: true };
      }
    }));
  });

  // Helper function for compatibility with existing routes
  function sendCompat(req, reply, payload, code = 200) {
    const wantsEnvelope = String(req.headers['x-bridge-envelope'] || '') === '1' || String(req.query.envelope || '') === '1';
    if (wantsEnvelope) return reply.code(code).send(ok(payload, req.bridge));
    return reply.code(code).send(payload);
  }
}
