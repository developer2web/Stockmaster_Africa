# StockMaster V1 — audit de préparation au lancement

Date de l'audit : 30 août 2026
Référence : `StockMaster_V1_100_Percent_Launch_Spec.pdf`
Décision actuelle : **NO-GO — lancement public bloqué**

Cette décision ne signifie pas que l'application est inutilisable. Les compilations et les tests automatisés disponibles passent. Le lancement public reste bloqué tant que les contrôles distants, juridiques, de sauvegarde et sur appareils réels n'ont pas produit de preuve vérifiable.

## Preuves automatiques exécutées

| Contrôle | Résultat | Preuve |
| --- | --- | --- |
| TypeScript | PASS | `npm run typecheck` |
| Lint Expo | PASS | `npm run lint -- --quiet` |
| Tests unitaires | PASS | 10 fichiers, 40 tests |
| Site Super Admin | PASS | build Vite de `apps/admin-web` |
| Site Account | PASS | build Vite de `apps/account-web` |
| Site public | PASS | build Vite de `apps/public-web` |
| Tests Supabase pgTAP | NON EXÉCUTÉ | fichiers présents, CLI Supabase indisponible localement pendant l'audit |
| Expo Doctor | NON EXÉCUTÉ | outil non disponible hors ligne pendant l'audit |
| Android/iOS réels | NON EXÉCUTÉ | aucun appareil ou build de distribution relié à cette session |

## Périmètre et séparation des espaces

| Exigence | État | Observation |
| --- | --- | --- |
| Application métier Admin/Employé | PASS | routes mobiles séparées et gardes de rôle présentes |
| Portail Account séparé | PASS | application web distincte dans `apps/account-web` |
| Super Admin séparé | PASS | application web distincte dans `apps/admin-web`; aucune page métier Super Admin mobile |
| Refus d'un Super Admin dans l'app métier | PASS | l'app mobile bloque ce rôle et renvoie vers le portail séparé |
| Changement multi-entreprises/multi-boutiques | PASS STATIQUE | sélecteurs et contexte d'espace présents; scénario réel à rejouer |

## Sécurité, rôles et isolation

| Exigence | État | Observation |
| --- | --- | --- |
| RLS entreprise et boutique | PASS STATIQUE | fonctions/politiques et tests pgTAP d'isolation présents |
| Permissions côté serveur | PASS STATIQUE | fonctions `has_permission`, `can_access_store` et RPC protégées présentes |
| Employé incapable de changer son rôle | PASS STATIQUE | politiques et déclencheurs dédiés présents |
| Admin incapable de créer un Super Admin | PASS STATIQUE | séparation du rôle plateforme dans le backend |
| Désactivation prise en compte rapidement | PASS STATIQUE | rafraîchissement périodique + Realtime + contrôle RLS |
| Exports soumis aux mêmes droits | À REJOUER | code protégé par contexte, mais matrice réelle non exécutée |
| Nettoyage d'une connexion refusée | PASS | la session locale est supprimée après échec de vérification du portail |
| Confirmation d'email | PARTIEL | parcours et messages présents; réglage Supabase Auth distant à vérifier |
| Protection brute force | NON VÉRIFIÉ | dépend des réglages Auth/infrastructure distants |
| 2FA Super Admin obligatoire | RISQUE ACCEPTÉ | non imposée automatiquement selon la demande explicite du propriétaire; activation manuelle disponible |
| Historique et déconnexion globale | PASS STATIQUE | écrans Account/mobile et événements de sécurité présents |
| Codes de récupération 2FA | FAIL | aucun parcours de codes de récupération vérifié |

## Parcours métier critiques

| Exigence | État | Observation |
| --- | --- | --- |
| Vente atomique et stock | PASS STATIQUE | RPC transactionnelle et test pgTAP d'idempotence présents |
| Double-clic / resynchronisation | PASS STATIQUE | identifiant d'opération unique côté client et serveur |
| Vente à crédit / dette client | PASS STATIQUE | modèles, RPC et tests pgTAP présents |
| Achats / dette fournisseur / règlement partiel | PASS STATIQUE | modèles, UI et tests pgTAP présents |
| Caisse, ouverture et clôture répétée | PASS STATIQUE | session, fonds initial, transactions et clôtures présents |
| Remboursement | PASS STATIQUE | parcours dédié et identifiant d'opération unique |
| Mouvements de stock et inventaires | PASS STATIQUE | fonctions dédiées, motifs et journalisation présents |
| Reçus personnalisés | PASS STATIQUE | configuration par boutique et génération présentes; impression réelle à rejouer |
| Mode hors ligne | PARTIEL | cache produits/clients et file ventes/dépenses/caisse présents; tests E2E de coupure et reprise réseau manquent |

## Abonnements, paiements et doublons

