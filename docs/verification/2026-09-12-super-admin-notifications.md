# Super Admin et notifications — 12 septembre 2026

## Changements

- Paramètres → Emails / API : présence des paramètres Resend, Stripe et prestataire de paiement ; aucune valeur de clé retournée au navigateur. La présence ne constitue pas un test de paiement.
- Les emails créés depuis plus de 48 heures sont classés « expired » dans le résumé ; leurs anciens messages d’erreur ne sont plus présentés comme l’état courant des secrets. L’avertissement email ancien est masqué lorsque ce résumé ne contient aucun envoi en cours ou en échec actuel.
- RPC mark_notifications_read(company) : contrôle de session/MFA, uniquement les notifications personnelles et celles partagées accessibles à un administrateur, dans l’entreprise demandée et pendant les dernières 48 heures. Retourne les identifiants réellement modifiés. Le portail propriétaire ne simule plus une réussite sur toutes les lignes et recharge les données. L’app utilise la même RPC.
- RPC super_admin_resolve_all_errors installée : classement explicite des incidents avant la date de confirmation, sans supprimer l’historique. Cette action ne prétend pas corriger les causes.
- Vues product_costs et product_variant_costs installées avec contrôle d’appartenance active et des droits financiers pour corriger les erreurs récentes de vue absente. Les privilèges existants des tables ne sont pas modifiés par cette migration ciblée.

## Déploiement et validation

Migrations 202609120002 et 202609120003 appliquées et vérifiées. Diagnostic super-admin-configuration v6 ACTIVE. Accès anon à mark_notifications_read refusé par les privilèges PostgreSQL.

214 tests Vitest passent ; typecheck et lint réussissent. Builds Admin et Account réussis. Le harnais PostgreSQL embarqué exécute 13 assertions de facturation, 9 assertions de notifications et 2 assertions sur la vue de coûts sur un schéma minimal isolé ; il ne remplace pas la suite pgTAP complète sur une base Supabase de test.

Les serveurs locaux Vite http://localhost:4002 (Admin) et http://localhost:4001 (Account) répondent en HTTP 200 et servent les modules modifiés. L’utilisateur confirme utiliser ces sites en local ; aucune publication Vercel requise. Aucune session utilisateur n’a été usurpée pour les tests. La vérification visuelle du clic dans une session connectée reste à faire par l’utilisateur.

Les anciens incidents (rendu React, SecureStore, anciennes permissions ventes) sont conservés. Seule la cause récente product_costs absent a été corrigée dans ce lot ; ne pas interpréter ce rapport comme la disparition de tous les incidents historiques. Le diagnostic des API n’installe pas de clés Stripe ou de prestataire que l’utilisateur n’a pas fournies.
