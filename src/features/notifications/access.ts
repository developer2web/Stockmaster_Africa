import type { MembershipContext } from '@/types/database';

export function canUseNotifications(membership: MembershipContext | null) {
  // La boîte personnelle reste accessible ; le serveur filtre les alertes
  // selon leur destinataire, la boutique et les permissions métier.
  return !!membership?.companyId && (membership.role === 'company_admin'
    || membership.role === 'employee');
}

export function notificationQueryKey(membership: MembershipContext | null, userId: string) {
  return ['persistent-notifications', membership?.companyId ?? '', userId,
    membership?.storeId ?? '', membership?.role ?? '', [...(membership?.permissions ?? [])].sort().join(',')];
}

export function notificationRoute(membership: MembershipContext | null) {
  return membership?.role === 'employee' ? '/employee/notifications' : '/notifications';
}
