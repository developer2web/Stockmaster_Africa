# Conformité juridique avant publication

État au 21 août 2026 : les textes et parcours sont préparés dans le code, mais la publication reste **NO-GO juridique** tant que les informations réelles ci-dessous ne sont pas complétées et validées.

## Identité de l’éditeur — obligatoire

- [ ] Raison sociale et forme juridique exactes
- [ ] RCCM, NIF et capital social lorsque requis
- [ ] Adresse complète du siège
- [ ] Nom du responsable de publication
- [ ] Email de support réellement surveillé
- [ ] Email de confidentialité réellement surveillé
- [ ] Téléphone professionnel public
- [ ] Hébergeur du site : raison sociale et adresse
- [ ] Droit applicable, juridiction et procédure de réclamation validés par un juriste

Configurer les variables `EXPO_PUBLIC_LEGAL_*` et `VITE_LEGAL_*` documentées dans `.env.example`. Ne pas publier si l’application affiche « à compléter ».

## Données personnelles

- [ ] Cartographier chaque donnée collectée par l’app, Supabase, Stripe, Orange Money, SMTP et observabilité
- [ ] Signer et archiver les contrats de sous-traitance nécessaires
- [ ] Vérifier la région d’hébergement et les transferts internationaux
- [ ] Définir une durée réelle pour les journaux, justificatifs, sauvegardes et tickets
- [ ] Définir qui traite les demandes d’accès, rectification et suppression
- [ ] Vérifier les formalités applicables auprès de l’autorité guinéenne compétente
- [ ] Aligner la politique publique avec les formulaires Google Data Safety et Apple App Privacy

## Suppression de compte

- [x] Demande initiable dans l’app par administrateur et employé
- [x] Page publique préparée : `/account-deletion/`
- [ ] Publier une URL HTTPS stable accessible sans compte
- [x] Confirmer que `support@stockmaster.africa` existe : domaine enregistré, transfert d’email configuré (`eforwardN.registrar-servers.com`). Vérifier que l’alias `support@` transfère réellement avant publication.
- [ ] Mettre en place une procédure d’identification, d’exécution et de clôture des demandes
- [ ] Distinguer les données supprimées, anonymisées et légalement conservées
- [ ] Informer l’utilisateur de l’avancement et de la clôture

## Abonnements et paiements

- [ ] Afficher le prix final, la devise, la durée, les limites, la réduction et les taxes avant validation
- [ ] Ne pas activer un paiement avant confirmation serveur ou validation Orange Money
- [ ] Définir clairement renouvellement, annulation, remboursement et période de grâce
- [ ] Vérifier les obligations Apple/Google si un achat intégré est ajouté
- [ ] Utiliser « reçu » tant que le PDF ne contient pas toutes les mentions d’une facture fiscale
- [ ] Pour produire une facture, ajouter identité fiscale complète, numérotation conforme, taxes et règles locales validées

## Marketing

- [ ] Conserver une preuve pour chaque statistique, avis client, disponibilité ou promesse de support
- [ ] Ne pas annoncer un essai fixe si la durée dépend de la configuration Super Admin
- [ ] Ne pas employer « garanti », « 100 % sécurisé », « conforme » ou « officiel » sans fondement vérifiable
- [ ] Identifier clairement les tableaux de bord et chiffres de démonstration

## Validation finale

- [ ] Relecture par un juriste connaissant la Guinée et les pays effectivement ciblés
- [ ] Validation fiscale/comptable des reçus et factures
- [ ] Publication HTTPS de `/privacy/`, `/terms/`, `/legal-notice/` et `/account-deletion/`
- [ ] Test des liens depuis l’app, le site public et le portail Compte
- [ ] Archivage de la version acceptée des textes et de leur date d’entrée en vigueur

