# Reels du salon

Montages au style de `.claude/skills/salon-reel-style` (à lire d'abord).

Ce dépôt est **public** : il ne contient ni rushs, ni rendus, ni lien vers le Drive, pour protéger l'image des clients. Les rushs restent sur le Drive du salon (214 fichiers, 29 sept. → 24 oct. 2026) ; les rendus finaux ont été remis au salon.

## Où on en est (28 oct. 2026)

- Style validé sur 3 reels de référence, enregistré dans le skill `salon-reel-style`, avec les scripts.
- 214 fichiers triés en 23 clients (`clients.json`, noms de fichiers seulement).
- 3 montages faits, appréciés, **en attente du retour de la patronne** :

| Projet | Durée | Titre (provisoire) |
| --- | --- | --- |
| `10_1009-08h_garcon-boucles-frange_FAIT` | 11,9 s | BOUCLES 🤝 FRANGE |
| `15_1017-07h_homme-longs-coupe-boucles` | 13,8 s | LONGUEURS 🤝 BOUCLES |
| `23_1024_femme-longs-boucles-meches` | 13,8 s | BOUCLES 🤝 LUMIÈRE |

Chaque projet garde sa spec (plans choisis, recadrages), son plan de montage, sa composition HyperFrames et sa musique : de quoi refaire le rendu à l'identique à partir des rushs.

## À faire ensuite

1. Intégrer le retour de la patronne sur les 3 montages (rythme, recadrage, luminosité, vrais noms de coupe).
2. Montages complets pour : 13 (14 oct., 12 vidéos), 14 (15 oct., 8), 06 (3 oct., 6), 16 (20 oct., 5), 18 (20 oct., 4), 07 (3 oct., 4).
3. Écran partagé avant/après pour les clients qui ont surtout des photos.

## Reprendre un projet

```bash
salon/telecharger.sh "<lien du dossier Drive>"   # rushs -> salon/rushs/<client>/
S=.claude/skills/salon-reel-style/scripts
C=salon/rushs/<client>; P=salon/projets/<client>
$S/prep.sh $C
mkdir -p $C/_montage && cp -r $P/* $C/_montage/
python3 $S/montage.py $C $P/spec.json extract
cd $C/_montage && npx hyperframes check && npx hyperframes render
```
