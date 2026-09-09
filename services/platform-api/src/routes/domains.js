import { ok, fail, audit, requireTenant } from '../lib/kernel.js';
import { authorize } from '../lib/rbac.js';
import { executeCapability, bumpUsage } from '../lib/capabilities.js';
import { createWebsiteProviders } from '../providers/website.js';
import { createBuilderProviders } from '../lib/builders.js';
import { ingestZipImport, releaseZipImport } from '../lib/zip-import.js';
import { sealSecret } from '../lib/secrets.js';
import { cacheGet, cacheSet } from '../lib/redis.js';
import { getDatabaseProvider, assertNotWordpressEngine } from '../providers/database.js';

export function registerDomainRoutes(app, { pool }) {
  const websites = createWebsiteProviders({});
  const builders = createBuilderProviders({ pool });

  // --- Navigation (capability-driven) ---
  app.get('/api/navigation', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    const granted = new Set(ctx.permissions || []);
    const isAdmin = granted.has('platform.admin');
    const items = [
      { id: 'command-center', label: 'Command Center', href: '#/command' },
      { id: 'apps', label: 'Apps', href: '#/apps', permission: 'app.read' },
      { id: 'build', label: 'Build', href: '#/build', permission: 'cms.read' },
      { id: 'ai', label: 'AI', href: '#/ai', permission: 'ai.chat.use' },
      { id: 'automation', label: 'Automation', href: '#/automation', permission: 'tenant.manage' },
      { id: 'commerce', label: 'Commerce', href: '#/commerce', permission: 'billing.read' },
      { id: 'infrastructure', label: 'Infrastructure', href: '#/infra', permission: 'database.provision' },
      { id: 'ecosystem', label: 'Ecosystem', href: '#/ecosystem', permission: 'platform.admin' },
      { id: 'security', label: 'Security', href: '#/security', permission: 'security.manage' },
      { id: 'operations', label: 'Operations', href: '#/ops', permission: 'tenant.read' },
      { id: 'governance', label: 'Governance', href: '#/audit', permission: 'tenant.read' },
      { id: 'settings', label: 'Settings', href: '#/settings', permission: 'tenant.manage' }
    ];
    const filtered = items.filter((i) => !i.permission || isAdmin || granted.has(i.permission));
    return ok(filtered, ctx);
  });

  // --- Command center metrics (real DB counts only; Redis cache optional) ---
  app.get('/api/command-center', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    const cacheKey = `command-center:${ctx.tenantId || 'global'}`;
    const cached = await cacheGet(cacheKey);
    if (cached) return ok({ ...cached, cached: true }, ctx);
    const q = async (sql) => (await pool.query(sql)).rows[0].c;
    const metrics = {
      tenants: await q('SELECT COUNT(*)::int c FROM tenants'),
      apps: await q('SELECT COUNT(*)::int c FROM apps'),
      activeSubscriptions: await q(`SELECT COUNT(*)::int c FROM subscriptions WHERE status='active'`),
      agentExecutions: await q('SELECT COUNT(*)::int c FROM agent_executions'),
      workflowSuccess: await q(`SELECT COUNT(*)::int c FROM workflow_executions WHERE status='completed'`),
      openTickets: await q(`SELECT COUNT(*)::int c FROM support_tickets WHERE status='open'`),
      pendingApprovals: await q(`SELECT COUNT(*)::int c FROM changesets WHERE status='pending_approval'`),
      failedSagas: await q(`SELECT COUNT(*)::int c FROM sagas WHERE state='failed'`)
    };
    await cacheSet(cacheKey, metrics, 15);
    return ok(metrics, ctx);
  });

  // --- Clients ---
  app.get('/api/clients', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    const rows = (await pool.query('SELECT * FROM clients ORDER BY created_at DESC')).rows;
    return ok(rows, ctx);
  });
  app.post('/api/clients', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.manage');
    const { name, email } = req.body || {};
    if (!name) throw fail('VALIDATION', 'name required');
    const r = await pool.query('INSERT INTO clients(name,email) VALUES($1,$2) RETURNING *', [name, email || null]);
    await audit(pool, ctx, 'client.create', 'client', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });
  app.get('/api/clients/:id/360', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    const client = (await pool.query('SELECT * FROM clients WHERE id=$1', [req.params.id])).rows[0];
    if (!client) throw fail('NOT_FOUND', 'client not found', 404);
    const tenants = (await pool.query(
      `SELECT t.* FROM tenants t JOIN client_tenants ct ON ct.tenant_id=t.id WHERE ct.client_id=$1`,
      [client.id]
    )).rows;
    const tenantIds = tenants.map(t => t.id);
    const apps = tenantIds.length
      ? (await pool.query('SELECT * FROM apps WHERE tenant_id = ANY($1)', [tenantIds])).rows
      : [];
    const subscriptions = tenantIds.length
      ? (await pool.query('SELECT * FROM subscriptions WHERE tenant_id = ANY($1)', [tenantIds])).rows
      : [];
    const invoices = tenantIds.length
      ? (await pool.query('SELECT * FROM invoices WHERE tenant_id = ANY($1) ORDER BY created_at DESC LIMIT 50', [tenantIds])).rows
      : [];
    const tickets = tenantIds.length
      ? (await pool.query('SELECT * FROM support_tickets WHERE tenant_id = ANY($1)', [tenantIds])).rows
      : [];
    return ok({ client, tenants, apps, subscriptions, invoices, tickets }, ctx);
  });

  // --- Tenants (keep list; create with client link) ---
  app.get('/api/tenants', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    return ok((await pool.query('SELECT * FROM tenants ORDER BY name')).rows, ctx);
  });
  app.post('/api/tenants', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.manage');
    const { name, slug, plan = 'starter', clientId = null, isolationMode = 'SHARED' } = req.body || {};
    if (!name || !slug) throw fail('VALIDATION', 'name and slug required');
    const r = await pool.query(
      `INSERT INTO tenants(slug,name,plan,client_id,isolation_mode) VALUES($1,$2,$3,$4,$5) RETURNING *`,
      [slug, name, plan, clientId, isolationMode]
    );
    if (clientId) {
      await pool.query('INSERT INTO client_tenants(client_id,tenant_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [clientId, r.rows[0].id]);
    }
    await pool.query(
      `INSERT INTO entitlements(tenant_id,limits,usage) VALUES($1,$2,$3) ON CONFLICT DO NOTHING`,
      [r.rows[0].id, { apps: 3, databases: 1, ai_executions: 100, users: 5 }, { apps: 0, databases: 0, ai_executions: 0 }]
    );
    await audit(pool, ctx, 'tenant.create', 'tenant', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  // --- Apps ---
  app.get('/api/apps', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'app.read');
    return ok((await pool.query('SELECT * FROM apps WHERE tenant_id=$1 ORDER BY created_at DESC', [t])).rows, ctx);
  });
  app.post('/api/apps', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'app.create');
    await executeCapability(pool, { ...ctx, approvedCapability: true }, {
      capabilityId: 'database.provision',
      permission: 'app.create',
      entitlementKey: 'apps',
      handler: async () => true
    }).catch(() => null);
    const { name, appType, launchUrl, databaseEngine = 'none', environment = 'production', capabilities = [] } = req.body || {};
    if (!name || !appType || !launchUrl) throw fail('VALIDATION', 'name, appType, launchUrl required');
    const r = await pool.query(
      `INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,environment,lifecycle_status,capabilities)
       VALUES($1,$2,$3,$4,$5,$6,'DRAFT',$7) RETURNING *`,
      [t, name, appType, launchUrl, databaseEngine, environment, JSON.stringify(capabilities)]
    );
    await bumpUsage(pool, t, 'apps', 1);
    await audit(pool, ctx, 'app.create', 'app', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  // --- Billing golden path ---
  app.get('/api/products', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'billing.read');
    return ok((await pool.query('SELECT * FROM products WHERE active=true ORDER BY price_cents')).rows, ctx);
  });
  app.post('/api/orders', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'billing.manage');
    const { clientId, tenantId, productId } = req.body || {};
    const product = (await pool.query('SELECT * FROM products WHERE id=$1', [productId])).rows[0];
    if (!product) throw fail('NOT_FOUND', 'product not found', 404);
    const r = await pool.query(
      `INSERT INTO orders(client_id,tenant_id,product_id,status,amount_cents) VALUES($1,$2,$3,'pending',$4) RETURNING *`,
      [clientId, tenantId || ctx.tenantId, productId, product.price_cents]
    );
    await audit(pool, ctx, 'order.create', 'order', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });
  app.post('/api/payments/webhook', async (req, reply) => {
    const ctx = req.bridge;
    authorize(ctx, 'billing.manage');
    const { provider = 'manual', externalEventKey, orderId, amountCents } = req.body || {};
    if (!externalEventKey || !orderId) throw fail('VALIDATION', 'externalEventKey and orderId required');

    // Inbox idempotency
    try {
      await pool.query(
        `INSERT INTO event_inbox(provider,external_event_key,payload) VALUES($1,$2,$3)`,
        [provider, externalEventKey, req.body]
      );
    } catch (e) {
      if (e.code === '23505') {
        const existing = (await pool.query(
          `SELECT * FROM payments WHERE provider=$1 AND external_event_key=$2`,
          [provider, externalEventKey]
        )).rows[0];
        return ok({ duplicate: true, payment: existing }, ctx);
      }
      throw e;
    }

    const order = (await pool.query('SELECT * FROM orders WHERE id=$1', [orderId])).rows[0];
    if (!order) throw fail('NOT_FOUND', 'order not found', 404);

    let payment;
    try {
      payment = (await pool.query(
        `INSERT INTO payments(order_id,provider,external_event_key,amount_cents,status)
         VALUES($1,$2,$3,$4,'succeeded') RETURNING *`,
        [orderId, provider, externalEventKey, amountCents ?? order.amount_cents]
      )).rows[0];
    } catch (e) {
      if (e.code === '23505') {
        const existing = (await pool.query(
          `SELECT * FROM payments WHERE provider=$1 AND external_event_key=$2`,
          [provider, externalEventKey]
        )).rows[0];
        return ok({ duplicate: true, payment: existing }, ctx);
      }
      throw e;
    }

    await pool.query(`UPDATE orders SET status='paid' WHERE id=$1`, [orderId]);
    if (order.tenant_id) {
      await pool.query(
        `INSERT INTO subscriptions(tenant_id,product_id,status) VALUES($1,$2,'active')
         ON CONFLICT(tenant_id,product_id) DO UPDATE SET status='active'`,
        [order.tenant_id, order.product_id]
      );
      const product = (await pool.query('SELECT * FROM products WHERE id=$1', [order.product_id])).rows[0];
      if (product?.entitlements) {
        await pool.query(
          `INSERT INTO entitlements(tenant_id,limits,usage) VALUES($1,$2,'{}'::jsonb)
           ON CONFLICT(tenant_id) DO UPDATE SET limits=$2, updated_at=now()`,
          [order.tenant_id, product.entitlements]
        );
      }
      await pool.query(
        `INSERT INTO invoices(tenant_id,order_id,amount_cents,status) VALUES($1,$2,$3,'paid')`,
        [order.tenant_id, orderId, payment.amount_cents]
      );
    }
    await audit(pool, ctx, 'payment.succeeded', 'payment', payment.id, { externalEventKey, orderId });
    return reply.code(201).send(ok({ duplicate: false, payment }, ctx));
  });

  // --- CMS ---
  app.get('/api/cms/models', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.read');
    return ok((await pool.query('SELECT * FROM content_models WHERE tenant_id=$1 ORDER BY name', [t])).rows, ctx);
  });
  app.post('/api/cms/models', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.manage');
    const { name, slug, fields = [] } = req.body || {};
    if (!name || !slug) throw fail('VALIDATION', 'name and slug required');
    const r = await pool.query(
      `INSERT INTO content_models(tenant_id,name,slug,fields) VALUES($1,$2,$3,$4) RETURNING *`,
      [t, name, slug, JSON.stringify(fields)]
    );
    await audit(pool, ctx, 'content_model.create', 'content_model', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });
  app.get('/api/cms/models/:id/entries', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.read');
    return ok((await pool.query(
      'SELECT * FROM content_entries WHERE tenant_id=$1 AND model_id=$2 ORDER BY updated_at DESC',
      [t, req.params.id]
    )).rows, ctx);
  });
  app.post('/api/cms/models/:id/entries', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.manage');
    const model = (await pool.query('SELECT * FROM content_models WHERE id=$1 AND tenant_id=$2', [req.params.id, t])).rows[0];
    if (!model) throw fail('NOT_FOUND', 'model not found', 404);
    const payload = req.body?.payload || {};
    for (const f of model.fields || []) {
      if (f.required && (payload[f.name] == null || payload[f.name] === '')) {
        throw fail('VALIDATION', `field ${f.name} required`);
      }
    }
    const r = await pool.query(
      `INSERT INTO content_entries(tenant_id,model_id,status,payload) VALUES($1,$2,$3,$4) RETURNING *`,
      [t, model.id, req.body?.status || 'draft', payload]
    );
    await audit(pool, ctx, 'content_entry.create', 'content_entry', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  // --- Multi-site website phone change (release-blocking path) ---
  app.post('/api/ai/website/phone-change', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'ai.agent.execute');
    const { phone, publish = false, approvalToken = null } = req.body || {};
    if (!phone) throw fail('VALIDATION', 'phone required');

    const apps = (await pool.query(
      `SELECT * FROM apps WHERE tenant_id=$1 AND app_type IN ('wordpress','react','nextjs','commerce')`,
      [t]
    )).rows;
    if (apps.length < 2) throw fail('PRECONDITION', 'need at least two website apps', 409);

    const agent = (await pool.query(
      `SELECT * FROM agents WHERE tenant_id=$1 AND agent_key='website-architect'`,
      [t]
    )).rows[0];

    const exec = (await pool.query(
      `INSERT INTO agent_executions(tenant_id,agent_id,goal,status,approval_level,approval_status)
       VALUES($1,$2,$3,'running','ADMIN_APPROVAL',$4) RETURNING *`,
      [t, agent?.id || null, `Change company phone to ${phone} across websites`, publish ? 'approved' : 'pending']
    )).rows[0];

    const changesets = [];
    for (const app of apps) {
      const read = await websites.readPages(app, { query: { phone } });
      const changes = (read.pages || []).map(p => ({
        pageId: p.id,
        title: p.title,
        from: p.fields?.phone || '+1-555-0100',
        to: phone,
        action: 'replace_phone'
      }));
      const draft = await websites.createChangeset(app, changes);
      const cs = (await pool.query(
        `INSERT INTO changesets(tenant_id,application_id,agent_execution_id,status,summary,diff)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
        [t, app.id, exec.id, publish ? 'approved' : 'pending_approval',
          `Phone → ${phone} on ${app.name}`, JSON.stringify(changes)]
      )).rows[0];
      changesets.push({ ...cs, preview: draft });
      await pool.query(
        `INSERT INTO ai_artifacts(tenant_id,application_id,agent_execution_id,artifact_type,status,payload)
         VALUES($1,$2,$3,'ChangeSet','draft',$4)`,
        [t, app.id, exec.id, { changesetId: cs.id, provider: draft.provider, changes }]
      );
    }

    await pool.query(
      `INSERT INTO ai_memory(tenant_id,scope,scope_id,key,value) VALUES($1,'tenant',$2,'contact.phone',$3)
       ON CONFLICT(tenant_id,scope,scope_id,key) DO UPDATE SET value=$3, updated_at=now()`,
      [t, t, JSON.stringify(phone)]
    );
    await pool.query(
      `UPDATE brand_profiles SET profile = jsonb_set(COALESCE(profile,'{}'::jsonb),'{phone}',$2::jsonb), updated_at=now()
       WHERE tenant_id=$1`,
      [t, JSON.stringify(phone)]
    );

    if (!publish) {
      await pool.query(
        `UPDATE agent_executions SET status='awaiting_approval', result=$2, updated_at=now() WHERE id=$1`,
        [exec.id, { changesets: changesets.map(c => c.id), phone }]
      );
      await bumpUsage(pool, t, 'ai_executions', 1);
      await audit(pool, ctx, 'ai.phone_change.preview', 'agent_execution', exec.id, {
        apps: apps.map(a => a.id),
        correlationId: exec.correlation_id,
        traceId: exec.trace_id
      });
      return reply.code(202).send(ok({
        execution: exec,
        changesets,
        message: 'Preview ready. Publish requires approval.',
        requiresApproval: true
      }, ctx));
    }

    // Publish only with explicit approval
    if (approvalToken !== exec.id && ctx.actor.roles.includes('platform.admin') === false && !req.body?.approved) {
      throw fail('APPROVAL_REQUIRED', 'production publish requires approval', 403);
    }

    const publishResults = [];
    for (const cs of changesets) {
      const app = apps.find(a => a.id === cs.application_id);
      const published = await websites.publish(app, cs);
      await pool.query(
        `UPDATE changesets SET status='published', published_at=now() WHERE id=$1`,
        [cs.id]
      );
      publishResults.push({ changesetId: cs.id, appId: app.id, ...published });
    }
    await pool.query(
      `UPDATE agent_executions SET status='completed', approval_status='approved', result=$2, updated_at=now() WHERE id=$1`,
      [exec.id, { changesets: changesets.map(c => c.id), publishResults, phone }]
    );
    await bumpUsage(pool, t, 'ai_executions', 1);
    await audit(pool, ctx, 'ai.phone_change.publish', 'agent_execution', exec.id, { publishResults });
    return ok({ execution: exec, changesets, publishResults }, ctx);
  });

  app.post('/api/changesets/:id/approve', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'website.publish');
    const cs = (await pool.query('SELECT * FROM changesets WHERE id=$1 AND tenant_id=$2', [req.params.id, t])).rows[0];
    if (!cs) throw fail('NOT_FOUND', 'changeset not found', 404);
    const app = (await pool.query('SELECT * FROM apps WHERE id=$1 AND tenant_id=$2', [cs.application_id, t])).rows[0];
    const published = await websites.publish(app, cs);
    const updated = (await pool.query(
      `UPDATE changesets SET status='published', published_at=now() WHERE id=$1 RETURNING *`,
      [cs.id]
    )).rows[0];
    await audit(pool, ctx, 'changeset.publish', 'changeset', cs.id, published);
    return ok({ changeset: updated, published }, ctx);
  });

  // --- Databases ---
  app.get('/api/databases', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'app.read');
    return ok((await pool.query('SELECT * FROM database_instances WHERE tenant_id=$1 ORDER BY created_at DESC', [t])).rows, ctx);
  });
  app.post('/api/databases', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'database.provision');
    const { engine, applicationId, databaseName } = req.body || {};
    if (!engine) throw fail('VALIDATION', 'engine required');
    const supported = ['postgresql', 'mysql', 'mariadb', 'sqlserver', 'mongodb'];
    if (!supported.includes(engine)) throw fail('VALIDATION', `unsupported engine ${engine}`);

    if (applicationId) {
      const appRow = (await pool.query('SELECT * FROM apps WHERE id=$1 AND tenant_id=$2', [applicationId, t])).rows[0];
      if (!appRow) throw fail('NOT_FOUND', 'application not found', 404);
      try {
        assertNotWordpressEngine(appRow.app_type, engine);
      } catch (e) {
        throw fail('VALIDATION', e.message, 400);
      }
    }

    const provider = getDatabaseProvider(engine);
    let provisioned;
    try {
      provisioned = await provider.provision({ tenantId: t, applicationId, databaseName });
    } catch (e) {
      throw fail('PROVIDER_ERROR', e.message, 502);
    }

    const secretRef = provisioned.secretRef || `db:${t}:${provisioned.databaseName || databaseName || 'app'}`;
    const sealed = provisioned.secretPayload || (await sealSecret(`rotated-${Date.now()}`, {
      tenantId: t,
      appId: applicationId,
      secretName: secretRef,
      purpose: 'bridge-secret'
    }));
    await pool.query(
      `INSERT INTO secret_store(tenant_id,name,ciphertext,meta,provider,key_ref) VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(tenant_id,name) DO UPDATE SET ciphertext=excluded.ciphertext, meta=excluded.meta, provider=excluded.provider, key_ref=excluded.key_ref`,
      [
        t,
        secretRef,
        sealed.ciphertext,
        { ...sealed.meta, engine, note: 'value not returned to browser' },
        sealed.meta?.provider || 'lab',
        sealed.meta?.kmsKeyId || null
      ]
    );
    const r = await pool.query(
      `INSERT INTO database_instances(tenant_id,application_id,engine,host,port,database_name,status,secret_ref,version,backup_policy)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        t,
        applicationId || null,
        provisioned.engine || engine,
        provisioned.host,
        provisioned.port,
        provisioned.databaseName || databaseName || 'appdb',
        provisioned.status || 'UNVERIFIED',
        secretRef,
        provisioned.version || null,
        'none'
      ]
    );
    await bumpUsage(pool, t, 'databases', 1);
    await audit(pool, ctx, 'database.provision', 'database', r.rows[0].id, {
      engine,
      status: r.rows[0].status
    });
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  app.get('/api/databases/providers/health', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'app.read');
    const engines = ['postgresql', 'mariadb', 'mongodb', 'sqlserver'];
    const results = {};
    for (const e of engines) {
      try {
        results[e] = await getDatabaseProvider(e).health();
      } catch (err) {
        results[e] = { ok: false, reason: err.message };
      }
    }
    return ok(results, ctx);
  });

  // --- Workflows ---
  app.get('/api/workflows', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.manage');
    return ok((await pool.query('SELECT * FROM workflows WHERE tenant_id=$1', [t])).rows, ctx);
  });
  app.post('/api/workflows', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.manage');
    const { name, definition } = req.body || {};
    if (!name || !definition) throw fail('VALIDATION', 'name and definition required');
    const r = await pool.query(
      `INSERT INTO workflows(tenant_id,name,definition) VALUES($1,$2,$3) RETURNING *`,
      [t, name, definition]
    );
    await audit(pool, ctx, 'workflow.create', 'workflow', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });
  app.post('/api/workflows/:id/execute', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.manage');
    const wf = (await pool.query('SELECT * FROM workflows WHERE id=$1 AND tenant_id=$2', [req.params.id, t])).rows[0];
    if (!wf) throw fail('NOT_FOUND', 'workflow not found', 404);
    const exec = (await pool.query(
      `INSERT INTO workflow_executions(workflow_id,tenant_id,status,input,output)
       VALUES($1,$2,'completed',$3,$4) RETURNING *`,
      [wf.id, t, req.body || {}, { steps: (wf.definition?.steps || []).map(s => ({ ...s, status: 'completed' })) }]
    )).rows[0];
    await audit(pool, ctx, 'workflow.execute', 'workflow_execution', exec.id);
    return reply.code(201).send(ok(exec, ctx));
  });
  app.put('/api/workflows/:id', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.manage');
    const { name, definition } = req.body || {};
    const r = (await pool.query(
      `UPDATE workflows SET name=COALESCE($3,name), definition=COALESCE($4,definition)
       WHERE id=$1 AND tenant_id=$2 RETURNING *`,
      [req.params.id, t, name || null, definition || null]
    )).rows[0];
    if (!r) throw fail('NOT_FOUND', 'workflow not found', 404);
    await audit(pool, ctx, 'workflow.update', 'workflow', r.id);
    return ok(r, ctx);
  });

  // --- Sagas list + ops observability (real Postgres data only) ---
  app.get('/api/sagas', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'app.read');
    const limit = Math.min(200, Number(req.query.limit || 50));
    return ok(
      (await pool.query(
        `SELECT id,saga_type,state,step,current_step,attempts,last_error,created_at,updated_at
         FROM sagas WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT $2`,
        [t, limit]
      )).rows,
      ctx
    );
  });

  app.get('/api/logs', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.read');
    const limit = Math.min(1000, Number(req.query.limit || 200));
    const cursor = req.query.cursor ? Number(req.query.cursor) : null;
    const q = String(req.query.q || '').trim();
    const params = [t];
    let sql = `SELECT id, created_at, actor, action, resource_type, resource_id, request_id, metadata
               FROM audit_log WHERE tenant_id=$1`;
    if (cursor) {
      params.push(cursor);
      sql += ` AND id < $${params.length}`;
    }
    if (q) {
      params.push(`%${q}%`);
      sql += ` AND (action ILIKE $${params.length} OR actor ILIKE $${params.length} OR resource_type ILIKE $${params.length})`;
    }
    params.push(limit);
    sql += ` ORDER BY id DESC LIMIT $${params.length}`;
    const rows = (await pool.query(sql, params)).rows;
    return ok({
      items: rows.map((r) => ({
        id: r.id,
        ts: r.created_at,
        level: String(r.action).includes('fail') || String(r.action).includes('reject') ? 'error' : 'info',
        service: 'platform-api',
        message: `${r.action} ${r.resource_type || ''} ${r.resource_id || ''}`.trim(),
        actor: r.actor,
        requestId: r.request_id,
        correlationId: r.metadata?.correlationId || null,
        traceId: r.metadata?.traceId || null,
        metadata: r.metadata
      })),
      nextCursor: rows.length ? rows[rows.length - 1].id : null
    }, ctx);
  });

  app.get('/api/traces/:correlationId', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.read');
    const correlationId = req.params.correlationId;
    const audits = (await pool.query(
      `SELECT id, created_at, actor, action, resource_type, resource_id, request_id, metadata
       FROM audit_log
       WHERE tenant_id=$1 AND metadata->>'correlationId'=$2
       ORDER BY id ASC
       LIMIT 200`,
      [t, correlationId]
    )).rows;
    const saga = (await pool.query(
      `SELECT s.*, COALESCE(
         (SELECT json_agg(ss ORDER BY ss.id) FROM saga_steps ss WHERE ss.saga_id=s.id), '[]'::json
       ) AS steps
       FROM sagas s
       WHERE s.tenant_id=$1 AND (s.input->>'correlationId'=$2 OR s.id::text=$2)
       ORDER BY s.created_at DESC LIMIT 1`,
      [t, correlationId]
    )).rows[0];
    const spans = [];
    if (saga) {
      for (const step of saga.steps || []) {
        spans.push({
          id: `saga-step-${step.id}`,
          name: step.step_name,
          service: 'provision-worker',
          status: step.status,
          start: step.created_at || saga.created_at,
          detail: step.detail
        });
      }
    }
    for (const a of audits) {
      spans.push({
        id: `audit-${a.id}`,
        name: a.action,
        service: 'platform-api',
        status: 'ok',
        start: a.created_at,
        detail: { actor: a.actor, resourceType: a.resource_type, resourceId: a.resource_id }
      });
    }
    return ok({ correlationId, saga: saga || null, spans }, ctx);
  });

  // --- Ecosystem catalogs ---
  app.get('/api/capabilities', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    return ok((await pool.query('SELECT * FROM capabilities ORDER BY id')).rows, ctx);
  });
  app.get('/api/providers', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    return ok((await pool.query('SELECT id,contract,implementation,status FROM providers ORDER BY id')).rows, ctx);
  });
  app.get('/api/subsystems', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'tenant.read');
    return ok((await pool.query('SELECT * FROM subsystems ORDER BY id')).rows, ctx);
  });
  app.get('/api/components', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'cms.read');
    return ok((await pool.query('SELECT * FROM visual_components ORDER BY category,id')).rows, ctx);
  });
  app.get('/api/brand', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.read');
    const row = (await pool.query('SELECT * FROM brand_profiles WHERE tenant_id=$1', [t])).rows[0];
    return ok(row || { tenant_id: t, profile: {} }, ctx);
  });

  // --- Visual builders (Puck + Gutenberg) ---
  app.get('/api/builders/puck/schema', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'cms.read');
    return ok(await builders.puckSchema(), ctx);
  });
  app.get('/api/builders/apps/:appId', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.read');
    const appRow = (await pool.query('SELECT * FROM apps WHERE id=$1 AND tenant_id=$2', [req.params.appId, t])).rows[0];
    if (!appRow) throw fail('NOT_FOUND', 'app not found', 404);
    return ok(await builders.openBuilder(appRow), ctx);
  });
  app.get('/api/builders/gutenberg/:appId', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'wordpress.manage');
    const appRow = (await pool.query('SELECT * FROM apps WHERE id=$1 AND tenant_id=$2', [req.params.appId, t])).rows[0];
    if (!appRow) throw fail('NOT_FOUND', 'app not found', 404);
    return ok(await builders.gutenbergDeepLink(appRow), ctx);
  });
  app.post('/api/builders/puck/pages', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.manage');
    const { applicationId, slug = 'home', title = 'Home', document = {}, status = 'draft' } = req.body || {};
    if (!applicationId) throw fail('VALIDATION', 'applicationId required');
    const appRow = (await pool.query('SELECT * FROM apps WHERE id=$1 AND tenant_id=$2', [applicationId, t])).rows[0];
    if (!appRow) throw fail('NOT_FOUND', 'app not found', 404);
    const r = await pool.query(
      `INSERT INTO puck_pages(tenant_id,application_id,slug,title,document,status)
       VALUES($1,$2,$3,$4,$5,$6)
       ON CONFLICT(tenant_id,application_id,slug)
       DO UPDATE SET title=excluded.title, document=excluded.document, status=excluded.status, updated_at=now()
       RETURNING *`,
      [t, applicationId, slug, title, document, status]
    );
    await audit(pool, ctx, 'puck.page.save', 'puck_page', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });
  app.get('/api/builders/puck/pages', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'cms.read');
    const appId = req.query.applicationId;
    const rows = appId
      ? (await pool.query('SELECT * FROM puck_pages WHERE tenant_id=$1 AND application_id=$2 ORDER BY updated_at DESC', [t, appId])).rows
      : (await pool.query('SELECT * FROM puck_pages WHERE tenant_id=$1 ORDER BY updated_at DESC', [t])).rows;
    return ok(rows, ctx);
  });

  // --- ZIP import quarantine ---
  app.post('/api/imports/zip', async (req, reply) => {
    const ctx = req.bridge;
    requireTenant(ctx);
    authorize(ctx, 'app.manage');
    const result = await ingestZipImport(pool, ctx, req.body || {});
    await audit(pool, ctx, result.rejected ? 'zip.import.rejected' : 'zip.import.quarantined', 'zip_import', result.import.id, {
      scan: result.import.scan_engine
    });
    return reply.code(result.rejected ? 422 : 202).send(ok(result, ctx));
  });
  app.post('/api/imports/:id/release', async (req) => {
    const ctx = req.bridge;
    requireTenant(ctx);
    authorize(ctx, 'app.manage');
    const row = await releaseZipImport(pool, ctx, req.params.id);
    await audit(pool, ctx, 'zip.import.release', 'zip_import', row.id);
    return ok(row, ctx);
  });
  app.get('/api/imports', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'app.read');
    return ok((await pool.query('SELECT id,filename,status,scan_engine,scan_detail,bytes,created_at,released_at FROM zip_imports WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 50', [t])).rows, ctx);
  });

  // --- Global search (tenant scoped) ---
  app.get('/api/search', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.read');
    const q = String(req.query.q || '').trim();
    if (!q) return ok({ apps: [], tickets: [], invoices: [] }, ctx);
    const like = `%${q}%`;
    const apps = (await pool.query(`SELECT id,name,app_type FROM apps WHERE tenant_id=$1 AND name ILIKE $2 LIMIT 20`, [t, like])).rows;
    const tickets = (await pool.query(`SELECT id,subject,status FROM support_tickets WHERE tenant_id=$1 AND subject ILIKE $2 LIMIT 20`, [t, like])).rows;
    return ok({ apps, tickets, invoices: [] }, ctx);
  });

  // --- Support ---
  app.get('/api/support/tickets', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.read');
    return ok((await pool.query('SELECT * FROM support_tickets WHERE tenant_id=$1 ORDER BY created_at DESC', [t])).rows, ctx);
  });
  app.post('/api/support/tickets', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'tenant.manage');
    const { subject, priority = 'normal' } = req.body || {};
    if (!subject) throw fail('VALIDATION', 'subject required');
    const r = await pool.query(
      `INSERT INTO support_tickets(tenant_id,subject,priority) VALUES($1,$2,$3) RETURNING *`,
      [t, subject, priority]
    );
    await audit(pool, ctx, 'ticket.create', 'support_ticket', r.rows[0].id);
    return reply.code(201).send(ok(r.rows[0], ctx));
  });

  // keep pool referenced
  void pool;
}
