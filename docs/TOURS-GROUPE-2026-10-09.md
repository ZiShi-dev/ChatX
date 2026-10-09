# Rotation hebdomadaire des profils de groupe

Le titulaire peut modifier le nom et les images du groupe plusieurs fois pendant sept jours. Les modifications ne changent ni le titulaire ni la date de fin. À l’échéance, le serveur refuse ses modifications et choisit aléatoirement un membre qui n’a pas encore eu son tour dans le cycle.

Après le passage de tous les membres, un nouveau cycle commence. Le dernier titulaire est exclu du premier tirage du cycle suivant. Un groupe avec un seul membre reste modifiable par ce membre.

La rotation est résolue lors de la lecture des groupes et avant toute modification, sous verrou de ligne en PostgreSQL. Les limites hebdomadaires sont conservées même après plusieurs semaines sans activité. Aucun téléchargement, minuterie réseau supplémentaire côté serveur ou changement de schéma n’est requis.

L’écran du groupe affiche la fin du tour, coupe les droits localement à l’échéance et rafraîchit le titulaire pendant que l’écran est visible. Le serveur reste l’autorité pour toutes les modifications.

Les tests couvrent les modifications répétées, la dernière milliseconde autorisée, le refus à l’échéance, la rotation sans modification, dix cycles sans doublon, le rattrapage après inactivité et les lectures concurrentes. La même vérification de repository est incluse dans le test PostgreSQL optionnel (`CHATX_TEST_DATABASE_URL`).

Validation : 96 tests frontend et 28 tests serveur réussis, ainsi que le test PostgreSQL réel dans un schéma temporaire isolé. Compilation et typage frontend et serveur réussis.
