import { companyReadOnlyStatus } from '@/features/subscriptions/readOnlyAccess';
import type { MembershipContext } from '@/types/database';

export function hasPermission(membership: MembershipContext | null, required: string, readOnly?: boolean) {
  if (!membership) return false;
  if (membership.role !== 'super_admin' && !required.endsWith('.read') && (readOnly ?? companyReadOnlyStatus(membership.companyId) ?? ['expired', 'past_due', 'canceled', 'cancelled'].includes(membership.subscriptionStatus ?? ''))) return false;
  if (membership.role === 'company_admin' || membership.role === 'super_admin') return true;
  if (membership.permissions.includes(required)) return true;
  if (required.endsWith('.read')) {
    return membership.permissions.includes(required.replace(/\.read$/, '.write'));
  }
  return false;
}

export function hasAnyPermission(membership: MembershipContext | null, required: string[]) {
  return required.some((permission) => hasPermission(membership, permission));
}
