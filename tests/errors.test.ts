import { describe,expect,it } from 'vitest';
import { errorKind, userErrorMessage } from '../src/utils/errors';
describe('messages utilisateur',()=>{
  it('ne confond pas une fonction access manquante avec un refus de droits', () => {
    const error = { code: 'PGRST202', message: 'Could not find the function public.get_account_access_status in the schema cache' };
    expect(errorKind(error)).toBe('configuration');
    expect(userErrorMessage(error)).not.toContain('autorisation');
    expect(userErrorMessage(error)).toContain('configuration');
  });
  it('ne confond pas une table session manquante avec une session expirée', () => {
    expect(errorKind({ code: '42P01', message: 'relation cash_sessions does not exist' })).toBe('configuration');
  });
  it('reconnaît les codes serveur même sans message anglais', () => {
    expect(errorKind({ code: '42501', message: 'Droits insuffisants' })).toBe('permission');
    expect(errorKind({ status: 401, message: '' })).toBe('session');
    expect(errorKind({ status: 503, message: '' })).toBe('server');
  });
  it('ne traduit pas tout mot access ou session en refus', () => {
    expect(errorKind(new Error('Could not load accessible businesses'))).toBe('unknown');
    expect(errorKind(new Error('Could not initialize session storage'))).toBe('unknown');
  });
  it('masque les erreurs réseau techniques',()=>expect(userErrorMessage(new Error('TypeError: Failed to fetch'))).toContain('Connexion internet'));
  it('traduit le stock insuffisant avec la quantité disponible',()=>expect(userErrorMessage(new Error('Stock insuffisant : quantité disponible 2'))).toBe('Quantité insuffisante : 2 disponible(s).'));
  it('traduit les refus RLS',()=>expect(userErrorMessage(new Error('new row violates row-level security policy'))).toContain('autorisation'));
  it('masque les erreurs structurées de Supabase',()=>expect(userErrorMessage({ message: 'relation customer_balances does not exist' })).toContain('configuration de la base'));
  it('traduit une erreur native d’impression',()=>expect(userErrorMessage(new Error('Printing did not complete'))).toContain('Impossible d’imprimer'));
  it('masque les erreurs JavaScript brutes',()=>expect(userErrorMessage(new Error('Uncaught (in promise) Error: Invalid key'))).toBe('Le serveur est momentanément indisponible. Réessayez.'));
  it('masque une erreur technique anglaise non répertoriée',()=>expect(userErrorMessage(new Error('Could not initialize native module'))).toBe('Le serveur est momentanément indisponible. Réessayez.'));
});
