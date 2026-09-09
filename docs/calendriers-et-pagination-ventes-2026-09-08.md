# Calendriers et chargement des ventes — 8 septembre 2026

## Sélection des dates

Les rapports personnalisés, dépenses et échéanciers clients utilisent maintenant un calendrier partagé en français : semaines du lundi au dimanche, navigation mensuelle, sélection d’un jour, raccourci « Aujourd’hui » et annulation sans modification. Le calendrier des promotions Admin était déjà un champ de date natif du navigateur.

La période d’un rapport ne permet pas une fin antérieure au début. Les valeurs envoyées à l’API restent des dates `AAAA-MM-JJ`, calculées en heure locale pour éviter un décalage de jour près de minuit. Les dates impossibles sont rejetées dans le formulaire de dépense.

Les essais Chromium couvrent 320, 390, 768 et 1 440 pixels, ainsi que 640 × 360 en paysage : aucun débordement visible du calendrier. La sélection, l’annulation, les bornes des rapports et les dates envoyées par les fenêtres de dépenses et d’échéanciers ont été vérifiées avec des réponses réseau fictives. Les appareils Android/iOS réels restent à tester.

## « Charger plus » dans les ventes

La lecture d’une page attendait auparavant la lecture de `sale_financials`. Un refus sur les bénéfices faisait échouer toute la page, même lorsque la lecture des ventes était autorisée. L’historique et les bénéfices sont désormais deux requêtes indépendantes. Les bénéfices manquants sont affichés comme indisponibles, jamais remplacés par un zéro inventé, avec un bouton pour réessayer leur chargement.

La requête financière reste réservée au propriétaire dans l’interface et conserve les contrôles serveur, les filtres entreprise/boutique et les références des ventes affichées. Les requêtes sont découpées pour les longues listes. Les droits SQL n’ont pas été élargis.

Ce changement corrige le blocage provoqué par un refus financier. Sans la réponse technique de la session réelle, il ne permet pas d’affirmer que ce refus est l’unique cause du message signalé. Si `get_sales_history_safe` lui-même est refusé, le refus reste affiché : il faut alors vérifier les droits et les migrations de la base concernée.

## Validation

TypeScript, ESLint, 108 tests dans 22 fichiers et les quatre compilations réussissent. Les nouveaux tests couvrent les dates impossibles, années bissextiles, bornes inclusives, calcul local des dates, pagination financière, périmètre entreprise/boutique et refus financier.

La recette navigateur de pagination a chargé 63 ventes sur trois pages malgré un HTTP 403 sur les bénéfices. Après rétablissement simulé des droits financiers, le bouton de reprise a affiché les 63 bénéfices réels. Un HTTP 403 sur l’historique lui-même reste bloquant pour la page suivante et conserve les ventes déjà affichées. Résultats locaux : `tmp/responsive/sales-pagination-results.json` et `tmp/responsive/calendar-results.json`.

Aucune migration ni publication distante n’a été effectuée pour ces changements.
