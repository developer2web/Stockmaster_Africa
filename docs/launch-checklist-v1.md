# StockMaster V1 — checklist de lancement

Date de mise à jour : 30 août 2026
Verdict actuel : **NO-GO pour un lancement public**

Légende :

- `[x]` terminé et vérifié localement
- `[ ]` restant à faire ou preuve manquante
- `[~]` présent, mais validation réelle encore nécessaire

## 1. Architecture et séparation des applications

- [x] Application mobile réservée aux Administrateurs et Employés
- [x] Super Admin absent des menus et écrans métier mobiles
- [x] Connexion Super Admin mobile refusée avec orientation vers le portail séparé
- [x] Site public séparé — port 4000
- [x] Site Account séparé — port 4001
- [x] Site Super Admin séparé — port 4002
- [x] Sélecteur d’entreprise disponible pour un propriétaire multi-entreprises
- [x] Sélecteur de boutique disponible selon les affectations

## 2. Authentification et sécurité

- [x] Connexion par email et mot de passe
- [x] Normalisation des emails en minuscules
- [x] Gestion de l’erreur de décalage JWT
- [x] Suppression d’une session lorsqu’un portail refuse le rôle
- [~] Confirmation obligatoire de l’email — réglage Supabase distant à confirmer
- [x] Réinitialisation du mot de passe
- [x] Changement du mot de passe
- [x] Historique des événements de sécurité
- [x] Déconnexion globale des autres sessions
- [~] 2FA disponible dans les paramètres
- [ ] Rendre la 2FA obligatoire pour le Super Admin — risque accepté, activation manuelle demandée
- [ ] Ajouter et vérifier les codes de récupération 2FA
- [ ] Vérifier la limitation des tentatives de connexion dans Supabase
- [ ] Tester la révocation réelle des sessions après désactivation d’un utilisateur

## 3. Rôles, permissions et isolation

- [x] Rôles Administrateur, Employé et Super Admin séparés
- [x] Employé incapable de modifier son propre rôle
- [x] Administrateur incapable de créer un Super Admin
- [x] Permissions métier vérifiées côté serveur
- [x] Isolation par entreprise dans les politiques RLS
- [x] Isolation par boutique dans les politiques RLS
- [x] Accès financier masqué selon le rôle
- [x] Fonctions interdites cachées des menus employés
- [~] Tester deux entreprises simultanément sur Supabase distant
- [~] Tester deux boutiques avec un employé limité à une seule boutique
- [~] Tester tous les exports avec un compte Employé restreint
- [ ] Exécuter toute la matrice pgTAP de permissions et d’isolation

## 4. Ventes et stock

- [x] Création atomique d’une vente
- [x] Vérification du stock côté serveur
- [x] Décrémentation du stock après confirmation serveur
- [x] Protection contre le double-clic et les doublons de synchronisation
- [x] Référence unique par vente
- [x] Historique et détail des ventes
- [x] Vente à crédit et paiement partiel
- [x] Règlement d’une dette client
- [x] Remboursement avec motif et permissions
- [x] Retour en stock selon la disposition choisie
- [x] Journalisation des mouvements de stock
- [x] Inventaire physique et ajustements avec motif
- [~] Tester vente, crédit et remboursement sur Supabase de préproduction
- [~] Tester deux ventes simultanées sur le dernier article disponible

## 5. Caisse

- [x] Entrées et sorties de caisse
- [x] Montant et désignation obligatoires
- [x] Protection idempotente des mouvements
- [x] Clôtures multiples dans la même journée
- [x] Nom de la personne ayant effectué la clôture
- [x] Validation obligatoire du montant initial après une clôture
- [x] Reçus de caisse personnalisés
- [x] Mouvements de caisse enregistrables hors ligne
- [~] Tester ouverture, clôture et reprise sur un appareil réel
- [~] Tester un écart de caisse avec justification
- [~] Tester la synchronisation d’une opération de caisse hors ligne

## 6. Clients, fournisseurs et dépenses

- [x] Création et modification des clients
- [x] Dettes clients et historique des règlements
- [x] Création et modification des fournisseurs
- [x] Achats et dettes fournisseurs
- [x] Paiement fournisseur total ou personnalisé
- [x] Reçu de règlement fournisseur
- [x] Dépenses et permissions associées
- [x] Approbation des dépenses selon le forfait
- [x] Dépenses enregistrables hors ligne
- [~] Tester les paiements fournisseurs partiels et multiples
- [~] Tester l’annulation contrôlée d’un achat fournisseur

## 7. Reçus et rapports

- [x] Personnalisation par entreprise et boutique
- [x] Nom, adresse, téléphone, email, logo et pied de reçu configurables
- [x] Nom de l’employé ou mention Administrateur
- [x] Reçus de vente
- [x] Reçus de caisse
- [x] Reçus clients et fournisseurs
- [x] Rapports PDF
- [x] Montants sans décimales inutiles
- [x] Devise issue de l’entreprise avec secours GNF
- [~] Imprimer chaque type de reçu sur téléphone et ordinateur
- [~] Vérifier les coupures de page et l’absence du menu dans les impressions

## 8. Mode hors ligne

- [x] Cache local des produits
- [x] Cache local des clients
- [x] File hors ligne pour les ventes
- [x] File hors ligne pour les dépenses
- [x] File hors ligne pour la caisse
- [x] Identifiant d’opération unique
- [x] Synchronisation automatique au retour d’Internet
- [x] Conflits conservés avec message explicite
- [x] Avertissement avant déconnexion avec opérations en attente
- [ ] Exécuter le scénario complet : couper Internet, vendre, relancer l’application, reconnecter et vérifier la base
- [ ] Tester un conflit de stock pendant la synchronisation
- [ ] Tester un changement de compte avec une file hors ligne existante

