#!/usr/bin/env python3
"""Graftwork Ward art pipeline: raw AI PNGs -> committed WebPs + manifest.json.

What the game draws from this folder (ui/assets.js): the plot tile on buildable cells, the standing actors (the map walk is the puppet,
ui/puppet.js, cut from the standing image: it needs no file), the battle frames atk / hit / die, the icons and the building-card
illustrations. Ward ROOMS are drawn from the modular kit (assets/ward_kit, tools/graftwork_kit_build.py); a room painting is built only
when a building card shows it (ART_ALIAS below) and is listed under cards[art] with `fromRoom`, never under rooms.

Raw files (NOT in the repo) live in RAW (default /tmp/claude-0/art/raw), 1920x1920 RGBA PNGs from
Artlist (GPT Image 2.6, transparent background). Naming:
  plot_empty.png                        the plot tile (diorama camera, same canvas as the room paintings)
  rm_<room>.png                         a room painting, built only for the rooms in ART_ALIAS (card illustrations)
  actor_<id>.png                        actors, standing pose
  icon_<id>.png                         resource / phase icons
  card_<id>.png                         building card illustrations
Run:  python3 tools/graftwork_art_build.py [RAW_DIR]
Steps: (1) matte clean: alpha below 20 -> 0, RGB of alpha 0 pixels zeroed (no fringe);
(2) the plot tile and the room paintings keep the full canvas (never trimmed per file); the plot tile's floor diamond is measured from
the alpha mask (leftmost/rightmost/bottom extremes of the base) and written to the manifest in 2x pixel units;
(3) actors are trimmed, scaled to fit a square and bottom-centre anchored (feet point in the manifest);
(4) icons and cards are trimmed and centred on a square;
(5) every asset is exported twice as WebP q82 with alpha: <id>@2x.webp (desktop) and <id>@1x.webp (phone).
Sizes: plot tile and room paintings 512/256 wide, actors 256/128, icons 128/64, cards 256/128.

Combat variant (Run with --combat, touches nothing else): python3 tools/graftwork_art_build.py --combat [RAW_DIR]
Battles draw the actors big (up to ~300 px tall), so every standing actor also gets a 512 px `actors/<id>@3x.webp` made from the same raw
with the same trim and bottom-centre anchor as the 2x file (so anchorX/anchorY and `scale` still apply, in 2x pixel units). The manifest entry
gains `file3x` and `bbox` = [x0, y0, x1, y1], the opaque box of the standing frame in 2x pixel units (combat sizes the figure from it).
The existing manifest is patched in place; raws below 1024 px are skipped (the 2x file is then the best there is).

Battle frames (touches nothing else): python3 tools/graftwork_art_build.py --frames [--combat] [--out=DIR] [RAW_DIR]
actor_<id>_atk1..atk3.png (monsters may have only atk2), actor_<id>_hit.png and actor_<id>_die.png: 1920 or 2048 px RGBA, the SAME canvas,
scale, costume and feet position as the standing actor_<id>.png (any other size is scaled to the standing raw's width). Each frame gets the
STANDING frame's transform (same crop box and scale, so the figure keeps its size) and is then aligned by FEET: the contact point (lowest
opaque row, centre of the bottom 12 percent band, like contactOf in ui/ward_iso.js) is moved onto the standing frame's contact point, so the
manifest anchor and the renderer's measured contact stay valid for every frame. A frame whose size differs from the standing figure by more
than FRAME_TOL only warns; it is still exported. Output: actors/<id>_<frame>@1x|@2x.webp (with --combat also a 512 px @3x). The manifest
entry gains actors[id].frames = { atk:[stem...], hit:stem, die:stem, hi3x:bool } where a stem is the file name without size tag
('orderly_atk2'); a group with no raw is left out and an actor with no frame raws keeps whatever it had. Nothing else in the entry changes.
Walk raws (actor_<id>_walk1..4.png, actor_<id>_b.png) are ignored: nothing draws them. The pass checks the whole assets folder against the
12 MB budget. --out=DIR writes to another assets/ward folder (tests, dry runs).

Prune (needs no raws): python3 tools/graftwork_art_build.py --prune [--dry] [--out=DIR]
Brings an existing assets/ward folder to what the game draws today, the same shape the passes above write: (1) rooms keeps only the plot
tiles (room paintings as rooms, tall or `_low`, go); (2) cards loses every art id no building card in graftwork/data/ward.js uses;
(3) actors lose `walk1x` / `walk2x` and frames.walk / frames.walkOk (a frames entry left empty goes too); (4) `cardsById` goes (the game
resolves a card by its own art id); (5) every file under the folder that the manifest no longer names is deleted. --dry only prints.
Run it again and it changes nothing.
"""
import json, os, re, sys, glob
from PIL import Image
import numpy as np

ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
COMBAT = '--combat' in sys.argv
FRAMES = '--frames' in sys.argv
PRUNE = '--prune' in sys.argv
DRY = '--dry' in sys.argv
REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
RAW = ARGS[0] if ARGS else '/tmp/claude-0/art/raw'
OUT = os.path.join(REPO, 'graftwork', 'assets', 'ward')
for _a in sys.argv[1:]:
    if _a.startswith('--out='):
        OUT = os.path.abspath(_a[6:])
