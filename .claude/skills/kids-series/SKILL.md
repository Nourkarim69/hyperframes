---
name: kids-series
description: Automated animated kids story series (English) - a recurring cast of cute vector animal puppets, Kokoro voices with lip sync, a music-box theme, one long 16:9 episode per story cut into 9:16 Shorts with hook + captions. Load whenever the user asks for a new episode, a kids / children / bedtime story video, a cartoon for kids, nursery-style mini series, or more Shorts from an episode ("un nouvel épisode", "vidéo pour enfant", "la série").
---

# Kids series pipeline

One story = one `episode.json`. Everything else is generated: voices, lip sync, camera, the long episode (1920×1080) and the Shorts (1080×1920). The characters are SVG puppets drawn in code (`scripts/kidsrig.js`), so they look identical in every episode, cost nothing to render and never drift like AI images do.

```
series/<show>/
  cast.json                  characters: species, scale, Kokoro voice, speed, pitch (semitones)
  music/bed.wav              series theme (scripts/music.py) - reused by every episode
  epNN-<slug>/episode.json   the story (you write this)
  epNN-<slug>/build/         generated HyperFrames projects + publish.json (git-ignored)
  epNN-<slug>/out/           rendered MP4s (git-ignored)
```

## Make an episode

1. Read `references/writing.md` (story formula, hooks, YouTube kids rules) and the show's `bible.md`.
2. Write `series/<show>/epNN-<slug>/episode.json` (schema below). Propose the story in 5 lines to the user first unless they asked for no stops.
3. Build: `python3 .claude/skills/kids-series/scripts/build_episode.py series/<show>/epNN-<slug>`
4. Check: `cd <ep>/build/long && npx hyperframes lint && npx hyperframes check --json`; snapshot a few frames (`npx hyperframes snapshot --at 12,40,90`) and look at them.
5. Render: `.claude/skills/kids-series/scripts/render_episode.sh series/<show>/epNN-<slug>` (`long`, `shorts` or one short id as 2nd arg; `draft` as 3rd for a fast pass).
6. Deliver the MP4s from `out/` with the titles/descriptions in `build/publish.json`. Mark as **made for kids** on YouTube.

First time in a session: the SessionStart hook installs Kokoro; if `~/.cache/hyperframes/tts/models/kokoro-v1.0.onnx` is missing, run `.claude/hooks/session-start.sh`. A new show needs `python3 scripts/music.py series/<show>/music/bed.wav` once.

## episode.json

```jsonc
{
  "number": 2,
  "title": "Pip and the Rainy Day",
  "lesson": "...",
  "next": "Next time on ...",
  "scenes": [
    {
      "id": "s01", // unique, short
      "setting": { "place": "burrow", "time": "night", "seed": "any" },
      "chars": {
        // who is on stage + where they start
        "pip": { "x": 820, "face": 1, "emo": "happy", "look": "up" },
        "twinkle": { "x": 1180, "y": 700, "glow": 0.5 }, // y defaults to the ground (860)
      },
      "beats": [
        // played in order; each waits for its line
        { "say": "narrator", "text": "Deep in Whispering Woods..." },
        {
          "say": "pip",
          "text": "Whoa!",
          "cam": "pip",
          "sfx": ["pop"],
          "do": { "pip": { "emo": "surprised", "gest": "hop", "look": "twinkle" } },
        },
        {
          "wait": 1.5,
          "do": { "twinkle": { "move": [1180, 700], "time": 1.4 } },
          "fx": [
            ["trail", "twinkle", 1.4],
            ["flash", 1.4],
            ["sparkles", "twinkle", 1.4],
          ],
        },
      ],
    },
  ],
  "shorts": [{ "id": "short1", "scenes": ["s01"], "hook": "A STAR fell into Pip's garden!" }],
}
```

- **World**: 1920 wide, ground at y 860. Keep the acting area between x 300 and 1650; Shorts follow the speaker, so actors more than ~700 px apart won't share a vertical frame.
- **place**: `burrow`, `forest`, `owltree`, `hilltop`, `pond`. **time**: `day`, `sunset`, `night`, `dawn`.
- **emo**: neutral, happy, excited, sad, scared, surprised, thinking, sleepy, determined, proud, worried.
- **gest**: wave, cheer, hop, jump, point, think, shrug, hug, shake, nod, headshake, spin, bounce.
- **do** keys: `emo`, `gest`, `look` (a character id, `up`, `down`, `left`, `right`), `face` (1 right / -1 left), `move` `[x]` or `[x, y]` (+ `time` s; walking characters face where they go), `glow` (stars), `at` (delay in s).
- **cam**: a character id = close-up, `wide` = back to the full shot. Use a close-up on emotional lines, `wide` on reactions.
- **sfx**: names from `skills/media-use/audio/assets/sfx/manifest.json` (sparkle, chime, pop, whoosh-short, error ...).
- Listeners automatically look at whoever talks. A beat lasts its line + 0.35 s, or `wait` if longer.
- New species / places: add them in `kidsrig.js` (`SPECIES`, `buildWorld`) and the cast in `cast.json`.

## Voices

Kokoro voices (`cast.json`): narrator `bf_emma` (warm British storyteller); kids are adult voices pitched up 3–6 semitones. Keep each character's voice fixed for the whole series. Lines: short, one idea, said the way a 4-year-old would understand.
