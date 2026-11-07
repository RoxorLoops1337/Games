#!/usr/bin/env python3
"""Graftwork modular room kit: raw AI PNGs -> committed WebPs + graftwork/assets/ward_kit/manifest.json.

Raw files (NOT in the repo) live in RAW (default /tmp/claude-0/art/kit/raw). Naming:
  floor_<id>.png   1024 px opaque, flat top-down seamless-able floor texture
  wall_<id>.png    1024 px opaque, flat front-on wall texture
  piece_<id>.png   1920 px RGBA, flat front-on wall piece (door, window, banner, sconce)
  prop_<id>.png    1920 px RGBA, isometric 3/4 single object
Run:  python3 tools/graftwork_kit_build.py [RAW_DIR]
Steps: (1) textures are made seamless (the image is rolled by half, the original is kept in the middle and the rolled copy is
cross-blended in only inside a narrow band at the borders, so the pattern keeps its crisp detail), then downscaled to 512
with a wrap-aware resize (3x3 tiling, centre crop) so the result still tiles; (2) pieces and props are matte-cleaned, trimmed to
their bounding box and scaled to PX_PER_UNIT pixels per world unit, so every prop shares one texel density; (3) each is exported
as WebP q82 with alpha at full size and a half size @1x variant for phones; (4) manifest.json is written.
Units: the lab renderer uses the Ward projection (TW 92 x TH 48); a room is a 4 x 4 grid of sub-tiles, one sub-tile is 23 x 12 world px.
Sprite sizes in the manifest are in sprite px (the @2x file); `sw` is the on-screen width in world units, so draw width = sw and
draw scale = sw / w. anchorX/anchorY is the floor contact point (props) or the wall mount point (pieces) in sprite px.
"""
import json, os, sys, glob
from PIL import Image
import numpy as np

RAW = sys.argv[1] if len(sys.argv) > 1 else '/tmp/claude-0/art/kit/raw'
OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'graftwork', 'assets', 'ward_kit'))
Q = 82
TEX = 512
BAND = 56            # seam blend band in px at 1024
PX_PER_UNIT = 8.0    # props: sprite px per world unit
PX_PER_UNIT_PIECE = 10.0

# prop id -> on-screen width in world units (bbox), footprint [cols, rows] in sub-tiles (23 x 12 world px each), display name
# brightness gain per texture (the AI floors come out darker than the painted rooms; the lab and the game share one lighting model)
GAIN = {'floors/wood': 1.55, 'floors/stone': 1.2, 'walls/wood': 1.2, 'walls/stone': 1.05}

