# Mises à jour Android

Le bouton des paramètres vérifie le manifeste signé du VPS (/api/app/release), compare la version Android installée et télécharge seulement une version plus récente. La signature du manifeste, celle du fichier, son SHA-256 et l'identité du paquet sont contrôlés par le système existant. Android demande de confirmer l'installation. Aucune suppression de l'application ni connexion GitHub n'est nécessaire. Le lien du dépôt privé reste informatif.

Construire les versions distribuées avec `npm run apk:build`. Cette commande augmente versionCode, compile, synchronise Capacitor, construit l'APK puis ajoute le fichier signé et son manifeste dans releases/. Inclure app-version.json et releases/ dans le commit/push : le déploiement VPS existant distribue ces fichiers. Une compilation Gradle directe ne prépare pas de publication.

Requis : Java 21, SDK Android, configuration Firebase, clé privée de publication locale server/certs/update-private.pem (hors Git), et exactement le même keystore Android que l'APK déjà installé. Le build debug utilise le keystore local ; conserver ce keystore sans le publier. Un nouveau keystore ne permet pas de mettre à jour les anciennes installations. Pour passer à une signature release, adapter la tâche de construction et conserver la signature compatible.

La publication copie aussi le manifeste signé, ses fichiers et la clé publique dans server/releases et server/update-public.pem. Le Dockerfile les intègre directement dans l'image, pour les déploiements qui construisent uniquement le dossier server. Inclure également ces fichiers dans le commit. Aucun montage du dossier de travail du VPS n'est nécessaire.

La commande ne commit ni ne push automatiquement les autres changements de la machine. L'APK devient accessible après le déploiement du commit qui contient les fichiers de publication. Vérifier /api/app/release après le déploiement : native.versionCode doit correspondre à app-version.json.
