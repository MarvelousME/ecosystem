import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import { platformApi, type MarketplaceInstallation } from '~/api/platform';
import { workspaceStore } from '~/stores/workspace';
import { pageEnter } from '~/motion/registry';

export function InstallationsPage() {
  let root!: HTMLElement;
  const [installations, { refetch }] = createResource(() => workspaceStore.tenantId, () => platformApi.marketplace.installations());
  const [selectedInstallation, setSelectedInstallation] = createSignal<MarketplaceInstallation | null>(null);
  const [config, setConfig] = createSignal<Record<string, unknown>>({});
  const [saving, setSaving] = createSignal(false);
  const [message, setMessage] = createSignal('');
  onMount(() => pageEnter(root));

  async function saveConfig() {
    const installation = selectedInstallation();
    if (!installation) return;
    setSaving(true);
    setMessage('');
    try {
      await platformApi.marketplace.configureInstallation(installation.id, config());
      setMessage('Configuration saved');
      refetch();
    } catch (e: any) {
      setMessage(`Failed to save: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function uninstall(installationId: string) {
    if (!confirm('Are you sure you want to uninstall this application?')) return;
    
    try {
      await platformApi.marketplace.uninstall(installationId);
      setMessage('Uninstallation requested');
      setSelectedInstallation(null);
      refetch();
    } catch (e: any) {
      setMessage(`Failed to uninstall: ${e.message}`);
    }
  }

  async function viewSteps(installationId: string) {
    try {
      const detail = await platformApi.marketplace.installation(installationId);
      setSelectedInstallation(detail);
      setConfig(detail.config || {});
    } catch (e: any) {
      setMessage(`Failed to load details: ${e.message}`);
    }
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>My Apps</h1>
          <p>Installed marketplace applications</p>
        </div>
      </div>

      <Show when={message()}>
        <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
          <p>{message()}</p>
        </div>
      </Show>

      <div class="metric-grid">
        <For each={installations() || []}>
          {(inst) => (
            <article class="panel panel-pad">
              <span class={`status-pill ${inst.state === 'ready' ? 'status-ok' : 'status-warn'}`}>
                {inst.state.toUpperCase()}
              </span>
              <h3 style={{ 'font-family': 'var(--bridge-display)', margin: '0.6rem 0 0.2rem' }}>
                {inst.package_name}
              </h3>
              <p style={{ color: 'var(--bridge-text-muted)', margin: '0.2rem 0', 'font-size': '0.9rem' }}>
                {inst.package_key} · v{inst.version_number}
              </p>
              <p style={{ color: 'var(--bridge-text-muted)', margin: '0.2rem 0', 'font-size': '0.8rem' }}>
                Installed: {inst.installed_at ? new Date(inst.installed_at).toLocaleDateString() : 'N/A'}
              </p>
              <Show when={inst.error}>
                <p style={{ color: 'var(--bridge-danger)', 'font-size': '0.8rem' }}>
                  Error: {inst.error}
                </p>
              </Show>
              <div style={{ display: 'flex', gap: '0.5rem', 'margin-top': '1rem' }}>
                <button
                  class="btn"
                  type="button"
                  onClick={() => viewSteps(inst.id)}
                >
                  View Details
                </button>
                <Show when={inst.state === 'ready'}>
                  <button
                    class="btn"
                    type="button"
                    onClick={() => {
                      setSelectedInstallation(inst);
                      setConfig(inst.config || {});
                    }}
                  >
                    Configure
                  </button>
                </Show>
                <button
                  class="btn"
                  type="button"
                  onClick={() => uninstall(inst.id)}
                >
                  Uninstall
                </button>
              </div>
            </article>
          )}
        </For>
      </div>

      <Show when={selectedInstallation()}>
        <div class="panel panel-pad" style={{ 'margin-top': '1rem' }}>
          <h3>{selectedInstallation()!.package_name} - Configuration</h3>
          <p>Installation Key: {selectedInstallation()!.installation_key}</p>
          
          <h4>Installation Steps</h4>
          <ul>
            <For each={selectedInstallation()!.steps || []}>
              {(step: any) => (
                <li style={{ color: step.status === 'SUCCEEDED' ? 'var(--bridge-success)' : step.status === 'FAILED' ? 'var(--bridge-danger)' : 'inherit' }}>
                  {step.step_name}: {step.status}
                  <Show when={step.detail}>
                    <pre style={{ 'font-size': '0.75rem', 'margin': '0.2rem 0' }}>{JSON.stringify(step.detail, null, 2)}</pre>
                  </Show>
                </li>
              )}
            </For>
          </ul>

          <h4>Configuration</h4>
          <pre style={{ 'font-family': 'var(--bridge-mono)', 'font-size': '0.8rem', 'background': 'var(--bridge-bg-secondary)', padding: '1rem', 'border-radius': '4px' }}>
            {JSON.stringify(selectedInstallation()!.config, null, 2)}
          </pre>
          
          <div style={{ display: 'flex', gap: '0.5rem', 'margin-top': '1rem' }}>
            <button
              class="btn btn-primary"
              type="button"
              disabled={saving()}
              onClick={saveConfig}
            >
              {saving() ? 'Saving...' : 'Save Configuration'}
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => setSelectedInstallation(null)}
            >
              Close
            </button>
          </div>
        </div>
      </Show>
    </section>
  );
}
