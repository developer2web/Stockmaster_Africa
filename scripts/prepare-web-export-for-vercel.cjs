// Prépare l'export web Expo (`npm run export:web`, écrit dans dist/) pour
// un déploiement Vercel propre. Deux problèmes sinon, découverts et
// corrigés à la main plusieurs fois le 15-16/09 (voir la mémoire de
// session hosting-domain-status) :
//
// 1. Vercel ignore silencieusement tout fichier dont le chemin contient
//    « node_modules » (y compris de simples images/polices statiques que
//    l'export d'Expo range sous assets/node_modules/... en miroir du
//    chemin de résolution du module d'origine). Symptôme : icônes en
//    petits carrés, erreur réseau au démarrage.
// 2. L'export est multi-pages (un .html par route) : la navigation au
//    clic fonctionne, mais un accès direct ou un rafraîchissement sur
//    une route non-racine renvoie 404 sans configuration Vercel dédiée.
//
// Usage : node scripts/prepare-web-export-for-vercel.cjs [dist] [sortie]
//   dist    répertoire de l'export Expo (défaut: dist)
//   sortie  répertoire à créer/écraser, prêt pour `vercel deploy`
//           (défaut: app-web-export)
const { cpSync, existsSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } = require('node:fs');
const path = require('node:path');

// Un déploiement Vercel unique ne doit contenir qu'une seule app : les
// 3 portails Vite ont leur propre déploiement séparé, donc on ne prend
// jamais leurs sous-dossiers si jamais ils coexistent dans le même dist/
// (build:web:all et export:web peuvent écrire dans le même dist/ sans
// se marcher dessus, mais on ne veut pas les envoyer ensemble).
const SIBLING_APP_DIRS = ['admin-web', 'account-web', 'public-web'];

// Segments dynamiques ([id]) connus de l'app, pour les règles de
// réécriture Vercel. À tenir à jour si de nouvelles routes dynamiques
// sont ajoutées, sinon elles retourneront 404 en accès direct/rechargement
// une fois déployées (la navigation au clic, elle, continuera de marcher).
const DYNAMIC_ROUTES = [
  { prefix: '/customers', siblings: ['new'] },
  { prefix: '/products', siblings: ['new', 'import'] },
  { prefix: '/sales', siblings: ['new', 'refund'] },
  { prefix: '/employee/products', siblings: ['new', 'import'] },
  { prefix: '/employee/sales', siblings: ['new', 'refund'] },
];

function vercelConfig() {
  return {
    cleanUrls: true,
    rewrites: [
      ...DYNAMIC_ROUTES.map(({ prefix, siblings }) => ({
        source: `${prefix}/:id((?!${siblings.map((s) => `${s}$`).join('|')}).*)`,
        destination: `${prefix}/%5Bid%5D`,
      })),
      // Doit rester en dernier : Vercel sert d'abord un fichier réel s'il
      // existe (JS/CSS/images, pages .html via cleanUrls) et ne retombe sur
      // les rewrites que sinon, donc cette règle ne peut pas intercepter un
      // contenu qui existe vraiment. Sans elle, une adresse inconnue tombait
      // sur la page d'erreur générique de Vercel (en anglais, avec un
      // identifiant technique interne, aucun retour vers l'app — audit
      // externe SM-05) au lieu de l'écran "Page introuvable" de l'app.
      { source: '/(.*)', destination: '/+not-found' },
    ],
  };
}

function prepare(distDir, outDir) {
  if (!existsSync(distDir)) throw new Error(`Introuvable : ${distDir}. Lancez d'abord npm run export:web.`);
  rmSync(outDir, { recursive: true, force: true });
  cpSync(distDir, outDir, {
    recursive: true,
    filter: (src) => {
      const rel = path.relative(distDir, src);
      const top = rel.split(path.sep)[0];
      return !SIBLING_APP_DIRS.includes(top);
    },
  });

  const nodeModulesAssets = path.join(outDir, 'assets', 'node_modules');
  if (existsSync(nodeModulesAssets)) {
    const vendorAssets = path.join(outDir, 'assets', 'vendor-assets');
    renameSync(nodeModulesAssets, vendorAssets);
    const jsDir = path.join(outDir, '_expo', 'static', 'js', 'web');
    let patched = 0;
    if (existsSync(jsDir)) {
      for (const entry of readdirSync(jsDir)) {
        if (!entry.endsWith('.js')) continue;
        const file = path.join(jsDir, entry);
        const original = require('node:fs').readFileSync(file, 'utf8');
        const fixed = original.split('assets/node_modules').join('assets/vendor-assets');
        if (fixed !== original) { writeFileSync(file, fixed); patched += 1; }
      }
    }
    console.log(`assets/node_modules -> assets/vendor-assets (${patched} bundle(s) corrigé(s))`);
  }

  writeFileSync(path.join(outDir, 'vercel.json'), `${JSON.stringify(vercelConfig(), null, 2)}\n`);
  console.log(`vercel.json écrit dans ${outDir}`);
  console.log(`Prêt : vercel deploy ${outDir} --project app-web-export --prod --yes --non-interactive`);
}

module.exports = { prepare, vercelConfig };

if (require.main === module) {
  const distDir = path.resolve(process.argv[2] || 'dist');
  const outDir = path.resolve(process.argv[3] || 'app-web-export');
  try {
    prepare(distDir, outDir);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
