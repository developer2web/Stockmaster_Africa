const { spawnSync } = require('node:child_process');
const { mkdirSync, writeFileSync } = require('node:fs');
const baseline = require('../docs/security/npm-audit-baseline.json');

const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--omit=dev', '--json'], {
  encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
});
let audit;
try { audit = JSON.parse(result.stdout); } catch { /* Handle registry failures below. */ }
if (result.error || !audit?.vulnerabilities || audit.error) {
  console.error('Audit npm impossible : vérifiez la connexion au registre, puis relancez npm run security:audit.');
  process.exitCode = 1;
} else {
  mkdirSync('.tmp/security', { recursive: true });
  writeFileSync('.tmp/security/npm-audit.json', `${JSON.stringify(audit, null, 2)}\n`);
  const allowed = new Set(baseline.advisories.map((entry) => entry.url));
  const unexpected = new Map();
  for (const vulnerability of Object.values(audit.vulnerabilities)) {
    for (const advisory of vulnerability.via) {
      if (typeof advisory === 'object' && (advisory.severity === 'critical' || !allowed.has(advisory.url))) {
        unexpected.set(advisory.url, advisory);
      }
    }
  }
  console.log('Audit npm (dépendances de production et outils Expo transitifs) :', audit.metadata.vulnerabilities);
  if (unexpected.size) {
    for (const advisory of unexpected.values()) console.error(`${advisory.severity}: ${advisory.title} — ${advisory.url}`);
    console.error('Nouvel avis à corriger ou à analyser explicitement avant de modifier la liste résiduelle.');
    process.exitCode = 1;
  } else {
    console.log('Aucun nouvel avis hors des exceptions Expo SDK 54 documentées. Les avis résiduels ne sont pas résolus.');
  }
}
