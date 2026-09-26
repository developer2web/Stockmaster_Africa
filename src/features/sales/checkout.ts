// Retour testeur du 26/09 (critique) : remise maximale autorisée sur une ligne, même règle
// que le serveur (create_sale + guard_sale_item_discount). Sans la permission « Dépasser la
// limite normale de remise » : au plus la limite de l'entreprise (max_discount_percent), et
// toujours strictement inférieure au prix de la ligne (au moins 1 franc payé). Avec la
// permission : jusqu'au prix de la ligne. Arrondi au franc inférieur (GNF sans centimes).
export function maxLineDiscount(lineTotal: number, limitPercent: number, canOverride: boolean) {
  const total = Math.max(0, Math.floor(Number(lineTotal) || 0));
  if (canOverride) return total;
  const limit = Math.min(100, Math.max(0, Number.isFinite(limitPercent) ? limitPercent : 100));
  return Math.max(0, Math.min(Math.floor(total * limit / 100), total - 1));
}

export function checkoutIssue(input: {
  invalidQuantity?: boolean; itemCount: number; storeId: string; pending: boolean; settingsReady: boolean;
  discountTooHigh: boolean; zeroTotal?: boolean; payment: string; customerId: string | null;
  amountPaid: number; total: number; creditAllowed: boolean;
}): string | null {
  if (input.pending) return 'Enregistrement en cours. Patientez avant de recommencer.';
  if (!input.storeId) return 'Sélectionnez une boutique avant de vendre.';
  if (!input.itemCount) return 'Ajoutez au moins un article au panier.';
  if (input.invalidQuantity) return 'Corrigez la quantité : elle doit être supérieure à zéro et respecter le stock disponible.';
  if (!input.settingsReady) return 'Les règles de vente ne sont pas disponibles. Réessayez leur chargement.';
  if (input.discountTooHigh) return 'Une remise dépasse le maximum autorisé (indiqué sous chaque ligne). Réduisez-la ou demandez à un responsable de valider la vente.';
  if (input.zeroTotal) return 'Une vente à 0 ne peut pas être validée sans l’autorisation d’un responsable. Réduisez la remise ou demandez-lui de valider la vente.';
  const credit = input.payment === 'credit' || input.payment === 'partial';
  if (credit && !input.creditAllowed) return 'La vente à crédit est désactivée pour cette entreprise.';
  if (credit && !input.customerId) return 'Choisissez un client pour enregistrer ce crédit.';
  if (input.payment === 'partial' && (!Number.isFinite(input.amountPaid) || input.amountPaid <= 0 || input.amountPaid >= input.total)) {
    return 'L’acompte doit être supérieur à zéro et inférieur au total. Pour un paiement complet, choisissez Espèces ou Mobile Money.';
  }
  return null;
}

export function matchesCustomer(customer: { name: string; phone: string | null }, search: string) {
  const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
  const term = normalize(search);
  if (!term || normalize(customer.name).includes(term)) return true;
  const digits = term.replace(/\D/g, '');
  return digits.length > 0 && /^[+\d\s().-]+$/.test(term) && (customer.phone ?? '').replace(/\D/g, '').includes(digits);
}
