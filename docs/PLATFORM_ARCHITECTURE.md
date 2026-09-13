# Architecture StockMaster

StockMaster reste dans un dépôt unique avec quatre surfaces indépendantes :

- application Expo SDK 54 à la racine : opérations métier des propriétaires et employés ;
- `apps/admin-web` : administration globale réservée aux Super Admins ;
- `apps/account-web` : compte, abonnement, paiements et sécurité des propriétaires ;
- `apps/public-web` : présentation, tarifs, inscription et connexion.

Les quatre surfaces utilisent le même projet Supabase. La séparation d’interface ne remplace jamais la sécurité serveur : chaque lecture et mutation sensible doit rester protégée par RLS ou par une RPC vérifiant le rôle.

## Développement local

Copier `.env.example` vers `.env`, puis renseigner les variables Expo et Vite avec le même projet Supabase.

```powershell
npm.cmd run start
npm.cmd run web:admin
npm.cmd run web:account
npm.cmd run web:public
```

Les ports sont choisis par Vite. Ne jamais utiliser une clé `service_role` dans une application cliente.

## Builds

```powershell
npm.cmd run build:web:all
```

Les résultats sont produits dans `dist/admin-web`, `dist/account-web` et `dist/public-web`.

## Domaines cibles

- `stockmaster.africa` : site public ;
- `app.stockmaster.africa` : application métier ;
- `account.stockmaster.africa` : portail propriétaire ;
- `admin.stockmaster.africa` : Super Administration.

## Ordre de migration

1. Valider les portails web sur un environnement Supabase de staging.
2. Tester les rôles Super Admin, propriétaire et employé.
3. Déployer Admin Web et Account Web sans retirer les écrans Expo existants.
4. Faire utiliser les portails pendant une période de transition.
5. Retirer les pages Super Admin du bundle mobile seulement après validation complète.
6. Rediriger la gestion détaillée de l’abonnement vers Account Web.

Cette transition progressive évite de rendre l’application inutilisable si un portail ou un domaine n’est pas encore disponible.
