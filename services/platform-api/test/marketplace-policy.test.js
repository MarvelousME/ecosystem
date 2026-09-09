import test from 'node:test';
import assert from 'node:assert/strict';
import { isVisibleToTenant, assertInstallableVersion } from '../src/lib/marketplace-policy.js';

test('marketplace visibility is deny-first for private, denylist, and plan rules', () => {
  assert.equal(isVisibleToTenant([], { id: 'a', plan: 'starter' }), true);
  assert.equal(isVisibleToTenant([{ rule_type: 'PRIVATE', rule_value: {} }], { id: 'a', plan: 'enterprise' }), false);
  assert.equal(isVisibleToTenant([{ rule_type: 'TENANT_DENYLIST', rule_value: { tenantIds: ['a'] } }], { id: 'a', plan: 'enterprise' }), false);
  assert.equal(isVisibleToTenant([{ rule_type: 'PLAN_BASED', rule_value: { plans: ['enterprise'] } }], { id: 'a', plan: 'starter' }), false);
  assert.equal(isVisibleToTenant([{ rule_type: 'PLAN_BASED', rule_value: { plans: ['enterprise'] } }], { id: 'a', plan: 'enterprise' }), true);
});

test('production package installation requires verified package metadata', () => {
  assert.throws(() => assertInstallableVersion({ status: 'published' }, { production: true }), { code: 'PACKAGE_UNVERIFIED' });
  assert.doesNotThrow(() => assertInstallableVersion({ status: 'published', checksum: 'abc', signature: 'sig', security_review_status: 'APPROVED' }, { production: true }));
});
