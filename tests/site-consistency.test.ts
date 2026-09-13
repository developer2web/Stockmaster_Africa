import { describe, expect, it } from 'vitest';
import { featureLabelsFor, formatBillingMoney, planDisplayName, remainingTrialDays, subscriptionStatusLabel } from '@/constants/commercial';
import { sitePorts, siteUrl } from '@/constants/siteLinks';
import { createLegalIdentity, legalIdentityFromEnv, renderLegalIdentity, validateSharedPublicConfig } from '@/constants/publicConfig';

describe('shared commercial information', () => {
  it('only advertises the rights received from the catalog, in a stable order', () => {
    expect(featureLabelsFor([])).toEqual([]);
    expect(featureLabelsFor(['pdf_export', 'sales', 'sales'])).toEqual(featureLabelsFor(['sales', 'pdf_export']));
    expect(featureLabelsFor(['excel_export', 'trial_14_days', 'unknown'])).toEqual(['Import Excel']);
  });
  it('uses catalog names ahead of historical technical codes', () => {
    expect(planDisplayName('premium')).toBe('Business');
    expect(planDisplayName('premium', 'Business Équipe')).toBe('Business Équipe');
    expect(planDisplayName('pro')).toBe('Pro');
  });
  it('formats billing consistently without losing cents in other currencies', () => {
    expect(formatBillingMoney(120000, 'GNF')).toBe(formatBillingMoney(120000, 'FG'));
    expect(formatBillingMoney(12.75, 'EUR')).toContain('12,75');
    expect(formatBillingMoney(Number.NaN)).toBe('—');
  });
  it('does not label a pending verification as a paid invoice', () => {
    expect(subscriptionStatusLabel('processing')).toBe('En vérification');
    expect(subscriptionStatusLabel('succeeded')).toBe('Payé');
    expect(subscriptionStatusLabel('expired')).toBe('Expiré');
  });
  it('shows trial days only for a real, unexpired trial', () => {
    const now = Date.parse('2026-09-07T12:00:00Z');
    expect(remainingTrialDays('trialing', '2026-09-10T12:00:00Z', now)).toBe(3);
    expect(remainingTrialDays('active', '2026-09-10T12:00:00Z', now)).toBeNull();
    expect(remainingTrialDays('trialing', '2026-09-06T12:00:00Z', now)).toBeNull();
    expect(remainingTrialDays('trialing', 'invalid', now)).toBeNull();
    expect(remainingTrialDays()).toBeNull();
  });
});

describe('site destinations', () => {
  it('uses configured URLs before local defaults', () => {
    expect(siteUrl('admin', 'https://control.example.test/', { hostname: 'localhost', protocol: 'http:' })).toBe('https://control.example.test');
  });
  it('uses the same local ports for links and Vite servers', () => {
    for (const site of ['marketing', 'account', 'admin', 'app'] as const) {
      expect(siteUrl(site, undefined, { hostname: '192.168.1.8', protocol: 'http:' })).toBe(`http://192.168.1.8:${sitePorts[site]}`);
    }
  });
  it('does not send a production visitor to a development port', () => {
    expect(siteUrl('account', undefined, { hostname: 'app.stockmaster.africa', protocol: 'https:' })).toBe('https://account.stockmaster.africa');
    expect(siteUrl('marketing', undefined, { hostname: 'account.stockmaster.africa', protocol: 'https:' })).toBe('https://stockmaster.africa');
  });
});

describe('shared configuration and legal identity', () => {
  it('rejects conflicting backend configuration without leaking its values', () => {
    expect(() => validateSharedPublicConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'private-value-one', VITE_SUPABASE_ANON_KEY: 'private-value-two' })).toThrow('Configuration discordante : EXPO_PUBLIC_SUPABASE_ANON_KEY et VITE_SUPABASE_ANON_KEY.');
  });
  it('rejects a web-only identity which cannot appear in the native app', () => {
    expect(() => validateSharedPublicConfig({ VITE_SUPPORT_EMAIL: 'help@example.test' })).toThrow('Renseignez EXPO_PUBLIC_SUPPORT_EMAIL');
  });
  it('rejects different Account destinations across Expo and the sites', () => {
    expect(() => validateSharedPublicConfig({ EXPO_PUBLIC_ACCOUNT_WEB_URL: 'https://one.example.test', VITE_ACCOUNT_URL: 'https://two.example.test' })).toThrow('Configuration discordante');
  });
  it('uses the same configured identity and missing-field text', () => {
    expect(legalIdentityFromEnv({})).toEqual(createLegalIdentity({}));
    expect(legalIdentityFromEnv({ EXPO_PUBLIC_SUPPORT_EMAIL: 'help@example.test' }).supportEmail).toBe('help@example.test');
  });
  it('escapes identity values inserted into static legal pages', () => {
    expect(renderLegalIdentity('<p>{{legal.entityName}}</p>', { EXPO_PUBLIC_LEGAL_ENTITY_NAME: '<script>alert(1)</script>' })).toBe('<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  });
});
