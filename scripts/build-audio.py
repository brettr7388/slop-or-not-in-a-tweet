"""Synthesizes the lo-fi background loop (public/audio/loop.mp3). No samples, no third-party audio.

The track is periodic with period CYCLE seconds. We render three cycles and keep cycle two plus one
second, so any CYCLE-long window loops without a seam (scripts/build-loop.py cuts the game loop from it),
whatever padding the MP3 decoder adds at the start.
"""
import numpy as np, subprocess, pathlib

SR = 22050
BPM = 80
BEAT = 60 / BPM
BARS = 4
CYCLE = BARS * 4 * BEAT  # 12 s
N = int(round(CYCLE * SR))
rng = np.random.default_rng(7)

def note(m): return 440 * 2 ** ((m - 69) / 12)
CHORDS = [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]]  # Fmaj7 Em7 Dm7 Cmaj7
ROOTS = [41, 40, 38, 36]

out = np.zeros(N * 3 + SR * 4)

def add(t, sig):
    for c in range(3):
        i = int(round((t + c * CYCLE) * SR))
        out[i:i + len(sig)] += sig[: len(out) - i]

def keys(freqs, dur, vel):
    n = int(dur * SR); t = np.arange(n) / SR
    env = np.exp(-t * 2.2) * np.minimum(1, t / 0.008)
    trem = 1 + 0.08 * np.sin(2 * np.pi * 4.5 * t)
    s = sum(np.sin(2 * np.pi * f * t * (1 + d)) + 0.25 * np.sin(4 * np.pi * f * t) * np.exp(-t * 6)
            for f in freqs for d in (-0.0015, 0.0015))
    return vel * s * env * trem / len(freqs)

def bass(f, dur):
    n = int(dur * SR); t = np.arange(n) / SR
    env = np.minimum(1, t / 0.01) * np.exp(-t * 1.6)
    return 0.32 * env * (np.sin(2 * np.pi * f * t) + 0.15 * np.sin(4 * np.pi * f * t))

def kick():
    n = int(0.35 * SR); t = np.arange(n) / SR
    f = 45 + 75 * np.exp(-t * 30)
    return 0.55 * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def lowpass(x, a):
    y = np.zeros_like(x); acc = 0.0
    for i, v in enumerate(x):
        acc += a * (v - acc); y[i] = acc
    return y

SNARE_NOISE = rng.standard_normal(int(0.2 * SR))
HAT_NOISE = rng.standard_normal(int(0.05 * SR))
def snare():
    t = np.arange(len(SNARE_NOISE)) / SR
    body = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 25)
    noise = (SNARE_NOISE - lowpass(SNARE_NOISE, 0.08)) * np.exp(-t * 18)
    return 0.16 * (0.6 * body + noise)
def hat(v):
    t = np.arange(len(HAT_NOISE)) / SR
    return v * (HAT_NOISE - lowpass(HAT_NOISE, 0.5)) * np.exp(-t * 70)

K, S = kick(), snare()
for bar in range(BARS):
    b0 = bar * 4 * BEAT
    freqs = [note(m) for m in CHORDS[bar]]
    add(b0, keys(freqs, 2.4, 0.33))
    add(b0 + 1.5 * BEAT, keys(freqs[1:], 1.6, 0.18))
    add(b0 + 3 * BEAT + 0.5 * BEAT, keys(freqs[2:], 1.2, 0.12))
    add(b0, bass(note(ROOTS[bar]), 1.4))
    add(b0 + 2.5 * BEAT, bass(note(ROOTS[bar] + 7), 0.9))
    for k in (0, 2.5): add(b0 + k * BEAT, K)
    for s in (1, 3): add(b0 + s * BEAT, S)
    for e in range(8):
        swing = 0.08 * BEAT if e % 2 else 0
        add(b0 + e * 0.5 * BEAT + swing, hat(0.05 if e % 2 else 0.08))

# vinyl: one cycle of soft hiss + crackle, tiled so it stays periodic
hiss = lowpass(rng.standard_normal(N), 0.15) * 0.012
for i in rng.integers(0, N, 90):
    hiss[i] += rng.uniform(-0.12, 0.12)
out[: 3 * N] += np.tile(hiss, 3)

warm = lowpass(out, 0.35)          # take the edge off, like a worn tape
seg = warm[N : 2 * N + SR]          # cycle two + 1 s (periodic, so any 12 s window loops cleanly)
seg = seg / np.max(np.abs(seg)) * 0.7

pcm = (seg * 32767).astype('<i2').tobytes()
dest = pathlib.Path(__file__).resolve().parent.parent / 'public' / 'audio' / 'loop.mp3'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '48k', '-id3v2_version', '0', '-write_xing', '1', str(dest)],
               input=pcm, check=True)
print(dest, dest.stat().st_size, 'bytes', f'{len(seg) / SR:.1f}s')
