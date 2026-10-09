# Corrections ChatX — 9 octobre 2026

Les constats initiaux restent dans `AUDIT-2026-10-09.md`. Ce rapport décrit la correction du projet local ; aucun serveur de production n'a été modifié.

La passe suivante sur l'économie de données, ses nouvelles limites photo et ses validations est détaillée dans [DONNEES-2026-10-09.md](DONNEES-2026-10-09.md).

## Fiabilité

- Historique et favoris : pages de 30, curseurs stables (date et ID), chargement du message ciblé par un lien ancien. Les réactions SQL sont limitées aux messages de la page.
- Lecture : le GET n'enregistre plus de lecture. Le client envoie un curseur pour les messages visibles ; le serveur refuse les salles étrangères et conserve un curseur monotone, y compris en cas de dates identiques.
- Édition et suppression : mutations serveur réservées à l'auteur, erreurs visibles. Une suppression efface aussi les octets de pièce jointe et réactions. Un réessai d'envoi ne restaure pas une pièce jointe supprimée.
- Les liens sont envoyés comme texte réel. Les vidéos sont explicitement refusées dans les conversations serveur ; les pièces jointes restent dans le compositeur tant qu'une vidéo bloque l'envoi.
- Transactions PostgreSQL pour création de conversation et message/pièce jointe. Créations privées concurrentes convergent vers la même conversation.
- Cache local par compte et invalidation des requêtes en cours au changement de compte. Messages en attente préparés sauvegardés avant POST, même ID au réessai, enregistrement au `pagehide`. Brouillons séparés par compte.
- Erreurs de favoris et notifications affichées ; mutations de favoris concurrentes sur le même message bloquées, lecture des notifications envoyée par lots de 30.

## Ressources

- Snapshots : 300 messages envoyés au total, 40 en attente, 1 800 000 caractères JSON maximum. Les previews envoyées ne sont pas conservées sur disque. Une erreur de quota bloque l'envoi et est affichée.
- Fenêtre mémoire : 300 messages envoyés par salle ; fenêtre DOM de 120 avec navigation vers les messages plus anciens/récents. Le rafraîchissement de la page récente est suspendu pendant la consultation de l'historique.
- URLs blob libérées lors de suppression, remplacement de fenêtre, changement de compte et nettoyage des médias. Les pièces jointes non envoyées restent protégées lors du nettoyage.
- Compteur de cache calculé depuis les médias présents, sans les anciennes valeurs simulées de 34/88/4 MB.
- Compression des petites images selon le réglage, plafonnée à 60 000 octets. Profil/couverture : limite d'entrée 20 MiB et 24 millions de pixels, fallback `Image` si `createImageBitmap` manque, fermeture du bitmap et révocation des URLs. La limite de pixels est vérifiée après décodage ; ce n'est pas une garantie d'absence de pic mémoire avec un original compressé malveillant.
- Tree-shaking ciblé des composants Ionic inutilisés, sans suppression des CSS ni des composants utilisés. Le chunk partagé moderne passe de 1 172,58 à environ 502 kB (près de 57 % de réduction), environ 122 kB gzip. Des avertissements de taille restent présents pour les chunks moderne et legacy ; ils ne sont pas masqués.
- Android : vérifications natives espacées à deux minutes et alarmes inexactes ; ensemble des IDs vus limité à la page récente et partagé avec le client. Pas de polling natif réseau en premier plan. Android peut retarder les notifications en veille. Sauvegarde automatique Android désactivée pour les caches privés.
- Docker : mot de passe exigé, base non publiée, API HTTP sur localhost, redémarrage `unless-stopped`. Le VPS, son reverse proxy et ses sauvegardes restent à vérifier sur place.

## Vérifications

