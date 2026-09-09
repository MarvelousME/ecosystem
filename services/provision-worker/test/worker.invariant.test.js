import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
