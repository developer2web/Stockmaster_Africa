# Adaptation des écrans — 7 septembre 2026

## Corrections réalisées

- Formulaires et en-têtes : les colonnes utilisent la largeur réelle du contenu, y compris lorsque le menu latéral est ouvert. Les titres et actions passent sur plusieurs lignes lorsque nécessaire.
- Vente : catalogue et panier côte à côte uniquement lorsque l’espace disponible suffit ; parcours Articles/Panier sur les écrans plus étroits. Les noms longs des produits et clients restent lisibles. Les moyens de paiement peuvent revenir à la ligne.
- Actions de bas de page : emplacement réservé dans la mise en page, pour éviter de recouvrir le contenu défilant.
- Navigation mobile administrateur : cinq accès avec libellés visibles et indication de l’onglet sélectionné. Le menu latéral conserve sa largeur sur ordinateur.
- Stock, rapports, outils, accueil employé et démonstration : suppression de largeurs minimales trop grandes, cartes et actions adaptables.
- Caisse : mouvements pouvant revenir à la ligne ; fenêtres de saisie et de clôture défilables, avec actions séparées du contenu. Les confirmations partagées disposent aussi d’un contenu défilable.
- Connexion : choix du rôle en colonne sur les petits écrans et titre StockMaster contrasté sur son fond sombre.
- Site public : aperçu du tableau de bord contenu dans sa colonne à largeur de tablette.

## Vérifications

TypeScript, ESLint et export Expo web réussis sous Node 20.19.4, en conservant Expo SDK 54. Les trois sites Vite ont également été compilés. La suite fonctionnelle exécutée pendant ces travaux comporte 83 tests réussis dans 18 fichiers.

Contrôle dans Chromium à 320, 390, 768, 1024 et 1440 pixels :

- Application : connexion, démonstration, accueil administrateur, stock, rapports avec classements, outils, caisse, nouveau produit, nouveau client et panier d’une nouvelle vente.
- Sites séparés : page publique et écrans d’entrée non authentifiés des portails Account et Admin.

Le contrôle combine largeur du document, recherche d’éléments visibles dépassant horizontalement et inspection de captures. Les conteneurs sans contenu peint des animations de libellés ne sont pas considérés comme un débordement visible. Le panier et la fenêtre de clôture sont également contrôlés à 640 × 360 et 844 × 360, avec vérification de la position du bouton de validation de clôture.

Résultat final : aucun débordement horizontal visible détecté dans les 65 configurations écran/largeur et les 4 configurations en paysage contrôlées.

Les écrans métier utilisent une session et des réponses réseau fictives dans le navigateur de test : noms longs, grands montants en GNF, produit, client et mouvement de caisse de démonstration. Les requêtes externes sont interceptées ; aucune donnée client ni opération réelle n’est utilisée.

Ces vérifications ne couvrent pas toutes les routes et ne remplacent pas un essai Android/iOS. Les écrans protégés des deux portails séparés, le clavier natif, les grandes tailles de texte système, le scanner et les interactions avec la base réelle restent à valider.

## Améliorations conseillées, par priorité

1. **Faire essayer les tâches courantes en boutique.** Suivre le [protocole utilisateurs](essai-utilisateurs-simplification.md) avec cinq personnes : créer un produit, vendre, retrouver un crédit, consulter la caisse. Corriger les points où elles demandent de l’aide.
2. **Alléger Rapports.** Afficher d’abord les indicateurs essentiels et replier les filtres Employé/Produit/Catégorie ainsi que les classements dans des détails accessibles sur demande. Les nombreuses cartes restent visuellement longues sur téléphone.
3. **Raccourcir la page publique.** Sa capture à 320 pixels mesure environ 14 000 pixels de haut. Regrouper les arguments répétitifs et garder une démonstration, les bénéfices principaux, les tarifs et un appel à l’action clair.
4. **Valider les appareils réels.** Tester petit téléphone Android, iPhone, paysage, clavier ouvert et texte agrandi ; vérifier spécialement la saisie des quantités et l’accès à la validation.

## Éléments à nettoyer ou supprimer après comparaison

- Nettoyage effectué lors du retrait des exports Excel : les anciennes compilations `dist-receipt-check` et `dist-subscription-check` ont été supprimées et les dossiers `dist-*` sont désormais ignorés. Les compilations actuelles sont régénérées depuis les sources.
- Le portail Admin charge six feuilles de style successives, dont plusieurs correctifs. Consolider les règles et retirer celles devenues inutiles après comparaison visuelle ; éviter d’ajouter une nouvelle couche de correctifs pour chaque écran.
- Réduire les textes explicatifs répétés et les animations décoratives sur mobile si les essais montrent qu’ils gênent la lecture ou ralentissent les appareils.

La validation de la base de test, des rôles et de la reprise hors ligne avant publication est détaillée dans le [compte rendu des corrections](corrections-audit-2026-09-07.md). Aucun déploiement n’a été effectué.
