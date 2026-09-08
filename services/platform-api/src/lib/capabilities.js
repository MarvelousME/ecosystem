import { fail, audit, requireTenant } from './kernel.js';
import { authorize } from './rbac.js';

const APPROVAL_RANK = { AUTO: 0, CONFIRM: 1, ADMIN_APPROVAL: 2, FORBIDDEN: 3 };

export async function loadCapability(pool, capabilityId) {
  const r = await pool.query('SELECT * FROM capabilities WHERE id=$1', [capabilityId]);
  if (!r.rows[0]) throw fail('CAPABILITY_UNKNOWN', `unknown capability ${capabilityId}`, 404);
  return r.rows[0];
}

export async function checkEntitlement(pool, tenantId, key, increment = 0) {
  const r = await pool.query('SELECT limits, usage FROM entitlements WHERE tenant_id=$1', [tenantId]);
  if (!r.rows[0]) return true; // no entitlements row = unrestricted lab mode
  const limits = r.rows[0].limits || {};
  const usage = r.rows[0].usage || {};
  if (limits[key] == null) return true;
  if ((usage[key] || 0) + increment > limits[key]) {
    throw fail('ENTITLEMENT_EXCEEDED', `entitlement exceeded for ${key}`, 402, { key, limit: limits[key], usage: usage[key] || 0 });
  }
  return true;
}

export async function bumpUsage(pool, tenantId, key, by = 1) {
  await pool.query(
    `UPDATE entitlements SET usage = jsonb_set(COALESCE(usage,'{}'::jsonb), ARRAY[$2],
      to_jsonb(COALESCE((usage->>$2)::int,0) + $3)), updated_at=now()
     WHERE tenant_id=$1`,
    [tenantId, key, by]
  );
}

/**
 * Capability execution path:
 * Actor → Tenant → Entitlement → RBAC → Capability → Provider → Audit
 */
export async function executeCapability(pool, ctx, {
  capabilityId,
  permission,
  entitlementKey = null,
  approvalOverride = null,
  handler
}) {
  const tenantId = requireTenant(ctx);
  authorize(ctx, permission);
  const cap = await loadCapability(pool, capabilityId);
  const level = approvalOverride || cap.approval_default || 'AUTO';
  if (level === 'FORBIDDEN') throw fail('FORBIDDEN_CAPABILITY', `${capabilityId} is forbidden`, 403);
  if (entitlementKey) await checkEntitlement(pool, tenantId, entitlementKey, 0);

  if (APPROVAL_RANK[level] >= APPROVAL_RANK.CONFIRM && ctx.headersApproval !== 'granted') {
    // caller may pass approvedExecutionId after human approval
    if (!ctx.approvedCapability) {
      const pending = {
        requiresApproval: true,
        approvalLevel: level,
        capabilityId,
        tenantId,
        actorId: ctx.actor.id,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId
      };
      await audit(pool, ctx, `capability.pending:${capabilityId}`, 'capability', capabilityId, pending);
      return pending;
    }
  }

  const result = await handler({ tenantId, capability: cap, level });
  await audit(pool, ctx, `capability.execute:${capabilityId}`, 'capability', capabilityId, {
    approvalLevel: level,
    resultSummary: result?.summary || null
  });
  return result;
}
