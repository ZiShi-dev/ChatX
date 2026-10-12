# Vérification des notifications ChatX — 12 octobre 2026

## Parcours vérifié

1. Le backend crée les entrées de la boîte de notifications pour les destinataires de la conversation.
2. Les messages ordinaires de groupe, réactions et événements restent dans l’application. Les mentions, mentions générales, réponses et messages privés peuvent déclencher une alerte.
3. Les préférences globales et la mise en sourdine de la conversation filtrent les alertes côté serveur et côté interface.
4. Un jeton Firebase appartient à un seul compte. L’inscription sur un autre compte transfère le jeton ; une suppression provenant de l’ancien compte ne supprime pas le nouveau propriétaire.
5. L’inscription ne désactive le mécanisme de secours qu’après validation de l’authentification Firebase du serveur. Les préférences sont synchronisées avec leurs propres reprises ; leur échec temporaire ne désactive pas un jeton déjà confirmé.
6. Les échecs d’inscription sont repris avec temporisation. Une permission accordée ultérieurement est prise en compte au retour dans l’application. Les préférences modifiées pendant une écriture sont resynchronisées.
7. Les échecs temporaires FCM sont repris au maximum trois fois, en respectant `Retry-After`. Avant une reprise, les préférences, le jeton et l’état non lu du message sont vérifiés. Les jetons `UNREGISTERED` sont supprimés.
8. En premier plan, Firebase ne crée pas une seconde alerte système : l’application affiche sa bannière selon les préférences et la conversation ouverte. Les arrivées rapprochées sont regroupées sans perdre l’actualisation du chat actif.
9. Au retour depuis l’arrière-plan, la boîte de notifications et le chat actif sont actualisés. L’ouverture d’une alerte utilise la navigation de notification existante.
10. Les notifications lues retirent le badge et les bannières ; les notifications système portant leur identifiant sont également retirées. Les alertes non lues d’autres conversations sont conservées.
11. Le mécanisme Android de secours utilise un observateur de cycle de vie : une réponse appartenant à une ancienne période d’arrière-plan ne peut pas afficher une notification au retour en premier plan.

## Validation effectuée

- Tests de notifications côté interface : 59 tests ont passé avant les trois scénarios supplémentaires d’inscription. Les 12 tests couvrant l’inscription, la réception Firebase et le nettoyage des notifications lues ont ensuite passé.
- Backend : 10 tests ont passé, dont création des notifications, payload FCM, cache OAuth partagé, jetons expirés, reprises temporaires et changement de propriétaire du téléphone.
- Authentification réelle Google avec la configuration locale : acceptée. Aucun push réel n’a été envoyé pendant ce contrôle.
- Compilation web : réussie.
- Compilation Android et tests Java du cycle de vie, des reprises et de la politique d’alerte : réussis avec JDK 21.

## Limites à vérifier sur le téléphone

La réception réelle du push sur un APK installé, écran verrouillé et application arrêtée normalement, nécessite un test sur le téléphone. Les identifiants locaux vérifiés ne prouvent pas la configuration actuellement déployée sur le VPS ni les permissions Firebase d’envoi sur ce projet.

Un arrêt forcé Android, les réglages de batterie du constructeur ou une absence de réseau peuvent retarder ou empêcher une alerte. Les messages restent dans la boîte et se synchronisent à la reprise.

Les reprises FCM sont bornées en mémoire du VPS : un redémarrage du serveur peut interrompre une reprise en attente. Ce contrôle ne constitue pas une garantie de livraison durable ou de réception instantanée.

Le push Firebase actuel concerne l’APK Android. Le navigateur utilise les bannières et les notifications disponibles pendant que la page fonctionne ; le push Web lorsque le navigateur est complètement fermé n’est pas implémenté.
