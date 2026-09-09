import { For, Show, createMemo, createResource, createSignal, onMount } from 'solid-js';
import { platformApi } from '~/api/platform';
import { workspaceStore } from '~/stores/workspace';
import { pageEnter } from '~/motion/registry';
import { Form, SelectInput, SubmitButton, TextInput } from '~/primitives/forms';
import { getAccessToken } from '~/auth/oidc';

export function AiPage() {
  let root!: HTMLElement;
  const [text, setText] = createSignal('');
  const [msgs, setMsgs] = createSignal<Array<{ role: string; content: string }>>([
    { role: 'assistant', content: 'AI Workspace — website mutations require approval.' }
  ]);
  const [preview, setPreview] = createSignal<any>(null);
  const [err, setErr] = createSignal('');
  onMount(() => pageEnter(root));

  async function send() {
    const q = text().trim();
    if (!q) return;
    setText('');
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    try {
      if (/phone/i.test(q)) {
        const phone = (q.match(/\+?[\d][\d\-\s]{6,}\d/) || ['+1-555-0199'])[0].replace(/\s/g, '');
        const result = await platformApi.phoneChange({ phone, publish: false });
        setPreview(result);
        setMsgs((m) => [
          ...m,
          { role: 'assistant', content: `Prepared ${(result as any).changesets?.length || 0} changesets. Approval required.` }
        ]);
        return;
      }
      const r = await platformApi.aiChat([...msgs(), { role: 'user', content: q }]);
      setMsgs((m) => [...m, { role: 'assistant', content: r.content || '(empty)' }]);
    } catch (ex: any) {
      setErr(ex.message);
    }
  }

  async function approveAll() {
    const changesets = (preview() as any)?.changesets || [];
    for (const cs of changesets) {
      await platformApi.approveChangeset(cs.id);
    }
    setMsgs((m) => [...m, { role: 'assistant', content: 'Approved and published changesets.' }]);
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>AI Workspace</h1>
          <p>Agents · approvals · artifacts via Bridge capabilities</p>
        </div>
      </div>
      <div class="panel panel-pad" style={{ 'min-height': '280px', 'margin-bottom': '1rem' }}>
        <For each={msgs()}>{(m) => <p><b>{m.role}</b><br />{m.content}</p>}</For>
      </div>
      <Show when={preview()}>
        <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
          <h3>Changeset preview</h3>
          <pre style={{ 'font-family': 'var(--bridge-mono)', 'font-size': '0.75rem' }}>{JSON.stringify(preview(), null, 2)}</pre>
          <button class="btn btn-primary" type="button" onClick={approveAll}>Approve & Publish</button>
        </div>
      </Show>
      <Show when={err()}><p style={{ color: 'var(--bridge-danger)' }}>{err()}</p></Show>
      <Form onSubmit={send}>
        <div style={{ display: 'flex', gap: '0.5rem', 'align-items': 'end' }}>
          <div style={{ flex: 1 }}>
            <TextInput
              label="Prompt"
              name="prompt"
              value={text()}
              onChange={setText}
              placeholder="Ask Bridge AI… e.g. change phone to +1-555-0199"
            />
          </div>
          <SubmitButton disabled={!workspaceStore.tenantId}>Send</SubmitButton>
        </div>
      </Form>
    </section>
  );
}

