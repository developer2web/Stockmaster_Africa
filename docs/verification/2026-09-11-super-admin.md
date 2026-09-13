# Réorganisation du Super Admin

Changements locaux du 11 septembre, sans publication distante confirmée.

- Navigation regroupée : Clients, Facturation, Suivi et Administration. L’administration est repliée au premier affichage, puis s’ouvre lorsqu’une de ses pages est demandée.
- Accueil compact : trois actions à traiter, trois indicateurs et deux sections de détails repliées. Les paiements en attente incluent `pending` et `processing`, hors archives. Les compteurs indisponibles affichent un tiret.
- Répartition des abonnements issue des données réelles ; suppression du donut décoratif à proportions fixes. Les ventes des entreprises sont distinguées des encaissements StockMaster et présentées par devise et mois.
- Menu mobile unique avec rubriques regroupées et déconnexion accessible. Navigation desktop défilante indépendamment du pied de menu.
- Réglages des essais automatiques regroupés dans Paramètres → Abonnements, avec un raccourci depuis l’attribution d’essai.
- Rubrique Paramètres → Emails : diagnostic indépendant des secrets et de la file, erreurs d’envoi affichées, distinction entre acceptation Resend et livraison, explications séparées pour Auth SMTP et les notifications.

Validation : TypeScript, ESLint, compilation Admin et 204 tests Vitest sur 37 fichiers. Le contrôle navigateur du nouveau menu n’a pas pu être exécuté : le démarrage du serveur de test local a été refusé par la revue automatique pour quota épuisé. Aucun contournement effectué. Contrôler le rendu aux largeurs 390, 768, 1024 et 1440 px avant publication.

Le diagnostic distant des emails reste à confirmer à partir des erreurs Resend/Auth du projet réel. Le script `scripts/diagnose-email.sql` est en lecture seule et ne déclenche aucun envoi.
