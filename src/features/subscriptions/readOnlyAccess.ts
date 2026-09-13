import type { SubscriptionContextValue } from './types';
export const READ_ONLY_MESSAGE = 'Abonnement expiré : vos données restent consultables. Renouvelez pour ajouter, modifier ou supprimer.';
export function isSubscriptionReadOnly(subscription: SubscriptionContextValue | null, now = Date.now()) {
  if (!subscription) return false;
  return subscription.isReadOnly || !['active', 'trialing'].includes(subscription.status ?? '')
    || !subscription.expiresAt || !Number.isFinite(Date.parse(subscription.expiresAt))
    || Date.parse(subscription.expiresAt) <= now;
}
type Access = { companyId: string; subscription: SubscriptionContextValue | null; superAdmin: boolean };
let access: Access | null = null;
export function registerSubscriptionAccess(value: Access) {
  access = value;
  return () => { if (access === value) access = null; };
}
export function companyReadOnlyStatus(companyId: string | null | undefined): boolean | undefined {
  if (!companyId || access?.companyId !== companyId || !access.subscription) return undefined;
  return !access.superAdmin && isSubscriptionReadOnly(access.subscription);
}
export function companyIsReadOnly(companyId: string | null | undefined) {
  return !!companyId && access?.companyId === companyId && !access.superAdmin && isSubscriptionReadOnly(access.subscription);
}
export function assertMutationAllowed(meta?: Record<string, unknown>) {
  if (meta?.allowReadOnly === true) return;
  if (access && companyIsReadOnly(access.companyId)) throw new Error(READ_ONLY_MESSAGE);
}
