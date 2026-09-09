import { createSignal, onMount } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import { isAuthRequired } from '~/auth/auth-config';
import { handleCallback, login, logout, getUser } from '~/auth/oidc';
import { loginTimeline } from '~/motion/registry';
import { setWorkspace } from '~/stores/workspace';

export function LoginPage() {
  let mark!: HTMLDivElement;
  let title!: HTMLHeadingElement;
  let card!: HTMLDivElement;
  let cta!: HTMLButtonElement;
  let canvas!: HTMLCanvasElement;
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(false);
  const navigate = useNavigate();

  onMount(() => {
    loginTimeline({ mark, title, card, cta });
    let dispose: (() => void) | undefined;
    (async () => {
      const { createEcosystemScene, webglSupported } = await import('~/three/EcosystemScene');
      if (!webglSupported() || !canvas) return;
      const scene = createEcosystemScene(canvas, {
        nodes: [
          { id: '1', label: 'Identity', kind: 'provider' },
          { id: '2', label: 'Control', kind: 'capability' },
          { id: '3', label: 'Tenant', kind: 'tenant' }
        ]
      });
      dispose = () => scene.dispose();
    })();
    return () => dispose?.();
  });

  async function continueOidc() {
    setBusy(true);
    setError('');
    try {
      if (!isAuthRequired()) {
        navigate('/');
        return;
      }
      await login();
    } catch (e: any) {
      setError(e.message || 'OIDC login failed');
      setBusy(false);
    }
  }

  return (
    <div class="login-page">
      <canvas class="login-canvas" ref={canvas!} aria-hidden="true" />
      <div class="panel login-card panel-pad" ref={card!}>
        <div class="brand" ref={mark!} style={{ 'margin-bottom': '1rem' }}>
          BRIDGE <span>OS</span>
        </div>
        <h1 ref={title!}>Control Center</h1>
        <p>Enterprise SaaS operating plane. Identity via Keycloak · Authorization Code + PKCE.</p>
        <button class="btn btn-primary" style={{ width: '100%' }} ref={cta!} disabled={busy()} onClick={continueOidc}>
          {isAuthRequired() ? 'Continue with Bridge Identity' : 'Enter lab workspace'}
        </button>
        {error() && <p style={{ color: 'var(--bridge-danger)', 'margin-top': '1rem' }}>{error()}</p>}
        <p style={{ 'margin-top': '1rem', 'font-size': '0.8rem', color: 'var(--bridge-text-faint)' }}>
          Environment: lab · No passwords stored in the SPA
        </p>
      </div>
    </div>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [msg, setMsg] = createSignal('Completing sign-in…');

  onMount(async () => {
    try {
      const user = await handleCallback();
      setWorkspace('userLabel', user.profile?.preferred_username || user.profile?.email || 'Operator');
      setMsg('Signed in');
      navigate('/', { replace: true });
    } catch (e: any) {
      setMsg(e.message || 'Callback failed');
    }
  });

  return (
    <div class="login-page">
      <div class="panel login-card panel-pad">
        <h1>Bridge Identity</h1>
        <p>{msg()}</p>
      </div>
    </div>
  );
}

export function LogoutPage() {
  const navigate = useNavigate();
  onMount(async () => {
    try {
      if (isAuthRequired()) await logout();
      else navigate('/login', { replace: true });
    } catch {
      navigate('/login', { replace: true });
    }
  });
  return (
    <div class="login-page">
      <div class="panel login-card panel-pad">
        <p>Signing out…</p>
      </div>
    </div>
  );
}

export async function bootstrapUserLabel() {
  const user = await getUser();
  if (user) {
    setWorkspace('userLabel', user.profile?.preferred_username || user.profile?.email || 'Operator');
  }
}
