---
name: salon-reel-style
description: House style for the hair-salon / barber reels made in this project - vertical 9:16, music-only, cuts on the beat, dark moody grade, tiny condensed white labels. Load before planning, editing or rendering ANY salon, barber, haircut or client reel, and whenever the user sends footage of a client ("la personne", "le client"). Holds the two templates (process montage, process/result split), the numbers measured on the user's three reference videos and the checklist to follow.
---

# Style reels salon

Style validé par le propriétaire du salon à partir de 3 reels de référence (analysés le 2026-10-28, planches dans `references/`). **Chaque reel du projet suit ce style** sauf demande contraire explicite. Il s'applique par-dessus `/hyperframes` et `/media-use`.

## L'esprit

Montage barbier haut de gamme : beaucoup de gros plans du geste (mains, ciseaux, peigne, tondeuse, mèches), le client mis en valeur à la fin, l'ambiance du salon en décor. **Aucune voix, aucun sous-titre** : la musique porte tout, les coupes tombent sur le temps. Le texte est rare, petit, discret.

## Format

- 1080×1920, 30 fps, 9:16. Les références sont en 720×1280 : toutes les mesures ci-dessous sont converties en 1080×1920 (×1,5).
- Durée : **6 à 15 s**. Process complet d'un client : 10 à 15 s. Écran partagé : 6 à 8 s.
- Audio : **musique seule**, pas de voix off ni de captions. Intensité intégrée visée **-16 à -18 LUFS** (les refs : -17,8 / -18,6 / -18,9). Les sons d'origine des rushs sont coupés (`muted`).

## Rythme (mesuré)

| Réf. | Tempo musique | Durée moyenne d'un plan | Calage |
| --- | --- | --- | --- |
| 1 — process d'un client | ~99 BPM | 0,93 s | coupes près du temps |
| 2 — écran partagé | ~161 BPM | 1,5 s (4 temps) | sur le temps (±95 ms) |
| 3 — montage salon | ~92 BPM | 0,63 s (1 temps) | **sur chaque temps** (±99 ms) |

Règles :
- Détecter les temps de la musique (`npx hyperframes beats`, ou librosa) et **couper sur les temps**, jamais entre deux.
- Plan = 1 temps (énergique) ou 2 temps (posé). Le plan final (résultat) peut durer 2 à 4 temps.
- Garder dans chaque plan le **moment du geste** (le coup de ciseaux, la passe de tondeuse, la main qui coiffe), pas l'avant ni l'après.
- **Flash noir** : 3 images noires (0,1 s) sur 1 ou 2 coupes d'accent maximum (réf. 1 à 0,87 s et 6,3 s). Pas plus.
- Coupes franches. Pas de fondus, pas de transitions animées, pas de zooms ajoutés.

## Image (étalonnage)

