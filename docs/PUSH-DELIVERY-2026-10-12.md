# Fiabilité de réception Android

Le format FCM notification précédemment envoyé est toujours remplaçable : si plusieurs envois attendent sur un téléphone déconnecté, un nouvel envoi peut remplacer les précédents. Source : https://firebase.google.com/docs/cloud-messaging/customize-messages/collapsible-message-types

L'APK 7 annonce android-data-v1 lors de son inscription au serveur. Pour ces appareils uniquement, le serveur envoie un message data de priorité HIGH sans notification ni collapse_key. Le service Android dédié affiche immédiatement une notification de message depuis les données reçues, sans appel API, image distante ni exécution JavaScript nécessaire en arrière-plan. Les anciens appareils gardent le format notification compatible jusqu'à leur réinscription avec le nouvel APK.

Au premier plan, le même message rejoint les bannières existantes via Capacitor, en conservant title/body du payload data. Les paramètres de silence et les types de notification restent appliqués côté serveur. Le nettoyage des notifications lues garde les identifiants de message. L'ouverture d'une notification est retenue jusqu'à ce que JavaScript écoute l'événement, y compris au démarrage à froid.

Les erreurs temporaires côté serveur sont réessayées après une et deux secondes au lieu de dix et vingt, avec trois tentatives maximum. Retry-After et le délai minimal d'une minute pour 429 sont conservés. Les refus FCM enregistrent le statut et le code sans afficher de jeton, clé ou contenu de message.

Limites : FCM ne garantit pas une réception instantanée ni l'ordre ; les files de données non remplaçables ont une limite de 100 messages par appareil hors ligne. Android peut empêcher les notifications si la permission ou le canal est désactivé, si l'application est forcée à l'arrêt, ou selon les restrictions du constructeur. Le statut Firebase configuré ne prouve pas une réception sur un appareil. Un essai réel de plusieurs messages privés après installation de l'APK 7 et confirmation d'inscription reste nécessaire.
