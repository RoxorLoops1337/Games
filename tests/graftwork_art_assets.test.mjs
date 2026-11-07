// GRAFTWORK Ward art: manifest parses, every room has both files, files are real WebP with alpha, size budget, no em dashes.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
const root = new URL('../graftwork/assets/ward/', import.meta.url).pathname;
const { ROOMS, BUILD_CARDS } = await import('../graftwork/data/ward.js');
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const raw = readFileSync(join(root, 'manifest.json'), 'utf8');
const man = JSON.parse(raw);
const frameStems = (f) => (f ? [...(f.walk || []), ...(f.atk || []), f.hit, f.die].filter(Boolean) : []);
const files = (e) => [e.file1x, e.file2x, e.walk1x, e.walk2x, ...frameStems(e.frames).flatMap((s) => [`actors/${s}@1x.webp`, `actors/${s}@2x.webp`])].filter(Boolean);
const webp = (f) => {
  const b = readFileSync(join(root, f));
  assert.equal(b.toString('latin1', 0, 4), 'RIFF', f); assert.equal(b.toString('latin1', 8, 12), 'WEBP', f);
  const tag = b.toString('latin1', 12, 16);
  // alpha lives in VP8X flag bit 4, or in a lossless VP8L stream
  if (tag === 'VP8X') assert.ok(b[20] & 0x10, 'no alpha flag ' + f); else assert.equal(tag, 'VP8L', 'no alpha ' + f);
  return b;
};
t('manifest_schema', () => {
  assert.ok(man.version >= 1); assert.ok(man.tile.w > 0 && man.tile.h > 0);
  for (const k of ['rooms', 'actors', 'icons', 'cards']) assert.equal(typeof man[k], 'object', k);
});
t('every_room_has_entry_and_files', () => {
  for (const id of Object.keys(ROOMS)) {
    const e = man.rooms[id]; assert.ok(e, 'missing room ' + id);
    for (const f of [e.file1x, e.file2x]) assert.ok(existsSync(join(root, f)), f);
    for (const k of ['w', 'h', 'floorCx', 'floorCy', 'floorW', 'floorH']) assert.ok(Number.isFinite(e[k]) && e[k] > 0, id + '.' + k);
    assert.ok(e.floorCx < e.w && e.floorCy < e.h);
  }
  assert.ok(man.rooms.plot_empty, 'plot tile');
});
t('floor_diamonds_are_consistent_so_rooms_tile', () => {
  const ws = Object.entries(man.rooms).filter(([k, e]) => k !== 'plot_empty' && !e.low).map(([, e]) => e.floorW);
  assert.ok(Math.max(...ws) - Math.min(...ws) < 8);
});
t('low_wall_variants_have_their_own_measured_floor_and_a_tall_twin', () => {
  const lows = Object.entries(man.rooms).filter(([, e]) => e.low);
  assert.ok(lows.length >= 15, 'the lowered-wall paintings are in: ' + lows.length);
  for (const [id, e] of lows) {
    assert.ok(id.endsWith('_low') && man.rooms[id.slice(0, -4)], id + ' has a tall twin');
    assert.ok(id.slice(0, -4) in ROOMS || id.slice(0, -4) === 'rm_isolation2', id + ' is a room type');
    for (const f of [e.file1x, e.file2x]) assert.ok(existsSync(join(root, f)), f);
    for (const k of ['w', 'h', 'floorCx', 'floorCy', 'floorW', 'floorH']) assert.ok(Number.isFinite(e[k]) && e[k] > 0, id + '.' + k);
    const r = e.floorW / e.floorH; assert.ok(r > 1.75 && r < 2.1, id + ' floor diamond ratio ' + r);
    assert.ok(Math.abs(e.floorCx - e.w / 2) < e.w * 0.03 && e.floorW > e.w * 0.8, id + ' floor centred');
    assert.ok(e.floorCy < e.h && e.floorCy > e.h * 0.5, id + ' floor centre');
  }
  // rejected by the build (magenta steam on the boiler): no entry, no file, so the renderer falls back to the tall painting
  assert.ok(!man.rooms.rm_boiler_low && !existsSync(join(root, 'rooms/rm_boiler_low@2x.webp')), 'rm_boiler_low was rejected');
});
t('every_building_card_resolves_to_an_image', () => {
  for (const c of Object.values(BUILD_CARDS)) {
    const m = man.cardsById[c.id] || { card: c.art }; assert.ok(m, c.id); // a card newer than the last art build (Expand, Ward Wing, Grand Chapel) resolves by its own art id, exactly as ui/assets.js cardArt does
    const e = m.room ? man.rooms[m.room] : man.cards[m.card];
    assert.ok(e && existsSync(join(root, e.file2x)), c.id);
  }
});
t('resource_and_phase_icons', () => {
  for (const id of ['wood', 'stone', 'gold', 'power', 'morning', 'midday', 'evening', 'night']) assert.ok(man.icons[id], id);
});
t('actors_have_anchor_and_files', () => {
  for (const id of ['marrow', 'wick', 'odile', 'the_matron', 'the_resident', 'the_resident_l2']) assert.ok(man.actors[id], id);
  for (const [id, e] of Object.entries(man.actors)) { assert.ok(e.anchorX > 0 && e.anchorY > 0 && e.anchorY <= e.h, id); for (const f of files(e)) assert.ok(existsSync(join(root, f)), f); }
});
t('animation_frames_are_optional_and_valid_when_present', () => {
  for (const [id, e] of Object.entries(man.actors)) {
    const f = e.frames; if (f === undefined) continue; // optional: most actors have none yet
    assert.equal(typeof f, 'object', id); assert.ok(frameStems(f).length > 0, id + ' frames is empty');
    if (f.walk) { assert.deepEqual(f.walk.map((s) => s.slice(id.length + 1)), ['walk1', 'walk2', 'walk3', 'walk4'], id + ' walk is the whole cycle in order'); }
    if (f.atk) { assert.ok(f.atk.length >= 1 && f.atk.length <= 3, id); for (const s of f.atk) assert.match(s, new RegExp('^' + id + '_atk[123]$')); }
    if (f.hit !== undefined) assert.equal(f.hit, id + '_hit'); if (f.die !== undefined) assert.equal(f.die, id + '_die');
    if (f.walk) for (const s of f.walk) assert.match(s, new RegExp('^' + id + '_walk[1-4]$'));
    for (const s of frameStems(f)) for (const t2 of ['1x', '2x']) assert.ok(existsSync(join(root, `actors/${s}@${t2}.webp`)), s + '@' + t2);
    if (f.hi3x) for (const s of frameStems(f).filter((x) => !/walk/.test(x))) assert.ok(existsSync(join(root, `actors/${s}@3x.webp`)), 'hi3x promises ' + s + '@3x');
    for (const k of Object.keys(f)) assert.ok(['walk', 'atk', 'hit', 'die', 'hi3x', 'walkOk'].includes(k), 'unknown frames key ' + k);
    for (const k of ['file1x', 'file2x']) assert.ok(typeof e[k] === 'string' && e[k], id + ' keeps its standing ' + k); for (const k of ['w', 'h', 'anchorX', 'anchorY']) assert.ok(e[k] > 0, id + ' keeps its standing ' + k);
    if (f.walkOk !== undefined) assert.equal(f.walkOk, false, id + ': walkOk is only ever written as false');
  }
});
t('all_files_are_webp_with_alpha', () => {
  for (const sec of ['rooms', 'actors', 'icons', 'cards']) for (const e of Object.values(man[sec])) for (const f of files(e)) webp(f);
});
t('total_size_under_budget', () => {
  let total = 0;
  const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { const p = join(d, f.name); if (f.isDirectory()) walk(p); else total += statSync(p).size; } };
  walk(root); assert.ok(total < 12 * 1024 * 1024, 'size ' + total);
});
// the build script's --frames pass on synthetic rasters in a temp folder (needs python3 with PIL; skipped without)
t('build_frames_pass_aligns_by_feet_warns_on_scale_and_skips_incomplete_walks', () => {
  const py = spawnSync('python3', ['-c', 'import PIL, numpy'], { encoding: 'utf8' }); if (py.status !== 0) { console.log('skip build_frames_pass (no PIL)'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'gwframes-')), raw = join(dir, 'raw'), out = join(dir, 'out');
  mkdirSync(raw); mkdirSync(join(out, 'actors'), { recursive: true });
  const ent = { file1x: 'actors/fig@1x.webp', file2x: 'actors/fig@2x.webp', w: 256, h: 256, anchorX: 128, anchorY: 243, kind: 'normal', scale: 1 };
  writeFileSync(join(out, 'manifest.json'), JSON.stringify({ version: 1, tile: { w: 2, h: 1 }, rooms: {}, actors: { fig: ent, half: { ...ent }, none: { ...ent } }, icons: {}, cards: {} }));
  const gen = `
import sys, json
from PIL import Image, ImageDraw
raw = sys.argv[1]
def fig(name, dx=0, dy=0, k=1.0, size=1024):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    w, h = 200 * k, 500 * k; cx, bot = 512 + dx, 900 + dy
    d.rectangle([cx - w / 2, bot - h, cx + w / 2, bot], fill=(200, 60, 40, 255))
    im.save(raw + '/' + name + '.png')
fig('actor_fig'); fig('actor_half'); fig('actor_none')
for i in range(1, 5): fig('actor_fig_walk%d' % i, dx=60 * i - 150, dy=-40)
fig('actor_fig_atk2', dx=-20, k=2.0); fig('actor_fig_hit', dx=10); fig('actor_fig_die', dy=30)
fig('actor_half_walk1'); fig('actor_half_walk2'); fig('actor_half_hit')
`;
  assert.equal(spawnSync('python3', ['-c', gen, raw], { encoding: 'utf8' }).status, 0);
  const r = spawnSync('python3', [new URL('../tools/graftwork_art_build.py', import.meta.url).pathname, '--frames', '--combat', '--out=' + out, raw], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.actors.fig.frames, { walk: ['fig_walk1', 'fig_walk2', 'fig_walk3', 'fig_walk4'], atk: ['fig_atk2'], hit: 'fig_hit', die: 'fig_die', hi3x: true });
  assert.deepEqual(m.actors.half.frames, { hit: 'half_hit', hi3x: true }, 'two walk frames are not a cycle: walk left out'); assert.equal(m.actors.none.frames, undefined);
  assert.deepEqual({ ...m.actors.fig, frames: undefined }, { ...ent, frames: undefined }, 'no existing key changes');
  for (const s of ['fig_walk1', 'fig_walk4', 'fig_atk2', 'fig_hit', 'fig_die']) for (const t2 of ['1x', '2x']) assert.ok(existsSync(join(out, `actors/${s}@${t2}.webp`)), s);
  assert.ok(existsSync(join(out, 'actors/fig_atk2@3x.webp')) && !existsSync(join(out, 'actors/fig_walk1@3x.webp')), '@3x only for combat frames');
  assert.ok(!existsSync(join(out, 'actors/half_walk1@2x.webp')), 'an incomplete walk exports nothing');
  assert.match(r.stdout, /fig_atk2: WARNING scale differs/, 'a frame twice the standing size warns'); assert.doesNotMatch(r.stdout, /fig_walk1: WARNING scale/);
  // the feet: every walk frame was shifted by up to 150 px in the raw, yet its contact lands on the standing figure's contact
  const chk = spawnSync('python3', ['-c', `
import sys, json
from PIL import Image
import numpy as np
def c(p):
    a = np.array(Image.open(p).convert('RGBA'))[..., 3] > 40; ys, xs = np.where(a); b = ys.max(); band = max(2, round((b - ys.min()) * .12)); _, bx = np.where(a[b - band + 1:b + 1]); return [round(float(bx.mean()), 1), int(b)]
o = sys.argv[1] + '/actors/'
print(json.dumps({n: c(o + n + '@2x.webp') for n in ['fig_walk1', 'fig_walk2', 'fig_walk3', 'fig_walk4', 'fig_hit', 'fig_die']}))`, out], { encoding: 'utf8' });
  assert.equal(chk.status, 0, chk.stderr); const cs = JSON.parse(chk.stdout);
  for (const [k, v] of Object.entries(cs)) { assert.ok(Math.abs(v[0] - 128) <= 1.5 && Math.abs(v[1] - 243) <= 1, k + ' feet ' + v + ' vs the standing feet point 128,243'); }
  rmSync(dir, { recursive: true, force: true });
});
t('no_em_dashes', () => { assert.ok(!raw.includes(String.fromCharCode(0x2014))); });
console.log(n + ' ok');
