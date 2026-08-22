import type { AppRole } from '@/types/database';

export type LoginPortal = 'admin' | 'employee';

export function portalAllowsRoles(roles: AppRole[], portal: LoginPortal, pendingAdministrator = false) {
  if (portal === 'employee') return roles.includes('employee');
  return roles.includes('company_admin') || pendingAdministrator;
}
