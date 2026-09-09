import { apiFetch } from './client';

export type ApiRecord = Record<string, unknown>;

export type MarketplaceVersion = ApiRecord & {
  id: string;
  version: string;
  changelog?: string | null;
  requires_entitlement?: string | null;
};

export type MarketplacePackage = ApiRecord & {
  id: string;
  package_key: string;
  name: string;
  description?: string | null;
  publisher_id: string;
  category: string;
  featured?: boolean;
  documentation_url?: string | null;
  source_url?: string | null;
  versions?: MarketplaceVersion[];
};

export type MarketplaceCategory = ApiRecord & {
  id: string;
  name: string;
  slug: string;
};

export type MarketplaceInstallation = ApiRecord & {
  id: string;
  installation_key: string;
  package_name: string;
  package_key: string;
  version_number: string;
  state: string;
  config?: ApiRecord;
  installed_at?: string | null;
  error?: string | null;
  steps?: Array<ApiRecord & { step_name: string; status: string; detail?: unknown }>;
};

export type AgentTemplate = ApiRecord & {
  id: string;
  template_key: string;
  name: string;
  description?: string | null;
  category: string;
  model?: string | null;
  skills?: string[];
  capabilities?: string[];
};

export type AgentInstance = ApiRecord & {
  id: string;
  agent_key: string;
  name: string;
  description?: string | null;
  template_name?: string | null;
  model?: string | null;
  status: string;
  skills?: string[];
  capabilities?: string[];
  config?: ApiRecord;
  executions?: Array<ApiRecord & { goal?: string; status?: string; created_at: string }>;
};

export type FrontendMcpRequestResult = {
  requiresApproval: boolean;
  approvalId?: string;
  message?: string;
  result?: unknown;
};

export type FrontendMcpApproval = ApiRecord & {
  id: string;
  request_type: string;
  created_at: string;
};

export type FrontendComponent = ApiRecord & {
  id: string;
  component_key: string;
  name: string;
  category: string;
  description?: string | null;
  version: string;
  provider_name?: string;
  accessibility_status: string;
};

export type FrontendInstallation = ApiRecord & {
  id: string;
  application_id: string;
  application_name: string;
  component_name?: string | null;
  template_name?: string | null;
  state: string;
  installed_at: string;
};