## 9. Abonnements et forfaits

- [x] Forfaits Basic, Pro et Business
- [x] Basic : 1 entreprise, 1 boutique et 2 employés
- [x] Pro : 1 entreprise, 5 boutiques et 15 employés
- [x] Business : 10 entreprises, 20 boutiques et 100 employés
- [x] Fonctions limitées côté serveur selon le forfait
- [x] Essai gratuit de 14 jours
- [x] Un seul essai par identité admissible
- [x] Données conservées après expiration
- [x] Accès Account maintenu pour renouveler
- [x] Downgrade sans suppression des données
- [x] Historique des abonnements et extensions
- [x] Devise adaptée à l’entreprise
- [~] Vérifier les dates d’expiration sur Supabase distant
- [~] Tester le passage TRIAL → ACTIVE → GRACE → EXPIRED
- [~] Tester Basic → Pro → Business et les downgrades

## 10. Paiements et promotions

- [x] Orange Money avec validation manuelle
- [x] Stripe avec activation après webhook
- [x] Références de paiement uniques
- [x] Double paiement empêché
- [x] Actions Super Admin : confirmer, refuser, archiver, restaurer et supprimer
- [x] Motif obligatoire pour les actions sensibles
- [x] Promotions et extensions traçables
- [x] Reçu PDF après paiement confirmé
- [ ] Tester Stripe en environnement sandbox
- [ ] Tester un webhook Stripe envoyé deux fois
- [ ] Tester un montant et une devise Stripe incorrects
- [ ] Tester Orange Money de la déclaration à la validation
- [ ] Vérifier l’envoi des notifications et emails de paiement

## 11. Interface et responsive

- [x] Navigation principale simplifiée
- [x] Outils secondaires rangés dans Plus
- [x] Dashboard réduit à quatre KPI principaux
- [x] Boutons, formulaires, statuts et messages harmonisés
- [x] Recherche effaçable et filtres réinitialisables
- [x] Pagination des ventes, produits et mouvements de caisse
- [x] États vides et chargements visibles
- [x] Double soumission bloquée pendant les mutations
- [~] Pagination complète de toutes les listes volumineuses
- [ ] Vérifier chaque page sur téléphone Android
- [ ] Vérifier chaque page sur iPhone Expo 54
- [ ] Vérifier chaque page sur tablette
- [ ] Vérifier les sites à 1366 px et 1920 px
- [ ] Corriger tout débordement ou chevauchement trouvé pendant ces tests

## 12. Qualité technique

- [x] Expo SDK 54 conservé
- [x] TypeScript : PASS
- [x] Lint Expo : PASS
- [x] Tests unitaires : 40/40 PASS
- [x] Build du site public : PASS
- [x] Build du portail Account : PASS
- [x] Build du portail Super Admin : PASS
- [ ] Installer/utiliser la CLI Supabase
- [ ] Démarrer Docker ou utiliser une base de préproduction isolée
- [ ] Exécuter `npm run test:supabase`
- [ ] Exécuter Expo Doctor avec accès réseau
- [ ] Produire un build Android de préproduction
- [ ] Produire un build iOS de préproduction
- [ ] Tester avec un volume important de produits, clients et ventes

## 13. Exploitation et surveillance

- [x] Journal d’audit protégé
- [x] Logs structurés d’erreurs applicatives
- [x] Notification des tickets au Super Admin prévue côté backend
- [~] Vérifier la réception réelle des emails d’assistance
- [ ] Configurer les alertes de production
- [ ] Vérifier les sauvegardes automatiques Supabase
- [ ] Réaliser une restauration de test
- [ ] Documenter la procédure d’incident
- [ ] Documenter la procédure de retour arrière d’une migration

## 14. Légalité et publication

- [x] Pages CGU, confidentialité, mentions légales et suppression de compte présentes
- [ ] Renseigner la raison sociale
- [ ] Renseigner la forme juridique et le capital si applicable
- [ ] Renseigner le RCCM/NIF
- [ ] Renseigner l’adresse légale
- [ ] Renseigner le responsable de publication
- [ ] Renseigner l’hébergeur et son adresse
- [ ] Confirmer les emails de support et confidentialité
- [ ] Faire valider les textes par un professionnel compétent dans le pays de lancement
- [ ] Définir et publier la politique de conservation des données

## 15. Pilote et décision finale

- [ ] Créer les comptes du groupe pilote
- [ ] Tester au moins une entreprise avec plusieurs boutiques
- [ ] Tester un Administrateur et plusieurs Employés
- [ ] Faire exécuter ventes, crédits, dettes, caisse, stock, rapports et paiements
- [ ] Collecter les incidents avec gravité et preuve
- [ ] Corriger tous les incidents bloquants et critiques
- [ ] Obtenir une validation écrite du pilote
- [ ] Rejouer toute cette checklist sur la version finale
- [ ] Décision finale GO signée

## Porte de sortie

StockMaster peut passer en **GO** uniquement lorsque :

- tous les éléments critiques sont cochés;
- les tests Supabase passent sur la base ciblée;
- les builds Android/iOS sont testés sur appareils réels;
- une restauration de sauvegarde est réussie;
- les informations légales sont complètes;
- le pilote est validé;
- chaque risque restant possède un propriétaire et une acceptation écrite.
