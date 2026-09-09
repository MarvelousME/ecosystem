import pg from 'pg';
import { connect, StringCodec } from 'nats';
import crypto from 'node:crypto';
import { databaseAllocationForInput } from './database-allocation.js';

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const STREAM = process.env.BRIDGE_JS_STREAM || 'BRIDGE_EVENTS';
const DURABLE = process.env.BRIDGE_JS_DURABLE || 'INSTALL_WORKER_V1';
const FILTER = process.env.BRIDGE_JS_FILTER || 'install.requested';
const ACK_WAIT_NS = Number(process.env.BRIDGE_JS_ACK_WAIT_NS || 30 * 1e9);
const MAX_DELIVER = Number(process.env.BRIDGE_JS_MAX_DELIVER || 5);
const CONSUMER = 'install-worker';
const sc = StringCodec();

const STEPS = [
  'validate_entitlement',
  'validate_compatibility',
  'provision_resources',
  'create_app_record',
  'configure_app',
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
      subjects: ['bridge.>', 'provision.>', 'install.>', 'billing.>', 'workflow.>', 'agent.>', 'audit.>'],
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

async function recordStep(client, installationId, stepName, status, detail = {}) {
  await client.query(
    `INSERT INTO installation_saga_steps(installation_id, step_name, status, detail) VALUES($1,$2,$3,$4)`,
    [installationId, stepName, status, detail]
  );
}

async function runSaga(client, { installationId, tenantId, packageId, versionId, config, correlationId, traceId }) {
  await client.query(
    `UPDATE marketplace_installations SET state='running', updated_at=now() WHERE id=$1`,
    [installationId]
  );

  for (let i = 0; i < STEPS.length; i++) {
    const stepName = STEPS[i];
    await recordStep(client, installationId, stepName, 'RUNNING', { correlationId, traceId });

    if (stepName === 'validate_entitlement') {
      // Check if tenant has required entitlement for package
      const version = (await client.query(
        'SELECT requires_entitlement FROM marketplace_versions WHERE id=$1',
        [versionId]
      )).rows[0];
      
      if (version?.requires_entitlement) {
        const entitlement = (await client.query(
          'SELECT limits, usage FROM entitlements WHERE tenant_id=$1',
          [tenantId]
        )).rows[0];
        
        if (!entitlement) {
          throw new Error(`No entitlements found for tenant ${tenantId}`);
        }
        
        const limits = entitlement.limits || {};
        const required = version.requires_entitlement;
        if (limits[required] === undefined || limits[required] <= 0) {
          throw new Error(`Missing required entitlement: ${required}`);
        }
      }
    }

    if (stepName === 'validate_compatibility') {
      // Check version compatibility with tenant's existing apps
      const version = (await client.query(
        'SELECT compatibility FROM marketplace_versions WHERE id=$1',
        [versionId]
      )).rows[0];
      
      void (version?.compatibility || {});
      // For now, we accept all compatibility. Future: check min/max versions, required capabilities, etc.
    }

    if (stepName === 'provision_resources') {
      // Provision any required resources (databases, domains, etc.)
      // Based on package manifest
      const manifest = (await client.query(
        'SELECT manifest FROM marketplace_versions WHERE id=$1',
        [versionId]
      )).rows[0]?.manifest || {};
      
      if (manifest.requiresDatabase && manifest.databaseEngine) {
        const databaseName = `db_${tenantId.toString().slice(0, 8)}_${Date.now().toString(36)}`;
        const allocation = databaseAllocationForInput(
          { databaseEngine: manifest.databaseEngine, databaseName },
          tenantId
        );
        await client.query(
          `INSERT INTO database_instances(tenant_id,engine,host,port,database_name,status,secret_ref)
           VALUES($1,$2,$3,$4,$5,$6,$7)`,
          [
            tenantId,
            allocation.engine,
            allocation.host,
            allocation.port,
            allocation.databaseName,
            allocation.status,
            allocation.secretRef
          ]
        );
      }
    }

    if (stepName === 'create_app_record') {
      // Create app record in the authoritative apps table
      const pkg = (await client.query(
        'SELECT name, description FROM marketplace_packages WHERE id=$1',
        [packageId]
      )).rows[0];
      
      const version = (await client.query(
        'SELECT version FROM marketplace_versions WHERE id=$1',
        [versionId]
      )).rows[0];
      
      const app = await client.query(
        `INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,lifecycle_status,status,version)
         VALUES($1,$2,'marketplace',$3,'none','READY','ready',$4) RETURNING id`,
        [
          tenantId,
          pkg.name,
          `/#/apps/${installationId}`, // Placeholder launch URL
          version.version
        ]
      );
      
      const appId = app.rows[0].id;
      
      // Link installation to app
      await client.query(
        `UPDATE marketplace_installations SET app_id=$2, updated_at=now() WHERE id=$1`,
        [installationId, appId]
      );
    }

    if (stepName === 'configure_app') {
      // Apply tenant-specific configuration
      if (config && Object.keys(config).length > 0) {
        await client.query(
          `UPDATE marketplace_installations SET config=$2, updated_at=now() WHERE id=$1`,
          [installationId, config]
        );
      }
    }

    if (stepName === 'verify_health') {
      // Verify the installed app is healthy
      // For now, we'll mark it as healthy. In production, this would call the app's health endpoint
      const appId = (await client.query(
        'SELECT app_id FROM marketplace_installations WHERE id=$1',
        [installationId]
      )).rows[0]?.app_id;
      
      if (appId) {
        await client.query(
          `UPDATE apps SET health='HEALTHY', updated_at=now() WHERE id=$1`,
          [appId]
        );
      }
    }

    await recordStep(client, installationId, stepName, 'SUCCEEDED', { correlationId, traceId });
  }

  await client.query(
    `UPDATE marketplace_installations SET state='ready', installed_at=now(), updated_at=now() WHERE id=$1`,
    [installationId]
  );
}

export async function processEvent(evt) {
  const eventId = evt.eventId || evt.messageId || crypto.randomUUID();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(
        `INSERT INTO consumer_inbox(consumer,event_id,subject,payload) VALUES($1,$2,$3,$4)`,
        [CONSUMER, eventId, 'install.requested', evt]
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
      installationId: evt.installationId,
      tenantId: evt.tenantId,
      packageId: evt.packageId,
      versionId: evt.versionId,
      config: evt.config || {},
      correlationId: evt.correlationId,
      traceId: evt.traceId
    });

    await client.query(`INSERT INTO outbox(tenant_id,subject,payload) VALUES($1,$2,$3)`, [
      evt.tenantId,
      'install.completed',
      {
        installationId: evt.installationId,
        tenantId: evt.tenantId,
        packageId: evt.packageId,
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
    try {
      await db.query(
        `UPDATE marketplace_installations SET state='failed', error=$2, updated_at=now() WHERE id=$1`,
        [evt.installationId, String(e)]
      );
      await db.query(`INSERT INTO outbox(tenant_id,subject,payload) VALUES($1,$2,$3)`, [
        evt.tenantId,
        'install.failed',
        {
          installationId: evt.installationId,
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
  console.log('install-worker durable pull', { stream: STREAM, durable: DURABLE, filter: FILTER });

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

const isMain = process.argv[1] && (process.argv[1].endsWith('worker.js') || process.argv[1].endsWith('worker'));
if (isMain) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