- Tests unitaires : 79 frontend, 22 backend réussis ; le test PostgreSQL est optionnel dans la commande standard.
- Test PostgreSQL séparé exécuté sur PostgreSQL 16 éphémère, localhost, schéma isolé ensuite supprimé : migrations, pagination avec dates identiques, accès étrangers, lectures, favoris, rollback des pièces jointes et des memberships, absence de restauration d'image supprimée. Deux tests réussis.
- TypeScript frontend et backend, build production et Capacitor sync vérifiés.
- APK debug compilé avec Java 21 et Gradle 8.14.4 déjà installé, après téléchargement des dépendances Android absentes du cache. Les essais initiaux avec Java 25 et le mode hors ligne ont échoué ; la compilation Java 21 est celle retenue. Fichier : `android/app/build/outputs/apk/debug/app-debug.apk`. Le wrapper du projet reste sur Gradle 8.14.3, non modifié.
- Chrome headless, Playwright fourni par l'environnement, API de test interceptée : composants Ionic hydratés, pagination, DOM borné, aucune image automatique sous économiseur, absence de débordement horizontal à 320/360 px, en paysage 640×360 et tablette 768×1024, envoi hors ligne persisté puis retrouvé après rechargement. Ceci ne teste pas OAuth Google réel ni une connexion complètement coupée au chargement de la page Web.
- `scripts/verify-production.mjs` permet de rejouer ces essais avec `CHATX_PLAYWRIGHT_PATH`, `CHATX_CHROME_PATH` et `CHATX_TEST_ORIGIN`. Le navigateur Cypress n'est pas installé ; les scénarios Cypress ont été mis à jour mais ne sont pas déclarés exécutés.
- Docker Compose validé avec `.env.example` et un mot de passe de test. Les secrets `.env` n'ont pas été consultés.

### Vérifications supplémentaires après reprise

- Animation de démarrage du logo local : apparition et léger agrandissement, puis fondu, durée 1,1 seconde. Les routes se préparent en parallèle et restent non interactives jusqu'à la disparition de l'écran. Pas de requête distante pour le logo ni de dépendance ajoutée. Le réglage de réduction des animations supprime les mouvements et réduit l'attente à 120 ms. Vérification Chrome : affichage, fin de l'animation, retrait de `inert` et mode réduit ; build et APK compilés.

- Panneau DebugDock et ses styles supprimés, ainsi que les commandes d'échec d'envoi et de lecture artificiels. Le suivi réseau écoute `online`, `offline` et, si disponible, les changements d'estimation `navigator.connection` (2G = connexion lente). Aucun ping supplémentaire. Les statuts des conversations serveur restent basés sur les réponses API et les curseurs de lecture serveur. Les fonctions locales de démonstration ne sont pas des confirmations serveur.
- Après cette suppression : 82 tests frontend et 23 tests backend passent (un test PostgreSQL optionnel ignoré dans cette commande), build production et APK reconstruits.

- Préparation des médias sérialisée : un seul décodage/encodage à la fois, sans sérialiser les requêtes réseau. Deux tests vérifient l'ordre et la reprise après échec.
- Le composeur sélectionne au maximum dix pièces jointes, refuse les vidéos non prises en charge et les fichiers dépassant les limites, réduit les photos caméra et affiche des miniatures JPEG compressées au lieu de décoder les originaux directement dans chaque aperçu. Les URLs des sélections abandonnées sont libérées.
- La modification attend le résultat du serveur : un refus conserve le texte et le mode édition pour permettre une nouvelle tentative.
- Scénarios Chrome rejoués avec 1 000 messages : pagination bornée, lien profond vers un ancien message, refus d'édition puis réessai, dix miniatures compressées, suppression des sélections, reprise hors connexion et séparation des caches Alice/Bob.
- APK final reconstruit puis installé dans une copie temporaire de l'AVD Medium_Phone, Android API 37. WebView Ionic hydraté, 300 messages fictifs en cache affichés, aucune largeur débordante, message en attente retrouvé après rechargement sans backend accessible. Mode avion activé, mais le WebView rapporte toujours `navigator.onLine=true` : ce signal seul ne prouve pas l'absence de connectivité.
- `scripts/verify-android.mjs` rejoue le scénario avec un compte fictif dans un émulateur jetable et un port CDP transmis par ADB. Ce test n'effectue pas une connexion Google. L'émulateur dispose d'environ 4 Go de RAM ; il ne représente pas un téléphone peu puissant. Le PSS d'environ 123 MiB relevé sur l'écran d'activation concerne le processus principal seulement, sans le processus de rendu WebView ; ce n'est pas une mesure complète de RAM ni un benchmark physique.

## Limites à valider sur appareil et production

Le projet Android conserve `app.chatx.mobile` et le minimum API 24. Aucun test de FPS, RAM, batterie, clavier réel, arrêt forcé ou démarrage hors ligne sur téléphone physique n'a été réalisé. L'application Web n'a pas de nouveau service worker ; le cache des conversations n'assure pas à lui seul le chargement de l'application Web sans réseau. Une fermeture pendant la préparation initiale d'une pièce jointe peut empêcher sa sauvegarde durable. L'API ne prend pas encore en charge l'envoi vidéo.

La connexion Google réelle, les certificats HTTPS, le déploiement et la restauration de sauvegardes du VPS nécessitent leur environnement réel. La validation locale ne suffit pas pour garantir les performances de tous les téléphones.
