// GRAFTWORK long hidden limbs and the assembled A-pose slicer (tools/graftwork_rig_build.py; design/ART_MODULAR.md section 7 "Rig sheet spec v2",
// design/ANIMATOR_GUIDE.md section 6). What is guarded, on figures drawn here in a throwaway folder (no art of the game is needed):
//   the extension     a striped tube grows on with its stripes in phase, a plain one from its own shading; the new top is a straight full edge, the
//                     tube no wider than allowed, the bytes the same twice
//   the slicer        an assembled doll (UNDER with two pairs of limbs in an A-pose, OVER with a skirt, a joints file) is cut into the rig's parts
//                     and built with --fit: every bone has its part, the skirt is the garment, the thighs are extended into the body
//   the same QA       its planted soles stand still at the game's speed on three headings, its feet alternate, and (Chromium, skipped when missing)
//                     no leg shows its cut end in any of 104 poses and every thigh runs on above its hip
//   export and refit  --export writes it as a parts sheet of spec v2: the linter passes it, and a fit run on that sheet chooses no extension, with
//                     the same bones and feet
// Skips cleanly without Python or Pillow.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { withChromium, rigLimbEnds } from './graftwork_browser_lib.mjs';
const R = await import('../graftwork/ui/rig.js');

const repo = path.resolve(new URL('..', import.meta.url).pathname), tools = path.join(repo, 'tools');
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
if (spawnSync('python3', ['-I', '-c', 'import PIL'], { stdio: 'ignore' }).status !== 0) { console.log('skip: Python with Pillow missing'); process.exit(0); }
const py = (code, ...args) => { const r = spawnSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout; };
const tool = (args) => { const r = spawnSync('python3', ['-I', path.join(tools, 'graftwork_rig_build.py'), ...args], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); return r.stdout; };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gw_riglimbs_'));
const HEADINGS = [[1, 0], [0.886, 0.463], [0.886, -0.463]];

// ---------------------------------------------------------------- the extension
const EXT = String.raw`
import importlib.util, json, sys
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location('b', sys.argv[1]); b = importlib.util.module_from_spec(spec); spec.loader.exec_module(b)
out = {}
for kind in ('stripes', 'plain'):
    im = Image.new('RGBA', (60, 200), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.ellipse([4, 0, 56, 30], fill=(40, 120, 60, 255))          # a painted rounded top, another colour: the end that must go
    d.rectangle([4, 15, 56, 199], fill=(200, 60, 70, 255), outline=(40, 25, 20, 255), width=3)
    if kind == 'stripes':
        for y in range(15, 200, 12): d.rectangle([7, y, 53, y + 5], fill=(240, 235, 230, 255))
    a, (dx, dy), tx, info = b.extend_top(im, 40)
    a2 = b.extend_top(im, 40)[0]
    px = a.load(); top = [px[x, 0][3] for x in range(a.width)]
    row = lambda y: sum(px[x, y][0] for x in range(dx + 20, dx + 40)) / 20
    out[kind] = {'size': a.size, 'off': [dx, dy], 'period': info['period'], 'cut': info['cut'], 'same': a.tobytes() == a2.tobytes(),
                 'top_full': sum(1 for v in top if v > 200), 'width0': info['width'], 'top_x': tx,
                 'rows': [round(row(y)) for y in range(0, 80)], 'orig': [round(sum(im.getpixel((x, y))[0] for x in range(20, 40)) / 20) for y in range(0, 200)]}
print(json.dumps(out))
`;
await t('the_extension_grows_a_striped_tube_in_phase_and_a_plain_one_from_its_shading', () => {
  const r = JSON.parse(py(EXT, path.join(tools, 'graftwork_rig_build.py')));
  for (const k of ['stripes', 'plain']) {
    const q = r[k]; assert.equal(q.same, true, k + ': the same bytes twice'); assert.equal(q.size[1], 240, k + ': 40 rows taller'); assert.equal(q.off[1], 40);
    assert.ok(q.cut >= 15 && q.cut < 60, k + ': the rounded top is cut off at the first clean row (' + q.cut + ')');
    assert.ok(q.top_full >= 0.8 * q.width0, k + ': the new top is a straight full edge'); assert.ok(q.size[0] <= 60 * 1.15 + 8, k + ': no flare');
  }
  assert.equal(r.stripes.period, 12, 'the stripes are found by their period'); assert.equal(r.plain.period, 0, 'plain cloth has none');
  // the stripes run on: the new rows repeat the painted rows twelve apart, in phase with the tube below
  const s = r.stripes; let same = 0; for (let y = 0; y < 60; y++) { const o = s.orig[(((y - 40 - s.cut) % 12) + 12) % 12 + s.cut]; if (Math.abs(s.rows[y] - o) < 30) same++; }
  assert.ok(same >= 54, 'striped rows in phase: ' + same + ' of 60');
  const p = r.plain.rows.slice(0, 60); assert.ok(Math.max(...p) - Math.min(...p) < 25, 'plain cloth stays even: ' + Math.min(...p) + '..' + Math.max(...p));
});

