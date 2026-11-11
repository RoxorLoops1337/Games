#!/usr/bin/env python3
"""Graftwork rig sheet linter: is a RAW rig part sheet fit for tools/graftwork_rig_build.py? (design/ART_MODULAR.md section 7, "Rig sheet spec v2")

Run:   python3 -I tools/graftwork_rig_check.py <sheet.png> [--parts <parts.json>] [--out <annotated.png>] [--spec] [--json]
  sheet     a raw sheet: RGBA, the parts on a keyed background (transparent, or magenta not yet removed)
  --parts   the boxes the artist found (rig.<id>.parts.json; default: next to the sheet). Box names say which part is which (the part names of the
            rig: legL_up, legL_lo, footL, armL_up, armL_lo, handL, the same with R, torso, head, and the garments by name); for the nine sheets
            the game already uses, tools/graftwork_rig_meta.json names the pieces instead
  --out     an annotated copy, OUTSIDE the repo: every loose piece boxed and labelled with its length and width, failed rules in red
  --spec    also prints what the rig needs from this character (graftwork/assets/rigs/manifest.json and the meta): hip to knee, the hidden length
            the thigh must run on above the hip, the least thigh and upper arm, the garment parts that must be pieces of their own
  --json    the result as JSON instead of text
Prints PASS or FAIL per rule with its numbers, and for each failed rule one plain sentence an artist can paste into a prompt. Exit code 1 when a
rule fails. Reads only; writes nothing but --out. No em dashes.
Rules: sheet (square, at least 1024 px, RGBA), keyed (the background transparent, no key colour left standing), spill (pink key colour inside the
paint), gaps (at least GAP px of background between any two pieces), groups (one piece per box, no piece across two boxes), limbs (thigh, shin,
upper arm, forearm on both sides, each a piece of its own: a leg or arm painted in one piece, or one piece used twice, fails), scale (the near and far
piece of a pair within SCALE of each other's width; head, hand and boot plausible against the torso and the limbs), tube (thigh at least as long
as the shin, upper arm at least as long as the forearm, and with --spec or a known character the thigh as long as the rig needs), garment (every
garment the rig lists is a piece of its own, not cut out of the torso).
"""
import argparse, json, math, os, sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, '..'))
META = os.path.join(HERE, 'graftwork_rig_meta.json')
MAN = os.path.join(REPO, 'graftwork', 'assets', 'rigs', 'manifest.json')
GAP = 12          # px of background between two pieces
SCALE = 0.08      # the near and far piece of a pair: widths within 8 percent
SPILL = 0.001     # share of the painted pixels that may be pink
KEYED = 50        # opaque key colour pixels allowed
RISE = 0.35       # the hidden length a thigh runs on above the hip, as a share of hip to knee (tools/graftwork_rig_build.py RISE)
GARMENT_WORDS = ('apron', 'skirt', 'coat', 'tunic', 'dress', 'gown', 'cape', 'tail', 'hem')
LIMB_KEYS = ('legL_up', 'legR_up', 'legL_lo', 'legR_lo', 'armL_up', 'armR_up', 'armL_lo', 'armR_lo')


def die(msg):
    sys.exit('graftwork_rig_check: ' + msg)


