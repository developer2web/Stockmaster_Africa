# StockMaster — audit complet et feuille de route de lancement (12 septembre 2026)

Rôle : revue transverse de l'ensemble du projet (code, migrations, fonctions Edge,
trois sites web, tests, documentation) en vue d'un lancement en moins de six
semaines. Ce document complète — sans les remplacer — les audits déjà présents
dans `docs/` (30 août, 2 septembre, 10 septembre, 12 septembre). Chaque constat
ci-dessous a été vérifié directement dans le code au moment de l'audit, avec sa
référence de fichier.

## 1. Ce qui a été vérifié en direct pendant cette revue

| Contrôle | Résultat |
| --- | --- |
| `tsc --noEmit` | PASS |
| `expo lint` | PASS |
| `vitest run` | PASS — 219/219 tests, 41 fichiers |
| `npm audit --omit=dev` | 28 avis, tous transitifs à l'outillage Expo/Metro, tous nécessitant Expo 57 pour être résolus (confirmé dans `docs/security/2026-09-10-dependencies.json`) |
| Docker local | indisponible pendant cette session → **la suite pgTAP (13 fichiers) n'a pas pu être rejouée** ; l'analyse RLS ci-dessous vient de la lecture directe des migrations, pas d'une exécution |
| `dev` vs `main` | `dev` est 20 commits en avance, 0 en retard : `main` n'a pas reçu les correctifs de sécurité du 10 et du 12 septembre |
| Répertoire de travail | 61 fichiers modifiés/nouveaux non commités (série du 12 septembre : facturation email, notifications monitoring admin, accès lecture seule) |

## 2. Carte de l'architecture

Quatre surfaces, un seul backend Supabase :

- **App métier** (`src/`) : Expo Router, Admin + Employé, mobile et web.
- **`apps/account-web`** : portail propriétaire (facturation, sécurité du compte, 2FA).
- **`apps/admin-web`** : portail Super Admin plateforme (entreprises, utilisateurs, configuration email/paiement, erreurs).
- **`apps/public-web`** : site public, mentions légales, CGU, suppression de compte.
- **Supabase** : Postgres/RLS (119 migrations), Auth, Storage, Realtime, 10 fonctions Edge Deno (`supabase/functions/`).

Chaque portail vérifie le rôle côté client juste après connexion (ex.
`apps/admin-web/src/main.tsx:64` exige `role === 'super_admin'` puis déconnecte
sinon) — mais l'autorité réelle reste côté serveur (RLS + RPC), ce qui est le
bon modèle : une vérification client peut être contournée, une politique RLS non.

## 3. Sécurité et modèle de permissions — points forts vérifiés

- **RLS sur les 28 tables métier centrales** appliquée par une boucle
  générique (`supabase/migrations/202607200001_phase1_schema.sql:116-126`) qui
  crée systématiquement 4 politiques (select/insert/update/delete) basées sur
  `belongs_to_company()` + `has_permission()`. Ce style DRY réduit le risque
  d'oublier une table — vérifié en confrontant la liste des tables créées à la
  liste des tables couvertes par la boucle.
- **Faille d'élévation de privilège du 10 septembre corrigée dans le code
  local** : `supabase/migrations/202609100001_security_privileges.sql`
  révoque le `GRANT UPDATE` global sur `profiles`, ne laisse que
  `full_name`/`avatar_url` modifiables par le titulaire, et déplace les
  privilèges plateforme vers des fonctions `security definer` dédiées
  (`is_company_admin`, `get_lifetime_net_profit`, `can_read_product_cost`).
  **Non confirmé comme déployé sur le projet Supabase réellement public.**
- **Confidentialité du coût d'achat produit** : vues dédiées
  `product_costs`/`product_variant_costs` filtrées par `can_read_product_cost()`
  (`supabase/migrations/202609120003_product_cost_views_compatibility.sql`),
  remplaçant le simple masquage côté interface qui avait été identifié comme
  contournable.
