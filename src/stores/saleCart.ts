import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SaleStockItem } from '@/types/database';
import { addCartItem, cartKey as makeCartKey, reservedElsewhere, type CartLine, type SaleMode } from './saleCartLogic';

export type CartItem = CartLine;

// Un panier oublié (personne n'y touche depuis 5 minutes) se vide tout
// seul — sécurité des données : évite qu'une vente commencée puis
// abandonnée traîne indéfiniment (prix/stock plus à jour, ou quelqu'un
// d'autre qui reprend l'appareil et valide par erreur un panier qui
// n'est pas le sien).
export const CART_IDLE_LIMIT_MS = 5 * 60 * 1000;
const CART_IDLE_CHECK_INTERVAL_MS = 30 * 1000;

type CartState = {
  items: CartItem[];
  lastModifiedAt: number;
  autoClearedAt: number | null;
  add: (item: SaleStockItem, allowNegativeStock?: boolean, mode?: SaleMode) => void;
  setQuantity: (key: string, quantity: number, allowNegativeStock?: boolean) => void;
  setDiscount: (key: string, discount: number) => void;
  remove: (key: string) => void;
  clear: () => void;
  acknowledgeAutoClear: () => void;
  clearIfIdle: (idleLimitMs?: number) => void;
};

const key = makeCartKey;

const protectedStorage = {
  getItem: (name:string) => Platform.OS==='web'?AsyncStorage.getItem(name):SecureStore.getItemAsync(name),
  setItem: (name:string,value:string) => Platform.OS==='web'?AsyncStorage.setItem(name,value):SecureStore.setItemAsync(name,value),
  removeItem: (name:string) => Platform.OS==='web'?AsyncStorage.removeItem(name):SecureStore.deleteItemAsync(name),
};

export const useSaleCart = create<CartState>()(persist((set,get) => ({
  items: [],
  lastModifiedAt: Date.now(),
  autoClearedAt: null,
  add: (item,allowNegativeStock=false,mode='unit') => set((state) => ({ items: addCartItem(state.items,item,allowNegativeStock,mode), lastModifiedAt: Date.now() })),
  setQuantity: (id, quantity, allowNegativeStock=false) => set((state) => ({
    items: state.items
      .map((item) => {
        if (key(item) !== id) return item;
        const cap = allowNegativeStock ? Infinity : item.available - reservedElsewhere(state.items, item, item.saleMode);
        const bounded = Math.max(0, Math.min(quantity, cap));
        return { ...item, quantity: bounded, discount: Math.min(item.discount, item.salePrice * bounded) };
      })
      .filter((item) => item.quantity > 0),
    lastModifiedAt: Date.now(),
  })),
  setDiscount: (id,discount)=>set(state=>({items:state.items.map(item=>key(item)===id?{...item,discount:Math.max(0,Math.min(discount,item.salePrice*item.quantity))}:item),lastModifiedAt:Date.now()})),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => key(item) !== id), lastModifiedAt: Date.now() })),
  clear: () => set({ items: [], lastModifiedAt: Date.now() }),
  acknowledgeAutoClear: () => set({ autoClearedAt: null }),
  clearIfIdle: (idleLimitMs = CART_IDLE_LIMIT_MS) => {
    const state = get();
    if (state.items.length > 0 && Date.now() - state.lastModifiedAt > idleLimitMs) {
      set({ items: [], autoClearedAt: Date.now() });
    }
  },
}),{name:'stockmaster:protected-sale-cart:v1',storage:createJSONStorage(()=>protectedStorage),partialize:(state)=>({items:state.items,lastModifiedAt:state.lastModifiedAt})}));

// Vérification périodique tant que l'app tourne au premier plan (les
// timers JS sont de toute façon suspendus en arrière-plan sur mobile) :
// au retour au premier plan après une longue absence, la première
// vérification suivante vide le panier s'il a effectivement dépassé les
// 5 minutes d'inactivité, y compris à travers un redémarrage complet de
// l'app (lastModifiedAt fait partie de ce qui est persisté).
if (typeof setInterval !== 'undefined' && process.env.NODE_ENV !== 'test') {
  setInterval(() => useSaleCart.getState().clearIfIdle(), CART_IDLE_CHECK_INTERVAL_MS);
}

export const cartKey = key;
