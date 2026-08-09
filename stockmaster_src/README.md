# StockMaster

Application universelle de gestion de stock, de ventes et de finances pour plusieurs entreprises et plusieurs boutiques.

StockMaster utilise un seul projet React Native pour Android, iOS et le Web. Le projet reste volontairement sur **Expo SDK 54**.

Cette décision est officielle et documentée dans
[`docs/adr/0001-expo-sdk-54.md`](docs/adr/0001-expo-sdk-54.md). Une migration
vers Expo 57 devra être réalisée comme un projet séparé.

## Technologies

- React Native et Expo SDK 54
- TypeScript et Expo Router
- React Native Paper
- Supabase Auth, PostgreSQL, Storage, Realtime et RLS
- TanStack Query et Zustand
- React Hook Form et Zod
- Expo Camera, Image Picker et Image Manipulator
- Vitest

## Fonctionnalités disponibles

### Authentification et sécurité

- inscription et connexion des administrateurs ;
- récupération et réinitialisation du mot de passe ;
- persistance sécurisée de la session ;
- connexion des employés avec email et mot de passe temporaire ;
- changement du mot de passe depuis l’espace employé ;
- redirection selon le rôle et l’état du compte ;
- blocage immédiat d’un employé ou d’une entreprise désactivée ;
- isolation des données par entreprise et boutique avec Supabase RLS ;
- contrôle des permissions dans l’interface et dans PostgreSQL.

### Entreprises, boutiques et employés

Le parcours principal est :

```text
Connexion → Choix de l’entreprise → Choix de la boutique → Tableau de bord
```

- un client peut gérer plusieurs entreprises ;
- une entreprise peut gérer plusieurs boutiques ;
- les données de chaque entreprise et boutique restent indépendantes ;
- un employé appartient à une entreprise ;
- un employé peut accéder à une, plusieurs ou toutes les boutiques autorisées ;
- rôles disponibles ou personnalisables : propriétaire, manager, caissier, gestionnaire de stock et comptable ;
- création, modification, activation, désactivation et changement de rôle des employés ;
- tableau de bord Super Administrateur pour les entreprises, boutiques, utilisateurs et journaux d’activité.

### Catalogue et images

- catégories, fournisseurs, produits et variantes ;
- recherche par nom, SKU ou code-barres ;
- prix d’achat, prix de vente et seuil de stock faible ;
- code-barres facultatif pour la recherche et le scanner ;
- zéro, une ou deux images par produit ;
- import depuis la caméra ou la galerie ;
- redimensionnement et compression avant envoi ;
- stockage dans le bucket Supabase privé `product-images` ;
- remplacement ou suppression indépendante des images ;
- miniature automatique et image par défaut.

### Scanner et stock

- lecture des codes EAN, UPC, Code 128 et Code 39 ;
- ouverture d’un produit existant après lecture ;
- création d’un produit lorsque le code est inconnu ;
- entrées et sorties de stock par boutique ;
- refus du stock négatif dans PostgreSQL ;
- historique avec anciennes et nouvelles quantités ;
- actualisation Realtime du stock et des mouvements ;
- scanner protégé contre les lectures en double.

### Ventes, caisse et comptabilité

- panier de vente multi-produits ;
- quantités, remises et plusieurs moyens de paiement ;
- création atomique des ventes dans PostgreSQL ;
- décrémentation du stock dans la même transaction ;
- conservation du prix d’achat original dans `sale_items` ;
- calcul du bénéfice brut après remise ;
- caisse liée aux ventes, approvisionnements et dépenses ;
- retrait automatique des dépenses dans le bénéfice net ;
- permissions distinctes pour la vente, la caisse, les dépenses et la comptabilité.

### Rapports

- rapports journaliers, mensuels et par période personnalisée ;
- filtres par boutique, employé, produit et catégorie ;
- chiffre d’affaires ;
- coût des marchandises vendues ;
- bénéfice brut, dépenses et bénéfice net ;
- quantité vendue et valeur du stock ;
- comparaison avec la période précédente ;
- performances par boutique et par employé ;
- produits les plus vendus et les plus rentables ;
- répartition par moyen de paiement ;
- export préparé avec Expo Print, Expo Sharing et XLSX.

## Prérequis

- **Node.js 20.19.x** ;
- npm ;
- un projet Supabase ;
- Android Studio pour une compilation Android locale ;
- macOS et Xcode pour une compilation iOS locale.

> Node.js 24 n’est pas supporté par la configuration actuelle et peut rendre Metro instable. La version recommandée est `20.19.4`.

## Installation

```bash
npm install
```

Créez ensuite le fichier `.env` à partir de l’exemple.

Sous PowerShell :

```powershell
Copy-Item .env.example .env
```

Sous macOS ou Linux :

