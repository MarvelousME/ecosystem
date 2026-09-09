import pg from 'pg';
import { connect, StringCodec } from 'nats';

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const stream = process.env.BRIDGE_JS_STREAM || 'BRIDGE_EVENTS';
const durable = process.env.BRIDGE_JS_DURABLE || 'AGENT_WORKER_V1';
const filter = 'agent.execution.requested';
const sc = StringCodec();

async function ensureConsumer(nc) {
  const jsm = await nc.jetstreamManager();
  try { await jsm.consumers.info(stream, durable); }
  catch {
    await jsm.consumers.add(stream, {
      durable_name: durable, filter_subject: filter, ack_policy: 'explicit',
      ack_wait: Number(process.env.BRIDGE_JS_ACK_WAIT_NS || 30e9), max_deliver: Number(process.env.BRIDGE_JS_MAX_DELIVER || 5), deliver_policy: 'all'
    });
  }
}

export async function processExecution(event, pool = db) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const execution = (await client.query(
      `SELECT e.*, ai.enabled, ai.lifecycle_state, ad.agent_key, ad.model_requirements, ad.tools
       FROM agent_executions e JOIN agent_instances ai ON ai.id=e.agent_instance_id
       LEFT JOIN agent_definitions ad ON ad.id=ai.agent_definition_id
       WHERE e.id=$1 AND e.tenant_id=$2 FOR UPDATE`, [event.executionId, event.tenantId]
    )).rows[0];
    if (!execution) throw new Error('agent execution not found');
    if (execution.status !== 'queued') { await client.query('COMMIT'); return { duplicate: true }; }
    if (!execution.enabled || execution.lifecycle_state !== 'READY') throw new Error('agent is not ready');
    await client.query("UPDATE agent_executions SET status='running', approval_status='approved', updated_at=now() WHERE id=$1", [execution.id]);
    const modelUrl = process.env.BRIDGE_AI_BASE_URL;
    if (!modelUrl) {
      await client.query("UPDATE agent_executions SET status='failed', error='No approved model provider configured', updated_at=now() WHERE id=$1", [execution.id]);
      await client.query(`INSERT INTO audit_log(tenant_id,actor,action,resource_type,resource_id,metadata) VALUES($1,'service:agent-worker','agent.execution.failed','agent_execution',$2,$3)`, [event.tenantId, execution.id, { reason: 'model provider unavailable', correlationId: event.correlationId, traceId: event.traceId }]);
      await client.query('COMMIT'); return { failed: true, reason: 'model provider unavailable' };
    }
    const response = await fetch(`${modelUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.BRIDGE_AI_API_KEY ? { authorization: `Bearer ${process.env.BRIDGE_AI_API_KEY}` } : {}) },
      body: JSON.stringify({ model: process.env.BRIDGE_AI_MODEL || 'default', messages: [{ role: 'system', content: `You are the governed ${execution.agent_key || 'Bridge'} agent. Return a concise plan only; do not claim external actions.` }, { role: 'user', content: execution.prompt }], temperature: 0.2 })
    });
    if (!response.ok) throw new Error(`model provider returned ${response.status}`);
    const payload = await response.json(); const content = payload.choices?.[0]?.message?.content;
    if (!content) throw new Error('model provider returned no content');
    await client.query("UPDATE agent_executions SET status='completed', result=$2, output_tokens=$3, updated_at=now() WHERE id=$1", [execution.id, { content, mode: 'plan-only', verified: false }, Number(payload.usage?.completion_tokens || 0)]);
    await client.query(`INSERT INTO ai_artifacts(tenant_id,agent_execution_id,artifact_type,status,payload) VALUES($1,$2,'AgentPlan','draft',$3)`, [event.tenantId, execution.id, { content, requiresApproval: true }]);
    await client.query(`INSERT INTO audit_log(tenant_id,actor,action,resource_type,resource_id,metadata) VALUES($1,'service:agent-worker','agent.execution.completed','agent_execution',$2,$3)`, [event.tenantId, execution.id, { correlationId: event.correlationId, traceId: event.traceId, mode: 'plan-only' }]);
    await client.query('COMMIT'); return { completed: true };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; } finally { client.release(); }
}

async function main() {
  const nc = await connect({ servers: process.env.NATS_URL }); await ensureConsumer(nc);
  const consumer = await nc.jetstream().consumers.get(stream, durable);
  for (;;) for await (const msg of await consumer.fetch({ max_messages: 5, expires: 5000 })) {
    try { await processExecution(JSON.parse(sc.decode(msg.data))); msg.ack(); }
    catch (error) { console.error('agent execution failed', error.message); msg.nak(); }
  }
}
if (process.argv[1]?.endsWith('worker.js')) main().catch((error) => { console.error(error); process.exit(1); });
