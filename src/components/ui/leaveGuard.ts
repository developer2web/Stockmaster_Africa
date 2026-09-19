import { useEffect, useRef } from 'react';

// Garde de sortie partagé : un écran qui contient du travail non enregistré (formulaire modifié,
// panier rempli) l'enregistre ici, et tout contrôle de navigation (bouton Retour, barre de
// navigation latérale ou du bas) passe par withLeaveGuard avant de quitter l'écran. Le garde de
// react-navigation (usePreventRemove) ne suffit pas : passer d'un onglet à un autre ne retire pas
// l'écran, donc rien n'est intercepté.
type Guard = (proceed: () => void) => void;

let current: Guard | null = null;

export function withLeaveGuard(proceed: () => void) {
  if (current) current(proceed);
  else proceed();
}

/** Active le garde tant que `active` est vrai ; `request` reçoit l'action à exécuter si la personne confirme. */
export function useLeaveGuard(active: boolean, request: Guard) {
  const latest = useRef(request);
  latest.current = request;
  useEffect(() => {
    if (!active) return;
    const guard: Guard = (proceed) => latest.current(proceed);
    current = guard;
    return () => { if (current === guard) current = null; };
  }, [active]);
}