```bash
cp .env.example .env
```

Variables attendues :

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=
EXPO_PUBLIC_APP_ENV=development
```

La clé `service_role` Supabase et la clé secrète Stripe ne doivent jamais être placées dans `.env` ou dans l’application.

## Lancer le projet

### Expo et Metro

```bash
npm start
```

Pour démarrer directement le Web :

```bash
npm run web
```

L’application Web est généralement disponible sur :

```text
http://localhost:8081
```

Sous PowerShell, si la commande `npm` est bloquée par la politique d’exécution :

```powershell
npm.cmd start
```

Utilisez le nettoyage du cache uniquement en cas de problème réel :

```bash
npx expo start --clear
```

Le premier bundle après `--clear` peut prendre plusieurs secondes.

### Builds natifs locaux

```bash
npx expo run:android
npx expo run:ios
```

La compilation locale iOS nécessite un Mac avec Xcode.

### Client de développement autonome

Le projet inclut `expo-dev-client`. Il peut donc fonctionner sans dépendre d’Expo Go.

```bash
npx eas-cli build --profile development --platform android
npx eas-cli build --profile development --platform ios
```

Après installation du client :

```bash
npm run start:dev-client
```

EAS Build peut compiler iOS dans le cloud depuis Windows, mais un compte Apple et les autorisations de signature appropriées restent nécessaires.

## Configuration Supabase

### Lier le projet

```bash
npx supabase login
npx supabase link --project-ref VOTRE_PROJECT_REF
npx supabase db push
```

### Reconstruction et tests locaux

Docker Desktop et la CLI Supabase sont requis. La reconstruction repart d'une
base vide, applique toutes les migrations, charge le seed puis exécute les tests
RLS et financiers :

```bash
npx supabase start
npm run db:reset
npm run test:supabase
```

Les tests couvrent l'isolation multi-entreprise, les permissions, le stock, les
ventes atomiques, la synchronisation de caisse et les rejeux idempotents.

### Observabilité

Les erreurs de rendu sont interceptées par l'Error Boundary global. Les erreurs
authentifiées sont journalisées de façon structurée dans `app_error_events`;
seul le Super Administrateur peut consulter cette table. Aucun jeton ou secret
ne doit être ajouté au contexte d'une erreur.

Pour limiter les appels Web aux origines de production, configurez le secret
Edge Functions suivant avec une liste séparée par des virgules :

```env
ALLOWED_ORIGINS=https://app.example.com,http://localhost:8081
```

## Pays, devises et taux de change

La devise principale est attribuée automatiquement à partir du pays choisi lors
de la création d'une entreprise. Le propriétaire peut sélectionner une autre
devise autorisée ou une devise secondaire avant la première vente. Après la
première vente, la configuration est verrouillée côté PostgreSQL.

Les ventes, dépenses et mouvements de caisse conservent leur code devise, leur
devise secondaire et le taux historique utilisé. Les taux fournis par le client
ne sont jamais acceptés pour les calculs.

### Authentification

Dans **Authentication → URL Configuration**, ajoutez les redirections nécessaires :

```text
stockmaster://**
http://localhost:8081/**
```

La confirmation d’email peut être activée en production. Si un SMTP personnalisé est utilisé, vérifiez son Host, son port, son Username et son mot de passe d’application.

### Edge Functions

Déployez les fonctions utilisées par l’application :

```bash
npx supabase functions deploy invite-employee
npx supabase functions deploy bootstrap-super-admin
```

Supabase fournit automatiquement aux fonctions hébergées :

- `SUPABASE_URL` ;
- `SUPABASE_ANON_KEY` ;
- `SUPABASE_SERVICE_ROLE_KEY`.

Le mot de passe temporaire d’un employé est généré côté serveur, affiché une seule fois à l’administrateur, puis transmis manuellement à l’employé. Les OTP et liens magiques ne sont pas utilisés pour cette connexion.

### Créer un Super Administrateur

Utilisez la fonction sécurisée `bootstrap-super-admin` ou une opération exécutée avec la `service_role`. Ne permettez jamais à l’application cliente d’attribuer elle-même ce statut.

## Base de données

Les migrations sont dans [`supabase/migrations`](supabase/migrations). Elles couvrent :

- le schéma initial et l’authentification ;
- les entreprises, boutiques, rôles et permissions ;
- le catalogue ;
- le scanner et le stock ;
- les ventes et les bénéfices ;
- les rapports ;
- le renforcement RLS ;
- le Super Administrateur et l’audit ;
- la caisse, les dépenses et la comptabilité ;
- la gestion multi-entreprises et multi-boutiques ;
- les images produits ;
- la hiérarchie des permissions.

Appliquez toujours les migrations dans leur ordre chronologique avec :

```bash
npx supabase db push
```

## Permissions des employés

Une permission d’écriture implique l’accès en lecture correspondant. Par exemple :

- `products.write` permet aussi de consulter les produits ;
- `sales.write` permet aussi de consulter les ventes ;
- `suppliers.write` permet aussi de consulter les fournisseurs.

La visibilité dans l’interface ne constitue pas une mesure de sécurité. Toutes les opérations sensibles sont également vérifiées par les politiques RLS ou les fonctions PostgreSQL.

## Vérifications

Avant une livraison :

```bash
npm run typecheck
npm run lint
npm test
npx expo-doctor
npx expo export --platform web
```

État des tests lors de la dernière mise à jour :

```text
5 fichiers de tests réussis
18 tests réussis
0 erreur TypeScript
0 erreur ESLint
```

## Dépannage

### `ERR_CONNECTION_REFUSED`

Metro n’est pas lancé ou n’écoute pas sur le port 8081 :

```bash
npm start
```

Vérifiez ensuite `http://localhost:8081`.

