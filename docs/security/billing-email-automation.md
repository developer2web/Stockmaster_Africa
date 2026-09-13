# Reçus et rappels automatiques

Implémentation du 12 septembre 2026. Désactivée par défaut à l'installation.

## Comportement

- Reçu transactionnel HTML et texte pour chaque nouveau paiement confirmé avec un abonnement associé : montant réellement payé, devise, référence, forfait, périodicité et dates UTC. Le second paiement confirmé d'une entreprise et les suivants sont intitulés « Renouvellement confirmé ».
- Le reçu est l'email lui-même, sans pièce jointe PDF. L'impression du reçu dans le portail propriétaire reste disponible.
- Essai : un rappel dans les trois derniers jours. Abonnement : un rappel dans les sept derniers jours puis un dans le dernier jour. Un message à l'expiration, uniquement pendant les 24 heures suivantes. En cas d'activation tardive, seule la fenêtre courante est utilisée.
- Vérification toutes les cinq minutes. Aucun prélèvement ni changement d'abonnement. Stripe n'est pas requis ; Orange Money confirmé est pris en charge.
- Les destinataires restent les propriétaires actifs prévus par les notifications. Aucun email financier aux managers/employés.
- Un registre privé empêche les doublons même après la purge des notifications à 48 heures. Une nouvelle date d'échéance ouvre une nouvelle série de rappels.
- Avant l'envoi, un rappel est annulé si l'abonnement a changé, si sa date a changé, si sa fenêtre est dépassée ou si le destinataire n'est plus autorisé.
- Désactiver arrête la création des automatismes et annule leurs emails non encore pris en charge à la prochaine tentative. Un email déjà accepté par le prestataire ne peut pas être rappelé. Les notifications existantes de paiement reprennent leur comportement antérieur.

## Mise en service

1. Comparer les migrations réellement appliquées aux migrations locales. Cette migration dépend de la file d’emails et de pg_cron. Elle vérifie elle-même la session Super Admin et reste compatible avec le schéma du 6 septembre ; les migrations managers ne sont pas requises. Ne pas appliquer aveuglément toutes les migrations historiques.
2. Exécuter `supabase/tests/billing_email_automation.test.sql` sur une base de test contenant les migrations, avec pgTAP. Le test désactive les triggers réseau dans sa transaction et termine par ROLLBACK. Ne pas le lancer sur la production.
3. Appliquer `supabase/migrations/202609120001_billing_email_automation.sql`. Les automatismes restent désactivés.
4. Déployer `notification-email` avec ses imports partagés et `verify_jwt=false` : le secret de webhook est contrôlé par la fonction. L'ancien worker doit impérativement être remplacé avant activation pour vérifier les rappels obsolètes.
5. Vérifier la présence des secrets `RESEND_API_KEY` et `NOTIFICATION_FROM_EMAIL`, sans afficher leur valeur. Ne pas modifier le SMTP Auth déjà fonctionnel. Vérifier également le worker `super-admin-configuration` existant pour le diagnostic.
6. Déployer le Super Admin compilé. Paramètres → Emails → Diagnostiquer les notifications, puis Vérifier l'activation.
7. Après validation de l'envoi sur un destinataire de test autorisé, activer les reçus et rappels. Aucun reçu de paiement antérieur à cette activation n'est rattrapé.
8. Contrôler les exécutions `stockmaster-billing-emails` et `stockmaster-notification-email-retry` dans Cron, puis les statuts finaux dans Resend. « sent » dans la file signifie accepté par Resend, pas livré en boîte de réception.

Pour désactiver : utiliser le même bouton du Super Admin. Conserver la migration et le worker ensemble : le worker utilise la RPC `claim_notification_email_job`.

## Validation locale

Tests TypeScript du worker : accès non autorisé refusé, absence d'envoi après refus de prise en charge (rappel obsolète ou concurrence), échappement HTML et enregistrement de l'acceptation. Tests SQL ajoutés pour les fenêtres, la déduplication, les droits et l'annulation après prolongation ; nécessitent PostgreSQL/pgTAP.

L’autorisation OAuth de déploiement a été accordée le 12 septembre. La migration 202609120001 a été appliquée et notification-email version 4 est ACTIVE. Les automatismes restent désactivés tant que les secrets email ne sont pas configurés et l’envoi vérifié.


## Vérification isolée reproductible

`node scripts/verify-billing-sql.mjs /private/tmp/stockmaster-billing-validation/node_modules/@electric-sql/pglite/dist/index.js`

Le paquet PGlite est installé uniquement dans le dossier temporaire, sans changement des dépendances de l’application. Les 13 assertions SQL passent sur un schéma de compatibilité minimal : les appels réseau et le planificateur sont simulés. Le test pgTAP complet sur une base Supabase de test reste distinct. Aucun jeu de données de test n’a été inséré en production.


## État serveur constaté le 12 septembre 2026

- Migration 202609120001 enregistrée ; cron stockmaster-billing-emails actif, première exécution réussie ; réglage enabled=false.
- notification-email v4 et super-admin-configuration v1 déployées ; appels anonymes refusés en HTTP 401 (v3 du worker vérifiée avant ajout du filtre d’âge).
- RESEND_API_KEY et NOTIFICATION_FROM_EMAIL absents au dernier contrôle. Demande d’ajout transmise au propriétaire, sans partage de clé dans la conversation.
- Ancienne file : 56 pending et 10 processing. Le worker ignore désormais les notifications créées depuis plus de 48 heures. Les processing ne sont pas relancés aveuglément : vérifier les acceptations Resend avant toute reprise.
- Le cron de purge à 48 heures de la migration 202609090003 n’est pas installé sur ce serveur. Le filtre d’âge empêche les emails anciens, mais ne supprime pas les notifications. Ce déploiement ne prétend pas avoir synchronisé toutes les migrations historiques.
- Le Super Admin est compilé localement ; publication web et activation encore à effectuer après configuration et validation de l’envoi. Aucun email réel de test envoyé.


## Mise à jour de l’expéditeur

RESEND_API_KEY est désormais présent sur le serveur. Le secret nommé « StockMaster Notifications » est conservé mais n’est pas utilisé par le worker. Le module partagé email-config.ts fournit noreply@stockmaster.africa uniquement pour le projet mwpbinlxablzruvpjjjy, lorsque NOTIFICATION_FROM_EMAIL est absent. Une valeur explicite garde la priorité ; les autres projets doivent définir leur expéditeur. Ce changement ne modifie pas Supabase Auth/SMTP.

Validation : 11 tests ciblés passent et typecheck réussit. notification-email v8 déployée. L’acceptation par Resend et la réception réelle restent à vérifier ; l’adresse destinataire du test a été demandée à l’utilisateur. Les automatismes restent désactivés jusqu’à cette vérification.

## Mise en service — 12 septembre 2026, 19:19 UTC

Un unique email de test, explicitement demandé à stockmaster.africa@gmail.com, a été accepté par Resend depuis noreply@stockmaster.africa. Référence prestataire : 66a7a132-5050-411b-91be-d95ad09d0aec. La fonction temporaire protégée email-delivery-check a ensuite été supprimée (HTTP 200). Aucun paiement fictif n’a été créé et aucune notification métier n’a été utilisée pour ce test.

Les automatismes sont activés depuis 2026-09-12 19:19:12.6249 UTC. L’exécution initiale de private.enqueue_billing_emails() a réussi dans la même transaction que l’activation. Les paiements antérieurs restent exclus. La réception effective du test dans Gmail n’est pas encore confirmée par l’utilisateur. La publication du panneau web Super Admin reste distincte du backend désormais actif.
