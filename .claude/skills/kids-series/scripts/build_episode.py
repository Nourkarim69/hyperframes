#!/usr/bin/env python3
"""Build one kids-series episode: episode.json + cast.json -> voices, lip sync,
a 16:9 long-form HyperFrames project and one 9:16 HyperFrames project per Short.

    python3 build_episode.py series/<show>/<episode-dir>

Writes <episode-dir>/build/{long,shorts/<id>}/ (HyperFrames projects) and
<episode-dir>/build/publish.json (titles, descriptions, tags). Render with
render_episode.sh. Voice clips are cached by text+voice, so re-runs after a
script tweak only synthesise the lines that changed.
"""
import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
import sys

import numpy as np
import soundfile as sf

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE = os.path.expanduser("~/.cache/hyperframes")
KOKORO_MODEL = f"{CACHE}/tts/models/kokoro-v1.0.onnx"
KOKORO_VOICES = f"{CACHE}/tts/voices/voices-v1.0.bin"
SFX_DIR = os.path.normpath(os.path.join(HERE, "../../../../skills/media-use/audio/assets/sfx"))
FPS = 30
GROUND = 860
LEAD_IN, TAIL, GAP = 0.7, 0.8, 0.35

GEST_DUR = {
    "wave": 1.8, "cheer": 1.5, "hop": 0.6, "jump": 0.9, "point": 1.8, "think": 2.6, "shrug": 1.2,
    "hug": 1.6, "shake": 1.0, "nod": 1.0, "headshake": 1.0, "spin": 0.8, "bounce": 1.8,
}

LONG = {"W": 1920, "H": 1080}
WIDE = [960, 610, 1.22]  # long-form wide shot: centre x, centre y, zoom
SHORT = {"W": 1080, "H": 1920, "zoom": 1.6, "groundY": 1400}


# ---------------------------------------------------------------- audio
_kokoro = None


def kokoro():
    global _kokoro
    if _kokoro is None:
        from kokoro_onnx import Kokoro

        _kokoro = Kokoro(KOKORO_MODEL, KOKORO_VOICES)
    return _kokoro


def trim_silence(x, sr, thr=0.01, pad=0.06):
    idx = np.where(np.abs(x) > thr)[0]
    if len(idx) == 0:
        return x
    a = max(0, idx[0] - int(pad * sr))
    b = min(len(x), idx[-1] + int(pad * sr))
    return x[a:b]


def tts(text, voice, speed, pitch, out_dir):
    key = hashlib.sha1(f"{text}|{voice}|{speed}|{pitch}".encode()).hexdigest()[:12]
    path = os.path.join(out_dir, f"{key}.wav")
    if os.path.exists(path):
        return path
    lang = "en-gb" if voice.startswith("b") else "en-us"
    samples, sr = kokoro().create(text, voice=voice, speed=speed, lang=lang)
    samples = trim_silence(np.asarray(samples, dtype=np.float32), sr)
    tmp = path + ".raw.wav"
    sf.write(tmp, samples, sr)
    if pitch:
        r = 2 ** (pitch / 12)
        filt = f"asetrate={int(sr * r)},aresample={sr},atempo={1 / r:.5f}"
    else:
        filt = "anull"
    # Cartoon voices: pitch up without changing tempo, light compression, peak-normalise.
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-af",
         f"{filt},acompressor=threshold=-18dB:ratio=3:attack=5:release=60,loudnorm=I=-16:TP=-1.5:LRA=7",
         "-ar", "48000", "-ac", "1", path],
        check=True,
    )
    os.remove(tmp)
    return path


def wav_info(path):
    x, sr = sf.read(path, dtype="float32")
    if x.ndim > 1:
        x = x.mean(axis=1)
    return x, sr


