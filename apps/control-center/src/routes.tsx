/**
 * SolidStart-compatible file-based route table (SPA adapter).
 * Full Vinxi SSR remains optional — nginx/Traefik serves static build.
 * Route modules live under `src/routes/**` for future SolidStart file routing.
 */
import type { Component } from 'solid-js';
import { LoginPage, AuthCallbackPage, LogoutPage } from '~/features/auth/AuthPages';
import HomeRoute from '~/routes/index';
import AutomationRoute from '~/routes/automation';
import BuildRoute from '~/routes/build';
import LogsRoute from '~/routes/operations/logs';
import TracesRoute from '~/routes/operations/traces';
import { AppsPage, GenericResourcePage } from '~/features/shared/Pages';
import {
  AiPage,
  CommercePage,
  InfrastructurePage,
  SecurityPage
} from '~/features/modules/FeaturePages';
import { MarketplacePage } from '~/features/marketplace/MarketplacePage';
import { InstallationsPage } from '~/features/marketplace/InstallationsPage';
import { AgentsPage } from '~/features/agents/AgentsPage';
import { FrontendMcpPage } from '~/features/frontend-mcp/FrontendMcpPage';
import { Client360Page, ClientsPage } from '~/features/clients/Client360Page';
import { Tenant360Page } from '~/features/tenants/Tenant360Page';
import { platformApi } from '~/api/platform';

export type AppRoute = {
  path: string;
  component: Component;
  auth?: boolean;
  shell?: boolean;
};

export const appRoutes: AppRoute[] = [
  { path: '/login', component: LoginPage, auth: false, shell: false },
  { path: '/auth/callback', component: AuthCallbackPage, auth: false, shell: false },
  { path: '/logout', component: LogoutPage, auth: false, shell: false },
  { path: '/', component: HomeRoute, shell: true },
  {
    path: '/tenants',
    component: () => (
      <GenericResourcePage title="Tenants" subtitle="Control-plane tenants" loader={() => platformApi.tenants()} columns={['name', 'slug', 'plan', 'isolation_mode']} />
    ),
    shell: true
  },
  { path: '/tenants/:tenantId', component: Tenant360Page, shell: true },
  {
    path: '/clients',
    component: ClientsPage,
    shell: true
  },
  { path: '/clients/:clientId', component: Client360Page, shell: true },
  { path: '/marketplace', component: MarketplacePage, shell: true },
  { path: '/apps', component: AppsPage, shell: true },
  { path: '/my-apps', component: InstallationsPage, shell: true },
  { path: '/build', component: BuildRoute, shell: true },
  { path: '/ai', component: AiPage, shell: true },
  { path: '/agents', component: AgentsPage, shell: true },
  { path: '/ecosystem/frontend-mcp', component: FrontendMcpPage, shell: true },
  { path: '/automation', component: AutomationRoute, shell: true },
  {
    path: '/sagas',
    component: () => (
      <GenericResourcePage title="Sagas" subtitle="Provisioning saga history" loader={() => platformApi.sagas()} columns={['id', 'saga_type', 'state', 'current_step', 'attempts']} />
    ),
    shell: true
  },
  { path: '/commerce', component: CommercePage, shell: true },
  {
    path: '/affiliates',
    component: () => (
      <GenericResourcePage title="Affiliates" subtitle="Acquisition partners" loader={() => platformApi.affiliates()} columns={['name', 'code', 'email', 'status']} />
    ),
    shell: true
  },
  { path: '/infrastructure', component: InfrastructurePage, shell: true },
  {
    path: '/ecosystem',
    component: () => (
      <GenericResourcePage
        title="Ecosystem"
        subtitle="Subsystems · capabilities · providers"
        loader={async () => {
          const [s, c, p] = await Promise.all([
            platformApi.subsystems(),
            platformApi.capabilities(),
            platformApi.providers()
          ]);
          return [
            ...s.map((x: any) => ({ kind: 'subsystem', ...x })),
            ...c.map((x: any) => ({ kind: 'capability', ...x })),
            ...p.map((x: any) => ({ kind: 'provider', ...x }))
          ];
        }}
        columns={['kind', 'id', 'description', 'contract', 'status']}
      />
    ),
    shell: true
  },
  { path: '/security', component: SecurityPage, shell: true },
  {
    path: '/operations',
    component: () => (
      <GenericResourcePage title="Operations" subtitle="Managed resources lifecycle" loader={() => platformApi.resources()} columns={['name', 'kind', 'state', 'version']} />
    ),
    shell: true
  },
  { path: '/operations/logs', component: LogsRoute, shell: true },
  { path: '/operations/traces', component: TracesRoute, shell: true },
  {
    path: '/governance',
    component: () => (
      <GenericResourcePage title="Governance / Audit" subtitle="Immutable control-plane audit trail" loader={() => platformApi.audit()} columns={['created_at', 'actor', 'action', 'resource_type']} />
    ),
    shell: true
  },
  {
    path: '/settings',
    component: () => (
      <GenericResourcePage
        title="Settings"
        subtitle="Environment and session"
        loader={async () => {
          const me = await platformApi.me();
          return [{ ...me, note: 'secrets never rendered' }];
        }}
      />
    ),
    shell: true
  }
];
