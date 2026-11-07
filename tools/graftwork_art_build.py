#!/usr/bin/env python3
"""Graftwork Ward art pipeline: raw AI PNGs -> committed WebPs + manifest.json.

Raw files (NOT in the repo) live in RAW (default /tmp/claude-0/art/raw), 1920x1920 RGBA PNGs from
Artlist (GPT Image 2.6, transparent background). Naming:
  rm_<room>.png / plot_empty.png        rooms (diorama, same camera, same canvas)
  actor_<id>.png, actor_<id>_b.png      actors, standing pose and walk-step pose
  icon_<id>.png                         resource / phase icons
  card_<id>.png                         building card illustrations
Run:  python3 tools/graftwork_art_build.py [RAW_DIR]
Steps: (1) matte clean: alpha below 20 -> 0, RGB of alpha 0 pixels zeroed (no fringe);
(2) rooms keep the full canvas (never trimmed per file) and the floor diamond is measured from the alpha mask
(leftmost/rightmost/bottom extremes of the base) and written to the manifest in 2x pixel units;
(3) actors are trimmed, scaled to fit a square and bottom-centre anchored (feet point in the manifest);
(4) icons and cards are trimmed and centred on a square;
(5) every asset is exported twice as WebP q82 with alpha: <id>@2x.webp (desktop) and <id>@1x.webp (phone).
Sizes: rooms 512/256 wide, actors 256/128, icons 128/64, cards 256/128.

Combat variant (Run with --combat, touches nothing else): python3 tools/graftwork_art_build.py --combat [RAW_DIR]
Battles draw the actors big (up to ~300 px tall), so every standing actor also gets a 512 px `actors/<id>@3x.webp` made from the same raw
with the same trim and bottom-centre anchor as the 2x file (so anchorX/anchorY and `scale` still apply, in 2x pixel units). The manifest entry
gains `file3x` and `bbox` = [x0, y0, x1, y1], the opaque box of the standing frame in 2x pixel units (combat sizes the figure from it).
The existing manifest is patched in place; raws below 1024 px are skipped (the 2x file is then the best there is).
"""
import json, os, sys, glob
from PIL import Image
import numpy as np

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
COMBAT = '--combat' in sys.argv
RAW = ARGS[0] if ARGS else '/tmp/claude-0/art/raw'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'graftwork', 'assets', 'ward')
OUT = os.path.normpath(OUT)
SIZES = {'rooms': (512, 256), 'actors': (256, 128), 'icons': (128, 64), 'cards': (256, 128)}
Q = 82

def clean(im):
    a = np.array(im.convert('RGBA'))
    m = a[..., 3] < 20
    a[m] = 0
    return Image.fromarray(a, 'RGBA')

def save(im, kind, id_):
    s2, s1 = SIZES[kind]
    d = os.path.join(OUT, kind)
    os.makedirs(d, exist_ok=True)
    for s, tag in ((s2, '2x'), (s1, '1x')):
        r = im.resize((s, round(s * im.height / im.width)), Image.LANCZOS)
        r = clean(r)
        r.save(os.path.join(d, f'{id_}@{tag}.webp'), 'WEBP', quality=Q, method=4, exact=True)
    return s2, round(s2 * im.height / im.width)

def floor_of(im):
    a = np.array(im)[..., 3] > 128
    ys, xs = np.where(a)
    L, R, B = xs.min(), xs.max(), ys.max()
    ly = ys[xs <= L + 3]; ry = ys[xs >= R - 3]
    ly = ly[ly > a.shape[0] * 0.5]; ry = ry[ry > a.shape[0] * 0.5]
    lyc = float(np.max(ly)) if len(ly) else float(B)
    ryc = float(np.max(ry)) if len(ry) else float(B)
    cy = (lyc + ryc) / 2.0
    cx = (L + R) / 2.0
    h = 2 * (B - cy)
    return cx, cy, float(R - L), float(h)

