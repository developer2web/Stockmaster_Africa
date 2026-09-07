export function checkoutIssue(input: {
  invalidQuantity?: boolean; itemCount: number; storeId: string; pending: boolean; settingsReady: boolean;
  discountTooHigh: boolean; payment: string; customerId: string | null;
  amountPaid: number; total: number; creditAllowed: boolean;
}): string | null {
  if (input.pending) return 'Enregistrement en cours. Patientez avant de recommencer.';
  if (!input.storeId) return 'Sélectionnez une boutique avant de vendre.';
  if (!input.itemCount) return 'Ajoutez au moins un article au panier.';
  if (input.invalidQuantity) return 'Corrigez la quantité : elle doit être supérieure à zéro et respecter le stock disponible.';
  if (!input.settingsReady) return 'Les règles de vente ne sont pas disponibles. Réessayez leur chargement.';
  if (input.discountTooHigh) return 'Une remise dépasse la limite autorisée. Modifiez-la dans le panier.';
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