def mouth_track(path):
    """Per-frame mouth openness 0-9 from the clip's loudness envelope."""
    x, sr = wav_info(path)
    hop = sr // FPS
    n = max(1, len(x) // hop)
    rms = np.array([np.sqrt(np.mean(x[i * hop:(i + 1) * hop] ** 2) + 1e-12) for i in range(n)])
    ref = np.percentile(rms, 92) or 1.0
    v = np.clip(rms / ref, 0, 1)
    v = np.where(v < 0.18, 0, v)
    # syllable flap: emphasise local peaks so the jaw visibly opens and closes
    sm = np.convolve(v, [0.25, 0.5, 0.25], mode="same")
    return "".join(str(int(round(min(1, a) ** 0.8 * 9))) for a in sm), len(x) / sr


# ---------------------------------------------------------------- timing
def resolve_scene(scene, cast, voice_dir):
    """Walk the beats, synthesise lines, and return keyed tracks in scene time."""
    chars = {}
    for cid, c in scene["chars"].items():
        spec = cast["characters"][cid]
        chars[cid] = {
            "species": spec["species"],
            "scale": c.get("scale", spec.get("scale", 1)),
            "x": c["x"],
            "y": c.get("y", GROUND),
            "moves": [], "emo": [[0, c.get("emo", "neutral")]], "face": [[0, c.get("face", 1)]],
            "look": [[0, c["look"]]] if c.get("look") else [], "gest": [], "mouth": [],
            "glow": [[0, c.get("glow", 1)]],
            "z": c.get("z", 0),
        }
    lines, sfx, fx, cams = [], [], [], []
    t = LEAD_IN
    pos = {cid: [c["x"], c["y"]] for cid, c in chars.items()}
    for bi, beat in enumerate(scene["beats"]):
        start = t
        length = 0.0
        speaker = beat.get("say")
        if speaker:
            who = cast["narrator"] if speaker == "narrator" else cast["characters"][speaker]
            path = tts(beat["text"], who["voice"], who.get("speed", 1), who.get("pitch", 0), voice_dir)
            digits, dur = mouth_track(path)
            lines.append({"id": f"{scene['id']}-{bi:02d}", "who": speaker, "text": beat["text"], "start": start, "dur": dur, "path": path})
            if speaker in chars:
                chars[speaker]["mouth"].append([round(start, 3), FPS, digits])
                # listeners turn their eyes to whoever talks
                for cid in chars:
                    if cid != speaker and "look" not in beat.get("do", {}).get(cid, {}):
                        chars[cid]["look"].append([round(start, 3), speaker])
            length = dur + GAP
        for cid, act in beat.get("do", {}).items():
            c = chars[cid]
            at = start + act.get("at", 0)
            if "emo" in act:
                c["emo"].append([round(at, 3), act["emo"]])
            if "look" in act:
                c["look"].append([round(at, 3), act["look"]])
            if "face" in act:
                c["face"].append([round(at, 3), act["face"]])
            if "glow" in act:
                c["glow"].append([round(at, 3), act["glow"]])
            if "gest" in act:
                g = act["gest"]
                d = GEST_DUR.get(g, 1.2)
                if g in ("wave", "point", "think", "bounce") and speaker == cid:
                    d = max(d, min(lines[-1]["dur"], 3.5))
                c["gest"].append([round(at, 3), g, d])
            if "move" in act:
                tx = act["move"][0]
                ty = act["move"][1] if len(act["move"]) > 1 else pos[cid][1]
                dist = math.hypot(tx - pos[cid][0], ty - pos[cid][1])
                d = act.get("time", max(0.6, dist / 320))
                kind = "float" if c["species"] == "star" else "walk"
                c["moves"].append([round(at, 3), tx, ty, round(d, 3), kind])
                if kind == "walk" and abs(tx - pos[cid][0]) > 30 and "face" not in act:
                    c["face"].append([round(at, 3), 1 if tx > pos[cid][0] else -1])
                pos[cid] = [tx, ty]
                length = max(length, act.get("at", 0) + (d if not speaker else 0))
        for name in beat.get("sfx", []):
            sfx.append({"name": name, "start": start})
        for item in beat.get("fx", []):
            kind = item[0]
            if kind == "flash":
                fx.append([round(start + item[1], 3), "flash"])
            elif kind == "trail":
                fx.append([round(start, 3), "trail", item[1], 0, item[2]])
            elif kind == "sparkles":
                cid = item[1]
                x, y = pos[cid]
                lift = 150 * chars[cid]["scale"] if chars[cid]["species"] == "star" else 200 * chars[cid]["scale"]
                fx.append([round(start, 3), "sparkles", x, y - lift, item[2]])
        if "cam" in beat:
            cams.append([start, beat["cam"]])
        length = max(length, beat.get("wait", 0))
        t = start + length
    dur = round(t + TAIL, 3)
    for c in chars.values():
        for k in ("emo", "face", "look", "glow", "gest", "moves"):
            c[k].sort(key=lambda k_: k_[0])
    return {"id": scene["id"], "setting": scene["setting"], "chars": chars, "lines": lines, "sfx": sfx,
            "fx": fx, "cams": cams, "dur": dur, "overlay": scene.get("overlay", [])}


def char_pos(c, t):
    x, y = c["x"], c["y"]
    for t0, tx, ty, d, _ in c["moves"]:
        if t < t0:
            break
        u = 1 if d <= 0 else min(1, (t - t0) / d)
        x, y = x + (tx - x) * u, y + (ty - y) * u
    return x, y


def head_center(c, t):
    x, y = char_pos(c, t)
    s = c["scale"]
    return x, y - (150 if c["species"] == "star" else 200) * s


def cam_keys_long(sc):
    keys = [[0, *WIDE, 0]]
    for t, target in sc["cams"]:
        if target == "wide":
            keys.append([round(t, 3), *WIDE, 0.9])
        elif target in sc["chars"]:
            c = sc["chars"][target]
            hx, hy = head_center(c, t + 0.5)
            z = 1.75
            cx = min(max(hx, 1920 / (2 * z) - 200), 1920 - 1920 / (2 * z) + 200)
            cy = min(hy + 40, GROUND + 60 - 1080 / (2 * z) + 60)
            keys.append([round(t, 3), round(cx, 1), round(cy, 1), z, 0.9])
    # slow drift so wide shots never sit dead still
    return keys


def visible(c, t):
    x, y = char_pos(c, t)
    return -100 < x < 2020 and y > -50


def cam_keys_short(sc):
    z0 = SHORT["zoom"]
    cy0 = GROUND - (SHORT["groundY"] - SHORT["H"] / 2) / z0

    def group_x(t):
        xs = [char_pos(c, t)[0] for c in sc["chars"].values() if visible(c, t)]
        return sum(xs) / len(xs) if xs else 960

    keys = [[0, round(group_x(0.01), 1), round(cy0, 1), z0, 0]]
    # at equal times the camera command comes after the line, so it wins
    events = sorted([(ln["start"], ln["who"]) for ln in sc["lines"]] + [(t, ("cam", v)) for t, v in sc["cams"]],
                    key=lambda e: (e[0], isinstance(e[1], tuple)))
    for t, who in events:
        if isinstance(who, tuple):
            if who[1] in sc["chars"]:
                c = sc["chars"][who[1]]
                hx, hy = head_center(c, t + 0.5)
                keys.append([round(t, 3), round(hx, 1), round(hy + 60, 1), 2.05, 0.8])
            continue
        if who in sc["chars"] and visible(sc["chars"][who], t + 0.3):
            x = char_pos(sc["chars"][who], t + 0.3)[0]
            gx = group_x(t + 0.3)
            x = gx + (x - gx) * 0.45
        else:
            x = group_x(t + 0.3)
        keys.append([round(t, 3), round(x, 1), round(cy0, 1), z0, 0.7])
    return keys


# ---------------------------------------------------------------- html
LIB = open(os.path.join(HERE, "kidsrig.js")).read()

SCENE_TMPL = """<template>
  <style>
    #root {{ position: absolute; inset: 0; overflow: hidden; background: #0b1530; }}
    .kr-stage {{ position: absolute; inset: 0; }}
    .ov {{ position: absolute; left: 0; width: 100%; text-align: center; font-family: Nunito, sans-serif; color: #fff;
      font-weight: 900; -webkit-text-stroke: {stroke}px #2b1650; paint-order: stroke fill; text-shadow: 0 8px 0 rgba(43,22,80,.55); }}
    .ov span {{ display: inline-block; }}
  </style>
  <div id="root" data-composition-id="{id}" data-width="{W}" data-height="{H}" data-layout-allow-overflow>
    <div id="{id}-stage" class="kr-stage" data-layout-ignore></div>
{overlays}
  </div>
  <script>
{lib}
  </script>
  <script>
    (function () {{
      const D = {data};
      const rig = KidsRig.mount(document.getElementById("{id}-stage"), D);
      const tl = gsap.timeline({{ paused: true }});
      const clock = {{ t: 0 }};
      tl.to(clock, {{ t: D.dur, duration: D.dur, ease: "none", onUpdate: () => rig.render(clock.t) }}, 0);
{tweens}
      rig.render(0);
      window.__timelines["{id}"] = tl;
    }})();
  </script>
</template>
"""


def overlay_html(sid, items, W, H):
    html, tw = [], []
    for i, it in enumerate(items):
        oid = f"{sid}-ov{i}"
        size = it.get("size", 120)
        letters = "".join(f"<span>{'&nbsp;' if ch == ' ' else ch}</span>" for ch in it["text"]) if it.get("bounce") else it["text"]
        html.append(
            f'    <div id="{oid}" class="ov clip" data-start="{it["at"]}" data-duration="{it["dur"]}" '
            f'style="top:{it["y"]}px;font-size:{size}px;line-height:1.05;color:{it.get("color", "#fff")}" data-layout-allow-overflow>'
            f'<div class="ov-in">{letters}</div></div>'
        )
        at = it["at"]
        if it.get("bounce"):
            tw.append(f'      tl.fromTo("#{oid} span", {{ y: -260, opacity: 0, rotation: -12 }}, {{ y: 0, opacity: 1, rotation: 0, duration: 0.55, ease: "back.out(2.2)", stagger: 0.045 }}, {at + 0.05});')
        else:
            tw.append(f'      tl.fromTo("#{oid} .ov-in", {{ scale: 0.4, opacity: 0 }}, {{ scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }}, {at + 0.05});')
        tw.append(f'      tl.to("#{oid} .ov-in", {{ opacity: 0, y: -30, duration: 0.3, ease: "power2.in" }}, {at + it["dur"] - 0.35});')
    return "\n".join(html), "\n".join(tw)


def scene_data(sc, fmt, cam_keys):
    chars = {}
    for cid, c in sc["chars"].items():
        chars[cid] = {k: c[k] for k in ("species", "scale", "x", "y", "moves", "emo", "face", "look", "gest", "mouth", "glow", "z")}
    return {
        "W": fmt["W"], "H": fmt["H"], "dur": sc["dur"], "setting": sc["setting"], "chars": chars,
        "fx": sc["fx"], "cam": cam_keys, "fadeIn": 0.4, "fadeOut": 0.4,
    }


def write_scene(project, sc, fmt, cam_keys, overlays=()):
    data = scene_data(sc, fmt, cam_keys)
    ov_html, ov_tw = overlay_html(sc["id"], overlays, fmt["W"], fmt["H"])
    html = SCENE_TMPL.format(
        id=sc["id"], W=fmt["W"], H=fmt["H"], lib=LIB, data=json.dumps(data, separators=(",", ":")),
        overlays=ov_html, tweens=ov_tw, stroke=10 if fmt["W"] > fmt["H"] else 9,
    )
    with open(os.path.join(project, "compositions", f"{sc['id']}.html"), "w") as fh:
        fh.write(html)


def host(sid, start, dur, fmt, track):
    return (f'      <div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" '
            f'data-start="{start:.3f}" data-duration="{dur:.3f}" data-track-index="{track}" data-track-kind="graphics" '
            f'data-width="{fmt["W"]}" data-height="{fmt["H"]}"></div>')


def audio_tag(aid, src, start, dur, vol, track, extra=""):
    return (f'      <audio id="{aid}" class="clip" src="{src}" data-start="{start:.3f}" data-duration="{dur:.3f}" '
            f'data-track-index="{track}" data-volume="{vol}"{extra}></audio>')


def index_html(title, fmt, total, hosts, audios):
    return f"""<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>{title}</title>
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
    <style>
      html, body {{ margin: 0; background: #0b1530; }}
      #root {{ position: relative; width: {fmt["W"]}px; height: {fmt["H"]}px; overflow: hidden; background: #0b1530; }}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="{total:.3f}" data-width="{fmt["W"]}" data-height="{fmt["H"]}" data-fps="{FPS}">
{chr(10).join(hosts)}
{chr(10).join(audios)}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""


def sfx_file(name):
    for ext in (".mp3", ".wav"):
        p = os.path.join(SFX_DIR, name + ext)
        if os.path.exists(p):
            return p
    return None


def music_bed(series_dir, length, out):
    """Loop the series music bed to `length` seconds with a crossfade and a tail fade."""
    src = None
    for name in ("bed.wav", "bed.mp3"):
        p = os.path.join(series_dir, "music", name)
        if os.path.exists(p):
            src = p
    if not src:
        # the theme is synthesised deterministically, so it is rebuilt rather than committed
        src = os.path.join(series_dir, "music", "bed.wav")
        os.makedirs(os.path.dirname(src), exist_ok=True)
        subprocess.run([sys.executable, os.path.join(HERE, "music.py"), src], check=True)
    x, sr = wav_info(src)
    need = int((length + 0.5) * sr)
    xf = int(1.5 * sr)
    y = x.copy()
    while len(y) < need:
        a, b = y[:-xf], y[-xf:]
        ramp = np.linspace(0, 1, xf, dtype=np.float32)
        y = np.concatenate([a, b * (1 - ramp) + x[:xf] * ramp, x[xf:]])
    y = y[:need]
    fade = int(2.5 * sr)
    y[-fade:] *= np.linspace(1, 0, fade, dtype=np.float32)
    fin = int(1.0 * sr)
    y[:fin] *= np.linspace(0, 1, fin, dtype=np.float32)
    sf.write(out, y, sr)
    return out


def copy_asset(project, src, sub):
    d = os.path.join(project, "assets", sub)
    os.makedirs(d, exist_ok=True)
    dst = os.path.join(d, os.path.basename(src))
    if not os.path.exists(dst):
        shutil.copy(src, dst)
    return f"assets/{sub}/{os.path.basename(src)}"


def new_project(path):
    if os.path.exists(path):
        shutil.rmtree(path)
    os.makedirs(os.path.join(path, "compositions"))
    os.makedirs(os.path.join(path, "assets"))


# ---------------------------------------------------------------- captions (Shorts)
CAP_TMPL = """<template>
  <style>
    #root {{ position: absolute; inset: 0; }}
    .cap {{ position: absolute; left: 70px; right: 70px; top: {top}px; text-align: center; font-family: Nunito, sans-serif;
      font-weight: 900; font-size: 84px; line-height: 1.1; color: #fff; -webkit-text-stroke: 12px #2b1650; paint-order: stroke fill;
      text-shadow: 0 7px 0 rgba(43,22,80,.6); }}
    .cap .w {{ display: inline-block; }}
    .cap.who-pip .hl {{ color: #ffb04a; }}
    .cap.who-hazel .hl {{ color: #ff8fc0; }}
    .cap.who-ollie .hl {{ color: #9fd0ff; }}
    .cap.who-twinkle .hl {{ color: #ffe45c; }}
    .cap.who-narrator .hl {{ color: #b9f5c9; }}
    .hook {{ position: absolute; left: 60px; right: 60px; top: 150px; text-align: center; font-family: Nunito, sans-serif;
      font-weight: 900; font-size: 78px; line-height: 1.08; color: #fff; }}
    .hook .pill {{ display: inline-block; background: #ffd84a; color: #2b1650; padding: 22px 36px; border-radius: 36px;
      border: 8px solid #2b1650; box-shadow: 0 10px 0 #2b1650; }}
    .brand {{ position: absolute; left: 0; right: 0; top: 70px; text-align: center; font-family: Nunito, sans-serif; font-weight: 900;
      font-size: 44px; color: #fff; letter-spacing: 2px; opacity: .9; -webkit-text-stroke: 7px #2b1650; paint-order: stroke fill; }}
  </style>
  <div id="root" data-composition-id="captions" data-width="1080" data-height="1920" data-layout-allow-overflow>
    <div id="cap-brand" class="brand clip" data-start="0" data-duration="{total}">{brand}</div>
    <div id="cap-hook" class="hook clip" data-start="0" data-duration="{hookdur}"><span class="pill" id="cap-hook-pill">{hook}</span></div>
{caps}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    tl.fromTo("#cap-hook-pill", {{ scale: 0.3, rotation: -6, opacity: 0 }}, {{ scale: 1, rotation: -2, opacity: 1, duration: 0.5, ease: "back.out(2.4)" }}, 0.15);
    tl.to("#cap-hook-pill", {{ rotation: 2, duration: 0.25, ease: "sine.inOut", yoyo: true, repeat: 3 }}, 0.7);
{tweens}
    window.__timelines["captions"] = tl;
  </script>
</template>
"""


def chunk_words(text, max_words=3):
    words = text.split()
    out, cur = [], []
    for w in words:
        cur.append(w)
        if len(cur) >= max_words or re.search(r"[.!?,…]$", w):
            out.append(cur)
            cur = []
    if cur:
        out.append(cur)
    return out


def captions_html(lines, total, hook, brand, hookdur):
    caps, tws = [], []
    n = 0
    for ln in lines:
        chunks = chunk_words(ln["text"])
        weights = [sum(len(w) for w in c) + 2 for c in chunks]
        tot = sum(weights)
        t = ln["start"]
        for c, wgt in zip(chunks, weights):
            d = ln["dur"] * wgt / tot
            cid = f"cap{n}"
            words = " ".join(f'<span class="w{" hl" if i == len(c) - 1 and len(c) > 1 else ""}">{w}</span>' for i, w in enumerate(c))
            caps.append(f'    <div id="{cid}" class="cap clip who-{ln["who"]}" data-start="{t:.3f}" data-duration="{d:.3f}">{words}</div>')
            tws.append(f'    tl.fromTo("#{cid} .w", {{ scale: 0.55, y: 30, opacity: 0 }}, {{ scale: 1, y: 0, opacity: 1, duration: 0.18, ease: "back.out(3)", stagger: 0.06 }}, {t:.3f});')
            t += d
            n += 1
    return CAP_TMPL.format(top=1530, total=f"{total:.3f}", hookdur=f"{hookdur:.3f}", hook=hook, brand=brand,
                           caps="\n".join(caps), tweens="\n".join(tws))


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("episode_dir")
    args = ap.parse_args()
    ep_dir = os.path.abspath(args.episode_dir)
    series_dir = os.path.dirname(ep_dir)
    ep = json.load(open(os.path.join(ep_dir, "episode.json")))
    cast = json.load(open(os.path.join(series_dir, "cast.json")))
    build = os.path.join(ep_dir, "build")
    voice_dir = os.path.join(build, "voice-cache")
    os.makedirs(voice_dir, exist_ok=True)
    series = cast["series"]
    main_cast = [c for c in ("pip", "hazel", "ollie") if c in cast["characters"]]

    # intro + outro are ordinary rig scenes with title overlays
    intro = {
        "id": "intro", "setting": {"place": "burrow", "time": "night", "seed": "intro"},
        "chars": {cid: {"x": 620 + i * 340, "face": 1 if i < 1 else -1, "emo": "happy"} for i, cid in enumerate(main_cast)},
        "beats": [
            {"wait": 1.2},
            {"say": "narrator", "text": f"{series}!", "do": {cid: {"gest": "cheer", "at": 0.1 * i} for i, cid in enumerate(main_cast)}, "sfx": ["sparkle"]},
            {"say": "narrator", "text": f"Episode {ep['number']}. {ep['title']}.", "do": {main_cast[0]: {"gest": "wave"}}},
            {"wait": 0.6},
        ],
    }
    outro = {
        "id": "outro", "setting": {"place": "burrow", "time": "night", "seed": "outro"},
        "chars": {cid: {"x": 620 + i * 340, "face": 1 if i < 1 else -1, "emo": "happy"} for i, cid in enumerate(main_cast)},
        "beats": [
            {"say": "narrator", "text": "The End.", "do": {cid: {"gest": "wave", "at": 0.15 * i} for i, cid in enumerate(main_cast)}, "sfx": ["chime"]},
            {"say": "narrator", "text": ep.get("next", "See you next time!")},
            {"say": "narrator", "text": "See you next time, friends!", "do": {cid: {"gest": "cheer", "at": 0.1 * i} for i, cid in enumerate(main_cast)}},
            {"wait": 1.5},
        ],
    }
    print("synthesising voices ...", flush=True)
    scenes = [resolve_scene(s, cast, voice_dir) for s in [intro] + ep["scenes"] + [outro]]
    by_id = {s["id"]: s for s in scenes}
    si, so = by_id["intro"], by_id["outro"]
    si["overlay"] = [
        {"text": series, "at": 1.0, "dur": si["dur"] - 1.2, "y": 110, "size": 150, "bounce": True, "color": "#FFD84A"},
        {"text": f"Episode {ep['number']}: {ep['title']}", "at": si["lines"][1]["start"], "dur": si["dur"] - si["lines"][1]["start"] - 0.2, "y": 300, "size": 72},
    ]
    so["overlay"] = [
        {"text": "The End", "at": 0.6, "dur": so["lines"][1]["start"] - 0.4, "y": 160, "size": 170, "bounce": True, "color": "#FFD84A"},
        {"text": "See you next time!", "at": so["lines"][2]["start"], "dur": so["dur"] - so["lines"][2]["start"] - 0.2, "y": 180, "size": 120, "bounce": True},
    ]

    # ---- long form
    long_dir = os.path.join(build, "long")
    new_project(long_dir)
    hosts, audios, t = [], [], 0.0
    for sc in scenes:
        write_scene(long_dir, sc, LONG, cam_keys_long(sc), sc.get("overlay", []))
        hosts.append(host(sc["id"], t, sc["dur"], LONG, 1))
        for ln in sc["lines"]:
            src = copy_asset(long_dir, ln["path"], "voice")
            audios.append(audio_tag(f"v-{ln['id']}", src, t + ln["start"], ln["dur"], 1, 3))
        for k, s in enumerate(sc["sfx"]):
            p = sfx_file(s["name"])
            if p:
                d = min(sf.info(p).duration, 4.0)
                audios.append(audio_tag(f"sfx-{sc['id']}-{k}", copy_asset(long_dir, p, "sfx"), t + s["start"], d, 0.35, 4 + k % 3))
        sc["abs"] = t
        t += sc["dur"]
    total = t
    bed = music_bed(series_dir, total, os.path.join(long_dir, "assets", "music.wav"))
    if bed:
        audios.append(audio_tag("music", "assets/music.wav", 0, total, 0.13, 7, ' data-timeline-role="music"'))
    with open(os.path.join(long_dir, "index.html"), "w") as fh:
        fh.write(index_html(f"{series} - {ep['title']}", LONG, total, hosts, audios))
    print(f"long-form: {total:.1f}s, {len(scenes)} scenes", flush=True)

    # ---- shorts
    publish = {
        "long": {
            "file": "out/long.mp4", "duration_s": round(total, 1),
            "title": f"{ep['title']} | {series} | Bedtime Stories for Kids",
            "description": f"{ep['title']} - Episode {ep['number']} of {series}. {ep.get('lesson', '')}\n\n"
                           f"Join Pip the little fox and friends for gentle bedtime adventures in Whispering Woods.\n\n#kids #bedtimestories #cartoon",
            "tags": ["kids story", "bedtime story", "cartoon for kids", "story for toddlers", series, ep["title"]],
            "made_for_kids": True,
        },
        "shorts": [],
    }
    for sh in ep.get("shorts", []):
        sdir = os.path.join(build, "shorts", sh["id"])
        new_project(sdir)
        hosts, audios, lines = [], [], []
        t = 0.0
        for sid in sh["scenes"]:
            sc = by_id[sid]
            write_scene(sdir, sc, SHORT, cam_keys_short(sc))
            hosts.append(host(sid, t, sc["dur"], SHORT, 1))
            for ln in sc["lines"]:
                src = copy_asset(sdir, ln["path"], "voice")
                audios.append(audio_tag(f"v-{ln['id']}", src, t + ln["start"], ln["dur"], 1, 3))
                lines.append(dict(ln, start=t + ln["start"]))
            for k, s in enumerate(sc["sfx"]):
                p = sfx_file(s["name"])
                if p:
                    d = min(sf.info(p).duration, 4.0)
                    audios.append(audio_tag(f"sfx-{sid}-{k}", copy_asset(sdir, p, "sfx"), t + s["start"], d, 0.35, 4 + k % 3))
            t += sc["dur"]
        # end card: Pip waving + call to watch the episode
        end = resolve_scene({
            "id": "endcard", "setting": {"place": "burrow", "time": "night", "seed": "end"},
            "chars": {"pip": {"x": 960, "face": 1, "emo": "excited"}},
            "beats": [{"wait": 3.2, "do": {"pip": {"gest": "wave"}}}],
        }, cast, os.path.join(build, "voice-cache"))
        endcam = [[0, 960, GROUND - (SHORT["groundY"] - SHORT["H"] / 2) / SHORT["zoom"], SHORT["zoom"], 0]]
        write_scene(sdir, end, SHORT, endcam, [
            {"text": "Watch the", "at": 0.1, "dur": end["dur"] - 0.2, "y": 260, "size": 100},
            {"text": "FULL EPISODE!", "at": 0.25, "dur": end["dur"] - 0.35, "y": 380, "size": 120, "bounce": True, "color": "#FFD84A"},
        ])
        hosts.append(host("endcard", t, end["dur"], SHORT, 1))
        t += end["dur"]
        total_s = t
        cap = captions_html(lines, total_s, sh["hook"], series.upper(), total_s - end["dur"])
        with open(os.path.join(sdir, "compositions", "captions.html"), "w") as fh:
            fh.write(cap)
        hosts.append(f'      <div id="captions" data-composition-id="captions" data-composition-src="compositions/captions.html" '
                     f'data-start="0" data-duration="{total_s:.3f}" data-track-index="2" data-track-kind="captions" '
                     f'data-width="1080" data-height="1920" style="z-index: 5"></div>')
        bed = music_bed(series_dir, total_s, os.path.join(sdir, "assets", "music.wav"))
        if bed:
            audios.append(audio_tag("music", "assets/music.wav", 0, total_s, 0.16, 7, ' data-timeline-role="music"'))
        with open(os.path.join(sdir, "index.html"), "w") as fh:
            fh.write(index_html(f"{series} - {sh['hook']}", SHORT, total_s, hosts, audios))
        publish["shorts"].append({
            "id": sh["id"], "file": f"out/{sh['id']}.mp4", "duration_s": round(total_s, 1),
            "title": f"{sh['hook']} #shorts #kids",
            "description": f"From \"{ep['title']}\" - {series} episode {ep['number']}. Full episode on the channel!\n#shorts #kidsstory #cartoon",
        })
        print(f"short {sh['id']}: {total_s:.1f}s", flush=True)
    with open(os.path.join(build, "publish.json"), "w") as fh:
        json.dump(publish, fh, indent=2)


if __name__ == "__main__":
    sys.exit(main())