SIZES = {'rooms': (512, 256), 'actors': (256, 128), 'icons': (128, 64), 'cards': (256, 128)}
Q = 82
BUDGET = 12 * 1024 * 1024
FRAME_TOL = 0.35   # relative size difference of a frame vs the standing figure that triggers a warning
ATK = ['atk1', 'atk2', 'atk3']
COMBAT_FRAMES = ATK + ['hit', 'die']
# building-card art ids (data/ward.js `art`) that are a room painting: art id -> room id. The only room paintings that are built.
ART_ALIAS = {'ward_corridor': 'rm_corridor', 'ward_beds': 'rm_ward', 'ward_isolation': 'rm_isolation', 'ward_chapel': 'rm_chapel',
             'ward_dispensary': 'rm_dispensary', 'ward_workshop': 'rm_workshop', 'ward_sawmill': 'rm_sawmill', 'ward_quarry': 'rm_quarry',
             'ward_counting': 'rm_counting', 'ward_generator': 'rm_generator', 'ward_linen': 'rm_linen'}

def card_arts():
    """The art ids the building cards use (graftwork/data/ward.js), read through node."""
    import subprocess
    out = subprocess.run(['node', '-e', "import('./graftwork/data/ward.js').then(m=>console.log(JSON.stringify([...new Set(Object.values(m.BUILD_CARDS).map(c=>c.art))])))"],
                         capture_output=True, text=True, cwd=REPO, check=True).stdout
    return set(json.loads(out))

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

def frame_canvas(std, fr, warn):
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
    # size check against the standing figure (by area: a pose changes the height), warn only
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

META = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'graftwork_art_meta.json')))

def folder_size(d):
    return sum(os.path.getsize(os.path.join(r, f)) for r, _, fs in os.walk(d) for f in fs)

def frames_pass():
    mp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mp))
    done, problems = {}, 0
    for n, e in man['actors'].items():
        found = {nm: os.path.join(RAW, f'actor_{n}_{nm}.png') for nm in COMBAT_FRAMES if os.path.exists(os.path.join(RAW, f'actor_{n}_{nm}.png'))}
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
        if META.get(n, {}).get('framesOk') is False:
            print(f'  {n}: frames rejected by tools/graftwork_art_meta.json (framesOk false): skipped'); e.pop('frames', None); continue
        ok = {}
        for nm, f in found.items():
            warn = []
            can = frame_canvas(std, clean(Image.open(f)), warn)
            for w_ in warn:
                print(f'  {n}_{nm}: WARNING {w_}')
            if can is None:
                problems += 1
                continue
            save(can, 'actors', f'{n}_{nm}')
            if COMBAT:
                clean(can.resize((512, 512), Image.LANCZOS)).save(os.path.join(OUT, 'actors', f'{n}_{nm}@3x.webp'), 'WEBP', quality=Q, method=4, exact=True)
            ok[nm] = f'{n}_{nm}'
        fr = {}
        atk = [ok[nm] for nm in ATK if nm in ok]
        if atk:
            fr['atk'] = atk
        for nm in ('hit', 'die'):
            if nm in ok:
                fr[nm] = ok[nm]
        if fr:
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

