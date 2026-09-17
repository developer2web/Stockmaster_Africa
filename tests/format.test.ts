import { describe, expect, it } from 'vitest';
import { formatCurrency, formatLocalDate, formatNumber } from '../src/utils/format';

// SM-20 (audit externe) : fr-FR sépare les milliers par une espace fine
// insécable (U+202F), invisible selon la police/le rendu — fr-CA utilise une
// espace insécable normale (U+00A0), toujours visible. Calculé ici plutôt que
// retapé à la main (fragile, comme le bug lui-même).
describe('formatNumber et formatCurrency', () => {
  it('séparent les milliers par l’espace insécable de fr-CA, jamais celle de fr-FR', () => {
    const frCaThousand = new Intl.NumberFormat('fr-CA').format(450000);
    const frFrThousand = new Intl.NumberFormat('fr-FR').format(450000);
    expect(frCaThousand).not.toBe(frFrThousand);
    expect(formatNumber(450000)).toBe(frCaThousand);
    expect(formatCurrency(450000, 'GNF')).toContain(frCaThousand);
  });

  it('renvoie 0 pour une valeur non numérique plutôt que "NaN"', () => {
    expect(formatNumber('abc')).toBe('0');
    expect(formatCurrency(null)).toContain('0');
  });
});

// SM-20 (audit externe) : une colonne "date" sans heure (expense_date,
// due_date, closure_date…) s'affichait parfois brute ("2026-09-01") faute de
// passer par un formateur, et new Date("2026-09-01") vaut minuit UTC — un
// fuseau derrière UTC l'affiche encore la veille sans le correctif midi.
describe('formatLocalDate', () => {
  it('affiche une date "AAAA-MM-JJ" en français plutôt qu’au format ISO brut', () => {
    expect(formatLocalDate('2026-09-01')).toBe('1 septembre 2026');
  });

  it('reste sur le même jour même dans le fuseau le plus en arrière qui existe (UTC-12) — sans le correctif midi, minuit UTC y bascule déjà la veille', () => {
    const original = process.env.TZ;
    process.env.TZ = 'Etc/GMT+12'; // POSIX : "GMT+12" signifie UTC-12, le plus en arrière qui existe réellement.
    try {
      expect(formatLocalDate('2026-09-01')).toBe('1 septembre 2026');
    } finally {
      process.env.TZ = original;
    }
  });

  it('n’altère pas une valeur qui a déjà une heure', () => {
    expect(formatLocalDate('2026-09-01T23:00:00Z')).not.toBe('—');
  });

  it('renvoie un tiret pour une valeur absente', () => {
    expect(formatLocalDate(null)).toBe('—');
    expect(formatLocalDate(undefined)).toBe('—');
  });
});
