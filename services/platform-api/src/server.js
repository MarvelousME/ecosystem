import Fastify from 'fastify';
import cors from '@fastify/cors';
import crypto from 'node:crypto';
import { createPool, buildContext, ok, fail, audit, requireTenant, authorizeTenantAccess } from './lib/kernel.js';
import { authorize, permissionsFor } from './lib/rbac.js';
import { resolveIdentity, headersUntrusted } from './lib/auth.js';
import { getRedis, rateLimit, redisPing } from './lib/redis.js';
import { clickhouseEnabled } from './lib/clickhouse.js';
import { enqueueOutbox } from './lib/outbox.js';
import { ensureGapSchema } from './lib/migrate.js';
import {
  assertSecretsProductionPolicy,
  secretsHealth,
  resolveSecretsProviderName
} from './lib/secrets.js';
import { registerDomainRoutes } from './routes/domains.js';

assertSecretsProductionPolicy();

const app = Fastify({ logger: true, bodyLimit: 32 * 1024 * 1024 });

const corsOrigins = (process.env.BRIDGE_CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
await app.register(cors, {
  origin: corsOrigins.length
    ? (origin, cb) => {
        if (!origin || corsOrigins.includes(origin)) cb(null, true);
        else cb(fail('CORS', 'origin not allowed', 403), false);
      }
    : true,
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-ID', 'X-Correlation-ID', 'X-Trace-ID', 'X-Tenant-Id', 'X-Bridge-Envelope', 'X-Actor-Id', 'X-Actor-Roles', 'X-Actor-Email', 'X-Impersonate-Tenant', 'X-Impersonate-Reason']
});

const pool = createPool();
await ensureGapSchema(pool);
await getRedis();

// Production invariant: API must NOT connect/publish to NATS for domain events.
const transitions = {
  installed: { start: 'running', uninstall: 'not_installed' },
  running: { pause: 'paused', stop: 'stopped', update: 'updating', disable: 'disabled' },
  paused: { resume: 'running', stop: 'stopped' },
  stopped: { start: 'running', update: 'updating', uninstall: 'not_installed' },
  updating: { complete_update: 'running', rollback: 'running' },
  disabled: { start: 'running', uninstall: 'not_installed' },
  failed: { repair: 'stopped' }
};

app.addHook('onRequest', async (req, reply) => {
  const rlKey = `${req.ip}:${req.routerPath || req.url}`;
  const rl = await rateLimit(rlKey, {
    limit: Number(process.env.BRIDGE_RATE_LIMIT || 300),
    windowSec: 60
  });
  if (!rl.allowed) {
    reply.header('retry-after', String(rl.retryAfterSec || 60));
    throw fail('RATE_LIMITED', 'too many requests', 429);
  }

  req.user = await resolveIdentity(req);
  req.bridge = buildContext(req);
  await authorizeTenantAccess(pool, req.bridge);
  req.bridge.permissions = permissionsFor(req.bridge.actor.roles);
});

app.setErrorHandler((err, req, reply) => {
  const status = err.statusCode || 500;
  req.log.error({ err }, err.message);
  reply.code(status).send({
    error: {
      code: err.code || 'INTERNAL',
      message: err.message,
      requestId: req.bridge?.requestId
    }
  });
});

app.get('/health', async () => {
  const r = await pool.query('select 1 ok');
  const redis = await redisPing();
  const secrets = await secretsHealth();
  const ready =
    r.rows[0].ok === 1 &&
    !(process.env.NODE_ENV === 'production' && resolveSecretsProviderName() === 'aws-kms' && secrets.status !== 'ready');
  return {
    status: ready ? 'healthy' : 'unhealthy',
    service: 'bridge-platform-api',
    redis,
    clickhouseConfigured: clickhouseEnabled(),
    jwtRequired: process.env.BRIDGE_REQUIRE_JWT === '1' || process.env.NODE_ENV === 'production',
    headersTrusted: !headersUntrusted(),
    secrets,
    natsPublish: false,
    outboxOnly: true
  };
});

app.get('/metrics', async (_, reply) => {
  const tenants = (await pool.query('SELECT COUNT(*)::int c FROM tenants')).rows[0].c;
  const apps = (await pool.query('SELECT COUNT(*)::int c FROM apps')).rows[0].c;
  const pendingOutbox = (await pool.query('SELECT COUNT(*)::int c FROM outbox WHERE published_at IS NULL')).rows[0].c;
  reply.type('text/plain');
  return `bridge_api_up 1\nbridge_tenants ${tenants}\nbridge_apps ${apps}\nbridge_outbox_pending ${pendingOutbox}\n`;
});

function wantsEnvelope(req) {
  return String(req.headers['x-bridge-envelope'] || '') === '1' || String(req.query.envelope || '') === '1';
}
function sendCompat(req, reply, payload, code = 200) {
  if (wantsEnvelope(req)) return reply.code(code).send(ok(payload, req.bridge));
  return reply.code(code).send(payload);
}

registerDomainRoutes(app, { pool });

app.get('/api/resources', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'app.read');
  const rows = (await pool.query('SELECT * FROM managed_resources WHERE tenant_id=$1 ORDER BY kind,name', [t])).rows;
  return sendCompat(req, reply, rows.map((x) => ({ ...x, availableActions: Object.keys(transitions[x.state] || {}) })));
});
app.post('/api/resources', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'app.manage');
  const { kind, key, name, version = '1.0.0' } = req.body || {};
  const r = await pool.query(
    'INSERT INTO managed_resources(tenant_id,kind,resource_key,name,version) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [t, kind, key, name, version]
  );
  await audit(pool, ctx, 'resource.create', 'managed_resource', r.rows[0].id);
  return sendCompat(req, reply, r.rows[0], 201);
});
app.post('/api/resources/:id/lifecycle', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'app.manage');
  const row = (await pool.query('SELECT * FROM managed_resources WHERE id=$1 AND tenant_id=$2', [req.params.id, t])).rows[0];
  if (!row) throw fail('NOT_FOUND', 'resource not found', 404);
  const action = req.body?.action;
  const next = transitions[row.state]?.[action];
  if (!next) throw fail('CONFLICT', `illegal transition ${action} from ${row.state}`, 409);
  const r = (await pool.query('UPDATE managed_resources SET state=$1 WHERE id=$2 RETURNING *', [next, row.id])).rows[0];
  await audit(pool, ctx, `resource.${action}`, 'managed_resource', row.id, { from: row.state, to: next });
  return sendCompat(req, reply, { ...r, availableActions: Object.keys(transitions[next] || {}) });
});

