# Décorations de profil

Dans **الحساب → الملف الشخصي → تعديل الملف**, chaque membre peut prévisualiser, sauvegarder ou retirer la décoration de sa photo. **قبعة الخيزران** est le chapeau conique animé ; **بدون إطار** le retire. Annuler ne change pas le choix sauvegardé.

Les décorations disponibles sont le chapeau tressé, le chapeau de pluie, le dragon, le cadre orbital, l’écusson double et le cadre prismatique. La couleur existante du compte sert aussi aux cadres. Les dessins sont propres à ChatX, réalisés en SVG et CSS.

## Performance et sécurité

- Aucun GIF, vidéo, image externe ou boucle JavaScript de rendu. Les seuls éléments animés utilisent des transformations et de l’opacité.
- Les décorations s’animent uniquement dans les profils et leur prévisualisation ; les avatars dans le chat et les listes restent immobiles.
- Les animations s’arrêtent dans les pages masquées, en économie de données, sur les appareils à deux cœurs ou à deux Go de mémoire, et avec la préférence système de réduction des mouvements. La décoration reste visible en version fixe.
- Le serveur n’accepte que les identifiants du catalogue, jamais des URL ou du code. La colonne `avatar_decoration` garde la valeur `none` par défaut. La migration `040_drop_profile_effect` retire l’ancien effet de profil.

## Éditeur et affichage

Trois onglets séparent les informations, le style du nom et la décoration. La prévisualisation et les actions restent visibles ; seul le panneau de réglages défile. Les onglets suivent les commandes clavier du [modèle W3C](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/), avec flèches, début et fin. Échap ferme le dialogue et le focus revient à son déclencheur.

Les dessins occupent un emplacement carré fixe dans le chat et son en-tête. Les avatars de 24 px ou moins restent sans décoration pour conserver la lisibilité. Les versions animées sont réservées aux profils ouverts.
