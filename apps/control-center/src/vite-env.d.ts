/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BRIDGE_API_URL?: string;
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_OIDC_AUTHORITY?: string;
  readonly VITE_OIDC_CLIENT_ID?: string;
  readonly VITE_OIDC_REDIRECT_URI?: string;
  readonly VITE_OIDC_POST_LOGOUT_REDIRECT_URI?: string;
  readonly VITE_OIDC_SCOPE?: string;
  readonly VITE_OIDC_ENABLED?: string;
  readonly VITE_REQUIRE_AUTH?: string;
  readonly VITE_PUCK_HOST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
