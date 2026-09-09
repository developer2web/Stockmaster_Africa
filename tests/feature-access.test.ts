import { describe, expect, it } from 'vitest';
import { canUsePlanFeature, moduleFeatures } from '@/features/subscriptions/featureAccess';
import type { SubscriptionContextValue, SubscriptionPlan } from '@/features/subscriptions/types';

const subscription = { planId: 'plan', status: 'active', isReadOnly: false } as SubscriptionContextValue;
const plan = { id: 'plan', features: [{ featureKey: 'inventory', isEnabled: true }, { featureKey: 'supplier_debt', isEnabled: false }] } as SubscriptionPlan;
describe('subscription feature availability', () => {
  it('allows stock reception independently of supplier credit', () => {
    expect(canUsePlanFeature(subscription, plan, moduleFeatures['Recevoir du stock'])).toBe(true);
    expect(canUsePlanFeature(subscription, plan, 'supplier_debt')).toBe(false);
  });
  it('does not infer missing features or use another plan', () => {
    expect(canUsePlanFeature(subscription, plan, 'pdf_export')).toBe(false);
    expect(canUsePlanFeature({ ...subscription, planId: 'another' }, plan, 'inventory')).toBe(false);
  });
  it('refuses missing, expired and read-only subscriptions', () => {
    expect(canUsePlanFeature(null, plan, 'inventory')).toBe(false);
    expect(canUsePlanFeature(subscription, undefined, 'inventory')).toBe(false);
    expect(canUsePlanFeature({ ...subscription, status: 'expired' }, plan, 'inventory')).toBe(false);
    expect(canUsePlanFeature({ ...subscription, isReadOnly: true }, plan, 'inventory')).toBe(false);
  });
  it('allows an eligible trial and grace period using the server read-only flag', () => {
    expect(canUsePlanFeature({ ...subscription, status: 'trialing' }, plan, 'inventory')).toBe(true);
    expect(canUsePlanFeature({ ...subscription, status: 'past_due' }, plan, 'inventory')).toBe(true);
    expect(canUsePlanFeature({ ...subscription, status: 'past_due', isReadOnly: true }, plan, 'inventory')).toBe(false);
  });
});
