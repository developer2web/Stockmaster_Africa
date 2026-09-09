import { describe, expect, it } from 'vitest';
import { portalAccessDeniedMessage } from '../src/features/auth/portalMessages';
import { portalAllowsRoles } from '../src/features/auth/portalRules';

describe('messages de refus des portails', () => {
  it('indique uniquement l’absence d’accès employé', () => {
    expect(portalAccessDeniedMessage('employee')).toBe(
      'Ce compte ne possède pas d’accès employé.',
    );
  });

  it('ne révèle pas le rôle réel du compte', () => {
    const messages = [
      portalAccessDeniedMessage('employee'),
      portalAccessDeniedMessage('admin'),
    ];
    expect(messages.join(' ')).not.toMatch(/appartient|est un compte/i);
  });
});

describe('portal role separation', () => {
  it('never accepts a Super Admin in the main Admin portal', () => {
    expect(portalAllowsRoles(['super_admin'], 'admin')).toBe(false);
    expect(portalAllowsRoles(['super_admin', 'company_admin'], 'admin')).toBe(false);
    expect(portalAllowsRoles(['super_admin', 'employee'], 'employee')).toBe(false);
    expect(portalAllowsRoles(['super_admin'], 'admin', true)).toBe(false);
  });

  it('keeps Admin and Employee portals mutually exclusive', () => {
    expect(portalAllowsRoles(['company_admin'], 'admin')).toBe(true);
    expect(portalAllowsRoles(['company_admin'], 'employee')).toBe(false);
    expect(portalAllowsRoles(['employee'], 'employee')).toBe(true);
    expect(portalAllowsRoles(['employee'], 'admin')).toBe(false);
  });

  it('allows pending owners only through the administrator portal', () => {
    expect(portalAllowsRoles([], 'admin')).toBe(false);
    expect(portalAllowsRoles([], 'admin', true)).toBe(true);
    expect(portalAllowsRoles([], 'employee', true)).toBe(false);
  });
});
