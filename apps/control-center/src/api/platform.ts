import { apiFetch } from './client';

export const platformApi = {
  health: () => apiFetch<{ status: string; service?: string; secrets?: unknown }>('/health', { skipAuth: true }),
  navigation: () => apiFetch<Array<{ id: string; label: string; href: string; permission?: string }>>('/api/navigation'),
  commandCenter: () => apiFetch<Record<string, number>>('/api/command-center'),
  tenants: () => apiFetch<Array<Record<string, unknown>>>('/api/tenants'),
  apps: () => apiFetch<Array<Record<string, unknown>>>('/api/apps'),
  createApp: (body: Record<string, unknown>) =>
    apiFetch('/api/apps', { method: 'POST', body: JSON.stringify(body) }),
  clients: () => apiFetch<Array<Record<string, unknown>>>('/api/clients'),
  client360: (id: string) => apiFetch<Record<string, unknown>>(`/api/clients/${id}/360`),
  products: () => apiFetch<Array<Record<string, unknown>>>('/api/products'),
  createOrder: (body: Record<string, unknown>) =>
    apiFetch('/api/orders', { method: 'POST', body: JSON.stringify(body) }),
  paymentWebhook: (body: Record<string, unknown>) =>
    apiFetch('/api/payments/webhook', { method: 'POST', body: JSON.stringify(body) }),
  capabilities: () => apiFetch<Array<Record<string, unknown>>>('/api/capabilities'),
  providers: () => apiFetch<Array<Record<string, unknown>>>('/api/providers'),
  subsystems: () => apiFetch<Array<Record<string, unknown>>>('/api/subsystems'),
  components: () => apiFetch<Array<Record<string, unknown>>>('/api/components'),
  brand: () => apiFetch<Record<string, unknown>>('/api/brand'),
  cmsModels: () => apiFetch<Array<Record<string, unknown>>>('/api/cms/models'),
  databases: () => apiFetch<Array<Record<string, unknown>>>('/api/databases'),
  databaseHealth: () => apiFetch<Record<string, unknown>>('/api/databases/providers/health'),
  provisionDatabase: (body: Record<string, unknown>) =>
    apiFetch('/api/databases', { method: 'POST', body: JSON.stringify(body) }),
  workflows: () => apiFetch<Array<Record<string, unknown>>>('/api/workflows'),
  securityRules: () => apiFetch<Array<Record<string, unknown>>>('/api/security/rules'),
  createSecurityRule: (body: Record<string, unknown>) =>
    apiFetch('/api/security/rules', { method: 'POST', body: JSON.stringify(body) }),
  affiliates: () => apiFetch<Array<Record<string, unknown>>>('/api/affiliates'),
  audit: () => apiFetch<Array<Record<string, unknown>>>('/api/audit'),
  search: (q: string) => apiFetch<Record<string, unknown[]>>(`/api/search?q=${encodeURIComponent(q)}`),
  resources: () => apiFetch<Array<Record<string, unknown>>>('/api/resources'),
  lifecycle: (id: string, action: string) =>
    apiFetch(`/api/resources/${id}/lifecycle`, { method: 'POST', body: JSON.stringify({ action }) }),
  provision: (body: Record<string, unknown>) =>
    apiFetch('/api/provision', { method: 'POST', body: JSON.stringify(body) }),
  saga: (id: string) => apiFetch<Record<string, unknown>>(`/api/sagas/${id}`),
  phoneChange: (body: Record<string, unknown>) =>
    apiFetch('/api/ai/website/phone-change', { method: 'POST', body: JSON.stringify(body) }),
  approveChangeset: (id: string) =>
    apiFetch(`/api/changesets/${id}/approve`, { method: 'POST', body: '{}' }),
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
    apiFetch('/api/workflows', { method: 'POST', body: JSON.stringify(body) }),
  updateWorkflow: (id: string, body: Record<string, unknown>) =>
    apiFetch(`/api/workflows/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  executeWorkflow: (id: string, body: Record<string, unknown> = {}) =>
    apiFetch(`/api/workflows/${id}/execute`, { method: 'POST', body: JSON.stringify(body) }),
  // Marketplace
  marketplace: {
    discover: () => apiFetch('/api/marketplace/discover'),
    packages: () => apiFetch('/api/marketplace/packages'),
    package: (id: string) => apiFetch(`/api/marketplace/packages/${id}`),
    install: (body: Record<string, unknown>) =>
      apiFetch('/api/marketplace/install', { method: 'POST', body: JSON.stringify(body) }),
    installations: () => apiFetch('/api/marketplace/installations'),
    installation: (id: string) => apiFetch(`/api/marketplace/installations/${id}`),
    configureInstallation: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/api/marketplace/installations/${id}/configure`, { method: 'POST', body: JSON.stringify(body) }),
    uninstall: (id: string) =>
      apiFetch(`/api/marketplace/installations/${id}/uninstall`, { method: 'POST' }),
    categories: () => apiFetch('/api/marketplace/categories')
  },
  // Agents
  agents: {
    templates: () => apiFetch('/api/agents/templates'),
    template: (key: string) => apiFetch(`/api/agents/templates/${key}`),
    instantiate: (body: Record<string, unknown>) =>
      apiFetch('/api/agents/instantiate', { method: 'POST', body: JSON.stringify(body) }),
    instances: () => apiFetch('/api/agents/instances'),
    instance: (id: string) => apiFetch(`/api/agents/instances/${id}`),
    configureInstance: (id: string, body: Record<string, unknown>) =>
      apiFetch(`/api/agents/instances/${id}/configure`, { method: 'POST', body: JSON.stringify(body) }),
    deleteInstance: (id: string) =>
      apiFetch(`/api/agents/instances/${id}`, { method: 'DELETE' })
  },
  // Frontend MCP
  frontendMcp: {
    providers: () => apiFetch('/api/frontend-mcp/providers'),
    providerHealth: (id: string) => apiFetch(`/api/frontend-mcp/providers/${id}/health`),
    request: (body: Record<string, unknown>) =>
      apiFetch('/api/frontend-mcp/request', { method: 'POST', body: JSON.stringify(body) }),
    approvals: () => apiFetch('/api/frontend-mcp/approvals'),
    approve: (id: string) =>
      apiFetch(`/api/frontend-mcp/approvals/${id}/approve`, { method: 'POST' }),
    reject: (id: string) =>
      apiFetch(`/api/frontend-mcp/approvals/${id}/reject`, { method: 'POST' })
  }
};
