import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseAllocationForInput } from '../src/database-allocation.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('durable consumer name and explicit ack present', () => {
  const src = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');
  assert.ok(src.includes("PROVISION_WORKER_V1") || src.includes('BRIDGE_JS_DURABLE'));
  assert.ok(src.includes("ack_policy: 'explicit'") || src.includes('ack_policy'));
  assert.ok(src.includes('consumer_inbox'));
  assert.ok(src.includes('msg.ack()'));
  assert.ok(src.includes('msg.nak()'));
  assert.ok(src.includes('consumer_dead_letters'));
});

test('optional database engines stay UNVERIFIED without provider config', () => {
  const prevMongo = process.env.MONGODB_URL;
  const prevMssqlPassword = process.env.MSSQL_PASSWORD;
  try {
    delete process.env.MONGODB_URL;
    delete process.env.MSSQL_PASSWORD;

    assert.equal(
      databaseAllocationForInput({ databaseEngine: 'mongodb', databaseName: 'app' }, 'tenant-a').status,
      'UNVERIFIED'
    );
    assert.equal(
      databaseAllocationForInput({ databaseEngine: 'sqlserver', databaseName: 'app' }, 'tenant-a').status,
      'UNVERIFIED'
    );
  } finally {
    if (prevMongo === undefined) delete process.env.MONGODB_URL;
    else process.env.MONGODB_URL = prevMongo;
    if (prevMssqlPassword === undefined) delete process.env.MSSQL_PASSWORD;
    else process.env.MSSQL_PASSWORD = prevMssqlPassword;
  }
});

test('configured optional database engines can be marked READY', () => {
  const prevMongo = process.env.MONGODB_URL;
  const prevMssqlPassword = process.env.MSSQL_PASSWORD;
  try {
    process.env.MONGODB_URL = 'mongodb://bridge:bridge@mongodb:27017/admin';
    process.env.MSSQL_PASSWORD = 'Bridge_MsSql_ChangeMe1';

    assert.equal(
      databaseAllocationForInput({ databaseEngine: 'mongodb', databaseName: 'app' }, 'tenant-a').status,
      'READY'
    );
    assert.equal(
      databaseAllocationForInput({ databaseEngine: 'sqlserver', databaseName: 'app' }, 'tenant-a').status,
      'READY'
    );
  } finally {
    if (prevMongo === undefined) delete process.env.MONGODB_URL;
    else process.env.MONGODB_URL = prevMongo;
    if (prevMssqlPassword === undefined) delete process.env.MSSQL_PASSWORD;
    else process.env.MSSQL_PASSWORD = prevMssqlPassword;
  }
});
