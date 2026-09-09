import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSubject, publishOutboxRow } from '../src/relay.js';

test('normalizeSubject keeps provision subjects', () => {
  assert.equal(normalizeSubject('provision.requested'), 'provision.requested');
  assert.equal(normalizeSubject('custom.event'), 'bridge.custom.event');
});

test('publishOutboxRow sets msgID to outbox message_id', async () => {
  const published = [];
  const js = {
    publish: async (subject, data, opts) => {
      published.push({ subject, opts });
      return { seq: 1 };
    }
  };
  const row = {
    id: 9,
    event_id: '11111111-1111-1111-1111-111111111111',
    message_id: '22222222-2222-2222-2222-222222222222',
    tenant_id: '33333333-3333-3333-3333-333333333333',
    subject: 'provision.requested',
    payload: { sagaId: 's1', correlationId: 'c1' }
  };
  const result = await publishOutboxRow(js, row);
  assert.equal(result.messageId, row.message_id);
  assert.equal(published[0].opts.msgID, row.message_id);
  assert.equal(published[0].subject, 'provision.requested');
});
