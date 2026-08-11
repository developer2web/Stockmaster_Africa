import { describe,expect,it } from 'vitest';
import { userErrorMessage } from '../src/utils/errors';
describe('messages utilisateur',()=>{
  it('masque les erreurs réseau techniques',()=>expect(userErrorMessage(new Error('TypeError: Failed to fetch'))).toContain('Connexion internet'));
  it('traduit le stock insuffisant',()=>expect(userErrorMessage(new Error('Stock insuffisant : quantité disponible 2'))).toBe('Stock insuffisant pour terminer cette opération.'));
  it('traduit les refus RLS',()=>expect(userErrorMessage(new Error('new row violates row-level security policy'))).toContain('autorisation'));
  it('lit les erreurs structurées de Supabase',()=>expect(userErrorMessage({ message: 'relation customer_balances does not exist' })).toContain('customer_balances'));
});
