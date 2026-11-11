#!/usr/bin/env python3
"""Graftwork character rigs: raw part sheets -> graftwork/assets/rigs/<id>@1x|@2x.webp (one packed atlas per character) + manifest.json.

A rig is a paper doll: the painted parts of one character (head, torso, arms, legs, boots, garment, prop) laid over its STANDING sprite
(graftwork/assets/ward/actors/<id>, the 256 x 256 canvas of assets/ward/manifest.json) and hung on one humanoid skeleton. The game poses the
skeleton (ui/rig.js: idle, a two-step walk), so feet alternate by construction and no walk frame is painted.

Raw sheets are NOT in the repo. RAW holds batch1/ and batch2/ with rig.<id>.png (2048 px RGBA, parts on a keyed background) and
rig.<id>.parts.json (the boxes the artist found, some named). Everything decided by eye lives in tools/graftwork_rig_meta.json, never here:
which box (or which loose piece inside a box, or which side of a cut line) is which part, how big it is on the canvas, where its joint is,
where that joint sits over the standing sprite, the draw order, the garment, the prop and its hand, the side mapping.

Run:   python3 -I tools/graftwork_rig_build.py --raw <dir> [--only marrow,wick] [--out <dir>] [--preview <dir>] [--list <id>] [--fit [--scratch <dir>]]
  --raw      the folder that holds batch1/ and batch2/ (read only; -I keeps Python from loading code out of it)
  --out      where the atlases and manifest.json go (default graftwork/assets/rigs; with --only the other rigs of the manifest are kept)
  --preview  writes <id>_rest.png (standing sprite, rig at rest, both overlaid, joints) and <id>_parts.png (every part with its pivot)
             into a folder OUTSIDE the repo: the pictures the meta file is tuned against
  --list     prints the loose pieces (connected components) of every box of one sheet, in reading order: the numbers `comp` takes
  --fit      the auto-fit of the long hidden limbs: prints a table per limb (rise floor, needed, chosen, margin, how the painted end does), writes
             `fit` into the meta file, then builds (needs node: the poses come from ui/rig.js); --scratch takes its pose files, outside the repo

Meta (per rig): sheet, ship (false = lab only, the game keeps the puppet) and why, side (how the sheet's L and R map to the screen),
shift [dx, dy] (the whole figure nudged on the canvas),
joints {bone: [x, y]} for bones that carry no part (deliberately empty), feet, arms, rigid, and parts, listed BACK TO FRONT. A part:
  part   its name (a bone name makes it the main part of that bone)      bone   the bone it hangs on (default: its own name)
  box    the artist's box: a name, a number (the `i` of parts.json) or [x, y, w, h] in sheet px; "standing" BORROWS the piece from the
         standing sprite instead (its whole canvas is the box, cut it with rows / cols / poly, joint = anchor): for a piece the sheet
         does not have or paints as somebody else. Listed under `borrowed` in the manifest: it is a stand-in until the artist paints it
  comp   the loose pieces of the box to keep, numbered in reading order (a list unions them), or "big": the largest one (drops the
         slivers of neighbours that a box catches)
  rows / cols   keep only this span of the box, as fractions [from, to] (a straight cut line)
  poly   keep only the inside of this polygon, in fractions of the box (a slanted cut line)
  despill   true: pink key colour left in the paint is repainted from the pixels around it
  s      scale, canvas px per sheet px (or h / w: the size of the trimmed piece on the canvas); sy squashes or stretches its height
         (cloth only: a skirt painted longer than the standing sprite wears it)
  pivot  the joint inside the trimmed piece, as fractions [x, y]          at   where that joint sits on the 256 canvas at rest
  anchor the joint as fractions of the BOX instead (two pieces cut from one box share it and line up exactly)
  rot    degrees the piece is turned at rest (clockwise), baked into the atlas      mirror   true flips the piece left to right
  hem    the piece is cloth: from this fraction of its height down it sways (a garment)      lag   follow-through weight (hair, feather, prop)
  sy on cloth stretches only what hangs below the joint, so a garment cut above its waist still registers on the torso
Long hidden limbs (per rig): extend {limb: units | "auto"} for legL_up, legR_up (and armL_up, armR_up by hand): the piece's painted top end is cut
  off and the tube regrown that many units higher from its own pixels (extend_top: plain cloth from its mean shading, stripes tiled by their
  period, edges extrapolated, no wider than half the cloth over it, leaning in to stay under it), so the limb begins INSIDE the body. The joint
  stays where it was; a thigh records `top` (where its new top end rests) and ui/rig.js pins it there in the hips. fit {limb: units} is written by
  --fit for every "auto": the least extension that (1) reaches RISE of the thigh's length above the hip joint (RISE_ONE of a leg painted in one
  piece) and (2) keeps the END band of the limb under the parts drawn after it in every pose of the envelope (tools/graftwork_rig_pose.mjs),
  plus EXT_SLACK. A limb that no extension can hide stops the fit with what to do (cut the garment layer higher, or ask the artist).

Units: one canvas px of the standing sprite (figure about 225 tall, feet anchor 128, 243). The @2x atlas holds one px per unit, exactly the
sharpness of the standing @2x sprite the map draws; @1x is half. Sizes come from SIZES below (a battle build would add a 2 px per unit file).
Bone ids are by SCREEN side: L is the limb on the left of the screen, which is the character's RIGHT and the NEAR side (ui/rig.js sideName).
Deterministic: the same raws and meta give byte-identical files (tests/graftwork_rig.test.mjs builds twice when Pillow is present).
No em dashes in any of it.
"""
import argparse, json, math, os, sys
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))
META = os.path.join(HERE, 'graftwork_rig_meta.json')
WARD = os.path.join(REPO, 'graftwork', 'assets', 'ward')
Q = 82
CANVAS = 256            # the standing sprite's canvas (units)
M = 4                   # master px per unit: parts are resampled once at 4x, then reduced
SIZES = (('2x', 4), ('1x', 8))   # file tag -> master px per file px
PAD = 2                 # units between parts in the atlas (one px at @1x)
# the humanoid skeleton every rig shares (ui/rig.js reads the tree from the manifest): bone, parent
SKELETON = [('hips', None), ('torso', 'hips'), ('head', 'torso'),
            ('armR_up', 'torso'), ('armR_lo', 'armR_up'), ('handR', 'armR_lo'),
            ('armL_up', 'torso'), ('armL_lo', 'armL_up'), ('handL', 'armL_lo'),
            ('legR_up', 'hips'), ('legR_lo', 'legR_up'), ('footR', 'legR_lo'),
            ('legL_up', 'hips'), ('legL_lo', 'legL_up'), ('footL', 'legL_lo')]
BONES = [b for b, _ in SKELETON]


def die(msg):
    sys.exit('graftwork_rig_build: ' + msg)


