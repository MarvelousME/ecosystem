import test from 'node:test';
import assert from 'node:assert/strict';
import { permissionsFor } from '../src/lib/rbac.js';
import { createWebsiteProviders } from '../src/providers/website.js';

test('platform.admin receives deny-by-default grants catalog', () => {
  const perms = permissionsFor(['platform.admin']);
  assert.ok(perms.includes('website.publish'));
  assert.ok(perms.includes('billing.manage'));
  assert.ok(perms.includes('ai.agent.execute'));
});

test('viewer cannot manage billing', () => {
  const perms = permissionsFor(['tenant.viewer']);
  assert.equal(perms.includes('billing.manage'), false);
  assert.ok(perms.includes('app.read'));
});

test('website provider resolves wordpress vs nextjs', async () => {
  const p = createWebsiteProviders({});
  assert.equal(await p.resolveProvider({ app_type: 'wordpress' }), 'wordpress');
  assert.equal(await p.resolveProvider({ app_type: 'react' }), 'nextjs');
  assert.equal(await p.resolveProvider({ app_type: 'ai-hub' }), null);
});
