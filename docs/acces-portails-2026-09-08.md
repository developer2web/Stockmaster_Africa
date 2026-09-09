# Accès, portails et accueil mobile — 8 septembre 2026

## Cause confirmée de la mauvaise redirection

Le serveur lancé sur le port 4001 utilisait `apps/admin-web/vite.config.ts` avec une option `--port 4001`. Un doublon du site public occupait également 4002. Le portail propriétaire n’était pas lancé. L’application ouvrait donc bien 4001, mais y trouvait Super Admin.

Ces deux processus locaux ont été arrêtés et les portails relancés sur leurs ports réservés :

| Interface | Port local | Vérification |
| --- | --- | --- |
| Site public | 4000 | Serveur existant conservé |
| Propriétaire / Account | 4001 | Titre HTTP : « Mon compte StockMaster » |
| Super Admin | 4002 | Titre HTTP : « StockMaster Admin » |
| Application Expo | 8081 | Serveur existant conservé |

Vite refuse maintenant le démarrage d’un portail avec un autre port. L’application vérifie aussi que l’origine du lien Account retourné correspond à celle qu’elle a demandée. Les nouveaux serveurs Account et Admin sont accessibles sur le réseau local pour les essais sur téléphone. Aucune publication distante n’a été effectuée.

## Erreurs d’accès et chargement

- Le détail d’une vente charge ses articles, montants et reçus indépendamment des coûts et bénéfices. Un refus financier ne bloque plus le document entier. Les données financières absentes sont indiquées comme indisponibles, sans faux zéro, et leur chargement peut être relancé.
- Les erreurs de schéma sont distinguées des refus de permission et des sessions expirées. Une fonction contenant « access » dans son nom n’est plus automatiquement considérée comme un refus d’accès.
- Le cache hors ligne ne masque plus un refus serveur ou une migration manquante. Le repli reste disponible pour une panne réseau ou un serveur temporairement indisponible, sans effacer les opérations en attente.
- Les paramètres propriétaire/employé et l’échec du détail de vente proposent « Vérifier les accès ». Ces contrôles en lecture seule retournent des statuts et codes, sans copier les identifiants, jetons ou données métier reçues.
- Une tentative de connexion dans le mauvais espace conserve le formulaire et affiche son message de refus. Un accès direct à un écran réservé affiche également une explication et un retour vers l’espace autorisé.

Les essais ne prouvent pas que la base utilisée par le compte réel possède tous les droits et migrations attendus. Si l’erreur persiste après rechargement, lancer « Vérifier les accès » sur le détail concerné puis copier le bilan : il permet notamment de distinguer `42501` (refus serveur), `PGRST202` (fonction indisponible), session expirée et problème réseau. Aucun droit SQL n’a été élargi pour masquer ces erreurs.

## Abonnements et présentation

La réception de stock suit désormais le droit de gestion du stock, indépendamment de celui des dettes fournisseurs. Les modules concernés du menu utilisent leurs droits réels, sans nom de forfait codé en dur. Une panne de lecture de l’abonnement propose une reprise au lieu d’affirmer que la fonctionnalité n’est pas incluse. Les fonctionnalités sont réévaluées au retour dans l’application et toutes les 60 secondes pendant son utilisation ; les statuts expirés ou en lecture seule restent bloqués.

À la demande du propriétaire, l’accueil a été rétabli dans sa disposition précédente : « Votre boutique aujourd’hui », Nouvelle vente et trois indicateurs de même importance. Le choix initial Administrateur / Employé est également conservé. Les fonds et couleurs d’élévation sont cohérents en clair et en sombre. Les champs remplis automatiquement utilisent un fond blanc et un texte sombre sur les quatre interfaces web ; les champs partagés utilisent la couleur de surface sur mobile.

## Validation

- TypeScript, ESLint, 125 tests dans 25 fichiers et les quatre compilations réussis.
- Chromium : détail et reçu accessibles sous refus financier ; reprise des coûts et bénéfices ; refus de lecture réel préservé ; diagnostic d’une fonction serveur manquante.
- Chromium : refus persistant propriétaire vers espace employé et employé vers espace propriétaire.
- Accueil : 320, 390, 768 et 1 440 pixels en clair, 390 pixels en sombre, sans débordement visible.
- Fonctions : réception disponible sans dette fournisseur ; rôles désactivés masqués ; erreur de catalogue distinguée d’une exclusion du forfait et reprise réussie.
- Remplissage automatique Chromium : fond blanc et texte sombre vérifiés en forçant l’état `autofill` du navigateur.

Résultats locaux : `tmp/responsive/access-diagnostics-results.json`, `portal-access-results.json` et `home-features-results.json`. Données et comptes de navigateur fictifs ; recette du compte réel et essais Android/iOS natifs encore nécessaires.

## Diagnostic réel reçu le 9 septembre

Le bilan utilisateur confirme un refus `42501` sur `sale_financials`, avec session, contexte, historique et autres tables accessibles. La correction ciblée est dans `supabase/migrations/202609090001_restore_owner_financial_views.sql`. Elle rétablit les vues financières avec les privilèges de leur propriétaire et le filtre explicite `is_company_admin`, sans ouvrir les colonnes financières des tables de base aux employés. Les vues restent interdites aux connexions anonymes.

La CLI Supabase a refusé le diagnostic distant : `Access token not provided`. Cette migration n’a donc pas été appliquée à la base distante. L’exécuter depuis le SQL Editor du projet StockMaster, puis relancer « Vérifier les accès » et « Réessayer les bénéfices » sur la vente.

Le chargement du contexte ne réinitialise plus la session à chaque sélection automatique d’entreprise ou de boutique. Les lectures de contexte et de vérification initiale d’abonnement sont interrompues après 15 secondes sans réponse, avec une possibilité de reprise. Les événements de reconnexion d’un même compte ne vident plus l’écran. Les vérifications serveur des rôles sont maintenues.
