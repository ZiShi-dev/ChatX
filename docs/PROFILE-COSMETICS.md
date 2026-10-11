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

## Bannières de cultivation

Dans l’onglet **الزينة والتأثيرات**, choisir **التنين السماوي** (dragon céleste), **تشكيل السيوف** (formation d’épées) ou **زيز الزمن** (cigale du temps). Ces scènes se superposent à la bannière, y compris une photographie personnalisée, dans le profil personnel, l’aperçu et le profil ouvert depuis un message ou l’en-tête du chat. Elles ne recouvrent pas le nom, la biographie ou les boutons.

Les visuels sont des créations vectorielles originales : dragon de jade dans la brume, six épées en suspension et cigale entourée d’un sceau temporel. L’inspiration littéraire est [Reverend Insanity de Gu Zhen Ren](https://www.webnovel.com/book/reverend-insanity_7996858406002505), dont le synopsis décrit la cultivation des Gu et la Cigale du printemps et de l’automne. Le fonctionnement de sélection et de prévisualisation s’inspire des [effets de profil Discord](https://support.discord.com/hc/en-us/articles/17828465914263-Profile-Effects), sans utiliser leur code ou leurs assets.

Les scènes sont intégrées à l’application : aucun GIF, vidéo, bibliothèque d’animation ou téléchargement distant. Transformations et opacité animent uniquement les profils ouverts. Les contraintes de performance existantes restent appliquées. La migration 028 étend uniquement la liste des effets permis ; les choix existants restent valides.
