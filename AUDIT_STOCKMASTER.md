# 🔍 Audit complet — StockMaster (Expo + Supabase)

Application de gestion de stock multi-entreprises / multi-boutiques avec 3 rôles
(super-admin, admin entreprise, employé), ventes, caisse, dépenses, rapports,
abonnements Mobile Money.

**État général : code sain et bien architecturé.**
- ✅ TypeScript (`tsc --noEmit`) : 0 erreur
- ✅ ESLint : 0 vraie erreur (5 faux positifs, voir #12)
- ✅ RLS multi-tenant solide, RPC atomiques, idempotence par `operation_id`
- ✅ Gestion des permissions caméra exemplaire (scanner)

Les points ci-dessous sont classés par gravité.

---

## 🔴 BUGS / PROBLÈMES BLOQUANTS (P0)

### 1. Fuite des données financières aux employés (sécurité — CONFIRMÉ)
Les RLS de Supabase sont **au niveau ligne, pas colonne**. Un employé ayant
`products.read` (indispensable pour vendre) peut lire **toutes les colonnes** :
- `products.purchase_price` (prix d'achat)
- `sale_items.purchase_price_snapshot` et `sale_items.gross_profit`
- `sales.cost_total`, `sales.gross_profit`

L'interface les masque (`!employee`), mais un employé peut les récupérer par une
**requête Supabase directe** ou en inspectant le trafic réseau.
De plus, `src/features/sales/api.ts → getSaleStock()` **envoie explicitement
`purchase_price` au client employé** (ligne 34).

➡️ C'est exactement le trou noté dans `todo.txt` : la migration `010`
(`wip-financial-column-security-010`) n'a **jamais été déployée**.
**Correctif** : exposer le catalogue de vente via une RPC/vue `security definer`
qui n'inclut pas les colonnes de coût pour les non-admins + déployer le lot 010.

### 2. Paiement Mobile Money non finalisé (production)
`supabase/functions/_shared/payment.ts` ne fonctionne qu'en **mode sandbox**.
En production il manque : prestataire choisi, `PAYMENT_PROVIDER_URL`,
`PAYMENT_WEBHOOK_SECRET`, `PAYMENT_PROVIDER_API_KEY`. Tant que ce n'est pas
configuré, **aucun abonnement ne peut être payé réellement** → les entreprises
restent bloquées sur l'écran abonnement. (La vérification de signature du webhook
est correcte, HMAC-SHA256 + comparaison à temps constant.)

---

## 🟠 BUGS FONCTIONNELS (P1)

### 3. Texte corrompu (mojibake) affiché à l'utilisateur
`src/features/sales/api.ts`, lignes 70-73 : les messages d'erreur sont en
double-encodage UTF-8 et s'affichent cassés :
- « SÃ©lectionnez une boutique... »
- « Toutes les quantitÃ©s doivent Ãªtre supÃ©rieures Ã  zÃ©ro. »
➡️ Remplacer par « Sélectionnez… », « Toutes les quantités doivent être
supérieures à zéro. » (fichier isolé, un seul concerné).

### 4. Séparateur décimal virgule cassé (marché francophone/africain)
Les champs numériques utilisent `Number(value)` avec `keyboardType="decimal-pad"` :
- Quantité de vente : `src/app/(admin)/sales/new.tsx` L109 + version employé
- Montant caisse/dépense : `src/app/(admin)/cash.tsx` L43/L53
Sur un clavier FR, l'utilisateur tape « 1,5 » → `Number("1,5")` = `NaN` → quantité
mise à 0 (article retiré) ou bouton « Confirmer » qui reste grisé sans explication.
➡️ Normaliser la saisie (`value.replace(',', '.')`) avant `Number()`.

### 5. `DashboardScreen.tsx` = code mort / écran placeholder
`src/features/dashboard/DashboardScreen.tsx` affiche « Phase 1 opérationnelle »,
« Les données métier arrivent à partir de la Phase 2 » et des stats « — ».
Il n'est **importé nulle part** (le vrai tableau de bord admin est
`app/(admin)/index.tsx`). À supprimer, ou à finir si un dashboard KPI est voulu.

