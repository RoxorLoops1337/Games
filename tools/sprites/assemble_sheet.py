#!/usr/bin/env python3
"""Assemble a frame-sequence (e.g. drakeling_idle_01.png …) into a single 1-row
sprite sheet sized for No Room For Heroes' MON_SPRITES loader, and print the
fw/fh/n/ax/ay to paste into the config.

Frames are flipped horizontally by default (the source art faces RIGHT; monsters
in-game face LEFT toward the raiders), downscaled to a target height (the big
"optimize" win — source frames are ~1200px), and tiled left-to-right.

Anchors: ax = horizontal centre of the FEET (the opaque pixels in the bottom
slice of the union mask, so the body stays planted across clips even when fire
breath widens the attack frame); ay = bottom of the content (feet on the floor).

Usage:
  python assemble_sheet.py "<glob>" <out.png> --h 220 [--no-flip]
"""
import sys, glob, argparse
from PIL import Image
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument("pattern")
ap.add_argument("out")
ap.add_argument("--h", type=int, default=220, help="target frame height in px")
ap.add_argument("--no-flip", action="store_true", help="keep source facing (don't mirror)")
ap.add_argument("--foot", type=float, default=0.15, help="bottom fraction treated as 'feet' for the x-anchor")
a = ap.parse_args()

files = sorted(glob.glob(a.pattern))
if not files:
    sys.exit("no frames match " + a.pattern)

ims = [Image.open(f).convert("RGBA") for f in files]
if not a.no_flip:
    ims = [im.transpose(Image.FLIP_LEFT_RIGHT) for im in ims]

# union opaque bbox across the clip → tight, consistent crop
def alpha(im): return np.array(im)[:, :, 3]
boxes = []
for im in ims:
    ys, xs = np.where(alpha(im) > 16)
    boxes.append((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
x0 = min(b[0] for b in boxes); y0 = min(b[1] for b in boxes)
x1 = max(b[2] for b in boxes); y1 = max(b[3] for b in boxes)
crop = [im.crop((x0, y0, x1, y1)) for im in ims]
cw, ch = crop[0].size

scale = a.h / ch
fh = a.h
fw = round(cw * scale)
small = [im.resize((fw, fh), Image.LANCZOS) for im in crop]

# feet x-anchor: centre of opaque pixels in the bottom slice of the union mask
union = np.zeros((fh, fw), bool)
for im in small:
    union |= (np.array(im)[:, :, 3] > 24)
footrows = union[int(fh * (1 - a.foot)):, :]
fx = np.where(footrows.any(axis=0))[0]
ax = int(round((fx.min() + fx.max()) / 2)) if len(fx) else fw // 2
ay = fh  # feet sit at the bottom of the tight crop

sheet = Image.new("RGBA", (fw * len(small), fh), (0, 0, 0, 0))
for i, im in enumerate(small):
    sheet.paste(im, (i * fw, 0))
sheet.save(a.out, optimize=True)
print(f"{a.out}: fw:{fw}, fh:{fh}, n:{len(small)}, ax:{ax}, ay:{ay}   ({sheet.size[0]}x{sheet.size[1]})")