- **MFA** : le challenge `aal2` est vérifié avant tout chargement de
  l'espace de travail dès qu'un facteur est enrôlé
  (`src/features/auth/mfaAccess.ts`, utilisé dans
  `src/features/auth/AuthProvider.tsx:120-126`). Elle reste **facultative** —
  seul un compte qui a lui-même activé un second facteur y est soumis. Décision
  du 12 septembre : la rendre obligatoire pour Super Admin + propriétaires est
  validée en principe, mais **la mise en œuvre est mise en pause** à la
  demande explicite du propriétaire — ne pas l'implémenter tant qu'un nouveau
  feu vert n'a pas été donné.
- **Paiements** : idempotence bout en bout — clé d'opération UUID, upsert
  `ignoreDuplicates`, comparaison stricte de la requête rejouée
  (`supabase/functions/_shared/paymentOperation.ts`), claim/release atomique
  autour de l'appel prestataire, statuts terminaux jamais rétrogradés,
  vérification HMAC en temps constant pour les deux types de webhook (Stripe
  et générique) dans `supabase/functions/payment-webhook/index.ts`.
- **Hors ligne** : file d'opérations et caches chiffrés — XChaCha20-Poly1305
  (clé dans SecureStore) sur mobile, AES-GCM (clé non exportable IndexedDB) sur
  web, avec migration automatique des anciennes données non chiffrées
  (`src/services/storage/encryptedStorage.ts`). File sérialisée pour éviter les
  courses, filtrage par utilisateur pour un appareil partagé
  (`src/features/offline/queue.ts`).
- **En-têtes web** : CSP avec empreintes SHA-256 (pas de `unsafe-inline`),
  HSTS, `nosniff`, cadrage iframe/objets — générés après chaque build
  (`scripts/security-headers.cjs`, détaillé dans
  `docs/security/web-hosting.md`).
- **Qualité du code** : 0 `any`, 0 `TODO/FIXME`, 1 seul `console.log` résiduel,
  fichiers de taille raisonnable (max. 700 lignes). Rare à ce stade d'un projet.

## 4. Ce qui bloque encore un lancement — vérifié dans le code, pas seulement dans les docs

| # | Constat | Preuve | Impact |
| --- | --- | --- | --- |
| 1 | Identité légale toujours en placeholder | `apps/public-web/privacy/index.html:3`, `apps/public-web/src/main.tsx:151` (« Informations légales à compléter avant publication »), `.env.example` champs `EXPO_PUBLIC_LEGAL_*`/`VITE_LEGAL_*` vides | Bloquant légal — confirmé actif dans le HTML livré, pas seulement documenté |
| 2 | Aucun prestataire Mobile Money de production configuré | `supabase/functions/_shared/payment.ts:153-156` lève une erreur si `PAYMENT_PROVIDER_URL` absent et le sandbox désactivé | Les paiements Mobile Money réels sont impossibles tant qu'un prestataire n'est pas choisi et branché |
| 3 | Correctifs de sécurité du 10/12 septembre non confirmés déployés en production, et non fusionnés sur `main` | `docs/security/2026-09-10-deployment.md` ; `git log origin/main..origin/dev` = 20 commits | Le risque d'élévation de privilège documenté pourrait rester actif sur l'environnement réellement public |
| 4 | Conflit de version Node non résolu | `docs/security/web-hosting.md:51` : `@supabase/supabase-js` 2.110.7 exige Node ≥22 depuis la 2.110.0, alors que `package.json` impose `>=20.19.0 <21` et `AGENTS.md` fige Node 20/Expo 54 | Écart entre l'environnement de dev réel (Node 26 observé le 10/09) et l'engagement `engines`, à trancher explicitement |
| 5 | Aucune sauvegarde/restauration jamais testée | `docs/production-readiness.md`, `docs/launch-readiness-audit-2026-08-30.md` ligne « Restauration testée : FAIL » | RPO/RTO inconnus ; risque opérationnel majeur en cas d'incident réel |
| 6 | Aucun build natif de distribution testé sur appareil réel | même audit, ligne « Builds Android/iOS de distribution : FAIL » | Aucune validation Android/iOS réelle à ce jour |
| 7 | Couverture E2E hors ligne quasi nulle | `.maestro/` ne contient qu'un seul `smoke.yaml` | Les scénarios de coupure/reprise réseau restent uniquement validés par lecture de code et tests unitaires, pas de bout en bout |
| 8 | Aucun pilote réel réalisé | tous les audits datés le confirment | Aucune validation utilisateur réelle avant un lancement public |
| 9 | 4 avis npm résiduels à réexaminer avant le 10 octobre 2026 | `docs/security/web-hosting.md:49` | Échéance déjà fixée par le projet lui-même, à ne pas manquer |
| 10 | 61 fichiers non commités, dont des migrations de sécurité/facturation | `git status` | Rien de tout le travail du 12 septembre n'est encore versionné de façon récupérable ailleurs que sur ce poste |

