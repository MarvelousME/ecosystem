import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LabAesGcmSecretProvider,
  AwsKmsSecretProvider,
  resolveSecretsProviderName,
  assertSecretsProductionPolicy,
  sealSecret,
  openSecret
} from '../src/lib/secrets.js';
import { sanitizeIdent, assertNotWordpressEngine, MongoDbProvider, SqlServerProvider } from '../src/providers/database.js';
import { mapRealmRoles, headersUntrusted } from '../src/lib/auth.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

test('lab AES-GCM roundtrip and tamper detection', async () => {
  process.env.BRIDGE_SECRETS_KEY = 'unit-test-secret-key-prod-harden';
  process.env.BRIDGE_SECRETS_PROVIDER = 'lab';
  const p = new LabAesGcmSecretProvider();
  const sealed = await p.seal('super-secret', { tenantId: 't1', secretName: 'db' });
  assert.equal(sealed.meta.enc, 'aes-256-gcm');
  assert.equal(await p.open(sealed.ciphertext, sealed.meta), 'super-secret');
  const buf = Buffer.from(sealed.ciphertext, 'base64');
  buf[20] ^= 0xff;
  await assert.rejects(() => p.open(buf.toString('base64'), sealed.meta));
});

test('aws-kms envelope uses GenerateDataKey and does not persist plaintext key', async () => {
  const calls = [];
  const keyBytes = new Uint8Array(32).fill(7);
  const client = {
    send: async (cmd) => {
      calls.push(cmd.constructor.name);
      if (cmd.constructor.name === 'GenerateDataKeyCommand') {
        assert.equal(cmd.input.EncryptionContext.purpose, 'bridge-secret');
        assert.equal(cmd.input.EncryptionContext.tenantId, 'tenant-a');
        return {
          Plaintext: Buffer.from(keyBytes),
          CiphertextBlob: Buffer.from('wrapped-key')
        };
      }
      if (cmd.constructor.name === 'DecryptCommand') {
        assert.equal(cmd.input.EncryptionContext.tenantId, 'tenant-a');
        return { Plaintext: Buffer.from(keyBytes) };
      }
      if (cmd.constructor.name === 'DescribeKeyCommand') {
        return { KeyMetadata: { Arn: 'arn:aws:kms:us-east-1:123:key/abcd' } };
      }
      throw new Error('unexpected ' + cmd.constructor.name);
    }
  };
  const p = new AwsKmsSecretProvider({ client, keyId: 'alias/bridge' });
  const sealed = await p.seal('payload', { tenantId: 'tenant-a', secretName: 'x', purpose: 'bridge-secret' });
  assert.ok(calls.includes('GenerateDataKeyCommand'));
  assert.ok(sealed.meta.encryptedDataKey);
  assert.equal(JSON.stringify(sealed).includes(Buffer.from(keyBytes).toString('base64')), false);
  const plain = await p.open(sealed.ciphertext, sealed.meta);
  assert.equal(plain, 'payload');
  assert.ok(calls.includes('DecryptCommand'));
});

test('production refuses lab secrets provider without override', () => {
  const prev = { ...process.env };
  process.env.NODE_ENV = 'production';
  process.env.BRIDGE_SECRETS_PROVIDER = 'lab';
  delete process.env.BRIDGE_ALLOW_LAB_SECRETS_IN_PROD;
  assert.throws(() => assertSecretsProductionPolicy());
  process.env.BRIDGE_ALLOW_LAB_SECRETS_IN_PROD = '1';
  assert.doesNotThrow(() => assertSecretsProductionPolicy());
  Object.assign(process.env, prev);
});

test('production default secrets provider is aws-kms', () => {
  const prevN = process.env.NODE_ENV;
  const prevP = process.env.BRIDGE_SECRETS_PROVIDER;
  delete process.env.BRIDGE_SECRETS_PROVIDER;
  process.env.NODE_ENV = 'production';
  assert.equal(resolveSecretsProviderName(), 'aws-kms');
  process.env.NODE_ENV = prevN;
  if (prevP === undefined) delete process.env.BRIDGE_SECRETS_PROVIDER;
  else process.env.BRIDGE_SECRETS_PROVIDER = prevP;
});

test('headers untrusted in production by default', () => {
  const prev = process.env.NODE_ENV;
  const prevT = process.env.BRIDGE_TRUST_HEADERS;
  process.env.NODE_ENV = 'production';
  delete process.env.BRIDGE_TRUST_HEADERS;
  assert.equal(headersUntrusted(), true);
  process.env.NODE_ENV = prev;
  if (prevT === undefined) delete process.env.BRIDGE_TRUST_HEADERS;
  else process.env.BRIDGE_TRUST_HEADERS = prevT;
});

test('sanitizeIdent rejects injection', () => {
  assert.throws(() => sanitizeIdent("foo; drop table"));
  assert.throws(() => sanitizeIdent(''));
  assert.match(sanitizeIdent('Acme App 1', { prefix: 'mg' }), /^mg_/);
});

test('wordpress cannot use mongodb/sqlserver', () => {
  assert.throws(() => assertNotWordpressEngine('wordpress', 'mongodb'));
  assert.throws(() => assertNotWordpressEngine('commerce', 'sqlserver'));
  assert.doesNotThrow(() => assertNotWordpressEngine('wordpress', 'mariadb'));
  assert.doesNotThrow(() => assertNotWordpressEngine('react', 'mongodb'));
});

test('mongo/mssql health UNVERIFIED without config', async () => {
  delete process.env.MONGODB_URL;
  delete process.env.MSSQL_PASSWORD;
  const m = await new MongoDbProvider().health();
  const s = await new SqlServerProvider().health();
  assert.equal(m.ok, false);
  assert.equal(s.ok, false);
});

test('API source has no direct NATS publish for domain events', () => {
  const server = fs.readFileSync(path.join(__dirname, '../src/server.js'), 'utf8');
  assert.equal(/from ['"]nats['"]/.test(server), false);
  assert.equal(/nc\.publish|js\.publish/.test(server), false);
  assert.ok(server.includes('enqueueOutbox'));
  assert.ok(server.includes('natsPublish: false'));
});

test('role mapping still works', () => {
  assert.deepEqual(mapRealmRoles(['platform_admin']), ['platform.admin']);
});

test('facade seal/open still works for lab', async () => {
  process.env.BRIDGE_SECRETS_PROVIDER = 'lab';
  process.env.BRIDGE_SECRETS_KEY = 'facade-key';
  const sealed = await sealSecret('abc', { secretName: 't' });
  assert.equal(await openSecret(sealed.ciphertext, sealed.meta), 'abc');
});
