#!/usr/bin/env python3
"""Upbeat, royalty-free dance track synthesised locally (no samples, no model).

    python3 dance_music.py out.wav --seconds 48 [--bpm 120] [--seed 1]

Four-on-the-floor kids pop: kick, clap, hats, bouncing bass, offbeat chord
stabs and a marimba hook over I-V-vi-IV. A drum fill closes every 8 bars.
The same seed always gives the same track.
"""
import argparse

import numpy as np
import soundfile as sf

SR = 48000
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(name):
    n, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[n] + 12 * (octave + 1) - 69) / 12)


def t_(dur):
    return np.arange(int(dur * SR)) / SR


def kick():
    t = t_(0.35)
    f = 50 + 110 * np.exp(-t / 0.04)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.18)


def clap(rng):
    t = t_(0.25)
    n = rng.standard_normal(len(t))
    n = np.diff(n, prepend=0)  # brighter
    return (0.6 * n * np.exp(-t / 0.07) + 0.3 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05))


def hat(rng, open_=False):
    t = t_(0.2 if open_ else 0.06)
    n = np.diff(rng.standard_normal(len(t) + 1))
    return n * np.exp(-t / (0.08 if open_ else 0.018)) * 0.5


def bass(f, dur):
    t = t_(dur)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(2 * np.pi * 2 * f * t) + 0.15 * np.sin(2 * np.pi * 3 * f * t)
    return x * np.minimum(1, t / 0.005) * np.exp(-t / 0.22)


def stab(freqs, dur=0.22):
    t = t_(dur)
    x = np.zeros(len(t))
    for f in freqs:
        for h, a in ((1, 1), (2, 0.4), (3, 0.25), (4, 0.12)):
            x += a * np.sin(2 * np.pi * f * h * t)
    return x / len(freqs) * np.exp(-t / 0.09)


def marimba(f, dur=0.6):
    t = t_(dur)
    x = np.sin(2 * np.pi * f * t) + 0.45 * np.sin(2 * np.pi * f * 3.9 * t) * np.exp(-t / 0.05) + 0.2 * np.sin(2 * np.pi * f * 9.2 * t) * np.exp(-t / 0.02)
    return x * np.exp(-t / 0.28)


def add(buf, sig, at, gain=1.0):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += gain * sig[: j - i]


def build(seconds, bpm=120, seed=1):
    rng = np.random.default_rng(seed)
    beat = 60 / bpm
    bar = 4 * beat
    nbars = int(np.ceil(seconds / bar))
    drums = np.zeros(int((nbars + 1) * bar * SR))
    music = np.zeros_like(drums)
    prog = [("C3", ["C4", "E4", "G4"]), ("G2", ["B3", "D4", "G4"]), ("A2", ["C4", "E4", "A4"]), ("F2", ["C4", "F4", "A4"])]
    # two 4-bar hooks (scale degrees in C major), picked per 8-bar section
    hooks = [
        ["E5", None, "G5", "E5", "C5", None, "D5", "E5", "D5", None, "B4", "D5", "G5", None, None, None,
         "C5", None, "E5", "C5", "A4", None, "C5", "E5", "F5", "E5", "D5", "C5", "D5", None, None, None],
        ["G5", "G5", "A5", "G5", "E5", None, "C5", None, "D5", "D5", "E5", "D5", "B4", None, "G4", None,
         "A4", "C5", "E5", "A5", "G5", None, "E5", None, "F5", "E5", "D5", "C5", "C5", None, None, None],
    ]
    k, c, h, ho = kick(), clap(rng), hat(rng), hat(rng, True)
    for b in range(nbars):
        t0 = b * bar
        root, chord = prog[b % 4]
        fill = b % 8 == 7
        for q in range(4):
            add(drums, k, t0 + q * beat, 0.95)
            if q in (1, 3):
                add(drums, c, t0 + q * beat, 0.55)
            add(drums, h, t0 + q * beat + beat / 2, 0.35)
            add(drums, h, t0 + q * beat, 0.18)
        if fill:  # snare roll into the next section
            for i in range(8):
                add(drums, clap(rng), t0 + 2 * beat + i * beat / 4, 0.25 + i * 0.05)
        else:
            add(drums, ho, t0 + 3.5 * beat, 0.3)
        for e in range(8):  # octave-bouncing eighth-note bass
            f = hz(root) * (2 if e % 2 else 1)
            add(music, bass(f, beat / 2), t0 + e * beat / 2, 0.42)
        for q in range(4):
            add(music, stab([hz(n) for n in chord]), t0 + q * beat + beat / 2, 0.22)
        hook = hooks[(b // 8) % 2]
        for i in range(8):  # eighth notes, 4 bars per hook
            n = hook[(b % 4) * 8 + i]
            if n:
                add(music, marimba(hz(n)), t0 + i * beat / 2, 0.42)
    mix = drums * 0.9 + music
    mix = mix[: int(seconds * SR)]
    fade = int(1.2 * SR)
    mix[-fade:] *= np.linspace(1, 0, fade)
    mix /= np.max(np.abs(mix)) / 0.89
    return mix.astype(np.float32)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--seconds", type=float, required=True)
    ap.add_argument("--bpm", type=float, default=120)
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    x = build(a.seconds, a.bpm, a.seed)
    sf.write(a.out, np.stack([x, x], axis=1), SR)
    print(f"{a.out}: {a.seconds:.1f}s at {a.bpm:g} bpm")


if __name__ == "__main__":
    main()
