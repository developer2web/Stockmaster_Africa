import { describe,expect,it } from 'vitest';
import { userErrorMessage } from '../src/utils/errors';
describe('messages utilisateur',()=>{
  it('masque les erreurs réseau techniques',()=>expect(userErrorMessage(new Error('TypeError: Failed to fetch'))).toContain('Connexion internet'));
  it('traduit le stock insuffisant avec la quantité disponible',()=>expect(userErrorMessage(new Error('Stock insuffisant : quantité disponible 2'))).toBe('Quantité insuffisante : 2 disponible(s).'));
  it('traduit les refus RLS',()=>expect(userErrorMessage(new Error('new row violates row-level security policy'))).toContain('autorisation'));
  it('masque les erreurs structurées de Supabase',()=>expect(userErrorMessage({ message: 'relation customer_balances does not exist' })).toBe('Le serveur est momentanément indisponible. Réessayez.'));
  it('traduit une erreur native d’impression',()=>expect(userErrorMessage(new Error('Printing did not complete'))).toContain('Impossible d’imprimer'));
  it('masque les erreurs JavaScript brutes',()=>expect(userErrorMessage(new Error('Uncaught (in promise) Error: Invalid key'))).toBe('Le serveur est momentanément indisponible. Réessayez.'));
  it('masque une erreur technique anglaise non répertoriée',()=>expect(userErrorMessage(new Error('Could not initialize native module'))).toBe('Le serveur est momentanément indisponible. Réessayez.'));
});