PROPS = {
    'sawbench': {'sw': 31, 'fp': [2, 1], 'name': 'Saw bench'},
    'planks': {'sw': 24, 'fp': [2, 1], 'name': 'Plank stack'},
    'toolrack': {'sw': 17, 'fp': [1, 1], 'name': 'Tool rack'},
    'bed': {'sw': 31, 'fp': [2, 1], 'name': 'Iron bed'},
    'stool': {'sw': 9, 'fp': [1, 1], 'name': 'Stool'},
    'crate': {'sw': 18, 'fp': [1, 1], 'name': 'Crate'},
    'bucket': {'sw': 10, 'fp': [1, 1], 'name': 'Bucket'},
    'shelf': {'sw': 14, 'fp': [1, 1], 'name': 'Bottle shelf'},
    'rocks': {'sw': 26, 'fp': [2, 1], 'name': 'Rock pile'},
    'generator': {'sw': 27, 'fp': [2, 1], 'name': 'Generator coil'},
    'bedside_table': {'sw': 10, 'fp': [1, 1], 'name': 'Bedside table'},
    'iv_stand': {'sw': 8, 'fp': [1, 1], 'name': 'IV drip stand'},
    'screen': {'sw': 22, 'fp': [2, 1], 'name': 'Privacy screen'},
    'gurney': {'sw': 32, 'fp': [2, 1], 'name': 'Gurney'},
    'wheelchair': {'sw': 14, 'fp': [1, 1], 'name': 'Wheelchair'},
    'lamp': {'sw': 8, 'fp': [1, 1], 'name': 'Floor lamp'},
    'plant': {'sw': 14, 'fp': [1, 1], 'name': 'Potted plant'},
    'reception_desk': {'sw': 30, 'fp': [2, 1], 'name': 'Reception desk'},
    'waiting_bench': {'sw': 28, 'fp': [2, 1], 'name': 'Waiting bench'},
    'coat_stand': {'sw': 8, 'fp': [1, 1], 'name': 'Coat stand'},
    'altar': {'sw': 24, 'fp': [2, 1], 'name': 'Altar'},
    'pew': {'sw': 30, 'fp': [2, 1], 'name': 'Pew'},
    'candle_stand': {'sw': 10, 'fp': [1, 1], 'name': 'Candle stand'},
    'lectern': {'sw': 12, 'fp': [1, 1], 'name': 'Lectern'},
}
# wall pieces: height in world units, mount ('floor' = bottom on the floor line, 'mid' = centred at wall mid height), display name
PIECES = {
    'window': {'h': 30, 'mount': 'mid', 'name': 'Gothic window'},
    'door': {'h': 36, 'mount': 'floor', 'name': 'Doorway'},
    'banner': {'h': 30, 'mount': 'mid', 'name': 'Red cross banner'},
    'sconce': {'h': 15, 'mount': 'mid', 'name': 'Candle sconce'},
    'archdoor': {'h': 38, 'mount': 'floor', 'name': 'Gothic double door'},
    'clock': {'h': 13, 'mount': 'mid', 'name': 'Wall clock'},
    'pipes': {'h': 14, 'mount': 'mid', 'name': 'Pipes and valve'},
    'curtain': {'h': 36, 'mount': 'floor', 'name': 'Velvet curtains'},
    'chalkboard': {'h': 17, 'mount': 'mid', 'name': 'Chalkboard'},
    'stainedglass': {'h': 36, 'mount': 'mid', 'name': 'Stained glass window'},
    'vent': {'h': 10, 'mount': 'mid', 'name': 'Iron vent'},
    'notice': {'h': 15, 'mount': 'mid', 'name': 'Notice board'},
}
FLOORS = {'wood': 'Wood planks', 'stone': 'Flagstones', 'tile': 'Clinic tile', 'darkstone': 'Dark flagstones', 'carpet': 'Worn carpet', 'brick': 'Sooty brick', 'slab': 'Morgue slabs', 'stage': 'Stage boards'}
WALLS = {'wood': 'Panelled wood', 'stone': 'Stone blocks', 'tile': 'Clinic tile', 'brick': 'Sooty brick', 'plaster': 'Damp plaster', 'velvet': 'Red velvet', 'slab': 'Morgue tile'}


def clean(im):
    a = np.array(im.convert('RGBA'))
    a[a[..., 3] < 20] = 0
    return Image.fromarray(a, 'RGBA')


def make_seamless(im, band=BAND):
    a = np.array(im.convert('RGB')).astype(np.float32)
    h, w, _ = a.shape
    r = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    def ramp(n):
        d = np.minimum(np.arange(n), n - 1 - np.arange(n)).astype(np.float32)  # distance to the nearest border
        t = np.clip(1 - d / band, 0, 1)
        return t * t * (3 - 2 * t)  # 1 at the border, 0 beyond the band
    wy = ramp(h)[:, None]; wx = ramp(w)[None, :]
    m = np.maximum(wy, wx)[..., None]
    out = r * m + a * (1 - m)
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB')


def wrap_resize(im, size):
    w, h = im.size
    big = Image.new('RGB', (w * 3, h * 3))
    for i in range(3):
        for j in range(3):
            big.paste(im, (i * w, j * h))
    s = big.resize((size * 3, size * 3), Image.LANCZOS)
    return s.crop((size, size, size * 2, size * 2))


def save_webp(im, path, mode='RGBA'):
    im.save(path, 'WEBP', quality=Q, method=4, exact=True)


