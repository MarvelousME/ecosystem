import { UserManager, WebStorageStateStore } from 'oidc-client-ts';
import { buildOidcSettings } from './auth-config.js';

const settings = {
  ...buildOidcSettings(import.meta.env),
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  automaticSilentRenew: true
};

export const userManager = new UserManager(settings);

export async function getUser() {
  try {
    return await userManager.getUser();
  } catch {
    return null;
  }
}

export async function login() {
  return userManager.signinRedirect();
}

export async function logout() {
  return userManager.signoutRedirect();
}

export async function handleCallback() {
  return userManager.signinRedirectCallback();
}

export async function getAccessToken() {
  const user = await getUser();
  if (!user || user.expired) return null;
  return user.access_token || null;
}

export async function isAuthenticated() {
  const user = await getUser();
  return !!(user && !user.expired);
}
