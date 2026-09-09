import pg from 'pg';
import { connect, StringCodec } from 'nats';
import crypto from 'node:crypto';

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STREAM = process.env.BRIDGE_JS_STREAM || 'BRIDGE_EVENTS';
const DURABLE = process.env.BRIDGE_JS_DURABLE || 'PROVISION_WORKER_V1';
const FILTER = process.env.BRIDGE_JS_FILTER || 'provision.requested';
const ACK_WAIT_NS = Number(process.env.BRIDGE_JS_ACK_WAIT_NS || 30 * 1e9);
const MAX_DELIVER = Number(process.env.BRIDGE_JS_MAX_DELIVER || 5);
const CONSUMER = 'provision-worker';
const sc = StringCodec();

const STEPS = [
  'validate_request',
  'allocate_database',
  'register_application',
  'bind_domain',
  'verify_health',
  'complete'
];

async function ensureTables() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS consumer_inbox(
      consumer text NOT NULL,
      event_id uuid NOT NULL,
      subject text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      processed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(consumer, event_id)
    );
    CREATE TABLE IF NOT EXISTS consumer_dead_letters(
      id bigserial PRIMARY KEY,
      consumer text NOT NULL,
      event_id uuid,
      subject text NOT NULL,
      payload jsonb NOT NULL DEFAULT '{}'::jsonb,
      delivery_count int NOT NULL DEFAULT 0,
      last_error text,
      tenant_id uuid,
      correlation_id text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);
}

async function ensureConsumer(nc) {
  const jsm = await nc.jetstreamManager();
  try {
    await jsm.streams.info(STREAM);
  } catch {
    await jsm.streams.add({
      name: STREAM,
      subjects: ['bridge.>', 'provision.>', 'billing.>', 'workflow.>', 'agent.>', 'audit.>'],
      storage: 'file',
      retention: 'limits',
      max_age: 7 * 24 * 60 * 60 * 1e9,
      duplicate_window: 120 * 1e9
    });
  }
  try {
    await jsm.consumers.info(STREAM, DURABLE);
  } catch {
    await jsm.consumers.add(STREAM, {
      durable_name: DURABLE,
      ack_policy: 'explicit',
      ack_wait: ACK_WAIT_NS,
      max_deliver: MAX_DELIVER,
      filter_subject: FILTER,
      deliver_policy: 'all'
    });
    console.log('created durable consumer', DURABLE);
  }
}

async function recordStep(client, sagaId, stepName, status, detail = {}) {
  await client.query(
    `INSERT INTO saga_steps(saga_id, step_name, status, detail) VALUES($1,$2,$3,$4)`,
    [sagaId, stepName, status, detail]
  );
}

async function runSaga(client, { sagaId, tenantId, input, correlationId, traceId }) {
  await client.query(
    `UPDATE sagas SET state='running', step=0, current_step=$2, attempts=COALESCE(attempts,0)+1, updated_at=now() WHERE id=$1`,
    [sagaId, STEPS[0]]
  );

  for (let i = 0; i < STEPS.length; i++) {
    const stepName = STEPS[i];
    await recordStep(client, sagaId, stepName, 'RUNNING', { correlationId, traceId });
    await client.query(`UPDATE sagas SET current_step=$2, updated_at=now() WHERE id=$1`, [sagaId, stepName]);

    if (stepName === 'allocate_database' && input?.databaseEngine && input.databaseEngine !== 'none') {
      const engine = input.databaseEngine === 'mysql' ? 'mariadb' : input.databaseEngine;
      await client.query(
        `INSERT INTO database_instances(tenant_id,application_id,engine,host,port,database_name,status,secret_ref)
         VALUES($1,$2,$3,$4,$5,$6,'READY',$7)`,
        [
          tenantId,
          input.applicationId || null,
          engine,
          engine === 'postgresql' ? 'postgres' : engine === 'mongodb' ? 'mongodb' : engine === 'sqlserver' ? 'mssql' : 'wordpress-db',
          engine === 'postgresql' ? 5432 : engine === 'mongodb' ? 27017 : engine === 'sqlserver' ? 1433 : 3306,
          input.databaseName || `t_${String(tenantId).slice(0, 8)}`,
          `db:${tenantId}:${input.databaseName || 'app'}`
        ]
      );
    }

    if (stepName === 'register_application' && input?.name && input?.appType && input?.launchUrl) {
      const app = await client.query(
        `INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,lifecycle_status,status)
         VALUES($1,$2,$3,$4,$5,'READY','ready') RETURNING id`,
        [tenantId, input.name, input.appType, input.launchUrl, input.databaseEngine || 'none']
      );
      input.applicationId = app.rows[0].id;
      await client.query(`UPDATE sagas SET application_id=$2 WHERE id=$1`, [sagaId, input.applicationId]);
    }

    if (stepName === 'bind_domain' && input?.hostname) {
      await client.query(
        `INSERT INTO domains(tenant_id,application_id,hostname,status,ssl_status)
         VALUES($1,$2,$3,'verified','pending')
         ON CONFLICT(tenant_id,hostname) DO UPDATE SET status='verified'`,
        [tenantId, input.applicationId || null, input.hostname]
      );
    }

    if (stepName === 'verify_health' && input?.applicationId) {
      await client.query(`UPDATE apps SET health='HEALTHY', updated_at=now() WHERE id=$1`, [input.applicationId]);
    }

    await recordStep(client, sagaId, stepName, 'SUCCEEDED', { correlationId, traceId });
    await client.query(`UPDATE sagas SET step=$2, updated_at=now() WHERE id=$1`, [sagaId, i + 1]);
  }

  await client.query(`UPDATE sagas SET state='completed', current_step='complete', updated_at=now() WHERE id=$1`, [sagaId]);
}

