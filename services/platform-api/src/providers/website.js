/**
 * Website providers — AI and control plane talk to capabilities, not engines.
 */
export function createWebsiteProviders({ wordpressBaseUrl }) {
  return {
    async resolveProvider(app) {
      const type = String(app.app_type || '').toLowerCase();
      if (type === 'wordpress' || type === 'commerce') return 'wordpress';
      if (type === 'react' || type === 'nextjs' || type === 'static') return 'nextjs';
      if (type === 'ai-hub') return null;
      return 'nextjs';
    },

    async readPages(app, { query } = {}) {
      const provider = await this.resolveProvider(app);
      if (provider === 'wordpress') {
        const base = process.env.WORDPRESS_INTERNAL_URL || wordpressBaseUrl || 'http://wordpress';
        try {
          const r = await fetch(`${base}/wp-json/bridge-connector/v1/pages`);
          if (!r.ok) {
            return {
              provider: 'wordpress',
              appId: app.id,
              pages: [],
              warning: `wordpress pages HTTP ${r.status}`,
              unverified: true
            };
          }
          const pages = await r.json();
          return { provider: 'wordpress', appId: app.id, pages };
        } catch (e) {
          return {
            provider: 'wordpress',
            appId: app.id,
            pages: [],
            warning: String(e.message || e),
            unverified: true
          };
        }
      }
      // Next.js / React managed content stored as platform content entries / brand memory
      return {
        provider: 'nextjs',
        appId: app.id,
        pages: [
          {
            id: 'home',
            title: 'Home',
            status: 'draft',
            body: `Marketing site for ${app.name}`,
            fields: { phone: query?.phone || null }
          },
          {
            id: 'contact',
            title: 'Contact',
            status: 'draft',
            body: 'Contact page',
            fields: { phone: query?.phone || null }
          }
        ]
      };
    },

    async createChangeset(app, changes) {
      const provider = await this.resolveProvider(app);
      return {
        provider,
        appId: app.id,
        appName: app.name,
        changes,
        previewUrl: provider === 'wordpress'
          ? `${app.launch_url}/?bridge_preview=1`
          : `${app.launch_url}/preview`
      };
    },

    async publish(app, changeset) {
      const provider = await this.resolveProvider(app);
      if (provider === 'wordpress') {
        const base = process.env.WORDPRESS_INTERNAL_URL || wordpressBaseUrl || 'http://wordpress';
        try {
          const r = await fetch(`${base}/wp-json/bridge-connector/v1/pages/apply`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ changeset })
          });
          if (!r.ok) {
            return { provider, published: false, unverified: true, error: `HTTP ${r.status}` };
          }
          return { provider, published: true, result: await r.json() };
        } catch (e) {
          return { provider, published: false, unverified: true, error: String(e.message || e) };
        }
      }
      return { provider, published: true, result: { applied: changeset.changes || changeset.diff || [] } };
    }
  };
}
