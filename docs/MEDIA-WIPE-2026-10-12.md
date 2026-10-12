# Suppression manuelle des médias

La route /api/owner/media/wipe et sa connexion au stockage existaient dans des modifications locales non publiées. Le client peut donc afficher une action absente de la version serveur déployée. Ces fichiers sont désormais inclus dans la publication de cette correction.

L'action confirmée du propriétaire Google supprime les fichiers de messages (images, fichiers et vidéos), leurs lignes message_images/message_files, y compris les anciennes données binaires en base, et les fichiers orphelins. Les messages restent présents. Les photos de profil et les copies déjà téléchargées sur les appareils ne font pas partie de cette action.

Le POST retourne les compteurs de suppression et l'état du stockage mesuré après l'opération. Le client affiche directement cet état. Les réponses de statut lancées avant la suppression sont ignorées pour éviter le retour d'un compteur périmé. Une erreur de suppression reste une erreur visible ; le client ne confirme pas le succès avant la réponse serveur.

La migration 042 conserve l'état du nettoyage automatique à travers les redémarrages. La suppression manuelle ne modifie pas son échéance.

Validation : tests de stockage sur un dossier temporaire, suppression des lignes SQL vérifiée par le test de dépôt, accès refusé aux non-propriétaires et réponse de statut sept images vers zéro. Le test d'intégration PostgreSQL nécessite CHATX_TEST_DATABASE_URL ; sans cette variable il est ignoré. Aucune suppression sur le VPS réel n'a été exécutée pendant la correction.
