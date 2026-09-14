# Tests Maestro (bout en bout)

Ces scénarios pilotent l'app **native compilée** (build EAS ou client de
développement) — pas le serveur web Expo. Il faut un appareil réel, un
simulateur iOS ou un émulateur Android avec l'app installée.

## État de vérification (important)

- `smoke.yaml` — préexistant, jamais modifié cette session.
- `login-admin.yaml` et `tab-navigation.yaml` — ajoutés le 14/09/2026,
  écrits à partir d'une lecture précise du code source (`login.tsx`,
  `_layout.tsx` des onglets, `AdminPage`...), avec des assertions choisies
  pour être spécifiques au contenu de chaque écran plutôt qu'au seul
  libellé de l'onglet. **Ils n'ont pas pu être exécutés sur cette machine**
  (aucun simulateur iOS ni émulateur Android disponible ici) : traitez leur
  premier passage comme une mise à l'épreuve, pas comme un test déjà
  validé. En cas d'échec, le message Maestro indique l'étape précise —
  recontactez-moi avec ce message et je corrige.

## Lancer les tests

```bash
maestro test .maestro/login-admin.yaml \
  --env MAESTRO_ADMIN_EMAIL="compte-test@example.com" \
  --env MAESTRO_ADMIN_PASSWORD="mot-de-passe-du-compte-test"

# Ou tout le dossier :
maestro test .maestro/ \
  --env MAESTRO_ADMIN_EMAIL="compte-test@example.com" \
  --env MAESTRO_ADMIN_PASSWORD="mot-de-passe-du-compte-test"
```

Le compte utilisé doit être un **Administrateur/Propriétaire déjà confirmé**
(email vérifié), rattaché à au moins une entreprise avec une boutique — un
compte de test dédié, jamais un vrai compte client. Les identifiants ne
sont jamais écrits dans ces fichiers : uniquement passés en variables
d'environnement au moment de l'exécution.

## Pourquoi pas un scénario de vente complet ?

Une vente (panier, quantités, choix du mode de paiement, confirmation)
touche plusieurs écrans dont je n'ai pas pu vérifier l'enchaînement exact
en direct sur cette machine. Plutôt que de deviner une séquence
multi-étapes qui échouerait silencieusement au premier vrai passage, j'ai
limité la couverture à ce que la lecture du code permet d'affirmer avec
confiance : la connexion et le chargement (sans plantage) des 6 onglets
principaux. Une fois `login-admin.yaml` et `tab-navigation.yaml` confirmés
verts sur un vrai appareil, étendre vers un scénario de vente complet sera
plus sûr — possible sur demande.
