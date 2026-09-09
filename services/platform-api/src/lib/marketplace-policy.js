import { fail } from './kernel.js';

export function isVisibleToTenant(rules = [], tenant = {}) {
  if (!rules.length) return true;
  const values = (type) => rules.filter((r) => r.rule_type === type).map((r) => r.rule_value || {});
  if (values('PRIVATE').length || values('INTERNAL').length) return false;
  const tenantId = String(tenant.id || '');
  const deny = values('TENANT_DENYLIST').some((v) => (v.tenantIds || []).map(String).includes(tenantId));
  if (deny) return false;
  const allows = values('TENANT_ALLOWLIST');
  if (allows.length && !allows.some((v) => (v.tenantIds || []).map(String).includes(tenantId))) return false;
  const plans = values('PLAN_BASED').flatMap((v) => v.plans || []);
  return !plans.length || plans.includes(tenant.plan);
}

export function assertInstallableVersion(version, { production = false } = {}) {
  if (version.status !== 'published') throw fail('FORBIDDEN', 'version not published', 403);
  if (production && (!version.checksum || !version.signature || version.security_review_status !== 'APPROVED')) {
    throw fail('PACKAGE_UNVERIFIED', 'production installation requires checksum, signature, and approved security review', 409);
  }
}
