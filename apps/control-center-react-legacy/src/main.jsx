import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  getAccessToken,
  getUser,
  handleCallback,
  isAuthenticated,
  login,
  logout
} from './auth.js';
import { isAuthRequired, resolveApiBaseUrl } from './auth-config.js';
import './styles.css';

const API = resolveApiBaseUrl(import.meta.env);
const AUTH_REQUIRED = isAuthRequired(import.meta.env);

function unwrap(x) {
  return x && Object.prototype.hasOwnProperty.call(x, 'data') ? x.data : x;
}

/** Hash or path route for auth screens; tabs stay in React state. */
function detectAuthRoute() {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  const hash = (window.location.hash || '').replace(/^#/, '');
  const route = hash.startsWith('/') ? hash.split('?')[0] : '';
  if (path === '/auth/callback' || route === '/auth/callback') return 'callback';
  if (path === '/login' || route === '/login') return 'login';
  if (path === '/logout' || route === '/logout') return 'logout';
  return 'app';
}

function AuthCallback() {
  const [msg, setMsg] = useState('Completing sign-in…');
  useEffect(() => {
    handleCallback()
      .then(() => {
        window.location.replace('/');
      })
      .catch((e) => setMsg(e.message || 'Sign-in callback failed'));
  }, []);
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Bridge</h1>
        <p>{msg}</p>
      </div>
    </div>
  );
}

function LoginScreen({ error }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Bridge</h1>
        <p>Sign in to the Ecosystem Control Plane</p>
        {error && <div className="err">{error}</div>}
        <button type="button" onClick={() => login()}>Log in with OIDC</button>
      </div>
    </div>
  );
}

function Root() {
  const [route, setRoute] = useState(detectAuthRoute);
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  const [userLabel, setUserLabel] = useState('');
  const [authErr, setAuthErr] = useState('');

  useEffect(() => {
    const sync = () => setRoute(detectAuthRoute());
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  useEffect(() => {
    if (route === 'logout') {
      logout().catch((e) => setAuthErr(e.message));
      return;
    }
    if (route === 'callback') return;
    let cancelled = false;
    (async () => {
      try {
        const ok = await isAuthenticated();
        if (cancelled) return;
        setAuthed(ok);
        if (ok) {
          const u = await getUser();
          setUserLabel(u?.profile?.email || u?.profile?.preferred_username || u?.profile?.name || '');
        }
      } catch (e) {
        if (!cancelled) setAuthErr(e.message);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [route]);

  if (route === 'callback') return <AuthCallback />;
  if (route === 'logout') {
    return (
      <div className="auth-shell">
        <div className="auth-card"><h1>Bridge</h1><p>Signing out…</p></div>
      </div>
    );
  }
  if (route === 'login') {
    return <LoginScreen error={authErr} />;
  }
  if (!ready) {
    return (
      <div className="auth-shell">
        <div className="auth-card"><h1>Bridge</h1><p>Loading…</p></div>
      </div>
    );
  }
  if (AUTH_REQUIRED && !authed) {
    return <LoginScreen error={authErr || 'Authentication required'} />;
  }

  return (
    <App
      authed={authed}
      userLabel={userLabel}
      onLogin={() => login()}
      onLogout={() => logout()}
    />
  );
}

function App({ authed, userLabel, onLogin, onLogout }) {
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
    const token = await getAccessToken();
    const h = {
      'content-type': 'application/json',
      ...(tenant ? { 'x-tenant-id': tenant } : {}),
      ...(impersonation ? {
        'x-impersonate-tenant': impersonation.tenantId,
        'x-impersonate-reason': impersonation.reason
      } : {})
    };
    // Prefer Bearer when present; lab headers only when no token (and OIDC not forced).
    if (token) {
      h.Authorization = `Bearer ${token}`;
    } else {
      h['x-actor-roles'] = 'platform.admin';
    }
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
        <div className="auth-aside">
          {userLabel && <p className="auth-user">{userLabel}</p>}
          {authed ? (
            <button type="button" className="ghost" onClick={onLogout}>Logout</button>
          ) : (
            <button type="button" className="ghost" onClick={onLogin}>Login</button>
          )}
        </div>
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
          <div className="header-actions">
            {authed ? (
              <button type="button" onClick={onLogout}>Logout</button>
            ) : (
              <button type="button" onClick={onLogin}>Login</button>
            )}
            <select value={tenant} onChange={(e) => setTenant(e.target.value)}>
              {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        </header>
        {err && <div className="err">{err}</div>}
        {tab === 'command' && <Command metrics={metrics} apps={apps} />}
        {tab === 'apps' && <Apps apps={apps} />}
        {tab === 'build' && <Build api={api} />}
        {tab === 'ai' && <Ai api={api} />}
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
  const [apps, setApps] = useState([]);
  const [builder, setBuilder] = useState(null);
  const [puckSchema, setPuckSchema] = useState(null);
  const [imports, setImports] = useState([]);
  useEffect(() => {
    Promise.all([
      api('/api/cms/models'),
      api('/api/components'),
      api('/api/brand'),
      api('/api/apps'),
      api('/api/builders/puck/schema'),
      api('/api/imports')
    ])
      .then(([m, c, b, a, schema, imp]) => {
        setModels(m); setComponents(c); setBrand(b); setApps(a); setPuckSchema(schema); setImports(imp);
      })
      .catch(() => {});
  }, [api]);

  async function openBuilder(appId) {
    setBuilder(await api(`/api/builders/apps/${appId}`));
  }

  async function savePuckDemo(appId) {
    const open = await api(`/api/builders/apps/${appId}`);
    await api('/api/builders/puck/pages', {
      method: 'POST',
      body: JSON.stringify({
        applicationId: appId,
        slug: 'home',
        title: 'Home',
        document: open.document || { content: [] }
      })
    });
    setBuilder({ ...open, saved: true });
  }

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
        <h3>Builders</h3>
        <ul>
          {apps.filter((a) => ['wordpress', 'react', 'nextjs', 'commerce'].includes(a.app_type)).map((a) => (
            <li key={a.id}>
              {a.name} · {a.app_type}{' '}
              <button type="button" onClick={() => openBuilder(a.id)}>Open</button>
              {(a.app_type === 'react' || a.app_type === 'nextjs') && (
                <button type="button" onClick={() => savePuckDemo(a.id)}>Save Puck draft</button>
              )}
            </li>
          ))}
        </ul>
        {builder && (
          <pre>{JSON.stringify(builder, null, 2)}</pre>
        )}
      </div>
      <div>
        <h3>Visual Components {puckSchema ? `(Puck ${puckSchema.components?.length || 0})` : ''}</h3>
        <ul>{components.map((c) => <li key={c.id}>{c.id} · {c.category}</li>)}</ul>
        <h3>Brand</h3>
        <pre>{JSON.stringify(brand?.profile || {}, null, 2)}</pre>
        <h3>ZIP imports</h3>
        <ul>{imports.map((i) => <li key={i.id}>{i.filename} · {i.status} · {i.scan_engine}</li>)}</ul>
      </div>
    </section>
  );
}

function Ai({ api }) {
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
    try {
      const data = await api('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ messages: [...msgs, { role: 'user', content: q }] })
      });
      setMsgs((m) => [...m, { role: 'assistant', content: data.content || data }]);
    } catch (ex) {
      setErr(ex.message);
    }
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

createRoot(document.getElementById('root')).render(<Root />);
