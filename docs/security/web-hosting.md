# En-têtes web et dépendances — 10 septembre 2026

Les fichiers de configuration sont prêts dans le dépôt. Aucun hébergement distant n’a été modifié ni contrôlé par cette intervention.

## Construire les quatre sites

Sous le Node 20 imposé par le dépôt :

```sh
npm ci
npm run export:web
npm run build:web:all
```

L’export Expo vide `dist` ; il doit donc précéder les trois builds Vite. Chaque commande npm produit maintenant son propre `_headers` dans sa racine de publication : `dist`, `dist/admin-web`, `dist/account-web`, `dist/public-web`.

Les variables publiques de l’environnement de production (`EXPO_PUBLIC_SUPABASE_URL` et `VITE_SUPABASE_URL`) déterminent les origines HTTPS et WebSocket autorisées. Ne jamais mettre une clé privilégiée dans ces variables. Le générateur charge les mêmes fichiers `.env.production*` que Vite et respecte les variables fournies par le serveur de build. Pour un export manuel vers un autre dossier, exécuter ensuite `node scripts/security-headers.cjs chemin-du-dossier`.

Ces fichiers sont directement utilisables pour les réponses statiques de [Cloudflare Pages](https://developers.cloudflare.com/pages/configuration/headers/) et [Netlify](https://docs.netlify.com/manage/routing/headers/). Pour un autre hébergeur, transposer leurs valeurs dans la configuration HTTP de chaque site. Les fonctions serveur ne récupèrent pas automatiquement les en-têtes des fichiers statiques.

La politique comprend :

- CSP avec scripts du même site et empreintes SHA-256 calculées sur les scripts de démarrage Expo réellement exportés. Aucun `unsafe-inline` ni `unsafe-eval` pour les scripts.
- Styles intégrés autorisés pour React Native Web, Paper et les reçus ; la police DM Sans existante charge uniquement ses feuilles depuis `https://fonts.googleapis.com` et ses fichiers depuis `https://fonts.gstatic.com`. Ces domaines ne sont pas autorisés pour les scripts ni les API. Images HTTPS autorisées pour les logos d’entreprise externes ; workers `blob:` conservés pour les fonctionnalités web.
- Connexions API limitées à l’origine Supabase configurée, objets intégrés interdits et pages interdites en iframe.
- `nosniff`, absence de référent lors des navigations, caméra limitée au site et HSTS pendant un an. HSTS n’inclut volontairement ni tous les sous-domaines ni le préchargement, leurs configurations HTTPS n’étant pas confirmées.

Après publication, vérifier sur **chaque domaine réel** les en-têtes HTTP, la connexion/MFA, les images, le scanner, Realtime et l’impression des reçus. Les serveurs de développement Expo/Vite n’appliquent pas ces fichiers ; un build local réussi ne prouve pas que l’hébergeur applique les protections. Ne pas ajouter une autorisation globale de scripts en réponse à une erreur CSP : identifier la ressource légitime, corriger son chargement ou autoriser son origine précisément.

## Dépendances corrigées sans migration Expo

| Paquet | Version verrouillée corrigée |
| --- | --- |
| `@xmldom/xmldom` | 0.8.15 et 0.9.12 selon le parent |
| `browserslist` | 4.28.9 |
| `baseline-browser-mapping` | 2.11.21 |
| `fast-uri` | 3.1.7 |
| `js-yaml` | 3.15.2 et 4.3.2 selon le parent |
| `postcss` utilisé par `@expo/metro-config` | 8.5.28, override ciblé de la même majeure |

Expo reste **54.0.37**, React **19.1.0**, React Native **0.81.5** ; aucun paquet géré par Expo n’a changé. `@noble/ciphers` **1.3.0**, compatible avec Node 20, est ajouté pour le chiffrement authentifié hors ligne.

L’audit de production passe de **34 paquets signalés (13 élevés)** à **28 (8 élevés)**. Les restes correspondent à quatre avis sur trois dépendances et leurs propagations dans Expo :

- `image-size` dans Metro : deux dénis de service de parseurs, sans version corrigée publiée au contrôle. Les images compilées doivent provenir de sources fiables ; Metro ne doit pas être exposé publiquement. [Avis ICNS](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr), [avis JXL/HEIF](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq).
- `decode-uri-component` dans `query-string` d’Expo Router : la version corrigée 0.5.0 est ESM, incompatible avec un remplacement direct du module CommonJS appelé par la version présente. Un correctif rétroporté ou une migration Expo testée reste nécessaire. [Avis du mainteneur](https://github.com/advisories/GHSA-vcc3-ghjq-m6fr).
- `uuid` dans `xcode` : la bibliothèque appelle uniquement `v4()` sans tampon, alors que l’avis cible les fonctions `v3/v5/v6` avec tampon. Aucun remplacement majeur forcé de l’outillage natif. [Avis](https://github.com/advisories/GHSA-w5hq-g745-h8pq).

`npm run security:audit` conserve le résultat intégral dans `.tmp/security/npm-audit.json`. La CI et la préparation de release échouent pour un nouvel avis non analysé ou tout avis critique ; les quatre exceptions résiduelles sont visibles dans `npm-audit-baseline.json`, à réexaminer avant le 10 octobre 2026. Ce contrôle de régression ne signifie pas « zéro vulnérabilité » et ne remplace pas l’audit des dépendances de développement.

Le client Supabase déjà présent, `2.110.7`, déclare Node >=22 depuis [la version 2.110.0](https://github.com/supabase/supabase-js/releases/tag/v2.110.0). Il n’a pas été rétrogradé aveuglément : une telle rétrogradation perdrait notamment les correctifs Realtime de 2.110.7. Cet écart de support reste à résoudre dans une migration dédiée des outils ; le Node 20 et le SDK 54 imposés par `AGENTS.md` restent inchangés.
