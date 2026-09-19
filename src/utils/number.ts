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

/**
 * Affiche une quantité sans zéros décimaux inutiles, avec au plus 3 décimales.
 * fr-CA plutôt que fr-FR : même séparateur de milliers (espace insécable),
 * mais toujours visible dans cette pile technique — fr-FR utilise une espace
 * fine insécable qui peut ne pas s'afficher selon la police/le rendu.
 */
export function formatQuantity(value: unknown): string {
  const quantity = Number(value ?? 0);
  if (!Number.isFinite(quantity)) return '0';
  return new Intl.NumberFormat('fr-CA', {
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
 * Vérifie qu'une saisie est un entier positif ou nul écrit en chiffres (les
 * espaces séparateurs de milliers sont tolérés). Renvoie le message d'erreur
 * à afficher, ou null si la saisie est valide.
 *
 * Ne transforme jamais la valeur : "-100",
 * "20,75" ou "1e3" sont refusés avec une explication au lieu de devenir
 * silencieusement "100", "20" ou "13".
 */
export function wholeNumberError(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.replace(/\s/g, '') : '';
  if (value === '') return 'Valeur requise';
  if (value.startsWith('-')) return 'La valeur ne peut pas être négative.';
  if (/^\d+[.,]\d*$/.test(value)) return 'Saisissez un nombre entier, sans décimale.';
  if (!/^\d+$/.test(value)) return 'Saisissez uniquement des chiffres (nombre entier).';
  if (value.length > 12) return 'Nombre trop grand (12 chiffres maximum).';
  return null;
}

/** Entier positif ou nul saisi en chiffres, ou null si la saisie est vide/invalide. */
export function parseWholeNumber(raw: unknown): number | null {
  return wholeNumberError(raw) === null ? Number(String(raw).replace(/\s/g, '')) : null;
}

/** Comme parseWholeNumber, mais NaN (et non null) quand la saisie est vide ou invalide : s'intègre aux contrôles existants (`> 0`, `Number.isFinite`). */
export function wholeOrNaN(raw: unknown): number {
  return parseWholeNumber(raw) ?? NaN;
}
