import { ok, fail, audit, requireTenant } from '../lib/kernel.js';
import { authorize } from '../lib/rbac.js';
import { executeCapability } from '../lib/capabilities.js';

export function registerAgentRoutes(app, { pool }) {
  // --- Agent Templates ---
  app.get('/api/agents/templates', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'agent.template.read');
    const templates = (await pool.query(
      'SELECT * FROM agent_templates WHERE status=$1 ORDER BY category, name',
      ['active']
    )).rows;
    return ok(templates, ctx);
  });

  app.get('/api/agents/templates/:key', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'agent.template.read');
    const template = (await pool.query(
      'SELECT * FROM agent_templates WHERE template_key=$1 AND status=$2',
      [req.params.key, 'active']
    )).rows[0];
    if (!template) throw fail('NOT_FOUND', 'template not found', 404);
    return ok(template, ctx);
  });

  // --- Agent Instances ---
  app.post('/api/agents/instantiate', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    const { templateKey, agentKey, name, description, config } = req.body || {};
    
    if (!templateKey || !agentKey || !name) {
      throw fail('VALIDATION', 'templateKey, agentKey, and name required', 400);
    }
    
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'agent.template.instantiate',
      permission: 'agent.template.instantiate',
      handler: async ({ tenantId }) => {
        // Get template
        const template = (await pool.query(
          'SELECT * FROM agent_templates WHERE template_key=$1 AND status=$2',
          [templateKey, 'active']
        )).rows[0];
        if (!template) throw fail('NOT_FOUND', 'template not found', 404);
        
        // Check if agent_key already exists for tenant
        const existing = (await pool.query(
          'SELECT id FROM agent_instances WHERE tenant_id=$1 AND agent_key=$2',
          [tenantId, agentKey]
        )).rows[0];
        if (existing) throw fail('CONFLICT', 'agent_key already exists for this tenant', 409);
        
        // Create agent instance
        const r = await pool.query(
          `INSERT INTO agent_instances(tenant_id,agent_key,name,description,template_id,skills,capabilities,model,status,config)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,'active',$9) RETURNING *`,
          [
            tenantId,
            agentKey,
            name,
            description || template.description,
            template.id,
            JSON.stringify(template.skills || []),
            JSON.stringify(template.capabilities || []),
            template.model,
            JSON.stringify(config || {})
          ]
        );
        
        await audit(pool, ctx, 'agent.instance.create', 'agent_instance', r.rows[0].id);
        return r.rows[0];
      }
    });
    
    return reply.code(201).send(ok(result, ctx));
  });

  app.get('/api/agents/instances', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'agent.instance.manage');
    const instances = (await pool.query(
      `SELECT ai.*, at.template_key, at.name as template_name
       FROM agent_instances ai
       LEFT JOIN agent_templates at ON ai.template_id = at.id
       WHERE ai.tenant_id=$1 ORDER BY ai.created_at DESC`,
      [t]
    )).rows;
    return ok(instances, ctx);
  });

  app.get('/api/agents/instances/:id', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'agent.instance.manage');
    const instance = (await pool.query(
      `SELECT ai.*, at.template_key, at.name as template_name
       FROM agent_instances ai
       LEFT JOIN agent_templates at ON ai.template_id = at.id
       WHERE ai.id=$1 AND ai.tenant_id=$2`,
      [req.params.id, t]
    )).rows[0];
    if (!instance) throw fail('NOT_FOUND', 'agent instance not found', 404);
    
    // Get recent executions
    const executions = (await pool.query(
      `SELECT * FROM agent_executions WHERE agent_id=$1 ORDER BY created_at DESC LIMIT 10`,
      [instance.id]
    )).rows;
    
    return ok({ ...instance, executions }, ctx);
  });

  app.post('/api/agents/instances/:id/configure', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'agent.instance.manage');
    const { config, name, description } = req.body || {};
    
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (config !== undefined) {
      updates.push(`config=$${paramCount++}`);
      values.push(JSON.stringify(config));
    }
    if (name !== undefined) {
      updates.push(`name=$${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      updates.push(`description=$${paramCount++}`);
      values.push(description);
    }
    
    if (updates.length === 0) {
      throw fail('VALIDATION', 'at least one field to update required', 400);
    }
    
    values.push(req.params.id, t);
    updates.push(`updated_at=now()`);
    
    const r = await pool.query(
      `UPDATE agent_instances SET ${updates.join(', ')} WHERE id=$${paramCount++} AND tenant_id=$${paramCount++} RETURNING *`,
      values
    );
    
    if (!r.rows[0]) throw fail('NOT_FOUND', 'agent instance not found', 404);
    await audit(pool, ctx, 'agent.instance.configure', 'agent_instance', req.params.id);
    return ok(r.rows[0], ctx);
  });

  app.delete('/api/agents/instances/:id', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'agent.instance.manage');
    
    const r = await pool.query(
      'DELETE FROM agent_instances WHERE id=$1 AND tenant_id=$2 RETURNING id',
      [req.params.id, t]
    );
    
    if (!r.rows[0]) throw fail('NOT_FOUND', 'agent instance not found', 404);
    await audit(pool, ctx, 'agent.instance.delete', 'agent_instance', req.params.id);
    return reply.code(204).send();
  });
}
