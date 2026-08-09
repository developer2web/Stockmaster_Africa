/**
 * Normalise une saisie numérique tapée au clavier (marché francophone).
 * Accepte la virgule comme séparateur décimal ("1,5") et les espaces
 * séparateurs de milliers ("1 250,75"), puis renvoie un nombre JS.
 */
export function parseDecimal(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return NaN;
  const normalized = value.replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return NaN;
  return Number(normalized);
}
