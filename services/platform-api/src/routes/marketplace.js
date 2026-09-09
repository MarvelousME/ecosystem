import { ok, fail, audit, requireTenant } from '../lib/kernel.js';
import { authorize } from '../lib/rbac.js';
import { executeCapability, bumpUsage } from '../lib/capabilities.js';
import { enqueueOutbox } from '../lib/outbox.js';

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
    
    // Get tenant's entitlements
    const entitlements = (await pool.query('SELECT limits FROM entitlements WHERE tenant_id=$1', [t])).rows[0]?.limits || {};
    
    // Filter packages by entitlement and published status
    const rows = (await pool.query(
      `SELECT DISTINCT p.*, 
              (SELECT json_agg(json_build_object('id', v.id, 'version', v.version, 'requires_entitlement', v.requires_entitlement))
               FROM marketplace_versions v WHERE v.package_id = p.id AND v.status = 'published') as versions
       FROM marketplace_packages p
       WHERE p.status = 'published'
       AND (p.requires_entitlement IS NULL OR p.requires_entitlement = ANY($1))
       ORDER BY p.featured DESC, p.created_at DESC`,
      [Object.keys(entitlements).length > 0 ? Object.keys(entitlements) : [null]]
    )).rows;
    
    // Filter versions by tenant entitlements
    const filtered = rows.map(pkg => ({
      ...pkg,
      versions: pkg.versions?.filter(v => !v.requires_entitlement || entitlements[v.requires_entitlement] > 0) || []
    }));
    
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
    if (!packageId || !versionId) throw fail('VALIDATION', 'packageId and versionId required', 400);
    
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'marketplace.install',
      permission: 'marketplace.install',
      entitlementKey: 'apps',
      handler: async ({ tenantId }) => {
        // Verify package and version exist
        const pkg = (await pool.query('SELECT * FROM marketplace_packages WHERE id=$1', [packageId])).rows[0];
        if (!pkg) throw fail('NOT_FOUND', 'package not found', 404);
        
        const version = (await pool.query('SELECT * FROM marketplace_versions WHERE id=$1 AND package_id=$2', [versionId, packageId])).rows[0];
        if (!version) throw fail('NOT_FOUND', 'version not found', 404);
        
        if (version.status !== 'published') throw fail('FORBIDDEN', 'version not published', 403);
        
        // Create installation record
        const installationKey = `${tenantId}-${pkg.package_key}-${Date.now()}`;
        const r = await pool.query(
          `INSERT INTO marketplace_installations(tenant_id,package_id,version_id,installation_key,state,config)
           VALUES($1,$2,$3,$4,'pending',$5) RETURNING *`,
          [tenantId, packageId, versionId, installationKey, JSON.stringify(config || {})]
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
    authorize(ctx, 'marketplace.install');
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
        
        // Delete app record if linked
        if (installation.app_id) {
          await pool.query('DELETE FROM apps WHERE id=$1', [installation.app_id]);
        }
        
        // Delete installation
        await pool.query('DELETE FROM marketplace_installations WHERE id=$1', [req.params.id]);
        
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