### 6. Migrations non déployées → base ≠ code
- `202608020012_simplify_default_employee_roles.sql` (P1) pas encore appliquée
- `wip-financial-column-security-010` conservée en stash
➡️ Risque d'appeler des RPC absentes en production. Aligner base et code.

---

## 🟡 ROBUSTESSE / PERFORMANCE (P2)

### 7. Rafraîchissement d'accès redondant (batterie / réseau)
`src/features/auth/AuthProvider.tsx` combine **3 déclencheurs** de
`refreshMembership()` : `setInterval` toutes les **60 s**, abonnements realtime
(memberships + companies) **et** refresh à chaque retour au premier plan.
Sur réseau mobile faible (marché cible) → requêtes superflues, re-renders,
consommation batterie. ➡️ Garder realtime + refetch onFocus, retirer le polling
60 s (ou l'espacer fortement).

### 8. `getSaleStock()` non paginé
Charge **tout** le stock d'un coup et fait un `find()` O(n×m) pour croiser
produits ↔ niveaux de stock. Lent sur gros catalogues. ➡️ Paginer / faire le
jointure côté SQL (RPC dédiée).

### 9. Formatage monétaire figé sur `fr-CA`
`CurrencyProvider` et les exports forcent la locale `fr-CA` quel que soit le pays
(ex. Guinée / GNF affiché au format canadien). ➡️ Locale dérivée du pays.

---

## 🔵 QUALITÉ / CONVENTIONS (P3)

### 10. Aucun `testID` dans toute l'application
Rend les tests E2E automatisés (Maestro/Playwright) difficiles. ➡️ Ajouter des
`testID` kebab-case sur les éléments interactifs clés.

### 11. Aucune gestion explicite de `SafeArea`
0 `SafeAreaView` / `useSafeAreaInsets`. Le haut est géré par `Appbar.Header`
(react-native-paper), mais le **bas** (home indicator iPhone récents) peut rogner
les boutons flottants / derniers éléments. ➡️ Ajouter l'inset bas.

### 12. Config ESLint : 5 faux positifs
`npx eslint .` remonte 5 erreurs `import/no-unresolved` sur les imports Deno
`npm:@supabase/supabase-js@2` des **Edge Functions**. Ce n'est pas un vrai bug
(Deno gère ces specifiers). ➡️ Ignorer `supabase/functions` dans la config ESLint.
+ 1 warning `import/first` dans `tests/operationId.test.ts`.

### 13. `console.*` résiduels (3 occurrences) — mineur, nettoyer.

### 14. `.env.example` contient l'URL du projet + clé `sb_publishable_...`
La clé publishable est publique par nature (pas une fuite critique), mais mieux
vaut y mettre des placeholders pour éviter toute confusion.

---

## 💡 AMÉLIORATIONS RECOMMANDÉES (au-delà des bugs)

1. **Sécurité colonne financière** : vues/RPC filtrant les coûts pour non-admins (résout #1).
2. **Mode hors-ligne** : file d'attente ventes/caisse (les `operation_id`
   d'idempotence existent déjà → parfait pour une synchro offline sur réseau instable).
3. **Ticket de vente / reçu imprimable** (en plus du rapport financier PDF/Excel déjà présent).
4. **Vrai tableau de bord** avec KPIs temps réel (remplacer #5).
5. **Multi-langue** (fr + langues locales) et devise correcte par pays (#9).
6. **Finaliser paiement** : prestataire réel + remboursements + rapprochement (#2).
7. **Réduire le polling** d'accès (#7) et **paginer** le catalogue de vente (#8).

---

### Récapitulatif priorités
| # | Sévérité | Sujet | Fichier principal |
|---|----------|-------|-------------------|
| 1 | 🔴 P0 | Fuite données financières employés | RLS + `features/sales/api.ts` |
| 2 | 🔴 P0 | Paiement non finalisé | `functions/_shared/payment.ts` |
| 3 | 🟠 P1 | Texte mojibake | `features/sales/api.ts` |
| 4 | 🟠 P1 | Décimale virgule cassée | `sales/new.tsx`, `cash.tsx` |
| 5 | 🟠 P1 | Écran placeholder mort | `dashboard/DashboardScreen.tsx` |
| 6 | 🟠 P1 | Migrations non déployées | `supabase/migrations` |
| 7 | 🟡 P2 | Polling accès redondant | `auth/AuthProvider.tsx` |
| 8 | 🟡 P2 | Catalogue vente non paginé | `features/sales/api.ts` |
| 9 | 🟡 P2 | Locale monétaire figée | `currency/CurrencyProvider.tsx` |
| 10-14 | 🔵 P3 | testID / SafeArea / ESLint / logs / env | divers |

---

# 🎨 AUDIT DESIGN (UI/UX)

Base : react-native-paper (Material Design 3), thème vert émeraude/teal, light + dark complets.

## Points forts
- Thème cohérent, mode sombre complet, identité violette distincte pour l'espace employé (bonne séparation admin/employé).
- Responsive (breakpoints compact/wide, `maxWidth` centré) → OK tablette + web.
- Écran d'authentification soigné (orbes animés, apparition en fondu).
- Bons composants réutilisables : MetricCard, Ranking, StatCard, EmptyState, ErrorState, AdminPage, ProductThumbnail avec placeholder.

## À améliorer
1. **Pas de barre d'onglets (bottom tabs)** : tout passe par le dashboard + menu « hamburger ». Avec 4 zones clés (Ventes / Inventaire / Caisse / Rapports), une **bottom tab bar** rendrait l'accès bien plus rapide au pouce. Actuellement il faut revenir au dashboard pour changer de module.
2. **Contraste dark mode sur le hero admin** : texte blanc sur `theme.colors.primary` qui vaut `#63E6BE` (vert clair) en sombre → lisibilité faible. Utiliser `onPrimary`/couleur foncée.
3. **Quantités en `.toFixed(3)`** → « Stock 5.000 » s'affiche pour des articles à l'unité. Afficher les décimales seulement si nécessaire.
4. **Dates saisies en texte** (`AAAA-MM-JJ` dans les rapports personnalisés) au lieu d'un vrai sélecteur de date → erreurs de saisie fréquentes.
5. **Pas de graphiques** : les rapports n'ont que des `ProgressBar`. Ajouter des courbes/barres (victory-native / react-native-gifted-charts) pour visualiser les tendances de ventes/bénéfices.
6. **Pas de pull-to-refresh** (RefreshControl) sur les listes (produits, ventes, caisse) — geste mobile attendu.
7. **SafeArea bas** non gérée (rappel P3 #11) — le FAB/boutons collent au bas sur iPhone récents.
8. Emojis décoratifs dans le texte (« Bonjour 👋 ») — acceptable, mais les guidelines recommandent de s'appuyer sur les icônes.

---

# 🗃️ AUDIT DONNÉES (modèle) — présent vs à ajouter

Modèle déjà riche : companies, stores, memberships, roles/permissions, products, variants, categories, suppliers, stock_levels, stock_movements, sales/sale_items, cash_transactions, expenses, plans/features, subscriptions, payment_transactions, currency_exchange_rates, audit… ✅

## Données présentes mais sous-exploitées / manquantes
1. **Clients / CRM absents** : `sales.customer_id` existe mais toujours `null`, et il n'y a **aucune table clients**. → Module Clients (fidélité, historique, **crédit/ardoise** — très courant en Afrique de l'Ouest).
2. **Pas d'achats / réceptions fournisseurs** : les permissions `purchases.read` existent, mais pas de module de commande/réception liant coût et stock. Le stock s'ajuste à la main.
3. **Remises désactivées** : le schéma gère `discount` mais l'UI le force à 0. À réactiver proprement.
4. **Pas de TVA/taxes** : aucune notion de taxe → limite la facturation formelle.
5. **Pas d'unité de mesure** (kg, L, pièce) alors que les quantités sont décimales → affichage « 5.000 » ambigu.
6. **Reçu/ticket client** : seulement un rapport financier PDF/Excel ; pas de ticket de caisse imprimable par vente.
7. **Alertes stock faible** : `low_stock_threshold` existe mais pas d'écran d'alertes proactif.
8. **Taux de change secondaire** saisi à la main, pas de mise à jour automatique.
9. **Étiquettes code-barres/QR imprimables** : les codes existent, la génération d'étiquettes serait un vrai plus.

---

# 🧩 AUTRES OBSERVATIONS
- **Idempotence prête** (`operation_id` partout) → base parfaite pour un **mode hors-ligne** (marché à connexion instable).
- **Realtime** utilisé pour les accès → à étendre au stock/ventes pour du temps réel multi-caisses.
- **Exports PDF/Excel** déjà solides (feuilles multiples, formules Excel).
- **Sécurité** globalement très soignée (RPC atomiques, RLS, signature webhook) — le seul vrai trou reste le filtrage colonne financière (#1).

---

# ✅ CORRECTIONS APPLIQUÉES (Phase 1 — sûres, vérifiées par TypeScript)

Toutes dans `/app/stockmaster_src` (ton code) :

1. **Texte cassé (mojibake)** corrigé — `src/features/sales/api.ts` (« Sélectionnez… », « Toutes les quantités doivent être supérieures à zéro. »).
2. **Virgule décimale** — nouvel util `src/utils/number.ts → parseDecimal()` (gère « 1,5 » et « 1 250,75 »), appliqué à :
   - Quantité de vente (`sales/new.tsx`)
   - Montant caisse (`cash.tsx`)
   - Dépenses (`schemas/reports.ts`, `expensesApi.ts`)
   - Mouvements de stock (`schemas/inventory.ts`, `inventory/api.ts`, `StockAdjustmentDialog.tsx`)
   - Prix produits/variantes (`schemas/catalog.ts`, `products/api.ts`)
3. **Écran mort supprimé** — `src/features/dashboard/DashboardScreen.tsx` (n'était utilisé nulle part).
4. **Contraste mode sombre** — bannière du tableau de bord admin sur fond vert de marque constant (`#087F5B`), texte blanc lisible dans les 2 thèmes.
5. **Fuite financière côté client (volet frontend du #4)** — `getSaleStock()` n'envoie plus le prix d'achat/coût au téléphone des employés (paramètre `includeCost`, forcé à `false` pour les employés). Le calcul du bénéfice reste côté serveur.

> ⚠️ Le **volet base de données du #4** (empêcher un employé de lire les colonnes
> financières par requête Supabase directe) nécessite une **migration SQL** à
> déployer sur ton Supabase (protection au niveau colonne + RPC admin). Non
> appliqué encore car cela doit être testé sur ta base pour ne pas casser les
> lectures admin.

---

# ✅ CHANTIERS #4 / #3 / #2 IMPLÉMENTÉS (à déployer + tester sur ton Supabase)

Vérifié : `tsc --noEmit` ✅ + `eslint` ✅. Non exécuté (nécessite tes clés Supabase).
Guide complet : `/app/DEPLOY_GUIDE_STOCKMASTER.md`.

## #4 — Faille financière
- Migration `supabase/migrations/202608100001_financial_column_privacy.sql` :
  helper `is_company_admin`, révocation des colonnes `cost_total`/`gross_profit`
  (ventes) et `purchase_price_snapshot`/`gross_profit` (lignes de vente) pour
  les comptes `authenticated`, vues admin `sale_financials` / `sale_item_financials`.
- Frontend rebranché : `getSales`, `getSale`, `getFinancialDetails` lisent les
  financials via les vues (admin uniquement).

## #3 — Barre d'onglets (admin)
- `(admin)/_layout.tsx` transformé en `Tabs` : Accueil, Ventes, Stock, Caisse,
  Rapports ; autres modules accessibles via le menu (masqués de la barre).
- Stacks imbriqués ajoutés : `(admin)/sales/_layout.tsx`, `(admin)/products/_layout.tsx`,
  `(admin)/customers/_layout.tsx`.

## #2 — Clients + ardoise + historique
- Migration `supabase/migrations/202608100002_customers_ardoise.sql` :
  tables `customers` + `customer_ledger`, RPC atomique `record_customer_entry`,
  vue `customer_balances`, FK `sales.customer_id → customers`.
- Frontend : `features/customers/api.ts`, `schemas/customers.ts`, écrans
  `customers/` (liste, création, fiche avec solde d'ardoise, dette/paiement,
  historique d'achat, édition), entrée « Clients » dans le menu admin, et
  sélection facultative d'un client sur l'écran de vente.
