import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ secrets: new Map<string, string>(), values: new Map<string, string>() }));
vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }));
vi.mock('expo-crypto', async () => {
  const { randomBytes } = await import('node:crypto');
  return { getRandomBytesAsync: async (count: number) => new Uint8Array(randomBytes(count)) };
});
vi.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
  getItemAsync: async (key: string) => state.secrets.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { state.secrets.set(key, value); },
}));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => state.values.get(key) ?? null,
  setItem: async (key: string, value: string) => { state.values.set(key, value); },
} }));
beforeEach(() => { vi.resetModules(); state.secrets.clear(); state.values.clear(); });
describe('encrypted offline business data', () => {
  it('keeps plaintext and its encryption key out of AsyncStorage and survives reload', async () => {
    const storage = await import('@/services/storage/encryptedStorage');
    const value = JSON.stringify({ customer: 'Client privé', amount: 22000 });
    await storage.writeEncryptedStorage('sales', value);
    const raw = state.values.get('sales')!;
    expect(raw).not.toContain('Client privé');
    expect(raw).not.toContain('22000');
    expect(raw).not.toContain([...state.secrets.values()][0]);
    vi.resetModules();
    const reloaded = await import('@/services/storage/encryptedStorage');
    expect(await reloaded.readEncryptedStorage('sales')).toBe(value);
  });
  it('uses a fresh nonce per write and rejects tampering and swapped storage keys', async () => {
    const storage = await import('@/services/storage/encryptedStorage');
    const first = await storage.encryptStoredValue('sales', 'confidential');
    const second = await storage.encryptStoredValue('sales', 'confidential');
    expect(first).not.toBe(second);
    await expect(storage.decryptStoredValue('another-user', first)).rejects.toThrow();
    const tampered = first.replace(/"data":"([a-f0-9])/, (_, digit: string) => `"data":"${digit === '0' ? '1' : '0'}`);
    await expect(storage.decryptStoredValue('sales', tampered)).rejects.toThrow();
  });
  it('never replaces a lost key or deletes pending ciphertext when decoding fails', async () => {
    const storage = await import('@/services/storage/encryptedStorage');
    await storage.writeEncryptedStorage('pending-sales', '[{"id":"sale-1"}]');
    const raw = state.values.get('pending-sales');
    state.secrets.clear(); vi.resetModules();
    const reloaded = await import('@/services/storage/encryptedStorage');
    await expect(reloaded.readEncryptedStorage('pending-sales')).rejects.toThrow('Clé de stockage absente');
    expect(state.values.get('pending-sales')).toBe(raw);
    expect(state.secrets.size).toBe(0);
  });
  it('returns legacy plaintext for validation before its encrypted migration', async () => {
    const storage = await import('@/services/storage/encryptedStorage');
    state.values.set('legacy', '[{"id":"pending"}]');
    expect(await storage.readEncryptedStorage('legacy')).toBe('[{"id":"pending"}]');
    expect(state.secrets.size).toBe(0);
  });
});
