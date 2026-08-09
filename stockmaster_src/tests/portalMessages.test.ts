import { describe, expect, it } from 'vitest';
import { portalAccessDeniedMessage } from '../src/features/auth/portalMessages';

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
