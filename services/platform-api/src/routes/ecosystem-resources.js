import { ok, fail, audit, requireTenant } from '../lib/kernel.js';
import { authorize } from '../lib/rbac.js';
import { executeCapability, bumpUsage } from '../lib/capabilities.js';
import { enqueueOutbox } from '../lib/outbox.js';

const FRONTEND_TOOLS = new Set([
  'frontend.provider.list', 'frontend.provider.describe', 'frontend.components.search', 'frontend.component.describe',
  'frontend.component.preview', 'frontend.component.install', 'frontend.templates.search', 'frontend.template.describe',
  'frontend.template.install', 'frontend.page.read', 'frontend.page.create', 'frontend.page.update', 'frontend.layout.inspect',
  'frontend.theme.read', 'frontend.theme.update', 'frontend.preview.create', 'frontend.accessibility.audit', 'frontend.responsive.audit'
]);

function tenantApp(pool, tenantId, applicationId) {
  return pool.query('SELECT id FROM apps WHERE id=$1 AND tenant_id=$2', [applicationId, tenantId]).then((r) => r.rows[0]);
}

export function registerEcosystemResourceRoutes(app, { pool }) {
  app.get('/api/frontend-mcp/components', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'frontend.component.read');
    const query = String(req.query.q || '').trim();
    const rows = (await pool.query(
      `SELECT c.*, p.name AS provider_name, p.package AS provider_package FROM frontend_components c
       JOIN frontend_mcp_providers p ON p.id=c.provider_id
       WHERE c.status='APPROVED' AND ($1='' OR c.name ILIKE '%' || $1 || '%' OR c.category ILIKE '%' || $1 || '%')
       ORDER BY c.category,c.name`, [query]
    )).rows;
    return ok(rows, ctx);
  });

  app.get('/api/frontend-mcp/templates', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'frontend.template.read');
    return ok((await pool.query("SELECT * FROM frontend_templates WHERE status='APPROVED' ORDER BY name")).rows, ctx);
  });

  app.post('/api/frontend-mcp/components/:id/install', async (req, reply) => {
    const ctx = req.bridge;
    const applicationId = req.body?.applicationId;
    if (!applicationId) throw fail('VALIDATION', 'applicationId required', 400);
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'frontend.component.install', permission: 'frontend.component.install',
      handler: async ({ tenantId }) => {
        if (!await tenantApp(pool, tenantId, applicationId)) throw fail('NOT_FOUND', 'application not found', 404);
        const component = (await pool.query("SELECT * FROM frontend_components WHERE id=$1 AND status='APPROVED'", [req.params.id])).rows[0];
        if (!component) throw fail('NOT_FOUND', 'approved component not found', 404);
        const installation = (await pool.query(
          `INSERT INTO frontend_installations(tenant_id,application_id,component_id,configuration,state,installed_by)
           VALUES($1,$2,$3,$4,'READY',$5) RETURNING *`,
          [tenantId, applicationId, component.id, JSON.stringify(req.body?.configuration || {}), ctx.actor.id]
        )).rows[0];
        await audit(pool, ctx, 'frontend.component.install', 'frontend_installation', installation.id, { componentId: component.id, applicationId });
        return installation;
      }
    });
    return reply.code(201).send(ok(result, ctx));
  });

  app.get('/api/frontend-mcp/installations', async (req) => {
    const ctx = req.bridge; const tenantId = requireTenant(ctx); authorize(ctx, 'frontend.component.read');
    const rows = (await pool.query(
      `SELECT fi.*, c.name AS component_name, c.component_key, ft.name AS template_name, a.name AS application_name
       FROM frontend_installations fi LEFT JOIN frontend_components c ON c.id=fi.component_id
       LEFT JOIN frontend_templates ft ON ft.id=fi.template_id JOIN apps a ON a.id=fi.application_id
       WHERE fi.tenant_id=$1 AND fi.state <> 'REMOVED' ORDER BY fi.installed_at DESC`, [tenantId]
    )).rows;
    return ok(rows, ctx);
  });

  app.post('/api/frontend-mcp/tools/call', async (req) => {
    const ctx = req.bridge; const tenantId = requireTenant(ctx);
    const { providerId = 'threeui-community', toolName, params = {} } = req.body || {};
    if (!FRONTEND_TOOLS.has(toolName)) throw fail('TOOL_NOT_ALLOWED', 'frontend tool is not registered', 403);
    const required = toolName.includes('install') ? 'frontend.component.install' : toolName.includes('preview') ? 'frontend.preview.create' : 'frontend.component.read';
    return ok(await executeCapability(pool, ctx, {
      capabilityId: required, permission: required,
      handler: async () => {
        const provider = (await pool.query("SELECT id FROM frontend_mcp_providers WHERE id=$1 AND status='active'", [providerId])).rows[0];
        if (!provider) throw fail('NOT_FOUND', 'active provider not found', 404);
        const request = { providerId, toolName, tenantId, params: { ...params, tenantId } };
        await enqueueOutbox(pool, { tenantId, subject: 'frontend.mcp.requested', payload: request });
        await audit(pool, ctx, 'frontend.mcp.tool.requested', 'frontend_mcp', providerId, { toolName });
        return { state: 'REQUESTED', request };
      }
    }), ctx);
  });

  app.get('/api/agents/definitions', async (req) => {
    const ctx = req.bridge; authorize(ctx, 'agent.read');
    return ok((await pool.query("SELECT * FROM agent_definitions WHERE status='READY' ORDER BY name")).rows, ctx);
  });
  app.get('/api/agents/skills', async (req) => {
    const ctx = req.bridge; authorize(ctx, 'skill.read');
    return ok((await pool.query('SELECT * FROM agent_skills ORDER BY name')).rows, ctx);
  });
  app.post('/api/agents/instances/:id/execute', async (req, reply) => {
    const ctx = req.bridge; const goal = String(req.body?.prompt || '').trim();
    if (!goal) throw fail('VALIDATION', 'prompt required', 400);
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'agent.execute', permission: 'agent.execute', entitlementKey: 'ai_executions',
      handler: async ({ tenantId }) => {
        const instance = (await pool.query(
          "SELECT ai.*, ad.agent_key AS definition_key, ad.status AS definition_status FROM agent_instances ai LEFT JOIN agent_definitions ad ON ad.id=ai.agent_definition_id WHERE ai.id=$1 AND ai.tenant_id=$2 AND ai.enabled=true AND ai.lifecycle_state='READY'", [req.params.id, tenantId]
        )).rows[0];
        if (!instance || instance.definition_status === 'DISABLED') throw fail('AGENT_UNAVAILABLE', 'agent is not available', 409);
        const execution = (await pool.query(
          `INSERT INTO agent_executions(tenant_id,agent_instance_id,application_id,actor_id,prompt,goal,status,approval_level,approval_status,correlation_id,trace_id)
           VALUES($1,$2,$3,$4,$5,$5,'queued','CONFIRM','pending',$6,$7) RETURNING *`,
          [tenantId, instance.id, req.body?.applicationId || null, ctx.actor.id, goal, ctx.correlationId, ctx.traceId]
        )).rows[0];
        await enqueueOutbox(pool, { tenantId, subject: 'agent.execution.requested', payload: { executionId: execution.id, agentInstanceId: instance.id, tenantId, goal, correlationId: ctx.correlationId, traceId: ctx.traceId } });
        await bumpUsage(pool, tenantId, 'ai_executions', 1);
        await audit(pool, ctx, 'agent.execution.requested', 'agent_execution', execution.id, { agentInstanceId: instance.id });
        return execution;
      }
    });
    return reply.code(202).send(ok(result, ctx));
  });

  app.get('/api/dashboard/apps', async (req) => {
    const ctx = req.bridge; const tenantId = requireTenant(ctx); authorize(ctx, 'app.read');
    return ok((await pool.query(
      `SELECT a.*, COALESCE(p.pinned,false) AS pinned, COALESCE(p.sort_order,0) AS sort_order
       FROM apps a LEFT JOIN tenant_dashboard_preferences p ON p.application_id=a.id AND p.tenant_id=a.tenant_id AND p.actor_id=$2
       WHERE a.tenant_id=$1 ORDER BY COALESCE(p.pinned,false) DESC, COALESCE(p.sort_order,0), a.name`, [tenantId, ctx.actor.id]
    )).rows, ctx);
  });
  app.post('/api/dashboard/apps/:id/preference', async (req) => {
    const ctx = req.bridge; const tenantId = requireTenant(ctx); authorize(ctx, 'app.read');
    if (!await tenantApp(pool, tenantId, req.params.id)) throw fail('NOT_FOUND', 'application not found', 404);
    const pinned = Boolean(req.body?.pinned); const sortOrder = Number(req.body?.sortOrder || 0);
    const row = (await pool.query(
      `INSERT INTO tenant_dashboard_preferences(tenant_id,actor_id,application_id,pinned,sort_order)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id,actor_id,application_id)
       DO UPDATE SET pinned=EXCLUDED.pinned,sort_order=EXCLUDED.sort_order,updated_at=now() RETURNING *`,
      [tenantId, ctx.actor.id, req.params.id, pinned, sortOrder]
    )).rows[0];
    await audit(pool, ctx, 'dashboard.app.preference', 'application', req.params.id, { pinned, sortOrder });
    return ok(row, ctx);
  });
}
