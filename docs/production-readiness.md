# StockMaster — préparation de mise en production

## Environnements

Maintenir trois projets Supabase distincts :

- développement local ;
- staging ;
- production.

Ne jamais utiliser la base de production pour les tests automatisés. Les secrets
`service_role`, SMTP, prestataire de paiement et Expo restent exclusivement
dans les gestionnaires de secrets Supabase, EAS et GitHub.

## Contrôle avant livraison

1. Exécuter la CI sur la révision exacte à livrer.
2. Reconstruire une base vide et exécuter tous les tests pgTAP.
3. Appliquer les migrations en staging.
4. Tester les parcours propriétaire, employé mono-boutique, employé
   multi-boutiques et Super Admin.
5. Effectuer une vente, un rejeu avec la même clé d’idempotence, une dépense,
   une entrée et une sortie de stock.
6. Vérifier les montants GNF, XOF, XAF, CAD, USD et EUR.
7. Générer un build EAS `preview`, puis seulement un build `production`.

## Sauvegarde et restauration

- Activer les sauvegardes Supabase adaptées au plan de production.
- Avant une migration destructive, produire un dump logique et vérifier son
  horodatage, sa taille et son chiffrement.
- Restaurer régulièrement une sauvegarde dans un projet isolé.
- Mesurer le RPO et le RTO réels pendant cet exercice.
- Conserver les migrations et le commit applicatif correspondant à chaque
  livraison.

## Procédure d’incident

1. Suspendre les écritures concernées ou désactiver l’entreprise touchée.
2. Conserver les journaux `audit_logs` et `app_error_events`.
3. Identifier la première opération et son `operation_id`.
4. Ne jamais corriger directement une transaction financière sans une écriture
   d’audit compensatoire.
5. Restaurer en staging avant toute restauration de production.
6. Documenter la cause, l’impact, la correction et les tests de non-régression.

## Secrets GitHub nécessaires

Le workflow manuel `Release readiness` exige :

- `EXPO_TOKEN`.

Les migrations vers staging ou production doivent rester dans un workflow
séparé, protégé par un environnement GitHub avec approbation obligatoire.
