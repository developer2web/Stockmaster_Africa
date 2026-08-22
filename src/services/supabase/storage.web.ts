import AsyncStorage from '@react-native-async-storage/async-storage';

export const sessionStorage = {
  getItem: (key: string) => typeof window === 'undefined' ? Promise.resolve(null) : AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.setItem(key, value),
  removeItem: (key: string) => typeof window === 'undefined' ? Promise.resolve() : AsyncStorage.removeItem(key),
};

