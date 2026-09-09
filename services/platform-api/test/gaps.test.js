import test from 'node:test';
import assert from 'node:assert/strict';
import { mapRealmRoles, extractRolesFromPayload, headersUntrusted } from '../src/lib/auth.js';
import { sealSecret, openSecret } from '../src/lib/secrets.js';
import { scanBuffer } from '../src/lib/zip-import.js';

test('maps Keycloak realm roles to Bridge roles', () => {
  assert.deepEqual(mapRealmRoles(['platform_admin']), ['platform.admin']);
  assert.deepEqual(mapRealmRoles(['tenant_admin', 'tenant_user']).sort(), ['tenant.admin', 'tenant.viewer'].sort());
});

test('extracts roles from Keycloak-shaped payload', () => {
  const roles = extractRolesFromPayload({
    realm_access: { roles: ['platform_admin', 'offline_access'] }
  });
  assert.ok(roles.includes('platform.admin'));
});

test('headers untrusted when JWT required', () => {
  const prev = process.env.BRIDGE_REQUIRE_JWT;
  process.env.BRIDGE_REQUIRE_JWT = '1';
  assert.equal(headersUntrusted(), true);
  process.env.BRIDGE_REQUIRE_JWT = prev;
});

test('seal/open secret roundtrip with lab key', async () => {
  process.env.BRIDGE_SECRETS_KEY = 'unit-test-secret-key';
  process.env.BRIDGE_SECRETS_PROVIDER = 'lab';
  const sealed = await sealSecret('db-password-123');
  assert.equal(sealed.meta.enc, 'aes-256-gcm');
  assert.equal(await openSecret(sealed.ciphertext, sealed.meta), 'db-password-123');
});

test('malware scanner rejects EICAR and non-zip', async () => {
  const eicar = Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*');
  const bad = await scanBuffer(eicar);
  assert.equal(bad.clean, false);

  const notZip = await scanBuffer(Buffer.from('hello'));
  assert.equal(notZip.clean, false);

  // minimal ZIP local file header magic
  const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
  const ok = await scanBuffer(zip, { filename: 'site.zip' });
  assert.equal(ok.clean, true);
});
