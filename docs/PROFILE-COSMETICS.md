# Décorations et effets de profil

Dans **الحساب → الملف الشخصي → تعديل الملف**, chaque membre peut prévisualiser, sauvegarder ou retirer sa décoration et son effet. **قبعة الخيزران** est le chapeau conique animé ; **بدون إطار** le retire. **بدون تأثير** retire l’ambiance du profil. Annuler ne change pas le choix sauvegardé.

Les décorations disponibles sont le chapeau tressé, le dragon, le cadre orbital, l’écusson double et le cadre prismatique. Les ambiances sont les étoiles, l’aurore et les étoiles filantes. La couleur existante du compte sert aussi aux cadres et aux ambiances. Les dessins sont propres à ChatX, réalisés en SVG et CSS ; aucun asset Discord n’est importé. Référence fonctionnelle : [personnalisation des profils Discord](https://support.discord.com/hc/en-us/articles/4403147417623-Custom-Profiles).

## Performance et sécurité

- Aucun GIF, vidéo, image externe ou boucle JavaScript de rendu. Les seuls éléments animés utilisent des transformations et de l’opacité.
- Les décorations s’animent uniquement dans les profils et leur prévisualisation ; les avatars dans le chat et les listes restent immobiles.
- Les animations s’arrêtent dans les pages masquées, en économie de données, sur les appareils à deux cœurs ou à deux Go de mémoire, et avec la préférence système de réduction des mouvements. La décoration reste visible en version fixe.
- Le serveur n’accepte que les identifiants du catalogue, jamais des URL ou du code. La migration `026_profile_cosmetics` ajoute deux colonnes avec valeurs par défaut `none` et contraintes SQL. `027_profile_artwork` étend le catalogue au dragon et aux étoiles filantes. Les comptes existants gardent leur apparence initiale.
- Les choix sont associés au compte, envoyés dans le répertoire des membres et conservés après rechargement. L’effacement du profil retire aussi ses effets.

## Vérifications

Tests interface et serveur et compilation Android. Le scénario PostgreSQL vérifie aussi le nouveau catalogue ; le moteur Docker local doit être disponible pour l’exécuter. Scénario Chrome sur mobile et ordinateur : prévisualisation, sauvegarde, rechargement, visibilité depuis un second compte, avatar immobile dans le chat, arrêt en économie et en mouvements réduits, annulation et retrait. Aucun asset externe n’est demandé par ce scénario.

## Éditeur et affichage

Trois onglets séparent les informations, le style du nom et les effets. La prévisualisation et les actions restent visibles ; seul le panneau de réglages défile. Les onglets suivent les commandes clavier du [modèle W3C](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), avec flèches, début et fin. Échap ferme le dialogue et le focus revient à son déclencheur.

Les dessins occupent un emplacement carré fixe dans le chat et son en-tête. Les avatars de 24 px ou moins restent sans décoration pour conserver la lisibilité. Les versions animées sont réservées aux profils ouverts ; elles respectent aussi la [réduction des mouvements](https://support.discord.com/hc/en-us/articles/360040613412-Reduced-Motion-Setting).
