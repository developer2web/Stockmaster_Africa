# Corrections de l’audit du 7 septembre 2026

## Changements

- Import du composant Text dans la finalisation du profil : suppression des erreurs TypeScript et ESLint.
- Conservation intégrale de la file hors ligne en cas de panne de lecture, JSON illisible ou entrée invalide. Les mutations sont refusées avec une erreur explicite pour éviter d’écraser des opérations récupérables. Aucun nettoyage automatique des données corrompues.
- Lecture paginée complète des achats fournisseurs, du solde de caisse et des détails dépenses/caisse, avec ordre déterministe et prise en compte des plafonds serveur inférieurs à la taille demandée.
- Chargement des bénéfices par lots de 100 références, eux-mêmes paginés, pour éviter les URL trop longues et les résultats tronqués.
- Déclaration directe de Vite 8.1.5, version déjà présente dans le verrouillage des dépendances, sans migration Expo.
- Ajout de tests de régression sur 1 201 opérations, les petites pages serveur, les erreurs intermédiaires et la conservation/reprise des ventes hors ligne.

- Activation du WebSocket natif expérimental dans les commandes Expo sous Node 20.19.4, nécessaire à l’initialisation Supabase pendant le rendu serveur. Ajout de `npm run export:web` et utilisation dans les deux workflows CI.

## Vérifications

Sous Node 20.19.4 : TypeScript et ESLint réussis, 73 tests réussis dans 16 fichiers, trois sites Vite compilés. L’export Expo est vérifié avec la commande dédiée. La validation locale des versions Expo ne signale aucun écart, mais le contrôle distant Expo Doctor reste à effectuer.

## Limites et suite

- Les lectures paginées restent des requêtes successives : elles ne constituent pas un instantané transactionnel si les données changent pendant le chargement. Pour de très gros volumes, prévoir des agrégations SQL avec les mêmes permissions.
- Une file corrompue est conservée et bloquée ; sa réparation nécessite une récupération contrôlée. Ne pas effacer le stockage de l’application pour la débloquer.
- Les tests Supabase locaux ont été tentés, mais PostgreSQL ne répond pas sur 127.0.0.1:54322. Démarrer Docker et Supabase local, puis exécuter les migrations et les tests pgTAP sur une base de test.
- Valider ensuite sur préproduction les rôles et l’isolation de deux entreprises, les ventes simultanées, les crédits, remboursements et reprises hors ligne sur appareils Android/iOS.
- Tester les paiements en sandbox, documenter une restauration de sauvegarde, finaliser les informations légales et réaliser un pilote en boutique avant publication.
- Aucun déploiement ni changement de base distante effectué.
