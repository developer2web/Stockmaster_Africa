# Déclaration Orange Money — correction serveur

Cause confirmée : le portail Account transmet p_expected_amount et p_expected_currency, alors que le serveur ne proposait que l’ancienne signature à huit paramètres. PostgREST renvoyait PGRST202, traduit par le message « nécessite la mise à jour du serveur ». La colonne request_details et la fonction assert_session_security n’étaient pas disponibles non plus.

La migration ciblée 202609120004 ajoute request_details et remplace l’ancienne signature par la signature compatible à dix paramètres, dont les deux derniers sont facultatifs pour les anciens clients. Le contrôle de session/MFA est intégré à cette fonction pour ne pas dépendre d’une migration de sécurité globale non déployée. Les vérifications propriétaire, montant, devise, référence, justificatif et entreprises à conserver sont conservées. La fonction de notification de paiement déjà utilisée pour les reçus automatiques reste inchangée.

Validation : huit assertions Orange Money passent dans le harnais PostgreSQL embarqué sur schéma minimal, avec une fonction de devis simulée. Elles couvrent les références répétées, les paramètres contradictoires, l’isolation des propriétaires, le statut confirmé préservé, la devise différente, une nouvelle déclaration en processing et sa reprise sans doublon. Aucun paiement de test n’a été créé en production. La suite pgTAP complète sur Supabase de test reste distincte.

Migration appliquée au projet mwpbinlxablzruvpjjjy. L’utilisateur peut reprendre uniquement la déclaration avec la référence du transfert déjà effectué. Ne pas refaire le transfert. L’abonnement s’active après confirmation manuelle de la réception des fonds.
