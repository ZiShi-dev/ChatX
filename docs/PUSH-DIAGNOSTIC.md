# Diagnostic des notifications push sur le VPS

Les logs sont activés par défaut. `CHATX_PUSH_LOGS=false` les désactive.
Après déploiement du code serveur, reconstruire et recréer le service API depuis le dossier du projet :

```sh
docker compose up -d --build api
docker compose logs -f --since=10m api
```

Dans Dokploy, les mêmes lignes apparaissent dans les logs du conteneur API.
Chaque ligne commence par `[push]`, suivie d'un objet JSON horodaté en UTC.
Le contenu des messages, les clés Firebase, les sessions et les jetons complets ne sont pas journalisés.
`deviceId` est une empreinte du jeton permettant de retrouver le même appareil dans plusieurs événements.

## Test avec deux comptes

1. Installer la version corrigée sur le téléphone destinataire, ouvrir l'application et utiliser « إعادة ربط الإشعارات » dans les paramètres.
2. Vérifier `device_registered`, puis `configuration_checked` avec `ready: true`.
3. Passer l'application en arrière-plan et verrouiller le téléphone.
4. Depuis un autre compte, envoyer un message privé ou une mention dans un groupe. Les préférences doivent autoriser ce type de notification.
5. Retrouver le même `messageId` dans les logs : `message_triggered`, `recipient_queued`, `send_attempt`, `fcm_accepted`, `delivery_finished`.

## Interprétation

| Événement / raison | Signification |
| --- | --- |
| `registration_rejected` / `invalid_token` | Jeton manquant ou mal formé ; vérifier la version corrigée du client. |
| `registration_rejected` / `invalid_session` | Session absente ou expirée. |
| `configuration_missing` | Le processus API ne reçoit pas les trois variables Firebase. |
| `oauth_rejected` | Google refuse l'authentification du compte de service ; voir `httpStatus`. |
| `configuration_checked` / `ready: false` | Le serveur ne dispose pas d'un accès OAuth utilisable. |
| `recipient_skipped` / `no_registered_device` | Aucun téléphone enregistré pour ce destinataire. |
| `recipient_skipped` / `muted_or_disabled` | Notification bloquée par les préférences. |
| `send_attempt` | Tentative d'envoi à Firebase ; `attempt` suit les réessais. |
| `send_error` | Erreur réseau, délai dépassé ou authentification indisponible. |
| `fcm_rejected` | Firebase refuse le push ; consulter `httpStatus` et `errorCode`. |
| `fcm_rejected` / `UNREGISTERED` | Ancien jeton expiré ; il sera supprimé du serveur. |
| `retry_cancelled` | Réessai annulé : message lu, notification supprimée, préférences modifiées ou appareil désinscrit. |
| `fcm_accepted` | Firebase accepte le push ; `fcmMessageName` identifie l'envoi. |
| `delivery_finished` / `sent` | Envoi accepté par Firebase, sans confirmation d'affichage Android. |

## Limite de la vérification côté VPS

`fcm_accepted` ne prouve pas que le téléphone a reçu ou affiché la notification.
`phoneDisplayConfirmed: false` rend cette limite explicite ; ce champ ne signifie pas un échec.
Pour confirmer la réception et l'affichage Android, il faut observer le téléphone ou ajouter un accusé de réception dans le service natif.
Ces logs API n'ajoutent pas d'accusé de réception du téléphone.
Si Firebase accepte le push mais rien n'apparaît, vérifier les autorisations Android, la canalisation « الرسائل », la version installée et les restrictions de batterie.
