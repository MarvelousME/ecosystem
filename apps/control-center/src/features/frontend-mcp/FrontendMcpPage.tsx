import { For, Show, createMemo, createResource, createSignal, onMount } from 'solid-js';
import { platformApi, type FrontendComponent } from '~/api/platform';
import { workspaceStore } from '~/stores/workspace';
import { pageEnter } from '~/motion/registry';

export function FrontendMcpPage() {
  let root!: HTMLElement;
  const [query, setQuery] = createSignal('');
  const [selectedApp, setSelectedApp] = createSignal('');
  const [message, setMessage] = createSignal('');
  const [busy, setBusy] = createSignal<string | null>(null);
  const [components, { refetch: refetchComponents }] = createResource(query, (q) => platformApi.frontendMcp.components(q));
  const [apps] = createResource(() => workspaceStore.tenantId, () => platformApi.apps());
  const [installations, { refetch: refetchInstallations }] = createResource(() => workspaceStore.tenantId, () => platformApi.frontendMcp.installations());
  const activeApp = createMemo(() => selectedApp() || String((apps() || [])[0]?.id || ''));
  onMount(() => pageEnter(root));

  async function install(component: FrontendComponent) {
    if (!activeApp()) { setMessage('Select a tenant application first'); return; }
    setBusy(component.id); setMessage('');
    try {
      await platformApi.frontendMcp.installComponent(component.id, { applicationId: activeApp(), configuration: {} });
      setMessage(`${component.name} installed into the selected application`);
      refetchInstallations();
    } catch (error: any) { setMessage(error.message); }
    finally { setBusy(null); }
  }

  return <section ref={root!}>
    <div class="page-header"><div><h1>Frontend MCP</h1><p>Approved components only · tenant application scope · Puck registry</p></div></div>
    <Show when={message()}><p>{message()}</p></Show>
    <div class="panel panel-pad" style={{ 'margin-bottom': '1rem', display: 'flex', gap: '0.75rem', 'flex-wrap': 'wrap' }}>
      <input class="input" value={query()} onInput={(e) => { setQuery(e.currentTarget.value); refetchComponents(); }} placeholder="Search approved components" />
      <select class="select" value={activeApp()} onChange={(e) => setSelectedApp(e.currentTarget.value)}>
        <option value="">Select application</option><For each={apps() || []}>{(app: any) => <option value={app.id}>{app.name}</option>}</For>
      </select>
    </div>
    <div class="metric-grid">
      <For each={components() || []}>{(component) => <article class="panel panel-pad">
        <span class="status-pill status-ok">Approved</span><h3>{component.name}</h3>
        <p>{component.description || component.component_key}</p>
        <small>{component.provider_name} · {component.category} · v{component.version} · {component.accessibility_status}</small>
        <div style={{ 'margin-top': '1rem' }}><button class="btn btn-primary" type="button" disabled={busy() === component.id || !activeApp()} onClick={() => install(component)}>{busy() === component.id ? 'Installing...' : 'Install'}</button></div>
      </article>}</For>
    </div>
    <div class="panel panel-pad" style={{ 'margin-top': '1rem' }}><h3>Installed</h3>
      <table class="table"><thead><tr><th>Component</th><th>Application</th><th>State</th><th>Installed</th></tr></thead><tbody>
        <For each={installations() || []}>{(item) => <tr><td>{item.component_name || item.template_name}</td><td>{item.application_name}</td><td>{item.state}</td><td>{new Date(item.installed_at).toLocaleString()}</td></tr>}</For>
      </tbody></table>
    </div>
  </section>;
}