app.get('/api/affiliates', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'affiliate.manage');
  return sendCompat(req, reply, (await pool.query('SELECT * FROM affiliates WHERE tenant_id=$1 ORDER BY created_at DESC', [t])).rows);
});
app.post('/api/affiliates', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'affiliate.manage');
  const { name, email, commissionRate = 0.1 } = req.body || {};
  const code = crypto.randomBytes(9).toString('base64url');
  const r = (await pool.query(
    'INSERT INTO affiliates(tenant_id,code,name,email,commission_rate) VALUES($1,$2,$3,$4,$5) RETURNING *',
    [t, code, name, email, commissionRate]
  )).rows[0];
  await audit(pool, ctx, 'affiliate.create', 'affiliate', r.id);
  return sendCompat(req, reply, r, 201);
});
app.post('/api/conversions', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'affiliate.manage');
  const { affiliateId, externalKey, amount } = req.body || {};
  const a = (await pool.query(`SELECT * FROM affiliates WHERE id=$1 AND tenant_id=$2 AND status='active'`, [affiliateId, t])).rows[0];
  if (!a) throw fail('NOT_FOUND', 'affiliate not found', 404);
  const commission = Number(amount) * Number(a.commission_rate);
  const r = (await pool.query(
    `INSERT INTO conversions(tenant_id,affiliate_id,external_key,amount,commission)
     VALUES($1,$2,$3,$4,$5)
     ON CONFLICT(tenant_id,external_key) DO UPDATE SET external_key=excluded.external_key
     RETURNING *`,
    [t, affiliateId, externalKey, amount, commission]
  )).rows[0];
  await audit(pool, ctx, 'conversion.record', 'conversion', r.id);
  return sendCompat(req, reply, r, 201);
});

app.get('/api/security/rules', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'security.manage');
  return sendCompat(req, reply, (await pool.query('SELECT * FROM security_rules WHERE tenant_id=$1 ORDER BY created_at DESC', [t])).rows);
});
app.post('/api/security/rules', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'security.manage');
  const { action, target, reason, expiresAt = null, provider = 'bridge' } = req.body || {};
  if (!['BLOCK', 'ALLOW', 'CHALLENGE', 'OBSERVE'].includes(action)) throw fail('VALIDATION', 'invalid action');
  const r = (await pool.query(
    'INSERT INTO security_rules(tenant_id,action,target,reason,expires_at,provider) VALUES($1,$2,$3,$4,$5,$6) RETURNING *',
    [t, action, target, reason, expiresAt, provider]
  )).rows[0];
  await audit(pool, ctx, 'security.rule.create', 'security_rule', r.id);
  return sendCompat(req, reply, r, 201);
});