## 5. Feuille de route à 6 semaines (12 septembre → 24 octobre 2026)

Le chemin critique n'est pas le code (qui est déjà en bon état) mais trois
délais externes : le choix + l'intégration d'un prestataire Mobile Money, la
validation Apple Developer (~1 semaine), et l'identité légale (dépend de
démarches administratives). Le planning ci-dessous part du principe que ces
trois pistes démarrent **en parallèle dès la semaine 1**.

### Semaine 1 (12–18 sept.) — Vérifier la réalité, pas les hypothèses
- Relancer Docker localement → `supabase start`, `db reset --local`, `db lint --local`, `test db` : confirmer que les 13 suites pgTAP passent sur une base rejouée de zéro.
- Vérifier l'état réellement déployé (`supabase migration list --linked`) sur le projet Supabase de production/staging et appliquer les migrations manquantes du 10 et du 12 septembre.
- Committer, pousser les 61 fichiers en cours après relecture, puis fusionner `dev` → `main` une fois la CI verte à nouveau.
- Trancher le conflit Node 20/22 (constat #4).

### Semaine 2 (19–25 sept.) — Paiements
- Décision du 12 septembre : **Orange Money manuel + Stripe** pour le lancement — pas d'agrégateur Mobile Money tiers, donc pas d'intégration `PAYMENT_PROVIDER_URL` générique à construire.
- Configurer Stripe en clés de production, tester en mode test complet : succès, échec, expiration, annulation, rejeu.
- Reconfirmer le parcours Orange Money manuel de bout en bout (déclaration, preuve, validation Super Admin, reçu).
- Tester Basic → Pro → Premium, renouvellement, période de grâce, expiration.

### Semaine 3 (26 sept.–2 oct.) — Builds natifs et continuité
- Premier build EAS `preview` Android installé et testé sur un appareil réel.
- Lancer/valider le compte Apple Developer ; démarrer le build iOS.
- Exercice réel de sauvegarde/restauration sur un projet Supabase isolé ; mesurer RPO/RTO.
- MFA obligatoire (Super Admin + propriétaires) : décision prise le 12 septembre, mise en œuvre en pause à la demande du propriétaire — à reprendre seulement sur nouveau feu vert explicite.

### Semaine 4 (3–9 oct.) — Passe QA fonctionnelle complète
- Matrice propriétaire/employé mono- et multi-boutique/multi-entreprise sur comptes réels.
- Scénarios hors ligne (coupure/reprise) sur Android et iOS réels.
- Passe responsive/visuelle sur les quatre surfaces.

### Semaine 5 (10–16 oct.) — Légal, store listing, pilote
- Intégrer l'identité légale réelle (raison sociale, RCCM/NIF, adresse, emails) dès qu'elle est disponible ; republier les quatre sites.
- Réexaminer les 4 avis npm résiduels (échéance du 10 octobre, constat #9).
- Préparer les fiches store (`docs/store-listing.md`).
- Pilote limité avec 1 à 2 boutiques réelles ; corriger les blocages remontés.

### Semaine 6 (17–23 oct.) — Durcissement et lancement
- Corriger les retours du pilote.
- Builds EAS de production Android + iOS, soumission aux stores.
- Repasser `docs/launch-checklist-v1.md` et `docs/release-checklist.md` en entier.
- Décision de lancement.

## 6. Limites de cette revue

Docker et les identifiants Supabase distants n'étaient pas disponibles pendant
cette session : l'état de la base de données a été analysé par lecture directe
des 119 migrations (avec vérification croisée pour éviter les faux positifs
d'une recherche textuelle naïve — voir la boucle RLS en section 3), pas par
exécution. Aucun appel réseau externe (Stripe, Supabase, GitHub Actions,
prestataire Mobile Money) n'a été effectué. Ce document ne remplace donc pas
une exécution réelle de la CI, des tests pgTAP et d'un déploiement de test.
