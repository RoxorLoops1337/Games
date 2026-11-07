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

Animation frames (touches nothing else): python3 tools/graftwork_art_build.py --frames [--combat] [--out=DIR] [RAW_DIR]
actor_<id>_walk1..walk4.png (a walk cycle: all four or none), actor_<id>_atk1..atk3.png (monsters may have only atk2), actor_<id>_hit.png and
actor_<id>_die.png: 1920 or 2048 px RGBA, the SAME canvas, scale, costume and feet position as the standing actor_<id>.png (any other size is
scaled to the standing raw's width). Each frame gets the STANDING frame's transform (same crop box and scale, so the figure keeps its size) and is
then aligned by FEET: the contact point (lowest opaque row, centre of the bottom 12 percent band, like contactOf in ui/ward_iso.js) is moved onto the
standing frame's contact point, so the manifest anchor and the renderer's measured contact stay valid for every frame. A frame whose size differs
from the standing figure by more than FRAME_TOL only warns; it is still exported. Output: actors/<id>_<frame>@1x|@2x.webp (walk 4 frames and
combat frames atk/hit/die; with --combat the combat frames also get a 512 px @3x). The manifest entry gains
actors[id].frames = { walk:[stem...], atk:[stem...], hit:stem, die:stem, hi3x:bool } where a stem is the file name without size tag
('marrow_walk1'); a group with no raw is left out and an actor with no frame raws keeps whatever it had. Nothing else in the entry changes. The pass
checks the whole assets folder against the 12 MB budget. --out=DIR writes to another assets/ward folder (tests, dry runs).

Lowered-wall variant (touches nothing else): python3 tools/graftwork_art_build.py --low [RAW_DIR]
rm_<room>_low.png (2048 px RGBA, same room with lowered walls, made with another model, so its floor diamond is NOT identical to the tall
set) becomes the room id `rm_<room>_low` (rooms/rm_<room>_low@1x|@2x.webp) with its OWN measured floorCx/floorCy/floorW/floorH in the manifest
(the renderer scales each sprite by its own diamond). The painted renderer uses it in dense layouts and wall modes Low / Cutaway; the tall
sprite stays the fallback for a lone room. Low variants never enter the `tile` ratio. The manifest is patched in place. A file is REJECTED
(skipped, reported, any old entry of that id removed) when it has magenta chroma spill, a floor diamond that is not a 2:1-ish diamond
centred on the canvas, or is listed in LOW_REJECT (hand-checked by eye).
"""
import json, os, sys, glob
from PIL import Image
import numpy as np

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
COMBAT = '--combat' in sys.argv
LOW = '--low' in sys.argv
FRAMES = '--frames' in sys.argv
RAW = ARGS[0] if ARGS else '/tmp/claude-0/art/raw'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'graftwork', 'assets', 'ward')
OUT = os.path.normpath(OUT)
for _a in sys.argv[1:]:
    if _a.startswith('--out='):
        OUT = os.path.abspath(_a[6:])
SIZES = {'rooms': (512, 256), 'actors': (256, 128), 'icons': (128, 64), 'cards': (256, 128)}
Q = 82
BUDGET = 12 * 1024 * 1024
FRAME_TOL = 0.35   # relative size difference of a frame vs the standing figure that triggers a warning
WALK = ['walk1', 'walk2', 'walk3', 'walk4']
ATK = ['atk1', 'atk2', 'atk3']
COMBAT_FRAMES = ATK + ['hit', 'die']

# rejected by eye (id -> reason); the automatic checks in low_pass catch the rest
LOW_REJECT = {}

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

def low_check(im, id_):
    """None when the file is usable, else the reason it is rejected."""
    if id_ in LOW_REJECT:
        return LOW_REJECT[id_]
    a = np.array(im).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    mag = (al > 20) & (r > 150) & (b > 150) & (g < 90) & (r - g > 90) & (b - g > 90)
    if mag.sum() >= 3:
        return f'magenta chroma spill ({int(mag.sum())} px)'
    cx, cy, fw, fh = floor_of(im)
    if not (1.75 <= fw / fh <= 2.1):
        return f'floor diamond ratio {fw / fh:.2f}'
    if abs(cx - im.width / 2) > im.width * 0.03 or fw < im.width * 0.8 or cy < im.height * 0.5:
        return 'floor diamond off centre or too small'
    if (al > 128).sum() < im.width * im.height * 0.12:
        return 'nearly empty'
    return None

def low_pass():
    mp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mp))
    ok, rej = [], {}
    for f in sorted(glob.glob(os.path.join(RAW, 'rm_*_low.png'))):
        id_ = os.path.basename(f)[:-4]
        im = clean(Image.open(f))
        why = low_check(im, id_)
        if why:
            rej[id_] = why
            if id_ in man['rooms']:
                del man['rooms'][id_]
            for sfx in ('@1x', '@2x'):
                p = os.path.join(OUT, 'rooms', id_ + sfx + '.webp')
                if os.path.exists(p):
                    os.remove(p)
            continue
        cx, cy, fw, fh = floor_of(im)
        w, h = save(im, 'rooms', id_)
        k = w / im.width
        man['rooms'][id_] = {'file1x': f'rooms/{id_}@1x.webp', 'file2x': f'rooms/{id_}@2x.webp', 'w': w, 'h': h,
                             'floorCx': round(cx * k, 1), 'floorCy': round(cy * k, 1), 'floorW': round(fw * k, 1), 'floorH': round(fh * k, 1), 'low': True}
        ok.append(id_)
    json.dump(man, open(mp, 'w'), indent=1)
    print('low variants built:', len(ok), ok)
    print('REJECTED:', rej)


def contact_of(im):
    """(fx, bottom, top, fw, area) of the opaque figure, measured like contactOf() in ui/ward_iso.js: bottom = one past the lowest row with alpha > 40,
    fx = mean x of the bottom band (12 percent of the figure height), fw = its width. None for an empty image."""
    a = np.array(im.convert('RGBA'))[..., 3] > 40
    ys, xs = np.where(a)
    if len(ys) == 0:
        return None
    top, bot = int(ys.min()), int(ys.max())
    band = max(2, round((bot - top) * 0.12))
    m = a[bot - band + 1: bot + 1]
    by, bx = np.where(m)
    return {'fx': float(bx.mean()) + 0.5, 'bottom': bot + 1, 'top': top, 'fw': int(bx.max() - bx.min() + 1), 'area': int(a.sum()), 'h': bot + 1 - top}

def frame_canvas(std, fr, warn, walk=False):
    """Place raw frame `fr` on the 1024 canvas with the STANDING frame's scale, feet on the standing contact point. Returns the canvas (RGBA)."""
    S = 1024
    bb = np.array(std)[..., 3] > 20
    ys, xs = np.where(bb)
    x0, y0, x1, y1 = int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1
    k = 900 / max(x1 - x0, y1 - y0)
    cw, ch = max(1, round((x1 - x0) * k)), max(1, round((y1 - y0) * k))
    cs = contact_of(std)
    tx = (S - cw) // 2 + (cs['fx'] - x0) * (cw / (x1 - x0))   # standing feet on the canvas
    ty = int(S * 0.95)
    if fr.size != std.size:
        warn.append(f'raw is {fr.width}x{fr.height}, standing is {std.width}x{std.height}: scaled to the standing size')
        fr = fr.resize(std.size, Image.LANCZOS)
    cf = contact_of(fr)
    if cf is None:
        warn.append('empty frame')
        return None
    # size check against the standing figure (walk: height, other poses: area), warn only
    if walk:
        rel = cf['h'] / cs['h']
    else:
        rel = (cf['area'] / cs['area']) ** 0.5
    if abs(rel - 1) > FRAME_TOL:
        warn.append(f'scale differs from the standing frame by {abs(rel - 1) * 100:.0f} percent (limit {FRAME_TOL * 100:.0f}); exported anyway')
    w, h = round(fr.width * k), round(fr.height * k)
    sc = fr.resize((w, h), Image.LANCZOS)
    ox, oy = round(tx - cf['fx'] * k), round(ty - cf['bottom'] * k)
    can = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    can.paste(sc, (ox, oy), sc)
    lost = float(np.array(sc)[..., 3].sum() - np.array(can)[..., 3].sum()) / max(1.0, float(np.array(sc)[..., 3].sum()))
    if lost > 0.005:
        warn.append(f'{lost * 100:.1f} percent of the figure falls off the canvas')
    return can

def folder_size(d):
    return sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(d) for f in fs)

