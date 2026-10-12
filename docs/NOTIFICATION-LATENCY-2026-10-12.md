# Retard et absence de notifications — 12 octobre 2026

## Vérifications réelles

- Le dernier APK est compilé avec `VITE_ENABLE_FCM=true`.
- Le VPS répond à son endpoint public `/api/health`. Après déploiement du diagnostic, il annonce `pushConfigured: true` : les trois paramètres Firebase sont présents. Ce résultat ne prouve pas, à lui seul, la réception sur un téléphone.
- Le mode économie de données ne désactive pas l’inscription Firebase ni la nouvelle bannière de réception.

## Défauts reproduits et corrigés

Le hook Firebase dépendait de la fonction de navigation React Router, dont l’identité change avec la route. Deux changements de page provoquaient deux appels de désinscription du téléphone. Un test a reproduit le défaut avant correction. L’inscription dépend maintenant seulement du compte actif ; la navigation des notifications utilise une référence mise à jour sans interrompre Firebase.

En premier plan, l’APK recevait le push mais attendait la lecture réseau de la boîte de notifications pour afficher la bannière. Une requête lente pouvait donc retarder l’alerte. Le push fournit maintenant le type de conversation et la date du message ; sa bannière s’affiche directement, sans attendre cette requête. Les préférences, les messages déjà lus et la conversation ouverte sont toujours respectés. Une bannière fermée n’est pas rejouée par la réponse réseau tardive.

Les réglages Android affichent maintenant si le téléphone est inscrit auprès du serveur Firebase, proposent de relier les notifications à nouveau et signalent un éventuel canal de messages désactivé.

## Validation

- 40 tests côté interface ont passé : navigation stable, alertes immédiates, préférences, absence de doublons et passage à l’état lu.
- 6 tests Firebase côté serveur ont passé ; le test du transport HTTP a également passé.
- Compilation web et vérification des types serveur réussies.

## Vérification sur l’appareil

Installer l’APK corrigé, ouvrir les réglages des notifications et vérifier l’état « Firebase: الهاتف مسجل لدى الخادم ». Si la permission Android ou le canal de messages est désactivé, le réactiver dans les réglages du téléphone.

Tester un message privé ou une mention depuis un autre compte, une fois sur l’accueil de ChatX et une fois écran verrouillé. Les messages ordinaires de groupe restent dans les notifications internes, conformément à la politique choisie.

La livraison réelle au téléphone n’a pas été observée pendant ce contrôle : le diagnostic de configuration du VPS et les tests ne remplacent pas ce dernier essai. L’arrêt forcé Android et les restrictions de batterie peuvent aussi empêcher la livraison.
