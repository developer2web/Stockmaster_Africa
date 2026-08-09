# 🚀 Guide de déploiement & test — StockMaster (chantiers #2, #3, #4)

Tout le code est dans `/app/stockmaster_src`. Je n'ai pas pu exécuter l'app ici
(elle a besoin de tes clés Supabase), donc **à tester chez toi** après déploiement.
Vérifié de mon côté : `tsc --noEmit` ✅ et `eslint` ✅ sur tous les fichiers modifiés.

---

## 1. Déployer les 2 migrations SQL (dans l'ordre)

Fichiers ajoutés dans `supabase/migrations/` :
1. `202608100001_financial_column_privacy.sql`  (chantier #4)
2. `202608100002_customers_ardoise.sql`          (chantier #2 — dépend de la #1)

Déploiement :
```bash
supabase db push
```
> ⚠️ Déploie les migrations **ET** la nouvelle version de l'app en même temps :
> la #4 retire aux employés le droit de lire les colonnes coût/bénéfice des ventes,
> et l'app lit désormais ces valeurs via les vues `sale_financials` /
> `sale_item_financials`. Ancienne app + nouvelle base = erreur "permission denied".

## 2. Checklist de test

### #4 Sécurité financière
- [ ] **Admin** : l'historique des ventes et le détail d'une vente affichent toujours coût/bénéfice.
- [ ] **Admin** : export PDF/Excel des rapports contient toujours le bénéfice.
- [ ] **Employé** : écran de vente OK, mais aucune donnée de coût/bénéfice.
- [ ] **Employé** (test technique) : `select cost_total from sales` via l'API Supabase → doit renvoyer *permission denied for column* (c'est le but).
- [ ] **Employé** : `select * from sale_financials` → renvoie **0 ligne**.

### #3 Barre d'onglets (admin)
- [ ] 5 onglets en bas : Accueil, Ventes, Stock, Caisse, Rapports.
- [ ] Ventes → ouvrir une vente → revenir : la navigation reste dans l'onglet.
- [ ] Menu (☰) de l'accueil : Produits, **Clients**, Catégories, etc. s'ouvrent bien.
- [ ] Scanner depuis l'écran de vente fonctionne toujours.

### #2 Clients + ardoise
- [ ] Créer un client (menu → Clients → +).
- [ ] Fiche client : « Ajouter une dette » puis « Encaisser un paiement » → le solde de l'ardoise se met à jour.
- [ ] Écran de vente : sélectionner un client (facultatif) → valider la vente → la vente apparaît dans « Historique d'achat » du client.
- [ ] Employé disposant de `sales.write` : peut lire/ajouter des clients ; sinon lecture seule.

## 3. Notes / limites connues
- **Vente « à crédit » automatique** non incluse : la fonction `create_sale`
  n'accepte pas encore le mode de paiement `credit`. Pour l'instant l'ardoise se
  gère manuellement depuis la fiche client (bouton « Ajouter une dette »).
  Évolution possible : ajouter `credit` à `create_sale` + créer l'écriture
  d'ardoise dans la même transaction.
- **Prix d'achat produit** : toujours visible pour les employés ayant
  `products.write` (ils éditent le catalogue). Verrouillage possible via une
  permission dédiée `products.read_cost` (section optionnelle commentée dans la
  migration #4).
