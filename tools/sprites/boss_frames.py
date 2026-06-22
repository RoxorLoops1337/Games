#!/usr/bin/env python3
"""Optimize a throne-boss's idle + attack frame sequences for No Room For Heroes.

Throne bosses are front-facing and drawn bottom-anchored, scaled to BOSS_H. To
keep the body from jumping between idle and attack, ALL frames of a boss are
cropped to the SAME union bbox (so every frame shares one size) and downscaled
to a target height. Output is 0-indexed per clip: <char>_idle_0.png … and
<char>_attack_0.png …

Usage:
  python boss_frames.py <char> "<idle glob>" "<attack glob>" <outdir> --h 300
"""
import sys, glob, argparse, os
from PIL import Image
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("char"); ap.add_argument("idle"); ap.add_argument("attack")
ap.add_argument("outdir"); ap.add_argument("--h", type=int, default=300)
a = ap.parse_args()

idle = sorted(glob.glob(a.idle)); atk = sorted(glob.glob(a.attack))
if not idle or not atk: sys.exit("missing frames: idle=%d attack=%d" % (len(idle), len(atk)))
os.makedirs(a.outdir, exist_ok=True)

allf = [Image.open(f).convert("RGBA") for f in idle + atk]
# union opaque bbox across EVERY frame → one shared crop box
x0 = y0 = 10**9; x1 = y1 = 0
for im in allf:
    al = np.array(im)[:, :, 3]
    ys, xs = np.where(al > 16)
    x0 = min(x0, xs.min()); y0 = min(y0, ys.min())
    x1 = max(x1, xs.max() + 1); y1 = max(y1, ys.max() + 1)
cw, ch = x1 - x0, y1 - y0
fh = a.h; fw = round(cw * fh / ch)

def emit(files, clip):
    for i, f in enumerate(files):
        im = Image.open(f).convert("RGBA").crop((x0, y0, x1, y1)).resize((fw, fh), Image.LANCZOS)
        im.save(os.path.join(a.outdir, f"{a.char}_{clip}_{i}.png"), optimize=True)

emit(idle, "idle"); emit(atk, "attack")
print(f"{a.char}: {len(idle)} idle + {len(atk)} attack  @ {fw}x{fh}  -> {a.outdir}")
