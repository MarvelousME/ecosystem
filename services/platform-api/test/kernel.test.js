import test from 'node:test';
import assert from 'node:assert/strict';
import { ok, fail } from '../src/lib/kernel.js';

test('envelope includes meta version', () => {
  const body = ok({ hello: true }, { requestId: 'r1', correlationId: 'c1', traceId: 't1' });
  assert.equal(body.data.hello, true);
  assert.equal(body.meta.requestId, 'r1');
  assert.equal(body.meta.version, '1.0.0');
});

test('fail carries statusCode', () => {
  const err = fail('FORBIDDEN', 'nope', 403);
  assert.equal(err.statusCode, 403);
  assert.equal(err.code, 'FORBIDDEN');
});
