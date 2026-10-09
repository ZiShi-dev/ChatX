# ChatX : optimisation des réseaux faibles

Recherche et lecture du code réalisées le 9 octobre 2026. Les sections suivantes conservent l'audit et la proposition initiale. La section « Implémentation et validation » distingue les changements réalisés des pistes restantes. Les valeurs numériques sont des paramètres initiaux à valider par mesures, pas des recommandations universelles des sources.

## État observé dans le code

- `networkStore.ts` : signaux navigateur, durée des réponses, test de récupération après échec, attente croissante plafonnée à 30 secondes. Une réponse lente est détectée après 5 secondes. Pas de moyenne glissante ni d'hystérésis entre états.
- `poll.ts` : pas de chevauchement dans une même boucle ; intervalle de base de 20 secondes, 40 secondes pour les tâches secondaires en économie, 60 secondes en arrière-plan lorsque ces tâches sont autorisées. Les différentes boucles peuvent encore solliciter le réseau simultanément.
- `adminApi.ts` et `http.ts` : ETag/304 déjà présents. Délais fixes de 30 secondes pour les requêtes JSON et 60 secondes pour les téléchargements. `Retry-After` est émis côté serveur mais ne pilote pas encore une politique centrale côté client.
- `chatCache.ts` : localStorage séparé par utilisateur, 300 messages reçus, 40 messages non envoyés maximum, limite de 1 800 000 caractères. Les médias non persistants ne survivent pas tous au redémarrage.
- `chatStore.ts` : identifiant client transmis pour l'envoi ; un échec devient `failed`. La vidange des messages `pending` les lance avec 280 ms de décalage sans limite stricte de concurrence. Les lectures ont `beforeId`/`aroundId`, mais pas de curseur de changements pour la synchronisation incrémentale.
- `chatImage.ts` : compression JPEG avec cible économie de 20 000 octets. Certains fichiers sont transportés en base64 dans JSON. Aucun protocole de reprise par fragments identifié dans les chemins examinés.

## Politique de connexion

Séparer trois notions : accès au serveur, qualité mesurée et préférence économie. Un téléphone puissant sur réseau faible doit économiser le réseau sans dégrader inutilement son interface. Un téléphone lent sur bon réseau peut réduire le travail de décodage indépendamment.

Utiliser les réponses des requêtes utiles comme mesure principale. `navigator.onLine` et `effectiveType` sont seulement des indices : une connexion Wi-Fi ne garantit pas l'accès au serveur et Network Information n'est pas disponible partout.

Paramètres initiaux : fenêtre des dix dernières requêtes, moyenne lissée des durées, taux d'échec. Entrer en mode dégradé après trois requêtes utiles lentes consécutives (>3 s) ou deux échecs de transport ; sortir après trois réponses utiles réussies (<1,5 s), réparties sur au moins dix secondes. Ne pas prendre un code HTTP 401/429/503 pour une preuve de panne Internet. Une requête lente peut aussi provenir du serveur : conserver les métriques serveur pour distinguer les causes.

Après perte d'accès, suspendre les lectures secondaires et garder une seule vérification de récupération, lorsque l'application est visible : 5, 10, 20 puis 60 secondes, avec variation aléatoire de ±20 %. Un changement de connexion ou retour au premier plan déclenche une vérification immédiate, fusionnée avec celle déjà en cours. Une réussite relance immédiatement les textes en attente ; elle ne suffit pas à quitter le mode économie.

## Données locales et envois

Afficher les données locales immédiatement et actualiser en arrière-plan. Migrer les messages et fichiers en attente vers IndexedDB pour le web ; évaluer SQLite et les fichiers privés pour Android. Écrire durablement avant de confirmer « en attente ». Isoler strictement les comptes et leurs caches ; signaler tout échec de stockage et ne jamais évincer silencieusement un envoi non confirmé.

File persistante : compte, conversation, identifiant d'opération, contenu ou référence de fichier, état, nombre d'essais, prochaine échéance, confirmation serveur. États : en attente, envoi, attente de reprise, confirmé, rejet définitif. Seul l'accusé serveur permet d'afficher « envoyé ».

