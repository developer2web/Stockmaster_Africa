import { useState } from 'react';
import { useAuth } from './AuthProvider';

// Audit externe (PDF, SM-07) : le premier clic sur "Se déconnecter" ne
// donnait aucun retour visuel tant que confirmSignOutWithPendingOperations()
// (et le reste de signOut()) n'avait pas fini de s'exécuter — sur une
// action de sécurité, l'utilisateur pouvait croire ne pas être déconnecté
// et recliquer, alors que la session était en cours de fermeture. Ce hook
// donne un état `signingOut` utilisable immédiatement comme `loading` sur
// le bouton, dès le premier clic.
export function useSignOutAction() {
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const run = async () => {
    setSigningOut(true);
    try { await signOut(); } finally { setSigningOut(false); }
  };
  return { signingOut, signOut: () => void run() };
}
