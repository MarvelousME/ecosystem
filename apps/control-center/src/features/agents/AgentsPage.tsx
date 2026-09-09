import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import { platformApi, type AgentInstance, type AgentTemplate } from '~/api/platform';
import { workspaceStore } from '~/stores/workspace';
import { pageEnter } from '~/motion/registry';

export function AgentsPage() {
  let root!: HTMLElement;
  const [templates] = createResource(() => platformApi.agents.templates());
  const [instances, { refetch }] = createResource(() => workspaceStore.tenantId, () => platformApi.agents.instances());
  const [selectedTemplate, setSelectedTemplate] = createSignal<AgentTemplate | null>(null);
  const [selectedInstance, setSelectedInstance] = createSignal<AgentInstance | null>(null);
  const [instantiating, setInstantiating] = createSignal(false);
  const [newInstanceKey, setNewInstanceKey] = createSignal('');
  const [newInstanceName, setNewInstanceName] = createSignal('');
  const [executionPrompt, setExecutionPrompt] = createSignal('');
  const [executing, setExecuting] = createSignal(false);
  const [message, setMessage] = createSignal('');
  onMount(() => pageEnter(root));

  async function instantiateAgent() {
    if (!workspaceStore.tenantId) {
      setMessage('Please select a tenant first');
      return;
    }
    const template = selectedTemplate();
    if (!template || !newInstanceKey() || !newInstanceName()) {
      setMessage('Template, agent key, and name are required');
      return;
    }

    setInstantiating(true);
    setMessage('');
    try {
      await platformApi.agents.instantiate({
        templateKey: template.template_key,
        agentKey: newInstanceKey(),
        name: newInstanceName(),
        description: template.description,
        config: {}
      });
      setMessage('Agent instantiated successfully');
      setNewInstanceKey('');
      setNewInstanceName('');
      setSelectedTemplate(null);
      refetch();
    } catch (e: any) {
      setMessage(`Failed to instantiate: ${e.message}`);
    } finally {
      setInstantiating(false);
    }
  }

  async function deleteInstance(instanceId: string) {
    if (!confirm('Are you sure you want to delete this agent instance?')) return;
    
    try {
      await platformApi.agents.deleteInstance(instanceId);
      setMessage('Agent instance deleted');
      setSelectedInstance(null);
      refetch();
    } catch (e: any) {
      setMessage(`Failed to delete: ${e.message}`);
    }
  }

  async function viewInstance(instanceId: string) {
    try {
      const instance = await platformApi.agents.instance(instanceId);
      setSelectedInstance(instance);
    } catch (e: any) {
      setMessage(`Failed to load instance: ${e.message}`);
    }
  }

  async function executeInstance() {
    const instance = selectedInstance();
    const prompt = executionPrompt().trim();
    if (!instance || !prompt) { setMessage('Enter an execution prompt'); return; }
    setExecuting(true);
    try {
      const execution = await platformApi.agents.executeInstance(instance.id, { prompt });
      setMessage(`Execution ${(execution as any).id} queued for governed processing`);
      setExecutionPrompt('');
      await viewInstance(instance.id);
    } catch (e: any) {
      setMessage(`Failed to queue execution: ${e.message}`);
    } finally {
      setExecuting(false);
    }
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Agent Hub</h1>
          <p>Native AI agents as first-class Bridge resources</p>
        </div>
      </div>

      <Show when={message()}>
        <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
          <p>{message()}</p>
        </div>
      </Show>

      <div class="split-2">
        <div class="panel panel-pad">
          <h3>Agent Templates</h3>
          <p style={{ color: 'var(--bridge-text-muted)', 'font-size': '0.9rem', 'margin-bottom': '1rem' }}>
            Platform-provided agent templates
          </p>
          <For each={templates() || []}>
            {(template) => (
              <div style={{ 'margin-bottom': '1rem', 'padding': '0.5rem', 'border': '1px solid var(--bridge-border)', 'border-radius': '4px' }}>
                <h4 style={{ margin: '0 0 0.2rem' }}>{template.name}</h4>
                <p style={{ 'font-size': '0.85rem', color: 'var(--bridge-text-muted)', margin: '0.2rem 0' }}>
                  {template.description}
                </p>
                <p style={{ 'font-size': '0.8rem', color: 'var(--bridge-text-muted)', margin: '0.2rem 0' }}>
                  Category: {template.category} · Model: {template.model}
                </p>
                <button
                  class="btn btn-primary"
                  type="button"
                  style={{ 'font-size': '0.85rem' }}
                  onClick={() => setSelectedTemplate(template)}
                >
                  Instantiate
                </button>
              </div>
            )}
          </For>
        </div>

        <div class="panel panel-pad">
          <h3>Your Agent Instances</h3>
          <p style={{ color: 'var(--bridge-text-muted)', 'font-size': '0.9rem', 'margin-bottom': '1rem' }}>
            Tenant-scoped agent instances
          </p>
          <For each={instances() || []}>
            {(instance) => (
              <div style={{ 'margin-bottom': '1rem', 'padding': '0.5rem', 'border': '1px solid var(--bridge-border)', 'border-radius': '4px' }}>
                <h4 style={{ margin: '0 0 0.2rem' }}>{instance.name}</h4>
                <p style={{ 'font-size': '0.85rem', color: 'var(--bridge-text-muted)', margin: '0.2rem 0' }}>
                  {instance.agent_key}
                </p>
                <p style={{ 'font-size': '0.8rem', color: 'var(--bridge-text-muted)', margin: '0.2rem 0' }}>
                  Template: {instance.template_name || 'Custom'} · Status: {instance.status}
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    class="btn"
                    type="button"
                    style={{ 'font-size': '0.85rem' }}
                    onClick={() => viewInstance(instance.id)}
                  >
                    View
                  </button>
                  <button
                    class="btn"
                    type="button"
                    style={{ 'font-size': '0.85rem' }}
                    onClick={() => deleteInstance(instance.id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            )}
          </For>
        </div>
      </div>

      <Show when={selectedTemplate()}>
        <div class="panel panel-pad" style={{ 'margin-top': '1rem' }}>
          <h3>Instantiate: {selectedTemplate()!.name}</h3>
          <p>{selectedTemplate()!.description}</p>
          
          <h4>Skills</h4>
          <ul>
            <For each={selectedTemplate()!.skills || []}>
              {(skill: string) => <li>{skill}</li>}
            </For>
          </ul>
          
          <h4>Capabilities</h4>
          <ul>
            <For each={selectedTemplate()!.capabilities || []}>
              {(cap: string) => <li>{cap}</li>}
            </For>
          </ul>

          <div style={{ 'margin-top': '1rem' }}>
            <label style={{ display: 'block', 'margin-bottom': '0.5rem' }}>
              Agent Key:
              <input
                type="text"
                value={newInstanceKey()}
                onInput={(e) => setNewInstanceKey(e.currentTarget.value)}
                style={{ display: 'block', width: '100%', 'max-width': '300px', padding: '0.5rem' }}
                placeholder="my-custom-agent"
              />
            </label>
            <label style={{ display: 'block', 'margin-bottom': '0.5rem' }}>
              Agent Name:
              <input
                type="text"
                value={newInstanceName()}
                onInput={(e) => setNewInstanceName(e.currentTarget.value)}
                style={{ display: 'block', width: '100%', 'max-width': '300px', padding: '0.5rem' }}
                placeholder="My Custom Agent"
              />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', 'margin-top': '1rem' }}>
            <button
              class="btn btn-primary"
              type="button"
              disabled={instantiating()}
              onClick={instantiateAgent}
            >
              {instantiating() ? 'Instantiating...' : 'Instantiate Agent'}
            </button>
            <button
              class="btn"
              type="button"
              onClick={() => setSelectedTemplate(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      </Show>

      <Show when={selectedInstance()}>
        <div class="panel panel-pad" style={{ 'margin-top': '1rem' }}>
          <h3>{selectedInstance()!.name}</h3>
          <p>Agent Key: {selectedInstance()!.agent_key}</p>
          <p>Description: {selectedInstance()!.description || 'No description'}</p>
          <p>Model: {selectedInstance()!.model || 'Default'}</p>
          
          <h4>Skills</h4>
          <ul>
            <For each={selectedInstance()!.skills || []}>
              {(skill: string) => <li>{skill}</li>}
            </For>
          </ul>
          
          <h4>Capabilities</h4>
          <ul>
            <For each={selectedInstance()!.capabilities || []}>
              {(cap: string) => <li>{cap}</li>}
            </For>
          </ul>

          <h4>Configuration</h4>
          <pre style={{ 'font-family': 'var(--bridge-mono)', 'font-size': '0.8rem', 'background': 'var(--bridge-bg-secondary)', padding: '1rem', 'border-radius': '4px' }}>
            {JSON.stringify(selectedInstance()!.config, null, 2)}
          </pre>

          <h4>Recent Executions</h4>
          <ul>
            <For each={selectedInstance()!.executions || []}>
              {(exec: any) => (
                <li>
                  {exec.goal} - {exec.status} ({new Date(exec.created_at).toLocaleString()})
                </li>
              )}
            </For>
          </ul>

          <label style={{ display: 'block', 'margin-top': '1rem' }}>
            Execution prompt
            <textarea
              class="input"
              rows={3}
              value={executionPrompt()}
              onInput={(e) => setExecutionPrompt(e.currentTarget.value)}
              placeholder="Describe the plan or analysis you need"
              style={{ display: 'block', width: '100%', 'margin-top': '0.35rem' }}
            />
          </label>
          <button class="btn btn-primary" type="button" disabled={executing() || !executionPrompt().trim()} onClick={executeInstance} style={{ 'margin-top': '0.75rem' }}>
            {executing() ? 'Queueing...' : 'Run agent'}
          </button>

          <button
            class="btn"
            type="button"
            onClick={() => setSelectedInstance(null)}
            style={{ 'margin-left': '0.5rem' }}
          >
            Close
          </button>
        </div>
      </Show>
    </section>
  );
}
