# Rotation hebdomadaire des profils de groupe

Le titulaire peut modifier le nom et les images du groupe plusieurs fois pendant sept jours. Les modifications ne changent ni le titulaire ni la date de fin. À l’échéance, le serveur refuse ses modifications et choisit aléatoirement un membre qui n’a pas encore eu son tour dans le cycle.

Après le passage de tous les membres, un nouveau cycle commence. Le dernier titulaire est exclu du premier tirage du cycle suivant. Un groupe avec un seul membre reste modifiable par ce membre.

La rotation est résolue lors de la lecture des groupes et avant toute modification, sous verrou de ligne en PostgreSQL. Les limites hebdomadaires sont conservées même après plusieurs semaines sans activité. Aucun téléchargement, minuterie réseau supplémentaire côté serveur ou changement de schéma n’est requis.

L’écran du groupe affiche la fin du tour, coupe les droits localement à l’échéance et rafraîchit le titulaire pendant que l’écran est visible. Le serveur reste l’autorité pour toutes les modifications.

Les tests couvrent les modifications répétées, la dernière milliseconde autorisée, le refus à l’échéance, la rotation sans modification, dix cycles sans doublon, le rattrapage après inactivité et les lectures concurrentes. La même vérification de repository est incluse dans le test PostgreSQL optionnel (`CHATX_TEST_DATABASE_URL`).

Validation : 96 tests frontend et 28 tests serveur réussis, ainsi que le test PostgreSQL réel dans un schéma temporaire isolé. Compilation et typage frontend et serveur réussis.

## Correction de l’attente persistante

L’écran affichait « mise à jour du prochain tour » dès que la date locale dépassait l’échéance, même après une réponse périmée ou un échec réseau. Cette indication est désormais réservée à une requête en cours. Les échecs et réponses périmées affichent un état explicite et un bouton de relance. La relance à l’échéance, le polling et le bouton partagent la même requête pour éviter les doublons.

Le calcul utilise l’en-tête HTTP `Date` du serveur et une horloge monotone du client, y compris lors d’une réponse `304`. L’API expose cet en-tête pour Android. La santé publique annonce `groupTurnPolicy: weekly-v2` pour vérifier le déploiement du système hebdomadaire.

Les tests de navigateur reproduisent une réponse périmée, une coupure puis un rétablissement, avec une horloge de téléphone avancée de plusieurs semaines et une URL terminée par `/`.

## Lecture directe du tour

La page utilise désormais `GET /api/rooms/:id/turn` au lieu de dépendre du rechargement de toutes les conversations. Cette route vérifie l’appartenance au groupe, résout les semaines écoulées sous verrou PostgreSQL et renvoie le titulaire, la fin du tour et le temps utilisé par le serveur. L’annonce du titulaire reste publiée une seule fois.

Une réponse retardée de `/api/home` ne peut plus remplacer un tour plus récent. Le temps explicite de cette route a priorité sur l’en-tête HTTP `Date`, qui peut être fourni par un proxy. Le test de navigateur laisse volontairement `/api/home` périmé et vérifie que la page récupère quand même le nouveau titulaire depuis la route directe. L’indicateur de déploiement est `weekly-v3-direct`.
