import path from 'node:path';
import { defineConfig, loadEnv, type ResolvedConfig } from 'vite';
import { sitePorts } from '../../src/constants/siteLinks';
import { renderLegalIdentity, validateSharedPublicConfig } from '../../src/constants/publicConfig';
import { autofillStyles } from '../../src/constants/formStyles';

export function webConfig(site: 'public' | 'account' | 'admin') {
  return defineConfig(({ mode }) => {
    const env = { ...loadEnv(mode, process.cwd(), ['VITE_', 'EXPO_PUBLIC_']), ...process.env };
    validateSharedPublicConfig(env);
    const root = `apps/${site}-web`;
    const port = sitePorts[site === 'public' ? 'marketing' : site];
    return {
      root, cacheDir: `../../node_modules/.vite-${site}-web`, envDir: '../..', envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
      server: { port, strictPort: true }, preview: { port, strictPort: true },
      plugins: [
        { name: 'reserved-portal-port', configResolved: (config: ResolvedConfig) => {
          if (config.command === 'serve' && config.server.port !== port) throw new Error(`Le portail ${site} doit utiliser le port ${port}. Retirez l’option --port pour éviter d’ouvrir le mauvais espace.`);
        } },
        { name: 'shared-autofill-style', transformIndexHtml: () => [{ tag: 'style', children: autofillStyles, injectTo: 'head' as const }] },
        ...(site === 'public' ? [{ name: 'shared-legal-identity', transformIndexHtml: (html: string) => renderLegalIdentity(html, env) }] : []),
      ],
      build: {
        outDir: `../../dist/${site}-web`, emptyOutDir: true,
        ...(site === 'public' ? { rollupOptions: { input: Object.fromEntries(['index', 'legal-notice/index', 'privacy/index', 'terms/index', 'account-deletion/index'].map(page => [page, path.resolve(root, `${page}.html`)])) } } : {}),
      },
    };
  });
}
