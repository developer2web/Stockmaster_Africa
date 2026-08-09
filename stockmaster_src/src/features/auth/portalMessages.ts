export type LoginPortalName = 'admin' | 'employee';

export function portalAccessDeniedMessage(portal: LoginPortalName) {
  return portal === 'employee'
    ? 'Ce compte ne possède pas d’accès employé.'
    : 'Ce compte ne possède pas d’accès administrateur.';
}
