---
name: sensory-dance
description: Free baby/toddler sensory videos - glossy toy-style fruit characters dancing on the beat over a black background, an original synthesised dance track, each fruit's name said and shown. Builds a 9:16 TikTok/Shorts cut and a 16:9 YouTube cut. Load for "sensory video", "fruits qui dansent", dancing fruits, baby sensory, Hey-Bear-style content, or a new video for the kidydoom channel.
---

# Sensory dance videos

Everything is drawn in code (`scripts/fruits.js`) and the music is synthesised (`scripts/dance_music.py`), so a video costs nothing and every render is identical. Voice lines use the Kokoro cache from the kids-series skill.

```bash
# TikTok / Shorts: one round, 48 s, 1080x1920
python3 .claude/skills/sensory-dance/scripts/build_dance.py channels/<channel>/<slug> --rounds 1 --format portrait
# YouTube: three rounds, ~2 min, 1920x1080
python3 .claude/skills/sensory-dance/scripts/build_dance.py channels/<channel>/<slug>-long --rounds 3 --format landscape
npx hyperframes render channels/<channel>/<slug>/portrait -o channels/<channel>/out/<slug>-tiktok.mp4
```

- Structure per round: every fruit gets an 8-beat solo (name said + shown on beat one), then a 16-beat group dance with confetti; round 1 opens with the whole band already on screen (no black first frame), the video ends on a "Bye bye" wave.
- Characters: `KINDS` in `fruits.js` (strawberry, banana, orange, watermelon, pineapple, apple, blueberry, grape). A new character = a `body` SVG, three gradient colours, a limb colour and a face anchor.
- Moves: `pose()` in `fruits.js` (bounce, sway, jacks, wiggle, twist, clap, spin, wave), all functions of the beat.
- Vary every video (`--seed` changes the melody order and track; change the cast, moves or theme: vegetables, animals, vehicles, seasons). YouTube demonetises near-identical uploads.
- Our own characters only: never copy another channel's characters, names or look.
