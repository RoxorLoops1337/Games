"""Graftwork PWA icons: a brass 'G' seal on the dark slab, ringed by a vellum running stitch with a black thread line.
Procedural (PIL), no Ward art. Run: python3 tools/graftwork_icons.py  -> graftwork/icons/*.png (palette from graftwork/ui/core.js COL)."""
import sys

# The tool takes no arguments: --help prints this page and stops, anything else stops with a message. Nothing is written in either case (an argument
# used to start the build, which rewrites the four committed icons).
if len(sys.argv) > 1:
    if sys.argv[1] in ('-h', '--help'):
        print(__doc__)
        sys.exit(0)
    print(f'graftwork_icons.py: takes no arguments, got {sys.argv[1]!r} (nothing was written; see --help)', file=sys.stderr)
    sys.exit(2)

import math, os, glob
from PIL import Image, ImageDraw, ImageFont

SLAB, SLAB2, VELLUM, BRASS, BRASS_D, INK = '#1A1614', '#26201c', '#E8DCC4', '#C9A227', '#5a410c', '#0E0E0E'
OUT = os.path.join(os.path.dirname(__file__), '..', 'graftwork', 'icons')
FONTS = glob.glob('/usr/share/fonts/**/DejaVuSerif-Bold.ttf', recursive=True) + glob.glob('/usr/share/fonts/**/*Serif*Bold*.ttf', recursive=True)

def draw(size, kind):
    S = 4; n = size * S; c = n / 2
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    full = kind in ('maskable', 'apple')
    if full: d.rectangle([0, 0, n, n], fill=SLAB)
    else: d.rounded_rectangle([0, 0, n - 1, n - 1], radius=n * 0.2, fill=SLAB)
    k = 0.62 if kind == 'maskable' else 0.8  # maskable: everything inside the central safe circle (40% radius)
    R = c * k
    d.ellipse([c - R, c - R, c + R, c + R], fill=SLAB2)
    # running stitch ring
    r = R * 0.94; segs = 28
    for i in range(segs):
        a0 = 2 * math.pi * i / segs; a1 = a0 + 2 * math.pi / segs * 0.58
        pts = [(c + r * math.cos(a0 + (a1 - a0) * t / 6), c + r * math.sin(a0 + (a1 - a0) * t / 6)) for t in range(7)]
        d.line(pts, fill=VELLUM, width=max(2, int(n * 0.012)))
    d.ellipse([c - R * 0.80, c - R * 0.80, c + R * 0.80, c + R * 0.80], outline=BRASS, width=max(3, int(n * 0.02)))
    # the G
    f = ImageFont.truetype(FONTS[0], int(R * 1.15)) if FONTS else ImageFont.load_default()
    bb = d.textbbox((0, 0), 'G', font=f); tw, th = bb[2] - bb[0], bb[3] - bb[1]
    tx, ty = c - tw / 2 - bb[0], c - th / 2 - bb[1] - R * 0.02
    d.text((tx + n * 0.006, ty + n * 0.008), 'G', font=f, fill=BRASS_D)
    d.text((tx, ty), 'G', font=f, fill=BRASS)
    # black thread through the seal, with a needle eye
    ty2 = c + R * 0.62
    d.line([(c - R * 0.98, ty2), (c - R * 0.2, ty2), (c + R * 0.1, ty2 - R * 0.07), (c + R * 0.98, ty2 - R * 0.07)], fill=INK, width=max(3, int(n * 0.016)))
    im = im.resize((size, size), Image.LANCZOS)
    if full:
        bg = Image.new('RGB', im.size, SLAB); bg.paste(im, mask=im.split()[3]); return bg
    return im

os.makedirs(OUT, exist_ok=True)
for name, size, kind in [('icon-192.png', 192, 'any'), ('icon-512.png', 512, 'any'), ('icon-maskable-512.png', 512, 'maskable'), ('apple-touch-icon.png', 180, 'apple')]:
    im = draw(size, kind)
    im = im.quantize(24, method=Image.FASTOCTREE if im.mode == 'RGBA' else Image.MEDIANCUT, dither=Image.NONE)  # 8-bit palette keeps each file small
    im.save(os.path.join(OUT, name), optimize=True)
    print(name, os.path.getsize(os.path.join(OUT, name)))