def frames_pass():
    mp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mp))
    done, problems = {}, 0
    for n, e in man['actors'].items():
        found = {nm: os.path.join(RAW, f'actor_{n}_{nm}.png') for nm in WALK + COMBAT_FRAMES if os.path.exists(os.path.join(RAW, f'actor_{n}_{nm}.png'))}
        if not found:
            continue
        sf = os.path.join(RAW, f'actor_{n}.png')
        if not os.path.exists(sf):
            print(f'  {n}: frames found but no standing raw actor_{n}.png: skipped'); problems += 1
            continue
        std = clean(Image.open(sf))
        if contact_of(std) is None:
            print(f'  {n}: standing raw is empty: skipped'); problems += 1
            continue
        if any(nm in found for nm in WALK) and not all(nm in found for nm in WALK):
            print(f'  {n}: walk cycle needs all of {WALK}, got {[nm for nm in WALK if nm in found]}: walk skipped')
            for nm in WALK:
                found.pop(nm, None)
        ok = {}
        for nm, f in found.items():
            warn = []
            can = frame_canvas(std, clean(Image.open(f)), warn, nm in WALK)
            for w_ in warn:
                print(f'  {n}_{nm}: WARNING {w_}')
            if can is None:
                problems += 1
                continue
            save(can, 'actors', f'{n}_{nm}')
            if COMBAT and nm in COMBAT_FRAMES:
                clean(can.resize((512, 512), Image.LANCZOS)).save(os.path.join(OUT, 'actors', f'{n}_{nm}@3x.webp'), 'WEBP', quality=Q, method=4, exact=True)
            ok[nm] = f'{n}_{nm}'
        fr = {}
        if all(nm in ok for nm in WALK):
            fr['walk'] = [ok[nm] for nm in WALK]
        atk = [ok[nm] for nm in ATK if nm in ok]
        if atk:
            fr['atk'] = atk
        for nm in ('hit', 'die'):
            if nm in ok:
                fr[nm] = ok[nm]
        if any(k in fr for k in ('atk', 'hit', 'die')):
            fr['hi3x'] = all(os.path.exists(os.path.join(OUT, 'actors', st + '@3x.webp')) for st in [*fr.get('atk', []), *[fr[k] for k in ('hit', 'die') if k in fr]])
        if fr:
            e['frames'] = fr
            done[n] = {k: (len(v) if isinstance(v, list) else v) for k, v in fr.items()}
    json.dump(man, open(mp, 'w'), indent=1)
    size = folder_size(OUT)
    print('frames:', len(done), 'actors', done)
    print(f'assets folder {size / 1048576:.2f} MB of {BUDGET / 1048576:.0f} MB')
    if size >= BUDGET:
        print('OVER BUDGET'); sys.exit(2)
    if problems:
        sys.exit(1)

if FRAMES:
    frames_pass()
    sys.exit(0)
if COMBAT:
    combat_pass()
    sys.exit(0)
if LOW:
    low_pass()
    sys.exit(0)

man = {'version': 1, 'tile': {'w': 2, 'h': 1}, 'rooms': {}, 'actors': {}, 'icons': {}, 'cards': {}}
ratios = []
for f in sorted(glob.glob(os.path.join(RAW, 'rm_*.png')) + glob.glob(os.path.join(RAW, 'plot_*.png'))):
    id_ = os.path.basename(f)[:-4]
    if id_.endswith('_low'):
        continue  # lowered-wall variants have their own pass (--low) so a full rebuild never needs them
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
