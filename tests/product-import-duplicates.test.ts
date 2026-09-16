// api.ts (importé par excel.ts pour saveProduct) passe par offline/storage.ts,
// qui importe AsyncStorage et encryptedStorage — sans ces deux mocks (même
// recette que stock-cost-privacy.test.ts), la résolution retombe sur le vrai
// module react-native (syntaxe Flow, imparsable par Vitest).
vi.mock('@/services/storage/encryptedStorage', async () => {
  const { default: storage } = await import('@react-native-async-storage/async-storage');
  return { decryptStoredValue: async (_key: string, raw: string) => raw, isEncryptedValue: () => true, writeEncryptedStorage: (key: string, value: string) => storage.setItem(key, value) };
});
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { getDocumentAsync, xlsxRead, sheetToJson, from, values } = vi.hoisted(() => ({
  getDocumentAsync: vi.fn(),
  xlsxRead: vi.fn(() => ({ SheetNames: ['Feuille1'], Sheets: { Feuille1: {} } })),
  sheetToJson: vi.fn(),
  from: vi.fn(),
  values: new Map<string, string>(),
}));
vi.mock('expo-document-picker', () => ({ getDocumentAsync }));
vi.mock('expo-file-system', () => ({ File: class { async bytes() { return new Uint8Array(); } } }));
vi.mock('@e965/xlsx', () => ({ read: xlsxRead, utils: { sheet_to_json: sheetToJson } }));
vi.mock('@/services/supabase/client', () => ({ supabase: { from } }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async (key: string) => values.get(key) ?? null,
  setItem: async (key: string, value: string) => { values.set(key, value); },
  removeItem: async (key: string) => { values.delete(key); },
} }));
vi.mock('@/utils/operationId', () => ({ createOperationId: () => 'operation' }));
import { selectProductWorkbook } from '@/features/products/excel';

beforeEach(() => {
  vi.clearAllMocks();
  getDocumentAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://products.xlsx', size: 1000 }] });
  from.mockImplementation(() => ({
    select: () => ({ eq: () => ({ eq: () => ({ eq: () => Promise.resolve({ data: [{ name: 'Coca Cola' }], error: null }) }) }) }),
  }));
});

// L'import ne met jamais à jour un produit existant : il en crée un nouveau à
// chaque ligne valide. Réimporter deux fois le même fichier (un tarif corrigé,
// par exemple) recréait donc silencieusement chaque produit en double —
// insensible à la casse, comme le signal déjà en place sur la création
// manuelle d'un produit (findSimilarProduct).
describe('détection des doublons à l’import Excel (contre le catalogue existant)', () => {
  it('rejette une ligne dont le nom existe déjà dans la boutique, même avec une casse différente', async () => {
    sheetToJson.mockReturnValue([{ Nom: 'coca cola', Unite: 'piece', Prix_achat: 100, Prix_vente: 150, Stock_initial: 10, Seuil_stock_faible: 2 }]);
    const rows = await selectProductWorkbook('company', 'store');
    expect(rows).toHaveLength(1);
    expect(rows![0].valid).toBe(false);
    expect(rows![0].error).toBe('Produit déjà existant dans la boutique');
  });

  it('laisse passer un nom réellement nouveau', async () => {
    sheetToJson.mockReturnValue([{ Nom: 'Fanta Orange', Unite: 'piece', Prix_achat: 100, Prix_vente: 150, Stock_initial: 10, Seuil_stock_faible: 2 }]);
    const rows = await selectProductWorkbook('company', 'store');
    expect(rows![0].valid).toBe(true);
    expect(rows![0].error).toBeUndefined();
  });

  it('garde le message spécifique au doublon interne au fichier plutôt que le doublon catalogue', async () => {
    sheetToJson.mockReturnValue([
      { Nom: 'Fanta Orange', Unite: 'piece', Prix_achat: 100, Prix_vente: 150, Stock_initial: 10, Seuil_stock_faible: 2 },
      { Nom: 'fanta orange', Unite: 'piece', Prix_achat: 100, Prix_vente: 150, Stock_initial: 10, Seuil_stock_faible: 2 },
    ]);
    const rows = await selectProductWorkbook('company', 'store');
    expect(rows![0].valid).toBe(true);
    expect(rows![1].error).toBe('Produit dupliqué dans le fichier');
  });
});
