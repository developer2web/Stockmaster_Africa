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
