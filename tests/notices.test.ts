import { describe, expect, it } from 'vitest';
import { resolveNotice, NOTICE_MESSAGES } from '@/constants/notices';

// Audit externe (SM-04) : le paramètre d'URL `notice` était affiché
// littéralement — un lien forgé (WhatsApp, SMS) pouvait donc faire
// apparaître n'importe quel texte comme message "officiel" dans
// l'application (hameçonnage). resolveNotice() ne doit jamais renvoyer
// autre chose qu'un des messages fixes ci-dessous.
describe('resolveNotice', () => {
  it('renvoie le message fixe pour un code connu', () => {
    expect(resolveNotice('produit_enregistre')).toBe('Produit enregistré');
    expect(resolveNotice('vente_enregistree')).toBe('Vente enregistrée');
  });

  it('ignore silencieusement un texte arbitraire injecté depuis une URL', () => {
    expect(resolveNotice('Compte suspendu : appelez le 620 00 00 00 pour réactiver')).toBe('');
    expect(resolveNotice('<script>alert(1)</script>')).toBe('');
  });

  it('ignore un code absent ou vide', () => {
    expect(resolveNotice(undefined)).toBe('');
    expect(resolveNotice(null)).toBe('');
    expect(resolveNotice('')).toBe('');
  });

  it('ne renvoie jamais un texte qui ne fait pas partie du dictionnaire fixe', () => {
    const known = new Set(Object.values(NOTICE_MESSAGES) as string[]);
    for (const code of Object.keys(NOTICE_MESSAGES)) {
      expect(known.has(resolveNotice(code))).toBe(true);
    }
  });
});
