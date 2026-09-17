// Audit externe (PDF, SM-04) : le paramètre d'URL `notice` était affiché
// littéralement comme message de confirmation sur une quinzaine d'écrans —
// n'importe qui pouvait donc envoyer un lien (WhatsApp, SMS) du type
// `?notice=Compte suspendu : appelez le 06...` qui, ouvert par un utilisateur
// déjà connecté, affichait un faux message "officiel" dans l'espace
// authentifié de l'application. Le texte est bien échappé (pas de faille
// technique), le risque est le hameçonnage.
//
// Correctif : `notice` ne transporte plus jamais de texte libre, seulement
// un code fixe ci-dessous — un lien forgé ne peut donc afficher qu'un
// message déjà prévu par l'application, jamais un texte arbitraire.
// resolveNotice() renvoie une chaîne vide pour tout code inconnu.
export const NOTICE_MESSAGES = {
  produit_enregistre: 'Produit enregistré',
  produit_modifie: 'Modification enregistrée',
  client_enregistre: 'Client enregistré',
  retour_enregistre: 'Retour enregistré',
  vente_enregistree: 'Vente enregistrée',
  forfait_active: 'Votre forfait a bien été activé. Connectez-vous pour démarrer.',
  reconnexion_requise: 'Reconnectez-vous.',
  verification_compte_impossible: 'Impossible de vérifier le type de ce compte. Réessayez.',
  acces_employe_absent: 'Ce compte ne possède pas d’accès employé.',
  acces_admin_absent: 'Ce compte ne possède pas d’accès administrateur.',
} as const;

export type NoticeCode = keyof typeof NOTICE_MESSAGES;

export function resolveNotice(code?: string | null): string {
  if (!code) return '';
  return NOTICE_MESSAGES[code as NoticeCode] ?? '';
}
