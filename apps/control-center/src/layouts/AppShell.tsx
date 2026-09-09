import { For, Show, type JSX, createMemo } from 'solid-js';
import { A, useLocation } from '@solidjs/router';
import { workspaceStore, setTenant, toggleRail, setWorkspace } from '~/stores/workspace';

export type NavItem = { id: string; label: string; href: string; section?: string };

const FALLBACK_NAV: NavItem[] = [
  { id: 'command', label: 'Command Center', href: '/', section: 'Overview' },
  { id: 'tenants', label: 'Tenants', href: '/tenants', section: 'Tenants' },
  { id: 'clients', label: 'Clients', href: '/clients', section: 'Tenants' },
  { id: 'marketplace', label: 'Marketplace', href: '/marketplace', section: 'Apps' },
  { id: 'apps', label: 'App Launcher', href: '/apps', section: 'Apps' },
  { id: 'my-apps', label: 'My Apps', href: '/my-apps', section: 'Apps' },
  { id: 'build', label: 'Build', href: '/build', section: 'Build' },
  { id: 'ai', label: 'AI Workspace', href: '/ai', section: 'AI' },
  { id: 'agents', label: 'Agents', href: '/agents', section: 'AI' },
  { id: 'automation', label: 'Automation', href: '/automation', section: 'Automation' },
  { id: 'sagas', label: 'Sagas', href: '/sagas', section: 'Automation' },
  { id: 'commerce', label: 'Commerce', href: '/commerce', section: 'Commerce' },
  { id: 'affiliates', label: 'Affiliates', href: '/affiliates', section: 'Commerce' },
  { id: 'infra', label: 'Infrastructure', href: '/infrastructure', section: 'Infrastructure' },
  { id: 'ecosystem', label: 'Ecosystem', href: '/ecosystem', section: 'Ecosystem' },
  { id: 'security', label: 'Security', href: '/security', section: 'Security' },
  { id: 'operations', label: 'Operations', href: '/operations', section: 'Operations' },
  { id: 'audit', label: 'Audit', href: '/governance', section: 'Governance' },
  { id: 'settings', label: 'Settings', href: '/settings', section: 'Settings' }
];

export function AppShell(props: {
  children: JSX.Element;
  nav?: NavItem[];
  tenants?: Array<{ id: string; name: string }>;
  health?: string;
  onOpenCommand?: () => void;
}) {
  const location = useLocation();
  const items = createMemo(() => props.nav?.length ? props.nav : FALLBACK_NAV);
  const sections = createMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items()) {
      const s = item.section || 'Platform';
      if (!map.has(s)) map.set(s, []);
      map.get(s)!.push(item);
    }
    return [...map.entries()];
  });

  return (
    <div class={`app-shell${workspaceStore.sidebarRail ? ' rail' : ''}`}>
      <header class="topbar">
        <button class="btn btn-ghost" type="button" onClick={() => setWorkspace('mobileNavOpen', (v) => !v)} aria-label="Menu">
          ☰
        </button>
        <div class="brand">
          BRIDGE <span>OS</span>
        </div>
        <button class="btn" type="button" style={{ flex: '1', 'text-align': 'left' }} onClick={() => props.onOpenCommand?.()}>
          Search / Command · ⌘K
        </button>
        <select
          class="select"
          style={{ width: '220px' }}
          value={workspaceStore.tenantId || ''}
          onChange={(e) => {
            const id = e.currentTarget.value;
            const t = props.tenants?.find((x) => x.id === id);
            setTenant(id || null, t?.name || null);
          }}
        >
          <option value="">Select tenant</option>
          <For each={props.tenants || []}>{(t) => <option value={t.id}>{t.name}</option>}</For>
        </select>
        <span class="status-pill status-ok">{workspaceStore.environment}</span>
        <button class="btn btn-ghost" type="button" onClick={toggleRail}>
          Rail
        </button>
        <span>{workspaceStore.userLabel}</span>
      </header>

      <aside class={`sidebar${workspaceStore.mobileNavOpen ? ' open' : ''}`}>
        <For each={sections()}>
          {([section, links]) => (
            <div class="nav-section">
              <Show when={!workspaceStore.sidebarRail}>
                <h3>{section}</h3>
              </Show>
              <For each={links}>
                {(item) => (
                  <A
                    href={item.href}
                    class={`nav-link${location.pathname === item.href ? ' active' : ''}`}
                    onClick={() => setWorkspace('mobileNavOpen', false)}
                  >
                    <span aria-hidden="true">◆</span>
                    <Show when={!workspaceStore.sidebarRail}>
                      <span>{item.label}</span>
                    </Show>
                  </A>
                )}
              </For>
            </div>
          )}
        </For>
      </aside>

      <main class="workspace">{props.children}</main>

      <footer class="statusbar">
        <span class={`status-pill ${props.health === 'healthy' ? 'status-ok' : 'status-warn'}`}>
          API {props.health || 'unknown'}
        </span>
        <span>Tenant: {workspaceStore.tenantName || 'none'}</span>
        <span>Control plane · deny-by-default</span>
      </footer>
    </div>
  );
}