Un ordonnanceur central donne priorité aux textes, puis aux confirmations de lecture regroupées, puis aux médias et aux informations secondaires. Réseau faible : un envoi actif ; réseau normal : deux au maximum. Préserver l'ordre dans chaque conversation. Fusionner les demandes GET identiques en cours.

Réessayer les erreurs de transport et les erreurs temporaires pertinentes, avec délai initial 2 secondes, doublement et plafond 60 secondes, plus jitter. Après cinq essais, conserver l'opération et attendre une récupération ou une action utilisateur. Respecter `Retry-After` pour 429/503. Ne pas répéter automatiquement 400/401/403 ; traiter les conflits 409 selon le contrat métier. Ne pas répéter une mutation avant d'avoir garanti sa déduplication transactionnelle côté serveur. Un serveur ayant accepté le message avant la coupure doit retourner la même confirmation au nouvel essai du même identifiant.

## Synchronisation et médias

Créer un journal de changements avec curseur opaque : nouveaux messages, modifications, suppressions et confirmations. Une reconnexion reprend depuis le dernier curseur durable, avec pagination et détection des curseurs expirés. Ne pas utiliser seulement le dernier identifiant de message : il manquerait les modifications anciennes.

Préférer un canal temps réel unique au premier plan si les mesures montrent un gain ; repli sur lectures incrémentales adaptatives si le canal est bloqué. Aucune promesse que WebSocket consomme toujours moins : heartbeat, proxys, batterie et reconnexions doivent être mesurés. En arrière-plan Android, privilégier push et travail persistant contraint par le réseau. Background Sync web reste un complément facultatif, pas une garantie de livraison application fermée.

Mode économie : miniatures uniquement, images originales et fichiers sur demande, aucune vidéo automatique, aucun préchargement massif. Préserver le choix explicite de qualité de l'utilisateur. Remplacer le base64 des gros fichiers par du binaire et un protocole de reprise tel que tus : conserver l'offset confirmé, reprendre après coupure, vérifier l'intégrité, expirer les sessions abandonnées et autoriser chaque fragment. Limiter le cache par quota mesuré et supprimer les médias reçus les moins récemment utilisés, jamais les envois en attente.

Activer et vérifier gzip/Brotli pour JSON et ressources textuelles au niveau du serveur/proxy ; éviter la recompression des médias déjà compressés. Versionner les ressources statiques pour un cache long. Mettre en cache les lectures privées par compte et autoriser toute réponse avant validation ETag. Le 304 économise le corps, mais n'évite pas la requête ni forcément les lectures en base.

## Validation obligatoire avant déploiement

Profils reproductibles : 50/150/500 kbit/s, latences 300/1 000/3 000 ms, pertes 2/10 %, coupures 30 secondes/5 minutes, alternance Wi-Fi/mobile, portail captif et serveur indisponible. Compléter l'émulation par un téléphone réel : une limitation de débit navigateur ne reproduit pas toutes les pertes radio.

Critères : aucun doublon après accusé perdu ; aucune perte d'envoi durable après fermeture ; reprise sans rouvrir l'application ; textes non bloqués par les médias ; reprise de fichier depuis l'offset confirmé ; modifications/suppressions rattrapées ; aucune donnée d'un autre compte ; aucune boucle de requêtes concurrentes incontrôlée. Objectif initial d'affichage local : <500 ms sur le téléphone de référence, à mesurer.

Comparer le même scénario avant/après : octets montants et descendants, requêtes/minute, octets par message confirmé, volume au repos, p50/p95 de confirmation, reprises et batterie. Aucun pourcentage d'économie ne peut être annoncé avant cette comparaison. Mesurer sans collecter le contenu des conversations.

Ordre recommandé : 1) file persistante + déduplication + ordonnanceur ; 2) classification stable et reprise ; 3) journal de changements ; 4) reprise des fichiers et cache médias ; 5) arrière-plan natif et mesures de production.

## Implémentation et validation

Les éléments suivants sont implémentés dans cette mise à jour :

