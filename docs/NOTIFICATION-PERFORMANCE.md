# Notifications ChatX

## Avec FCM (`VITE_ENABLE_FCM=true`)

- **App au premier plan** : la synchronisation inbox actuelle (polling adaptatif, bandeau live) reste inchangée.
- **App en arrière-plan ou fermée** : le serveur envoie une alerte via **Firebase Cloud Messaging** ; Google affiche la notification Android (canal `chatx-messages`).
- L’enregistrement du token FCM se fait au démarrage (`useFcmPush` + `pushRegister.ts`). Tant qu’aucun token n’est enregistré, le **repli natif** (alarmes `InboxWatch`) continue de fonctionner.
- Une fois le token actif, les alarmes inbox natives et les notifications locales en arrière-plan sont désactivées pour éviter les doublons.

Configuration requise :

1. Projet Firebase + `android/app/google-services.json`
2. Rebuild APK avec `VITE_ENABLE_FCM=true`
3. Sur le VPS : `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` (voir `.env.example`)

## Sans FCM

ChatX conserve la récupération périodique de la boîte de notifications et les notifications locales Android.

### Cadence et consommation

- Premier chargement et reprise de connexion : vérification immédiate, sans requêtes simultanées. Si la connexion revient pendant une requête, une seule vérification suit sa fin. Les délais `Retry-After` du serveur restent prioritaires.
- Application visible : 10 secondes sur une connexion normale ; 20 secondes sur une connexion faible ou en économie de données, puis 45 secondes après quatre réponses inchangées. Un changement remet la cadence à 20 secondes.
- Navigateur masqué : 30 secondes normalement ; 45 puis 90 secondes sur une connexion faible. Les réponses inchangées utilisent la validation HTTP conditionnelle.
- Android : le contrôle JavaScript s’arrête lorsque l’application est inactive ; le contrôle natif prend le relais (sauf si FCM est actif avec token enregistré). Les alarmes sont annulées à l’ouverture puis reprogrammées à la sortie. L’intervalle nominal en arrière-plan reste de 45 secondes, avec espacement des tentatives après erreur.
- Les protections existantes contre les doublons, les conversations désactivées et les messages déjà lus sont conservées.

Les intervalles sont des délais de programmation après la fin d’une requête, pas une garantie de livraison instantanée. Android peut retarder les alarmes selon la veille et les restrictions batterie ; un arrêt forcé empêche l’exécution jusqu’à la prochaine ouverture.

Les tests couvrent la cadence sur réseau faible, la reconnexion pendant une requête, l’absence de chevauchement, l’arrêt des minuteries, le respect de `Retry-After`, la lecture hors ligne et les protections du cycle de vie natif.
