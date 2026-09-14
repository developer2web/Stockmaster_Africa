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

/**
 * Nettoie une valeur numérique renvoyée par la base (ex. "5.000", un numeric
 * Postgres sérialisé avec ses décimales fixes) pour pré-remplir un champ de
 * saisie modifiable, sans zéro inutile ni séparateur de milliers — contrairement
 * à formatQuantity, réservé à l'affichage en lecture seule.
 */
export function numericFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num.toString() : '';
}

/**
 * Ne garde que les chiffres d'une saisie clavier : les quantités et seuils de
 * stock sont toujours des nombres entiers dans StockMaster (pas de fraction
 * d'unité), donc le séparateur décimal est retiré dès la frappe plutôt que
 * rejeté après coup.
 */
export function digitsOnly(value: string): string {
  return value.replace(/[^0-9]/g, '');
}
