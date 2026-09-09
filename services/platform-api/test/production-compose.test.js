import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const productionCompose = fs.readFileSync(path.join(root, 'docker-compose.prod.yml'), 'utf8');

test('production Compose fails closed and includes all runtime workers', () => {
  assert.match(productionCompose, /BRIDGE_REQUIRE_JWT:\s*\$\{BRIDGE_REQUIRE_JWT:-1\}/);
  assert.match(productionCompose, /BRIDGE_TRUST_HEADERS:\s*\$\{BRIDGE_TRUST_HEADERS:-0\}/);
  assert.match(productionCompose, /BRIDGE_SECRETS_PROVIDER:\s*\$\{BRIDGE_SECRETS_PROVIDER:-aws-kms\}/);
  assert.match(productionCompose, /BRIDGE_ALLOW_LAB_SECRETS_IN_PROD:\s*\$\{BRIDGE_ALLOW_LAB_SECRETS_IN_PROD:-0\}/);
  assert.match(productionCompose, /^  install-worker:/m);
  assert.match(productionCompose, /^  provision-worker:/m);
  assert.match(productionCompose, /^  outbox-relay:/m);
});

test('production Compose includes schema convergence and compiled authenticated frontend settings', () => {
  assert.match(productionCompose, /004-production-capability-convergence\.sql/);
  assert.match(productionCompose, /005-marketplace-agents-frontend-mcp\.sql/);
  assert.match(productionCompose, /VITE_OIDC_ENABLED:\s*\$\{VITE_OIDC_ENABLED:-1\}/);
  assert.match(productionCompose, /VITE_REQUIRE_AUTH:\s*\$\{VITE_REQUIRE_AUTH:-1\}/);
  assert.match(productionCompose, /^  puck-host:/m);
});
