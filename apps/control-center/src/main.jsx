import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';

const API = import.meta.env.VITE_BRIDGE_API_URL || 'http://localhost:4000';

function unwrap(x) {
  return x && Object.prototype.hasOwnProperty.call(x, 'data') ? x.data : x;
}

function App() {
  const [tenants, setTenants] = useState([]);
  const [tenant, setTenant] = useState('');
  const [tab, setTab] = useState('command');
  const [err, setErr] = useState('');
  const [palette, setPalette] = useState(false);
  const [metrics, setMetrics] = useState(null);
  const [apps, setApps] = useState([]);
  const [nav, setNav] = useState([]);
  const [impersonation, setImpersonation] = useState(null);

  const api = useCallback(async (path, opt = {}) => {
    const h = {
      'content-type': 'application/json',
      'x-actor-roles': 'platform.admin',
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...(impersonation ? {
        'x-impersonate-tenant': impersonation.tenantId,
        'x-impersonate-reason': impersonation.reason
      } : {})
    };
    const r = await fetch(API + path, { ...opt, headers: { ...h, ...opt.headers } });
    const x = await r.json();
    if (!r.ok) throw new Error(x?.error?.message || x.error || `HTTP ${r.status}`);
    return unwrap(x);
  }, [tenant, impersonation]);

  useEffect(() => {
    api('/api/tenants').then((x) => {
      setTenants(x);
      if (x[0]) setTenant(x[0].id);
    }).catch((e) => setErr(e.message));
  }, []);

  useEffect(() => {
    if (!tenant) return;
    Promise.all([
      api('/api/apps'),
      api('/api/command-center'),
      api('/api/navigation')
    ]).then(([a, m, n]) => {
      setApps(a);
      setMetrics(m);
      setNav(n);
      setErr('');
    }).catch((e) => setErr(e.message));
  }, [tenant, api]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tabs = useMemo(() => ([
    ['command', 'Command'],
    ['apps', 'Apps'],
    ['build', 'Build'],
    ['ai', 'AI'],
    ['commerce', 'Commerce'],
    ['infra', 'Infra'],
    ['growth', 'Growth'],
    ['security', 'Security'],
    ['audit', 'Audit']
  ]), []);

  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <h2>Bridge</h2>
          <p>Ecosystem Control Plane</p>
        </div>
        {tabs.map(([id, label]) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>{label}</button>
        ))}
        <button className="ghost" onClick={() => setPalette(true)}>Command Palette ⌘K</button>
      </aside>
      <main>
        {impersonation && (
          <div className="impersonation-banner">
            Support impersonation active: {impersonation.reason}
            <button onClick={() => setImpersonation(null)}>End</button>
          </div>
        )}
        <header>
          <div>
            <h1>{tab.toUpperCase()}</h1>
            <p>One tenant workspace for apps, AI, billing, and operations</p>
          </div>
          <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
            {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </header>
        {err && <div className="err">{err}</div>}
        {tab === 'command' && <Command metrics={metrics} apps={apps} />}
        {tab === 'apps' && <Apps apps={apps} />}
        {tab === 'build' && <Build api={api} />}
        {tab === 'ai' && <Ai api={api} tenant={tenant} />}
        {tab === 'commerce' && <Commerce api={api} />}
        {tab === 'infra' && <Infra api={api} />}
        {tab === 'growth' && <Growth api={api} />}
        {tab === 'security' && <Security api={api} />}
        {tab === 'audit' && <Audit api={api} />}
        {palette && <Palette onClose={() => setPalette(false)} setTab={setTab} nav={nav} />}
      </main>
    </div>
  );
}

