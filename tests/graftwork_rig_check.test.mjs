// GRAFTWORK rig sheet linter (tools/graftwork_rig_check.py, design/ART_MODULAR.md section 7 "Rig sheet spec v2"). Synthetic sheets are drawn here,
// in a throwaway folder: one that follows the spec passes every rule, and one per rule breaks exactly that rule and fails it, with the plain
// sentence for the artist. Skips cleanly without Python or Pillow.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repo = path.resolve(new URL('..', import.meta.url).pathname), tool = path.join(repo, 'tools/graftwork_rig_check.py');
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
if (spawnSync('python3', ['-I', '-c', 'import PIL'], { stdio: 'ignore' }).status !== 0) { console.log('skip: Python with Pillow missing'); process.exit(0); }

// A doll in the rig's parts, laid out with clear gaps, each part in its own named box. `bad` breaks one rule.
const DRAW = String.raw`
import json, sys
from PIL import Image, ImageDraw
out, bad = sys.argv[1], sys.argv[2]
S = 1024 if bad != 'sheet' else 900
im = Image.new('RGBA', (S, 1024 if bad != 'sheet' else 700), (255, 0, 255, 255) if bad == 'keyed' else (0, 0, 0, 0))
d = ImageDraw.Draw(im)
boxes = []
def piece(name, x, y, w, h, col, shape='rect'):
    (d.ellipse if shape == 'ellipse' else d.rectangle)([x, y, x + w - 1, y + h - 1], fill=col, outline=(40, 25, 20, 255), width=3)
    boxes.append({'i': len(boxes) + 1, 'name': name, 'x': x - 4, 'y': y - 4, 'w': w + 8, 'h': h + 8})
skin, cloth, boot = (225, 190, 160, 255), (90, 80, 110, 255), (110, 70, 50, 255)
piece('head', 40, 30, 150, 150, skin, 'ellipse')
piece('torso', 240, 30, 150, 190, (200, 200, 190, 255))
piece('torso_skirt' if bad == 'garment' else 'apron', 440, 30, 170, 210, (170, 60, 50, 255))
x = 40
for s in 'LR':
    w = 90 if (bad == 'scale' and s == 'R') else 60
    piece('leg%s_up' % s, x, 280, w, 120 if bad == 'tube' else 230, cloth); x += w + 40
    if not (bad == 'limbs' and s == 'R'):
        piece('leg%s_lo' % s, x, 280, 50, 200, cloth)
    x += 90
    piece('foot%s' % s, x, 280, 80, 60, boot); x += 120
x = 40
for s in 'LR':
    piece('arm%s_up' % s, x, 560, 44, 150, (200, 200, 190, 255)); x += 84
    piece('arm%s_lo' % s, x, 560, 38, 130, skin); x += 78
    piece('hand%s' % s, x, 560, 40, 46, skin); x += 80
if bad == 'gaps':
    piece('prop', 40 + 60 + 5, 760, 60, 60, (180, 160, 60, 255))
    piece('prop2', 40, 760, 60, 60, (180, 160, 60, 255))
if bad == 'groups':
    piece('prop', 700, 760, 60, 60, (180, 160, 60, 255))
    d.rectangle([800, 760, 860, 820], fill=(180, 160, 60, 255))
    boxes[-1]['w'] = 170
if bad == 'spill':
    for i in range(400):
        im.putpixel((250 + (i % 40) * 3, 60 + (i // 40) * 3), (240, 40, 220, 255))
im.save(out + '/rig.test.png')
json.dump(boxes, open(out + '/rig.test.parts.json', 'w'))
`;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw_rigcheck_'));
const run = (bad) => {
  const d = fs.mkdtempSync(path.join(dir, bad + '_'));
  const w = spawnSync('python3', ['-I', '-c', DRAW, d, bad], { encoding: 'utf8' }); assert.equal(w.status, 0, w.stderr);
  const r = spawnSync('python3', ['-I', tool, path.join(d, 'rig.test.png'), '--json', '--out', path.join(d, 'annotated.png')], { encoding: 'utf8' });
  const out = JSON.parse(r.stdout); out.code = r.status; out.annotated = fs.existsSync(path.join(d, 'annotated.png')); return out;
};
try {
  t('a_sheet_that_follows_the_spec_passes_every_rule', () => {
    const r = run('none');
    assert.deepEqual(r.rules.filter((q) => !q.ok).map((q) => q.rule + ' ' + JSON.stringify(q.numbers)), []); assert.equal(r.pass, true); assert.equal(r.code, 0);
    assert.equal(r.pieces.length, 15, 'every part is one loose piece'); assert.ok(r.annotated, 'the annotated copy is written');
    for (const k of ['legL_up', 'legR_lo', 'footR', 'armL_up', 'handR', 'apron', 'torso', 'head']) assert.ok(r.pieces.some((p) => p.names.includes(k)), 'named from its box: ' + k);
    const thigh = r.pieces.find((p) => p.names.includes('legL_up')); assert.ok(Math.abs(thigh.length - 230) <= 4 && Math.abs(thigh.width - 60) <= 4, 'length and width measured: ' + thigh.length + ' x ' + thigh.width);
  });
  for (const rule of ['sheet', 'keyed', 'spill', 'gaps', 'groups', 'limbs', 'scale', 'tube', 'garment']) {
    t('a_sheet_that_breaks_' + rule + '_fails_it_and_says_what_to_paint', () => {
      const r = run(rule), q = r.rules.find((x) => x.rule === rule);
      assert.equal(q.ok, false, rule + ' fails: ' + JSON.stringify(q.numbers)); assert.equal(r.pass, false); assert.equal(r.code, 1, 'exit code 1');
      assert.ok(q.ask.length > 40 && /[Pp]aint|[Dd]eliver|[Kk]ey|[Ll]eave|[Rr]emove/.test(q.ask), 'one plain sentence for the artist: ' + q.ask);
      if (rule === 'keyed') return; // a magenta background is one big piece: nothing else can be read until it is keyed
      const others = r.rules.filter((x) => !x.ok && x.rule !== rule && !(rule === 'gaps' && x.rule === 'groups')).map((x) => x.rule);
      assert.deepEqual(others, [], 'only that rule fails');
    });
  }
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(process.exitCode ? 'FAILED' : `${n} rig sheet checks passed`);
