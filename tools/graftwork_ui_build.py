#!/usr/bin/env python3
"""Graftwork painted UI parts: raw PNGs -> graftwork/assets/ui/ (WebP + manifest.json in the schema of graftwork/ui/templates.js).

    python3 -I tools/graftwork_ui_build.py --raw <dir> [--out <dir>] [--quiet]

<dir> holds the artist's files (in <dir>, <dir>/batch1 or <dir>/batch2; a later batch wins): card_front.<type>.<rarity>.png,
card_front.junk.png, card_back.plain.png, card_gem.png, panel.png, panel.parchment.png, modal.png, button.<state>.png,
button.small.png, chip.intent.png, chip.status.png, dial.energy.png, gauge.budget.png, plate.block.png, bar.hp.frame.png,
bar.hp.fill.png, sheet.rules.png, sheet.intent.png, bg.title_keyart.png. A missing file drops its part; the game keeps the
procedural look for it. Raw files are never committed. Run it with -I: the raws are untrusted data.

What it does (every number below is measured from the pixels, the artist's notes are only the starting point):
  cards    crop to the card outline, then bring 3:4 to the game's 220:310 by adding rows ONLY in the plain leather of the two
           rails beside the text window (each rail gets its own row map, weighted by how plain a row is, so stitches, corner
           pieces, banner and cost socket keep their shape). The art window, text window, text area, name banner, type ribbon
           and cost socket go into the manifest as slots in logical px; a frame whose window differs (attack.rare) gets its own.
  parts    crop the magenta margin, remove pink spill (glass highlights, flecks), measure 9-slice margins as "where the edge
           stops looking like the middle of the edge", pick a middle that repeats (edges tile, they never smear).
  sheets   cut the icon grids into single icons by their own bounding boxes.
  gem      three cost states from the one cabochon (as painted: cost raised; slate: printed cost; green: cost lowered).
  output   @1x and @2x WebP, small parts and icons packed into two atlases, manifest.json. Same input, same bytes.
"""
import json, os, sys
from PIL import Image
import numpy as np

REPO = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
ARGV = sys.argv[1:]