### Page Web blanche

1. attendez la fin de la compilation Metro ;
2. rechargez avec `Ctrl + F5` ;
3. évitez Node.js 24 et utilisez Node.js 20.19.x ;
4. relancez exceptionnellement avec `npx expo start --clear`.

La persistance de l’espace de travail utilise directement AsyncStorage afin de rester compatible avec le bundle Web d’Expo SDK 54.

### Erreur Supabase Realtime après `subscribe()`

Chaque montage React utilise désormais un nom de canal unique. Cela empêche Supabase de réutiliser un canal déjà abonné pendant le remontage des effets en mode développement.

Si une ancienne erreur reste affichée après la correction :

```text
Ctrl + F5
```

### `eas` n’est pas reconnu

Utilisez directement :

```bash
npx eas-cli build --profile development --platform android
```

ou installez la CLI :

```bash
npm install --global eas-cli
```

### Expo Go incompatible

StockMaster reste sur Expo SDK 54. Une version récente d’Expo Go peut ne plus accepter ce SDK. Utilisez dans ce cas le client de développement construit avec EAS.

## Structure

```text
src/
├── app/          Routes Expo Router
├── components/   Composants réutilisables
├── features/     Modules métier
├── hooks/        Hooks React et Realtime
├── schemas/      Validations Zod
├── services/     Supabase et services externes
├── stores/       État global
├── types/        Types TypeScript
└── utils/        Fonctions utilitaires

supabase/
├── functions/    Edge Functions
├── migrations/   Migrations PostgreSQL et RLS
└── seed.sql      Données initiales
```

## Abonnements et paiements Mobile Money

StockMaster propose les forfaits Basic, Pro et Premium. Les capacités et limites sont
définies côté PostgreSQL dans `plans` et `plan_features`; l’application ne décide
jamais seule si une fonctionnalité est autorisée.

Le paiement suit ce flux sécurisé :

1. `create-payment` ou `renew-subscription` vérifie l’utilisateur, le propriétaire,
   le forfait, le montant et la devise côté serveur ;
2. le prestataire Mobile Money reçoit une référence interne idempotente ;
3. `payment-webhook` vérifie la signature HMAC et appelle
   `process_payment_webhook` ;
4. l’abonnement n’est activé qu’après confirmation serveur ;
5. `check-payment-status` permet à l’application d’afficher le résultat sans
   pouvoir activer elle-même un forfait.

Variables secrètes des Edge Functions :

```text
PAYMENT_PROVIDER_URL
PAYMENT_PROVIDER_API_KEY
PAYMENT_WEBHOOK_URL
PAYMENT_WEBHOOK_SECRET
PAYMENT_SANDBOX=false
ALLOWED_ORIGINS=https://votre-domaine.example
```

Déploiement :

```bash
npx supabase functions deploy create-payment
npx supabase functions deploy renew-subscription
npx supabase functions deploy check-payment-status
npx supabase functions deploy payment-webhook --no-verify-jwt
```

Le webhook est public uniquement au niveau JWT Supabase : sa signature secrète
reste obligatoire. Ne placez aucune de ces variables dans une variable
`EXPO_PUBLIC_*`. Le format exact des requêtes et webhooks devra être adapté au
prestataire Mobile Money retenu.

## Feuille de route

- adaptation du connecteur au prestataire Mobile Money de production ;
- rapports Premium et exports finalisés ;
- multilingue ;
- tests de bout en bout ;
- publication App Store et Google Play.

## Sécurité

- ne commitez jamais `.env` ;
- ne stockez jamais la clé Supabase `service_role` dans l’application ;
- ne stockez jamais une clé Stripe secrète dans l’application ;
- appliquez RLS sur toutes les données client ;
- testez les accès avec plusieurs entreprises, boutiques et rôles avant la production.
