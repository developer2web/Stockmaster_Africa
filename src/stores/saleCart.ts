import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { SaleStockItem } from '@/types/database';
import { addCartItem, cartKey as makeCartKey } from './saleCartLogic';

export interface CartItem extends SaleStockItem {
  quantity: number;
  discount: number;
}

type CartState = {
  items: CartItem[];
  add: (item: SaleStockItem, allowNegativeStock?: boolean) => void;
  setQuantity: (key: string, quantity: number, allowNegativeStock?: boolean) => void;
  setDiscount: (key: string, discount: number) => void;
  remove: (key: string) => void;
  clear: () => void;
};

const key = makeCartKey;

const protectedStorage = {
  getItem: (name:string) => Platform.OS==='web'?AsyncStorage.getItem(name):SecureStore.getItemAsync(name),
  setItem: (name:string,value:string) => Platform.OS==='web'?AsyncStorage.setItem(name,value):SecureStore.setItemAsync(name,value),
  removeItem: (name:string) => Platform.OS==='web'?AsyncStorage.removeItem(name):SecureStore.deleteItemAsync(name),
};

export const useSaleCart = create<CartState>()(persist((set) => ({
  items: [],
  add: (item,allowNegativeStock=false) => set((state) => ({ items: addCartItem(state.items,item,allowNegativeStock) })),
  setQuantity: (id, quantity, allowNegativeStock=false) => set((state) => ({
    items: state.items
      .map((item) => key(item) === id
        ? { ...item, quantity: Math.max(0,allowNegativeStock?quantity:Math.min(quantity,item.available)), discount: Math.min(item.discount,item.salePrice*Math.max(0,allowNegativeStock?quantity:Math.min(quantity,item.available))) }
        : item)
      .filter((item) => item.quantity > 0),
  })),
  setDiscount: (id,discount)=>set(state=>({items:state.items.map(item=>key(item)===id?{...item,discount:Math.max(0,Math.min(discount,item.salePrice*item.quantity))}:item)})),
  remove: (id) => set((state) => ({ items: state.items.filter((item) => key(item) !== id) })),
  clear: () => set({ items: [] }),
}),{name:'stockmaster:protected-sale-cart:v1',storage:createJSONStorage(()=>protectedStorage),partialize:(state)=>({items:state.items})}));

export const cartKey = key;