export function BuildPage() {
  let root!: HTMLElement;
  const [models] = createResource(() => workspaceStore.tenantId, () => platformApi.cmsModels());
  const [components] = createResource(() => platformApi.components());
  const [brand] = createResource(() => workspaceStore.tenantId, () => platformApi.brand());
  const [apps] = createResource(() => workspaceStore.tenantId, () => platformApi.apps());
  const [schema] = createResource(() => platformApi.puckSchema());
  const [imports] = createResource(() => workspaceStore.tenantId, () => platformApi.imports());
  const [builder, setBuilder] = createSignal<any>(null);
  const [embedAppId, setEmbedAppId] = createSignal('');
  const [embedToken, setEmbedToken] = createSignal('');
  const puckOrigin = import.meta.env.VITE_PUCK_HOST_URL || 'http://localhost:5174';
  onMount(() => {
    pageEnter(root);
    getAccessToken().then((t) => setEmbedToken(t || ''));
  });

  const puckSrc = createMemo(() => {
    const appId = embedAppId() || String((apps() || [])[0]?.id || '');
    const tenantId = workspaceStore.tenantId || '';
    const q = new URLSearchParams({ tenantId, applicationId: appId });
    if (embedToken()) q.set('token', embedToken());
    return `${puckOrigin}/puck/?${q}`;
  });

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Build</h1>
          <p>CMS · Puck embed host · Gutenberg deep links · ZIP imports</p>
        </div>
      </div>
      <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
        <h3>Puck visual editor</h3>
        <p style={{ color: 'var(--bridge-text-muted)', 'font-size': '0.85rem' }}>
          React embed at {puckOrigin}/puck — schema and pages from platform-api
        </p>
        <select
          class="select"
          style={{ width: '280px', 'margin-bottom': '0.75rem' }}
          value={embedAppId()}
          onChange={(e) => setEmbedAppId(e.currentTarget.value)}
        >
          <option value="">First app</option>
          <For each={apps() || []}>{(a: any) => <option value={a.id}>{a.name}</option>}</For>
        </select>
        <iframe
          title="Puck editor"
          src={puckSrc()}
          style={{ width: '100%', height: '520px', border: '1px solid var(--bridge-border)', 'border-radius': '8px', background: '#0b0f14' }}
        />
      </div>
      <div class="split-2">
        <div class="panel panel-pad">
          <h3>Content models</h3>
          <ul>
            <For each={models() || []}>{(m: any) => <li>{m.name} ({m.slug})</li>}</For>
          </ul>
          <h3>Builders</h3>
          <For each={(apps() || []).filter((a: any) => ['wordpress', 'react', 'nextjs', 'commerce'].includes(a.app_type))}>
            {(a: any) => (
              <div style={{ 'margin-bottom': '0.5rem' }}>
                {a.name} · {a.app_type}{' '}
                <button class="btn" type="button" onClick={async () => setBuilder(await platformApi.openBuilder(a.id))}>
                  Open
                </button>
              </div>
            )}
          </For>
          <Show when={builder()}>
            <pre style={{ 'font-family': 'var(--bridge-mono)', 'font-size': '0.75rem' }}>{JSON.stringify(builder(), null, 2)}</pre>
          </Show>
        </div>
        <div class="panel panel-pad">
          <h3>Puck components ({(schema() as any)?.components?.length || components()?.length || 0})</h3>
          <ul>
            <For each={components() || []}>{(c: any) => <li>{c.id} · {c.category}</li>}</For>
          </ul>
          <h3>Brand</h3>
          <pre style={{ 'font-family': 'var(--bridge-mono)', 'font-size': '0.75rem' }}>{JSON.stringify((brand() as any)?.profile || {}, null, 2)}</pre>
          <h3>ZIP imports</h3>
          <ul>
            <For each={imports() || []}>{(i: any) => <li>{i.filename} · {i.status}</li>}</For>
          </ul>
        </div>
      </div>
    </section>
  );
}

