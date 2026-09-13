import { describe, expect, it } from 'vitest';
import { assertMutationAllowed, companyIsReadOnly, isSubscriptionReadOnly, registerSubscriptionAccess } from '../src/features/subscriptions/readOnlyAccess';
import type { SubscriptionContextValue } from '../src/features/subscriptions/types';
const subscription = { status: 'active', isReadOnly: false, expiresAt: '2026-09-12T12:00:00Z' } as SubscriptionContextValue;
describe('expired subscriptions', () => {
  it('blocks at the exact deadline even with a stale active status', () => {
    expect(isSubscriptionReadOnly(subscription, Date.parse('2026-09-12T11:59:59Z'))).toBe(false);
    expect(isSubscriptionReadOnly(subscription, Date.parse(subscription.expiresAt!))).toBe(true);
    expect(isSubscriptionReadOnly({ ...subscription, status: 'past_due' }, 0)).toBe(true);
  });
  it('blocks business mutations while preserving explicitly exempt account actions', () => {
    const clear = registerSubscriptionAccess({ companyId: 'a', subscription: { ...subscription, isReadOnly: true }, superAdmin: false });
    try {
      expect(companyIsReadOnly('a')).toBe(true);
      expect(companyIsReadOnly('b')).toBe(false);
      expect(() => assertMutationAllowed()).toThrow('Abonnement expiré');
      expect(() => assertMutationAllowed({ allowReadOnly: true })).not.toThrow();
    } finally { clear(); }
    expect(() => assertMutationAllowed()).not.toThrow();
  });
  it('does not restrict super admin maintenance', () => {
    const clear = registerSubscriptionAccess({ companyId: 'a', subscription: { ...subscription, isReadOnly: true }, superAdmin: true });
    try { expect(() => assertMutationAllowed()).not.toThrow(); } finally { clear(); }
  });
});

import { hasPermission } from '../src/features/auth/permissions';
import type { MembershipContext } from '../src/types/database';
describe('role permissions during subscription changes', () => {
  const manager = { companyId: 'a', role: 'employee', permissions: ['products.write'], subscriptionStatus: 'expired' } as MembershipContext;
  it('retains inherited reads but removes writes after expiration', () => {
    expect(hasPermission(manager, 'products.read', true)).toBe(true);
    expect(hasPermission(manager, 'products.write', true)).toBe(false);
    expect(hasPermission(manager, 'sales.read', true)).toBe(false);
  });
  it('uses a fresh renewed subscription over an old membership status', () => {
    const clear = registerSubscriptionAccess({ companyId: 'a', subscription: { ...subscription, expiresAt: '2099-01-01T00:00:00Z' }, superAdmin: false });
    try { expect(hasPermission(manager, 'products.write')).toBe(true); } finally { clear(); }
  });
});