- Ambiance sombre et peu saturée : luminance moyenne **~80-100 / 255**, saturation moyenne faible (les refs : 7 à 11 sur l'échelle signalstats). Peaux chaudes, fonds sombres (bois, murs foncés, verdure), faible profondeur de champ.
- Si un rush est trop clair, plat ou trop saturé : le traiter avec `npx hyperframes media-treatment` (`/media-use`), jamais avec des filtres CSS.
- Recadrage 9:16 centré sur le geste ou le visage ; jamais de bandes noires.

## Texte

- Police : condensée, grasse, majuscules, blanche (style Bebas/Anton). Utiliser **League Gothic** (incluse) ; Oswald 700 en secours.
- **Très petit** : hauteur des capitales ~24 px (titre) à ~33 px (étiquettes) sur 1080 de large, soit une taille de police de **~34 px (titre) / ~46 px (étiquettes)**. Léger espacement des lettres (0,02 em), ombre douce `0 2px 8px rgba(0,0,0,.45)`, aucun fond ni encadré.
- Position : **centré horizontalement et verticalement** dans le cadre (ou dans chaque moitié pour l'écran partagé).
- Pas d'animation d'entrée : le texte apparaît et disparaît sur une coupe.
- Un emoji peut accompagner le titre (réf. 1 : `LAYERS 🤝 FLOW`).

## Les deux modèles

### A. Process montage (réf. 1 et 3) — par défaut

1. **0 – ~2,7 s** : petit titre centré (le nom de la coupe ou du style, ex. `LAYERS 🤝 FLOW`) par-dessus les premiers plans ; il reste à l'écran même pendant un flash noir.
2. **Le geste** : enchaînement de gros plans coupés sur le temps — sections, peigne, ciseaux, tondeuse, dégradé, finitions, produit coiffant.
3. **Le résultat** : client de profil puis de face, coiffeur qui ajuste ; plan plus long (2-4 temps).
4. Variante salon (réf. 3) : terminer sur l'ambiance (salle, postes, déco, comptoir) en 3-6 plans au même rythme.

### B. Process / Résultat en écran partagé (réf. 2)

- Deux moitiés empilées de 1080×960 : **en haut le geste**, étiquette `PROCESS` ; **en bas le résultat**, étiquette `RESULT`. Chaque étiquette est centrée dans sa moitié.
- Les deux moitiés coupent **en même temps**, sur le temps, toutes les ~1,5 s ; chaque paire montre un client différent (ou une étape différente du même client).

## Scripts (dans `scripts/`)

Chaîne éprouvée sur les premiers clients ; les rushs du téléphone sont en HDR HLG 10 bits, les scripts les convertissent en SDR.

1. `prep.sh <dossier-client>` : copies légères SDR 360×640, planches horodatées (1 image / 2 s) et mesure du mouvement de chaque vidéo, dans `<dossier>/_travail/`.
2. Écrire `_travail/spec.json` : `{"beat": <s par temps>, "shots": [[fichier, t_candidat, nb_temps, recherche_s, zoom, cx, cy, "desc"], ...]}`. Le script choisit dans ±`recherche_s` la fenêtre où le geste bouge le plus. Une photo `.jpg` devient un plan fixe avec un très léger zoom.
3. `montage.py <dossier> <spec> picks` : planche des plans recadrés et étalonnés pour vérifier le cadrage. Corriger `zoom`/`cx`/`cy` puis relancer.
4. Musique : la générer (MusicGen, même prompt « moody chic deep house, 95 bpm… »), puis détecter les temps (librosa). Mettre `beat` dans la spec et noter le premier temps : c'est le décalage de la musique.
5. `montage.py <dossier> <spec> extract` : plans 1080×1920 SDR étalonnés dans `_montage/assets/`.
6. `build.py <dossier> "<Titre 🤝 Titre>" <decalage_musique> <plans_flash>` : écrit la composition HyperFrames (plans, titre, flashs noirs, musique à -16 LUFS puis volume 0,7). Ensuite `npx hyperframes check` puis `render`.

Étalonnage par défaut : `eq=contrast=1.1:brightness=-0.03:saturation=0.8:gamma=0.92,vignette=angle=PI/5` sur la conversion HDR → SDR (luminance ~75-80).

## Méthode pour chaque nouveau client

1. Lister les rushs reçus (`ffprobe`), repérer les plans (`scenedetect` ou `ffmpeg select=gt(scene,0.2)`), faire une planche contact pour choisir les meilleurs gestes.
2. Choisir le modèle (A par défaut ; B si on a plusieurs clients ou un avant/après fort).
3. Musique : celle fournie par le salon si possible, sinon générée (`/media-use`, MusicGen, prompt du genre « deep house chic, barber, warm bass »), puis détection des temps.
4. Monter les plans sur la grille des temps, ajouter le titre ou les étiquettes, flash noir sur 1-2 accents.
5. `npx hyperframes check`, revue d'images (`snapshot`), puis rendu final 1080×1920.
6. Comparer à côté des planches `references/ref*-planche.jpg` : même densité de gros plans, même noirceur, même taille de texte.

## À éviter

- Voix off, sous-titres, gros titres, textes animés, cadres ou fonds colorés derrière le texte.
- Plans de plus de 2 s (sauf le résultat final), coupes hors temps.
- Image claire, saturée ou « pub télé » ; transitions animées, zooms artificiels.
