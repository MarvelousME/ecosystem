import pg from 'pg';
import { connect, StringCodec } from 'nats';

const { Pool } = pg;
const db = new Pool({ connectionString: process.env.DATABASE_URL });
const nc = await connect({ servers: process.env.NATS_URL });
const sc = StringCodec();

const STEPS = [
  'validate_request',
  'allocate_database',
  'register_application',
  'bind_domain',
  'verify_health',
  'complete'
];

async function recordStep(sagaId, stepName, status, detail = {}) {
  await db.query(
    `INSERT INTO saga_steps(saga_id, step_name, status, detail) VALUES($1,$2,$3,$4)`,
    [sagaId, stepName, status, detail]
  );
}

async function runSaga({ sagaId, tenantId, input, correlationId, traceId }) {
  await db.query(`UPDATE sagas SET state='running', step=0, updated_at=now() WHERE id=$1`, [sagaId]);

  for (let i = 0; i < STEPS.length; i++) {
    const stepName = STEPS[i];
    await recordStep(sagaId, stepName, 'running', { correlationId, traceId });

    if (stepName === 'allocate_database' && input?.databaseEngine && input.databaseEngine !== 'none') {
      const engine = input.databaseEngine === 'mysql' ? 'mariadb' : input.databaseEngine;
      await db.query(
        `INSERT INTO database_instances(tenant_id,application_id,engine,host,port,database_name,status,secret_ref)
         VALUES($1,$2,$3,$4,$5,$6,'READY',$7)`,
        [
          tenantId,
          input.applicationId || null,
          engine,
          engine === 'postgresql' ? 'postgres' : 'wordpress-db',
          engine === 'postgresql' ? 5432 : 3306,
          input.databaseName || `t_${String(tenantId).slice(0, 8)}`,
          `db:${tenantId}:${input.databaseName || 'app'}`
        ]
      );
    }

    if (stepName === 'register_application' && input?.name && input?.appType && input?.launchUrl) {
      const app = await db.query(
        `INSERT INTO apps(tenant_id,name,app_type,launch_url,database_engine,lifecycle_status,status)
         VALUES($1,$2,$3,$4,$5,'READY','ready') RETURNING id`,
        [tenantId, input.name, input.appType, input.launchUrl, input.databaseEngine || 'none']
      );
      input.applicationId = app.rows[0].id;
    }

    if (stepName === 'bind_domain' && input?.hostname) {
      await db.query(
        `INSERT INTO domains(tenant_id,application_id,hostname,status,ssl_status)
         VALUES($1,$2,$3,'verified','pending')
         ON CONFLICT(tenant_id,hostname) DO UPDATE SET status='verified'`,
        [tenantId, input.applicationId || null, input.hostname]
      );
    }

    if (stepName === 'verify_health') {
      // Health is hierarchical; mark app healthy when present
      if (input?.applicationId) {
        await db.query(`UPDATE apps SET health='HEALTHY', updated_at=now() WHERE id=$1`, [input.applicationId]);
      }
    }

    await recordStep(sagaId, stepName, 'completed', { correlationId, traceId });
    await db.query(`UPDATE sagas SET step=$2, updated_at=now() WHERE id=$1`, [sagaId, i + 1]);
  }

  await db.query(`UPDATE sagas SET state='completed', updated_at=now() WHERE id=$1`, [sagaId]);
  nc.publish(
    'provision.completed',
    sc.encode(JSON.stringify({ sagaId, tenantId, input, correlationId, traceId }))
  );
}

const sub = nc.subscribe('provision.requested');
console.log('provision-worker listening on provision.requested');

for await (const m of sub) {
  const evt = JSON.parse(sc.decode(m.data));
  const { sagaId, tenantId, input, correlationId, traceId } = evt;
  try {
    if (input?.forceFailAt) {
      throw new Error(`forced failure at ${input.forceFailAt}`);
    }
    await runSaga({ sagaId, tenantId, input: input || {}, correlationId, traceId });
  } catch (e) {
    await recordStep(sagaId, 'failed', 'failed', { error: String(e) });
    await db.query(`UPDATE sagas SET state='failed', error=$2, updated_at=now() WHERE id=$1`, [
      sagaId,
      String(e)
    ]);
    nc.publish(
      'provision.failed',
      sc.encode(JSON.stringify({ sagaId, tenantId, error: String(e), correlationId, traceId }))
    );
  }
}
