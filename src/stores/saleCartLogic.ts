import type { SaleStockItem } from '@/types/database';

export type SaleMode = 'unit' | 'bulk';

export interface CartLine extends SaleStockItem {
  quantity: number;
  discount: number;
  saleMode: SaleMode;
}

// Le panier peut contenir deux lignes distinctes pour le même produit — une
// au détail, une en gros — donc la clé inclut le mode. baseKey (sans le
// mode) sert à additionner les deux lignes pour ne jamais dépasser le
// stock réel disponible (une seule unité de stock derrière les deux prix).
export const cartKey = (item: { productId: string; variantId: string | null; saleMode?: SaleMode }) =>
  `${item.productId}:${item.variantId ?? 'simple'}:${item.saleMode ?? 'unit'}`;
const baseKey = (item: { productId: string; variantId: string | null }) =>
  `${item.productId}:${item.variantId ?? 'simple'}`;

// Les deux modes (gros/détail) d'un même produit puisent dans le même
// stock : avant de permettre plus dans l'un, il faut savoir combien
// l'autre a déjà réservé.
export function reservedElsewhere(items: CartLine[], item: { productId: string; variantId: string | null }, excludingMode: SaleMode): number {
  return items
    .filter((row) => baseKey(row) === baseKey(item) && row.saleMode !== excludingMode)
    .reduce((sum, row) => sum + row.quantity, 0);
}

export function addCartItem(items: CartLine[], item: SaleStockItem, allowNegativeStock = false, mode: SaleMode = 'unit'): CartLine[] {
  const id = cartKey({ ...item, saleMode: mode });
  // Un lot ajoute bulkQuantity unités de base à chaque fois (ex: +24 pour 1
  // carton), jamais 1 par 1 — c'est justement ce qui évite le calcul manuel.
  const step = mode === 'bulk' ? Number(item.bulkQuantity ?? 1) : 1;
  const existing = items.find((row) => cartKey(row) === id);
  const currentQuantity = existing?.quantity ?? 0;
  const roomLeft = item.available - reservedElsewhere(items, item, mode) - currentQuantity;
  // Un lot incomplet n'a pas de sens (on ne casse pas un carton depuis ce
  // bouton) : si un lot entier ne tient plus, on refuse plutôt que d'en
  // ajouter une fraction — au détail, un seul manque simplement le coup.
  if (!allowNegativeStock && step > roomLeft) return items;

  if (!existing) {
    // Prix ramené à l'unité de base : le reste du code (sous-totaux,
    // bénéfice...) continue de faire quantité × prix sans rien savoir du
    // mode gros/détail.
    const salePrice = mode === 'bulk' ? Number(item.bulkPrice ?? 0) / step : item.salePrice;
    return [...items, { ...item, saleMode: mode, quantity: step, discount: 0, salePrice }];
  }
  return items.map((row) => cartKey(row) === id ? { ...row, quantity: row.quantity + step } : row);
}

/**
 * Garde uniquement les lignes dont le produit (et la variante) figure dans la liste de la boutique
 * active. Chaque produit appartient à une seule boutique : une ligne absente de cette liste vient
 * d'une autre boutique, ou d'un produit archivé, et ne doit jamais pouvoir être validée.
 * Renvoie aussi les lignes retirées.
 */
export function retainProducts(items: CartLine[], validProducts: ReadonlySet<string>): { kept: CartLine[]; removed: CartLine[] } {
  const kept: CartLine[] = [];
  const removed: CartLine[] = [];
  for (const item of items) (validProducts.has(baseKey(item)) ? kept : removed).push(item);
  return { kept, removed };
}

/** Clé « produit:variante » utilisée par retainProducts. */
export const productKey = baseKey;
