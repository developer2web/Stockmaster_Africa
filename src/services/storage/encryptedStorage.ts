import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { xchacha20poly1305 } from '@noble/ciphers/chacha';
import { bytesToHex, hexToBytes, utf8ToBytes, bytesToUtf8 } from '@noble/ciphers/utils';

const KEY_ID = 'stockmaster.offline.encryption.v1';
const PREFIX = 'stockmaster-encrypted-v1:';
let nativeKeyPromise: Promise<Uint8Array> | null = null;
let webKeyPromise: Promise<CryptoKey> | null = null;

async function nativeKey(create: boolean): Promise<Uint8Array> {
  if (nativeKeyPromise) return nativeKeyPromise;
  nativeKeyPromise = (async () => {
    const stored = await SecureStore.getItemAsync(KEY_ID);
    if (stored) return hexToBytes(stored);
    if (!create) throw new Error('Clé de stockage absente. Les données ont été conservées.');
    const key = await Crypto.getRandomBytesAsync(32);
    await SecureStore.setItemAsync(KEY_ID, bytesToHex(key), { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    return key;
  })();
  try { return await nativeKeyPromise; } catch (error) { nativeKeyPromise = null; throw error; }
}

async function webKey(create: boolean): Promise<CryptoKey> {
  if (webKeyPromise) return webKeyPromise;
  webKeyPromise = (async () => {
    if (!globalThis.crypto?.subtle || typeof indexedDB === 'undefined') throw new Error('Le stockage sécurisé nécessite HTTPS et le stockage du navigateur.');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('stockmaster-secure-storage', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const existing = await new Promise<CryptoKey | undefined>((resolve, reject) => {
        const request = db.transaction('keys').objectStore('keys').get(KEY_ID);
        request.onsuccess = () => resolve(request.result as CryptoKey | undefined);
        request.onerror = () => reject(request.error);
      });
      if (existing) return existing;
      if (!create) throw new Error('Clé de stockage absente. Les données ont été conservées.');
      const candidate = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
      // Re-read in a write transaction so two tabs cannot replace each other's key.
      return await new Promise<CryptoKey>((resolve, reject) => {
        const transaction = db.transaction('keys', 'readwrite');
        const objectStore = transaction.objectStore('keys');
        const get = objectStore.get(KEY_ID);
        let selected = candidate;
        get.onsuccess = () => { if (get.result) selected = get.result as CryptoKey; else objectStore.put(candidate, KEY_ID); };
        transaction.oncomplete = () => resolve(selected);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally { db.close(); }
  })();
  try { return await webKeyPromise; } catch (error) { webKeyPromise = null; throw error; }
}

export function isEncryptedValue(raw: string) { return raw.startsWith(PREFIX); }
export async function encryptStoredValue(storageKey: string, value: string): Promise<string> {
  const web = Platform.OS === 'web';
  const nonce = await Crypto.getRandomBytesAsync(web ? 12 : 24);
  const plaintext = utf8ToBytes(value);
  const associated = utf8ToBytes(storageKey);
  const encrypted = web
    ? new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: associated as BufferSource }, await webKey(true), plaintext as BufferSource))
    : xchacha20poly1305(await nativeKey(true), nonce, associated).encrypt(plaintext);
  return PREFIX + JSON.stringify({ algorithm: web ? 'AES-GCM' : 'XChaCha20-Poly1305', nonce: bytesToHex(nonce), data: bytesToHex(encrypted) });
}
export async function decryptStoredValue(storageKey: string, raw: string): Promise<string> {
  // Callers validate legacy JSON before replacing it with encrypted storage.
  if (!isEncryptedValue(raw)) return raw;
  const value = JSON.parse(raw.slice(PREFIX.length)) as { algorithm: string; nonce: string; data: string };
  const nonce = hexToBytes(value.nonce);
  const ciphertext = hexToBytes(value.data);
  const associated = utf8ToBytes(storageKey);
  if (Platform.OS === 'web' && value.algorithm === 'AES-GCM') {
    return bytesToUtf8(new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce as BufferSource, additionalData: associated as BufferSource }, await webKey(false), ciphertext as BufferSource)));
  }
  if (Platform.OS !== 'web' && value.algorithm === 'XChaCha20-Poly1305') {
    return bytesToUtf8(xchacha20poly1305(await nativeKey(false), nonce, associated).decrypt(ciphertext));
  }
  throw new Error('Format de stockage sécurisé incompatible. Les données ont été conservées.');
}
export async function readEncryptedStorage(key: string) {
  const raw = await AsyncStorage.getItem(key);
  return raw === null ? null : decryptStoredValue(key, raw);
}
export async function writeEncryptedStorage(key: string, value: string) {
  await AsyncStorage.setItem(key, await encryptStoredValue(key, value));
}