function Command({ metrics, apps }) {
  if (!metrics) return <p>Loading metrics…</p>;
  return (
    <section className="metrics">
      {Object.entries(metrics).map(([k, v]) => (
        <article key={k}><span>{k}</span><strong>{v}</strong></article>
      ))}
      <div className="cards">
        {apps.map((a) => (
          <article key={a.id}>
            <span>{a.lifecycle_status || a.status}</span>
            <h3>{a.name}</h3>
            <p>{a.app_type} · {a.health || 'UNKNOWN'}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function Apps({ apps }) {
  return (
    <div className="cards">
      {apps.map((a) => (
        <article key={a.id}>
          <span>{a.lifecycle_status || a.status}</span>
          <h3>{a.name}</h3>
          <p>{a.app_type} · {a.database_engine} · {a.environment || 'production'}</p>
          <a href={a.launch_url} target="_blank" rel="noreferrer">Launch</a>
        </article>
      ))}
    </div>
  );
}

function Build({ api }) {
  const [models, setModels] = useState([]);
  const [components, setComponents] = useState([]);
  const [brand, setBrand] = useState(null);
  useEffect(() => {
    Promise.all([api('/api/cms/models'), api('/api/components'), api('/api/brand')])
      .then(([m, c, b]) => { setModels(m); setComponents(c); setBrand(b); })
      .catch(() => {});
  }, [api]);
  return (
    <section className="split">
      <div>
        <h3>Content Models</h3>
        <ul>{models.map((m) => <li key={m.id}>{m.name} ({m.slug})</li>)}</ul>
        <button onClick={async () => {
          await api('/api/cms/models', {
            method: 'POST',
            body: JSON.stringify({
              name: 'Announcement',
              slug: 'announcement',
              fields: [
                { name: 'title', type: 'text', required: true },
                { name: 'body', type: 'textarea', required: true }
              ]
            })
          });
          setModels(await api('/api/cms/models'));
        }}>Add Announcement Model</button>
      </div>
      <div>
        <h3>Visual Components</h3>
        <ul>{components.map((c) => <li key={c.id}>{c.id} · {c.category}</li>)}</ul>
        <h3>Brand</h3>
        <pre>{JSON.stringify(brand?.profile || {}, null, 2)}</pre>
      </div>
    </section>
  );
}

function Ai({ api, tenant }) {
  const [msgs, setMsgs] = useState([{ role: 'assistant', content: 'AI Workspace — website changes go through capabilities + approval.' }]);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [err, setErr] = useState('');

  async function send(e) {
    e.preventDefault();
    const q = text.trim();
    if (!q) return;
    setText('');
    setMsgs((m) => [...m, { role: 'user', content: q }]);
    if (/phone/i.test(q)) {
      const phone = (q.match(/\+?[\d][\d\-\s]{6,}\d/) || ['+1-555-0199'])[0].replace(/\s/g, '');
      try {
        const result = await api('/api/ai/website/phone-change', {
          method: 'POST',
          body: JSON.stringify({ phone, publish: false })
        });
        setPreview(result);
        setMsgs((m) => [...m, {
          role: 'assistant',
          content: `Prepared changesets for ${result.changesets?.length || 0} apps. Approval required before publish.`
        }]);
      } catch (ex) {
        setErr(ex.message);
      }
      return;
    }
    const r = await fetch(API + '/api/ai/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-tenant-id': tenant, 'x-actor-roles': 'platform.admin' },
      body: JSON.stringify({ messages: [...msgs, { role: 'user', content: q }] })
    });
    const j = await r.json();
    if (!r.ok) { setErr(j.error?.message || j.error); return; }
    setMsgs((m) => [...m, { role: 'assistant', content: unwrap(j).content || j.content }]);
  }

  async function approveAll() {
    if (!preview?.changesets) return;
    for (const cs of preview.changesets) {
      await api(`/api/changesets/${cs.id}/approve`, { method: 'POST', body: '{}' });
    }
    setMsgs((m) => [...m, { role: 'assistant', content: 'Approved and published changesets.' }]);
  }

  return (
    <section>
      <div className="chat">{msgs.map((m, i) => <p key={i} className={m.role}><b>{m.role}</b><br />{m.content}</p>)}</div>
      {preview && (
        <div className="preview">
          <h3>Changeset preview</h3>
          <pre>{JSON.stringify(preview.changesets, null, 2)}</pre>
          <button onClick={approveAll}>Approve & Publish</button>
        </div>
      )}
      {err && <div className="err">{err}</div>}
      <form onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask Bridge AI… e.g. change phone to +1-555-0199" />
        <button>Send</button>
      </form>
    </section>
  );
}

function Commerce({ api }) {
  const [products, setProducts] = useState([]);
  const [clients, setClients] = useState([]);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    Promise.all([api('/api/products'), api('/api/clients')]).then(([p, c]) => {
      setProducts(p); setClients(c);
    }).catch(() => {});
  }, [api]);

  async function runBillingPath() {
    const client = clients[0] || await api('/api/clients', {
      method: 'POST', body: JSON.stringify({ name: 'Walk-in Client', email: 'walkin@bridge.local' })
    });
    const product = products[0];
    const tenants = await api('/api/tenants');
    const order = await api('/api/orders', {
      method: 'POST',
      body: JSON.stringify({ clientId: client.id, tenantId: tenants[0].id, productId: product.id })
    });
    const key = `evt-${Date.now()}`;
    const pay1 = await api('/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({ provider: 'manual', externalEventKey: key, orderId: order.id })
    });
    const pay2 = await api('/api/payments/webhook', {
      method: 'POST',
      body: JSON.stringify({ provider: 'manual', externalEventKey: key, orderId: order.id })
    });
    setMsg(`Payment1 duplicate=${pay1.duplicate} · Payment2 duplicate=${pay2.duplicate}`);
  }

  return (
    <section>
      <h3>Products</h3>
      <ul>{products.map((p) => <li key={p.id}>{p.name} — {(p.price_cents / 100).toFixed(2)}</li>)}</ul>
      <button onClick={runBillingPath}>Run idempotent billing path</button>
      {msg && <p>{msg}</p>}
    </section>
  );
}

