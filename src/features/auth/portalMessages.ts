import type { LoginPortal } from './portalRules';
import type { NoticeCode } from '@/constants/notices';

export type LoginPortalName = LoginPortal;

export function portalAccessDeniedMessage(portal: LoginPortalName) {
  return portal === 'employee'
    ? 'Ce compte ne possède pas d’accès employé.'
    : 'Ce compte ne possède pas d’accès administrateur.';
}

// Équivalent code-fixe de portalAccessDeniedMessage (voir constants/notices) —
// à tenir manuellement synchronisé avec elle.
export function portalAccessDeniedCode(portal: LoginPortalName): NoticeCode {
  return portal === 'employee' ? 'acces_employe_absent' : 'acces_admin_absent';
}
