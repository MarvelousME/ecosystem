import { ok, fail, audit, requireTenant } from '../lib/kernel.js';
import { authorize } from '../lib/rbac.js';
import { executeCapability } from '../lib/capabilities.js';

export function registerFrontendMcpRoutes(app, { pool }) {
  // --- Frontend MCP Providers ---
  app.get('/api/frontend-mcp/providers', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'frontend.mcp.use');
    const providers = (await pool.query(
      'SELECT * FROM frontend_mcp_providers WHERE status=$1',
      ['active']
    )).rows;
    return ok(providers, ctx);
  });

  app.get('/api/frontend-mcp/providers/:id/health', async (req) => {
    const ctx = req.bridge;
    authorize(ctx, 'frontend.mcp.use');
    const provider = (await pool.query(
      'SELECT * FROM frontend_mcp_providers WHERE id=$1 AND status=$2',
      [req.params.id, 'active']
    )).rows[0];
    if (!provider) throw fail('NOT_FOUND', 'provider not found', 404);
    
    // Check health if health_url is configured
    if (provider.health_url) {
      try {
        const response = await fetch(provider.health_url);
        const healthData = await response.json();
        return ok({ ...provider, health: healthData }, ctx);
      } catch (e) {
        return ok({ ...provider, health: { status: 'unhealthy', error: String(e) } }, ctx);
      }
    }
    
    return ok({ ...provider, health: { status: 'unknown' } }, ctx);
  });

  // --- Frontend MCP Requests ---
  app.post('/api/frontend-mcp/request', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    const { providerId, toolName, params } = req.body || {};
    
    if (!providerId || !toolName) {
      throw fail('VALIDATION', 'providerId and toolName required', 400);
    }
    
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'frontend.mcp.use',
      permission: 'frontend.mcp.use',
      handler: async ({ tenantId }) => {
        // Get provider
        const provider = (await pool.query(
          'SELECT * FROM frontend_mcp_providers WHERE id=$1 AND status=$2',
          [providerId, 'active']
        )).rows[0];
        if (!provider) throw fail('NOT_FOUND', 'provider not found', 404);
        
        // Check if approval is required
        const approvalRequired = provider.config?.approvalRequired || false;
        
        if (approvalRequired) {
          // Create approval record
          const approval = await pool.query(
            `INSERT INTO frontend_mcp_approvals(tenant_id,request_type,payload,approval_level,approval_status)
             VALUES($1,$2,$3,'CONFIRM','pending') RETURNING *`,
            [tenantId, toolName, JSON.stringify({ providerId, toolName, params })]
          );
          
          await audit(pool, ctx, 'frontend.mcp.request.pending', 'frontend_mcp_approval', approval.rows[0].id);
          
          return {
            requiresApproval: true,
            approvalId: approval.rows[0].id,
            message: 'Frontend MCP request requires approval'
          };
        }
        
        // Execute the MCP tool directly
        try {
          // For now, we'll call the existing frontend-mcp service
          // In production, this would be more sophisticated
          const mcpUrl = provider.config?.url || 'http://localhost:3100/mcp';
          const mcpKey = process.env.BRIDGE_MCP_KEY || '';
          
          const response = await fetch(mcpUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-bridge-mcp-key': mcpKey
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: params || {}
              }
            })
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw fail('MCP_ERROR', data.error?.message || 'MCP request failed', 502);
          }
          
          await audit(pool, ctx, 'frontend.mcp.request.execute', 'frontend_mcp', null, {
            providerId,
            toolName,
            success: true
          });
          
          return {
            requiresApproval: false,
            result: data.result
          };
        } catch (e) {
          await audit(pool, ctx, 'frontend.mcp.request.error', 'frontend_mcp', null, {
            providerId,
            toolName,
            error: String(e)
          });
          throw e;
        }
      }
    });
    
    return ok(result, ctx);
  });

  // --- Approvals ---
  app.get('/api/frontend-mcp/approvals', async (req) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'frontend.mcp.publish');
    const approvals = (await pool.query(
      `SELECT * FROM frontend_mcp_approvals WHERE tenant_id=$1 AND approval_status=$2 ORDER BY created_at DESC`,
      [t, 'pending']
    )).rows;
    return ok(approvals, ctx);
  });

  app.post('/api/frontend-mcp/approvals/:id/approve', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    
    const result = await executeCapability(pool, ctx, {
      capabilityId: 'frontend.mcp.publish',
      permission: 'frontend.mcp.publish',
      handler: async ({ tenantId }) => {
        const approval = (await pool.query(
          'SELECT * FROM frontend_mcp_approvals WHERE id=$1 AND tenant_id=$2',
          [req.params.id, tenantId]
        )).rows[0];
        if (!approval) throw fail('NOT_FOUND', 'approval not found', 404);
        if (approval.approval_status !== 'pending') {
          throw fail('CONFLICT', 'approval already processed', 409);
        }
        
        // Update approval
        await pool.query(
          `UPDATE frontend_mcp_approvals 
           SET approval_status='approved', approved_by=$2, approved_at=now() 
           WHERE id=$1`,
          [req.params.id, ctx.actor.id]
        );
        
        // Execute the pending MCP request
        const payload = approval.payload || {};
        const providerId = payload.providerId;
        const toolName = payload.request_type;
        const params = payload.params;
        
        try {
          const provider = (await pool.query(
            'SELECT * FROM frontend_mcp_providers WHERE id=$1',
            [providerId]
          )).rows[0];
          
          const mcpUrl = provider?.config?.url || 'http://localhost:3100/mcp';
          const mcpKey = process.env.BRIDGE_MCP_KEY || '';
          
          const response = await fetch(mcpUrl, {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-bridge-mcp-key': mcpKey
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'tools/call',
              params: {
                name: toolName,
                arguments: params || {}
              }
            })
          });
          
          const data = await response.json();
          
          if (!response.ok) {
            throw fail('MCP_ERROR', data.error?.message || 'MCP request failed', 502);
          }
          
          await audit(pool, ctx, 'frontend.mcp.approval.execute', 'frontend_mcp_approval', req.params.id, {
            approvedBy: ctx.actor.id,
            success: true
          });
          
          return {
            approved: true,
            result: data.result
          };
        } catch (e) {
          // Mark approval as failed
          await pool.query(
            `UPDATE frontend_mcp_approvals SET approval_status='failed' WHERE id=$1`,
            [req.params.id]
          );
          
          await audit(pool, ctx, 'frontend.mcp.approval.error', 'frontend_mcp_approval', req.params.id, {
            approvedBy: ctx.actor.id,
            error: String(e)
          });
          
          throw e;
        }
      }
    });
    
    return ok(result, ctx);
  });

  app.post('/api/frontend-mcp/approvals/:id/reject', async (req, reply) => {
    const ctx = req.bridge;
    const t = requireTenant(ctx);
    authorize(ctx, 'frontend.mcp.publish');
    
    const approval = (await pool.query(
      'SELECT * FROM frontend_mcp_approvals WHERE id=$1 AND tenant_id=$2',
      [req.params.id, t]
    )).rows[0];
    if (!approval) throw fail('NOT_FOUND', 'approval not found', 404);
    if (approval.approval_status !== 'pending') {
      throw fail('CONFLICT', 'approval already processed', 409);
    }
    
    await pool.query(
      `UPDATE frontend_mcp_approvals 
       SET approval_status='rejected', approved_by=$2, approved_at=now() 
       WHERE id=$1`,
      [req.params.id, ctx.actor.id]
    );
    
    await audit(pool, ctx, 'frontend.mcp.approval.reject', 'frontend_mcp_approval', req.params.id);
    
    return ok({ success: true }, ctx);
  });
}
