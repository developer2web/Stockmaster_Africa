# Configurer le Super Admin StockMaster

Les changements de code sont locaux. Les secrets Resend et les mises à jour de la base distante n’ont pas été configurés pendant cette intervention.

## Résoudre « RESEND_API_KEY ou NOTIFICATION_FROM_EMAIL non configuré »

Cette alerte signifie que la fonction Supabase `notification-email` ne trouve pas au moins une de ses deux variables. Le domaine seul, un fichier `.env` du site ou un compte Super Admin ne configurent pas l’envoi.

1. Avoir un compte Resend et un domaine dont vous contrôlez les DNS. Ajouter ce domaine ou un sous-domaine d’envoi dans Resend. Copier les enregistrements DNS indiqués par Resend, puis attendre sa validation. Une adresse Gmail/Outlook personnelle n’est pas un domaine d’envoi que vous contrôlez. [Guide Resend](https://resend.com/docs/dashboard/domains/introduction).
2. Créer une clé API Resend autorisée à envoyer pour ce domaine. Choisir une clé d’envoi à portée limitée lorsque disponible. La clé reste privée. [Clés Resend](https://resend.com/docs/dashboard/api-keys/introduction).
3. Ouvrir **Supabase → projet StockMaster → Edge Functions → Secrets** et ajouter :
   - `RESEND_API_KEY` : votre vraie clé, copiée directement depuis Resend.
   - `NOTIFICATION_FROM_EMAIL` : par exemple `StockMaster <notifications@votre-domaine.com>` ; remplacer cet exemple par votre domaine vérifié.
4. Déployer `notification-email` et la nouvelle fonction `super-admin-configuration` avec le reste des fonctions du lot. [Secrets Supabase](https://supabase.com/docs/guides/functions/secrets).
5. Dans **Super Admin → Paramètres → Emails**, cliquer sur **Diagnostiquer les notifications**. Ce contrôle vérifie la présence des paramètres et le format de l’expéditeur, puis lit la file et sa dernière erreur par statut ; il ne garantit pas l’autorisation de la clé, le domaine DNS ni la réception.
6. Consulter **Avertissements** et le tableau Resend : les messages encore en attente sont réessayés par le cron. Contrôler un envoi transactionnel attendu vers une adresse de test. Les anciennes notifications supprimées après 48 heures ne sont plus dans la file d’envoi.

Les emails de confirmation d’inscription/réinitialisation sont gérés par **Supabase Auth → SMTP**, séparément de cette fonction de notification. Configurer également ce SMTP pour une utilisation réelle ; ajouter uniquement les deux secrets ci-dessus ne configure pas les emails Auth.

Pour l’expéditeur déclaré `noreply@stockmaster.com`, vérifier précisément le domaine `stockmaster.com` dans Resend (un sous-domaine API ne valide pas automatiquement cette adresse). Dans **Authentication → Email → SMTP Settings**, activer le SMTP personnalisé : serveur `smtp.resend.com`, port `465`, utilisateur `resend`, mot de passe = clé API Resend, expéditeur `noreply@stockmaster.com`, nom `StockMaster`. [Procédure officielle Resend](https://resend.com/docs/send-with-supabase-smtp).

Pour les notifications applicatives, le secret Edge doit être `NOTIFICATION_FROM_EMAIL=StockMaster <noreply@stockmaster.com>` et la clé dans `RESEND_API_KEY`, sur le même projet que la fonction. Le dépôt configure `notification-email` avec `verify_jwt=false` : son webhook s’authentifie par un secret contrôlé côté base. Un déploiement différent imposant un JWT peut refuser le cron avant l’exécution de la fonction ; vérifier les réponses 401 dans ses invocations, sans désactiver son contrôle du secret.

Le script [diagnose-email.sql](../../scripts/diagnose-email.sql) permet de vérifier en lecture seule les déclencheurs, le cron, les emails bloqués et les dernières erreurs. Un statut `sent` signifie que Resend a accepté la demande, pas que le message est arrivé dans la boîte de réception. Le cron ne reprend pas les échecs ayant atteint huit tentatives, et les notifications expirées après 48 heures sont supprimées. Ne pas réinitialiser aveuglément les traitements bloqués : vérifier leur état dans Resend pour éviter les doublons.

Ne jamais stocker les clés Resend, Stripe ou `service_role` dans une variable `VITE_*`/`EXPO_PUBLIC_*`, le dépôt Git ou un champ visible de l’interface. En cas de clé déjà exposée, la remplacer dans son service.

## Autres éléments nécessaires

| Élément | Où le configurer |
| --- | --- |
| Compte et privilège Super Admin | Compte Auth et rôle attribué côté serveur par un administrateur autorisé ; jamais par édition libre du profil |
| Initialisation | Le secret `SUPER_ADMIN_BOOTSTRAP_SECRET` sert au bootstrap serveur ; le retirer après initialisation si ce mécanisme n’est plus nécessaire |
| 2FA | Super Admin → Paramètres → Sécurité ; conserver un moyen de récupération approprié |
| Base et contrôles d’accès | Appliquer les migrations du dépôt, puis tests SQL sur une base de test |
| URLs publiques/portails | Hébergement HTTPS et URLs Auth autorisées ; `ACCOUNT_WEB_URL` pointe vers le portail propriétaire |
| Origines navigateur | Secret `ALLOWED_ORIGINS` : origines exactes des sites, séparées par des virgules |
| Orange Money manuel | Paramètres → Paiements : numéro exact et nom réel du bénéficiaire ; vérifier chaque réception sur le compte Orange |
| Stripe, si utilisé | Clé secrète, secret du webhook, URLs de retour correctes ; tester avant activation réelle |
| Exploitation | Sauvegarde et restauration testée, suivi des journaux et alertes, mise à jour des dépendances |

## Section Erreurs

**Tout marquer comme résolu** classe toutes les erreurs ouvertes enregistrées avant la confirmation, y compris hors des filtres actuels. Les lignes restent consultables dans « Résolues » avec l’auteur et la date. Les nouvelles erreurs restent ouvertes. Classer un incident ne corrige pas sa cause.

Pour corriger les incidents réels, relever leur code, message et contexte expurgé des données privées. L’accès aux journaux Supabase déployés n’était pas disponible ici : aucune promesse de résolution de tous les incidents en production n’est faite.

## Erreur de stock

L’écran Stock charge maintenant ses quantités indépendamment du service de coûts. Si `product_costs` n’existe pas encore dans Supabase, la liste reste visible et la valeur d’achat est indiquée indisponible avec un bouton de reprise. Ne pas remplacer une donnée absente par un montant nul.

Appliquer notamment `202609100001_security_privileges.sql`, puis recharger le schéma PostgREST et reconnecter la session. Appliquer l’ensemble des migrations dans l’ordre décrit dans [le guide de déploiement](2026-09-10-deployment.md). Si les quantités elles-mêmes restent indisponibles, relever l’erreur exacte de `stock_levels`/`stock_movements` : le message générique ne suffit pas à identifier toute cause.
