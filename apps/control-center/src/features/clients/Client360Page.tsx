import { A, useParams } from '@solidjs/router';
import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import { platformApi } from '~/api/platform';
import { pageEnter } from '~/motion/registry';

const money = (cents: unknown) => new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(Number(cents || 0) / 100);

export function ClientsPage() {
  const [clients, { refetch }] = createResource(() => platformApi.clients());
  const [name, setName] = createSignal(''); const [email, setEmail] = createSignal(''); const [message, setMessage] = createSignal(''); const [saving, setSaving] = createSignal(false);
  async function createClient() {
    if (!name().trim()) { setMessage('Client name is required'); return; }
    setSaving(true); setMessage('');
    try { await platformApi.createClient({ name: name().trim(), email: email().trim() || undefined }); setName(''); setEmail(''); setMessage('Client created'); refetch(); }
    catch (error: any) { setMessage(error.message); } finally { setSaving(false); }
  }
  return <section><div class="page-header"><div><h1>Clients</h1><p>Billable accounts linked to tenants and operating history</p></div></div>
    <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}><h3>Create client</h3><div style={{ display: 'flex', gap: '0.5rem', 'flex-wrap': 'wrap' }}><input class="input" value={name()} onInput={(e) => setName(e.currentTarget.value)} placeholder="Client name" /><input class="input" type="email" value={email()} onInput={(e) => setEmail(e.currentTarget.value)} placeholder="Billing email" /><button class="btn btn-primary" type="button" disabled={saving()} onClick={createClient}>{saving() ? 'Creating...' : 'Create client'}</button></div><Show when={message()}><p>{message()}</p></Show></div>
    <div class="panel panel-pad"><table class="table"><thead><tr><th>Client</th><th>Email</th><th>Open</th></tr></thead><tbody><For each={clients() || []}>{(client: any) => <tr><td>{client.name}</td><td>{client.email || '—'}</td><td><A class="btn" href={`/clients/${client.id}`}>Client 360</A></td></tr>}</For></tbody></table></div>
  </section>;
}

export function Client360Page() {
  let root!: HTMLElement; const params = useParams(); const [profile] = createResource(() => params.clientId, (id) => platformApi.client360(id)); onMount(() => pageEnter(root)); const data = () => profile() as any;
  return <section ref={root!}><Show when={data()} fallback={<div class="panel panel-pad">Loading client profile…</div>}><div class="page-header"><div><A href="/clients">Clients</A><h1>{data().client.name}</h1><p>{data().client.email || 'No billing email'} · authoritative account view</p></div></div><div class="metric-grid"><article class="panel panel-pad"><small>Tenants</small><h2>{data().tenants?.length || 0}</h2></article><article class="panel panel-pad"><small>Applications</small><h2>{data().apps?.length || 0}</h2></article><article class="panel panel-pad"><small>Active subscriptions</small><h2>{data().subscriptions?.filter((s: any) => s.status === 'active').length || 0}</h2></article><article class="panel panel-pad"><small>Open tickets</small><h2>{data().tickets?.filter((t: any) => t.status !== 'closed').length || 0}</h2></article></div><div class="split-2" style={{ 'margin-top': '1rem' }}><div class="panel panel-pad"><h3>Tenants & applications</h3><For each={data().tenants || []}>{(tenant: any) => <div><strong>{tenant.name}</strong><p>{tenant.plan} · {tenant.isolation_mode}</p><For each={(data().apps || []).filter((app: any) => app.tenant_id === tenant.id)}>{(app: any) => <p>{app.name} · {app.lifecycle_status || app.status}</p>}</For></div>}</For></div><div class="panel panel-pad"><h3>Invoices</h3><For each={data().invoices || []}>{(invoice: any) => <p>{invoice.id.slice(0, 8)} · {money(invoice.amount_cents)} · {invoice.status}</p>}</For><h3>Support</h3><For each={data().tickets || []}>{(ticket: any) => <p>{ticket.subject} · {ticket.priority} · {ticket.status}</p>}</For></div></div></Show></section>;
}