def arg(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV and ARGV.index(name) + 1 < len(ARGV) else default


RAW = arg('--raw')
OUT = os.path.abspath(arg('--out', os.path.join(REPO, 'graftwork', 'assets', 'ui')))
QUIET = '--quiet' in ARGV
Q = 82            # WebP quality of the parts (the Ward art uses the same)
Q_BG = 74         # the title key art: big, dark, soft
CARD_W, CARD_H = 220, 310    # CARD_TEMPLATE in graftwork/ui/templates.js
PAD = 2           # logical px between atlas parts
ATLAS_W = 512     # logical width of an atlas page

RULES = ['draw', 'discard', 'exhaust', 'energy', 'cost', 'retain', 'innate', 'ethereal', 'jam', 'upgrade', 'graft', 'tithe', 'strain', 'budget', 'overload', 'temper']
INTENTS = ['attack', 'multi', 'block', 'buff', 'debuff', 'heal', 'summon', 'unknown', 'stun', 'escape', 'poison', 'thread']
CARD_FRONTS = [(t, r) for t in ('attack', 'skill', 'power') for r in ('common', 'uncommon', 'rare')]


def say(*a):
    if not QUIET:
        print(*a)


# ---------------------------------------------------------------- pixels
def find(name):
    for d in ('batch2', 'batch1', ''):
        p = os.path.join(RAW, d, name + '.png')
        if os.path.isfile(p):
            return p
    return None


def load(name):
    p = find(name)
    return None if p is None else np.asarray(Image.open(p).convert('RGBA'), dtype=np.float32)


def to_img(a):
    return Image.fromarray(np.clip(np.rint(a), 0, 255).astype(np.uint8), 'RGBA')


def bbox(a, thr=8):
    ys, xs = np.where(a[..., 3] > thr)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def trim(a):
    x0, y0, x1, y1 = bbox(a)
    return a[y0:y1, x0:x1]


def clean(im):
    """alpha under 20 becomes nothing (the keyer's haze), as in the Ward art build"""
    a = np.array(im.convert('RGBA'))
    a[a[..., 3] < 20] = 0
    return Image.fromarray(a, 'RGBA')


def resize(a, w, h):
    """premultiplied Lanczos, so a transparent neighbour never bleeds its colour into an edge"""
    im = to_img(a).convert('RGBa').resize((int(w), int(h)), Image.LANCZOS).convert('RGBA')
    return clean(im)


def despill(a, glass=0.0):
    """Remove the magenta key that survived in the art: a pixel whose red and blue both stand above its green is pulled to
    neutral (bright ones up to white, dark ones down to grey). glass > 0 also thins the alpha of what was pink, for highlights
    painted on glass. Returns the number of pixels touched."""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    mag = np.minimum(r, b) - g
    hit = (mag > 14) & (np.abs(r - b) < 0.22 * np.maximum(r, b)) & (a[..., 3] > 0)   # the key is pure magenta: red and blue alike
    if not hit.any():
        return 0
    t = np.clip((np.maximum(r, b) - 100.0) / 90.0, 0, 1)   # 1 = a highlight, 0 = a dark fringe
    m = np.where(hit, mag, 0.0)
    a[..., 1] = g + m * t
    a[..., 0] = r - m * (1 - t)
    a[..., 2] = b - m * (1 - t)
    if glass:
        a[..., 3] *= 1 - glass * np.clip(m / 60.0, 0, 1)
    return int(hit.sum())


def runs(mask):
    out, start = [], None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            out.append((start, i - 1)); start = None
    if start is not None:
        out.append((start, len(mask) - 1))
    return out


def box(v, k):
    """moving average over 2k+1 samples (edges repeat)"""
    p = np.pad(v, k, mode='edge')
    c = np.cumsum(np.insert(p, 0, 0.0))
    return (c[2 * k + 1:] - c[:-2 * k - 1]) / (2 * k + 1)


def save(im, rel, q=Q, opaque=False):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if opaque:
        im.convert('RGB').save(p, 'WEBP', quality=q, method=6)
    else:
        im.save(p, 'WEBP', quality=q, method=6, exact=True)
    return os.path.getsize(p)


# ---------------------------------------------------------------- 9-slice measurement
def edge_margin(band, axis_len):
    """band: the strip along one edge, shape (thickness, length, 4) with the edge running along axis 1. The middle 30% of the
    strip is taken as what the plain edge looks like (median cross-section); the margin is how far from each end the strip
    still differs from that. Returns (start margin, end margin) in pixels."""
    n = band.shape[1]
    mid = band[:, int(n * 0.35):int(n * 0.65)]
    ref = np.median(mid, axis=1, keepdims=True)
    d = box(np.abs(band - ref).mean(axis=(0, 2)), max(2, n // 200))
    base = d[int(n * 0.35):int(n * 0.65)]
    thr = max(float(np.percentile(base, 95)) * 1.6, float(np.median(base)) + 6.0)
    bad = d > thr
    lo = 0
    for s, e in runs(bad[:n // 2]):
        if e - s >= max(2, n // 300):
            lo = e + 1
    hi = 0
    for s, e in runs(bad[::-1][:n // 2]):
        if e - s >= max(2, n // 300):
            hi = e + 1
    return lo, hi


def measure_slice(a, band_frac=0.2):
    """[l, t, r, b] in pixels of `a`: the corners that must never stretch."""
    h, w = a.shape[:2]
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255.0
    bt = max(4, int(h * band_frac)); bl = max(4, int(w * band_frac))
    l1, r1 = edge_margin(pm[:bt], w)
    l2, r2 = edge_margin(pm[h - bt:], w)
    t1, b1 = edge_margin(np.transpose(pm[:, :bl], (1, 0, 2)), h)
    t2, b2 = edge_margin(np.transpose(pm[:, w - bl:], (1, 0, 2)), h)
    return [max(l1, l2), max(t1, t2), max(r1, r2), max(b1, b2)]


def best_period(a, sl, min_keep=0.5):
    """Shrink the stretch zone of a sliced part to a piece that REPEATS: among the middles [x0, x1) inside the slice margins
    pick the one whose two ends look most alike in the edge bands (so a rope or a row of stitches continues across the seam).
    Returns new margins [l, t, r, b]; only r and b grow."""
    h, w = a.shape[:2]
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255.0
    l, t, r, b = sl

    def pick(band, lo, hi):   # band: (thickness, length, 4)
        span = hi - lo
        if span < 24:
            return hi
        k = max(2, min(8, span // 12))
        head, tail = band[:, lo:lo + k], band[:, hi - k:hi]
        best, best_e = hi, None
        for cut in range(int(span * min_keep), span + 1):
            nxt = band[:, lo + cut:lo + cut + k]          # what follows the cut in the art: it should look like the tile's own start
            end = band[:, lo + cut - k:lo + cut]          # the tile's end: it should look like what stood before the far corner
            if nxt.shape[1] < k:
                continue
            e = float(np.abs(nxt - head).mean()) + float(np.abs(end - tail).mean()) + 0.5 * (span - cut) / span
            if best_e is None or e < best_e:
                best, best_e = lo + cut, e
        return best

    bt = max(4, int(h * 0.2)); bl = max(4, int(w * 0.2))
    edges_x = np.concatenate([pm[:bt], pm[h - bt:]], axis=0)
    edges_y = np.transpose(np.concatenate([pm[:, :bl], pm[:, w - bl:]], axis=1), (1, 0, 2))
    x1 = pick(edges_x, l, w - r)
    y1 = pick(edges_y, t, h - b)
    return x1, y1


def crop_middle(a, sl, x1, y1):
    """cut the columns [x1, w - r) and the rows [y1, h - b) out of `a`: what is left is corners plus one repeating middle"""
    h, w = a.shape[:2]
    l, t, r, b = sl
    a = np.concatenate([a[:, :x1], a[:, w - r:]], axis=1)
    a = np.concatenate([a[:y1], a[h - b:]], axis=0)
    return a


# ---------------------------------------------------------------- cards
# The card outline inside the 1792 x 2400 canvas, the same in all ten fronts (measured as the alpha box, torn bits ignored).
CARD_BOX = (85, 90, 1707, 2311)
# Places the pixels cannot tell us, read off the art by eye, in raw file px: the name banner between the two windows (the leather
# between the outer ends of its clasps), the ribbon beside the cost socket, the cost socket (centre, outer brass radius).
BANNER = (322, 1238, 1470, 1378)
RIBBON = (486, 196, 990, 304)
SOCKET = (280, 275, 165)


def hole_at(alpha, cx, cy):
    """the transparent window that holds (cx, cy): its bounding box (x0, y0, x1, y1), grown row by row from the seed"""
    tr = alpha < 128
    h, w = tr.shape
    if not tr[cy, cx]:
        return None
    reach = np.zeros_like(tr)

    def seed_row(y, prev):
        row = tr[y]
        if not row.any():
            return np.zeros(w, bool)
        ids = np.cumsum(np.concatenate([[row[0]], row[1:] & ~row[:-1]])) * row
        keep = np.unique(ids[prev & row]); keep = keep[keep > 0]
        return np.isin(ids, keep) & row

    start = np.zeros(w, bool); start[cx] = True
    reach[cy] = seed_row(cy, start)
    for _ in range(2):
        for y in range(cy + 1, h):
            nr = seed_row(y, reach[y - 1]) | reach[y]
            if not nr.any():
                break
            reach[y] = nr
        for y in range(cy - 1, -1, -1):
            nr = seed_row(y, reach[y + 1]) | reach[y]
            if not nr.any():
                break
            reach[y] = nr
    ys = np.where(reach.any(axis=1))[0]; xs = np.where(reach.any(axis=0))[0]
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1, reach


def clear_rows(reach, x0, x1, frac=0.7):
    """rows of a window where the middle `frac` of its width is fully open (an ornament that hangs into the window ends them)"""
    cx = (x0 + x1) // 2; half = int((x1 - x0) * frac / 2)
    ok = reach[:, cx - half:cx + half].all(axis=1)
    best = max(runs(ok), key=lambda r: r[1] - r[0])
    return best[0], best[1] + 1


def rail_map(blk, add):
    """blk: one rail, rows x cols x 4 premultiplied. Returns it `add` rows taller: rows are added where the rail is plain."""
    n = blk.shape[0]
    cover = np.maximum(blk[..., 3].sum(axis=1), 1.0)
    e = np.abs(blk[1:] - blk[:-1]).sum(axis=(1, 2)) / np.minimum(cover[1:], cover[:-1])
    e = box(np.append(e, e[-1]), 6)
    lo, hi = np.percentile(e, 15), np.percentile(e, 55)
    wgt = np.clip((hi - e) / max(hi - lo, 1e-6), 0, 1)
    ramp = np.clip(np.minimum(np.arange(n), n - 1 - np.arange(n)) / 24.0, 0, 1)   # nothing right at the zone's ends
    wgt = box(wgt * ramp, 4)
    step = np.ones(n)
    left = float(add)
    for _ in range(8):           # hand the rows out, at most +0.7 per row
        room = (step < 1.7) & (wgt > 0)
        if left <= 1e-6 or not room.any():
            break
        give = left * wgt * room / max(float((wgt * room).sum()), 1e-9)
        new = np.minimum(step + give, 1.7)
        left -= float((new - step).sum()); step = new
    if left > 1e-6:
        step += left / n
    edges = np.concatenate([[0.0], np.cumsum(step)])                      # where each source row starts in the output
    pos = np.interp(np.arange(n + add) + 0.5, edges, np.arange(n + 1)) - 0.5
    pos = np.clip(pos, 0, n - 1)
    i0 = np.floor(pos).astype(int); i1 = np.minimum(i0 + 1, n - 1); f = (pos - i0)[:, None, None]
    return blk[i0] * (1 - f) + blk[i1] * f, float(step.max())


def card_front(name):
    """-> (float RGBA array at the card ratio, slots in logical px, notes) or None"""
    a = load(name)
    if a is None:
        return None
    X0, Y0, X1, Y1 = CARD_BOX
    bx = bbox(a, 128)
    if max(abs(bx[0] - X0), abs(bx[1] - Y0), abs(bx[2] - X1), abs(bx[3] - Y1)) > 14:
        say(f'  WARN {name}: card outline {bx} is not the usual {CARD_BOX}')
    a = a[Y0:Y1, X0:X1].copy()
    h, w = a.shape[:2]
    alpha = a[..., 3]
    # the two windows: the art window sits in the upper half, the text window in the lower
    art = hole_at(alpha, w // 2, int(h * 0.30))
    txt = hole_at(alpha, w // 2, int(h * 0.82))
    if art is None or txt is None:
        say(f'  WARN {name}: a window is not transparent, skipped'); return None
    ax0, ay0, ax1, ay1 = art[:4]
    tx0, ty0, tx1, ty1, treach = txt
    # where text can go: the rows of the text window whose middle is open (attack.rare hangs an ornament into the top)
    cy0, cy1 = clear_rows(treach, tx0, tx1)
    # --- rows: the card must become w * 310 / 220 tall. Every added row goes into the rails beside the text window.
    out_h = int(round(w * CARD_H / CARD_W)); add = out_h - h
    z0, z1 = cy0 + 30, cy1 - 30                    # the stretch zone: clear of the banner above and the corner pieces below
    cut = (tx0 + tx1) // 2
    centre_open = (alpha[z0:z1, cut - 20:cut + 20] < 8).all()
    pm = a.copy(); pm[..., :3] *= pm[..., 3:4] / 255.0
    top, zone, bot = pm[:z0], pm[z0:z1], pm[z1:]
    if add > 0 and centre_open:
        left, s1 = rail_map(zone[:, :cut], add)
        right, s2 = rail_map(zone[:, cut:], add)
        zone = np.concatenate([left, right], axis=1)
        note = f'+{add} rows in the text rails (steepest local stretch x{max(s1, s2):.2f})'
    elif add > 0:
        i = np.clip(np.interp(np.arange(z1 - z0 + add) + 0.5, np.linspace(0, z1 - z0 + add, z1 - z0 + 1), np.arange(z1 - z0 + 1)) - 0.5, 0, z1 - z0 - 1)
        i0 = np.floor(i).astype(int); i1 = np.minimum(i0 + 1, z1 - z0 - 1); f = (i - i0)[:, None, None]
        zone = zone[i0] * (1 - f) + zone[i1] * f
        note = f'+{add} rows, even stretch of the text zone (its middle is not open)'
    else:
        note = 'no rows added'
    pm = np.concatenate([top, zone, bot], axis=0)
    out = pm.copy()
    al = np.maximum(out[..., 3:4], 1e-3)
    out[..., :3] = np.where(out[..., 3:4] > 0, out[..., :3] * 255.0 / al, 0)
    # --- slots, logical px, origin at the card centre
    sx = CARD_W / w; sy = CARD_H / out_h

    def lx(x):
        return round(x * sx - CARD_W / 2, 2)

    def ly(y):          # a raw row (after the crop) -> logical y; rows under the stretch zone moved down by `add`
        return round((y + (add if y >= z1 else 0)) * sy - CARD_H / 2, 2)

    def rect(x0, y0, x1, y1):
        return {'x': lx(x0), 'y': ly(y0), 'w': round(lx(x1) - lx(x0), 2), 'h': round(ly(y1) - ly(y0), 2)}

    bn = (BANNER[0] - X0, BANNER[1] - Y0, BANNER[2] - X0, BANNER[3] - Y0)
    rb = (RIBBON[0] - X0, RIBBON[1] - Y0, RIBBON[2] - X0, RIBBON[3] - Y0)
    sc = (SOCKET[0] - X0, SOCKET[1] - Y0, SOCKET[2])
    slots = {
        'window': rect(ax0, ay0, ax1, ay1),
        'textHole': rect(tx0, ty0, tx1, ty1),
        'textBox': rect(tx0 + 36, cy0 + 22, tx1 - 36, cy1 - 20),
        'namePlate': rect(*bn),
        'typeBand': rect(*rb),
        'socket': {'x': lx(sc[0] - sc[2]), 'y': ly(sc[1] - sc[2]), 'w': round(2 * sc[2] * sx, 2), 'h': round(2 * sc[2] * sy, 2)},
    }
    return out, slots, note


def card_layout(m):
    """the template slots of a painted front from what was measured in it (m: window, textHole, textBox, namePlate, typeBand, socket)"""
    win, hole, tb, name, ty, so = m['window'], m['textHole'], m['textBox'], m['namePlate'], m['typeBand'], m['socket']
    gem_r = round(so['w'] / 2 * 0.97, 1)
    cx, cy = so['x'] + so['w'] / 2, so['y'] + so['h'] / 2
    return {
        # both faces
        'window': dict(win, r=2), 'windowCompact': dict(win, r=2), 'windowCompactGrafts': dict(win, r=2),
        'textHole': hole,
        'namePlate': dict(name, fit={'max': 16, 'min': 9.5, 'lines': 1}),
        'namePlateCompact': dict(name, fit={'max': 20, 'min': 11, 'lines': 1}),
        'costGem': {'x': round(cx - gem_r, 2), 'y': round(cy - gem_r, 2), 'w': round(gem_r * 2, 2), 'h': round(gem_r * 2, 2)},
        'costGemCompact': {'x': round(cx - gem_r - 2.5, 2), 'y': round(cy - gem_r - 2.5, 2), 'w': round(gem_r * 2 + 5, 2), 'h': round(gem_r * 2 + 5, 2)},
        'fusedSlots': {'x': -117, 'y': round(tb['y'] + 2, 2), 'w': 18, 'h': 18, 'step': {'x': 0, 'y': round((tb['h'] - 22) / 3, 1)}, 'n': 4},
        'fusedSlotsCompact': {'x': -117, 'y': round(tb['y'] + 2, 2), 'w': 18, 'h': 18, 'step': {'x': 0, 'y': round((tb['h'] - 22) / 3, 1)}, 'n': 4},
        # type on the ribbon, rules text in the text window (both faces); the full face hangs its graft patches down the right edge
        'typeBand': dict(ty, fit={'max': 11, 'min': 9}), 'typeBandCompact': dict(ty, fit={'max': 11, 'min': 9}),
        'textBox': dict(tb, fit={'max': 15, 'min': 8}), 'textBoxCompact': dict(tb, fit={'max': 15, 'min': 8}),
        'graftSlots': {'x': 97, 'y': round(tb['y'] - 1, 2), 'w': 34, 'h': 30, 'step': {'x': 0, 'y': round((tb['h'] - 30) / 2, 1)}, 'n': 3},
        # compact (hand) face: the big number stands on the lower part of the picture (the top of a card is what a hand shows), the graft
        # chips take the text window of a grafted card. The frame's colour says the type and the school seal sits on the picture, so
        # the two corner glyphs of the procedural hand face are switched off (a slot of no size).
        'keyNumber': {'x': win['x'], 'y': round(win['y'] + win['h'] - 74, 2), 'w': win['w'], 'h': 74},
        'graftBand': {'x': round(tb['x'] + 1, 2), 'y': round(tb['y'] + 8, 2), 'w': round(tb['w'] - 2, 2), 'h': 38},
        'typeGlyph': {'x': 0, 'y': 0, 'w': 0, 'h': 0},
        'schoolGlyph': {'x': 0, 'y': 0, 'w': 0, 'h': 0},
    }


def differs(a, b, tol=0.6):
    if isinstance(a, dict) and isinstance(b, dict):
        return set(a) != set(b) or any(differs(a[k], b[k], tol) for k in a)
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return abs(a - b) > tol
    return a != b


def build_cards(man, sizes):
    fronts = {}
    for t, r in CARD_FRONTS:
        got = card_front(f'card_front.{t}.{r}')
        if got:
            fronts[f'card_front.{t}.{r}'] = got
    got = card_front('card_front.junk')
    if got:
        fronts['card_front.junk'] = got
    if not fronts:
        return
    ref_id = 'card_front.attack.common' if 'card_front.attack.common' in fronts else sorted(fronts)[0]
    ref = card_layout(fronts[ref_id][1])
    man['templates']['card_front'] = {'slots': ref}
    for fid in sorted(fronts):
        arr, slots, note = fronts[fid]
        stem = 'cards/' + fid.replace('card_front.', 'front_').replace('.', '_')
        e = {'file1x': stem + '@1x.webp', 'file2x': stem + '@2x.webp', 'w': CARD_W, 'h': CARD_H,
             'under': ['window', 'textHole', 'keyNumber'], 'baked': ['namePlate', 'typeBand', 'pips']}
        sizes[e['file2x']] = save(resize(arr, CARD_W * 2, CARD_H * 2), e['file2x'])
        sizes[e['file1x']] = save(resize(arr, CARD_W, CARD_H), e['file1x'])
        mine = card_layout(slots)
        own = {k: v for k, v in mine.items() if differs(v, ref[k])}       # a frame whose windows are not where the others have them
        if own:
            e['slots'] = own
        man['frames'][fid] = e
        say(f'  {fid}: {note}' + (f'; own slots {sorted(own)}' if own else ''))
    # the ids the game asks for that have no painting of their own: starter cards wear the common frame, an unknown type the junk one
    for t in ('attack', 'skill', 'power'):
        if f'card_front.{t}.common' in man['frames']:
            man['frames'][f'card_front.{t}'] = dict(man['frames'][f'card_front.{t}.common'])
    if 'card_front.junk' in man['frames']:
        man['frames']['card_front'] = dict(man['frames']['card_front.junk'])


def build_card_back(man, sizes):
    a = load('card_back.plain')
    if a is None:
        return
    h, w = a.shape[:2]
    # opaque 3:4 art -> 220:310. Trim the plain outer edge a little, then add the missing rows between the corner pieces.
    cutx = 26
    a = a[:, cutx:w - cutx]; w = a.shape[1]
    out_h = int(round(w * CARD_H / CARD_W)); add = out_h - h
    z0, z1 = int(h * 0.23), int(h * 0.80)
    n = z1 - z0
    pos = np.clip(np.interp(np.arange(n + add) + 0.5, np.linspace(0, n + add, n + 1), np.arange(n + 1)) - 0.5, 0, n - 1)
    i0 = np.floor(pos).astype(int); i1 = np.minimum(i0 + 1, n - 1); f = (pos - i0)[:, None, None]
    zone = a[z0:z1][i0] * (1 - f) + a[z0:z1][i1] * f
    a = np.concatenate([a[:z0], zone, a[z1:]], axis=0)
    # round the corners like the fronts (the game clips nothing): alpha from a rounded rectangle, radius 12 logical px
    hh, ww = a.shape[:2]
    rad = 12 * ww / CARD_W
    yy, xx = np.mgrid[0:hh, 0:ww].astype(np.float32)
    dx = np.maximum(np.maximum(rad - xx - 0.5, xx + 0.5 - (ww - rad)), 0); dy = np.maximum(np.maximum(rad - yy - 0.5, yy + 0.5 - (hh - rad)), 0)
    a[..., 3] = np.clip(rad - np.sqrt(dx * dx + dy * dy) + 0.5, 0, 1) * 255.0
    e = {'file1x': 'cards/back_plain@1x.webp', 'file2x': 'cards/back_plain@2x.webp', 'w': CARD_W, 'h': CARD_H}
    sizes[e['file2x']] = save(resize(a, CARD_W * 2, CARD_H * 2), e['file2x'])
    sizes[e['file1x']] = save(resize(a, CARD_W, CARD_H), e['file1x'])
    man['frames']['card_back.plain'] = e
    # the brass plate at the bottom centre takes the title (raw rows 2080..2260 of 2400, columns 500..1300 of 1792)
    sy = CARD_H / hh; sx = CARD_W / ww
    py0 = (2090 + add) * sy - CARD_H / 2; py1 = (2250 + add) * sy - CARD_H / 2
    px0 = (520 - cutx) * sx - CARD_W / 2; px1 = (1272 - cutx) * sx - CARD_W / 2
    man['templates']['card_back'] = {'slots': {'title': {'x': round(px0, 2), 'y': round(py0, 2), 'w': round(px1 - px0, 2), 'h': round(py1 - py0, 2)}}}
    say(f'  card_back.plain: {cutx} px trimmed per side, +{add} rows between the corner pieces')


# ---------------------------------------------------------------- atlas
class Atlas:
    def __init__(self, name):
        self.name, self.parts = name, []

    def add(self, pid, arr, lw, lh, group='frames', **extra):
        """arr: float RGBA at any size; it is drawn lw x lh logical px"""
        self.parts.append({'id': pid, 'arr': arr, 'w': int(lw), 'h': int(lh), 'group': group, 'extra': extra})

    def pack(self, man, sizes):
        if not self.parts:
            return
        order = sorted(self.parts, key=lambda p: (-p['h'], -p['w'], p['id']))
        x = y = PAD; row_h = 0; width = ATLAS_W
        for p in order:
            if x + p['w'] + PAD > width:
                x = PAD; y += row_h + PAD; row_h = 0
            p['x'], p['y'] = x, y
            x += p['w'] + PAD; row_h = max(row_h, p['h'])
        height = y + row_h + PAD
        used_w = max(p['x'] + p['w'] for p in order) + PAD
        for tag, k in (('2x', 2), ('1x', 1)):
            sheet = Image.new('RGBA', (used_w * k, height * k), (0, 0, 0, 0))
            for p in order:
                sheet.paste(resize(p['arr'], p['w'] * k, p['h'] * k), (p['x'] * k, p['y'] * k))
            rel = f'atlas/{self.name}@{tag}.webp'
            sizes[rel] = save(sheet, rel)
        man['atlases'][self.name] = {'file1x': f'atlas/{self.name}@1x.webp', 'file2x': f'atlas/{self.name}@2x.webp', 'w': used_w, 'h': height}
        for p in sorted(self.parts, key=lambda q: q['id']):
            e = {'atlas': self.name, 'rect': [p['x'], p['y'], p['w'], p['h']]}
            e.update(p['extra'])
            man[p['group']][p['id']] = e
        say(f'  atlas {self.name}: {len(self.parts)} parts, {used_w} x {height} logical px')


def field_inset(a):
    """how thick the frame of a panel is: from the middle of each side inward, the first pixel that is the panel's field (transparent,
    or the colour of the centre and staying so). Returns [l, t, r, b] in pixels."""
    h, w = a.shape[:2]
    cy, cx = h // 2, w // 2
    mid = a[cy - 8:cy + 8, cx - 8:cx + 8].reshape(-1, 4)
    ref = np.median(mid, axis=0)

    def run(line):
        same = (line[:, 3] < 40) if ref[3] < 40 else ((np.abs(line[:, :3] - ref[:3]).max(axis=1) < 26) & (line[:, 3] > 200))
        n = len(same); need = max(6, n // 40)
        for i in range(n // 2):
            if same[i:i + need].all():
                return i
        return 0
    return [run(a[cy]), run(a[:, cx]), run(a[cy, ::-1]), run(a[::-1, cx])]


def sliced(atlas, pid, a, lw, lh, tile=True, fill=True, notes=None, band=0.2, content=None, pad=3, cap=None):
    """add a 9-slice part: margins measured in the art, the middle cut down to a piece that repeats, logical margins in the manifest"""
    h, w = a.shape[:2]
    sl = measure_slice(a, band)
    if cap:                        # a ragged edge never looks like its own middle: the measurement is held to this many px
        sl = [min(v, cap) for v in sl]
    k = lw / w
    sl = [min(v + pad / k * 0.5, lim) for v, lim in zip(sl, (w * 0.45, h * 0.45, w * 0.45, h * 0.45))]
    sl = [int(round(v)) for v in sl]
    x1, y1 = best_period(a, sl) if tile else (w - sl[2], h - sl[3])
    small = crop_middle(a, sl, x1, y1)
    nh, nw = small.shape[:2]
    lw2 = max(int(round(nw * k)), 4); lh2 = max(int(round(nh * (lh / h))), 4)
    lsl = [int(round(sl[0] * k)), int(round(sl[1] * lh / h)), int(round(sl[2] * k)), int(round(sl[3] * lh / h))]
    lsl = [min(lsl[0], lw2 // 2 - 1), min(lsl[1], lh2 // 2 - 1), min(lsl[2], lw2 // 2 - 1), min(lsl[3], lh2 // 2 - 1)]
    extra = {'slice': lsl}
    if tile:
        extra['tile'] = True
    if not fill:
        extra['fill'] = False
    if content:                     # the frame stands AROUND what it holds: its field (inside the border) is the content rect
        fi = field_inset(a)
        il, it, ir, ib = [int(round(v * (lw / w if i % 2 == 0 else lh / h))) for i, v in enumerate(fi)]
        extra['content'] = {'x': il, 'y': it, 'w': lw2 - il - ir, 'h': lh2 - it - ib}
    atlas.add(pid, small, lw2, lh2, **extra)
    say(f'  {pid}: slice measured {sl} px of {w} x {h}' + (f' (notes: {notes})' if notes else '') + f' -> {lsl} of {lw2} x {lh2} logical' + (f', middle cut to {x1 - sl[0]} x {y1 - sl[1]} px to repeat' if tile else '') + (f', field inside {extra["content"]}' if content else ''))
    return lsl, (lw2, lh2)


def key_centre(a):
    """panel.png has a vellum centre; the game's panels are dark slabs with light text, so the centre is removed and the code
    paints its own fill under the leather border. Everything lighter than the leather that connects to the middle goes."""
    h, w = a.shape[:2]
    lum = a[..., 0] * 0.3 + a[..., 1] * 0.59 + a[..., 2] * 0.11
    light = (lum > 52) & (a[..., 3] > 128)
    reach = np.zeros_like(light)
    cy = h // 2
    row = light[cy]
    ids = np.cumsum(np.concatenate([[row[0]], row[1:] & ~row[:-1]])) * row
    reach[cy] = (ids == ids[w // 2]) & row
    for rng in (range(cy + 1, h), range(cy - 1, -1, -1)):
        prev = reach[cy]
        for y in rng:
            row = light[y]
            ids = np.cumsum(np.concatenate([[row[0]], row[1:] & ~row[:-1]])) * row
            keep = np.unique(ids[prev & row]); keep = keep[keep > 0]
            cur = np.isin(ids, keep) & row
            if not cur.any():
                break
            reach[y] = cur; prev = cur
    # soften the cut by two pixels
    m = reach.astype(np.float32)
    for _ in range(2):
        m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5.0
    a[..., 3] *= 1 - m
    return int(reach.sum())


def build_chrome(man, sizes, report):
    at = Atlas('chrome')
    # ---- panels
    a = load('panel')
    if a is not None:
        a = trim(a); despill(a)
        n = key_centre(a)
        sliced(at, 'panel', a, 216, 216, fill=False, notes='340 on every side', content=True)
        report['panel'] = f'vellum centre removed ({n} px), border only'
    a = load('panel.parchment')
    if a is not None:
        a = trim(a); despill(a)
        sliced(at, 'panel.parchment', a, 180, 178, notes='about 120', band=0.12, cap=190, tile=False)   # the sheet is shaded across: it stretches, a repeat would show
    a = load('modal')
    if a is not None:
        a = trim(a); despill(a)
        sliced(at, 'modal', a, 188, 187, notes='about 290, corner brackets about 280', band=0.3, content=True)
    # ---- buttons: a leather pill in four states that share one geometry. Its caps are measured on the outline (where the top edge
    # stops curving) and scale with the height in the game; the middle stretches (the leather is shaded end to end, a repeat would band).
    ref = load('button.normal')
    if ref is not None:
        ref = trim(ref)
        h, w = ref.shape[:2]
        solid = ref[..., 3] > 128
        top = np.where(solid.any(axis=0), np.argmax(solid, axis=0), h)      # the outline's top edge, column by column
        flat = int(np.median(top[w // 3: 2 * w // 3]))
        capL = int(np.argmax(top <= flat + 1)); capR = int(np.argmax(top[::-1] <= flat + 1))
        cap = int(max(capL, capR) * 1.12)
        lh = 64; lw = int(round(w * lh / h)); lcap = int(round(cap * lh / h))
        for st in ('normal', 'hover', 'down', 'disabled'):
            a = load('button.' + st)
            if a is None:
                continue
            a = trim(a); despill(a)
            at.add('button.' + st, a, lw, lh, slice=[lcap, lh // 2 - 1, lcap, lh // 2 - 1], scale='height')
        say(f'  button.*: caps measured {capL} / {capR} px of {w} x {h} (notes: 150) -> {lcap} of {lw} x {lh} logical, a pill: caps follow the height')
    a = load('button.small')
    if a is not None:
        a = trim(a); despill(a)
        sliced(at, 'button.small', a, 90, 40, notes='150 left and right, 120 top and bottom', band=0.5, pad=2)
    # ---- chips, plate, dial: single images
    for pid, lw, lh in (('chip.intent', 48, 52), ('chip.status', 48, 48), ('plate.block', 56, 56), ('dial.energy', 96, 96)):
        a = load(pid)
        if a is None:
            continue
        a = trim(a); n = despill(a)
        # the intent chip is a shield: it widens to hold an icon and a number by stretching the few columns around its point
        extra = {'slice': [21, lh // 2 - 1, 21, lh // 2 - 1], 'scale': 'height'} if pid == 'chip.intent' else {}
        at.add(pid, a, lw, lh, **extra)
        if n:
            report[pid] = f'{n} pink pixels neutralised'
    # ---- HP bar: frame (caps + glass) and the liquid
    a = load('bar.hp.frame')
    if a is not None:
        a = trim(a); n = despill(a, glass=0.5)
        h, w = a.shape[:2]
        capw = max(runs(a[h // 2, :w // 2, 3] > 128), key=lambda r: r[1] - r[0])[1] + 1
        k = 24 / h
        lw = int(round(w * k)); cap = int(round(capw * k)) + 1
        at.add('bar.hp.frame', a, lw, 24, slice=[cap, 11, cap, 11], content={'x': cap - 3, 'y': 4, 'w': lw - 2 * cap + 6, 'h': 16})
        report['bar.hp.frame'] = f'{n} pink pixels of the glass highlights turned to white, half as opaque'
        say(f'  bar.hp.frame: caps {capw} px of {w} -> {cap} of {lw} x 24 logical')
    a = load('bar.hp.fill')
    if a is not None:
        h, w = a.shape[:2]
        a = a[:, : w // 2]                   # the strip is two mirrored copies: one copy, mirrored again by the code, tiles
        at.add('bar.hp.fill', a, 128, 16)
    # ---- Budget gauge: cap, one socket cell, cap (the game repeats the cell once per Budget point)
    a = load('gauge.budget')
    if a is not None:
        a = trim(a); despill(a)
        h, w = a.shape[:2]
        dark = (a[h // 2, :, :3].sum(axis=1) < 40) & (a[h // 2, :, 3] > 200)
        socks = [r for r in runs(dark) if r[1] - r[0] > h * 0.25]
        if len(socks) >= 3:
            cs = [(r[0] + r[1] + 1) / 2 for r in socks]
            pitch = (cs[-1] - cs[0]) / (len(cs) - 1)
            x0 = int(round(cs[0] - pitch / 2)); x1 = int(round(cs[1] - pitch / 2)); xe = int(round(cs[-1] + pitch / 2))
            k = 34 / h
            dia = (socks[0][1] - socks[0][0] + 1) * k
            cell_w = int(round((x1 - x0) * k))
            common = {'socket': round(dia, 1)}
            at.add('gauge.budget.l', a[:, :x0], int(round(x0 * k)), 34)
            at.add('gauge.budget.cell', a[:, x0:x1], cell_w, 34, **common)
            at.add('gauge.budget.r', a[:, xe:], int(round((w - xe) * k)), 34)
            say(f'  gauge.budget: {len(socks)} sockets, pitch {pitch:.0f} px, cell {cell_w} x 34 logical, socket {dia:.1f}')
        else:
            say('  WARN gauge.budget: sockets not found, skipped')
    # ---- the cost gem in three states
    a = load('card_gem')
    if a is not None:
        a = trim(a); despill(a)
        h, w = a.shape[:2]
        side = max(h, w)
        sq = np.zeros((side, side, 4), np.float32)
        oy, ox = (side - h) // 2, (side - w) // 2
        sq[oy:oy + h, ox:ox + w] = a
        yy, xx = np.mgrid[0:side, 0:side].astype(np.float32)
        rr = np.sqrt((xx - side / 2) ** 2 + (yy - side / 2) ** 2) / (side / 2)
        stone = np.clip((0.70 - rr) / 0.03, 0, 1)[..., None]            # the cabochon inside its bezel
        for pid, hue, sat, val in (('card_gem.up', None, 1.0, 0.92), ('card_gem', 0.58, 0.55, 0.62), ('card_gem.down', 0.36, 0.7, 0.72)):
            g = sq.copy()
            if hue is not None:
                rgb = g[..., :3] / 255.0
                mx = rgb.max(axis=2); mn = rgb.min(axis=2)
                s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0) * sat
                v = mx
                i = np.floor(hue * 6); f = hue * 6 - i
                p = v * (1 - s); q2 = v * (1 - f * s); t2 = v * (1 - (1 - f) * s)
                i = int(i) % 6
                rec = [(v, t2, p), (q2, v, p), (p, v, t2), (p, q2, v), (t2, p, v), (v, p, q2)][i]
                rgb2 = np.stack(rec, axis=2) * 255.0
                g[..., :3] = g[..., :3] * (1 - stone) + rgb2 * stone
            g[..., :3] = g[..., :3] * (1 - stone) + g[..., :3] * val * stone
            at.add(pid, g, 64, 64)
        report['card_gem'] = 'three cost states made from the one gem (slate: printed cost, as painted: raised, green: lowered)'
    at.pack(man, sizes)


def build_icons(man, sizes, report):
    at = Atlas('icons')
    for sheet, ids, cols, rows_n, prefix in (('sheet.rules', RULES, 4, 4, 'rules.'), ('sheet.intent', INTENTS, 4, 3, 'intent.')):
        a = load(sheet)
        if a is None:
            continue
        n = despill(a)
        if n:
            report[sheet] = f'{n} pink pixels neutralised (the coin hole, the fleck on the smoke)'
        h, w = a.shape[:2]
        cw, ch = w / cols, h / rows_n
        for i, iid in enumerate(ids):
            cx0, cy0 = int(round((i % cols) * cw)), int(round((i // cols) * ch))
            cell = a[cy0:int(round(cy0 + ch)), cx0:int(round(cx0 + cw))]
            cell = trim(cell)
            hh, ww = cell.shape[:2]
            side = max(hh, ww)                       # square canvas, the medallion centred
            sq = np.zeros((side, side, 4), np.float32)
            sq[(side - hh) // 2:(side - hh) // 2 + hh, (side - ww) // 2:(side - ww) // 2 + ww] = cell
            at.add(prefix + iid, sq, 48, 48, group='icons')
    at.pack(man, sizes)


def inpaint(a, poly):
    """Take the dark strokes (lettering) out of the quadrilateral `poly` of an RGB array: every stroke pixel is replaced by what the
    paper around it suggests (the hole is filled from its rim inward, then smoothed), so the sheet keeps its own light and grain."""
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    x0, x1, y0, y1 = int(min(xs)) - 6, int(max(xs)) + 7, int(min(ys)) - 6, int(max(ys)) + 7
    blk = a[y0:y1, x0:x1].copy()
    h, w = blk.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    inside = np.ones((h, w), bool)
    for i in range(4):                                     # the four half planes of the (convex, clockwise) quadrilateral
        (ax, ay), (bx, by) = poly[i], poly[(i + 1) % 4]
        inside &= ((bx - ax) * (yy + y0 - ay) - (by - ay) * (xx + x0 - ax)) >= 0
    lum = blk @ np.array([0.3, 0.59, 0.11], np.float32)
    paper = lum.copy()
    for _ in range(3):                                     # the local paper tone: a wide blur of the brightness
        paper = np.apply_along_axis(lambda v: box(v, 9), 0, paper); paper = np.apply_along_axis(lambda v: box(v, 9), 1, paper)
    hole = inside & (lum < paper - 7)
    for _ in range(2):                                     # take the soft edge of every stroke with it
        hole = hole | np.roll(hole, 1, 0) | np.roll(hole, -1, 0) | np.roll(hole, 1, 1) | np.roll(hole, -1, 1)
    hole &= inside
    known = ~hole
    val = blk * known[..., None]
    for _ in range(64):                                    # fill from the rim inward
        if known.all():
            break
        ssum = np.zeros_like(val); cnt = np.zeros((h, w), np.float32)
        for ax_, sh in ((0, 1), (0, -1), (1, 1), (1, -1)):
            ssum += np.roll(val * known[..., None], sh, ax_); cnt += np.roll(known, sh, ax_)
        new = hole & ~known & (cnt > 0)
        val[new] = ssum[new] / cnt[new][:, None]
        known = known | new
    for _ in range(40):                                    # then even the fill out (the rim stays as it is)
        avg = (np.roll(val, 1, 0) + np.roll(val, -1, 0) + np.roll(val, 1, 1) + np.roll(val, -1, 1)) / 4.0
        val[hole] = avg[hole]
    a[y0:y1, x0:x1] = val
    return int(hole.sum())


# The lettering the model invented on the two wall charts of bg.title_keyart.png (2560 x 1440): the header line of each chart, as a
# quadrilateral in raw px, clockwise from its top left.
TITLE_PATCHES = [
    [(226, 608), (344, 632), (344, 670), (222, 650)],
    [(2104, 588), (2220, 548), (2224, 600), (2108, 632)],
]


def build_title(man, sizes, report):
    p = find('bg.title_keyart')
    if p is None:
        return
    a = np.asarray(Image.open(p).convert('RGB'), dtype=np.float32).copy()
    n = sum(inpaint(a, poly) for poly in TITLE_PATCHES)
    im = Image.fromarray(np.clip(np.rint(a), 0, 255).astype(np.uint8), 'RGB')
    e = {'file1x': 'bg/title_keyart@1x.webp', 'file2x': 'bg/title_keyart@2x.webp', 'w': 1280, 'h': 720}
    sizes[e['file2x']] = save(im.resize((2560, 1440), Image.LANCZOS), e['file2x'], q=Q_BG, opaque=True)
    sizes[e['file1x']] = save(im.resize((1280, 720), Image.LANCZOS), e['file1x'], q=Q_BG, opaque=True)
    man['frames']['bg.title_keyart'] = e
    report['bg.title_keyart'] = f'the invented lettering on {len(TITLE_PATCHES)} wall charts taken out ({n} px filled from the paper around them)'


def main():
    if not RAW or not os.path.isdir(RAW):
        print(__doc__); sys.exit(2)
    os.makedirs(OUT, exist_ok=True)
    for root, _, files in os.walk(OUT):                       # a build owns the folder: stale files of an earlier build go
        for f in files:
            if f.endswith('.webp') or f == 'manifest.json':
                os.remove(os.path.join(root, f))
    man = {'version': 1, 'atlases': {}, 'frames': {}, 'icons': {}, 'templates': {}}
    sizes, report = {}, {}
    say('cards'); build_cards(man, sizes); build_card_back(man, sizes)
    say('chrome'); build_chrome(man, sizes, report)
    say('icons'); build_icons(man, sizes, report)
    say('title'); build_title(man, sizes, report)
    with open(os.path.join(OUT, 'manifest.json'), 'w') as f:
        json.dump(man, f, indent=1, sort_keys=True)
        f.write('\n')
    sizes['manifest.json'] = os.path.getsize(os.path.join(OUT, 'manifest.json'))
    total = sum(sizes.values())
    say('fixes'); [say(f'  {k}: {v}') for k, v in sorted(report.items())]
    say('files')
    for k in sorted(sizes):
        say(f'  {sizes[k] / 1024:8.1f} KB  {k}')
    print(f'graftwork/assets/ui: {len(sizes)} files, {total / 1048576:.2f} MB, {len(man["frames"])} frames, {len(man["icons"])} icons')


if __name__ == '__main__':
    main()
