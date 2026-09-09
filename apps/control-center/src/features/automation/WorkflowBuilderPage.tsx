import { For, Show, createMemo, createSignal, onMount } from 'solid-js';
import { Form, SelectInput, SubmitButton, TextInput } from '~/primitives/forms';
import { platformApi } from '~/api/platform';
import { pageEnter } from '~/motion/registry';
import './workflow-builder.css';

export type WfNode = {
  id: string;
  type: 'trigger' | 'condition' | 'action' | 'agent' | 'capability' | 'delay';
  label: string;
  x: number;
  y: number;
};

const NODE_TYPES: WfNode['type'][] = ['trigger', 'condition', 'action', 'agent', 'capability', 'delay'];

export function WorkflowBuilderPage() {
  let root!: HTMLElement;
  const [workflows, setWorkflows] = createSignal<any[]>([]);
  const [selectedId, setSelectedId] = createSignal<string | null>(null);
  const [name, setName] = createSignal('New workflow');
  const [nodes, setNodes] = createSignal<WfNode[]>([
    { id: 'n1', type: 'trigger', label: 'Trigger', x: 40, y: 80 },
    { id: 'n2', type: 'action', label: 'Action', x: 220, y: 80 }
  ]);
  const [dragId, setDragId] = createSignal<string | null>(null);
  const [msg, setMsg] = createSignal('');
  const [addType, setAddType] = createSignal<WfNode['type']>('action');

  onMount(async () => {
    pageEnter(root);
    setWorkflows(await platformApi.workflows());
  });

  const edges = createMemo(() => {
    const list = nodes();
    return list.slice(0, -1).map((n, i) => ({ from: n.id, to: list[i + 1].id }));
  });

  function onPointerDown(id: string, e: PointerEvent) {
    setDragId(id);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: PointerEvent) {
    const id = dragId();
    if (!id) return;
    const canvas = (e.currentTarget as HTMLElement).closest('.wf-canvas') as HTMLElement;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    setNodes((list) =>
      list.map((n) =>
        n.id === id
          ? { ...n, x: Math.max(8, e.clientX - rect.left - 60), y: Math.max(8, e.clientY - rect.top - 20) }
          : n
      )
    );
  }

  function onPointerUp() {
    setDragId(null);
  }

  function addNode() {
    const i = nodes().length + 1;
    setNodes((list) => [
      ...list,
      { id: `n${Date.now()}`, type: addType(), label: `${addType()} ${i}`, x: 80 + i * 30, y: 60 + (i % 3) * 50 }
    ]);
  }

  function definitionFromNodes() {
    return {
      steps: nodes().map((n, idx) => ({
        id: n.id,
        type: n.type,
        name: n.label,
        order: idx,
        position: { x: n.x, y: n.y }
      })),
      edges: edges()
    };
  }

  async function save() {
    if (nodes().length < 1) throw new Error('Add at least one node before saving');
    const definition = definitionFromNodes();
    if (selectedId()) {
      await platformApi.updateWorkflow(selectedId()!, { name: name(), definition });
      setMsg(`Updated ${selectedId()}`);
    } else {
      const row = (await platformApi.createWorkflow({ name: name(), definition })) as any;
      setSelectedId(row.id);
      setMsg(`Created ${row.id}`);
    }
    setWorkflows(await platformApi.workflows());
  }

  async function load(id: string) {
    const wf = workflows().find((w) => w.id === id);
    if (!wf) return;
    setSelectedId(id);
    setName(wf.name);
    const steps = wf.definition?.steps || [];
    if (steps.length) {
      setNodes(
        steps.map((s: any, i: number) => ({
          id: s.id || `n${i}`,
          type: (s.type || 'action') as WfNode['type'],
          label: s.name || s.type || `Step ${i + 1}`,
          x: s.position?.x ?? 40 + i * 160,
          y: s.position?.y ?? 80
        }))
      );
    }
  }

  async function run() {
    if (!selectedId()) throw new Error('Save workflow first');
    const exec = await platformApi.executeWorkflow(selectedId()!);
    setMsg(`Executed ${(exec as any).id}`);
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Workflow Builder</h1>
          <p>Visual graph persisted to `/api/workflows` — invalid empty graphs cannot save</p>
        </div>
      </div>
      <div class="split-2">
        <div class="panel panel-pad">
          <Form onSubmit={save}>
            <TextInput label="Workflow name" name="name" value={name()} onChange={setName} required />
            <SelectInput
              label="Add node type"
              value={addType()}
              options={NODE_TYPES.map((t) => ({ value: t, label: t }))}
              onChange={setAddType}
            />
            <div style={{ display: 'flex', gap: '0.5rem', 'flex-wrap': 'wrap' }}>
              <button type="button" class="btn" onClick={addNode}>Add node</button>
              <SubmitButton>Save</SubmitButton>
              <button type="button" class="btn" onClick={run}>Execute</button>
            </div>
          </Form>
          <Show when={msg()}><p>{msg()}</p></Show>
          <div
            class="wf-canvas"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <svg class="wf-edges" width="100%" height="100%">
              <For each={edges()}>
                {(e) => {
                  const a = () => nodes().find((n) => n.id === e.from);
                  const b = () => nodes().find((n) => n.id === e.to);
                  return (
                    <Show when={a() && b()}>
                      <line
                        x1={(a()!.x + 60)}
                        y1={(a()!.y + 20)}
                        x2={(b()!.x + 60)}
                        y2={(b()!.y + 20)}
                        stroke="rgba(61,214,198,0.45)"
                        stroke-width="2"
                      />
                    </Show>
                  );
                }}
              </For>
            </svg>
            <For each={nodes()}>
              {(n) => (
                <div
                  class={`wf-node wf-${n.type}`}
                  style={{ left: `${n.x}px`, top: `${n.y}px` }}
                  onPointerDown={[onPointerDown, n.id]}
                >
                  <span>{n.type}</span>
                  <strong>{n.label}</strong>
                </div>
              )}
            </For>
          </div>
        </div>
        <div class="panel panel-pad">
          <h3>Saved workflows</h3>
          <ul>
            <For each={workflows()}>
              {(w) => (
                <li>
                  <button type="button" class="nav-link" onClick={() => load(w.id)}>
                    {w.name}
                  </button>
                </li>
              )}
            </For>
          </ul>
        </div>
      </div>
    </section>
  );
}
