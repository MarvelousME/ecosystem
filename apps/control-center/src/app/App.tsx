import { Show, createResource, createSignal, onMount, type Component } from 'solid-js';
import { Navigate, Router, Route, useNavigate, type RouteSectionProps } from '@solidjs/router';
import { QueryClient, QueryClientProvider } from '@tanstack/solid-query';
import { isAuthRequired } from '~/auth/auth-config';
import { isAuthenticated } from '~/auth/oidc';
import { bootstrapUserLabel } from '~/features/auth/AuthPages';
import { AppShell, type NavItem } from '~/layouts/AppShell';
import { platformApi } from '~/api/platform';
import { CommandPalette, useCommandHotkey } from '~/command/CommandPalette';
import { setTenant, setTheme, workspaceStore } from '~/stores/workspace';
import { appRoutes } from '~/routes';
import { deriveHomeProfile, roleNavFilter, type HomeProfile } from '~/capabilities/roles';
import '~/styles/tokens.css';
import '~/primitives/forms.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 10_000 } }
});

function Protected(props: { children: any }) {
  const [ok] = createResource(async () => {
    if (!isAuthRequired()) return true;
    return isAuthenticated();
  });
  return (
    <Show when={!ok.loading} fallback={<div class="login-page"><p>Checking session…</p></div>}>
      <Show when={ok()} fallback={<Navigate href="/login" />}>
        {props.children}
      </Show>
    </Show>
  );
}

function ShellFrame(props: RouteSectionProps) {
  const navigate = useNavigate();
  const [commandOpen, setCommandOpen] = createSignal(false);
  const [health] = createResource(() => platformApi.health());
  const [me] = createResource(() => platformApi.me());
  const [tenants] = createResource(async () => {
    const rows = await platformApi.tenants();
    if (!workspaceStore.tenantId && rows[0]) {
      setTenant(String(rows[0].id), String(rows[0].name));
    }
    return rows.map((t: any) => ({ id: String(t.id), name: String(t.name) }));
  });
  const [nav] = createResource(me, async (profileMe) => {
    const profile = (profileMe?.homeProfile ||
      deriveHomeProfile(profileMe?.roles || [], profileMe?.permissions || [])) as HomeProfile;
    const extras: NavItem[] = [
      { id: 'logs', label: 'Logs', href: '/operations/logs', section: 'Operations' },
      { id: 'traces', label: 'Traces', href: '/operations/traces', section: 'Operations' },
      { id: 'automation', label: 'Workflow Builder', href: '/automation', section: 'Automation' },
      { id: 'sagas', label: 'Sagas', href: '/sagas', section: 'Automation' }
    ];
    try {
      const items = await platformApi.navigation();
      const mapped = items.map((i): NavItem => {
        const raw = i.href || '/';
        const path = raw === '#/command' || raw === '#/' ? '/' : raw.replace(/^#/, '');
        return {
          id: i.id,
          label: i.label,
          href: path.startsWith('/') ? path : `/${path}`,
          section: 'Platform'
        };
      });
      return [...mapped, ...extras].filter((n) => roleNavFilter(profile, n.href));
    } catch {
      return [
        { id: 'command', label: 'Command Center', href: '/', section: 'Overview' },
        ...extras
      ].filter((n) => roleNavFilter(profile, n.href));
    }
  });

  useCommandHotkey(() => setCommandOpen(true));
  onMount(() => {
    setTheme(workspaceStore.theme);
    bootstrapUserLabel();
  });

  return (
    <Protected>
      <AppShell
        nav={nav()}
        tenants={tenants() || []}
        health={health()?.status}
        onOpenCommand={() => setCommandOpen(true)}
      >
        <Show when={me()}>
          <p style={{ 'font-size': '0.75rem', color: 'var(--bridge-text-faint)', margin: '0 0 0.75rem' }}>
            Role home: {me()!.homeProfile} · actor {me()!.actor?.id}
          </p>
        </Show>
        {props.children}
      </AppShell>
      <CommandPalette open={commandOpen()} onClose={() => setCommandOpen(false)} onNavigate={(h) => navigate(h)} />
    </Protected>
  );
}

const publicRoutes = appRoutes.filter((r) => r.shell === false);
const shellRoutes = appRoutes.filter((r) => r.shell !== false);

function Routes() {
  return (
    <Router>
      {publicRoutes.map((r) => {
        const Comp = r.component as Component;
        return <Route path={r.path} component={Comp} />;
      })}
      <Route path="/" component={ShellFrame}>
        {shellRoutes.map((r) => {
          const Comp = r.component as Component;
          const childPath = r.path === '/' ? '/' : r.path.replace(/^\//, '');
          return <Route path={childPath} component={Comp} />;
        })}
      </Route>
    </Router>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Routes />
    </QueryClientProvider>
  );
}