/** Process one event inside a DB transaction; caller ACKs only after success return. */
export async function processEvent(evt) {
  const eventId = evt.eventId || evt.messageId || crypto.randomUUID();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO consumer_inbox(consumer,event_id,subject,payload) VALUES($1,$2,$3,$4)`,
        [CONSUMER, eventId, 'provision.requested', evt]
      );
    } catch (e) {
      if (e.code === '23505') {
        await client.query('COMMIT');
        return { duplicate: true, eventId };
      }
      throw e;
    }

    if (evt.input?.forceFailAt) throw new Error(`forced failure at ${evt.input.forceFailAt}`);

    await runSaga(client, {
      sagaId: evt.sagaId,
      tenantId: evt.tenantId,
      input: evt.input || {},
      correlationId: evt.correlationId,
      traceId: evt.traceId
    });

    await client.query(`INSERT INTO outbox(tenant_id,subject,payload) VALUES($1,$2,$3)`, [
      evt.tenantId,
      'provision.completed',
      {
        sagaId: evt.sagaId,
        tenantId: evt.tenantId,
        correlationId: evt.correlationId,
        traceId: evt.traceId
      }
    ]);

    await client.query('COMMIT');
    return { duplicate: false, eventId };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    // best-effort failure records outside rolled-back txn
    try {
      await db.query(`UPDATE sagas SET state='failed', last_error=$2, error=$2, updated_at=now() WHERE id=$1`, [
        evt.sagaId,
        String(e)
      ]);
      await db.query(`INSERT INTO outbox(tenant_id,subject,payload) VALUES($1,$2,$3)`, [
        evt.tenantId,
        'provision.failed',
        {
          sagaId: evt.sagaId,
          tenantId: evt.tenantId,
          error: String(e),
          correlationId: evt.correlationId,
          traceId: evt.traceId
        }
      ]);
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

async function deadLetter(msg, evt, err) {
  const delivery = msg.info?.deliveryCount || 0;
  await db.query(
    `INSERT INTO consumer_dead_letters(consumer,event_id,subject,payload,delivery_count,last_error,tenant_id,correlation_id)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      CONSUMER,
      evt?.eventId || evt?.messageId || null,
      FILTER,
      evt || {},
      Number(delivery) || MAX_DELIVER,
      String(err?.message || err),
      evt?.tenantId || null,
      evt?.correlationId || null
    ]
  );
}

async function main() {
  await ensureTables();
  const nc = await connect({ servers: process.env.NATS_URL });
  await ensureConsumer(nc);
  const js = nc.jetstream();
  console.log('provision-worker durable pull', { stream: STREAM, durable: DURABLE, filter: FILTER });

  const consumer = await js.consumers.get(STREAM, DURABLE);

  while (true) {
    const messages = await consumer.fetch({ max_messages: 5, expires: 5000 });
    for await (const msg of messages) {
      let evt;
      try {
        evt = JSON.parse(sc.decode(msg.data));
        const result = await processEvent(evt);
        msg.ack();
        if (result.duplicate) console.log('duplicate acked', result.eventId);
      } catch (e) {
        const deliveries = msg.info?.deliveryCount || 1;
        console.error('process failed', e.message, 'delivery', deliveries);
        if (deliveries >= MAX_DELIVER) {
          await deadLetter(msg, evt, e).catch(() => {});
          msg.ack();
        } else {
          msg.nak();
        }
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
