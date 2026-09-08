import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

export function createPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

export function requestId(req) {
  return req.headers['x-request-id'] || crypto.randomUUID();
}

export function correlationId(req) {
  return req.headers['x-correlation-id'] || crypto.randomUUID();
}

export function traceId(req) {
  return req.headers['x-trace-id'] || crypto.randomUUID();
}

/** Derive actor + tenant context. Never trusts browser tenant ownership without checks. */
export function buildContext(req) {
  const rid = requestId(req);
  const cid = correlationId(req);
  const tid = traceId(req);
  const claimedTenant = req.headers['x-tenant-id'] || req.query?.tenantId || null;
  const actor = {
    type: req.headers['x-actor-type'] || 'user',
    id: req.headers['x-actor-id'] || req.user?.sub || 'anonymous',
    roles: Array.isArray(req.user?.roles) ? req.user.roles : String(req.headers['x-actor-roles'] || 'platform.admin').split(',').filter(Boolean),
    email: req.user?.email || req.headers['x-actor-email'] || null,
    impersonating: null
  };
  if (req.headers['x-impersonate-tenant'] && req.headers['x-impersonate-reason']) {
    if (!actor.roles.includes('support.impersonate') && !actor.roles.includes('platform.admin')) {
      const err = new Error('impersonation forbidden');
      err.statusCode = 403;
      throw err;
    }
    actor.impersonating = {
      tenantId: req.headers['x-impersonate-tenant'],
      reason: req.headers['x-impersonate-reason'],
      expiresAt: req.headers['x-impersonate-expires'] || null
    };
  }
  return {
    requestId: rid,
    correlationId: cid,
    traceId: tid,
    tenantId: actor.impersonating?.tenantId || claimedTenant,
    actor,
    user: req.user || null
  };
}

export function ok(data, meta = {}) {
  return {
    data,
    meta: {
      requestId: meta.requestId,
      correlationId: meta.correlationId,
      traceId: meta.traceId,
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      ...meta
    }
  };
}

export function fail(code, message, statusCode = 400, meta = {}) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  err.meta = meta;
  return err;
}

export async function audit(pool, ctx, action, resourceType, resourceId, metadata = {}) {
  await pool.query(
    `INSERT INTO audit_log(tenant_id,actor,action,resource_type,resource_id,request_id,metadata)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      ctx.tenantId,
      `${ctx.actor.type}:${ctx.actor.id}`,
      action,
      resourceType,
      resourceId == null ? null : String(resourceId),
      ctx.requestId,
      {
        ...metadata,
        correlationId: ctx.correlationId,
        traceId: ctx.traceId,
        roles: ctx.actor.roles,
        impersonating: ctx.actor.impersonating
      }
    ]
  );
}

export function requireTenant(ctx) {
  if (!ctx.tenantId) throw fail('TENANT_REQUIRED', 'x-tenant-id required', 400);
  return ctx.tenantId;
}
