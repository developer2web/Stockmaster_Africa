# Expiration et configuration serveur — 12 septembre 2026

## Changements

- La consultation reste accessible après expiration selon les permissions du compte. Les mutations métier sont bloquées côté application et via 44 déclencheurs serveur.
- Le dernier abonnement détermine les droits d’écriture ; la période de grâce ne prolonge pas ces droits. Authentification, renouvellement, support et état de lecture des notifications restent accessibles.
- Migrations 202609120005, 202609120006 et 202609120007 appliquées sur le projet Supabase mwpbinlxablzruvpjjjy.
- Quatre fonctions auparavant absentes sont installées : assert_session_security, claim_payment_provider_request, release_payment_provider_request, get_filtered_sales_history.
- Emails/API lance son diagnostic à l’ouverture et affiche fonctions disponibles, protection après expiration et tâches automatiques. Les paramètres d’API facultatives restent distincts d’une intégration testée.
- La rétention des notifications à 48 heures est planifiée chaque minute. Le registre durable des emails de facturation conserve l’idempotence après suppression.

## Vérification

- 217 tests Vitest réussis ; contrôle TypeScript, lint et build du Super Admin réussis.
- Vérifications SQL supplémentaires avec PGlite sur schéma isolé : expiration, conservation des lectures propriétaire, refus INSERT/UPDATE/DELETE, renouvellement autorisé, accès Super Admin, signatures du diagnostic. Ce contrôle ne remplace pas la suite pgTAP dans un Supabase complet.
- Audit serveur : 44 protections actives ; aucune des quatre fonctions ne manque ; aucune erreur applicative non résolue enregistrée dans les deux derniers jours. Cela ne prouve pas l’absence de toute erreur possible.
- Tâches emails et facturation : dernière exécution réussie. Tâche de rétention nouvellement installée au moment du contrôle.
- Sites locaux démarrés avec Node 20 : ports 4000, 4001, 4002, tous HTTP 200. Le shell utilisait Node 26 ; npm.cmd est une commande Windows, utiliser npm sur macOS.

## Limites

Aucun paiement réel effectué, aucun abonnement client modifié pour simuler une expiration. Le parcours visuel complet d’un propriétaire puis d’un employé avec abonnement expiré reste à confirmer. Les anciennes migrations non liées à ces corrections n’ont pas toutes été déployées.
