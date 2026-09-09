# Cohérence des interfaces — 8 septembre 2026

## Résultat et périmètre

Les sources du site public, de l’application Expo/web et des portails Account et Admin ont été comparées et corrigées. Les contrôles navigateur utilisent leurs compilations locales et des réponses réseau fictives identiques. Ils ne prouvent pas que les quatre versions déployées sont à jour : leurs adresses réelles ne sont pas renseignées dans la configuration disponible.

Une lecture anonyme du catalogue Supabase configuré a également réussi, sans modification de la base ni accès aux données des clients. Les prix mensuels retournés lors de cette lecture étaient Basic 120 000 GNF, Pro 300 000 GNF et Business 600 000 GNF. Cela valide la réponse publique disponible, pas le montant réellement facturé : la comparaison SQL reste à exécuter.

## Incohérences corrigées

| Information | Source commune et comportement |
| --- | --- |
| Noms des forfaits | Noms du catalogue serveur, y compris un nom personnalisé ; le code historique `premium` n’impose plus un autre nom commercial. |
| Prix et périodicité | Catalogue serveur ; format monétaire partagé ; Account distingue le montant annuel du mensuel. Les prix inventés en cas d’erreur ont été retirés. |
| Fonctionnalités | Droits activés du forfait uniquement, sans déduire des fonctionnalités à partir de son nom. Les exports Excel restent supprimés ; l’import Excel et les PDF restent disponibles selon les droits. |
| Quotas | Entreprises par compte ; boutiques et employés par entreprise. |
| Essai et statut | Dates et statut réels ; aucune promesse automatique de 14 jours, aucune progression fictive, aucun badge « Actif » sur un abonnement expiré. |
| Liens entre sites | Configuration partagée ; ports locaux cohérents ; aucun port de développement ajouté à une destination de production. |
| Identité et contacts | Même configuration pour Expo et les pages légales publiques ; les valeurs manquantes restent signalées. Les configurations Vite/Expo contradictoires sont rejetées. |

La clé technique historique `excel_export` reste utilisée pour autoriser l’import Excel et préserver les abonnements existants. Ce nom interne ne correspond plus à une fonction d’export.

### Correction SQL préparée

`list_public_plans` lisait l’ancien prix de `plans`, alors que le catalogue authentifié et le devis de paiement lisent `plan_currency_prices`. La migration [202609070001_public_catalog_consistency.sql](../supabase/migrations/202609070001_public_catalog_consistency.sql) aligne le catalogue public sur le tarif GNF utilisé par la facturation, sans changer les prix enregistrés.

Cette migration **n’a pas été appliquée à la base distante**. Les six assertions de [public_catalog_consistency.test.sql](../supabase/tests/public_catalog_consistency.test.sql) vérifient notamment qu’un changement de prix atteint le site public, le catalogue authentifié et le devis. Leur exécution a été bloquée par l’absence de base locale joignable sur `127.0.0.1:54322` ; Docker et psql n’étaient pas disponibles dans le PATH.

## Vérifications

- TypeScript, ESLint et 99 tests Vitest répartis dans 20 fichiers réussis.
- Export Expo web et compilations des trois sites Vite réussis, avec les quatre pages légales publiques.
- Dix groupes de contrôles navigateur de cohérence : quatre interfaces à 390 et 1 280 pixels, indisponibilité du catalogue public et pages légales.
- Le catalogue fictif utilise un nom et des prix inhabituels, des quotas personnalisés et un droit PDF désactivé : les interfaces doivent suivre ces valeurs, ce qui évite qu’un ancien prix codé en dur fasse passer le test par hasard.
- Rapports : filtres actifs conservés après repli, effacement, transmission du produit au calcul, détails repliables et bouton PDF unique ; contrôles à 320, 390, 768, 1 024 et 1 440 pixels sans débordement visible.
- Un clic rapide après l’apparition des filtres pouvait refermer le sélecteur de produit : l’animation du menu partagé a été désactivée pour éviter cette fermeture. Les 15 contrôles des rapports passent sans délai ajouté avant l’ouverture du sélecteur.

Les scripts et résultats locaux se trouvent dans `tmp/consistency/` et `tmp/responsive/`. Les tests durables de cohérence se trouvent dans `tests/site-consistency.test.ts`, `tests/subscription-catalog.test.ts` et le test SQL cité ci-dessus. Les essais navigateur avec données fictives ne remplacent pas la validation des permissions, paiements et appareils réels.

## Suite recommandée, dans l’ordre

1. **Valider la base en environnement de test.** Démarrer Supabase local avec Docker, appliquer les migrations dans cette base jetable puis lancer `npm run test:supabase`. Tester les rôles et l’isolation entre entreprises. Après réussite, appliquer la migration de cohérence en préproduction et comparer le prix public au devis authentifié.
2. **Renseigner les destinations et l’identité réelles.** Compléter `.env.example` dans la configuration de chaque déploiement : quatre URL, même projet Supabase, nom légal, immatriculation, adresse, contact support et confidentialité. Garder les paires Expo/Vite identiques. Les domaines de secours du code ne constituent pas des adresses de déploiement vérifiées.
3. **Faire une recette métier en préproduction.** Inscription, essai selon les règles configurées, vente, crédit, caisse, import, rapport PDF, expiration et reprise hors ligne. Vérifier le paiement avec le prestataire retenu et ses moyens de test avant tout encaissement réel.
4. **Tester sur de vrais téléphones et avec cinq utilisateurs.** Petit Android, iPhone, clavier ouvert, texte agrandi et réseau intermittent. Suivre le [protocole utilisateurs](essai-utilisateurs-simplification.md) et corriger les tâches qui nécessitent une aide.
5. **Publier les versions ensemble puis refaire les contrôles sur leurs URL réelles.** Vérifier les liens, tarifs, droits, statut et pages légales. Aucune publication n’a été réalisée pendant cet audit.

Après ces validations, les améliorations utiles sont de raccourcir les arguments répétés du site public et de consolider les feuilles de style Admin. Aucun autre module métier ne mérite d’être supprimé sans observer d’abord son utilisation en boutique.