def save_pair(im, d, id_):
    os.makedirs(d, exist_ok=True)
    w, h = im.size
    save_webp(im, os.path.join(d, f'{id_}@2x.webp'))
    half = im.resize((max(1, round(w / 2)), max(1, round(h / 2))), Image.LANCZOS)
    save_webp(clean(half), os.path.join(d, f'{id_}@1x.webp'))


def trim(im):
    a = np.array(im)[..., 3] > 20
    ys, xs = np.where(a)
    return im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


man = {'version': 1, 'world': {'tw': 92, 'th': 48, 'sub': 4}, 'floors': {}, 'walls': {}, 'pieces': {}, 'props': {}}

for kind, table, key in (('floor', FLOORS, 'floors'), ('wall', WALLS, 'walls')):
    for id_, name in table.items():
        f = os.path.join(RAW, f'{kind}_{id_}.png')
        if not os.path.exists(f):
            continue
        im = make_seamless(Image.open(f).convert('RGB'))
        im = wrap_resize(im, TEX)
        gain = GAIN.get(f'{key}/{id_}')
        if gain is None:  # auto: bring a dark texture up to the lighting the painted rooms use (mean luma about 112), never darken
            luma = float(np.array(im.convert('L')).mean())
            gain = round(min(1.8, max(1.0, 112.0 / max(luma, 1.0))), 3)
        if gain != 1.0:
            im = Image.fromarray(np.clip(np.array(im).astype(np.float32) * gain, 0, 255).astype(np.uint8), 'RGB')
        os.makedirs(os.path.join(OUT, key), exist_ok=True)
        im.save(os.path.join(OUT, key, f'{id_}@2x.webp'), 'WEBP', quality=Q, method=4)
        im.resize((TEX // 2, TEX // 2), Image.LANCZOS).save(os.path.join(OUT, key, f'{id_}@1x.webp'), 'WEBP', quality=Q, method=4)
        man[key][id_] = {'name': name, 'file2x': f'{key}/{id_}@2x.webp', 'file1x': f'{key}/{id_}@1x.webp', 'tile': TEX}

for id_, d in PIECES.items():
    f = os.path.join(RAW, f'piece_{id_}.png')
    if not os.path.exists(f):
        continue
    im = trim(clean(Image.open(f)))
    hpx = round(d['h'] * PX_PER_UNIT_PIECE)
    im = im.resize((max(1, round(im.width * hpx / im.height)), hpx), Image.LANCZOS)
    im = clean(im)
    save_pair(im, os.path.join(OUT, 'pieces'), id_)
    w, h = im.size
    ay = h if d['mount'] == 'floor' else h / 2
    man['pieces'][id_] = {'name': d['name'], 'file2x': f'pieces/{id_}@2x.webp', 'file1x': f'pieces/{id_}@1x.webp', 'w': w, 'h': h,
                          'anchorX': round(w / 2, 1), 'anchorY': round(ay, 1), 'wallSlot': d['mount'], 'sw': round(w / PX_PER_UNIT_PIECE, 2)}

for id_, d in PROPS.items():
    f = os.path.join(RAW, f'prop_{id_}.png')
    if not os.path.exists(f):
        continue
    im = trim(clean(Image.open(f)))
    wpx = round(d['sw'] * PX_PER_UNIT)
    im = clean(im.resize((wpx, max(1, round(im.height * wpx / im.width))), Image.LANCZOS))
    save_pair(im, os.path.join(OUT, 'props'), id_)
    w, h = im.size
    c, r = d['fp']
    lift = min((c + r) * 3 * PX_PER_UNIT, 0.3 * h)  # bottom vertex of the base up to the centre of the footprint
    man['props'][id_] = {'name': d['name'], 'file2x': f'props/{id_}@2x.webp', 'file1x': f'props/{id_}@1x.webp', 'w': w, 'h': h,
                         'anchorX': round(w / 2, 1), 'anchorY': round(h - lift, 1), 'footprint': d['fp'], 'sw': d['sw']}

for g in ('floors', 'walls', 'pieces', 'props'):
    for e in man[g].values():
        e['file'] = e['file2x']  # the desktop file; file1x is the phone variant
json.dump(man, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=1)
print({k: len(v) for k, v in man.items() if isinstance(v, dict)})