function Infra({ api }) {
  const [dbs, setDbs] = useState([]);
  useEffect(() => { api('/api/databases').then(setDbs).catch(() => {}); }, [api]);
  return (
    <section>
      <h3>Database instances</h3>
      <button onClick={async () => {
        await api('/api/databases', { method: 'POST', body: JSON.stringify({ engine: 'mariadb', databaseName: 'tenant_app' }) });
        setDbs(await api('/api/databases'));
      }}>Provision MariaDB</button>
      <table>
        <thead><tr><th>Engine</th><th>DB</th><th>Status</th></tr></thead>
        <tbody>{dbs.map((d) => <tr key={d.id}><td>{d.engine}</td><td>{d.database_name}</td><td>{d.status}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Growth({ api }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/affiliates').then(setRows).catch(() => {}); }, [api]);
  return (
    <section>
      <h3>Affiliates</h3>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Code</th><th>Rate</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.id}><td>{x.name}</td><td>{x.email}</td><td>{x.code}</td><td>{x.commission_rate}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Security({ api }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/security/rules').then(setRows).catch(() => {}); }, [api]);
  return (
    <section>
      <h3>Security / IP Rules</h3>
      <table>
        <thead><tr><th>Action</th><th>Target</th><th>Reason</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.id}><td>{x.action}</td><td>{x.target}</td><td>{x.reason}</td></tr>)}</tbody>
      </table>
    </section>
  );
}

function Audit({ api }) {
  const [rows, setRows] = useState([]);
  useEffect(() => { api('/api/audit').then(setRows).catch(() => {}); }, [api]);
  return (
    <table>
      <thead><tr><th>Time</th><th>Action</th><th>Resource</th><th>Actor</th></tr></thead>
      <tbody>{rows.map((x) => <tr key={x.id}><td>{x.created_at}</td><td>{x.action}</td><td>{x.resource_type}</td><td>{x.actor}</td></tr>)}</tbody>
    </table>
  );
}

function Palette({ onClose, setTab }) {
  const commands = [
    ['Apps', 'apps'], ['AI Workspace', 'ai'], ['Commerce', 'commerce'],
    ['Infrastructure', 'infra'], ['Audit', 'audit'], ['Command Center', 'command']
  ];
  return (
    <div className="palette" onClick={onClose}>
      <div className="palette-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Command Palette</h3>
        {commands.map(([label, id]) => (
          <button key={id} onClick={() => { setTab(id); onClose(); }}>{label}</button>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
