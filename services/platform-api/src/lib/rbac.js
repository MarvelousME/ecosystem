import { fail } from './kernel.js';

/** Permission catalog — deny by default */
export const PERMISSIONS = [
  'tenant.read', 'tenant.manage',
  'app.read', 'app.create', 'app.manage', 'app.delete',
  'website.read', 'website.edit', 'website.publish',
  'wordpress.manage', 'nextjs.manage',
  'database.provision',
  'deployment.preview', 'deployment.publish',
  'ai.chat.use', 'ai.agent.execute',
  'billing.read', 'billing.manage',
  'cms.read', 'cms.manage',
  'affiliate.manage',
  'security.manage',
  'support.impersonate',
  'platform.admin',
  'marketplace.read', 'marketplace.install', 'marketplace.uninstall', 'marketplace.manage',
  'agent.template.read', 'agent.template.instantiate', 'agent.instance.manage',
  'frontend.mcp.use', 'frontend.mcp.publish'
];

const ROLE_GRANTS = {
  'platform.admin': PERMISSIONS,
  'tenant.admin': PERMISSIONS.filter(p => p !== 'platform.admin' && p !== 'support.impersonate' && p !== 'marketplace.manage'),
  'tenant.editor': [
    'tenant.read', 'app.read', 'app.create', 'app.manage',
    'website.read', 'website.edit', 'website.publish',
    'wordpress.manage', 'nextjs.manage',
    'deployment.preview', 'ai.chat.use', 'ai.agent.execute',
    'cms.read', 'cms.manage', 'billing.read',
    'marketplace.read', 'marketplace.install', 'marketplace.uninstall',
    'agent.template.read', 'agent.template.instantiate', 'agent.instance.manage',
    'frontend.mcp.use'
  ],
  'tenant.viewer': [
    'tenant.read', 'app.read', 'website.read', 'cms.read', 'billing.read', 'ai.chat.use',
    'marketplace.read', 'agent.template.read'
  ],
  'support.impersonate': ['support.impersonate', 'tenant.read', 'app.read', 'website.read']
};

export function permissionsFor(roles = []) {
  const set = new Set();
  for (const role of roles) {
    for (const p of ROLE_GRANTS[role] || []) set.add(p);
  }
  return [...set];
}

export function authorize(ctx, permission) {
  const granted = permissionsFor(ctx.actor.roles);
  if (granted.includes('platform.admin') || granted.includes(permission)) return true;
  throw fail('FORBIDDEN', `missing permission: ${permission}`, 403, { permission });
}

export function authorizeAny(ctx, permissions) {
  const granted = permissionsFor(ctx.actor.roles);
  if (granted.includes('platform.admin')) return true;
  if (permissions.some(p => granted.includes(p))) return true;
  throw fail('FORBIDDEN', `missing one of: ${permissions.join(',')}`, 403);
}
