import { For, Show, createResource, createSignal } from 'solid-js';
import { platformApi } from '~/api/platform';
import { workspaceStore } from '~/stores/workspace';
import { pageEnter } from '~/motion/registry';
import { onMount } from 'solid-js';

export function AppsPage() {
  let root!: HTMLElement;
  const [apps, { refetch }] = createResource(() => workspaceStore.tenantId, () => platformApi.apps());
  const [busy, setBusy] = createSignal(false);
  const [msg, setMsg] = createSignal('');
  onMount(() => pageEnter(root));

  async function provisionDemo() {
    setBusy(true);
    try {
      const saga = await platformApi.provision({
        name: `App-${Date.now().toString(36)}`,
        appType: 'react',
        launchUrl: 'http://localhost:5173',
        databaseEngine: 'none'
      }) as any;
      setMsg(`Provision saga ${saga.id} accepted`);
      refetch();
    } catch (e: any) {
      setMsg(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>App Launcher</h1>
          <p>Tenant applications with live health from the control plane</p>
        </div>
        <button class="btn btn-primary" type="button" disabled={busy() || !workspaceStore.tenantId} onClick={provisionDemo}>
          Provision app
        </button>
      </div>
      <Show when={msg()}><p>{msg()}</p></Show>
      <div class="metric-grid">
        <For each={apps() || []}>
          {(app: any) => (
            <article class="panel panel-pad">
              <span class="status-pill status-ok">{app.lifecycle_status || app.status || 'READY'}</span>
              <h3 style={{ 'font-family': 'var(--bridge-display)', margin: '0.6rem 0 0.2rem' }}>{app.name}</h3>
              <p style={{ color: 'var(--bridge-text-muted)', margin: 0 }}>
                {app.app_type} · {app.database_engine} · {app.health || 'UNKNOWN'}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', 'margin-top': '1rem', 'flex-wrap': 'wrap' }}>
                <a class="btn" href={app.launch_url} target="_blank" rel="noreferrer">Launch</a>
                <a class="btn" href={`/apps/${app.id}`}>Manage</a>
              </div>
            </article>
          )}
        </For>
      </div>
    </section>
  );
}

export function GenericResourcePage(props: {
  title: string;
  subtitle: string;
  loader: () => Promise<any[] | Record<string, unknown>>;
  columns?: string[];
}) {
  let root!: HTMLElement;
  const [data] = createResource(props.loader);
  onMount(() => pageEnter(root));
  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>{props.title}</h1>
          <p>{props.subtitle}</p>
        </div>
      </div>
      <Show when={data.error}>
        <p style={{ color: 'var(--bridge-danger)' }}>{(data.error as Error).message}</p>
      </Show>
      <div class="panel panel-pad" style={{ overflow: 'auto' }}>
        <Show
          when={Array.isArray(data())}
          fallback={<pre style={{ margin: 0, 'font-family': 'var(--bridge-mono)', 'font-size': '0.8rem' }}>{JSON.stringify(data(), null, 2)}</pre>}
        >
          <table class="table">
            <thead>
              <tr>
                <For each={props.columns || Object.keys((data() as any[])?.[0] || { id: 1 }).slice(0, 6)}>
                  {(c) => <th>{c}</th>}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={(data() as any[]) || []}>
                {(row) => (
                  <tr>
                    <For each={props.columns || Object.keys(row).slice(0, 6)}>
                      {(c) => <td>{typeof row[c] === 'object' ? JSON.stringify(row[c]) : String(row[c] ?? '')}</td>}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </table>
        </Show>
      </div>
    </section>
  );
}
