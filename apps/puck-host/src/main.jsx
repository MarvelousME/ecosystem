import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Puck } from '@measured/puck';
import '@measured/puck/puck.css';

const API = import.meta.env.VITE_BRIDGE_API_URL || 'http://localhost:4000';

function params() {
  const q = new URLSearchParams(window.location.search);
  return {
    tenantId: q.get('tenantId') || '',
    applicationId: q.get('applicationId') || '',
    token: q.get('token') || ''
  };
}

async function api(path, { method = 'GET', body, tenantId, token } = {}) {
  const headers = { 'content-type': 'application/json', 'x-bridge-envelope': '1' };
  if (token) headers.authorization = `Bearer ${token}`;
  else headers['x-actor-roles'] = 'platform.admin';
  if (tenantId) headers['x-tenant-id'] = tenantId;
  const r = await fetch(`${API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.error?.message || j.error || `HTTP ${r.status}`);
  return j.data ?? j;
}

function App() {
  const { tenantId, applicationId, token } = params();
  const [config, setConfig] = useState(null);
  const [data, setData] = useState({ content: [], root: { props: { title: 'Home' } } });
  const [status, setStatus] = useState('Loading schema…');

  useEffect(() => {
    (async () => {
      try {
        const schema = await api('/api/builders/puck/schema', { tenantId, token });
        const components = {};
        for (const c of schema.components || []) {
          components[c.type] = {
            label: c.type,
            fields: Object.fromEntries(
              Object.keys(c.fields || { title: {} }).map((k) => [k, { type: 'text' }])
            ),
            render: (props) => (
              <div style={{ padding: 12, border: '1px solid #333', marginBottom: 8 }}>
                <strong>{c.type}</strong>
                <pre style={{ margin: 0, fontSize: 12 }}>{JSON.stringify(props, null, 2)}</pre>
              </div>
            )
          };
        }
        setConfig({ components });
        if (applicationId) {
          const pages = await api(`/api/builders/puck/pages?applicationId=${applicationId}`, { tenantId, token });
          if (pages?.[0]?.document) setData(pages[0].document);
        }
        setStatus('Ready');
      } catch (e) {
        setStatus(e.message);
      }
    })();
  }, [tenantId, applicationId, token]);

  const puckConfig = useMemo(() => config, [config]);

  if (!puckConfig) return <p style={{ padding: 24, color: '#ccc' }}>{status}</p>;

  return (
    <div style={{ height: '100vh' }}>
      <div style={{ padding: '8px 12px', background: '#111', color: '#9fb3c8', fontSize: 12 }}>{status}</div>
      <Puck
        config={puckConfig}
        data={data}
        onPublish={async (next) => {
          if (!applicationId || !tenantId) {
            setStatus('tenantId + applicationId required to save');
            return;
          }
          await api('/api/builders/puck/pages', {
            method: 'POST',
            tenantId,
            token,
            body: {
              applicationId,
              slug: 'home',
              title: next?.root?.props?.title || 'Home',
              document: next,
              status: 'draft'
            }
          });
          setStatus('Saved to platform puck_pages');
          setData(next);
        }}
      />
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
