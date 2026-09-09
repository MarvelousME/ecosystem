import { For, Show, createSignal, onMount, createMemo } from 'solid-js';
import { platformApi } from '~/api/platform';
import { pageEnter } from '~/motion/registry';
import { TextInput, Form, SubmitButton } from '~/primitives/forms';
import './logs.css';

const ROW_H = 36;
const VIEWPORT = 480;

export function LogViewerPage() {
  let root!: HTMLElement;
  const [items, setItems] = createSignal<any[]>([]);
  const [q, setQ] = createSignal('');
  const [scrollTop, setScrollTop] = createSignal(0);
  const [err, setErr] = createSignal('');

  async function load() {
    const data = await platformApi.logs({ q: q(), limit: 500 });
    setItems(data.items || []);
  }

  onMount(() => {
    pageEnter(root);
    load().catch((e) => setErr(e.message));
  });

  const total = () => items().length * ROW_H;
  const start = createMemo(() => Math.max(0, Math.floor(scrollTop() / ROW_H) - 5));
  const visible = createMemo(() => {
    const s = start();
    const count = Math.ceil(VIEWPORT / ROW_H) + 10;
    return items().slice(s, s + count).map((row, i) => ({ row, index: s + i }));
  });

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Log Viewer</h1>
          <p>Virtualized audit stream from `/api/logs` — not fabricated telemetry</p>
        </div>
      </div>
      <Form
        onSubmit={async () => {
          await load();
        }}
      >
        <div style={{ display: 'flex', gap: '0.5rem', 'align-items': 'end' }}>
          <div style={{ flex: 1 }}>
            <TextInput label="Filter" name="q" value={q()} onChange={setQ} placeholder="action, actor, resource…" />
          </div>
          <SubmitButton>Search</SubmitButton>
        </div>
      </Form>
      <Show when={err()}><p class="bf-error">{err()}</p></Show>
      <div
        class="log-viewport panel"
        style={{ height: `${VIEWPORT}px` }}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      >
        <div style={{ height: `${total()}px`, position: 'relative' }}>
          <For each={visible()}>
            {(v) => (
              <div
                class={`log-row log-${v.row.level}`}
                style={{ top: `${v.index * ROW_H}px`, height: `${ROW_H}px` }}
              >
                <span class="log-ts">{new Date(v.row.ts).toISOString()}</span>
                <span class="log-lvl">{v.row.level}</span>
                <span class="log-msg">{v.row.message}</span>
                <span class="log-meta">{v.row.correlationId || v.row.requestId}</span>
              </div>
            )}
          </For>
        </div>
      </div>
    </section>
  );
}

export function TraceWaterfallPage() {
  let root!: HTMLElement;
  const [correlationId, setCorrelationId] = createSignal('');
  const [trace, setTrace] = createSignal<any>(null);
  const [err, setErr] = createSignal('');

  onMount(() => pageEnter(root));

  async function load() {
    setErr('');
    if (!correlationId().trim()) throw new Error('correlationId required');
    setTrace(await platformApi.trace(correlationId().trim()));
  }

  const spans = createMemo(() => trace()?.spans || []);
  const t0 = createMemo(() => {
    const s = spans();
    if (!s.length) return 0;
    return Math.min(...s.map((x: any) => new Date(x.start).getTime()));
  });
  const t1 = createMemo(() => {
    const s = spans();
    if (!s.length) return 1;
    return Math.max(...s.map((x: any) => new Date(x.start).getTime())) + 1;
  });

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Trace Waterfall</h1>
          <p>Built from audit `correlationId` + saga steps — `/api/traces/:id`</p>
        </div>
      </div>
      <Form onSubmit={load}>
        <TextInput
          label="Correlation ID"
          name="cid"
          value={correlationId()}
          onChange={setCorrelationId}
          placeholder="From provision / audit metadata"
          required
        />
        <SubmitButton>Load trace</SubmitButton>
      </Form>
      <Show when={err()}><p class="bf-error">{err()}</p></Show>
      <Show when={trace()}>
        <div class="panel panel-pad" style={{ 'margin-top': '1rem' }}>
          <p>Spans: {spans().length}{trace()?.saga ? ` · saga ${trace().saga.state}` : ''}</p>
          <div class="trace-list">
            <For each={spans()}>
              {(s: any) => {
                const left = () => ((new Date(s.start).getTime() - t0()) / (t1() - t0())) * 100;
                return (
                  <div class="trace-row">
                    <div class="trace-label">
                      <strong>{s.name}</strong>
                      <span>{s.service} · {s.status}</span>
                    </div>
                    <div class="trace-bar-track">
                      <div class="trace-bar" style={{ left: `${left()}%`, width: '12%' }} />
                    </div>
                  </div>
                );
              }}
            </For>
          </div>
        </div>
      </Show>
    </section>
  );
}
