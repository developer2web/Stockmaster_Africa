const { createHash } = require('node:crypto');
const { readFileSync, readdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

function inlineScriptHashes(html) {
  const hashes = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if (/\bsrc\s*=/i.test(match[1]) || !match[2].trim()) continue;
    // JSON script blocks do not execute; hashing them is unnecessary.
    const type = /\btype\s*=\s*["']([^"']+)["']/i.exec(match[1])?.[1];
    if (type && !['module', 'text/javascript', 'application/javascript'].includes(type.toLowerCase())) continue;
    hashes.add(`'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`);
  }
  return [...hashes];
}

function supabaseOrigins(env) {
  const origins = new Set();
  for (const value of [env.EXPO_PUBLIC_SUPABASE_URL, env.VITE_SUPABASE_URL]) {
    if (!value) continue;
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) {
      throw new Error('La destination Supabase des en-têtes doit être HTTPS (HTTP autorisé uniquement en local).');
    }
    origins.add(url.origin);
    origins.add(url.origin.replace(/^http/, 'ws'));
  }
  return [...origins];
}

function securityHeaders(env, hashes = []) {
  const policy = [
    "default-src 'none'",
    `script-src 'self' ${[...new Set(hashes)].join(' ')}`.trim(),
    // React Native Web/Paper and receipts use inline styles; web portals load DM Sans.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // Receipt logos can be configured by the company using an external HTTPS URL.
    "img-src 'self' data: blob: https:",
    `connect-src 'self' ${supabaseOrigins(env).join(' ')}`.trim(),
    "font-src 'self' data: https://fonts.gstatic.com",
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
  return {
    'Content-Security-Policy': policy,
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    // Deliberately no includeSubDomains/preload: sibling hosts are unverified.
    'Strict-Transport-Security': 'max-age=31536000',
    'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',
  };
}

function writeSecurityHeaders(directory, env) {
  const hashes = new Set();
  function scan(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const filename = path.join(current, entry.name);
      // Each Vite portal has its own deployment root and its own header file.
      if (entry.isDirectory() && !['admin-web', 'account-web', 'public-web'].includes(entry.name)) scan(filename);
      else if (entry.isFile() && entry.name.endsWith('.html')) {
        for (const hash of inlineScriptHashes(readFileSync(filename, 'utf8'))) hashes.add(hash);
      }
    }
  }
  scan(directory);
  const headers = securityHeaders(env, [...hashes]);
  const lines = Object.entries(headers).map(([key, value]) => `  ${key}: ${value}`);
  if (lines.some((line) => line.length > 2000)) {
    throw new Error('Une ligne _headers dépasse 2 000 caractères : externalisez les scripts intégrés avant publication.');
  }
  writeFileSync(path.join(directory, '_headers'), `/*\n${lines.join('\n')}\n`);
  return headers;
}

module.exports = { inlineScriptHashes, securityHeaders, writeSecurityHeaders };

if (require.main === module) {
  (async () => {
    const { loadEnv } = await import('vite');
    const env = { ...loadEnv('production', process.cwd(), ['EXPO_PUBLIC_', 'VITE_']), ...process.env };
    const directory = process.argv[2];
    if (!directory) throw new Error('Usage: node scripts/security-headers.cjs <répertoire exporté>');
    writeSecurityHeaders(path.resolve(directory), env);
    console.log(`En-têtes de sécurité générés dans ${directory}/_headers`);
  })().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
