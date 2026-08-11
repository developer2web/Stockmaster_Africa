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

/** Affiche une quantité sans zéros décimaux inutiles, avec au plus 3 décimales. */
export function formatQuantity(value: unknown): string {
  const quantity = Number(value ?? 0);
  if (!Number.isFinite(quantity)) return '0';
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(quantity);
}