- IndexedDB par compte pour les envois non confirmés, avec transaction terminée avant la requête réseau ; restauration après réouverture et conservation des pièces jointes préparées.
- Ordonnanceur : un envoi en économie/réseau faible, deux autrement. Ordre des textes par conversation, priorité aux textes et interruption entre fragments en économie. Reprise temporaire avec délai croissant, jitter et `Retry-After`, cinq tentatives avant attente de récupération ou relance manuelle.
- États réseau stabilisés : trois réponses utiles lentes pour dégrader, trois réponses rapides réparties sur dix secondes pour récupérer. Les petits tests de santé ne donnent pas une fausse preuve de bonne qualité. Vérifications de récupération bornées et suspendues lorsque l'application est cachée.
- GET simultanés identiques fusionnés ; données locales affichées pendant la récupération. Économie des médias automatique lorsque le réseau est faible, indépendamment de la puissance du téléphone.
- `/sync` avec journal transactionnel PostgreSQL : messages nouveaux/anciens modifiés/supprimés, réactions et lectures. Première fenêtre de trente messages ; cinquante changements par page ; mille révisions conservées. Le curseur est en mémoire : une réouverture prend une nouvelle fenêtre, et un curseur expiré déclenche une réinitialisation.
- Uploads binaires de fichiers et images, SHA-256, fragments de 8 Kio en réseau faible ou 32 Kio autrement, reprise depuis l'offset serveur. Identifiant client stable et confirmation répétable ; autorisation sur chaque étape. Sessions abandonnées : expiration 24 heures et nettoyage à la prochaine création du même compte. Limites existantes conservées (image 60 000 octets, fichier 262 144 octets), maximum quarante sessions en attente par compte.
- Cache persistant des médias reçus limité à 8 Mio sur l'appareil, avec actualisation à la lecture ; aucun envoi non confirmé n'est supprimé pour ce quota.
- Compression JSON Brotli/gzip négociée pour les réponses d'au moins 1 Kio, seulement si elle réduit la taille ; ETag/304 conservés.
- Shell web hors connexion : ressources de démarrage et composants Ionic, contrôle de cohérence de version avant activation, autres écrans et illustrations chargés à la demande. Les API privées et les ressources externes ne passent pas dans ce cache. Deux versions du shell conservées, cache statique à la demande limité à quatre-vingts fichiers d'au plus 1 Mo chacun. Aucun double chargement de la version moderne et de la version ancienne sur Chrome moderne ; sondes de compatibilité locales compatibles avec la CSP.

Validation réalisée : 110 tests frontend et 30 tests serveur réussis ; le test PostgreSQL facultatif de la suite générale a aussi été exécuté séparément, dans un schéma isolé (3 tests réussis). Les quatre cas frontend supplémentaires portent sur GET simultanés, `Retry-After`, décodage binaire local et rejet d'encodage invalide. Compilation frontend/backend vérifiée. Test Chrome avec API simulée : saisie hors connexion, fermeture/rechargement hors connexion, restauration durable, retour du réseau sans réouverture, accusé texte perdu, accusé fragment perdu, fichier de 70 000 octets transmis une seule fois (offsets 0, 32 768, 65 536), isolation des comptes et absence d'erreurs JavaScript.

Les profils radio à 50/150/500 kbit/s et la batterie sur téléphone réel restent à mesurer ; aucun pourcentage d'économie n'est annoncé. Aucun nouveau canal WebSocket, SQLite, service push ou travail Android en arrière-plan n'est ajouté : cette mise à jour garantit la reprise pendant l'utilisation et à la réouverture, pas l'exécution d'un envoi lorsque le système ferme entièrement l'application. Le protocole de fragments est propre à ChatX, inspiré de la reprise par offset ; il n'est pas une implémentation compatible tus.

## Sources officielles

- [Android : architecture offline-first](https://developer.android.com/topic/architecture/data-layer/offline-first)
- [AWS : délais, retries, backoff et jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- [IETF RFC 9110 : idempotence et Retry-After](https://www.rfc-editor.org/rfc/rfc9110.html)
- [MDN : limites de navigator.onLine](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine)
- [MDN : disponibilité de Network Information](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/connection)
- [tus : protocole de téléchargement montant reprenable](https://tus.io/protocols/resumable-upload)
- [web.dev : service workers](https://web.dev/learn/pwa/service-workers)
- [MDN : Background Synchronization](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [MDN : compression HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Compression)
- [web.dev : chargement différé des images](https://web.dev/articles/browser-level-image-lazy-loading)
