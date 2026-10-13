# Notifications regroupées

- Une bannière par conversation dans l'application : dernier expéditeur, contenu, nom du groupe et compteur de messages reçus pendant la bannière.
- Une alerte Android par conversation : dernier message et jusqu'à cinq lignes récentes dans la notification développée.
- Les messages ordinaires mettent à jour l'alerte Android existante sans refaire sonner le téléphone tant que l'alerte reste présente. Les mentions, mentions générales et réponses restent prioritaires.
- Une rafale n'allonge pas indéfiniment la durée de la bannière dans l'application.
- Lire un message ne supprime pas l'alerte regroupée si d'autres messages connus de la conversation sont encore non lus.

Les messages chiffrés restent chiffrés entre le serveur et Firebase. Le téléphone déchiffre l'enveloppe avec sa clé locale. Les enveloppes de plus de 2 000 octets ne sont pas incluses dans le push pour respecter la taille maximale de Firebase ; sans enveloppe ou sans clé locale, l'aperçu de secours reste affiché. L'inbox téléchargée dans l'application conserve le parcours de déchiffrement complet.

Le regroupement Android nécessite le nouvel APK. Le serveur doit aussi être redéployé pour envoyer les champs d'aperçu et l'enveloppe compatible. La réception et les sons doivent être vérifiés sur téléphone, avec deux comptes : plusieurs messages ordinaires dans une même discussion, puis une mention et une réponse.
