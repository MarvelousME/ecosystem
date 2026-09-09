import { For, Show, createResource, createSignal, onCleanup, onMount } from 'solid-js';
import { platformApi } from '~/api/platform';
import { pageEnter, staggerIn } from '~/motion/registry';
import type { TopologyNode } from '~/three/EcosystemScene';
import { workspaceStore } from '~/stores/workspace';
import { RoleHome, deriveHomeProfile, type HomeProfile } from '~/capabilities/roles';

export function CommandCenterPage() {
  let root!: HTMLElement;
  let canvas!: HTMLCanvasElement;
  const [selected, setSelected] = createSignal<string | null>(null);
  const [hasWebgl, setHasWebgl] = createSignal(true);
  const [metrics] = createResource(() => workspaceStore.tenantId, () => platformApi.commandCenter());
  const [me] = createResource(() => platformApi.me());
  const [apps] = createResource(() => workspaceStore.tenantId, () => platformApi.apps());
  const [capabilities] = createResource(() => platformApi.capabilities());
  const [providers] = createResource(() => platformApi.providers());
  const profile = (): HomeProfile =>
    (me()?.homeProfile as HomeProfile) ||
    deriveHomeProfile(me()?.roles || [], me()?.permissions || []);

  onMount(() => {
    pageEnter(root);
    staggerIn('.metric-card', root);
    let disposed = false;
    let disposeScene: (() => void) | undefined;
    (async () => {
      const { createEcosystemScene, webglSupported } = await import('~/three/EcosystemScene');
      setHasWebgl(webglSupported());
      if (disposed || !webglSupported() || !canvas) return;
      const nodes: TopologyNode[] = [
        ...(apps()?.slice(0, 6).map((a: any) => ({ id: a.id, label: a.name, kind: 'app' as const })) || []),
        ...(capabilities()?.slice(0, 4).map((c: any) => ({ id: c.id, label: c.id, kind: 'capability' as const })) || []),
        ...(providers()?.slice(0, 4).map((p: any) => ({ id: p.id, label: p.id, kind: 'provider' as const })) || [])
      ];
      const scene = createEcosystemScene(canvas, { nodes, onSelect: setSelected });
      disposeScene = () => scene.dispose();
    })();
    onCleanup(() => {
      disposed = true;
      disposeScene?.();
    });
  });

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Good day, {workspaceStore.userLabel}</h1>
          <p>Bridge Ecosystem · {workspaceStore.environment} · live control-plane metrics only</p>
        </div>
        <span class="status-pill status-ok">Platform Health</span>
      </div>

      <div class="scene-wrap">
        <Show when={hasWebgl()} fallback={<div class="scene-fallback">WebGL unavailable — 2D topology mode</div>}>
          <canvas ref={canvas!} style={{ width: '100%', height: '100%' }} />
        </Show>
      </div>
      <Show when={selected()}>
        <p style={{ color: 'var(--bridge-text-muted)' }}>Focused node: {selected()}</p>
      </Show>

      <Show when={metrics.error}>
        <p style={{ color: 'var(--bridge-danger)' }}>{(metrics.error as Error).message}</p>
      </Show>
      <RoleHome profile={profile()} metrics={metrics() as Record<string, number> | null} />
    </section>
  );
}
