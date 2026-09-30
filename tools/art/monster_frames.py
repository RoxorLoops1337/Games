#!/usr/bin/env python3
"""No Room For Heroes: per-frame monster guard art (harpy, sentinel, mimic, minion, orc).

The owner uploads each frame as upscaled pixel art (every painted pixel is a b x b
block). This point-samples every clip back to its NATIVE size (1 png px per painted
pixel) on ONE grid per clip, so all frames of a clip keep the same canvas size and
stay registered. Near-transparent specks are scrubbed, then each frame is saved as
a 256-colour palette PNG (no dither): visually lossless on this art, ~4x smaller.

A corrupt upload is printed as SKIP and left out; re-upload it and run this again
and the frame drops straight in (the game already expects the full frame count).

usage: python3 tools/art/monster_frames.py "<upload dir>" no_room_for_heroes [--dry]
"""
import sys, os, re, glob, collections
import numpy as np
from PIL import Image

# upload clip prefix -> (repo sprite folder, repo clip id, upscale block in source px)
CLIPS = {
    'harpyroost_idle':      ('harpy',    'harpy_idle',       4),
    'harpyroost_attack':    ('harpy',    'harpy_attack',     6),
    'stonesentinel_idle':   ('sentinel', 'sentinel_idle',   10),
    'stonesentinel_walk':   ('sentinel', 'sentinel_walk',   10),
    'stonesentinel_attack': ('sentinel', 'sentinel_attack', 10),
    'mimic_idle':           ('mimic',    'mimic_chest',      5),   # static closed chest = the disguise
    'mimic_transform':      ('mimic',    'mimic_transform',  8),
    'mimic_walk':           ('mimic',    'mimic_walk',       8),
    'mimic_attack':         ('mimic',    'mimic_attack',     7),
    'minion_idle':          ('minion',   'minion_idle',      6),
    'minion_walk':          ('minion',   'minion_walk',      6),
    'minion_attack':        ('minion',   'minion_attack',    6),
    'orc_idle':             ('orc',      'orc_idle',         5),
    'orc_walk':             ('orc',      'orc_walk',         5),
    'orc_attack':           ('orc',      'orc_attack',       5),
}


def load(p):
    try:
        return np.array(Image.open(p).convert('RGBA'))
    except Exception:
        return None          # corrupt upload: skipped, a later re-upload just works


def phases(a, b):
    """Histogram of colour-change positions mod b along x and y (the block grid offset)."""
    out = []
    for ax in (1, 0):
        d = (a[:, 1:] != a[:, :-1]).any(-1) if ax == 1 else (a[1:] != a[:-1]).any(-1)
        idx = np.nonzero(d)[1 if ax == 1 else 0] + 1
        out.append(collections.Counter(idx % b))
    return out


def main(src, dst, dry=False):
    wrote = 0
    for pre, (folder, cid, b) in CLIPS.items():
        files = sorted(f for f in glob.glob(os.path.join(src, pre + '*.png'))
                       if re.fullmatch(re.escape(pre) + r'(_\d+)?\.png', os.path.basename(f)))
        arrs = [(f, load(f)) for f in files]
        good = [(f, a) for f, a in arrs if a is not None]
        for f, a in arrs:
            if a is None:
                print('SKIP corrupt', os.path.basename(f))
        if not good:
            continue
        # the most common grid offset across the whole clip, so every frame samples the same grid
        cx = collections.Counter(); cy = collections.Counter()
        for f, a in good:
            px, py = phases(a, b); cx += px; cy += py
        ox = cx.most_common(1)[0][0]; oy = cy.most_common(1)[0][0]
        for f, a in good:
            xs = np.arange((ox + b // 2) % b, a.shape[1], b)
            ys = np.arange((oy + b // 2) % b, a.shape[0], b)
            n = a[np.ix_(ys, xs)].copy()
            n[n[..., 3] < 16] = 0                                  # scrub near-transparent specks
            suffix = os.path.basename(f)[len(pre):]                # '.png' | '_01.png' ...
            out = os.path.join(dst, 'sprites', folder, cid + suffix)
            print(os.path.basename(f), '->', os.path.relpath(out, dst), '%dx%d' % (n.shape[1], n.shape[0]))
            if dry:
                continue
            os.makedirs(os.path.dirname(out), exist_ok=True)
            img = Image.fromarray(n).quantize(256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.NONE)
            img.save(out, optimize=True)
            wrote += 1
    print('(dry run)' if dry else 'wrote %d frames' % wrote)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--dry']
    if len(args) != 2:
        sys.exit(__doc__)
    main(args[0], args[1], '--dry' in sys.argv)
