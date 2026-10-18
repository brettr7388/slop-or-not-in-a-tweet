"""Builds public/audio/loop.mp3 from the trailer's music bed, so the game and the trailer play the same music.

Source: lab's trailer bed demo/v2/music48.f32 (raw float32 mono, 48 kHz; itself rendered from
scripts/build-audio.py). Usage: python3 scripts/build-loop.py path/to/music48.f32

The bed is periodic with a 12 s cycle. We take the same 12 s window the trailer uses (0.25 s to 12.25 s),
repeat it twice (24 s, so a media-element loop wraps half as often), and crossfade the last 80 ms into
the audio that precedes the window, so the wrap from end to start is continuous. The music level
(0.32) is baked in, because iOS ignores HTMLMediaElement.volume.
"""
import sys, subprocess, numpy as np

SR = 48000
LEVEL = 0.32
src = np.fromfile(sys.argv[1], dtype=np.float32).astype(np.float64)
a0, a1 = int(0.25 * SR), int(12.25 * SR)
win = src[a0:a1]
loop = np.tile(win, 2)
xf = int(0.08 * SR)
r = np.linspace(0, 1, xf) ** 0.5
loop[-xf:] = loop[-xf:] * np.sqrt(1 - np.linspace(0, 1, xf)) + src[a0 - xf:a0] * r
peak = np.abs(loop).max()
pcm = (loop * LEVEL / max(1.0, peak * LEVEL / 0.98)).astype(np.float32)
# Seam check: the jump from the last sample to the first must be no bigger than an ordinary step.
steps = np.abs(np.diff(pcm))
print(f'seam step {abs(pcm[0] - pcm[-1]):.4f} vs p99 step {np.percentile(steps, 99):.4f}')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-',
                '-map_metadata', '-1', '-c:a', 'libmp3lame', '-b:a', '80k', '-ar', '44100', 'public/audio/loop.mp3'],
               input=pcm.tobytes(), check=True)
