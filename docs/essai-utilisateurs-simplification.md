# Essai de la navigation simplifiée

## Changements à présenter

- Mobile administrateur : Accueil, Ventes, Stock, Caisse, Plus.
- Accueil : Nouvelle vente, trois indicateurs, alertes utiles et accès aux clients/rapports. Les graphiques et analyses se consultent dans Rapports.
- Vente sur téléphone et tablette étroite : Articles puis Panier. Le panier et le paiement restent côte à côte avec le catalogue sur grand écran.
- Client masqué par défaut pour une vente comptant, disponible sur demande et obligatoire pour un crédit ou un acompte. Remises accessibles sur demande.
- Catégories dans un sélecteur et bouton pour afficher les articles suivants.
- Plus : clients, rapports et réception de stock accessibles ; administration avancée repliée ; paramètres et assistance toujours accessibles.
- Les permissions employé et les restrictions de forfait existantes continuent de s’appliquer.

## Protocole en boutique

Utiliser des comptes de test et des produits fictifs. Faire essayer séparément à cinq personnes correspondant aux utilisateurs visés, dont un caissier et un propriétaire. Tester au moins un téléphone de petite taille.

Lire les consignes sans indiquer les boutons à utiliser :

1. Ajouter un produit avec son prix et sa quantité initiale.
2. Vendre deux articles, revenir ajouter un troisième article, puis enregistrer le paiement comptant sans fiche client.
3. Enregistrer une vente à crédit pour un client existant, puis retrouver sa dette.
4. Retrouver le solde de caisse et les rapports.
5. Trouver comment recevoir de la marchandise et comment compter le stock.

Pour chaque tâche, noter : réussite sans aide, durée, erreurs, mots incompris et question posée. Demander ensuite : « Qu’est-ce qui vous a fait hésiter ? ».

## Vérifications fonctionnelles et visuelles

- Aucun débordement à 320, 390, 768 et 1280 pixels ; libellés lisibles avec la taille du texte augmentée.
- Le bouton du panier reste visible avec le clavier ; les deux étapes conservent les articles, remises et choix de paiement.
- Un crédit sans client et un acompte invalide ne peuvent pas être validés.
- Une lecture scanner ajoute un seul article et le panier reste accessible.
- Après une vente hors ligne, le statut et les opérations en attente restent compréhensibles.
- Clients et Rapports restent atteignables depuis Plus ; les accès employés restent limités à leurs permissions.
- Les indicateurs indisponibles n’affichent pas un faux zéro ; changer de boutique affiche les indicateurs de la bonne boutique.

Ces essais humains et sur appareils restent à réaliser. Les vérifications de compilation ne prouvent pas la facilité d’usage.

## Améliorations à décider après observation

- Recherche de client directement dans le choix du client si les listes longues ralentissent les ventes.
- Raccourcis adaptés aux actions réellement fréquentes de chaque rôle.
- Aide courte liée à l’action en cours, uniquement aux endroits où les utilisateurs hésitent.

## Compléments : confiance et prévention des erreurs

Implémentation : statuts serveur/attente/à vérifier dans les ventes et le suivi local ; écran après vente avec actions suivantes ; recherche client par nom ou téléphone avec cache hors ligne ; explication des blocages de paiement ; guide de première vente ; panier modifiable avec confirmation de vidage ; confirmation et historique des retours. Les reprises de remboursement réutilisent le même identifiant d’opération.

Scénarios supplémentaires à vérifier sur appareils :

- Vendre hors ligne, retrouver la référence locale, provoquer un conflit de stock et vérifier le statut À vérifier. Après synchronisation réussie, retrouver la vente dans l’historique serveur.
- Une erreur de lecture du stockage ne doit jamais afficher Tout est synchronisé ni effacer les données.
- Chercher Condé avec « conde » et un numéro espacé avec des chiffres seuls. La sélection d’un client reste visible pendant la recherche.
- Effacer temporairement une quantité pour la retaper : l’article reste dans le panier, la validation est bloquée jusqu’à une quantité valide.
- Vérifier les messages pour un panier vide, un crédit sans client, un acompte nul ou égal au total, et des règles d’entreprise non chargées.
- Après une vente confirmée, partager son reçu ou démarrer une nouvelle vente. Après une vente locale, le reçu définitif attend la confirmation serveur.
- Sur une boutique vide, compléter le guide puis vérifier sa disparition après la première vente confirmée.
- Retourner un article avec motif, vérifier la confirmation, l’historique et le refus des quantités déjà retournées. Tester une réponse réseau perdue sans double remboursement.

Ces essais réels restent à effectuer ; les tests automatisés couvrent les règles de paiement, la recherche, la pagination et la réutilisation des identifiants, sans remplacer un essai de bout en bout.
