#!/usr/bin/env python3
"""Build a dancing-fruits sensory video as HyperFrames projects.

    python3 build_dance.py <out-dir> [--rounds 1] [--format portrait|landscape|both] [--seed 1]

Each round: every fruit gets a 4-second solo (its name is said and shown on its
first beat), then the whole band dances together. Round 1 opens with all the
fruits popping in, so the first second is already busy. Writes
<out-dir>/{portrait,landscape}/ projects; render them with `npx hyperframes render`.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "../../kids-series/scripts"))
from build_episode import tts  # noqa: E402  (Kokoro + cache, shared with the kids series)

LIB = open(os.path.join(HERE, "fruits.js")).read()
BPM = 120
BEAT = 60 / BPM
FRUITS = [  # id, label, colour of the label
    ("strawberry", "Strawberry", "#FF4D6A"), ("banana", "Banana", "#FFD400"), ("orange", "Orange", "#FF8A00"),
    ("watermelon", "Watermelon", "#FF5C77"), ("pineapple", "Pineapple", "#F5B800"), ("apple", "Apple", "#7CD63A"),
    ("blueberry", "Blueberry", "#6F86FF"), ("grape", "Grape", "#B26BFF"),
]
MOVES = ["bounce", "sway", "jacks", "wiggle", "twist", "clap", "spin", "wave"]
VOICE = {"voice": "af_heart", "speed": 1.0, "pitch": 2}


def choreograph(rounds):
    segs, labels, bursts, says = [], [], [], []
    t = 0.0
    for r in range(rounds):
        if r == 0:
            segs.append({"start": t, "end": t + 8 * BEAT, "mode": "group", "move": "bounce", "alt": ["bounce", "jacks"], "offbeat": True})
            says.append((t + 0.2, "Let's dance, fruits!"))
            bursts.append(t + 0.05)
            t += 8 * BEAT
        for i, (fid, name, col) in enumerate(FRUITS):
            mv = MOVES[(i + r * 3) % len(MOVES)]
            segs.append({"start": t, "end": t + 8 * BEAT, "mode": "solo", "fruit": fid, "move": mv})
            labels.append({"start": t + 0.05, "dur": 8 * BEAT - 0.35, "text": name, "color": col})
            says.append((t + 0.1, f"{name}!"))
            t += 8 * BEAT
        alt = MOVES[r % 3: r % 3 + 4]
        segs.append({"start": t, "end": t + 16 * BEAT, "mode": "group", "move": "bounce", "alt": alt, "offbeat": True})
        bursts.append(t + 0.05)
        says.append((t + 0.15, "Everybody dance!" if r < rounds - 1 else "All together now!"))
        t += 16 * BEAT
    segs.append({"start": t, "end": t + 8 * BEAT, "mode": "group", "move": "wave"})
    says.append((t + 0.3, "Bye bye, fruits!"))
    bursts.append(t + 0.05)
    t += 8 * BEAT
    return segs, labels, bursts, says, t


SCENE = """<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: hidden; background: #000; }}
    .fd-stage {{ position: absolute; inset: 0; }}
    .lbl {{ position: absolute; left: 0; right: 0; top: {ly}px; text-align: center; font-family: Nunito, sans-serif; font-weight: 900;
      font-size: {lsize}px; letter-spacing: 2px; -webkit-text-stroke: 14px #fff; paint-order: stroke fill; text-shadow: 0 10px 0 rgba(0,0,0,.35); }}
    .lbl span {{ display: inline-block; }}
  </style>
  <div id="root" data-composition-id="dance" data-width="{W}" data-height="{H}" data-layout-allow-overflow>
    <div id="dance-stage" class="fd-stage" data-layout-ignore></div>
{labels}
  </div>
  <script>
{lib}
  </script>
  <script>
    (function () {{
      const D = {data};
      const show = FruitDance.mount(document.getElementById("dance-stage"), D);
      const tl = gsap.timeline({{ paused: true }});
      const clock = {{ t: 0 }};
      tl.to(clock, {{ t: D.dur, duration: D.dur, ease: "none", onUpdate: () => show.render(clock.t) }}, 0);
{tweens}
      show.render(0);
      window.__timelines["dance"] = tl;
    }})();
  </script>
</template>
"""

INDEX = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Fruit dance</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body {{ margin: 0; background: #000; }}
      #root {{ position: relative; width: {W}px; height: {H}px; overflow: hidden; background: #000; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{dur:.3f}" data-width="{W}" data-height="{H}" data-fps="30">
      <div id="dance" data-composition-id="dance" data-composition-src="compositions/dance.html" data-start="0" data-duration="{dur:.3f}" data-track-index="1" data-track-kind="graphics" data-width="{W}" data-height="{H}"></div>
{audios}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""


def write_project(path, fmt, segs, labels, bursts, voice_clips, dur, music):
    W, H = (1080, 1920) if fmt == "portrait" else (1920, 1080)
    if os.path.exists(path):
        shutil.rmtree(path)
    os.makedirs(os.path.join(path, "compositions"))
    os.makedirs(os.path.join(path, "assets", "voice"))
    data = {"W": W, "H": H, "bpm": BPM, "dur": round(dur, 3), "fruits": {fid: {"kind": fid} for fid, _, _ in FRUITS},
            "segments": segs, "bursts": bursts}
    lbl_html, tws = [], []
    for i, lb in enumerate(labels):
        lid = f"lbl{i}"
        letters = "".join(f"<span>{c}</span>" for c in lb["text"])
        lbl_html.append(f'    <div id="{lid}" class="lbl clip" data-start="{lb["start"]:.3f}" data-duration="{lb["dur"]:.3f}" style="color:{lb["color"]}">{letters}</div>')
        tws.append(f'      tl.fromTo("#{lid} span", {{ y: 120, scale: 0.3, opacity: 0 }}, {{ y: 0, scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.6)", stagger: 0.035 }}, {lb["start"]:.3f});')
        tws.append(f'      tl.to("#{lid} span", {{ y: -18, duration: {BEAT / 2:.3f}, ease: "sine.inOut", yoyo: true, repeat: 5, stagger: 0.03 }}, {lb["start"] + 0.6:.3f});')
    portrait = fmt == "portrait"
    html = SCENE.format(W=W, H=H, ly=1560 if portrait else 905, lsize=150 if portrait else 120, labels="\n".join(lbl_html),
                        lib=LIB, data=json.dumps(data, separators=(",", ":")), tweens="\n".join(tws))
    open(os.path.join(path, "compositions", "dance.html"), "w").write(html)
    audios = [f'      <audio id="music" class="clip" src="assets/music.wav" data-start="0" data-duration="{dur:.3f}" data-track-index="5" data-volume="0.8" data-timeline-role="music"></audio>']
    shutil.copy(music, os.path.join(path, "assets", "music.wav"))
    for i, (at, src, d) in enumerate(voice_clips):
        dst = os.path.join(path, "assets", "voice", os.path.basename(src))
        shutil.copy(src, dst)
        audios.append(f'      <audio id="voice{i}" class="clip" src="assets/voice/{os.path.basename(src)}" data-start="{at:.3f}" data-duration="{d:.3f}" data-track-index="{3 + i % 2}" data-volume="1.3"></audio>')
    open(os.path.join(path, "index.html"), "w").write(INDEX.format(W=W, H=H, dur=dur, audios="\n".join(audios)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--rounds", type=int, default=1)
    ap.add_argument("--format", default="both", choices=["portrait", "landscape", "both"])
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    out = os.path.abspath(a.out)
    cache = os.path.join(out, "voice-cache")
    os.makedirs(cache, exist_ok=True)
    segs, labels, bursts, says, dur = choreograph(a.rounds)
    clips = []
    for at, text in says:
        p = tts(text, VOICE["voice"], VOICE["speed"], VOICE["pitch"], cache)
        clips.append((at, p, sf.info(p).duration))
    music = os.path.join(out, "music.wav")
    subprocess.run([sys.executable, os.path.join(HERE, "dance_music.py"), music, "--seconds", f"{dur:.3f}", "--bpm", str(BPM), "--seed", str(a.seed)], check=True)
    fmts = ["portrait", "landscape"] if a.format == "both" else [a.format]
    for fmt in fmts:
        write_project(os.path.join(out, fmt), fmt, segs, labels, bursts, clips, dur, music)
    print(f"{dur:.1f}s, {len(segs)} segments -> {', '.join(fmts)}")


if __name__ == "__main__":
    main()