| Exigence | État | Observation |
| --- | --- | --- |
| Limites Basic/Pro/Business | PASS STATIQUE | 1/1/2, 1/5/15 et 10/20/100 configurés (entreprises/boutiques/employés) |
| Fonctionnalités par forfait | PASS STATIQUE | droits et déclencheurs serveur présents |
| Mode hors ligne sur les trois forfaits | PASS STATIQUE | migration présente; test pgTAP corrigé pour refléter cette règle |
| Essai 14 jours et un seul essai | PASS STATIQUE | migrations et contrôles d'éligibilité présents |
| Données conservées après expiration/downgrade | PASS STATIQUE | restrictions sans suppression prévues |
| Orange Money manuel | PASS STATIQUE | création en attente et validation Super Admin présentes |
| Stripe par webhook | PASS STATIQUE | fonctions et idempotence présentes; test sandbox réel à exécuter |
| Références de paiement uniques | PASS STATIQUE | contraintes et contrôles fournisseur/référence présents |
| Doublons techniques bloqués | PASS STATIQUE | ventes, paiements, invitations et appartenances couverts |
| Doublons commerciaux suspects | PARTIEL | contrôles d'identité présents; console complète de rapprochement non prouvée |

## Interface, responsive et performance

| Exigence | État | Observation |
| --- | --- | --- |
| Navigation simplifiée | PASS STATIQUE | menu métier principal et rubrique Plus |
| Dashboard limité | PASS STATIQUE | quatre KPI, contenu principal et alertes |
| Styles, statuts, montants et dates cohérents | PASS STATIQUE | composants/formatteurs partagés |
| Devise de secours | PASS | valeurs de secours corrigées de CAD/Canada vers GNF/Guinée |
| Pagination des ventes, produits et caisse | PASS | pagination incrémentale présente |
| Pagination de toutes les grandes listes | PARTIEL | certaines listes restent plafonnées côté client |
| Responsive web/mobile | PARTIEL | CSS et composants adaptatifs présents; matrice visuelle réelle non exécutée |
| Performance avec gros volumes | NON VÉRIFIÉ | index et limites présents, aucun test de charge documenté |

## Exploitation, conformité et lancement

| Exigence | État | Observation |
| --- | --- | --- |
| Journal d'audit immuable | PASS STATIQUE | table protégée et opérations sensibles journalisées |
| Logs d'erreur centralisés | PASS STATIQUE | journal structuré + RPC `log_app_error` |
| Alertes de production | PARTIEL | notifications métier présentes, aucune preuve d'alerte externe 24/7 |
| Sauvegardes automatiques | NON VÉRIFIÉ | réglage Supabase externe au dépôt |
| Restauration testée | FAIL | aucun procès-verbal de restauration |
| Mentions légales complètes | FAIL | raison sociale, RCCM/NIF, adresse, hébergeur et responsable restent à compléter |
| Politique de confidentialité/CGU | PARTIEL | pages présentes, identité juridique non finalisée |
| Pilote réel | FAIL | aucun compte rendu de pilote et aucune validation signée |
| Builds Android/iOS de distribution | FAIL | non produits et non testés dans cet audit |

## Corrections effectuées pendant cet audit

1. Remplacement des valeurs de secours `CA / Canada / CAD` par `GN / Guinée / GNF` dans le contexte mobile.
2. Remplacement du secours `CAD` par `GNF` dans le détail d'une vente.
3. Suppression de la session locale lorsqu'un portail ne peut pas confirmer le rôle après connexion.
4. Mise à jour du test pgTAP d'abonnement : le mode hors ligne est attendu sur les trois forfaits et les fonctions IA restent absentes.
5. Ajout des mouvements de caisse à la file hors ligne idempotente, avec confirmation différée clairement indiquée à l'utilisateur.

## Conditions minimales pour passer en GO

1. Appliquer toutes les migrations sur un projet Supabase de préproduction propre et exécuter les tests pgTAP avec succès.
2. Tester la matrice Admin/Employé/entreprises/boutiques sur deux comptes et deux entreprises réelles de test.
3. Exécuter les scénarios vente, crédit, fournisseur, caisse, remboursement, hors ligne et reprise réseau sur Android et iOS.
4. Vérifier Stripe en sandbox et Orange Money manuel de bout en bout, y compris reçus et doublons.
5. Activer et prouver les sauvegardes, puis réussir au moins une restauration contrôlée.
6. Remplir et faire valider les mentions légales, la confidentialité, les CGU et la politique de conservation.
7. Réaliser un pilote limité, corriger les incidents bloquants et obtenir une validation écrite.

Tant qu'un point bloquant reste sans preuve, le verdict demeure **NO-GO**. Une fonctionnalité ne doit être marquée PASS qu'après confirmation du serveur ou preuve d'exécution correspondante.
