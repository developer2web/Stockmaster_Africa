import type { SaleStockItem } from '@/types/database';

export interface CartLine extends SaleStockItem {
  quantity: number;
  discount: number;
}

export const cartKey = (item: { productId: string; variantId: string | null }) =>
  `${item.productId}:${item.variantId ?? 'simple'}`;

export function addCartItem(items: CartLine[], item: SaleStockItem, allowNegativeStock = false): CartLine[] {
  const id = cartKey(item);
  const existing = items.find((row) => cartKey(row) === id);
  if (!existing) return [...items, { ...item, quantity: 1, discount: 0 }];
  return items.map((row) => cartKey(row) === id
    ? { ...row, quantity: allowNegativeStock ? row.quantity + 1 : Math.min(row.quantity + 1, row.available) }
    : row);
}
