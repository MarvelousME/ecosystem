/**
 * ClickHouse analytics sink — never SoR for tenancy.
 * Soft-fails when CLICKHOUSE_URL is unset or unreachable.
 */

export function clickhouseEnabled() {
  return Boolean(process.env.CLICKHOUSE_URL);
}

export async function writeEvent({ tenantId, subject, eventId, payload }) {
  const base = (process.env.CLICKHOUSE_URL || '').replace(/\/$/, '');
  if (!base) return { written: false, reason: 'not_configured' };

  const row = {
    timestamp: Date.now(),
    tenant_id: tenantId == null ? '' : String(tenantId),
    subject: subject || 'unknown',
    event_id: eventId || cryptoRandomUuid(),
    payload: typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
  };

  try {
    const auth = process.env.CLICKHOUSE_USER
      ? Buffer.from(`${process.env.CLICKHOUSE_USER}:${process.env.CLICKHOUSE_PASSWORD || ''}`).toString('base64')
      : null;
    const headers = { 'content-type': 'application/json' };
    if (auth) headers.authorization = `Basic ${auth}`;

    const r = await fetch(`${base}/?query=${encodeURIComponent('INSERT INTO bridge_events FORMAT JSONEachRow')}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return { written: false, reason: `http_${r.status}`, detail: text.slice(0, 200) };
    }
    return { written: true };
  } catch (e) {
    return { written: false, reason: String(e.message || e) };
  }
}

export async function writeAuditSink(ctx, action, resourceType, resourceId, metadata = {}) {
  return writeEvent({
    tenantId: ctx?.tenantId,
    subject: `audit.${action}`,
    eventId: ctx?.requestId,
    payload: { action, resourceType, resourceId, metadata, actor: ctx?.actor?.id }
  });
}

function cryptoRandomUuid() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
