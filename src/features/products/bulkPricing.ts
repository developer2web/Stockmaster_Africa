import { parseWholeNumber } from '@/utils/number';

// Règles de calcul entre prix du lot et prix à l'unité, isolées de l'écran
// pour être testées sans le rendre.

/** Prix à l'unité = prix du lot ÷ quantité par lot, arrondi. null si une saisie est vide ou invalide. */
export function unitPriceFromLot(lotPrice: unknown, quantity: unknown): string | null {
  const lot = parseWholeNumber(lotPrice);
  const qty = parseWholeNumber(quantity);
  if (lot === null || qty === null || lot <= 0 || qty <= 0) return null;
  return String(Math.round(lot / qty));
}

/** Prix du lot = prix à l'unité × quantité par lot. null si une saisie est vide ou invalide. */
export function lotPriceFromUnit(unitPrice: unknown, quantity: unknown): string | null {
  const unit = parseWholeNumber(unitPrice);
  const qty = parseWholeNumber(quantity);
  if (unit === null || qty === null || qty <= 0) return null;
  return String(unit * qty);
}

/**
 * Un champ calculé peut être écrasé tant que la personne ne l'a pas saisi elle-même :
 * il est vide, ou contient encore exactement la dernière valeur calculée. Se fonde sur
 * la valeur et non sur l'état « modifié » du formulaire, pour que le champ suive la
 * quantité même après un passage par le champ (focus, retour arrière, etc.).
 */
export function canAutofill(current: unknown, lastAutoValue: string | null): boolean {
  const value = String(current ?? '').trim();
  return value === '' || value === lastAutoValue;
}

export type LotMargin = { kind: 'loss' | 'none' | 'profit'; amount: number };

/** Marge sur le lot : vente du lot moins son coût d'achat. null si l'un des deux manque. */
export function lotMargin(lotSalePrice: unknown, lotPurchasePrice: unknown): LotMargin | null {
  const sale = parseWholeNumber(lotSalePrice);
  const cost = parseWholeNumber(lotPurchasePrice);
  if (sale === null || cost === null) return null;
  const amount = sale - cost;
  return { kind: amount < 0 ? 'loss' : amount === 0 ? 'none' : 'profit', amount };
}
