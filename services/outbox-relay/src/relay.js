import pg from 'pg';
import { connect, StringCodec, headers as natsHeaders } from 'nats';

const { Pool } = pg;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const STREAM = process.env.BRIDGE_JS_STREAM || 'BRIDGE_EVENTS';
const SUBJECTS = (process.env.BRIDGE_JS_SUBJECTS || 'bridge.>,provision.>,billing.>,workflow.>,agent.>,audit.>')
  .split(',')
  .map((s) => s.trim());
const INTERVAL_MS = Number(process.env.OUTBOX_POLL_MS || 1000);
const BATCH = Number(process.env.OUTBOX_BATCH || 50);
const MAX_AGE_NS = Number(process.env.BRIDGE_JS_MAX_AGE_NS || 7 * 24 * 60 * 60 * 1e9);
const DUPE_WINDOW_NS = Number(process.env.BRIDGE_JS_DUPE_WINDOW_NS || 120 * 1e9);

const sc = StringCodec();

export async function ensureSchema(db = pool) {
  await db.query(`
    ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts int NOT NULL DEFAULT 0;
    ALTER TABLE outbox ADD COLUMN IF NOT EXISTS last_error text;
    ALTER TABLE outbox ADD COLUMN IF NOT EXISTS locked_at timestamptz;
    ALTER TABLE outbox ADD COLUMN IF NOT EXISTS message_id uuid;
    UPDATE outbox SET message_id = event_id WHERE message_id IS NULL;
  `);
}

export async function ensureStream(nc) {
  const jsm = await nc.jetstreamManager();
  try {
    await jsm.streams.info(STREAM);
  } catch {
    await jsm.streams.add({
      name: STREAM,
      subjects: SUBJECTS,
      storage: 'file',
      retention: 'limits',
      max_age: MAX_AGE_NS,
      duplicate_window: DUPE_WINDOW_NS,
      num_replicas: Number(process.env.BRIDGE_JS_REPLICAS || 1)
    });
    console.log('created stream', STREAM, SUBJECTS);
  }
}

export function normalizeSubject(subject) {
  if (
    subject.startsWith('provision.') ||
    subject.startsWith('bridge.') ||
    subject.startsWith('billing.') ||
    subject.startsWith('workflow.') ||
    subject.startsWith('agent.') ||
    subject.startsWith('audit.')
  ) {
    return subject;
  }
  return `bridge.${subject}`;
}

export async function publishOutboxRow(js, row) {
  const messageId = String(row.message_id || row.event_id);
  const subject = normalizeSubject(row.subject);
  const body = {
    ...(row.payload || {}),
    eventId: row.event_id,
    messageId,
    tenantId: row.tenant_id ?? row.payload?.tenantId,
    outboxId: row.id
  };
  const h = natsHeaders();
  h.set('Nats-Msg-Id', messageId);
  h.set('X-Outbox-Id', String(row.id));
  if (body.correlationId) h.set('X-Correlation-Id', String(body.correlationId));
  await js.publish(subject, sc.encode(JSON.stringify(body)), { msgID: messageId, headers: h });
  return { messageId, subject, body };
}

export async function tick(js, db = pool) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, event_id, message_id, tenant_id, subject, payload, attempts
       FROM outbox
       WHERE published_at IS NULL
       ORDER BY id
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH]
    );
    for (const row of rows) {
      try {
        await publishOutboxRow(js, row);
        await client.query(
          `UPDATE outbox SET published_at=now(), last_error=NULL, locked_at=NULL WHERE id=$1`,
          [row.id]
        );
      } catch (e) {
        await client.query(
          `UPDATE outbox SET attempts=attempts+1, last_error=$2, locked_at=now() WHERE id=$1`,
          [row.id, String(e.message || e)]
        );
        console.error('outbox publish failed', row.id, e.message);
      }
    }
    await client.query('COMMIT');
    return rows.length;
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function main() {
  await ensureSchema();
  const nc = await connect({ servers: process.env.NATS_URL });
  await ensureStream(nc);
  const js = nc.jetstream();
  console.log('outbox-relay started', { stream: STREAM, intervalMs: INTERVAL_MS });

  let stopped = false;
  const shutdown = async () => {
    stopped = true;
    await nc.drain().catch(() => {});
    await pool.end().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  while (!stopped) {
    try {
      await tick(js);
    } catch (e) {
      console.error('relay tick error', e.message);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('relay.js') || process.argv[1].endsWith('relay'));

if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