// ---------------------------------------------------------------- the assembled doll
const DOLL = String.raw`
import json, math, sys
from PIL import Image, ImageDraw
out = sys.argv[1]
W = H = 640
under = Image.new('RGBA', (W, H), (0, 0, 0, 0)); over = Image.new('RGBA', (W, H), (0, 0, 0, 0))
d = ImageDraw.Draw(under); ink = (40, 28, 24, 255); J = {}
def tube(A, B, w, col):
    ux, uy = B[0] - A[0], B[1] - A[1]; L = math.hypot(ux, uy); nx, ny = -uy / L * w / 2, ux / L * w / 2
    d.polygon([(A[0] + nx, A[1] + ny), (B[0] + nx, B[1] + ny), (B[0] - nx, B[1] - ny), (A[0] - nx, A[1] - ny)], fill=col, outline=ink)
    for k in range(1, 8):
        t = k / 8; cx, cy = A[0] + ux * t, A[1] + uy * t
        d.line([(cx + nx * 0.9, cy + ny * 0.9), (cx - nx * 0.9, cy - ny * 0.9)], fill=(col[0] - 40, col[1] - 40, col[2] - 40, 255), width=3)
hipY, cx = 330, 320
for s, sg in (('L', -1), ('R', 1)):
    hip = (cx + sg * 28, hipY); a = math.radians(12.5)
    knee = (hip[0] + sg * math.sin(a) * 110, hip[1] + math.cos(a) * 110); ankle = (knee[0] + sg * math.sin(a) * 105, knee[1] + math.cos(a) * 105)
    J['hip' + s], J['knee' + s], J['ankle' + s] = [round(v, 1) for v in hip], [round(v, 1) for v in knee], [round(v, 1) for v in ankle]
    sh = (cx + sg * 80, 196); b = math.radians(20)
    el = (sh[0] + sg * math.sin(b) * 92, sh[1] + math.cos(b) * 92); wr = (el[0] + sg * math.sin(b) * 62, el[1] + math.cos(b) * 62)
    J['shoulder' + s], J['elbow' + s], J['wrist' + s] = [round(v, 1) for v in sh], [round(v, 1) for v in el], [round(v, 1) for v in wr]
d.rectangle([cx - 62, 178, cx + 62, hipY + 20], fill=(200, 196, 182, 255), outline=ink, width=3)
d.rectangle([cx - 82, 180, cx + 82, 212], fill=(200, 196, 182, 255), outline=ink, width=3)
for s in 'LR':
    tube(J['hip' + s], J['knee' + s], 46, (150, 60, 70, 255)); tube(J['knee' + s], J['ankle' + s], 40, (150, 60, 70, 255))
    ax, ay = J['ankle' + s]; d.rounded_rectangle([ax - 26, ay - 10, ax + 40, ay + 34], 10, fill=(110, 70, 50, 255), outline=ink, width=3)
    tube(J['shoulder' + s], J['elbow' + s], 30, (200, 196, 182, 255)); tube(J['elbow' + s], J['wrist' + s], 26, (225, 190, 160, 255))
    wx, wy = J['wrist' + s]; d.ellipse([wx - 16, wy - 6, wx + 16, wy + 26], fill=(225, 190, 160, 255), outline=ink, width=3)
d.ellipse([cx - 70, 30, cx + 70, 162], fill=(225, 190, 160, 255), outline=ink, width=3)
d.rectangle([cx - 16, 150, cx + 16, 180], fill=(225, 190, 160, 255), outline=ink, width=3)
ImageDraw.Draw(over).polygon([(cx - 70, 250), (cx + 70, 250), (cx + 120, 470), (cx - 120, 470)], fill=(60, 90, 140, 255), outline=ink)
under.save(out + '/doll.UNDER.png'); over.save(out + '/doll.OVER.png'); json.dump(J, open(out + '/doll.joints.json', 'w'))
json.dump({'about': 'a test doll', 'rigs': {'doll': {'source': 'assembled', 'assembled': {'under': 'doll.UNDER.png', 'over': 'doll.OVER.png', 'joints': 'doll.joints.json'},
  'garment': {'part': 'skirt', 'hem': 0.3}, 'ship': True, 'side': 'L is the SCREEN LEFT (a test doll).', 'extend': {'legL_up': 'auto', 'legR_up': 'auto'}}}}, open(out + '/meta.json', 'w'))
`;
const raw = path.join(dir, 'doll'), out1 = path.join(dir, 'out1'), exp = path.join(dir, 'exp'), out2 = path.join(dir, 'out2');
let man1 = null, fitText = '';
try {
  await t('an_assembled_doll_is_sliced_into_the_rigs_parts_and_its_thighs_are_extended_into_the_body', () => {
    fs.mkdirSync(raw); py(DOLL, raw);
    fitText = tool(['--raw', raw, '--meta', path.join(raw, 'meta.json'), '--out', out1, '--fit', '--scratch', path.join(dir, 'fit1')]);
    man1 = JSON.parse(fs.readFileSync(path.join(out1, 'manifest.json'), 'utf8')); const e = man1.rigs.doll;
    const names = e.parts.map((p) => p.n), want = ['handR', 'armR_lo', 'armR_up', 'legR_up', 'legR_lo', 'footR', 'torso', 'legL_up', 'legL_lo', 'footL', 'skirt', 'head', 'handL', 'armL_lo', 'armL_up'];
    assert.deepEqual(names, want, 'every bone has its part, back to front: far arm, far leg, torso, near leg, the garment, head, near arm');
    assert.deepEqual(e.garment, ['skirt']); assert.equal(e.bones.filter((b) => b.empty).map((b) => b.n).join(), 'hips', 'only the hips are a bare joint');
    assert.ok(Math.abs(e.height - 225) < 1.5 && Math.abs(e.foot[1] - 243) < 1.5, 'the figure stands 225 units tall on the feet anchor');
    const fit = JSON.parse(fs.readFileSync(path.join(raw, 'meta.json'), 'utf8')).rigs.doll.fit;
    assert.ok(fit.legL_up > 0 && fit.legR_up > 0, 'the hard hip cut is healed: ' + JSON.stringify(fit)); assert.match(fitText, /legL_up\s+\d+\s+\d+\s+\d+\s+\d+/, 'the fit prints its table');
    for (const s of ['L', 'R']) { const p = e.parts.find((q) => q.n === 'leg' + s + '_up'); assert.equal(p.ext, fit['leg' + s + '_up']); assert.ok(p.top && p.top[1] < p.y - 5, 'the thigh records its top, up in the body'); }
  });
  await t('the_doll_walks_on_planted_feet_that_alternate', () => {
    const rig = R.makeRig('doll', man1.rigs.doll), c = { x: 0, y: 0, bx: 0, by: 0 }, S = rig.stride * rig.H, d0 = R.RIG_TUNE.depth;
    try {
      for (const [ux, uy] of HEADINGS) for (const depth of [d0, 1]) {
        R.RIG_TUNE.depth = depth; const seen = {}; let dx = 0, dy = 0;
        for (let i = 0; i <= 800; i++) {
          const ph = i / 200; R.poseRig(rig, { ph, w: 1, t: 0, ux, uy });
          for (const s of ['L', 'R']) {
            const L = rig.legs[s]; if (!L.plant) continue; R.footContact(rig, s, c); assert.ok(Math.hypot(c.x - c.bx, c.y - c.by) < 1e-6, 'the drawn sole is on its floor point');
            const k = s + Math.floor(ph / 2 + (s === 'L' ? 0 : 0.5)) + (L.phi > 0 ? 't' : 'h'), wx = c.x + ph * S * ux, wy = c.y + ph * S * uy;
            if (seen[k]) { dx = Math.max(dx, Math.abs(wx - seen[k][0])); dy = Math.max(dy, Math.abs(wy - seen[k][1])); } else seen[k] = [wx, wy];
          }
        }
        assert.ok(dx < 0.12, `heading ${ux},${uy}: a planted sole drifts ${dx.toFixed(3)} along the screen x`);
        if (depth === 1 || uy === 0) assert.ok(dy < 0.12, `heading ${ux},${uy} depth ${depth}: and ${dy.toFixed(3)} along the screen y`);
      }
    } finally { R.RIG_TUNE.depth = d0; }
    const plants = [], was = { L: true, R: true };
    for (let i = 0; i <= 1600; i++) { R.poseRig(rig, { ph: i / 400, w: 1, t: 0 }); assert.ok(rig.info.plantL || rig.info.plantR, 'never both feet in the air'); for (const s of ['L', 'R']) { if (rig.legs[s].plant && !was[s]) plants.push(s); was[s] = rig.legs[s].plant; } }
    assert.deepEqual(plants, ['R', 'L', 'R', 'L'], 'one foot plants, then the other');
  });
  await t('no_leg_of_the_doll_shows_its_cut_end_and_every_thigh_runs_on_above_its_hip', async () => {
    await withChromium(async ({ br, base }) => {
      const pg = await br.newPage(); await pg.goto(`${base}/graftwork/design/README.md`);
      const e = man1.rigs.doll, files = { [e.file2x]: 'data:image/webp;base64,' + fs.readFileSync(path.join(out1, e.file2x)).toString('base64') };
      const res = await rigLimbEnds(pg, { manifest: man1, files }, ['doll'], HEADINGS);
      const legs = res.doll.filter((L) => L.n.startsWith('leg')); assert.equal(legs.length, 2);
      for (const L of legs) { assert.equal(L.fails, 0, `${L.n}: ${L.px} end px uncovered in ${L.fails} poses (worst at ${L.at})`); assert.equal(L.short, false, `${L.n} reaches ${L.above.toFixed(1)} above the hip of ${L.rise.toFixed(1)}`); }
    });
  });
  await t('exported_as_a_spec_v2_sheet_the_linter_passes_it_and_a_refit_chooses_no_extension', () => {
    tool(['--raw', raw, '--meta', path.join(raw, 'meta.json'), '--export', exp]);
    const lint = spawnSync('python3', ['-I', path.join(tools, 'graftwork_rig_check.py'), path.join(exp, 'rig.doll.png'), '--json'], { encoding: 'utf8' }), L = JSON.parse(lint.stdout);
    assert.equal(L.pass, true, 'the linter passes the exported sheet: ' + JSON.stringify(L.rules.filter((r) => !r.ok)));
    tool(['--raw', exp, '--meta', path.join(exp, 'meta.json'), '--out', out2, '--fit', '--scratch', path.join(dir, 'fit2')]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(exp, 'meta.json'), 'utf8')).rigs.doll.fit, { legL_up: 0, legR_up: 0 }, 'limbs that are long enough get no extension');
    const a = man1.rigs.doll, b = JSON.parse(fs.readFileSync(path.join(out2, 'manifest.json'), 'utf8')).rigs.doll;
    for (const k of ['bones', 'feet', 'foot', 'height']) assert.deepEqual(b[k], a[k], k + ' unchanged');
  });
} finally { fs.rmSync(dir, { recursive: true, force: true }); }
console.log(process.exitCode ? 'FAILED' : `${n} long limb checks passed`);