def trim_square(im, fit, bottom_frac=None):
    bb = (np.array(im)[..., 3] > 20)
    ys, xs = np.where(bb)
    c = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    s = fit / max(c.width, c.height)
    c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
    S = 1024
    can = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if bottom_frac is None:
        can.paste(c, ((S - c.width) // 2, (S - c.height) // 2), c)
        return can, None
    by = int(S * bottom_frac)
    can.paste(c, ((S - c.width) // 2, by - c.height), c)
    return can, by

def combat_pass():
    mp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mp))
    n3 = 0
    for n, e in man['actors'].items():
        a = np.array(Image.open(os.path.join(OUT, e['file2x'])).convert('RGBA'))[..., 3] > 20
        ys, xs = np.where(a)
        e['bbox'] = [int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1]
        f = os.path.join(RAW, f'actor_{n}.png')
        if not os.path.exists(f):
            continue
        im = Image.open(f)
        if im.width < 1024:
            continue
        can, by = trim_square(clean(im), 900, 0.95)
        r = clean(can.resize((512, 512), Image.LANCZOS))
        r.save(os.path.join(OUT, 'actors', f'{n}@3x.webp'), 'WEBP', quality=Q, method=4, exact=True)
        e['file3x'] = f'actors/{n}@3x.webp'
        n3 += 1
    json.dump(man, open(mp, 'w'), indent=1)
    print('combat variant:', n3, 'actors')

if COMBAT:
    combat_pass()
    sys.exit(0)

man = {'version': 1, 'tile': {'w': 2, 'h': 1}, 'rooms': {}, 'actors': {}, 'icons': {}, 'cards': {}}
ratios = []
for f in sorted(glob.glob(os.path.join(RAW, 'rm_*.png')) + glob.glob(os.path.join(RAW, 'plot_*.png'))):
    id_ = os.path.basename(f)[:-4]
    im = clean(Image.open(f))
    cx, cy, fw, fh = floor_of(im)
    w, h = save(im, 'rooms', id_)
    k = w / im.width
    man['rooms'][id_] = {'file1x': f'rooms/{id_}@1x.webp', 'file2x': f'rooms/{id_}@2x.webp', 'w': w, 'h': h,
                         'floorCx': round(cx * k, 1), 'floorCy': round(cy * k, 1), 'floorW': round(fw * k, 1), 'floorH': round(fh * k, 1)}
    ratios.append(fw / fh)
if ratios:
    man['tile'] = {'w': 2, 'h': round(2 / (sum(ratios) / len(ratios)), 3)}

KIND_SCALE = {'hero': 1.0, 'normal': 1.0, 'elite': 1.2, 'boss': 1.6, 'npc': 0.9}
meta_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graftwork_art_meta.json')
meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
for f in sorted(glob.glob(os.path.join(RAW, 'actor_*.png'))):
    n = os.path.basename(f)[6:-4]
    if n.endswith('_b'):
        continue
    can, by = trim_square(clean(Image.open(f)), 900, 0.95)
    w, h = save(can, 'actors', n)
    e = {'file1x': f'actors/{n}@1x.webp', 'file2x': f'actors/{n}@2x.webp', 'w': w, 'h': h,
         'anchorX': w / 2, 'anchorY': round(by / 1024 * h, 1), 'kind': meta.get(n, {}).get('kind', 'normal'),
         'scale': KIND_SCALE.get(meta.get(n, {}).get('kind', 'normal'), 1.0)}
    fb = os.path.join(RAW, f'actor_{n}_b.png')
    if os.path.exists(fb):
        can, by = trim_square(clean(Image.open(fb)), 900, 0.95)
        save(can, 'actors', n + '_b')
        e['walk1x'] = f'actors/{n}_b@1x.webp'; e['walk2x'] = f'actors/{n}_b@2x.webp'
    man['actors'][n] = e
for kind, pre in (('icons', 'icon_'), ('cards', 'card_')):
    for f in sorted(glob.glob(os.path.join(RAW, pre + '*.png'))):
        n = os.path.basename(f)[len(pre):-4]
        can, _ = trim_square(clean(Image.open(f)), 960)
        if kind == 'cards':
            n = 'ward_' + n
        w, h = save(can, kind, n)
        man[kind][n] = {'file1x': f'{kind}/{n}@1x.webp', 'file2x': f'{kind}/{n}@2x.webp', 'w': w, 'h': h}
# card art ids used by data/ward.js: illustrations where generated, otherwise an alias to a room diorama
ART_ALIAS = {'ward_entrance': 'rm_entrance', 'ward_theatre': 'rm_theatre', 'ward_corridor': 'rm_corridor', 'ward_beds': 'rm_ward',
             'ward_isolation': 'rm_isolation', 'ward_chapel': 'rm_chapel', 'ward_dispensary': 'rm_dispensary', 'ward_workshop': 'rm_workshop',
             'ward_sawmill': 'rm_sawmill', 'ward_quarry': 'rm_quarry', 'ward_counting': 'rm_counting', 'ward_generator': 'rm_generator',
             'ward_linen': 'rm_linen'}
for art, rid in ART_ALIAS.items():
    if rid in man['rooms']:
        r = man['rooms'][rid]
        man['cards'][art] = {'file1x': r['file1x'], 'file2x': r['file2x'], 'w': r['w'], 'h': r['h'], 'fromRoom': rid}
# b_* card id -> what to draw: a room card uses its own room diorama, others the illustration keyed by data/ward.js art id
import subprocess
try:
    out = subprocess.run(['node', '-e', "import('./graftwork/data/ward.js').then(m=>console.log(JSON.stringify(Object.values(m.BUILD_CARDS).map(c=>[c.id,c.art,c.kind==='room'?c.room:null]))))"],
                         capture_output=True, text=True, cwd=os.path.join(OUT, '..', '..', '..'), check=True).stdout
    by = {}
    for cid, art, room in json.loads(out):
        by[cid] = {'room': room} if room else {'card': art}
    man['cardsById'] = by
except Exception as e:
    print('cardsById skipped', e)
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print({k: len(v) for k, v in man.items() if isinstance(v, dict)})
