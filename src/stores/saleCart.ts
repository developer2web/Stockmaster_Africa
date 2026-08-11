import { create } from 'zustand';
import type { SaleStockItem } from '@/types/database';

export interface CartItem extends SaleStockItem {
  quantity: number;
  discount: number;
}

type CartState = {
  items: CartItem[];
  add: (item: SaleStockItem) => void;
  setQuantity: (key: string, quantity: number) => void;
  setDiscount: (key: string, discount: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const key = (item: { productId: string; variantId: string | null }) =>
  `${item.productId}:${item.variantId ?? 'simple'}`;

export const useSaleCart = create<CartState>((set) => ({
  items: [],
  add: (item) => set((state) => {
    const id = key(item);
    const existing = state.items.find((row) => key(row) === id);
    return {
      items: existing
        ? state.items.map((row) => key(row) === id
          ? { ...row, quantity: Math.min(row.quantity + 1, row.available) }
          : row)
        : [...state.items, { ...item, quantity: 1, discount: 0 }],
    };
  }),
  setQuantity: (id, quantity) => set((state) => ({
    items: state.items
      .map((item) => key(item) === id
        ? { ...item, quantity: Math.max(0, Math.min(quantity, item.available)), discount: Math.min(item.discount,item.salePrice*Math.max(0,Math.min(quantity,item.available))) }
        : item)
      .filter((item) => item.quantity > 0),
  })),
  setDiscount: (id,discount)=>set(state=>({items:state.items.map(item=>key(item)===id?{...item,discount:Math.max(0,Math.min(discount,item.salePrice*item.quantity))}:item)})),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => key(item) !== id) })),
  clear: () => set({ items: [] }),
}));

export const cartKey = key;
