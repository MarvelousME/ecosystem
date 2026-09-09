/**
 * Transactional outbox relay — publish unpublished rows to NATS, mark published_at.
 */
export function startOutboxRelay({ pool, publish, intervalMs = 1500, batchSize = 50, onPublished } = {}) {
  let stopped = false;
  let timer;

  async function tick() {
    if (stopped) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT id, event_id, tenant_id, subject, payload
         FROM outbox
         WHERE published_at IS NULL
         ORDER BY id
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [batchSize]
      );
      for (const row of rows) {
        const body = {
          ...(row.payload || {}),
          eventId: row.event_id,
          tenantId: row.tenant_id ?? row.payload?.tenantId,
          outboxId: row.id
        };
        await publish(row.subject, body);
        await client.query(`UPDATE outbox SET published_at=now() WHERE id=$1`, [row.id]);
        if (onPublished) await onPublished(row, body);
      }
      await client.query('COMMIT');
    } catch (e) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      console.error('outbox relay error', e.message);
    } finally {
      client.release();
      if (!stopped) timer = setTimeout(tick, intervalMs);
    }
  }

  timer = setTimeout(tick, intervalMs);
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
    }
  };
}

/** Insert outbox row only — relay publishes asynchronously. */
export async function enqueueOutbox(pool, { tenantId, subject, payload }) {
  const r = await pool.query(
    `INSERT INTO outbox(tenant_id,subject,payload) VALUES($1,$2,$3) RETURNING id, event_id`,
    [tenantId, subject, payload]
  );
  return r.rows[0];
}
