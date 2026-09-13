/** Le "s" du pluriel français régulier, seulement quand il y en a besoin (|count| > 1). */
export function plural(count: number) {
  return Math.abs(count) > 1 ? 's' : '';
}
