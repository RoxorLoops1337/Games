#!/usr/bin/env python3
"""Graftwork character rigs: raw part sheets -> graftwork/assets/rigs/<id>@1x|@2x.webp (one packed atlas per character) + manifest.json.

A rig is a paper doll: the painted parts of one character (head, torso, arms, legs, boots, garment, prop) laid over its STANDING sprite
(graftwork/assets/ward/actors/<id>, the 256 x 256 canvas of assets/ward/manifest.json) and hung on one humanoid skeleton. The game poses the
skeleton (ui/rig.js: idle, a two-step walk), so feet alternate by construction and no walk frame is painted.

Raw sheets are NOT in the repo. RAW holds batch1/ and batch2/ with rig.<id>.png (2048 px RGBA, parts on a keyed background) and
rig.<id>.parts.json (the boxes the artist found, some named). Everything decided by eye lives in tools/graftwork_rig_meta.json, never here:
which box (or which loose piece inside a box, or which side of a cut line) is which part, how big it is on the canvas, where its joint is,
where that joint sits over the standing sprite, the draw order, the garment, the prop and its hand, the side mapping.

Run:   python3 -I tools/graftwork_rig_build.py --raw <dir> [--only marrow,wick] [--out <dir>] [--preview <dir>] [--list <id>]
  --raw      the folder that holds batch1/ and batch2/ (read only; -I keeps Python from loading code out of it)
  --out      where the atlases and manifest.json go (default graftwork/assets/rigs; with --only the other rigs of the manifest are kept)
  --preview  writes <id>_rest.png (standing sprite, rig at rest, both overlaid, joints) and <id>_parts.png (every part with its pivot)
             into a folder OUTSIDE the repo: the pictures the meta file is tuned against
  --list     prints the loose pieces (connected components) of every box of one sheet, in reading order: the numbers `comp` takes

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
  spin   a wheel: its radius on the canvas (it turns with the distance walked)

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
    return im.getchannel('A')


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
    """Scale, turn and mirror the piece about its pivot, once, at M px per unit. -> (premultiplied master image, pivot in master px)"""
    w, h = im.size
    th = math.radians(rot)
    cs, sn, k, mx = math.cos(th), math.sin(th), s * M, -1 if mirror else 1
    pts = []
    for cx, cy in ((0, 0), (w, 0), (w, h), (0, h)):
        ux, uy = (cx - pivot[0]) * mx * k, (cy - pivot[1]) * k * sy
        pts.append((ux * cs - uy * sn, ux * sn + uy * cs))
    g = SIZES[-1][1]  # the box is a whole number of px in the smallest file
    x0 = math.floor(min(q[0] for q in pts) / g) * g
    y0 = math.floor(min(q[1] for q in pts) / g) * g
    x1 = math.ceil(max(q[0] for q in pts) / g) * g
    y1 = math.ceil(max(q[1] for q in pts) / g) * g
    W, H = max(g, x1 - x0), max(g, y1 - y0)
    # output px (X, Y) -> offset from the pivot (X + x0, Y + y0) -> unturn -> unscale -> unmirror -> source px
    a, b = cs / (k * mx), sn / (k * mx)
    d, e = -sn / (k * sy), cs / (k * sy)
    c = a * x0 + b * y0 + pivot[0]
    f = d * x0 + e * y0 + pivot[1]
    out = im.convert('RGBa').transform((W, H), Image.AFFINE, (a, b, c, d, e, f), resample=Image.BICUBIC)
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


# ---------------------------------------------------------------- one rig
def build_rig(rid, m, raw, ward):
    sheet_path = os.path.join(raw, m['sheet'] + '.png')
    if not os.path.exists(sheet_path):
        die('missing raw sheet ' + sheet_path)
    sheet = Image.open(sheet_path).convert('RGBA')
    boxes = json.load(open(os.path.join(raw, m['sheet'] + '.parts.json')))
    joints = dict(m.get('joints', {}))
    parts, names, borrowed, stand = [], set(), [], None
    dx, dy = m.get('shift', [0, 0])  # the whole figure nudged on the canvas (after a look at the overlay)
    joints = {k: [v[0] + dx, v[1] + dy] for k, v in joints.items()}
    for z, p in enumerate(m['parts']):
        name = p['part']
        if name in names:
            die('%s: part %s twice' % (rid, name))
        names.add(name)
        borrow = p['box'] == 'standing'
        if borrow:
            if stand is None:
                stand = Image.open(os.path.join(WARD, 'actors', rid + '@3x.webp')).convert('RGBA')
            p = dict(p, s=CANVAS / stand.width, at=p.get('at', [p['anchor'][0] * CANVAS, p['anchor'][1] * CANVAS]))
            borrowed.append(name)
        im, piv = extract(stand if borrow else sheet, boxes, p)
        s = p['s'] if 's' in p else (p['h'] / im.height if 'h' in p else p['w'] / im.width)
        master, mp = bake(im, piv, s, p.get('rot', 0), p.get('mirror', False), p.get('sy', 1.0))
        bone = p.get('bone', name)
        if bone not in BONES and bone != 'root':
            die('%s: part %s hangs on no bone (%s)' % (rid, name, bone))
        at = p['at'] if borrow else [p['at'][0] + dx, p['at'][1] + dy]
        rec = {'n': name, 'bone': bone, 'z': z, 'at': at, 'master': master, 'mp': mp, 'src': im, 'piv': piv}
        for k in ('hem', 'lag', 'spin', 'upright'):
            if k in p:
                rec[k] = p[k]
        parts.append(rec)
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
        for k in ('hem', 'lag', 'spin', 'upright'):
            if k in p:
                e[k] = p[k]
        if 'hem' in p:
            garment.append(p['n'])
        entry['parts'].append(e)
    entry['garment'] = garment
    if borrowed:
        entry['borrowed'] = borrowed
    return entry, atlas, rest, parts, drift


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
