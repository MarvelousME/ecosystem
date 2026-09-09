import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => fs.readFileSync(path.join(root, 'src', file), 'utf8');

test('tenant-owned marketplace and agent mutations bind resource id to tenant id', () => {
  const marketplace = read('routes/marketplace.js');
  const agents = read('routes/agents.js');
  assert.match(marketplace, /WHERE mi\.id=\$1 AND mi\.tenant_id=\$2/);
  assert.match(marketplace, /WHERE id=\$1 AND tenant_id=\$3 RETURNING \*/);
  assert.match(agents, /WHERE ai\.id=\$1 AND ai\.tenant_id=\$2/);
  assert.match(agents, /DELETE FROM agent_instances WHERE id=\$1 AND tenant_id=\$2/);
});

test('frontend catalog installation and Puck registry are application and tenant scoped', () => {
  const resources = read('routes/ecosystem-resources.js');
  const builders = read('lib/builders.js');
  assert.match(resources, /SELECT id FROM apps WHERE id=\$1 AND tenant_id=\$2/);
  assert.match(resources, /WHERE fi\.tenant_id=\$1 AND fi\.state <> 'REMOVED'/);
  assert.match(builders, /i\.tenant_id=\$1 AND i\.application_id=\$2 AND i\.state='READY'/);
  assert.match(builders, /c\.status='APPROVED'/);
});
