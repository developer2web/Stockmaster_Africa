# Ajustements et rétablissement — 9 septembre 2026

## Écrans conservés et rétablis

- Choix Administrateur / Employé rétabli, avec les refus explicites dans le mauvais espace.
- Accueil administrateur rétabli dans sa disposition précédente. Le calcul de la journée conserve la date locale.
- Tous les outils : six modules quotidiens selon le forfait, gestion avancée repliée à chaque retour sur cet écran.
- Échéancier : fenêtre plafonnée à 480 px, contenu défilant, champs et actions plus compacts. Calendrier, ajout/retrait et validation des montants conservés.
- Fournisseurs : nom/statut, dette/achats/livraisons, Compte / Reçus et menu. Coordonnées et modification restent accessibles.
- Caisse : petite carte pour signaler l’ouverture requise ; saisie dans une fenêtre séparée, montant vide/négatif refusé.
- Les listes stock/catalogue ne demandent plus le prix d’achat inutilement. Les caches avec et sans coûts sont distincts. La valorisation propriétaire et la saisie des achats conservent leur accès.

## Chargement et confidentialité

Le total financier d’une vente et les coûts de ses articles chargent séparément. Un échec des articles ne masque plus un total reçu. Le diagnostic sur la vente vérifie aussi les coûts des articles et distingue un résultat financier vide d’une réponse contenant des données. Aucun faux bénéfice nul n’est inventé.

Le diagnostic utilisateur a confirmé `42501` sur la vue financière. Le correctif SQL dédié doit encore être exécuté sur Supabase : la CLI locale ne possède pas de connexion administrative. Aucun changement de droit distant n’a été effectué. Les tests SQL couvrent propriétaire, employé, autre entreprise et accès anonyme ; leur exécution nécessite une base de test disponible.

Les fiches produits éditables avec `products.write` conservent le coût conformément à la politique SQL existante. Restreindre également ce champ aux éditeurs employés demanderait une permission métier dédiée et une migration supplémentaire.

## Vérification

- TypeScript, 143 tests dans 27 fichiers, ESLint et quatre compilations réussis.
- Navigateur avec données simulées : accès refusés dans le mauvais espace, connexion propriétaire jusqu’à l’accueil, requête de boutique bloquée puis reprise.
- Accueil 320/390/768/1440 px et mode sombre ; remplissage automatique blanc.
- Échéancier 320/390/768/1440 px et paysage 640×360 ; calendrier, montants, ajout/retrait et sauvegarde.
- Fournisseurs et ouverture de caisse à 320/390/1440 px ; actions et validations conservées.
- Les scénarios de navigateur ne remplacent pas la vérification du compte réel après application du SQL. Safari et les applications Android/iOS natives restent à essayer sur appareil.

Résultats de navigateur : `tmp/responsive/ui-compact-results.json`, `portal-access-results.json`, `access-diagnostics-results.json` et `home-features-results.json`. La fenêtre de dette mesure 358 × 425 px à 390 px de largeur et 480 × 369 px sur ordinateur.
