import { For, Show, createResource, createSignal, onMount } from 'solid-js';
import { platformApi, type MarketplacePackage } from '~/api/platform';
import { workspaceStore } from '~/stores/workspace';
import { pageEnter } from '~/motion/registry';

export function MarketplacePage() {
  let root!: HTMLElement;
  const [packages] = createResource(() => workspaceStore.tenantId, () => platformApi.marketplace.discover());
  const [categories] = createResource(() => platformApi.marketplace.categories());
  const [selectedCategory, setSelectedCategory] = createSignal<string>('all');
  const [selectedPackage, setSelectedPackage] = createSignal<MarketplacePackage | null>(null);
  const [installing, setInstalling] = createSignal(false);
  const [installMessage, setInstallMessage] = createSignal('');
  onMount(() => pageEnter(root));

  const filteredPackages = () => {
    const pkgs: MarketplacePackage[] = packages() || [];
    const cat = selectedCategory();
    if (cat === 'all') return pkgs;
    return pkgs.filter((p) => p.category === cat);
  };

  async function installPackage(pkg: MarketplacePackage) {
    if (!workspaceStore.tenantId) {
      setInstallMessage('Please select a tenant first');
      return;
    }
    
    const latestVersion = pkg.versions?.[0];
    if (!latestVersion) {
      setInstallMessage('No published version available');
      return;
    }

    setInstalling(true);
    setInstallMessage('');
    try {
      const result = await platformApi.marketplace.install({
        packageId: pkg.id,
        versionId: latestVersion.id,
        config: {}
      });
      setInstallMessage(`Installation requested: ${result.installation_key}`);
      setSelectedPackage(null);
    } catch (e: any) {
      setInstallMessage(`Installation failed: ${e.message}`);
    } finally {
      setInstalling(false);
    }
  }

  return (
    <section ref={root!}>
      <div class="page-header">
        <div>
          <h1>Marketplace</h1>
          <p>Discover and install applications for your tenant</p>
        </div>
      </div>

      <Show when={installMessage()}>
        <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
          <p>{installMessage()}</p>
        </div>
      </Show>

      <div class="panel panel-pad" style={{ 'margin-bottom': '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', 'flex-wrap': 'wrap' }}>
          <button
            class={`btn ${selectedCategory() === 'all' ? 'btn-primary' : ''}`}
            type="button"
            onClick={() => setSelectedCategory('all')}
          >
            All
          </button>
          <For each={categories() || []}>
            {(cat) => (
              <button
                class={`btn ${selectedCategory() === cat.slug ? 'btn-primary' : ''}`}
                type="button"
                onClick={() => setSelectedCategory(cat.slug)}
              >
                {cat.name}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="metric-grid">
        <For each={filteredPackages()}>
          {(pkg) => (
            <article class="panel panel-pad">
              <Show when={pkg.featured}>
                <span class="status-pill status-ok">Featured</span>
              </Show>
              <h3 style={{ 'font-family': 'var(--bridge-display)', margin: '0.6rem 0 0.2rem' }}>
                {pkg.name}
              </h3>
              <p style={{ color: 'var(--bridge-text-muted)', margin: '0.2rem 0', 'font-size': '0.9rem' }}>
                {pkg.description}
              </p>
              <p style={{ color: 'var(--bridge-text-muted)', margin: '0.2rem 0', 'font-size': '0.8rem' }}>
                Version: {pkg.versions?.[0]?.version || 'N/A'} · Publisher: {pkg.publisher_id}
              </p>
              <div style={{ display: 'flex', gap: '0.5rem', 'margin-top': '1rem' }}>
                <button
                  class="btn btn-primary"
                  type="button"
                  disabled={installing()}
                  onClick={() => installPackage(pkg)}
                >
                  Install
                </button>
                <button
                  class="btn"
                  type="button"
                  onClick={() => setSelectedPackage(pkg)}
                >
                  Details
                </button>
              </div>
            </article>
          )}
        </For>
      </div>

      <Show when={selectedPackage()}>
        <div class="panel panel-pad" style={{ 'margin-top': '1rem' }}>
          <h3>{selectedPackage()!.name}</h3>
          <p>{selectedPackage()!.description}</p>
          <Show when={selectedPackage()!.documentation_url}>
            <p>
              <a href={selectedPackage()!.documentation_url || undefined} target="_blank" rel="noreferrer">
                Documentation
              </a>
            </p>
          </Show>
          <Show when={selectedPackage()!.source_url}>
            <p>
              <a href={selectedPackage()!.source_url || undefined} target="_blank" rel="noreferrer">
                Source Code
              </a>
            </p>
          </Show>
          <h4>Versions</h4>
          <ul>
            <For each={selectedPackage()!.versions || []}>
              {(v) => (
                <li>
                  {v.version} - {v.changelog || 'No changelog'}
                  <Show when={v.requires_entitlement}>
                    <span style={{ 'font-size': '0.8rem', 'margin-left': '0.5rem' }}>
                      (Requires: {v.requires_entitlement})
                    </span>
                  </Show>
                </li>
              )}
            </For>
          </ul>
          <button class="btn" type="button" onClick={() => setSelectedPackage(null)}>
            Close
          </button>
        </div>
      </Show>
    </section>
  );
}
