import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { inlineScriptHashes, securityHeaders } = require('../scripts/security-headers.cjs');

describe('deployment security headers', () => {
  it('allows exact Expo bootstrap hashes without enabling arbitrary inline scripts', () => {
    const source = 'globalThis.__EXPO_ROUTER_HYDRATE__=true;';
    const hashes = inlineScriptHashes(`<script type="module">${source}</script><script src="/app.js"></script><script type="application/json">{}</script>`);
    expect(hashes).toEqual([`'sha256-${createHash('sha256').update(source).digest('base64')}'`]);
    const policy = securityHeaders({}, hashes)['Content-Security-Policy'];
    const scripts = policy.split('; ').find((part: string) => part.startsWith('script-src'));
    expect(scripts).toContain(hashes[0]);
    expect(scripts).not.toContain('unsafe-inline');
    expect(scripts).not.toContain('unsafe-eval');
  });

  it('limits API and realtime connections to the configured Supabase origin', () => {
    const headers = securityHeaders({ EXPO_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' });
    expect(headers['Content-Security-Policy']).toContain("connect-src 'self' https://example.supabase.co wss://example.supabase.co;");
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['Referrer-Policy']).toBe('no-referrer');
    expect(headers['Permissions-Policy']).toContain('camera=(self)');
    expect(headers['Strict-Transport-Security']).not.toContain('includeSubDomains');
  });

  it('permits the existing Google Fonts stylesheet and font files without granting script or API access', () => {
    const policy = securityHeaders({})['Content-Security-Policy'];
    const directives = policy.split('; ');
    expect(directives).toContain("style-src 'self' 'unsafe-inline' https://fonts.googleapis.com");
    expect(directives).toContain("font-src 'self' data: https://fonts.gstatic.com");
    expect(directives).toContain("script-src 'self'");
    expect(directives).toContain("connect-src 'self'");
    expect(policy).not.toContain('*.google');
  });

  it('rejects remote plaintext and credentialed destinations while permitting local Supabase', () => {
    expect(() => securityHeaders({ VITE_SUPABASE_URL: 'http://remote.example' })).toThrow();
    expect(() => securityHeaders({ VITE_SUPABASE_URL: 'https://user:pass@remote.example' })).toThrow();
    expect(securityHeaders({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321' })['Content-Security-Policy']).toContain('ws://127.0.0.1:54321');
  });
});