export const platformApi = {
  health: () => apiFetch<{ status: string; service?: string; secrets?: unknown }>('/health', { skipAuth: true }),
  navigation: () => apiFetch<Array<{ id: string; label: string; href: string; permission?: string }>>('/api/navigation'),
  commandCenter: () => apiFetch<Record<string, number>>('/api/command-center'),
  tenants: () => apiFetch<Array<Record<string, unknown>>>('/api/tenants'),
  apps: () => apiFetch<Array<Record<string, unknown>>>('/api/apps'),
  createApp: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/apps', { method: 'POST', body: JSON.stringify(body) }),
  clients: () => apiFetch<Array<Record<string, unknown>>>('/api/clients'),
  client360: (id: string) => apiFetch<Record<string, unknown>>(`/api/clients/${id}/360`),
  products: () => apiFetch<Array<Record<string, unknown>>>('/api/products'),
  createOrder: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  paymentWebhook: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/payments/webhook', { method: 'POST', body: JSON.stringify(body) }),
  capabilities: () => apiFetch<Array<Record<string, unknown>>>('/api/capabilities'),
  providers: () => apiFetch<Array<Record<string, unknown>>>('/api/providers'),
  subsystems: () => apiFetch<Array<Record<string, unknown>>>('/api/subsystems'),
  components: () => apiFetch<Array<Record<string, unknown>>>('/api/components'),
  brand: () => apiFetch<Record<string, unknown>>('/api/brand'),
  cmsModels: () => apiFetch<Array<Record<string, unknown>>>('/api/cms/models'),
  databases: () => apiFetch<Array<Record<string, unknown>>>('/api/databases'),
  databaseHealth: () => apiFetch<Record<string, unknown>>('/api/databases/providers/health'),
  provisionDatabase: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/databases', { method: 'POST', body: JSON.stringify(body) }),
  workflows: () => apiFetch<Array<Record<string, unknown>>>('/api/workflows'),
  securityRules: () => apiFetch<Array<Record<string, unknown>>>('/api/security/rules'),
  createSecurityRule: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/security/rules', { method: 'POST', body: JSON.stringify(body) }),
  affiliates: () => apiFetch<Array<Record<string, unknown>>>('/api/affiliates'),
  audit: () => apiFetch<Array<Record<string, unknown>>>('/api/audit'),
  search: (q: string) => apiFetch<Record<string, unknown[]>>(`/api/search?q=${encodeURIComponent(q)}`),
  resources: () => apiFetch<Array<Record<string, unknown>>>('/api/resources'),
  lifecycle: (id: string, action: string) =>
    apiFetch<Record<string, unknown>>(`/api/resources/${id}/lifecycle`, { method: 'POST', body: JSON.stringify({ action }) }),
  provision: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/provision', { method: 'POST', body: JSON.stringify(body) }),
  saga: (id: string) => apiFetch<Record<string, unknown>>(`/api/sagas/${id}`),
  phoneChange: (body: Record<string, unknown>) =>
    apiFetch<{ changesets?: Array<{ id: string }> }>('/api/ai/website/phone-change', { method: 'POST', body: JSON.stringify(body) }),
  approveChangeset: (id: string) =>
    apiFetch<Record<string, unknown>>(`/api/changesets/${id}/approve`, { method: 'POST', body: '{}' }),
  aiChat: (messages: Array<{ role: string; content: string }>) =>
    apiFetch<{ content: string; model?: string }>('/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ messages })
    }),
  puckSchema: () => apiFetch<Record<string, unknown>>('/api/builders/puck/schema'),
  openBuilder: (appId: string) => apiFetch<Record<string, unknown>>(`/api/builders/apps/${appId}`),
  imports: () => apiFetch<Array<Record<string, unknown>>>('/api/imports'),
  tickets: () => apiFetch<Array<Record<string, unknown>>>('/api/support/tickets'),
  me: () =>
    apiFetch<{
      actor: { id: string; roles: string[] };
      permissions: string[];
      roles: string[];
      homeProfile: string;
      tenantId: string | null;
    }>('/api/me'),
  sagas: (limit = 50) => apiFetch<Array<Record<string, unknown>>>(`/api/sagas?limit=${limit}`),
  logs: (opts: { q?: string; limit?: number; cursor?: number } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set('q', opts.q);
    if (opts.limit) p.set('limit', String(opts.limit));
    if (opts.cursor) p.set('cursor', String(opts.cursor));
    return apiFetch<{ items: any[]; nextCursor: number | null }>(`/api/logs?${p}`);
  },
  trace: (correlationId: string) => apiFetch<Record<string, unknown>>(`/api/traces/${encodeURIComponent(correlationId)}`),
  createWorkflow: (body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>('/api/workflows', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkflow: (id: string, body: Record<string, unknown>) =>
    apiFetch<Record<string, unknown>>(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  executeWorkflow: (id: string, body: Record<string, unknown> = {}) =>
    apiFetch<Record<string, unknown>>(`/api/workflows/${id}/execute`, { method: 'POST', body: JSON.stringify(body) }),
  marketplace: {
    discover: () => apiFetch<MarketplacePackage[]>('/api/marketplace/discover'),
    packages: () => apiFetch<MarketplacePackage[]>('/api/marketplace/packages'),
    package: (id: string) => apiFetch<MarketplacePackage>(`/api/marketplace/packages/${id}`),
    install: (body: Record<string, unknown>) =>
      apiFetch<MarketplaceInstallation>('/api/marketplace/install', { method: 'POST', body: JSON.stringify(body) }),
    installations: () => apiFetch<MarketplaceInstallation[]>('/api/marketplace/installations'),
    installation: (id: string) => apiFetch<MarketplaceInstallation>(`/api/marketplace/installations/${id}`),
    configureInstallation: (id: string, body: Record<string, unknown>) =>
      apiFetch<MarketplaceInstallation>(`/api/marketplace/installations/${id}/configure`, {
        method: 'POST',
        body: JSON.stringify({ config: body })
      }),
    uninstall: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/marketplace/installations/${id}/uninstall`, { method: 'POST' }),
    categories: () => apiFetch<MarketplaceCategory[]>('/api/marketplace/categories')
  },
  agents: {
    templates: () => apiFetch<AgentTemplate[]>('/api/agents/templates'),
    template: (key: string) => apiFetch<AgentTemplate>(`/api/agents/templates/${key}`),
    instantiate: (body: Record<string, unknown>) =>
      apiFetch<AgentInstance>('/api/agents/instantiate', { method: 'POST', body: JSON.stringify(body) }),
    instances: () => apiFetch<AgentInstance[]>('/api/agents/instances'),
    instance: (id: string) => apiFetch<AgentInstance>(`/api/agents/instances/${id}`),
    configureInstance: (id: string, body: Record<string, unknown>) =>
      apiFetch<AgentInstance>(`/api/agents/instances/${id}/configure`, { method: 'POST', body: JSON.stringify(body) }),
    executeInstance: (id: string, body: Record<string, unknown>) =>
      apiFetch<ApiRecord>(`/api/agents/instances/${id}/execute`, { method: 'POST', body: JSON.stringify(body) }),
    deleteInstance: (id: string) =>
      apiFetch<void>(`/api/agents/instances/${id}`, { method: 'DELETE' })
  },
  frontendMcp: {
    providers: () => apiFetch<ApiRecord[]>('/api/frontend-mcp/providers'),
    providerHealth: (id: string) => apiFetch<ApiRecord>(`/api/frontend-mcp/providers/${id}/health`),
    request: (body: Record<string, unknown>) =>
      apiFetch<FrontendMcpRequestResult>('/api/frontend-mcp/request', { method: 'POST', body: JSON.stringify(body) }),
    approvals: () => apiFetch<FrontendMcpApproval[]>('/api/frontend-mcp/approvals'),
    approve: (id: string) =>
      apiFetch<{ approved: boolean; result?: unknown }>(`/api/frontend-mcp/approvals/${id}/approve`, { method: 'POST' }),
    reject: (id: string) =>
      apiFetch<{ success: boolean }>(`/api/frontend-mcp/approvals/${id}/reject`, { method: 'POST' }),
    components: (q = '') => apiFetch<FrontendComponent[]>(`/api/frontend-mcp/components${q ? `?q=${encodeURIComponent(q)}` : ''}`),
    templates: () => apiFetch<ApiRecord[]>('/api/frontend-mcp/templates'),
    installations: () => apiFetch<FrontendInstallation[]>('/api/frontend-mcp/installations'),
    installComponent: (id: string, body: Record<string, unknown>) =>
      apiFetch<FrontendInstallation>(`/api/frontend-mcp/components/${id}/install`, { method: 'POST', body: JSON.stringify(body) })
  }
};