export function SecurityPage() {
  let root!: HTMLElement;
  const [rules, { refetch }] = createResource(() => workspaceStore.tenantId, () => platformApi.securityRules());
  const [target, setTarget] = createSignal('203.0.113.10');
  const [msg, setMsg] = createSignal('');
  onMount(() => pageEnter(root));

  async function blockIp() {
    try {
      await platformApi.createSecurityRule({
        action: 'BLOCK',
        target: target(),
        reason: 'Control Center block',
        provider: 'bridge'
      });
      setMsg('Rule created');
      refetch();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Security Center</h1>
          <p>IP rules · tenant-scoped · fail-closed providers</p>
        </div>
      </div>
      <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
        <Form
          onSubmit={async () => {
            await blockIp();
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', 'align-items': 'end' }}>
            <div style={{ flex: 1 }}>
              <TextInput label="IP / CIDR" name="target" value={target()} onChange={setTarget} required />
            </div>
            <SubmitButton>Block IP</SubmitButton>
          </div>
        </Form>
      </div>
      <Show when={msg()}><p>{msg()}</p></Show>
      <div class="panel panel-pad">
        <table class="table">
          <thead><tr><th>action</th><th>target</th><th>reason</th><th>provider</th></tr></thead>
          <tbody>
            <For each={rules() || []}>
              {(r: any) => <tr><td>{r.action}</td><td>{r.target}</td><td>{r.reason}</td><td>{r.provider}</td></tr>}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function CommercePage() {
  let root!: HTMLElement;
  const [products] = createResource(() => platformApi.products());
  const [clients] = createResource(() => platformApi.clients());
  const [msg, setMsg] = createSignal('');
  onMount(() => pageEnter(root));

  async function runBilling() {
    const list = await platformApi.clients();
    let clientId = (list[0] as any)?.id as string | undefined;
    if (!clientId) {
      setMsg('No clients available — create one via API /api/clients first');
      return;
    }
    const tenantId = workspaceStore.tenantId;
    const product = (products() || [])[0] as any;
    if (!product || !tenantId) {
      setMsg('Need product and tenant');
      return;
    }
    const order = (await platformApi.createOrder({ clientId, tenantId, productId: product.id })) as any;
    const key = `evt-${Date.now()}`;
    const pay1 = (await platformApi.paymentWebhook({
      provider: 'manual',
      externalEventKey: key,
      orderId: order.id
    })) as any;
    const pay2 = (await platformApi.paymentWebhook({
      provider: 'manual',
      externalEventKey: key,
      orderId: order.id
    })) as any;
    setMsg(`Payment1 duplicate=${pay1.duplicate} · Payment2 duplicate=${pay2.duplicate}`);
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Commerce</h1>
          <p>Products · orders · idempotent payments</p>
        </div>
        <button class="btn btn-primary" type="button" onClick={runBilling}>Run billing path</button>
      </div>
      <Show when={msg()}><p>{msg()}</p></Show>
      <div class="panel panel-pad">
        <table class="table">
          <thead><tr><th>sku</th><th>name</th><th>price</th></tr></thead>
          <tbody>
            <For each={products() || []}>
              {(p: any) => <tr><td>{p.sku || p.id}</td><td>{p.name}</td><td>{p.price_cents}</td></tr>}
            </For>
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function InfrastructurePage() {
  let root!: HTMLElement;
  const [dbs, { refetch }] = createResource(() => workspaceStore.tenantId, () => platformApi.databases());
  const [health] = createResource(() => platformApi.databaseHealth());
  const [engine, setEngine] = createSignal('postgresql');
  const [msg, setMsg] = createSignal('');
  onMount(() => pageEnter(root));

  async function provision() {
    try {
      const row = await platformApi.provisionDatabase({ engine: engine(), databaseName: `app_${Date.now().toString(36)}` });
      setMsg(`Provisioned ${(row as any).id} status=${(row as any).status}`);
      refetch();
    } catch (e: any) {
      setMsg(e.message);
    }
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Infrastructure</h1>
          <p>Databases · provider health · secret references only</p>
        </div>
      </div>
      <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
        <Form
          onSubmit={async () => {
            await provision();
          }}
        >
          <div style={{ display: 'flex', gap: '0.5rem', 'align-items': 'end', 'flex-wrap': 'wrap' }}>
            <SelectInput
              label="Engine"
              value={engine() as 'postgresql' | 'mariadb' | 'mongodb' | 'sqlserver'}
              options={[
                { value: 'postgresql', label: 'PostgreSQL' },
                { value: 'mariadb', label: 'MariaDB' },
                { value: 'mongodb', label: 'MongoDB' },
                { value: 'sqlserver', label: 'SQL Server' }
              ]}
              onChange={setEngine}
            />
            <SubmitButton>Provision</SubmitButton>
          </div>
        </Form>
      </div>
      <Show when={msg()}><p>{msg()}</p></Show>
      <div class="split-2">
        <div class="panel panel-pad">
          <h3>Instances</h3>
          <table class="table">
            <thead><tr><th>engine</th><th>name</th><th>status</th><th>secret</th></tr></thead>
            <tbody>
              <For each={dbs() || []}>
                {(d: any) => <tr><td>{d.engine}</td><td>{d.database_name}</td><td>{d.status}</td><td>{d.secret_ref}</td></tr>}
              </For>
            </tbody>
          </table>
        </div>
        <div class="panel panel-pad">
          <h3>Provider health</h3>
          <pre style={{ 'font-family': 'var(--bridge-mono)', 'font-size': '0.75rem' }}>{JSON.stringify(health() || {}, null, 2)}</pre>
        </div>
      </div>
    </section>
  );
}
