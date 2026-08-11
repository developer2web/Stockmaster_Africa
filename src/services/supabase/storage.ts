import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const sessionStorage = {
  getItem: (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    return typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (Platform.OS !== 'web') return SecureStore.setItemAsync(key, value);
    return typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (Platform.OS !== 'web') return SecureStore.deleteItemAsync(key);
    return typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key);
  },
};
