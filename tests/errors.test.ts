import { describe,expect,it } from 'vitest';
import { edgeFunctionErrorMessage, errorKind, isExpectedUserError, userErrorMessage } from '../src/utils/errors';
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
  it('traduit le stock insuffisant avec la quantité disponible, accord pluriel',()=>expect(userErrorMessage(new Error('Stock insuffisant : quantité disponible 2'))).toBe('Quantité insuffisante : 2 disponibles.'));
  it('traduit le stock insuffisant avec la quantité disponible, accord singulier',()=>expect(userErrorMessage(new Error('Stock insuffisant : quantité disponible 1'))).toBe('Quantité insuffisante : 1 disponible.'));
  // Audit externe (SM-19) : message Postgres brut — décimales et séparateur
  // anglais, devise absente. Les deux formulations vivantes en base
  // (record_customer_entry et sa v2) sont couvertes.
  it('reformate le montant qui dépasse la dette restante (devise, séparateur français, sans décimales GNF)',()=>{
    expect(userErrorMessage(new Error('Le paiement dépasse la dette restante (450000.00)'))).toBe(`Le montant dépasse la dette restante (${(450000).toLocaleString('fr-CA')} GNF).`);
    expect(userErrorMessage(new Error('Le montant dépasse la dette restante (12500)'))).toBe(`Le montant dépasse la dette restante (${(12500).toLocaleString('fr-CA')} GNF).`);
  });
  it('traduit les refus RLS',()=>expect(userErrorMessage(new Error('new row violates row-level security policy'))).toContain('autorisation'));
  it('masque les erreurs structurées de Supabase',()=>expect(userErrorMessage({ message: 'relation customer_balances does not exist' })).toContain('configuration de la base'));
  it('traduit une erreur native d’impression',()=>expect(userErrorMessage(new Error('Printing did not complete'))).toContain('Impossible d’imprimer'));
  it('masque les erreurs JavaScript brutes',()=>expect(userErrorMessage(new Error('Uncaught (in promise) Error: Invalid key'))).toBe('Le serveur est momentanément indisponible. Réessayez.'));
  it('masque une erreur technique anglaise non répertoriée',()=>expect(userErrorMessage(new Error('Could not initialize native module'))).toBe('Le serveur est momentanément indisponible. Réessayez.'));
  it('ne confond pas un abonnement expiré avec un refus de droits (retour testeur du 15/09 : un propriétaire lisait « pas l’autorisation »)', () => {
    const error = new Error('Accès refusé, boutique invalide ou abonnement inactif');
    expect(errorKind(error)).toBe('subscription');
    expect(userErrorMessage(error)).not.toContain('autorisation');
    expect(userErrorMessage(error)).toContain('abonnement');
  });
  it('reconnaît un refus de droits qui ne mentionne pas l’abonnement comme une vraie permission', () => {
    expect(errorKind(new Error('acces refuse'))).toBe('permission');
  });
});
describe('edgeFunctionErrorMessage',()=>{
  it('extrait le message précis du corps de la réponse',async()=>{
    const response=new Response(JSON.stringify({error:'Cet email existe déjà sur un autre compte.'}));
    expect(await edgeFunctionErrorMessage({message:'Edge Function returned a non-2xx status code',context:response})).toBe('Cet email existe déjà sur un autre compte.');
  });
  it('retombe sur le message générique si le corps n’est pas du JSON valide',async()=>{
    const response=new Response('<html>pas du json</html>');
    expect(await edgeFunctionErrorMessage({message:'Erreur générique',context:response})).toBe('Erreur générique');
  });
  it('retombe sur le message générique si context n’est pas une vraie Response',async()=>{
    expect(await edgeFunctionErrorMessage({message:'Erreur générique',context:{notAResponse:true}})).toBe('Erreur générique');
  });
  it('retombe sur le message générique sans context du tout',async()=>{
    expect(await edgeFunctionErrorMessage({message:'Erreur générique'})).toBe('Erreur générique');
  });
});
describe('journalisation des erreurs de mutation',()=>{
  it('ne journalise pas un doublon ou un stock insuffisant : ce sont des refus attendus, pas des incidents',()=>{
    expect(isExpectedUserError(new Error('duplicate key value violates unique constraint'))).toBe(true);
    expect(isExpectedUserError(new Error('Cet email existe déjà sur un autre compte.'))).toBe(true);
    expect(isExpectedUserError(new Error('Stock insuffisant : quantité disponible 2'))).toBe(true);
  });
  it('journalise toujours une erreur technique réelle',()=>{
    expect(isExpectedUserError(new Error('relation products does not exist'))).toBe(false);
    expect(isExpectedUserError(new Error('Failed to fetch'))).toBe(false);
    expect(isExpectedUserError({ status: 500, message: 'Internal Server Error' })).toBe(false);
  });
});
