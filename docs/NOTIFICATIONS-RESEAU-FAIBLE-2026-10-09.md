# Notifications fiables et appareils modestes

La lecture d’une notification est enregistrée sur le téléphone/navigateur avant l’envoi. Les intentions sont séparées par compte, conservées après fermeture, envoyées par lots de trente et supprimées seulement après confirmation. Les lectures des conversations sont regroupées par salon : un ancien accusé ne supprime pas un curseur plus récent en attente. Un salon devenu inaccessible ne bloque pas les autres lectures.

Les échecs réseau et réponses temporaires déclenchent des nouvelles tentatives espacées, avec variation aléatoire et respect de `Retry-After`. Le retour du réseau réveille la synchronisation, sans contourner le délai imposé par le serveur. Les échecs d’authentification restent en attente d’une connexion valide.

Une réponse d’inbox commencée avant une lecture ne remplace pas son état récent. Les notifications déjà lues restent lues tant que leur type et leur date sont identiques ; une nouvelle réaction avec une nouvelle date peut redevenir non lue. Ouvrir un message et confirmer sa lecture actualise aussi les notifications correspondantes. Lire/effacer les notifications ne remet plus artificiellement à zéro les messages non lus des salons serveur.

Les lectures individuelles portent aussi la date de la notification vue : une nouvelle réaction sur le même message n’est pas lue par une ancienne opération retardée. Le module de l’écran des notifications et ses dépendances sont inclus dans le cache initial, pour permettre un rechargement hors ligne dès la première visite.

« Tout lire » et « Effacer » utilisent une limite temporelle observée dans les notifications reçues. Une notification plus récente garde son état non lu. L’effacement serveur est monotone et ne fait pas réapparaître une histoire précédemment effacée. Le cache conserve cent notifications par compte ; les lectures en attente sont bornées à mille identifiants et cent salons au chargement. Une saturation des lectures explicites affiche une erreur au lieu d’abandonner silencieusement de nouvelles lectures. Les données complètes restent sur le serveur et paginées.

Les rafraîchissements restent sans chevauchement, ralentissent progressivement après les échecs jusqu’à deux minutes, et reprennent au retour du réseau. Les tâches secondaires passent à une minute sur les appareils signalant au maximum 2 Go de mémoire ou deux processeurs logiques. Les envois utilisent alors une seule opération simultanée. Lorsque ces indications sont absentes, les réglages réseau et d’économie existants restent applicables.

La préparation des médias conserve sa file séquentielle et rend la main à l’interface avant chaque tâche et entre les essais de compression JPEG. `scheduler.yield()` est utilisé lorsqu’il existe, avec une solution de repli sans dépendance supplémentaire. La synchronisation différentielle, les ETag, la compression HTTP, les images compressées et les transferts reprenables existants sont conservés.

La reprise repose sur les événements réseau et les tâches de l’application ouverte. Elle ne dépend pas de Background Sync, dont la disponibilité est limitée ; fermer complètement le navigateur ne garantit pas l’exécution d’une synchronisation avant la prochaine ouverture. Si le stockage du navigateur est effacé par l’utilisateur ou le système, les intentions locales non confirmées peuvent être perdues. Une panne réseau empêche temporairement les autres appareils de recevoir l’état de lecture.

## Vérifications

Tests de conservation après erreur, lots, isolation des comptes, déduplication des requêtes, confirmation ancienne, limites temporelles de lecture/effacement et PostgreSQL. Scénario navigateur avec lecture hors ligne, rechargement, confirmation perdue, retour réseau, nouvelle notification laissée non lue et processeur ralenti six fois. Ces simulations ne garantissent pas l’absence de bugs sur tous les téléphones réels.

## Sources consultées

- [Google/web.dev — découper les tâches longues et rendre la main à l’interface](https://web.dev/articles/optimize-long-tasks)
- [Google/web.dev — adapter le chargement aux appareils et réseaux modestes](https://web.dev/articles/adaptive-loading-cds-2019)
- [MDN — synchronisation en arrière-plan et disponibilité](https://developer.mozilla.org/en-US/docs/Web/API/Background_Synchronization_API)
- [Google/Firebase — conserver localement les écritures hors ligne et les synchroniser](https://firebase.google.com/docs/firestore/manage-data/enable-offline) : principe de conception étudié ; ChatX conserve son backend PostgreSQL et ses propres files locales.
