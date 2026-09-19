import { userErrorMessage } from '@/utils/errors';

/** Doublon de code-barres ou de référence : l'erreur désigne le champ à corriger. */
export class ProductFieldError extends Error {
  // fieldMessage à part de message : le gestionnaire global d'erreurs réécrit `message` sur place
  // (sanitizeErrorInPlace) et transformerait ce texte précis en « Cette information est déjà utilisée ».
  readonly fieldMessage: string;
  constructor(message: string, readonly field: 'barcode' | 'sku') { super(message); this.name = 'ProductFieldError'; this.fieldMessage = message; }
}
// Le message technique de la base (contrainte d'unicité) dit quelle colonne est en cause.
export function saveError(error: { message: string; details?: string | null; code?: string }): Error {
  const raw = `${error.message} ${error.details ?? ''}`;
  if (error.code === '23505' || /duplicate|unique|already exists/i.test(raw)) {
    if (/barcode|code.?barre/i.test(raw)) return new ProductFieldError('Ce code-barres est déjà utilisé par un autre produit de cette boutique.', 'barcode');
    if (/(?:^|[^a-z0-9])sku(?:[^a-z0-9]|$)|r[ée]f[ée]rence/i.test(raw)) return new ProductFieldError('Cette référence est déjà utilisée par un autre produit de cette boutique.', 'sku');
  }
  return new Error(userErrorMessage(error));
}
