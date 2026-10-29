#!/usr/bin/env python3
"""Series music bed: a seamless music-box lullaby loop, synthesised locally.

    python3 music.py series/<show>/music/bed.wav [--bpm 84] [--seed 1]

Royalty-free by construction (no samples, no model), identical on every run,
so every episode of the series shares the same recognisable theme.
"""
import argparse

import numpy as np
import soundfile as sf

SR = 48000
NOTE = {n: i for i, n in enumerate(["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"])}


def hz(name):
    """'C5' -> frequency."""
    n, octave = name[:-1], int(name[-1])
    return 440.0 * 2 ** ((NOTE[n] + 12 * (octave + 1) - 69) / 12)


def env(n, attack, decay):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack, 1e-4))
    return a * np.exp(-t / decay)


def music_box(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * f * 2.0 * t) * np.exp(-t / 0.4)
            + 0.18 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.15) + 0.08 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / 0.05))
    return tone * env(n, 0.002, 1.1)


def pluck_bass(f, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    return (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(2 * np.pi * 2 * f * t)) * env(n, 0.005, 0.5)


def pad(freqs, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        for det in (-0.12, 0.0, 0.12):
            x += np.sin(2 * np.pi * (f + det) * t + det * 7)
    a = np.minimum(1, t / 0.6) * np.minimum(1, (dur - t) / 0.6)
    return x * np.clip(a, 0, 1) / (len(freqs) * 3)


def add(buf, sig, at):
    i = int(at * SR)
    j = min(len(buf), i + len(sig))
    if j > i:
        buf[i:j] += sig[: j - i]


def reverb(x, seconds=2.2, mix=0.28, seed=3):
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR / (seconds / 5))
    ir /= np.sqrt(np.sum(ir ** 2))
    size = 1 << int(np.ceil(np.log2(len(x) + n)))
    wet = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(ir, size), size)[: len(x) + n]
    # wrap the tail onto the start so the loop stays seamless
    out = np.zeros(len(x))
    out += wet[: len(x)]
    out[: n] += wet[len(x):]
    return (1 - mix) * x + mix * out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--bpm", type=float, default=84)
    args = ap.parse_args()
    beat = 60 / args.bpm
    bar = 3 * beat  # waltz-time lullaby
    chords = [  # 16 bars: A A' B A''
        ("C", ["C3", "E3", "G3"]), ("A", ["A2", "C3", "E3"]), ("F", ["F2", "A2", "C3"]), ("G", ["G2", "B2", "D3"]),
        ("C", ["C3", "E3", "G3"]), ("A", ["A2", "C3", "E3"]), ("F", ["F2", "A2", "C3"]), ("G", ["G2", "B2", "D3"]),
        ("F", ["F2", "A2", "C3"]), ("C", ["C3", "E3", "G3"]), ("F", ["F2", "A2", "C3"]), ("G", ["G2", "B2", "D3"]),
        ("C", ["C3", "E3", "G3"]), ("A", ["A2", "C3", "E3"]), ("F", ["F2", "A2", "C3"]), ("G", ["G2", "B2", "D3"]),
    ]
    # melody: (bar, beat offset, note, length in beats)
    mel = [
        (0, 0, "E5", 1), (0, 1, "G5", 1), (0, 2, "E5", 1), (1, 0, "C5", 2), (1, 2, "E5", 1),
        (2, 0, "F5", 1), (2, 1, "A5", 1), (2, 2, "F5", 1), (3, 0, "D5", 3),
        (4, 0, "E5", 1), (4, 1, "G5", 1), (4, 2, "C6", 1), (5, 0, "A5", 2), (5, 2, "G5", 1),
        (6, 0, "F5", 1), (6, 1, "E5", 1), (6, 2, "D5", 1), (7, 0, "G4", 2), (7, 2, "B4", 1),
        (8, 0, "A5", 2), (8, 2, "G5", 1), (9, 0, "E5", 2), (9, 2, "C5", 1),
        (10, 0, "F5", 1), (10, 1, "E5", 1), (10, 2, "D5", 1), (11, 0, "D5", 2), (11, 2, "G5", 1),
        (12, 0, "E5", 1), (12, 1, "G5", 1), (12, 2, "E5", 1), (13, 0, "C5", 2), (13, 2, "E5", 1),
        (14, 0, "F5", 1), (14, 1, "D5", 1), (14, 2, "B4", 1), (15, 0, "C5", 3),
    ]
    total = len(chords) * bar
    buf = np.zeros(int(total * SR) + SR)
    for i, (_, notes) in enumerate(chords):
        t0 = i * bar
        add(buf, 0.22 * pad([hz(n) * 2 for n in notes], bar + 0.3), t0)
        add(buf, 0.35 * pluck_bass(hz(notes[0]) / 1, 1.2), t0)
        # soft celesta arpeggio on beats 2 and 3
        add(buf, 0.10 * music_box(hz(notes[1][:-1] + str(int(notes[1][-1]) + 2)), 1.0), t0 + beat)
        add(buf, 0.09 * music_box(hz(notes[2][:-1] + str(int(notes[2][-1]) + 2)), 1.0), t0 + 2 * beat)
    for b, off, n, ln in mel:
        add(buf, 0.30 * music_box(hz(n), max(1.2, ln * beat + 0.8)), b * bar + off * beat)
    # fold the overhang back to the start so the file loops cleanly
    n = int(total * SR)
    loop = buf[:n].copy()
    loop[: len(buf) - n] += buf[n:]
    loop = reverb(loop)
    loop /= np.max(np.abs(loop)) / 0.8
    sf.write(args.out, np.stack([loop, loop], axis=1).astype(np.float32), SR)
    print(f"{args.out}: {total:.1f}s loop")


if __name__ == "__main__":
    main()
