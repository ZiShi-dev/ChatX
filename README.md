# ChatX

Application de chat (Ionic React, Vite, TypeScript, Capacitor) pensée pour Android et les réseaux lents. Le serveur Node/PostgreSQL gère les comptes Google, conversations, messages texte, petites images, fichiers, réactions, favoris, édition/suppression et notifications. Voir [les corrections et vérifications](docs/CORRECTIONS-2026-10-09.md).

## Lancer

```bash
npm install
npm run dev
```

Configurer le client Google et l'origine HTTPS de l'API selon `.env.example`. Ne placer aucun secret serveur dans une variable `VITE_*`.

## Build Android

```bash
npm run build
npx cap sync android
```

L’identifiant de l’application reste `app.chatx.mobile`. Le dossier `android/` n’est pas régénéré à la main.
Utiliser Java 21 pour compiler Android. Le wrapper peut télécharger Gradle au premier lancement ; les dépendances Android doivent aussi être disponibles avant une compilation hors ligne.

## Où est le code

- `src/pages` : écrans
- `src/components` : interface (bulles, compositeur, listes)
- `src/stores` : état partagé Zustand (session, messages, réglages, réseau, utilisateurs)
- `src/lib` : règles pures (accusés de lecture, URLs, liens)
- `src/data` : mocks
- `src/constants` : tailles de page et délais
- `src/hooks` : `useDataSaver`
- `src/theme` : variables et styles

L’état local (texte en cours de saisie, menus ouverts) reste dans les composants. Le store de chat ne garde que ce qui est partagé.

## Réseau faible et données

`dataSaver` est activé par défaut. Les images et vidéos ne se téléchargent pas toutes seules tant qu’il est actif, y compris les images du serveur. `networkStore` suit aussi les événements `online`/`offline` du navigateur ; cet indicateur ne garantit pas que l'API soit accessible. Les accusés de lecture utilisent `readCursors` par personne, pas une liste de vus sur chaque message.

Les rafraîchissements attendent la fin de la requête précédente, ignorent les écrans inactifs et s'arrêtent en arrière-plan sur Android (le watcher natif conserve les notifications). Sur Web, les notifications en arrière-plan sont vérifiées toutes les 60 secondes. Les requêtes JSON ont un délai maximal de 30 secondes et les téléchargements de 60 secondes, sans réessai automatique des mutations.

## Backend

Le backend existant est dans `server/`. L'identité Google est vérifiée sur le serveur, puis une session HttpOnly donne accès aux données autorisées. L'API contrôle l'appartenance aux conversations pour les messages et fichiers. L'administration et les anciennes routes d'invitation sont actuellement désactivées ; il n'existe pas de parcours TOTP actif dans cette version.

```bash
cp .env.example .env
npm install --prefix server
docker compose up --build
```

Définir `POSTGRES_PASSWORD` dans `.env` avant Docker Compose. Le port PostgreSQL est interne à Docker ; l'API HTTP est publiée sur localhost pour un reverse proxy HTTPS. Le listener TLS Android reste configurable séparément. Aucun mot de passe par défaut n'est fourni.

Les migrations sont appliquées au démarrage du serveur. `src/data` garde les données de démonstration. Les modifications et suppressions sont autorisées uniquement pour l'auteur, et les profils de groupe suivent les règles de tour du serveur. L'envoi de vidéos est explicitement indisponible pour les comptes serveur.

Les messages sont paginés par 30, avec un cache local séparé par compte : 300 messages récents et 40 envois en attente au maximum, dans une limite de 1,8 million de caractères JSON. Les pièces jointes en attente sont persistées après préparation ; ne pas fermer pendant cette préparation. Le DOM affiche au maximum 120 bulles avec navigation entre fenêtres. Les lectures sont enregistrées explicitement depuis les messages visibles.

## Mode debug

Le panneau تصحيح (Online, Slow, Offline, envoi en échec, vu simulé) n’existe qu’en `npm run dev`. Il est absent du build de production.

## Vérifier

```bash
npm test
npm run build
```
