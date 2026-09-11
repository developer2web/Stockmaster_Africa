# Correctifs de sécurité — préparation du déploiement

État : correctifs réalisés dans les sources locales. Aucun déploiement Supabase ni publication distante confirmé dans cette intervention. Le bilan de vérification est dans `docs/verification/2026-09-10-security.md`.

## Ce qui change

- Un compte ne peut plus modifier ses privilèges Super Admin ni son activation via son profil ; nom et avatar restent modifiables.
- Les coûts produit passent par des vues contrôlées par entreprise, boutique et permission. Les bénéfices des ventes restent réservés au propriétaire actif de l’entreprise.
- Un second facteur déjà activé doit être validé avant les données métier, dans l’application et les portails web. Le serveur contrôle également REST/RPC, Storage et Realtime. Cette modification ne force pas l’inscription à la 2FA pour les comptes qui ne l’ont pas configurée.
- L’obligation de remplacer un mot de passe temporaire appartient au serveur. La nouvelle fonction `change-temporary-password` contrôle sa modification. Une réauthentification de contrôle ne remplace plus la session principale validée en 2FA.
- Les paiements gardent leurs paramètres et leur état final. Les appels concurrents réutilisent une même opération. Une réponse Mobile Money perdue impose une vérification du prestataire : la demande n’est pas renvoyée automatiquement. Les reprises Stripe gardent la même clé et sont limitées à une fenêtre de 23 heures, inférieure à la [durée minimale de conservation annoncée par Stripe](https://docs.stripe.com/api/idempotent_requests).
- Le lien vers le portail propriétaire utilise la destination fixée côté serveur ; son jeton temporaire est dans un fragment d’URL consommé puis retiré.
- Les caches métier et ventes hors ligne sont chiffrés avec authentification : XChaCha20-Poly1305 et clé SecureStore sur mobile ; AES-GCM et clé non exportable IndexedDB sur le web. Les données anciennes sont migrées à leur lecture/écriture après validation. Une clé perdue bloque le déchiffrement et conserve la file de ventes ; ne pas effacer les données de l’application lorsqu’une synchronisation est encore en attente.
- Les pages publiées disposent de configurations d’en-têtes HTTP de sécurité. Voir `docs/security/web-hosting.md`.

Le chiffrement web protège le contenu conservé dans le stockage local ; un script malveillant exécuté dans le même site pourrait utiliser sa clé. Il ne remplace donc ni la CSP ni la prévention des injections. Les essais sur téléphone réel restent nécessaires.

## Ordre de mise en service

1. Utiliser une copie de test de Supabase et une sauvegarde restaurable. Contrôler les migrations déjà appliquées avec `supabase migration list --linked`, puis la liste proposée par `supabase db push --linked --dry-run`. Ne pas lancer `db reset --linked` sur les données réelles.
2. Exécuter en local/CI disposant de Docker : `supabase start`, `supabase db reset --local`, `supabase db lint --local`, `supabase test db`. Les nouveaux tests couvrent privilèges, données financières, sessions 2FA/mot de passe temporaire et intégrité des paiements.
3. Appliquer toutes les migrations en attente dans l’ordre. Les migrations de sécurité du 10 septembre sont 001 (droits/coûts), 002 (paiements), 003 (mots de passe temporaires) et 004 (contrôle des sessions), puis 005 (notifications managers), 006 (Orange Money manuel) et 007 (résolution groupée des erreurs). Les éventuelles migrations antérieures non appliquées restent nécessaires.
4. Configurer `ACCOUNT_WEB_URL` avec la vraie URL HTTPS du portail propriétaire et `ALLOWED_ORIGINS` avec les origines exactes des sites autorisés. Contrôler les URL de retour Auth/Stripe et la configuration du prestataire. Aucun secret privilégié dans une variable `EXPO_PUBLIC_*` ou `VITE_*`. Garder `PAYMENT_SANDBOX` désactivé en production.
5. Déployer les fonctions Edge : `invite-employee`, `change-temporary-password`, `account-portal-link`, `create-payment`, `renew-subscription`, `check-payment-status`, `notification-email`, `super-admin-configuration`. Conserver les contrôles de signature des webhooks. Les nouveaux endpoints de mot de passe et de diagnostic Super Admin gardent `verify_jwt = true`.
6. Construire puis publier l’application et les trois sites avec les nouveaux fichiers `_headers`, ou leur équivalent chez l’hébergeur. Les clients précédents ne connaissent pas les nouvelles vues de coûts et gardes de session : coordonner la mise à jour serveur/client dans une fenêtre de maintenance, puis demander aux sessions déjà ouvertes de se reconnecter.
7. Vérifier directement les API avec un propriétaire, un manager, un employé sans droit financier, une seconde entreprise et un visiteur anonyme ; vérifier aussi les sessions 2FA non validées. Confirmer les nouvelles règles sur les domaines réellement publiés.

La migration 004 définit `pgrst.db_pre_request` sur `authenticator`. Si le serveur distant a déjà un autre hook non présent dans ce dépôt, combiner les contrôles avant application : ne pas perdre sa logique. Les politiques restrictives ne couvrent que les tables RLS existantes lors de cette migration ; toute nouvelle table métier doit recevoir la même règle de session. [Supabase distingue bien le contrôle Data API des autres services](https://supabase.com/docs/guides/api/securing-your-api).

## Ce qu’il reste à vérifier côté exploitation

### Notifications Employé / Manager

La cloche apparaît dans l’en-tête de l’accueil Employé, et la boîte est également accessible dans **Autres outils → Notifications**. Cette boîte personnelle reste visible même sans permission d’alerte métier ; cela ne donne pas accès aux messages du propriétaire ou d’un autre employé.

La migration `202609100005_manager_notifications.sql` est nécessaire pour créer les nouvelles alertes managers. Elle attribue `notifications.read` aux rôles employés nommés **Manager** déjà présents et au modèle Manager des prochaines entreprises. Pour un rôle personnalisé, attribuer cette permission dans **Rôles**, avec le droit de consulter le stock et les boutiques concernées, puis actualiser la session. Le serveur recontrôle ces droits à chaque lecture.

Après déploiement, vérifier sur un produit de test le passage d’une quantité supérieure au seuil de stock à une quantité égale ou inférieure. Le manager affecté reçoit une notification dans l’application, le propriétaire garde son alerte habituelle, les autres boutiques ne la reçoivent pas. Les stocks déjà bas ne génèrent pas rétroactivement une nouvelle notification. Les alertes managers ajoutées n’envoient pas d’email et expirent après 48 heures.

### Autres contrôles

- Activer la 2FA sur les comptes de gestion ; contrôler les limites Auth et les tentatives répétées, les origines réellement configurées et les accès aux secrets.
- Vérifier que les bénéficiaires et références des paiements manuels correspondent au relevé Orange Money réel. Aucune capture ni simple retour navigateur ne doit déclencher l’activation d’un abonnement.
- Réconcilier toute opération Mobile Money incertaine avec le prestataire avant d’autoriser une nouvelle demande. Ne pas marquer un débit comme échoué sur la seule base d’un délai réseau.
- Tester une restauration de sauvegarde et la réception des alertes techniques.
- Résoudre les avis de dépendances restants et l’écart de support Node/Supabase dans une migration dédiée respectant la politique SDK54. Le dernier audit contrôlé indique 28 paquets signalés, dont 8 élevés ; ce n’est pas un état « zéro vulnérabilité ».


La configuration email et la section Erreurs sont détaillées dans [le guide Super Admin](super-admin-configuration.md). Orange Money reste manuel : une déclaration n’est jamais une confirmation de réception d’argent. Pour automatiser, demander un compte marchand et l’accès officiel auprès d’Orange ; [l’offre Web Payment est annoncée en Guinée Conakry](https://developer.orange.com/apis/om-webpay/faq). Aucun accès marchand, paiement réel ou activation de prestataire n’a été réalisé ici.