app.post('/api/provision', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'app.create');
  const input = req.body || {};
  const r = (
    await pool.query(`INSERT INTO sagas(tenant_id,saga_type,state,input) VALUES($1,'app.provision','pending',$2) RETURNING *`, [
      t,
      input
    ])
  ).rows[0];
  await enqueueOutbox(pool, {
    tenantId: t,
    subject: 'provision.requested',
    payload: { sagaId: r.id, tenantId: t, input, correlationId: ctx.correlationId, traceId: ctx.traceId }
  });
  await audit(pool, ctx, 'provision.request', 'saga', r.id);
  return sendCompat(req, reply, r, 202);
});

app.get('/api/sagas/:id', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'app.read');
  const saga = (await pool.query('SELECT * FROM sagas WHERE id=$1 AND tenant_id=$2', [req.params.id, t])).rows[0];
  if (!saga) throw fail('NOT_FOUND', 'saga not found', 404);
  const steps = (await pool.query('SELECT * FROM saga_steps WHERE saga_id=$1 ORDER BY id', [saga.id])).rows;
  return sendCompat(req, reply, { ...saga, steps });
});

app.post('/api/ai/chat', async (req, reply) => {
  const ctx = req.bridge;
  authorize(ctx, 'ai.chat.use');
  const base = (process.env.BRIDGE_AI_BASE_URL || '').replace(/\/$/, '');
  const model = process.env.BRIDGE_AI_MODEL || '';
  if (!base || !model) return reply.code(503).send({ error: 'AI provider not configured' });
  const messages = req.body?.messages;
  if (!Array.isArray(messages) || !messages.length) throw fail('VALIDATION', 'messages required');
  const headers = { 'content-type': 'application/json' };
  if (process.env.BRIDGE_AI_API_KEY) headers.authorization = `Bearer ${process.env.BRIDGE_AI_API_KEY}`;
  const r = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model, messages, temperature: 0.2 })
  });
  const j = await r.json();
  if (!r.ok) return reply.code(502).send({ error: j?.error?.message || `AI HTTP ${r.status}` });
  await audit(pool, ctx, 'ai.chat', 'ai', null, { model });
  return sendCompat(req, reply, { content: j?.choices?.[0]?.message?.content || '', model });
});

app.post('/api/cloudflare/purge', async (req, reply) => {
  const ctx = req.bridge;
  authorize(ctx, 'security.manage');
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ZONE_ID) {
    return reply.code(503).send({ error: 'Cloudflare provider not configured' });
  }
  const r = await fetch(`https://api.cloudflare.com/client/v4/zones/${process.env.CLOUDFLARE_ZONE_ID}/purge_cache`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ purge_everything: true })
  });
  const j = await r.json();
  if (!r.ok || j.success !== true) return reply.code(502).send({ error: j.errors || j });
  await audit(pool, ctx, 'cloudflare.purge', 'provider', 'cloudflare');
  return sendCompat(req, reply, j);
});

app.get('/api/audit', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'tenant.read');
  return sendCompat(
    req,
    reply,
    (await pool.query('SELECT * FROM audit_log WHERE tenant_id=$1 ORDER BY id DESC LIMIT 250', [t])).rows
  );
});

app.get('/api/isolation/check', async (req, reply) => {
  const ctx = req.bridge;
  const t = requireTenant(ctx);
  authorize(ctx, 'tenant.read');
  const foreign = req.query.foreignTenantId;
  if (!foreign) throw fail('VALIDATION', 'foreignTenantId required');
  const leaked = (
    await pool.query('SELECT id FROM apps WHERE tenant_id=$1 AND id IN (SELECT id FROM apps WHERE tenant_id=$2)', [foreign, t])
  ).rows;
  const foreignApps = (await pool.query('SELECT * FROM apps WHERE tenant_id=$1', [t])).rows.filter((a) => a.tenant_id === foreign);
  return sendCompat(req, reply, {
    tenantId: t,
    foreignTenantId: foreign,
    leakedCount: foreignApps.length,
    isolated: foreignApps.length === 0 && leaked.length === 0
  });
});

await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT || 4000) });