# ---------------------------------------------------------------- pixels (plain Python over bytes: no numpy, so -I needs only Pillow)
def alpha_of(im):
    return im.getchannel('a' if im.mode == 'RGBa' else 'A')


def components(im, min_frac=0.004):
    """The loose pieces of a box: connected blobs of its alpha (pieces 2 px apart stay apart), in reading order. -> [(bbox, mask L image)]"""
    w, h = im.size
    q = 2
    sw, sh = (w + q - 1) // q, (h + q - 1) // q
    small = alpha_of(im).point(lambda v: 255 if v > 40 else 0).resize((sw, sh), Image.BOX).point(lambda v: 255 if v > 0 else 0)
    px = bytearray(small.tobytes())
    lab = [0] * (sw * sh)
    out = []
    n = 0
    for start in range(sw * sh):
        if not px[start] or lab[start]:
            continue
        n += 1
        lab[start] = n
        stack = [start]
        x0, y0, x1, y1, area = sw, sh, -1, -1, 0
        while stack:
            k = stack.pop()
            x, y = k % sw, k // sw
            area += 1
            if x < x0: x0 = x
            if x > x1: x1 = x
            if y < y0: y0 = y
            if y > y1: y1 = y
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < sw and 0 <= yy < sh:
                    j = yy * sw + xx
                    if px[j] and not lab[j]:
                        lab[j] = n
                        stack.append(j)
        out.append((n, area, (x0 * q, y0 * q, (x1 + 1) * q, (y1 + 1) * q)))
    keep = [c for c in out if c[1] >= min_frac * sw * sh]
    keep.sort(key=lambda c: (c[2][1] // 24, c[2][0]))
    res = []
    for n, area, bb in keep:
        m = Image.frombytes('L', (sw, sh), bytes(255 if v == n else 0 for v in lab)).resize((sw * q, sh * q), Image.NEAREST).crop((0, 0, w, h))
        res.append((bb, m, area))
    return res


def despill(im):
    """Pink key colour left in the paint (a fleck on a cap, a joint peg): repaint each such pixel from the nearest clean pixels of its row."""
    w, h = im.size
    px = im.load()
    pink = lambda p: p[3] > 0 and p[0] > 140 and p[2] > 110 and p[1] < 0.62 * min(p[0], p[2])
    for y in range(h):
        row = [px[x, y] for x in range(w)]
        bad = [pink(p) for p in row]
        if not any(bad):
            continue
        for x in range(w):
            if not bad[x]:
                continue
            l = x - 1
            while l >= 0 and (bad[l] or row[l][3] < 200): l -= 1
            r = x + 1
            while r < w and (bad[r] or row[r][3] < 200): r += 1
            src = [row[i] for i in (l, r) if 0 <= i < w]
            if not src:
                px[x, y] = (0, 0, 0, 0)
                continue
            px[x, y] = tuple(sum(c[i] for c in src) // len(src) for i in range(3)) + (row[x][3],)
    return im


def extract(sheet, boxes, p):
    """One part out of the sheet: box, loose pieces, cut lines, cleanup, trimmed. -> (RGBA image, [pivot x, pivot y] in its px)"""
    b = p['box']
    if b == 'standing':  # borrowed from the standing sprite itself (the whole canvas is the box)
        x, y, w, h = 0, 0, sheet.width, sheet.height
    elif isinstance(b, list):
        x, y, w, h = b
    else:
        hit = [o for o in boxes if o.get('name') == b or o.get('i') == b]
        if not hit:
            die('no box %r for part %s' % (b, p['part']))
        x, y, w, h = (hit[0][k] for k in ('x', 'y', 'w', 'h'))
    im = sheet.crop((x, y, x + w, y + h))
    keep = Image.new('L', im.size, 255)
    if 'comp' in p:
        comps = components(im)
        want = p['comp'] if isinstance(p['comp'], list) else [p['comp']]
        if want == ['big']:
            want = [max(range(len(comps)), key=lambda i: comps[i][2])]
        keep = Image.new('L', im.size, 0)
        for i in want:
            if i >= len(comps):
                die('part %s: box %r has %d loose pieces, comp %d asked' % (p['part'], b, len(comps), i))
            keep.paste(255, (0, 0), comps[i][1])
    if 'rows' in p or 'cols' in p:
        r0, r1 = p.get('rows', [0, 1])
        c0, c1 = p.get('cols', [0, 1])
        cut = Image.new('L', im.size, 0)
        cut.paste(255, (round(c0 * w), round(r0 * h), round(c1 * w), round(r1 * h)))
        keep = Image.composite(keep, Image.new('L', im.size, 0), cut)
    if 'poly' in p:
        cut = Image.new('L', im.size, 0)
        ImageDraw.Draw(cut).polygon([(fx * w, fy * h) for fx, fy in p['poly']], fill=255)
        keep = Image.composite(keep, Image.new('L', im.size, 0), cut)
    a = Image.composite(alpha_of(im), Image.new('L', im.size, 0), keep)
    im.putalpha(a)
    if p.get('despill'):
        im = despill(im)
    bb = a.point(lambda v: 255 if v > 8 else 0).getbbox()
    if not bb:
        die('part %s is empty' % p['part'])
    im = im.crop(bb)
    if 'anchor' in p:  # a joint given in the BOX: two pieces cut from one box share it, so they line up exactly
        return im, [p['anchor'][0] * w - bb[0], p['anchor'][1] * h - bb[1]]
    fx, fy = p.get('pivot', [0.5, 0.5])
    return im, [fx * im.width, fy * im.height]


def bake(im, pivot, s, rot, mirror, sy=1.0):
    """Scale, turn and mirror the piece about its pivot, once, at M px per unit. sy (cloth only, unturned pieces) stretches what hangs BELOW the
    pivot and leaves what is above it as painted, so a skirt cut above its waist still registers on the torso. -> (premultiplied master, pivot in master px)"""
    w, h = im.size
    th = math.radians(rot)
    cs, sn, k, mx = math.cos(th), math.sin(th), s * M, -1 if mirror else 1
    split = sy != 1.0 and not rot
    pts = []
    for cx, cy in ((0, 0), (w, 0), (w, h), (0, h)):
        ux, uy = (cx - pivot[0]) * mx * k, (cy - pivot[1]) * k * (1.0 if split and cy < pivot[1] else sy)
        pts.append((ux * cs - uy * sn, ux * sn + uy * cs))
    g = SIZES[-1][1]  # the box is a whole number of px in the smallest file
    x0 = math.floor(min(q[0] for q in pts) / g) * g
    y0 = math.floor(min(q[1] for q in pts) / g) * g
    x1 = math.ceil(max(q[0] for q in pts) / g) * g
    y1 = math.ceil(max(q[1] for q in pts) / g) * g
    W, H = max(g, x1 - x0), max(g, y1 - y0)
    src = im.convert('RGBa')
    def warp(syy):
        # output px (X, Y) -> offset from the pivot (X + x0, Y + y0) -> unturn -> unscale -> unmirror -> source px
        a, b = cs / (k * mx), sn / (k * mx)
        d, e = -sn / (k * syy), cs / (k * syy)
        c = a * x0 + b * y0 + pivot[0]
        f = d * x0 + e * y0 + pivot[1]
        return src.transform((W, H), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC)
    out = warp(sy)
    if split and y0 < 0:
        out.paste(warp(1.0).crop((0, 0, W, -y0)), (0, 0))
    return out, (-x0, -y0)


def pack(sizes):
    """Shelf packing, tallest first. sizes: [(name, w, h)] in units. -> (W, H, {name: (x, y)})"""
    order = sorted(sizes, key=lambda t: (-t[2], -t[1], t[0]))
    best = None
    for W in (128, 160, 192, 224, 256, 320, 384, 448, 512, 640, 768, 1024):
        if any(w + PAD > W for _, w, _ in order):
            continue
        x = y = shelf = 0
        pos = {}
        for name, w, h in order:
            if x + w > W:
                x, y, shelf = 0, y + shelf + PAD, 0
            pos[name] = (x, y)
            x += w + PAD
            shelf = max(shelf, h)
        H = y + shelf
        H += (-H) % 2
        score = (max(W, H), W * H)
        if best is None or score < best[0]:
            best = (score, W, H, pos)
    return best[1], best[2], best[3]


def clean(im):
    """Straight alpha, colour zeroed where nothing shows (stable bytes, smaller files)."""
    im = im.convert('RGBA')
    a = alpha_of(im).point(lambda v: 0 if v < 8 else v)
    blank = Image.new('RGBA', im.size, (0, 0, 0, 0))
    out = Image.composite(im, blank, a.point(lambda v: 255 if v else 0))
    out.putalpha(a)
    return out


def reduce_to(master, g):
    return clean(master.resize((master.width // g, master.height // g), Image.LANCZOS))


def contact(img):
    """Where the figure touches the floor, measured like ui/ward_iso.js contactOf: lowest opaque row, centre and width of the bottom band."""
    a = alpha_of(img).point(lambda v: 255 if v > 40 else 0)
    bb = a.getbbox()
    band = max(2, round((bb[3] - bb[1]) * 0.12))
    strip = a.crop((0, bb[3] - band, a.width, bb[3]))
    sb = strip.getbbox()
    px = strip.tobytes()
    sx = n = 0
    for i, v in enumerate(px):
        if v:
            sx += i % strip.width
            n += 1
    return bb, (sx / n + 0.5, bb[3], sb[2] - sb[0])


# ---------------------------------------------------------------- long hidden limbs (ART_MODULAR.md section 7 "Rig sheet spec v2", ANIMATOR_GUIDE.md section 6)
LIMBS = ('legL_up', 'legR_up', 'armL_up', 'armR_up')   # the pieces whose top end must stay inside the body
END = 4.0               # units: the band at a limb's far end behind its joint that is its "end" (the QA test of tests/graftwork_rig.test.mjs reads the same)
EXT_MAX = 30            # units: the longest extension the fit tries
RISE, RISE_ONE = 0.35, 0.05   # the least hidden length above the hip joint, as a share of the thigh (of a leg painted in one piece)
TOL_STEPS = ((0, 0), (0.5, 0), (-0.5, 0), (0, 0.5), (0, -0.5))   # a point counts as covered within half a unit (1 px at 2 px per unit, as the QA test)
EXT_SLACK = 1           # units added to what the fit found it needs (the browser's antialiasing is not Pillow's)


def _spans(px, W, H, thr=128):
    out = []
    for y in range(H):
        l = r = -1
        for x in range(W):
            if px[x, y][3] > thr:
                if l < 0: l = x
                r = x
        out.append((l, r + 1) if l >= 0 else None)
    return out


def _median(v):
    v = sorted(v)
    return v[len(v) // 2] if v else 0


def _fitline(ys, xs):
    n = len(ys)
    my, mx = sum(ys) / n, sum(xs) / n
    vy = sum((y - my) ** 2 for y in ys)
    b = sum((y - my) * (x - mx) for y, x in zip(ys, xs)) / vy if vy else 0.0
    b = max(-0.15, min(0.15, b))  # a tube may taper a little, never flare
    return lambda y: mx + b * (y - my)


def extend_top(im, ext_px, wmax_px=None, room=None):
    """Make a limb piece a longer tube: its painted top end (a rounded cap, a hem, a peg) is cut off at the first clean row and the tube is grown
    ext_px rows taller than it was, from its own pixels. Plain cloth is the mean of its top clean band (the tube's shading) with a third of the grain of
    that band (mirrored, so no seam repeats) and a slight vertical blur; patterned or striped cloth (a vertical period found by autocorrelation of the row brightness) tiles that period so the stripes run on. The
    left and right edges follow straight lines fitted to the clean tube, extrapolated up (the width clamped to wmax_px and to 1.15 times the tube),
    a top that would stand outside `room` (the span of the cloth over it, in px of the piece) leans in, more the higher it is (a thigh runs into
    the pelvis), each new row is the source row resampled to that span, the seam is crossfaded over 4 rows and the top is a plain straight edge.
    Deterministic. -> (RGBA image, (dx, dy) = where the old (0, 0) is now, x of the middle of the new top edge, info dict)"""
    W, H = im.size
    pm = im.convert('RGBa')
    px = pm.load()
    sp = _spans(px, W, H)
    lum = lambda p: (0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]) / max(1, p[3]) * 255
    NB = 24
    def prof(y):  # the row's brightness across the tube, in NB bins from its left edge to its right edge
        l, r = sp[y]
        return [lum(px[min(r - 1, l + int((i + 0.5) * (r - l) / NB)), y]) for i in range(NB)]
    def rowlum(y):
        v = prof(y)[NB // 5: NB - NB // 5]
        return sum(v) / len(v)
    ref = [y for y in range(int(0.4 * H), int(0.6 * H) + 1) if sp[y]]
    if not ref:
        die('a limb piece with no clean rows to extend')
    refw = _median([sp[y][1] - sp[y][0] for y in ref])
    rp = [prof(y) for y in ref]
    mp_ = [sum(q[i] for q in rp) / len(rp) for i in range(NB)]
    dist = lambda q: sum(abs(a - b) for a, b in zip(q, mp_)) / NB
    tol = max(16, 2.5 * _median([dist(q) for q in rp]))
    good = lambda y: sp[y] and sp[y][1] - sp[y][0] >= 0.9 * refw and dist(prof(y)) <= tol
    yc = int(0.4 * H)
    for y in range(0, int(0.4 * H)):
        if all(good(q) for q in range(y, min(H, y + 6))):
            yc = y
            break
    yc = min(yc + 2, int(0.4 * H))
    L = max(6, min(int(0.4 * H), H - yc - 1))
    rows = [y for y in range(yc, yc + L) if sp[y]]
    lf = _fitline(rows, [sp[y][0] for y in rows])
    rf = _fitline(rows, [sp[y][1] for y in rows])
    # stripes: the strongest repeat of the row brightness (detrended) in the clean tube
    prof = [rowlum(y) if sp[y] else 0 for y in range(yc, yc + L)]
    mean = sum(prof) / len(prof)
    v = [q - mean for q in prof]
    period, best = 0, 0.0
    if (sum(q * q for q in v) / len(v)) ** 0.5 > 8:
        for p in range(6, int(len(v) / 2.5) + 1):
            a, b = v[:-p], v[p:]
            den = (sum(q * q for q in a) * sum(q * q for q in b)) ** 0.5
            r = sum(x * y for x, y in zip(a, b)) / den if den else 0
            if r > best:
                period, best = p, r
        if best < 0.85:
            period = 0
    band = max(2, min(16, L))
    def src_of(yo):
        if period:
            return yc + (yo - yc) % period
        k = yc - 1 - yo
        if k < 0:
            return yo
        i = k % (2 * band)
        return yc + (i if i < band else 2 * band - 1 - i)
    wcap = 1.15 * refw if wmax_px is None else min(1.15 * refw, wmax_px)
    def span_of(yo):
        lt, rt = lf(yo), rf(yo)
        c, w = (lt + rt) / 2, max(0.6 * refw, min(rt - lt, wcap))
        if room and yo < yc:
            w = min(w, max(0.6 * refw, room[1] - room[0]))
            k = (yc - yo) / (yc + ext_px)
            shift = max(0, room[0] - (c - w / 2)) - max(0, (c + w / 2) - room[1])
            c += k * shift
        return c - w / 2, c + w / 2
    n_syn = yc + ext_px
    blend = 4
    syn_rows = list(range(-ext_px, yc + blend))
    lo = min(0, min(int(math.floor(span_of(yo)[0])) - 2 for yo in syn_rows))
    hi = max(W, max(int(math.ceil(span_of(yo)[1])) + 2 for yo in syn_rows))
    pad = -lo
    Wn, Hn = hi - lo, H + ext_px
    out = Image.new('RGBa', (Wn, Hn), (0, 0, 0, 0))
    out.paste(pm, (pad, ext_px))
    op = out.load()
    UG = 320  # samples across a row, from 30 percent left of the tube's edge to 30 percent right of the other: rows are kept in the tube's own frame
    us = [-0.3 + 1.6 * (i + 0.5) / UG for i in range(UG)]
    def prof_of(sy):
        ls, rs = lf(sy), rf(sy)
        out_ = []
        for u in us:
            sx = ls + u * (rs - ls) - 0.5
            x0 = int(math.floor(sx))
            f = sx - x0
            a_ = px[x0, sy] if 0 <= x0 < W else (0, 0, 0, 0)
            b_ = px[x0 + 1, sy] if 0 <= x0 + 1 < W else (0, 0, 0, 0)
            out_.append(tuple(a_[i] * (1 - f) + b_[i] * f for i in range(4)))
        return out_
    profs = {yo: prof_of(src_of(yo)) for yo in syn_rows}
    if not period:  # plain cloth: the mean of the clean band (the tube's own shading), a third of each row's own grain on top, a slight vertical blur
        new = [yo for yo in syn_rows if yo < yc]
        if new:
            mean = [tuple(sum(profs[yo][i][k] for yo in new) / len(new) for k in range(4)) for i in range(UG)]
            for yo in new:
                profs[yo] = [tuple(mean[i][k] + 0.35 * (profs[yo][i][k] - mean[i][k]) for k in range(4)) for i in range(UG)]
        sm = {}
        for j, yo in enumerate(syn_rows):
            a_, b_, c_ = profs[syn_rows[max(0, j - 1)]], profs[yo], profs[syn_rows[min(len(syn_rows) - 1, j + 1)]]
            sm[yo] = [tuple((a_[i][k] + 2 * b_[i][k] + c_[i][k]) / 4 for k in range(4)) for i in range(UG)]
        profs = sm
    def place(yo):  # the row's profile laid on its target span
        lt, rt = span_of(yo)
        pr, row = profs[yo], []
        for x in range(lo, hi):
            q = ((x + 0.5 - lt) / max(1e-6, rt - lt) + 0.3) / 1.6 * UG - 0.5
            if q < 0 or q > UG - 1:
                row.append((0, 0, 0, 0))
                continue
            i = int(q)
            f = q - i
            j = min(UG - 1, i + 1)
            row.append(tuple(pr[i][k] * (1 - f) + pr[j][k] * f for k in range(4)))
        return row
    grid = {yo: place(yo) for yo in syn_rows}
    for yo in syn_rows:
        Y = yo + ext_px
        t = 0.0 if yo < yc else (yo - yc + 1) / (blend + 1)
        for i, x in enumerate(range(lo, hi)):
            s_ = grid[yo][i]
            if t > 0:
                o = op[x + pad, Y]
                s_ = tuple(s_[k] * (1 - t) + o[k] * t for k in range(4))
            op[x + pad, Y] = tuple(int(round(min(255, max(0, q)))) for q in s_)
    lt, rt = span_of(-ext_px)
    info = {'cut': yc, 'period': period, 'width': round(refw, 1)}
    return out.convert('RGBA'), (pad, ext_px), (lt + rt) / 2 + pad, info


def bake_point(pt, pivot, s, rot, mirror, sy=1.0):
    """Where a point of the source piece lands after bake(), in units from the pivot."""
    th = math.radians(rot)
    ux, uy = (pt[0] - pivot[0]) * (-1 if mirror else 1) * s, (pt[1] - pivot[1]) * s * sy
    return ux * math.cos(th) - uy * math.sin(th), ux * math.sin(th) + uy * math.cos(th)


# ---------------------------------------------------------------- one rig
def make_part(rid, z, p, sheet, boxes, dx, dy, borrowed, E, covers):
    """One part: cut, cleaned, (a long hidden limb: extended E units up, no wider than half the cloth and torso at its new top), baked."""
    name = p['part']
    borrow = p['box'] == 'standing'
    src = sheet
    if borrow:
        src = Image.open(os.path.join(WARD, 'actors', rid + '@3x.webp')).convert('RGBA')
        p = dict(p, s=CANVAS / src.width, at=p.get('at', [p['anchor'][0] * CANVAS, p['anchor'][1] * CANVAS]))
        borrowed.append(name)
    key = (rid, json.dumps(p, sort_keys=True))
    if key not in _EXTRACT:
        _EXTRACT[key] = extract(src, boxes, p)
    im, piv = _EXTRACT[key]
    s = p['s'] if 's' in p else (p['h'] / im.height if 'h' in p else p['w'] / im.width)
    sy, rot, mirror = p.get('sy', 1.0), p.get('rot', 0), p.get('mirror', False)
    at = p['at'] if borrow else [p['at'][0] + dx, p['at'][1] + dy]
    top, info = None, None
    if E:
        ext_px = max(1, round(E / (s * sy)))
        wmax, room = None, None
        if covers:  # what covers it at rest, across the row where the new top will sit
            y = at[1] - (piv[1] * s * sy) - E
            xs = []
            for c in covers:
                a = alpha_of(c['master'])
                yy = round(y * M - (c['at'][1] * M - c['mp'][1]))
                if 0 <= yy < a.height:
                    row = a.crop((0, yy, a.width, yy + 1)).point(lambda v: 255 if v > 100 else 0).getbbox()
                    if row:
                        x0 = c['at'][0] * M - c['mp'][0]
                        xs += [x0 + row[0], x0 + row[2]]
            if xs:
                wmax = 0.5 * (max(xs) - min(xs)) / M / s
                if not rot and not mirror:  # the span the new top must stay inside, in px of the piece (3 units in from the edges)
                    room = ((min(xs) / M + 3 - at[0]) / s + piv[0], (max(xs) / M - 3 - at[0]) / s + piv[0])
        im, (ox, oy), tx, info = extend_top(im, ext_px, wmax, room)
        piv = [piv[0] + ox, piv[1] + oy]
        t = bake_point((tx, 0), piv, s, rot, mirror, sy)
        top = [round(at[0] + t[0], 2), round(at[1] + t[1], 2)]
    master, mp = bake(im, piv, s, rot, mirror, sy)
    bone = p.get('bone', name)
    if bone not in BONES and bone != 'root':
        die('%s: part %s hangs on no bone (%s)' % (rid, name, bone))
    rec = {'n': name, 'bone': bone, 'z': z, 'at': at, 'master': master, 'mp': mp, 'src': im, 'piv': piv}
    if E:
        rec['ext'], rec['top'], rec['info'] = E, top, info
    for k in ('hem', 'lag', 'upright'):
        if k in p:
            rec[k] = p[k]
    return rec


def extensions(rid, m, fitting=None):
    """How far each limb of the meta's `extend` reaches up into the body, in units: a number as written, "auto" = the fit's number (`fit`, written by
    --fit), or the value being tried while fitting."""
    out = {}
    for k, v in m.get('extend', {}).items():
        if k not in LIMBS:
            die('%s: extend names %s, which is not a limb top (%s)' % (rid, k, ', '.join(LIMBS)))
        if v == 'auto':
            if fitting is not None and k in fitting:
                v = fitting[k]
            elif k in m.get('fit', {}):
                v = m['fit'][k]
            else:
                die('%s: extend %s is "auto" and the meta has no fit for it: run --fit' % (rid, k))
        out[k] = float(v)
    return out


_SHEETS, _EXTRACT = {}, {}


def build_rig(rid, m, raw, ward, fitting=None):
    sheet_path = os.path.join(raw, m['sheet'] + '.png')
    if not os.path.exists(sheet_path):
        die('missing raw sheet ' + sheet_path)
    if sheet_path not in _SHEETS:
        _SHEETS[sheet_path] = (Image.open(sheet_path).convert('RGBA'), json.load(open(os.path.join(raw, m['sheet'] + '.parts.json'))))
    sheet, boxes = _SHEETS[sheet_path]
    joints = dict(m.get('joints', {}))
    parts, names, borrowed = [], set(), []
    dx, dy = m.get('shift', [0, 0])  # the whole figure nudged on the canvas (after a look at the overlay)
    joints = {k: [v[0] + dx, v[1] + dy] for k, v in joints.items()}
    ext = extensions(rid, m, fitting)
    covers = [q['part'] for q in m['parts'] if q['part'] == 'torso' or 'hem' in q]
    later = []
    for z, p in enumerate(m['parts']):
        name = p['part']
        if name in names:
            die('%s: part %s twice' % (rid, name))
        names.add(name)
        if ext.get(name):  # a long hidden limb: baked after the cloth and torso, whose width it may not exceed
            later.append((z, p))
            continue
        parts.append(make_part(rid, z, p, sheet, boxes, dx, dy, borrowed, 0, None))
    for z, p in later:
        name = p['part']
        if not [c for c in covers if [q['part'] for q in m['parts']].index(c) > z]:
            die('%s: %s is extended but nothing is drawn over it to hide it (a torso or a garment part after it)' % (rid, name))
        parts.append(make_part(rid, z, p, sheet, boxes, dx, dy, borrowed, ext[name], [q for q in parts if q['n'] in covers and q['z'] > z]))
    parts.sort(key=lambda q: q['z'])
    main = {p['n']: p for p in parts if p['n'] in BONES and p['bone'] == p['n']}
    bones = []
    for b, par in SKELETON:
        if b in main:
            x, y = main[b]['at']
            bones.append({'n': b, 'p': par, 'x': x, 'y': y})
        elif b in joints:
            x, y = joints[b]
            bones.append({'n': b, 'p': par, 'x': x, 'y': y, 'empty': True})
        else:
            die('%s: bone %s has no part and no joint (give it a part, or a joints entry to leave it empty on purpose)' % (rid, b))
    # the atlas
    W, H, pos = pack([(p['n'], p['master'].width // M, p['master'].height // M) for p in parts])
    atlas = Image.new('RGBa', (W * M, H * M), (0, 0, 0, 0))
    for p in parts:
        x, y = pos[p['n']]
        atlas.paste(p['master'], (x * M, y * M))
    # the figure at rest, as the game draws it (back to front), to measure what the standing sprite is measured by
    rest = Image.new('RGBA', (CANVAS * M, CANVAS * M), (0, 0, 0, 0))
    for p in parts:
        lay = Image.new('RGBa', rest.size, (0, 0, 0, 0))
        lay.paste(p['master'], (round(p['at'][0] * M - p['mp'][0]), round(p['at'][1] * M - p['mp'][1])))
        rest.alpha_composite(lay.convert('RGBA'))
    bb, (fx, fy, fw) = contact(rest)
    bbox = [round(v / M, 1) for v in bb]
    act = ward['actors'].get(rid)
    if not act:
        die('%s is not an actor of assets/ward/manifest.json' % rid)
    sb = act['bbox']
    drift = (bbox[1] - sb[1], bbox[3] - sb[3])
    entry = {
        'file1x': rid + '@1x.webp', 'file2x': rid + '@2x.webp', 'w': W, 'h': H,
        'ship': bool(m.get('ship', False)), 'note': m.get('note', ''), 'side': m['side'],
        'height': round(bbox[3] - bbox[1], 1), 'bbox': bbox, 'foot': [round(fx / M, 1), round(fy / M, 1), round(fw / M, 1)],
        'bones': bones, 'parts': [],
    }
    for k in ('arms', 'rigid', 'prop'):
        if k in m:
            entry[k] = m[k]
    # the soles, measured from the art: the lowest piece of each leg chain, its bottom band (heel = back edge, toe = front edge; the figure faces +x)
    entry['feet'] = {}
    by_bone = {}
    for p in parts:
        by_bone.setdefault(p['bone'], []).append(p)
    for side in ('L', 'R'):
        chain = [b for b in ('foot' + side, 'leg' + side + '_lo', 'leg' + side + '_up') if b in by_bone]
        if not chain:
            die('%s: leg %s has no part at all' % (rid, side))
        ank = next(b for b in bones if b['n'] == 'foot' + side)
        low = max(by_bone[chain[0]], key=lambda p: p['at'][1] * M - p['mp'][1] + p['master'].height)
        al = alpha_of(low['master'].convert('RGBA')).point(lambda v: 255 if v > 40 else 0)
        lb = al.getbbox()
        band = al.crop((0, lb[3] - max(M, round((lb[3] - lb[1]) * 0.12)), al.width, lb[3])).getbbox()
        ox, oy = low['at'][0] - low['mp'][0] / M, low['at'][1] - low['mp'][1] / M
        entry['feet'][side] = {'heel': round(ox + band[0] / M - ank['x'], 1), 'toe': round(ox + band[2] / M - ank['x'], 1), 'sole': round(oy + lb[3] / M - ank['y'], 1)}
    garment = []
    for p in parts:
        x, y = pos[p['n']]
        e = {'n': p['n'], 'bone': p['bone'], 'rect': [x, y, p['master'].width // M, p['master'].height // M],
             'px': round(p['mp'][0] / M, 2), 'py': round(p['mp'][1] / M, 2), 'x': p['at'][0], 'y': p['at'][1]}
        for k in ('hem', 'lag', 'upright'):
            if k in p:
                e[k] = p[k]
        if p.get('ext'):  # a long hidden limb: how far it was extended, and (a thigh) where its top end rests (ui/rig.js thighM pins it there)
            e['ext'] = int(p['ext']) if p['ext'] == int(p['ext']) else p['ext']
            if p['n'].startswith('leg'):
                e['top'] = p['top']
        if 'hem' in p:
            garment.append(p['n'])
        entry['parts'].append(e)
    entry['garment'] = garment
    if borrowed:
        entry['borrowed'] = borrowed
    return entry, atlas, rest, parts, drift


# ---------------------------------------------------------------- the auto-fit (--fit)
def limb_axis(entry, n):
    """The rest direction of a limb from its joint to the next joint down the chain (the whole leg's for a leg painted in one piece)."""
    b = {q['n']: q for q in entry['bones']}
    one = n[:4] in entry.get('rigid', [])
    child = ('foot' + n[3]) if (n.startswith('leg') and one) else (n[:4] + '_lo')
    ax, ay = b[child]['x'] - b[n]['x'], b[child]['y'] - b[n]['y']
    d = math.hypot(ax, ay) or 1
    return ax / d, ay / d


def end_points(rec, u, step=2):
    """The END band of a limb piece: its opaque pixels within END units of its far end behind the joint, along the limb axis u, in units from the pivot."""
    a = alpha_of(rec['master'])
    W, H = a.size
    px = a.load()
    pts, tmin = [], 1e9
    for Y in range(0, H, step):
        for X in range(0, W, step):
            if px[X, Y] > 100:
                lx, ly = (X + 0.5 - rec['mp'][0]) / M, (Y + 0.5 - rec['mp'][1]) / M
                t = lx * u[0] + ly * u[1]
                pts.append((lx, ly, t))
                tmin = min(tmin, t)
    return [(x, y) for x, y, t in pts if t <= tmin + END]


def covered(c, fx, fy, mtx):
    """Is the figure point on the cloth or torso part c as drawn by ui/rig.js drawRigged (the hem shear and lift included)?"""
    a, b, cc, d, e, f = mtx[:6]
    det = a * d - b * cc
    ddx, ddy = fx - e, fy - f
    qx, qy = (d * ddx - cc * ddy) / det, (a * ddy - b * ddx) / det
    X, Y = qx + c['px'], qy + c['py']
    tries = [(X, Y)] if c['hem'] is None or Y <= c['y0'] + 1 else []
    if c['hem'] is not None and len(mtx) > 6:
        v = (qy + c['py'] - c['y0']) / mtx[7]
        if v >= 0:
            tries.append((qx + c['px'] - mtx[6] * v, c['y0'] + v))
    for X, Y in tries:
        i, j = int(X * M), int(Y * M)
        if 0 <= i < c['W'] and 0 <= j < c['H'] and c['a'][i, j] > 100:
            return True
    return False


def fit_rig(rid, m, raw, ward, scratch):
    """The least extension of every "auto" limb of one rig for which no pixel of its END band is left uncovered by the parts drawn after it (the
    torso, the cloth, a near arm or prop; not its own shin and boot) in any pose of the envelope (tools/graftwork_rig_pose.mjs, posed by ui/rig.js). -> {limb: units}, and prints the table."""
    auto = [k for k, v in m.get('extend', {}).items() if v == 'auto']
    order = [q['part'] for q in m['parts']]
    cand = {}
    for E in range(0, EXT_MAX + 1):
        entry, _, _, parts, _ = build_rig(rid, m, raw, ward, {k: E for k in auto})
        cand[E] = (entry, {p['n']: p for p in parts})
    job = {}
    for E, (entry, recs) in cand.items():
        job['%s#%d' % (rid, E)] = {'id': rid, 'entry': entry, 'parts': order}
    jin, jout = os.path.join(scratch, rid + '_fit_in.json'), os.path.join(scratch, rid + '_fit_poses.json')
    with open(jin, 'w') as fh:
        json.dump(job, fh)
    import subprocess
    subprocess.run(['node', os.path.join(HERE, 'graftwork_rig_pose.mjs'), '--in', jin, '--out', jout], check=True)
    poses = json.load(open(jout))
    out = {}
    print('%-14s %-8s %7s %7s %7s %7s  %s' % ('fit ' + rid, 'limb', 'rise', 'needed', 'chosen', 'margin', 'as painted (extension 0)'))
    for n in auto:
        z = order.index(n)
        chain = {n[:4] + '_lo', 'foot' + n[3], 'hand' + n[3]}
        bone_of = {q['n']: q['bone'] for q in cand[0][0]['parts']}
        cov_names = [q for q in order if order.index(q) > z and bone_of[q] not in chain]
        need, worst0 = None, ''
        passes = {}
        # a thigh begins in the pelvis: at rest its tube reaches at least RISE of its own length above the hip joint (a leg painted in one piece:
        # RISE_ONE of the whole leg), however little the cloth would need
        entry0, r0 = cand[0][0], cand[0][1][n]
        u = limb_axis(entry0, n)
        b0 = {q['n']: q for q in entry0['bones']}
        one = n[:4] in entry0.get('rigid', [])
        child = b0[('foot' + n[3]) if one else (n[:4] + '_lo')]
        length = math.hypot(child['x'] - b0[n]['x'], child['y'] - b0[n]['y'])
        above = -min(lx * u[0] + ly * u[1] for lx, ly in end_points(r0, u))
        floor = max(0, math.ceil((RISE_ONE if one else RISE) * length - above - 1e-9))
        for E in range(0, EXT_MAX + 1):
            if 0 < E < floor:
                continue
            entry, recs = cand[E]
            pts = end_points(recs[n], limb_axis(entry, n))
            cov = []
            for q in cov_names:
                pe = next(x for x in entry['parts'] if x['n'] == q)
                cov.append({'n': q, 'px': pe['px'], 'py': pe['py'], 'hem': pe.get('hem'), 'y0': math.floor(pe['hem'] * pe['rect'][3] + 0.5) if 'hem' in pe else 0,
                            'a': alpha_of(recs[q]['master']).load(), 'W': recs[q]['master'].width, 'H': recs[q]['master'].height})
            bad_pose, bad_px = 0, 0
            for ps in poses['%s#%d' % (rid, E)]:
                mt = ps['m'][n]
                miss = 0
                for lx, ly in pts:
                    fx, fy = mt[0] * lx + mt[2] * ly + mt[4], mt[1] * lx + mt[3] * ly + mt[5]
                    if not any(covered(c, fx + ox, fy + oy, ps['m'][c['n']]) for c in cov for ox, oy in TOL_STEPS):
                        miss += 1
                if miss:
                    bad_pose += 1
                    bad_px += miss
                    if E == 0 and (not worst0 or miss > worst0[0]):
                        worst0 = (miss, ps['pose'])
                    if E > 0:
                        break
            passes[E] = bad_pose == 0
            if E == 0 and passes[0] and not floor:
                need = 0
                break
            if passes[E] and need is None and E >= floor:
                need = E
            if need is not None and E >= need + EXT_SLACK and passes[E]:
                break
        if need is None:
            die('%s: no extension up to %d units hides the end of %s (%s): the cloth over it is too small, cut the garment layer higher or ask the artist' % (rid, EXT_MAX, n, worst0))
        chosen = need if need == 0 else max(E for E in passes if passes[E])
        out[n] = chosen
        print('%-14s %-8s %7d %7d %7d %7d  %s' % ('', n, floor, need, chosen, chosen - need, ('end shows, worst %d points at %s' % worst0) if worst0 else 'end hidden in every pose'))
    return out


# ---------------------------------------------------------------- previews (outside the repo: what the meta file is tuned against)
def preview(rid, entry, rest, parts, ward, out):
    Z = 3
    S = CANVAS * Z
    bg = (86, 118, 86, 255)
    stand = Image.open(os.path.join(WARD, 'actors', rid + '@3x.webp')).convert('RGBA').resize((S, S), Image.LANCZOS)
    rig = rest.resize((S, S), Image.LANCZOS)
    b = ward['actors'][rid]['bbox']
    x0, x1 = max(0, min(b[0], entry['bbox'][0]) - 14), min(CANVAS, max(b[2], entry['bbox'][2]) + 14)
    y0, y1 = max(0, b[1] - 10), min(CANVAS, b[3] + 8)
    cw, ch = round((x1 - x0) * Z), round((y1 - y0) * Z)
    crop = lambda im: im.crop((round(x0 * Z), round(y0 * Z), round(x0 * Z) + cw, round(y0 * Z) + ch))
    sheet = Image.new('RGBA', (cw * 4 + 30, ch), bg)
    over = stand.copy()
    over.putalpha(alpha_of(stand).point(lambda v: v // 2))
    both = rig.copy()
    both.alpha_composite(over)
    lines = rig.copy()
    d = ImageDraw.Draw(lines)
    pos = {bn['n']: (bn['x'] * Z, bn['y'] * Z) for bn in entry['bones']}
    for bn in entry['bones']:
        if bn['p']:
            d.line([pos[bn['p']], pos[bn['n']]], fill=(80, 230, 255, 255), width=2)
    for bn in entry['bones']:
        x, y = pos[bn['n']]
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 90, 210, 255) if bn.get('empty') else (255, 220, 60, 255), outline=(0, 0, 0, 255))
    for i, im in enumerate((stand, rig, both, lines)):
        cell = crop(im)
        dd = ImageDraw.Draw(cell)
        for gy in range(int(y0 // 16 + 1) * 16, int(y1), 16):
            dd.line([0, (gy - y0) * Z, 10, (gy - y0) * Z], fill=(255, 255, 0, 255))
            dd.text((12, (gy - y0) * Z - 5), str(gy), fill=(255, 255, 0, 255))
        for gx in range(int(x0 // 16 + 1) * 16, int(x1), 16):
            dd.line([(gx - x0) * Z, 0, (gx - x0) * Z, 8], fill=(255, 255, 0, 255))
            dd.text(((gx - x0) * Z - 8, 10), str(gx), fill=(255, 255, 0, 255))
        fy = (b[3] - y0) * Z
        dd.line([0, fy, cw, fy], fill=(255, 80, 60, 255))
        dd.line([0, (b[1] - y0) * Z, cw, (b[1] - y0) * Z], fill=(255, 80, 60, 255))
        sheet.alpha_composite(cell, (i * (cw + 10), 0))
    sheet.convert('RGB').save(os.path.join(out, rid + '_rest.png'))
    # every part, trimmed, with its pivot
    cells = []
    for p in parts:
        k = min(1.0, 150 / max(p['src'].size))
        im = p['src'].resize((max(1, round(p['src'].width * k)), max(1, round(p['src'].height * k))), Image.LANCZOS)
        cells.append((p, im, k))
    cols = 8
    rows = (len(cells) + cols - 1) // cols
    grid = Image.new('RGBA', (cols * 170, rows * 180), bg)
    gd = ImageDraw.Draw(grid)
    for i, (p, im, k) in enumerate(cells):
        ox, oy = (i % cols) * 170 + 10, (i // cols) * 180 + 16
        grid.alpha_composite(im, (ox, oy))
        px, py = ox + p['piv'][0] * k, oy + p['piv'][1] * k
        gd.ellipse([px - 4, py - 4, px + 4, py + 4], fill=(255, 0, 255, 255), outline=(255, 255, 255, 255))
        gd.text((ox, oy - 14), '%d %s' % (p['z'], p['n']), fill=(255, 255, 255, 255))
    grid.convert('RGB').save(os.path.join(out, rid + '_parts.png'))


def dump_meta(meta):
    """The meta file as it is kept by hand: one key per line, one part per line (the `fit` that --fit writes goes just before `parts`)."""
    js = lambda v: json.dumps(v, separators=(', ', ': '), ensure_ascii=False)
    out = ['{', ' "about": %s,' % js(meta['about']), ' "rigs": {']
    ids = list(meta['rigs'])
    for i, rid in enumerate(ids):
        e = meta['rigs'][rid]
        out.append('  %s: {' % js(rid))
        out += ['   %s: %s,' % (js(k), js(e[k])) for k in e if k != 'parts']
        out.append('   "parts": [')
        out += ['    ' + js(v) + (',' if j < len(e['parts']) - 1 else '') for j, v in enumerate(e['parts'])]
        out.append('   ]')
        out.append('  }' + (',' if i < len(ids) - 1 else ''))
    out += [' }', '}']
    return '\n'.join(out) + '\n'


def dump_manifest(man):
    """The manifest as text: one bone and one part per line (readable in a diff, a quarter of the bytes of an indented dump)."""
    js = lambda v: json.dumps(v, separators=(', ', ': '))
    out = ['{', ' "version": %s,' % js(man['version']), ' "unit": %s,' % js(man['unit']), ' "rigs": {']
    ids = list(man['rigs'])
    for i, rid in enumerate(ids):
        e = man['rigs'][rid]
        out.append('  %s: {' % js(rid))
        out += ['   %s: %s,' % (js(k), js(e[k])) for k in e if k not in ('bones', 'parts')]
        for key in ('bones', 'parts'):
            out.append('   %s: [' % js(key))
            out += ['    ' + js(v) + (',' if j < len(e[key]) - 1 else '') for j, v in enumerate(e[key])]
            out.append('   ]' + (',' if key == 'bones' else ''))
        out.append('  }' + (',' if i < len(ids) - 1 else ''))
    out += [' }', '}']
    return '\n'.join(out) + '\n'


def main():
    ap = argparse.ArgumentParser(description='Graftwork character rigs: raw part sheets -> atlases + manifest')
    ap.add_argument('--raw')
    ap.add_argument('--out', default=os.path.join(REPO, 'graftwork', 'assets', 'rigs'))
    ap.add_argument('--only', default='')
    ap.add_argument('--preview', default='')
    ap.add_argument('--list', default='')
    ap.add_argument('--fit', action='store_true', help='find the least hidden extension of every "auto" limb (extend in the meta), write it to the meta file as `fit`, then build')
    ap.add_argument('--scratch', default='', help='with --fit: a folder OUTSIDE the repo for the pose files (default: the system temp folder)')
    a = ap.parse_args()
    if not a.raw:
        die('give --raw <the folder that holds batch1/ and batch2/>')
    meta = json.load(open(META))
    ward = json.load(open(os.path.join(WARD, 'manifest.json')))
    if a.list:
        m = meta['rigs'][a.list]
        sheet = Image.open(os.path.join(a.raw, m['sheet'] + '.png')).convert('RGBA')
        for o in json.load(open(os.path.join(a.raw, m['sheet'] + '.parts.json'))):
            box = sheet.crop((o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h']))
            print('box', o.get('i'), o.get('name', ''), [o['x'], o['y'], o['w'], o['h']])
            for i, (bb, _, area) in enumerate(components(box)):
                print('   comp', i, 'area', area * 4, 'x %d..%d y %d..%d' % (bb[0], bb[2], bb[1], bb[3]), ' fractions x %.2f..%.2f y %.2f..%.2f' % (bb[0] / o['w'], bb[2] / o['w'], bb[1] / o['h'], bb[3] / o['h']))
        return
    only = [s for s in a.only.split(',') if s]
    if a.fit:
        import tempfile
        scratch = a.scratch or tempfile.mkdtemp(prefix='gw_rigfit_')
        if os.path.abspath(scratch).startswith(REPO + os.sep):
            die('--scratch must point outside the repo')
        os.makedirs(scratch, exist_ok=True)
        for rid in meta['rigs']:
            m = meta['rigs'][rid]
            if (only and rid not in only) or 'auto' not in m.get('extend', {}).values():
                continue
            m.pop('fit', None)
            fit = fit_rig(rid, m, a.raw, ward, scratch)
            keys = list(m)
            m2 = {}
            for k in keys:
                if k == 'parts':
                    m2['fit'] = fit
                m2[k] = m[k]
            meta['rigs'][rid] = m2
        with open(META, 'w') as fh:
            fh.write(dump_meta(meta))
    if a.preview:
        if os.path.abspath(a.preview).startswith(REPO + os.sep):
            die('--preview must point outside the repo')
        os.makedirs(a.preview, exist_ok=True)
    os.makedirs(a.out, exist_ok=True)
    man_path = os.path.join(a.out, 'manifest.json')
    man = {'version': 1, 'unit': 'one px of the standing sprite canvas (256 x 256); rect, px, py in @2x atlas px', 'rigs': {}}
    if only and os.path.exists(man_path):
        man['rigs'] = json.load(open(man_path)).get('rigs', {})
    total = 0
    for rid in meta['rigs']:
        if only and rid not in only:
            continue
        entry, atlas, rest, parts, drift = build_rig(rid, meta['rigs'][rid], a.raw, ward)
        for tag, g in SIZES:
            f = os.path.join(a.out, '%s@%s.webp' % (rid, tag))
            reduce_to(atlas, g).save(f, 'WEBP', quality=Q, method=4, exact=True)
            total += os.path.getsize(f)
        man['rigs'][rid] = entry
        if a.preview:
            preview(rid, entry, rest, parts, ward, a.preview)
        print('%-14s atlas %3d x %3d  parts %2d  height %.1f (standing %d)  top %+.1f bottom %+.1f  %s' % (
            rid, entry['w'], entry['h'], len(entry['parts']), entry['height'], ward['actors'][rid]['bbox'][3] - ward['actors'][rid]['bbox'][1], drift[0], drift[1], 'ships' if entry['ship'] else 'lab only'))
    man['rigs'] = {k: man['rigs'][k] for k in meta['rigs'] if k in man['rigs']}
    with open(man_path, 'w') as f:
        f.write(dump_manifest(man))
    print('wrote %s (%d rigs), atlases built now: %.0f KB' % (os.path.relpath(man_path, REPO), len(man['rigs']), total / 1024))


if __name__ == '__main__':
    main()
