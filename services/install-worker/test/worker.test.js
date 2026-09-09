import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { databaseAllocationForInput } from '../src/database-allocation.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('uses durable delivery, idempotency, and a test-safe entrypoint', () => {
  const source = fs.readFileSync(path.join(root, 'src/worker.js'), 'utf8');
  assert.ok(source.includes('consumer_inbox'));
  assert.ok(source.includes('msg.ack()'));
  assert.ok(source.includes('msg.nak()'));
  assert.ok(source.includes('consumer_dead_letters'));
  assert.ok(source.includes('const isMain'));
});

test('optional database engines remain unverified without provider configuration', () => {
  const previousMongo = process.env.MONGODB_URL;
  const previousMssqlPassword = process.env.MSSQL_PASSWORD;
  try {
    delete process.env.MONGODB_URL;
    delete process.env.MSSQL_PASSWORD;
    assert.equal(databaseAllocationForInput({ databaseEngine: 'mongodb' }, 'tenant-a').status, 'UNVERIFIED');
    assert.equal(databaseAllocationForInput({ databaseEngine: 'sqlserver' }, 'tenant-a').status, 'UNVERIFIED');
  } finally {
    if (previousMongo === undefined) delete process.env.MONGODB_URL;
    else process.env.MONGODB_URL = previousMongo;
    if (previousMssqlPassword === undefined) delete process.env.MSSQL_PASSWORD;
    else process.env.MSSQL_PASSWORD = previousMssqlPassword;
  }
});

test('configured optional database engines are ready and carry a secret reference', () => {
  const previousMongo = process.env.MONGODB_URL;
  const previousMssqlPassword = process.env.MSSQL_PASSWORD;
  try {
    process.env.MONGODB_URL = 'mongodb://bridge:bridge@mongodb:27017/admin';
    process.env.MSSQL_PASSWORD = 'Bridge_MsSql_ChangeMe1';
    const mongo = databaseAllocationForInput({ databaseEngine: 'mongodb', databaseName: 'market' }, 'tenant-a');
    const mssql = databaseAllocationForInput({ databaseEngine: 'sqlserver', databaseName: 'market' }, 'tenant-a');
    assert.equal(mongo.status, 'READY');
    assert.equal(mssql.status, 'READY');
    assert.equal(mongo.secretRef, 'db:tenant-a:market');
    assert.equal(mssql.secretRef, 'db:tenant-a:market');
  } finally {
    if (previousMongo === undefined) delete process.env.MONGODB_URL;
    else process.env.MONGODB_URL = previousMongo;
    if (previousMssqlPassword === undefined) delete process.env.MSSQL_PASSWORD;
    else process.env.MSSQL_PASSWORD = previousMssqlPassword;
  }
});
