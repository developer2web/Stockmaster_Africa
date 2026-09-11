import { describe, expect, it } from 'vitest';
import { accountHandoffUrl, accountPortalDestination } from '../supabase/functions/_shared/portal';
import { validateReplacementPassword } from '../supabase/functions/_shared/password';
import { assertSamePaymentRequest, existingPaymentResponse, paymentRequestDetails, type PaymentInput, type PaymentOperation } from '../supabase/functions/_shared/paymentOperation';

describe('Account session handoff', () => {
  it('rejects an untrusted destination even when it uses HTTPS', () => {
    expect(() => accountPortalDestination('https://account.example.test', 'https://attacker.example.test')).toThrow('ne correspond pas');
    expect(() => accountPortalDestination(undefined, 'https://attacker.example.test')).toThrow('configurée côté serveur');
  });
  it('requires an explicit local configuration for HTTP development', () => {
    expect(() => accountPortalDestination('http://localhost:4001', undefined)).toThrow('HTTPS');
    expect(accountPortalDestination('http://localhost:4001', undefined, true).origin).toBe('http://localhost:4001');
    expect(() => accountPortalDestination('http://account.example.test', undefined, true)).toThrow('HTTPS');
    expect(() => accountPortalDestination('https://user:secret@account.example.test', undefined)).toThrow('HTTPS');
  });
  it('puts the one-time token only in the fragment, with a clean server destination', () => {
    const destination = accountPortalDestination('https://account.example.test/path?unused=yes#old', 'https://account.example.test/untrusted-path');
    const url = new URL(accountHandoffUrl(destination, 'company-a', 'sensitive token/+'));
    expect(url.pathname).toBe('/');
    expect(url.searchParams.get('companyId')).toBe('company-a');
    expect(url.searchParams.has('handoff')).toBe(false);
    expect(new URLSearchParams(url.hash.slice(1)).get('handoff')).toBe('sensitive token/+');
    url.hash = '';
    expect(url.toString()).not.toContain('sensitive');
  });
});

describe('payment operation integrity', () => {
  const input: PaymentInput = { companyId: 'company-a', planId: 'plan-a', provider: 'stripe', billingCycle: 'monthly', promoCode: ' Welcome ' };
  const operation: PaymentOperation = {
    id: 'payment-a', company_id: 'company-a', plan_id: 'plan-a', provider: 'stripe', billing_cycle: 'monthly',
    phone_number: null, retained_company_id: null, promotion_id: 'promo-a', request_details: paymentRequestDetails(input),
    provider_reference: 'cs_existing', status: 'succeeded', amount: 100, currency: 'GNF', provider_payload: { url: 'https://checkout.stripe.com/existing' },
  };
  it('allows an identical retry without changing status or reviving a checkout', () => {
    expect(() => assertSamePaymentRequest(operation, { ...input, promoCode: 'WELCOME' })).not.toThrow();
    expect(existingPaymentResponse(operation)).toMatchObject({ status: 'succeeded', providerReference: 'cs_existing', authorizationUrl: null });
    expect(operation.status).toBe('succeeded');
  });
  it.each([{ companyId: 'company-b' }, { planId: 'plan-b' }, { billingCycle: 'annual' as const }, { promoCode: null }, { keepCompanyId: 'company-b' }])('rejects reusing the same operation for %j', change => {
    expect(() => assertSamePaymentRequest(operation, { ...input, ...change })).toThrow('d’autres paramètres');
  });
  it('returns the existing checkout for a processing payment', () => {
    expect(existingPaymentResponse({ ...operation, status: 'processing' }).authorizationUrl).toBe('https://checkout.stripe.com/existing');
  });
});

describe('temporary password replacement validation', () => {
  it.each([null, '', 'short', 'aaaaaaaaaaaaa', 'AAAAAAAA1234!', 'Weak1!', `Strong1!${'a'.repeat(130)}`])('rejects an invalid server-side password', password => {
    expect(() => validateReplacementPassword(password)).toThrow();
  });
  it('accepts a strong replacement without changing its contents', () => {
    expect(validateReplacementPassword('NouvellePhrase9!')).toBe('NouvellePhrase9!');
  });
});
