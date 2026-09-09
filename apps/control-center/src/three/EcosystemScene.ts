import {
  AmbientLight,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  LineSegments,
  Group
} from 'three';

export type TopologyNode = {
  id: string;
  label: string;
  kind: 'tenant' | 'app' | 'capability' | 'provider' | 'database' | 'agent' | 'workflow';
};

type Opts = {
  nodes: TopologyNode[];
  onSelect?: (id: string) => void;
};

export function createEcosystemScene(canvas: HTMLCanvasElement, opts: Opts) {
  const scene = new Scene();
  scene.background = new Color('#07090d');
  const camera = new PerspectiveCamera(50, 1, 0.1, 100);
  camera.position.set(0, 1.2, 6.5);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  scene.add(new AmbientLight(0xffffff, 0.55));
  const key = new DirectionalLight(0x3dd6c6, 1.1);
  key.position.set(3, 5, 2);
  scene.add(key);

  const group = new Group();
  scene.add(group);

  const materials: Record<string, MeshStandardMaterial> = {
    tenant: new MeshStandardMaterial({ color: '#6ea8ff', roughness: 0.35, metalness: 0.2 }),
    app: new MeshStandardMaterial({ color: '#3dd6c6', roughness: 0.3, metalness: 0.25 }),
    capability: new MeshStandardMaterial({ color: '#f0b429', roughness: 0.4 }),
    provider: new MeshStandardMaterial({ color: '#b388ff', roughness: 0.4 }),
    database: new MeshStandardMaterial({ color: '#3ecf8e', roughness: 0.45 }),
    agent: new MeshStandardMaterial({ color: '#ff8fab', roughness: 0.35 }),
    workflow: new MeshStandardMaterial({ color: '#9fb3c8', roughness: 0.5 })
  };

  const meshes: Array<{ id: string; mesh: Mesh }> = [];
  const nodes = opts.nodes.length
    ? opts.nodes
    : [
        { id: 't1', label: 'Tenant', kind: 'tenant' as const },
        { id: 'a1', label: 'Apps', kind: 'app' as const },
        { id: 'c1', label: 'Capabilities', kind: 'capability' as const },
        { id: 'p1', label: 'Providers', kind: 'provider' as const },
        { id: 'd1', label: 'Databases', kind: 'database' as const }
      ];

  nodes.forEach((n, i) => {
    const mesh = new Mesh(new SphereGeometry(0.22 + (i % 3) * 0.04, 24, 24), materials[n.kind] || materials.app);
    const angle = (i / nodes.length) * Math.PI * 2;
    const radius = 1.8 + (i % 2) * 0.35;
    mesh.position.set(Math.cos(angle) * radius, Math.sin(angle * 1.3) * 0.55, Math.sin(angle) * radius);
    mesh.userData = { id: n.id, label: n.label };
    group.add(mesh);
    meshes.push({ id: n.id, mesh });
  });

  const linePositions: number[] = [];
  for (let i = 0; i < meshes.length; i++) {
    const a = meshes[i].mesh.position;
    const b = meshes[(i + 1) % meshes.length].mesh.position;
    linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
  }
  const lineGeo = new BufferGeometry();
  lineGeo.setAttribute('position', new Float32BufferAttribute(linePositions, 3));
  group.add(new LineSegments(lineGeo, new LineBasicMaterial({ color: 0x3dd6c6, transparent: true, opacity: 0.35 })));

  let frame = 0;
  let disposed = false;
  let dragging = false;
  let lastX = 0;

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
  };
  const onPointerUp = () => {
    dragging = false;
  };
  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    group.rotation.y += dx * 0.005;
  };
  const onClick = (e: MouseEvent) => {
    // simple nearest-node pick by canvas x position
    const rect = canvas.getBoundingClientRect();
    const xNorm = (e.clientX - rect.left) / rect.width;
    const idx = Math.min(meshes.length - 1, Math.max(0, Math.floor(xNorm * meshes.length)));
    opts.onSelect?.(meshes[idx]?.id);
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('click', onClick);
  window.addEventListener('resize', resize);
  resize();

  const tick = () => {
    if (disposed) return;
    frame = requestAnimationFrame(tick);
    group.rotation.y += 0.0025;
    renderer.render(scene, camera);
  };
  tick();

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('click', onClick);
      window.removeEventListener('resize', resize);
      renderer.dispose();
    },
    resize
  };
}

export function webglSupported(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl') || c.getContext('experimental-webgl'));
  } catch {
    return false;
  }
}
