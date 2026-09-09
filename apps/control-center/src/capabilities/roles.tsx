import { For, Show, createMemo } from 'solid-js';
import { workspaceStore } from '~/stores/workspace';
import type { JSX } from 'solid-js';

export type HomeProfile = 'platform-admin' | 'tenant-admin' | 'developer' | 'security' | 'tenant-viewer';

export function deriveHomeProfile(roles: string[] = [], permissions: string[] = []): HomeProfile {
  if (roles.includes('platform.admin') || permissions.includes('platform.admin')) return 'platform-admin';
  if (roles.includes('tenant.admin')) return 'tenant-admin';
  if (roles.some((r) => /security/i.test(r)) || permissions.includes('security.manage')) return 'security';
  if (roles.includes('tenant.editor') || permissions.includes('app.create')) return 'developer';
  return 'tenant-viewer';
}

export function roleNavFilter(profile: HomeProfile, href: string): boolean {
  const allow: Record<HomeProfile, string[]> = {
    'platform-admin': ['*'],
    'tenant-admin': ['/', '/apps', '/ai', '/commerce', '/automation', '/build', '/tenants', '/clients', '/infrastructure', '/operations', '/sagas', '/governance', '/settings'],
    developer: ['/', '/apps', '/build', '/ai', '/automation', '/ecosystem', '/operations', '/sagas', '/infrastructure', '/settings'],
    security: ['/', '/security', '/governance', '/operations', '/settings'],
    'tenant-viewer': ['/', '/apps', '/build', '/settings']
  };
  const list = allow[profile] || allow['tenant-viewer'];
  if (list.includes('*')) return true;
  return list.some((p) => href === p || href.startsWith(p + '/'));
}

export function RoleHome(props: {
  profile: HomeProfile;
  metrics?: Record<string, number> | null;
  children?: JSX.Element;
}) {
  const cards = createMemo(() => {
    switch (props.profile) {
      case 'platform-admin':
        return [
          { t: 'Platform health', d: 'Tenants, queues, failed sagas' },
          { t: 'Revenue pulse', d: 'Subscriptions + invoices from control plane' },
          { t: 'Security posture', d: 'IP rules + audit volume' }
        ];
      case 'tenant-admin':
        return [
          { t: 'My apps', d: 'Launcher + provision' },
          { t: 'Billing', d: 'Orders and subscriptions' },
          { t: 'Users & workflows', d: 'Automation and support' }
        ];
      case 'developer':
        return [
          { t: 'Deploy surface', d: 'Apps, builders, capabilities' },
          { t: 'Logs & traces', d: 'Correlation-driven debugging' },
          { t: 'Providers', d: 'Ecosystem contracts' }
        ];
      case 'security':
        return [
          { t: 'IP controls', d: 'BLOCK / ALLOW / CHALLENGE' },
          { t: 'Audit', d: 'Immutable trail' },
          { t: 'Secrets posture', d: 'References only' }
        ];
      default:
        return [
          { t: 'Apps', d: 'Read-only launcher' },
          { t: 'Build', d: 'Content & previews' }
        ];
    }
  });

  return (
    <div class="role-home">
      <p style={{ color: 'var(--bridge-text-muted)' }}>
        Home profile: <strong>{props.profile}</strong> · env {workspaceStore.environment}
      </p>
      <div class="metric-grid" style={{ 'margin': '1rem 0' }}>
        <For each={cards()}>
          {(c) => (
            <article class="metric-card">
              <span>{c.t}</span>
              <strong style={{ 'font-size': '1rem' }}>{c.d}</strong>
            </article>
          )}
        </For>
      </div>
      <Show when={props.metrics}>
        <div class="metric-grid">
          <For each={Object.entries(props.metrics || {})}>
            {([k, v]) => (
              <article class="metric-card">
                <span>{k}</span>
                <strong>{v}</strong>
              </article>
            )}
          </For>
        </div>
      </Show>
      {props.children}
    </div>
  );
}