def named_files(man):
    """Every file an assets/ward manifest names, relative to the folder: file1x / file2x / file3x of each entry, and the battle frames by stem."""
    out = set()
    for sec in ('rooms', 'actors', 'icons', 'cards'):
        for e in man.get(sec, {}).values():
            for k in ('file1x', 'file2x', 'file3x'):
                if e.get(k):
                    out.add(e[k])
            fr = e.get('frames') or {}
            for st in [*fr.get('atk', []), *[fr[k] for k in ('hit', 'die') if fr.get(k)]]:
                for tag in ('1x', '2x', '3x') if fr.get('hi3x') else ('1x', '2x'):
                    out.add(f'actors/{st}@{tag}.webp')
    return out

def prune_pass():
    mp = os.path.join(OUT, 'manifest.json')
    man = json.load(open(mp))
    arts = card_arts()   # no node, no prune: never delete on a guess
    gone = {'rooms': [], 'cards': [], 'fields': []}
    for rid in list(man['rooms']):
        if not rid.startswith('plot_'):   # the Ward draws rooms from the kit; a room painting lives on only as a card illustration (cards[art].fromRoom)
            gone['rooms'].append(rid); del man['rooms'][rid]
    for art in list(man['cards']):
        if art not in arts:
            gone['cards'].append(art); del man['cards'][art]
    for n, e in man['actors'].items():
        for k in ('walk1x', 'walk2x'):
            if e.pop(k, None) is not None:
                gone['fields'].append(f'actors.{n}.{k}')
        fr = e.get('frames')
        if fr is not None:
            for k in ('walk', 'walkOk'):
                if fr.pop(k, None) is not None:
                    gone['fields'].append(f'actors.{n}.frames.{k}')
            if not any(fr.get(k) for k in ('atk', 'hit', 'die')):
                gone['fields'].append(f'actors.{n}.frames'); del e['frames']
    if man.pop('cardsById', None) is not None:
        gone['fields'].append('cardsById')
    keep = named_files(man)
    missing = sorted(f for f in keep if not os.path.exists(os.path.join(OUT, f)))
    if missing:
        print('NOT PRUNED: the manifest would name files that do not exist:', missing); sys.exit(1)
    drop, size = [], 0
    for r, _, fs in os.walk(OUT):
        for f in fs:
            rel = os.path.relpath(os.path.join(r, f), OUT).replace(os.sep, '/')
            if rel != 'manifest.json' and rel not in keep:
                drop.append(rel); size += os.path.getsize(os.path.join(r, f))
    print(f"prune{' (dry run)' if DRY else ''}: {len(gone['rooms'])} room entries, {len(gone['cards'])} card entries, {len(gone['fields'])} fields, {len(drop)} files, {size} bytes")
    print(' rooms:', ' '.join(gone['rooms'])); print(' cards:', ' '.join(gone['cards'])); print(' fields:', ' '.join(gone['fields']))
    by = {}
    for f in drop:
        k = 'low room paintings' if '_low@' in f else 'room paintings no card shows' if f.startswith('rooms/') else 'painted walk frames' if '_walk' in f else 'step frames (_b)' if '_b@' in f else 'other'
        by.setdefault(k, [0, 0]); by[k][0] += 1; by[k][1] += os.path.getsize(os.path.join(OUT, f))
    for k, (c, b) in sorted(by.items()):
        print(f' files: {c} {k}, {b} bytes')
    if DRY:
        return
    for f in drop:
        os.remove(os.path.join(OUT, f))
    json.dump(man, open(mp, 'w'), indent=1)
    print(f'assets folder {folder_size(OUT) / 1048576:.2f} MB of {BUDGET / 1048576:.0f} MB')