def pieces(im, q=2, min_area=400):
    """The loose pieces of the sheet: 8-connected blobs of alpha > 40 (in q x q cells). -> [{bbox, area, mask (L, sheet size)}] in reading order"""
    w, h = im.size
    sw, sh = (w + q - 1) // q, (h + q - 1) // q
    small = im.getchannel('A').point(lambda v: 255 if v > 40 else 0).resize((sw, sh), Image.BOX).point(lambda v: 255 if v > 0 else 0)
    px = small.tobytes()
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
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, 1), (1, -1), (-1, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < sw and 0 <= yy < sh:
                    j = yy * sw + xx
                    if px[j] and not lab[j]:
                        lab[j] = n
                        stack.append(j)
        if area * q * q >= min_area:
            out.append({'n': n, 'bbox': (x0 * q, y0 * q, (x1 + 1) * q, (y1 + 1) * q), 'area': area * q * q})
    out.sort(key=lambda c: (c['bbox'][1] // 64, c['bbox'][0]))
    labs = bytes(min(255, v) for v in lab) if n < 255 else None
    for i, c in enumerate(out):
        c['id'] = i
        if labs is not None:
            m = Image.frombytes('L', (sw, sh), labs).point(lambda v, k=c['n']: 255 if v == k else 0)
        else:
            m = Image.frombytes('L', (sw, sh), bytes(255 if v == c['n'] else 0 for v in lab))
        c['small'] = m
    return out, q


def measure(im, c):
    """Length (the piece's height: limbs lie upright on a sheet) and width (the median row width of its middle half) in sheet px."""
    a = im.crop(c['bbox']).getchannel('A').point(lambda v: 255 if v > 100 else 0)
    w, h = a.size
    px = a.load()
    rows = []
    for y in range(h // 4, max(h // 4 + 1, 3 * h // 4)):
        xs = [x for x in range(0, w, 2) if px[x, y]]
        if xs:
            rows.append(xs[-1] - xs[0] + 2)
    rows.sort()
    return h, (rows[len(rows) // 2] if rows else w)


def gap_between(a, b, q):
    """The background between two pieces, in sheet px (to GAP + q; further apart reads as far enough)."""
    r = (GAP + q) // q + 1
    bx0, by0 = max(0, min(a['bbox'][0], b['bbox'][0]) // q - r), max(0, min(a['bbox'][1], b['bbox'][1]) // q - r)
    bx1, by1 = max(a['bbox'][2], b['bbox'][2]) // q + r, max(a['bbox'][3], b['bbox'][3]) // q + r
    ma, mb = a['small'].crop((bx0, by0, bx1, by1)), b['small'].crop((bx0, by0, bx1, by1))
    if not mb.getbbox() or not ma.getbbox():
        return 10 ** 6
    for d in range(0, r + 1):
        grown = ma.filter(ImageFilter.MaxFilter(2 * d + 1)) if d else ma
        if Image.composite(mb, Image.new('L', mb.size, 0), grown).getbbox():
            return max(0, (d - 1) * q)
    return 10 ** 6


def overlap(bb, box):
    x0, y0 = max(bb[0], box[0]), max(bb[1], box[1])
    x1, y1 = min(bb[2], box[2]), min(bb[3], box[3])
    return max(0, x1 - x0) * max(0, y1 - y0)


def name_pieces(sheet_path, boxes, comps, im):
    """Which piece is which part: the box names of the sheet, or (for a sheet the game already uses) the meta file's choices. -> {id: [names]}, rig id"""
    names, rid = {}, None
    base = os.path.basename(sheet_path)
    if base.startswith('rig.') and base.endswith('.png'):
        rid = base[4:-4]
    meta = json.load(open(META))['rigs'] if os.path.exists(META) else {}
    m = meta.get(rid)
    for c in comps:
        names[c['id']] = []
    def box_of(b):
        if isinstance(b, list):
            return b
        hit = [o for o in boxes if o.get('name') == b or o.get('i') == b]
        return [hit[0][k] for k in ('x', 'y', 'w', 'h')] if hit else None
    if m:
        import importlib.util
        spec = importlib.util.spec_from_file_location('graftwork_rig_build', os.path.join(HERE, 'graftwork_rig_build.py'))
        build = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(build)
        for p in m['parts']:
            r = box_of(p['box']) if p['box'] != 'standing' else None
            if not r:
                continue
            crop = im.crop((r[0], r[1], r[0] + r[2], r[1] + r[3]))
            bbs = [(r[0], r[1], r[0] + r[2], r[1] + r[3])]
            if 'comp' in p:  # the build tool's own numbering of the loose pieces of the box
                cs = build.components(crop)
                want = p['comp'] if isinstance(p['comp'], list) else [p['comp']]
                if want == ['big']:
                    want = [max(range(len(cs)), key=lambda i: cs[i][2])]
                bbs = [(r[0] + cs[i][0][0], r[1] + cs[i][0][1], r[0] + cs[i][0][2], r[1] + cs[i][0][3]) for i in want if i < len(cs)]
            for bb in bbs:
                best = max(comps, key=lambda c: overlap(c['bbox'], bb), default=None)
                if best and overlap(best['bbox'], bb) > 0 and p['part'] not in names[best['id']]:
                    names[best['id']].append(p['part'])
    else:
        for o in boxes:
            rect = (o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h'])
            inside = [c for c in comps if overlap(c['bbox'], rect) > 0.5 * (c['bbox'][2] - c['bbox'][0]) * (c['bbox'][3] - c['bbox'][1])]
            nm = o.get('name')
            if nm and len(inside) == 1:
                names[inside[0]['id']].append(nm)  # the artist names a box by its part (legL_up, footR, apron ...); a whole leg or arm is legL, armR
    return names, rid, m


def rule(res, key, ok, numbers, sentence):
    res.append({'rule': key, 'ok': bool(ok), 'numbers': numbers, 'ask': '' if ok else sentence})


def spec_of(rid, m, man):
    """What the rig needs from this character, in canvas units of the standing sprite and in px of this sheet at the meta's scale."""
    e = man['rigs'].get(rid) if man else None
    if not e:
        return None
    b = {q['n']: q for q in e['bones']}
    sc = {p['part']: p.get('s') for p in (m or {}).get('parts', [])}
    out = {'garment': e['garment'], 'limbs': {}}
    for s in ('L', 'R'):
        hip, kn, an = b['leg' + s + '_up'], b['leg' + s + '_lo'], b['foot' + s]
        one = ('leg' + s) in e.get('rigid', [])
        l1 = math.hypot(an['x'] - hip['x'], an['y'] - hip['y']) if one else math.hypot(kn['x'] - hip['x'], kn['y'] - hip['y'])
        need = l1 * (1 + (0.05 if one else RISE)) + (0 if one else 0.12 * l1)
        k = sc.get('leg' + s + '_up')
        out['limbs']['leg' + s + '_up'] = {'hip_to_knee': round(l1, 1), 'one_piece': one, 'hidden_above_hip': round(l1 * (0.05 if one else RISE), 1), 'min_length': round(need, 1),
                                           'min_length_px': round(need / k) if k else None}
        sh, el = b['arm' + s + '_up'], b['arm' + s + '_lo']
        la = math.hypot(el['x'] - sh['x'], el['y'] - sh['y'])
        if not b['arm' + s + '_lo'].get('empty') or ('arm' + s) in e.get('rigid', []):
            out['limbs']['arm' + s + '_up'] = {'shoulder_to_elbow': round(la, 1), 'min_length': round(la * 1.15, 1)}
    return out


def check(sheet_path, parts_path=None, want_spec=False):
    im = Image.open(sheet_path)
    mode = im.mode
    im = im.convert('RGBA')
    W, H = im.size
    boxes = json.load(open(parts_path)) if parts_path and os.path.exists(parts_path) else []
    res = []
    rule(res, 'sheet', W == H and W >= 1024 and mode == 'RGBA', {'size': [W, H], 'mode': mode}, 'Deliver one square RGBA PNG of at least 1024 px (2048 is best), the parts on a transparent or pure magenta background.')
    # keyed: pure key colour left standing, or a background that is not transparent
    px = im.load()
    key = sum(1 for y in range(0, H, 2) for x in range(0, W, 2) if px[x, y][3] > 200 and px[x, y][0] > 220 and px[x, y][1] < 50 and px[x, y][2] > 220) * 4
    corners = [px[x, y][3] for x, y in ((0, 0), (W - 1, 0), (0, H - 1), (W - 1, H - 1))]
    rule(res, 'keyed', key <= KEYED and max(corners) == 0, {'key_px': key, 'corner_alpha': corners}, 'Key the background out completely: no magenta left standing around or between the parts.')
    comps, q = pieces(im)
    opaque = sum(c['area'] for c in comps)
    pink = lambda p: p[3] > 40 and p[0] > 140 and p[2] > 110 and p[1] < 0.62 * min(p[0], p[2])
    spill = sum(1 for y in range(0, H, 2) for x in range(0, W, 2) if pink(px[x, y])) * 4
    rule(res, 'spill', spill <= SPILL * max(1, opaque), {'pink_px': spill, 'share': round(spill / max(1, opaque), 4)}, 'Remove the pink fringe and flecks inside the paint: no key colour in the parts themselves.')
    # gaps between pieces
    close = []
    for i, a in enumerate(comps):
        for b in comps[i + 1:]:
            if a['bbox'][0] - GAP > b['bbox'][2] or b['bbox'][0] - GAP > a['bbox'][2] or a['bbox'][1] - GAP > b['bbox'][3] or b['bbox'][1] - GAP > a['bbox'][3]:
                continue
            d = gap_between(a, b, q)
            if d < GAP:
                close.append([a['id'], b['id'], d])
    rule(res, 'gaps', not close, {'pieces': len(comps), 'closer_than_%d_px' % GAP: close}, 'Leave at least %d px of clear background between any two parts; nothing may touch or overlap.' % GAP)
    # groups: one piece per box, no piece across two boxes
    groups, across = [], []
    for o in boxes:
        rect = (o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h'])
        inside = [c['id'] for c in comps if overlap(c['bbox'], rect) > 0.5 * (c['bbox'][2] - c['bbox'][0]) * (c['bbox'][3] - c['bbox'][1])]
        if len(inside) > 1:
            groups.append({'box': o.get('i'), 'name': o.get('name', ''), 'pieces': inside})
    for c in comps:
        hit = [o.get('i') for o in boxes if overlap(c['bbox'], (o['x'], o['y'], o['x'] + o['w'], o['y'] + o['h'])) > 0.2 * (c['bbox'][2] - c['bbox'][0]) * (c['bbox'][3] - c['bbox'][1])]
        if len(hit) > 1:
            across.append({'piece': c['id'], 'boxes': hit})
    rule(res, 'groups', not groups and not across, {'boxes': len(boxes), 'merged_groups': groups, 'across_boxes': across}, 'Paint every part as its own loose piece in its own box (thigh, shin, boot, upper arm, forearm and hand each apart), never a group of parts in one box.')
    names, rid, m = name_pieces(sheet_path, boxes, comps, im)
    who = {}
    for c in comps:
        for n in names[c['id']]:
            who.setdefault(n, []).append(c)
    meas = {c['id']: measure(im, c) for c in comps}
    # limbs on both sides; a piece used for two parts is missing one
    rigid = (m or {}).get('rigid', [])
    twice = sorted({n for c in comps for n in names[c['id']] if len([k for k in names[c['id']] if k in LIMB_KEYS]) > 1 and n in LIMB_KEYS})
    missing = [n for n in LIMB_KEYS if n not in who]
    whole = [l for l in ('legL', 'legR', 'armL', 'armR') if l in rigid or any(len(names[c['id']]) == 1 and names[c['id']][0] == l for c in comps)]
    missing = [n for n in missing if n[:4] not in whole]
    rule(res, 'limbs', not missing and not twice and not whole, {'missing': missing, 'one_piece_used_twice': twice, 'one_piece_limbs': whole}, 'Paint both legs as thigh, shin and boot and both arms as upper arm, forearm and hand, each as its own piece, near and far side alike; never one piece meant for two places.')
    # scale: near and far pieces of a pair, and the head, hands and boots against the torso and limbs
    pairs, odd = [], []
    for a, b in (('legL_up', 'legR_up'), ('legL_lo', 'legR_lo'), ('armL_up', 'armR_up'), ('armL_lo', 'armR_lo'), ('footL', 'footR'), ('handL', 'handR')):
        if a in who and b in who and who[a][0]['id'] != who[b][0]['id'] and not {a[:4], b[:4]} & set(rigid):
            wa, wb = meas[who[a][0]['id']][1], meas[who[b][0]['id']][1]
            r = abs(wa - wb) / max(wa, wb)
            pairs.append([a, b, wa, wb, round(r, 3)])
            if r > SCALE:
                odd.append('%s %d px vs %s %d px wide' % (a, wa, b, wb))
    if 'torso' in who:
        tw = meas[who['torso'][0]['id']][1]
        for n, lo, hi in (('head', 0.7, 2.4), ('handL', 0.1, 0.6), ('footL', 0.25, 1.1)):
            if n in who:
                r = meas[who[n][0]['id']][1] / tw
                if not lo <= r <= hi:
                    odd.append('%s is %.2f of the torso width (%.2f to %.2f)' % (n, r, lo, hi))
    rule(res, 'scale', not odd, {'pairs': pairs, 'odd': odd}, 'Paint every part at one scale: the left and right pieces of each pair the same width, head, hands and boots in proportion to the torso.')
    # the full tube: thigh at least the shin, upper arm at least the forearm, and as long as the rig needs
    short, spec = [], (spec_of(rid, m, json.load(open(MAN))) if rid and os.path.exists(MAN) else None)
    for s in ('L', 'R'):
        for up, lo in (('leg%s_up' % s, 'leg%s_lo' % s), ('arm%s_up' % s, 'arm%s_lo' % s)):
            if up in who and lo in who and who[up][0]['id'] != who[lo][0]['id']:
                lu, ll = meas[who[up][0]['id']][0], meas[who[lo][0]['id']][0]
                if lu < ll:
                    short.append('%s %d px is shorter than %s %d px' % (up, lu, lo, ll))
        n = 'leg%s_up' % s
        if spec and n in who and spec['limbs'][n]['min_length_px'] and not spec['limbs'][n]['one_piece']:
            if n in twice:
                continue
            lu = meas[who[n][0]['id']][0]
            if lu < spec['limbs'][n]['min_length_px']:
                short.append('%s %d px, the rig needs %d px (hip to knee plus %d percent hidden above the hip)' % (n, lu, spec['limbs'][n]['min_length_px'], RISE * 100))
    rule(res, 'tube', not short, {'short': short}, 'Paint each thigh and upper arm as a full straight tube: at least as long as the shin or forearm, running on well above the hip or shoulder joint (it hides under the clothes), with a plain straight top, no rounded cap and no peg.')
    # garments: their own pieces
    glued = []
    gar = (spec or {}).get('garment') or []
    if m:
        boxes_of = {p['part']: json.dumps(p['box']) for p in m['parts']}
        for g in gar:
            if boxes_of.get(g) == boxes_of.get('torso'):
                glued.append(g)
    else:
        named = [(o.get('name') or '').lower() for o in boxes]
        glued = [n for n in named if any(w in n for w in GARMENT_WORDS) and 'torso' in n]
    rule(res, 'garment', not glued, {'garment': gar, 'cut_from_the_torso': glued}, 'Paint every garment that hangs over the hips and legs (apron, skirt, coat tails, tunic hem) as its own piece, apart from the torso, with the full body painted under it.')
    out = {'sheet': sheet_path, 'rig': rid, 'size': [W, H], 'pieces': [{'id': c['id'], 'bbox': list(c['bbox']), 'names': names[c['id']], 'length': meas[c['id']][0], 'width': meas[c['id']][1]} for c in comps],
           'rules': res, 'pass': all(r['ok'] for r in res)}
    if want_spec:
        out['spec'] = spec
    return out, im, comps


def annotate(out, im, path):
    if os.path.abspath(path).startswith(REPO + os.sep):
        die('--out must point outside the repo')
    bg = Image.new('RGBA', im.size, (70, 92, 70, 255))
    bg.alpha_composite(im)
    d = ImageDraw.Draw(bg)
    try:
        font = ImageFont.load_default(size=max(12, im.width // 80))
    except TypeError:  # an old Pillow: the small bitmap font
        font = ImageFont.load_default()
    flagged = set()
    for r in out['rules']:
        if r['ok']:
            continue
        if r['rule'] == 'gaps':
            for a, b, _ in r['numbers']['closer_than_%d_px' % GAP]:
                flagged |= {a, b}
        if r['rule'] == 'groups':
            for g in r['numbers']['merged_groups']:
                flagged |= set(g['pieces'])
            for g in r['numbers']['across_boxes']:
                flagged.add(g['piece'])
    for p in out['pieces']:
        col = (255, 60, 60, 255) if p['id'] in flagged else (255, 230, 90, 255)
        d.rectangle(p['bbox'], outline=col, width=3)
        d.text((p['bbox'][0] + 4, p['bbox'][1] + 4), '%d %s L%d W%d' % (p['id'], '/'.join(p['names'])[:24], p['length'], p['width']), fill=col, font=font)
    y = 8
    for r in out['rules']:
        d.text((8, y), ('PASS ' if r['ok'] else 'FAIL ') + r['rule'], fill=(120, 255, 120, 255) if r['ok'] else (255, 70, 70, 255), font=font)
        y += font.size + 4 if hasattr(font, 'size') else 14
    bg.convert('RGB').save(path)


def main():
    ap = argparse.ArgumentParser(description='Graftwork rig sheet linter: is a raw part sheet fit for the rig build?')
    ap.add_argument('sheet')
    ap.add_argument('--parts', default='')
    ap.add_argument('--out', default='')
    ap.add_argument('--spec', action='store_true')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    if not os.path.exists(a.sheet):
        die('no sheet ' + a.sheet)
    parts = a.parts or (a.sheet[:-4] + '.parts.json' if a.sheet.endswith('.png') else '')
    out, im, comps = check(a.sheet, parts, a.spec)
    if a.out:
        annotate(out, im, a.out)
    if a.json:
        print(json.dumps(out, indent=1))
    else:
        print('%s  %d x %d  %d pieces%s' % (a.sheet, out['size'][0], out['size'][1], len(out['pieces']), ('  (rig ' + out['rig'] + ')') if out['rig'] else ''))
        for r in out['rules']:
            print('  %s %-8s %s' % ('PASS' if r['ok'] else 'FAIL', r['rule'], json.dumps(r['numbers'], separators=(',', ':'))))
        asks = [r['ask'] for r in out['rules'] if not r['ok']]
        if asks:
            print('  ask the artist:')
            for s in asks:
                print('   - ' + s)
        if a.spec and out.get('spec'):
            sp = out['spec']
            print('  the rig needs (canvas units of the standing sprite; px at the meta\'s scale):')
            for n, v in sp['limbs'].items():
                print('   %-8s %s' % (n, json.dumps(v, separators=(', ', ': '))))
            print('   garment parts that must be pieces of their own: ' + (', '.join(sp['garment']) or 'none'))
        print('  ' + ('PASS' if out['pass'] else 'FAIL'))
    sys.exit(0 if out['pass'] else 1)


if __name__ == '__main__':
    main()
