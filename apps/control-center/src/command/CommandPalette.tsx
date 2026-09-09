import { createSignal, For, Show, onMount, onCleanup } from 'solid-js';
import { platformApi } from '~/api/platform';

export function CommandPalette(props: { open: boolean; onClose: () => void; onNavigate: (href: string) => void }) {
  const [q, setQ] = createSignal('');
  const [results, setResults] = createSignal<{ group: string; items: Array<{ id: string; label: string; href?: string }> }[]>([]);
  const [err, setErr] = createSignal('');

  async function runSearch(value: string) {
    setQ(value);
    if (!value.trim()) {
      setResults([
        {
          group: 'Quick actions',
          items: [
            { id: 'apps', label: 'Open App Launcher', href: '/apps' },
            { id: 'ai', label: 'Open AI Workspace', href: '/ai' },
            { id: 'security', label: 'Open Security Center', href: '/security' },
            { id: 'ops', label: 'Open Operations', href: '/operations' }
          ]
        }
      ]);
      return;
    }
    try {
      const data = await platformApi.search(value.trim());
      setErr('');
      setResults([
        {
          group: 'Apps',
          items: (data.apps || []).map((a: any) => ({ id: a.id, label: a.name, href: '/apps' }))
        },
        {
          group: 'Tickets',
          items: (data.tickets || []).map((t: any) => ({ id: t.id, label: t.subject, href: '/operations' }))
        }
      ]);
    } catch (e: any) {
      setErr(e.message || 'Search failed');
    }
  }

  onMount(() => runSearch(''));

  return (
    <Show when={props.open}>
      <div class="command-overlay" role="dialog" aria-modal="true" onClick={() => props.onClose()}>
        <div class="panel command-dialog panel-pad" onClick={(e) => e.stopPropagation()}>
          <input
            class="input"
            autofocus
            placeholder="Search tenants, apps, tickets…"
            value={q()}
            onInput={(e) => runSearch(e.currentTarget.value)}
          />
          <Show when={err()}>
            <p style={{ color: 'var(--bridge-danger)' }}>{err()}</p>
          </Show>
          <For each={results()}>
            {(group) => (
              <div style={{ 'margin-top': '1rem' }}>
                <h3 style={{ margin: '0 0 0.4rem', color: 'var(--bridge-text-muted)', 'font-size': '0.75rem' }}>
                  {group.group}
                </h3>
                <For each={group.items}>
                  {(item) => (
                    <button
                      class="nav-link"
                      type="button"
                      onClick={() => {
                        if (item.href) props.onNavigate(item.href);
                        props.onClose();
                      }}
                    >
                      {item.label}
                    </button>
                  )}
                </For>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  );
}

export function useCommandHotkey(onOpen: () => void) {
  onMount(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    onCleanup(() => window.removeEventListener('keydown', handler));
  });
}
