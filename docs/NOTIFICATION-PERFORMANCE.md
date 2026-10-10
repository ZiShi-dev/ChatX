# Notifications sans Firebase

ChatX conserve la récupération périodique de sa boîte de notifications et les notifications locales Android. Le hook de notifications ne lance plus d’enregistrement Firebase, même si une ancienne variable `VITE_ENABLE_FCM` est définie.

## Cadence et consommation

- Premier chargement et reprise de connexion : vérification immédiate, sans requêtes simultanées. Si la connexion revient pendant une requête, une seule vérification suit sa fin. Les délais `Retry-After` du serveur restent prioritaires.
- Application visible : 10 secondes sur une connexion normale ; 20 secondes sur une connexion faible ou en économie de données, puis 45 secondes après quatre réponses inchangées. Un changement remet la cadence à 20 secondes.
- Navigateur masqué : 30 secondes normalement ; 45 puis 90 secondes sur une connexion faible. Les réponses inchangées utilisent la validation HTTP conditionnelle.
- Android : le contrôle JavaScript s’arrête lorsque l’application est inactive ; le contrôle natif prend le relais. Les alarmes sont annulées à l’ouverture puis reprogrammées à la sortie, pour éviter des réveils inutiles en premier plan. L’intervalle nominal en arrière-plan reste de 45 secondes, avec espacement des tentatives après erreur.
- Les protections existantes contre les doublons, les conversations désactivées et les messages déjà lus sont conservées. Le départ d’un compte retire aussi les écouteurs ajoutés tardivement.
- La lecture des messages visibles se vérifie aussi lorsqu’un message est ajouté sans défilement ni changement de hauteur du chat. Ces vérifications sont regroupées après 900 ms et les observateurs sont retirés à la sortie de la conversation.

Les intervalles sont des délais de programmation après la fin d’une requête, pas une garantie de livraison instantanée. Android peut retarder les alarmes selon la veille et les restrictions batterie ; un arrêt forcé empêche l’exécution jusqu’à la prochaine ouverture. Aucun service Firebase n’est nécessaire pour ce fonctionnement.

Les tests couvrent la cadence sur réseau faible, la reconnexion pendant une requête, l’absence de chevauchement, l’arrêt des minuteries, le respect de `Retry-After`, la lecture hors ligne et les protections du cycle de vie natif.
