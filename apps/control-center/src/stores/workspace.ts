import { createStore } from 'solid-js/store';

export type WorkspaceState = {
  tenantId: string | null;
  tenantName: string | null;
  environment: 'lab' | 'staging' | 'production';
  sidebarRail: boolean;
  mobileNavOpen: boolean;
  theme: 'dark' | 'light' | 'system';
  permissions: string[];
  userLabel: string;
};

const [workspaceStore, setWorkspace] = createStore<WorkspaceState>({
  tenantId: null,
  tenantName: null,
  environment: 'lab',
  sidebarRail: false,
  mobileNavOpen: false,
  theme: 'dark',
  permissions: ['platform.admin'],
  userLabel: 'Operator'
});

export { workspaceStore, setWorkspace };

export function setTenant(id: string | null, name?: string | null) {
  setWorkspace({ tenantId: id, tenantName: name ?? null });
}

export function toggleRail() {
  setWorkspace('sidebarRail', (v) => !v);
}

export function setTheme(theme: WorkspaceState['theme']) {
  setWorkspace('theme', theme);
  const resolved =
    theme === 'system'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
        ? 'light'
        : 'dark'
      : theme;
  document.documentElement.setAttribute('data-theme', resolved);
}
