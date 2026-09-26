import { hasAnyPermission } from '@/features/auth/permissions';
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

// Retour testeur du 26/09 : une notification doit renvoyer directement vers la page
// concernée (ex. « Demande de retrait d'accès » → Employés). null = pas de destination
// utile pour ce type/rôle : la carte reste alors un simple message non cliquable, plutôt
// qu'un lien vers un écran inaccessible ou sans rapport.
export function notificationTarget(type: string, membership: MembershipContext | null): string | null {
  if (!membership) return null;
  const employee = membership.role === 'employee';
  if (type === 'low_stock' || type === 'stock_out' || type === 'negative_stock') {
    if (!employee) return '/stock';
    return hasAnyPermission(membership, ['products.read']) ? '/employee/products' : null;
  }
  if (type === 'supplier_debt') {
    if (!employee) return '/suppliers';
    return hasAnyPermission(membership, ['suppliers.read']) ? '/employee/suppliers' : null;
  }
  if (type === 'cash_unclosed') {
    if (!employee) return '/cash';
    return hasAnyPermission(membership, ['cash_transactions.read', 'cash_transactions.write']) ? '/employee/cash' : null;
  }
  // Refus d'une demande de retrait : l'employé retrouve le motif dans ses Paramètres.
  if (type === 'employee_access_removal_rejected') return employee ? '/employee/settings' : null;
  // Les écrans ci-dessous n'existent que côté propriétaire/administrateur.
  if (employee) return null;
  if (type === 'customer_debt') return '/customers';
  if (type === 'employee_access_removal_request') return '/employees';
  if (type.startsWith('support_')) return '/support';
  if (type.startsWith('subscription_payment_')) return '/(subscription)/history';
  if (type.startsWith('subscription_')) return '/(subscription)';
  return null;
}
