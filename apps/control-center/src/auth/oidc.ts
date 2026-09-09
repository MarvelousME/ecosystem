import { UserManager, WebStorageStateStore, type User } from 'oidc-client-ts';
import { buildOidcSettings } from './auth-config';

let manager: UserManager | null = null;

export function getUserManager(): UserManager {
  if (!manager) {
    manager = new UserManager({
      ...buildOidcSettings(import.meta.env),
      userStore: new WebStorageStateStore({ store: window.sessionStorage })
    });
  }
  return manager;
}

export async function getUser(): Promise<User | null> {
  try {
    return await getUserManager().getUser();
  } catch {
    return null;
  }
}

export async function login(): Promise<void> {
  await getUserManager().signinRedirect();
}

export async function logout(): Promise<void> {
  await getUserManager().signoutRedirect();
}

export async function handleCallback(): Promise<User> {
  return getUserManager().signinRedirectCallback();
}

export async function getAccessToken(): Promise<string | null> {
  const user = await getUser();
  if (!user || user.expired) return null;
  return user.access_token || null;
}

export async function isAuthenticated(): Promise<boolean> {
  const user = await getUser();
  return !!(user && !user.expired);
}
