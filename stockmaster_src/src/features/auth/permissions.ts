import type { MembershipContext } from '@/types/database';

export function hasPermission(membership: MembershipContext | null, required: string) {
  if (!membership) return false;
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