if PRUNE:
    prune_pass()
    sys.exit(0)
if FRAMES:
    frames_pass()
    sys.exit(0)
if COMBAT:
    combat_pass()
    sys.exit(0)

man = {'version': 1, 'tile': {'w': 2, 'h': 1}, 'rooms': {}, 'actors': {}, 'icons': {}, 'cards': {}}
ratios, paint = [], {}
ROOM_ART = set(ART_ALIAS.values())
for f in sorted(glob.glob(os.path.join(RAW, 'rm_*.png')) + glob.glob(os.path.join(RAW, 'plot_*.png'))):
    id_ = os.path.basename(f)[:-4]
    if id_.startswith('rm_') and id_ not in ROOM_ART:
        continue  # the Ward draws rooms from the kit: a room painting is built only when a card shows it
    im = clean(Image.open(f))
    cx, cy, fw, fh = floor_of(im)
    w, h = save(im, 'rooms', id_)
    k = w / im.width
    e = {'file1x': f'rooms/{id_}@1x.webp', 'file2x': f'rooms/{id_}@2x.webp', 'w': w, 'h': h}
    ratios.append(fw / fh)
    if id_.startswith('plot_'):   # drawn on the map: needs its floor diamond
        man['rooms'][id_] = {**e, 'floorCx': round(cx * k, 1), 'floorCy': round(cy * k, 1), 'floorW': round(fw * k, 1), 'floorH': round(fh * k, 1)}
    else:
        paint[id_] = e
if ratios:
    man['tile'] = {'w': 2, 'h': round(2 / (sum(ratios) / len(ratios)), 3)}

KIND_SCALE = {'hero': 1.0, 'normal': 1.0, 'elite': 1.2, 'boss': 1.6, 'npc': 0.9}
for f in sorted(glob.glob(os.path.join(RAW, 'actor_*.png'))):
    n = os.path.basename(f)[6:-4]
    m_ = re.search(r'_(b|walk[1-4]|atk[1-3]|hit|die)$', n)
    if m_ and os.path.exists(os.path.join(RAW, f'actor_{n[:m_.start()]}.png')):
        continue  # a pose of another actor: battle frames have their own pass (--frames), old walk and step raws are not built at all
    can, by = trim_square(clean(Image.open(f)), 900, 0.95)
    w, h = save(can, 'actors', n)
    man['actors'][n] = {'file1x': f'actors/{n}@1x.webp', 'file2x': f'actors/{n}@2x.webp', 'w': w, 'h': h,
                        'anchorX': w / 2, 'anchorY': round(by / 1024 * h, 1), 'kind': META.get(n, {}).get('kind', 'normal'),
                        'scale': KIND_SCALE.get(META.get(n, {}).get('kind', 'normal'), 1.0)}
for kind, pre in (('icons', 'icon_'), ('cards', 'card_')):
    for f in sorted(glob.glob(os.path.join(RAW, pre + '*.png'))):
        n = os.path.basename(f)[len(pre):-4]
        can, _ = trim_square(clean(Image.open(f)), 960)
        if kind == 'cards':
            n = 'ward_' + n
        w, h = save(can, kind, n)
        man[kind][n] = {'file1x': f'{kind}/{n}@1x.webp', 'file2x': f'{kind}/{n}@2x.webp', 'w': w, 'h': h}
# card art ids that are a room painting (data/ward.js `art`): the card entry points at the painting's files
for art, rid in ART_ALIAS.items():
    if rid in paint:
        man['cards'][art] = {**paint[rid], 'fromRoom': rid}
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print({k: len(v) for k, v in man.items() if isinstance(v, dict)})
