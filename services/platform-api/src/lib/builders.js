/**
 * Visual builder providers — Puck (React) + Gutenberg (WordPress) deep links.
 */

export function createBuilderProviders({ pool }) {
  return {
    async puckSchema() {
      const components = (await pool.query('SELECT id, category, schema FROM visual_components ORDER BY category,id')).rows;
      return {
        provider: 'puck-builder',
        contract: 'IVisualBuilderProvider',
        status: 'READY',
        categories: [...new Set(components.map((c) => c.category))],
        components: components.map((c) => ({
          type: c.id,
          category: c.category,
          fields: Object.fromEntries((c.schema?.props || []).map((p) => [p, { type: 'text' }]))
        })),
        root: { props: { title: { type: 'text' } } }
      };
    },

    async puckDocument(app, { title = 'Home', phone = null } = {}) {
      return {
        provider: 'puck-builder',
        appId: app.id,
        appName: app.name,
        document: {
          root: { props: { title: title || app.name } },
          content: [
            { type: 'Hero', props: { title: app.name, subtitle: 'Built with Bridge Puck', cta: 'Get started' } },
            { type: 'Contact', props: { phone: phone || '+1-555-0100', email: 'hello@bridge.local', address: '' } },
            { type: 'CTA', props: { label: 'Contact us', href: '/contact' } }
          ]
        },
        editorUrl: `/#/build?builder=puck&appId=${app.id}`,
        previewUrl: `${app.launch_url}/preview?puck=1`
      };
    },

    async gutenbergDeepLink(app) {
      const base = (app.launch_url || process.env.WORDPRESS_INTERNAL_URL || 'http://localhost:8080').replace(/\/$/, '');
      return {
        provider: 'gutenberg-builder',
        contract: 'IVisualBuilderProvider',
        status: 'READY',
        appId: app.id,
        appName: app.name,
        siteEditorUrl: `${base}/wp-admin/site-editor.php`,
        postEditorUrl: `${base}/wp-admin/edit.php?post_type=page`,
        connectorHealth: `${base}/wp-json/bridge-connector/v1/health`,
        note: 'Opens WordPress Site Editor; content apply still goes through bridge-connector + changesets'
      };
    },

    async openBuilder(app) {
      const type = String(app.app_type || '').toLowerCase();
      if (type === 'wordpress' || type === 'commerce') {
        return this.gutenbergDeepLink(app);
      }
      const doc = await this.puckDocument(app);
      return {
        provider: 'puck-builder',
        status: 'READY',
        appId: app.id,
        editorUrl: doc.editorUrl,
        previewUrl: doc.previewUrl,
        document: doc.document
      };
    }
  };
}
