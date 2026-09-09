import type { LoginPortal } from './portalRules';

export type LoginPortalName = LoginPortal;

export function portalAccessDeniedMessage(portal: LoginPortalName) {
  return portal === 'employee'
    ? 'Ce compte ne possède pas d’accès employé.'
    : 'Ce compte ne possède pas d’accès administrateur.';
}
