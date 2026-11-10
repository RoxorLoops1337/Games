// GRAFTWORK Ward art: the manifest parses and names exactly the files on disk (nothing missing, nothing left over), it holds only what the game
// draws (the plot tile, standing actors, battle frames, icons, card illustrations), files are real WebP with alpha, size budget, no em dashes;
// and the build script: the battle frame pass and the prune pass, on synthetic folders.
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
const frameStems = (f) => (f ? [...(f.atk || []), f.hit, f.die].filter(Boolean) : []);
const files = (e) => [e.file1x, e.file2x, e.file3x, ...frameStems(e.frames).flatMap((s) => [`actors/${s}@1x.webp`, `actors/${s}@2x.webp`, ...(e.frames.hi3x ? [`actors/${s}@3x.webp`] : [])])].filter(Boolean);
const CARD_ROOMS = ['rm_corridor', 'rm_ward', 'rm_isolation', 'rm_chapel', 'rm_dispensary', 'rm_workshop', 'rm_sawmill', 'rm_quarry', 'rm_counting', 'rm_generator', 'rm_linen']; // the room paintings that live on as card illustrations
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
t('rooms_hold_only_the_plot_tile: the one painting drawn on the map, with its floor diamond', () => {
  assert.deepEqual(Object.keys(man.rooms), ['plot_empty'], 'Ward rooms are drawn from the kit: no room painting is a room');
  const e = man.rooms.plot_empty;
  for (const f of [e.file1x, e.file2x]) assert.ok(existsSync(join(root, f)), f);
  for (const k of ['w', 'h', 'floorCx', 'floorCy', 'floorW', 'floorH']) assert.ok(Number.isFinite(e[k]) && e[k] > 0, 'plot_empty.' + k);
  assert.ok(e.floorCx < e.w && e.floorCy < e.h); const r = e.floorW / e.floorH; assert.ok(r > 1.75 && r < 2.1, 'a 2:1 floor diamond: ' + r);
});
t('every_building_card_resolves_to_an_image_by_its_own_art_id_and_no_card_art_is_left_over', () => {
  const used = new Set();
  for (const c of Object.values(BUILD_CARDS)) { const e = man.cards[c.art]; assert.ok(e, c.id + ' has no art ' + c.art); used.add(c.art); for (const f of [e.file1x, e.file2x]) assert.ok(existsSync(join(root, f)), c.id + ' ' + f); }
  assert.deepEqual(Object.keys(man.cards).filter((a) => !used.has(a)), [], 'every card illustration is shown by a card');
  const fromRoom = Object.values(man.cards).filter((e) => e.fromRoom).map((e) => e.fromRoom).sort();
  assert.deepEqual(fromRoom, [...CARD_ROOMS].sort(), 'the room paintings that remain, as card illustrations');
  for (const e of Object.values(man.cards)) if (e.fromRoom) { assert.ok(ROOMS[e.fromRoom], e.fromRoom + ' is a room type'); assert.equal(e.file2x, `rooms/${e.fromRoom}@2x.webp`); assert.equal(e.file1x, `rooms/${e.fromRoom}@1x.webp`); }
});
t('the_manifest_names_exactly_the_files_on_disk', () => {
  const named = new Set(); for (const sec of ['rooms', 'actors', 'icons', 'cards']) for (const e of Object.values(man[sec])) for (const f of files(e)) named.add(f);
  const disk = []; const walk = (d, pre) => { for (const f of readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(join(d, f.name), pre + f.name + '/'); else if (pre + f.name !== 'manifest.json') disk.push(pre + f.name); } }; walk(root, '');
  assert.deepEqual(disk.filter((f) => !named.has(f)).sort(), [], 'files nothing draws');
  assert.deepEqual([...named].filter((f) => !disk.includes(f)).sort(), [], 'files the manifest promises');
});
t('nothing_of_the_removed_paths_is_left: low paintings, room paintings as rooms, walk frames, step frames, their fields', () => {
  const disk = []; const walk = (d) => { for (const f of readdirSync(d, { withFileTypes: true })) { if (f.isDirectory()) walk(join(d, f.name)); else disk.push(f.name); } }; walk(root);
  assert.deepEqual(disk.filter((f) => /_low@|_walk\d@|_b@/.test(f)), []);
  assert.deepEqual(disk.filter((f) => /^rm_/.test(f)).map((f) => f.replace(/@.*/, '')).filter((v, i, l) => l.indexOf(v) === i).sort(), [...CARD_ROOMS].sort(), 'room paintings on disk = the card illustrations');
  assert.equal(man.cardsById, undefined, 'a card is resolved by its own art id');
  for (const [id, e] of Object.entries(man.actors)) { assert.equal(e.walk1x, undefined, id); assert.equal(e.walk2x, undefined, id); if (e.frames) { assert.equal(e.frames.walk, undefined, id); assert.equal(e.frames.walkOk, undefined, id); } }
  for (const [id, e] of Object.entries(man.rooms)) assert.equal(e.low, undefined, id);
});
t('resource_and_phase_icons', () => {
  for (const id of ['wood', 'stone', 'gold', 'power', 'morning', 'midday', 'evening', 'night']) assert.ok(man.icons[id], id);
});
t('actors_have_anchor_and_files', () => {
  for (const id of ['marrow', 'wick', 'odile', 'the_matron', 'the_resident', 'the_resident_l2']) assert.ok(man.actors[id], id);
  for (const [id, e] of Object.entries(man.actors)) { assert.ok(e.anchorX > 0 && e.anchorY > 0 && e.anchorY <= e.h, id); for (const f of files(e)) assert.ok(existsSync(join(root, f)), f); }
});
t('battle_frames_are_optional_and_valid_when_present', () => {
  for (const [id, e] of Object.entries(man.actors)) {
    const f = e.frames; if (f === undefined) continue; // optional: most actors have none yet
    assert.equal(typeof f, 'object', id); assert.ok(frameStems(f).length > 0, id + ' frames is empty');
    if (f.atk) { assert.ok(f.atk.length >= 1 && f.atk.length <= 3, id); for (const s of f.atk) assert.match(s, new RegExp('^' + id + '_atk[123]$')); }
    if (f.hit !== undefined) assert.equal(f.hit, id + '_hit'); if (f.die !== undefined) assert.equal(f.die, id + '_die');
    for (const s of frameStems(f)) for (const t2 of ['1x', '2x']) assert.ok(existsSync(join(root, `actors/${s}@${t2}.webp`)), s + '@' + t2);
    if (f.hi3x) for (const s of frameStems(f)) assert.ok(existsSync(join(root, `actors/${s}@3x.webp`)), 'hi3x promises ' + s + '@3x');
    for (const k of Object.keys(f)) assert.ok(['atk', 'hit', 'die', 'hi3x'].includes(k), 'unknown frames key ' + k + ' (battle frames only)');
    for (const k of ['file1x', 'file2x']) assert.ok(typeof e[k] === 'string' && e[k], id + ' keeps its standing ' + k); for (const k of ['w', 'h', 'anchorX', 'anchorY']) assert.ok(e[k] > 0, id + ' keeps its standing ' + k);
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
t('build_frames_pass_aligns_by_feet_warns_on_scale_and_ignores_walk_raws', () => {
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
fig('actor_fig_b', dx=30)
fig('actor_fig_atk2', dx=-20, k=2.0); fig('actor_fig_hit', dx=110, dy=-40); fig('actor_fig_die', dx=-150, dy=30)
fig('actor_half_walk1'); fig('actor_half_walk2'); fig('actor_half_hit')
`;
  assert.equal(spawnSync('python3', ['-c', gen, raw], { encoding: 'utf8' }).status, 0);
  const r = spawnSync('python3', [new URL('../tools/graftwork_art_build.py', import.meta.url).pathname, '--frames', '--combat', '--out=' + out, raw], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.actors.fig.frames, { atk: ['fig_atk2'], hit: 'fig_hit', die: 'fig_die', hi3x: true }, 'battle frames; the walk raws next to them are not a frame group');
  assert.deepEqual(m.actors.half.frames, { hit: 'half_hit', hi3x: true }); assert.equal(m.actors.none.frames, undefined);
  assert.deepEqual({ ...m.actors.fig, frames: undefined }, { ...ent, frames: undefined }, 'no existing key changes');
  for (const s of ['fig_atk2', 'fig_hit', 'fig_die']) for (const t2 of ['1x', '2x', '3x']) assert.ok(existsSync(join(out, `actors/${s}@${t2}.webp`)), s + '@' + t2);
  assert.deepEqual(readdirSync(join(out, 'actors')).filter((f) => /walk|_b@|_low/.test(f)), [], 'a walk raw, a step raw or a low pass exports nothing');
  assert.match(r.stdout, /fig_atk2: WARNING scale differs/, 'a frame twice the standing size warns'); assert.doesNotMatch(r.stdout, /fig_hit: WARNING scale/);
  // the feet: the frames were shifted in the raw, yet their contact lands on the standing figure's contact
  const chk = spawnSync('python3', ['-c', `
import sys, json
from PIL import Image
import numpy as np
def c(p):
    a = np.array(Image.open(p).convert('RGBA'))[..., 3] > 40; ys, xs = np.where(a); b = ys.max(); band = max(2, round((b - ys.min()) * .12)); _, bx = np.where(a[b - band + 1:b + 1]); return [round(float(bx.mean()), 1), int(b)]
o = sys.argv[1] + '/actors/'
print(json.dumps({n: c(o + n + '@2x.webp') for n in ['fig_hit', 'fig_die']}))`, out], { encoding: 'utf8' });
  assert.equal(chk.status, 0, chk.stderr); const cs = JSON.parse(chk.stdout);
  for (const [k, v] of Object.entries(cs)) { assert.ok(Math.abs(v[0] - 128) <= 1.5 && Math.abs(v[1] - 243) <= 1, k + ' feet ' + v + ' vs the standing feet point 128,243'); }
  rmSync(dir, { recursive: true, force: true });
});
// the build script's --prune pass on a folder as it was before the painted room renderer and the painted walks were removed
t('build_prune_pass_drops_what_the_game_no_longer_draws_and_nothing_else_and_is_idempotent', () => {
  const py = spawnSync('python3', ['-c', 'import PIL, numpy'], { encoding: 'utf8' }); if (py.status !== 0) { console.log('skip build_prune_pass (no PIL)'); return; }
  const dir = mkdtempSync(join(tmpdir(), 'gwprune-')), out = join(dir, 'ward'), tool = new URL('../tools/graftwork_art_build.py', import.meta.url).pathname;
  for (const d of ['rooms', 'actors', 'icons', 'cards']) mkdirSync(join(out, d), { recursive: true });
  const two = (stem) => ({ file1x: stem + '@1x.webp', file2x: stem + '@2x.webp' }), room = (id, low) => ({ ...two('rooms/' + id), w: 512, h: 512, floorCx: 256, floorCy: 380, floorW: 490, floorH: 250, ...(low ? { low: true } : {}) });
  const actor = (id, extra) => ({ ...two('actors/' + id), w: 256, h: 256, anchorX: 128, anchorY: 243, kind: 'normal', scale: 1, ...extra });
  const before = {
    version: 1, tile: { w: 2, h: 1.05 },
    rooms: { plot_empty: room('plot_empty'), rm_ward: room('rm_ward'), rm_boiler: room('rm_boiler'), rm_ward_low: room('rm_ward_low', true), rm_theatre: room('rm_theatre') },
    actors: {
      fig: actor('fig', { walk1x: 'actors/fig_b@1x.webp', walk2x: 'actors/fig_b@2x.webp', file3x: 'actors/fig@3x.webp', frames: { walk: ['fig_walk1', 'fig_walk2', 'fig_walk3', 'fig_walk4'], atk: ['fig_atk2'], hit: 'fig_hit', hi3x: true } }),
      hero: actor('hero', { kind: 'hero', frames: { walk: ['hero_walk1', 'hero_walk2', 'hero_walk3', 'hero_walk4'], walkOk: false } }),
      plain: actor('plain'),
    },
    icons: { wood: { ...two('icons/wood'), w: 128, h: 128 } },
    cards: { ward_bowl: { ...two('cards/ward_bowl'), w: 256, h: 256 }, ward_beds: { ...two('rooms/rm_ward'), w: 512, h: 512, fromRoom: 'rm_ward' }, ward_theatre: { ...two('rooms/rm_theatre'), w: 512, h: 512, fromRoom: 'rm_theatre' } },
    cardsById: { b_ward: { room: 'rm_ward' }, b_feast: { card: 'ward_bowl' } },
  };
  assert.ok(Object.values(BUILD_CARDS).some((c) => c.art === 'ward_beds') && Object.values(BUILD_CARDS).some((c) => c.art === 'ward_bowl') && !Object.values(BUILD_CARDS).some((c) => c.art === 'ward_theatre'), 'the fixture: two arts a card uses, one no card uses');
  const keep = ['rooms/plot_empty', 'rooms/rm_ward', 'actors/fig', 'actors/hero', 'actors/plain', 'icons/wood', 'cards/ward_bowl', 'actors/fig_atk2', 'actors/fig_hit'].flatMap((s) => [s + '@1x.webp', s + '@2x.webp']).concat(['actors/fig@3x.webp', 'actors/fig_atk2@3x.webp', 'actors/fig_hit@3x.webp']);
  const gone = ['rooms/rm_boiler', 'rooms/rm_ward_low', 'rooms/rm_theatre', 'actors/fig_b', 'actors/hero_b', 'actors/fig_walk1', 'actors/fig_walk2', 'actors/fig_walk3', 'actors/fig_walk4', 'actors/hero_walk1', 'actors/hero_walk2', 'actors/hero_walk3', 'actors/hero_walk4'].flatMap((s) => [s + '@1x.webp', s + '@2x.webp']);
  for (const f of [...keep, ...gone]) writeFileSync(join(out, f), 'x'.repeat(10)); // hero_b: on disk, in no manifest (the three hero step files were like that)
  writeFileSync(join(out, 'manifest.json'), JSON.stringify(before, null, 1));
  const listing = () => { const l = []; for (const d of ['rooms', 'actors', 'icons', 'cards']) for (const f of readdirSync(join(out, d))) l.push(d + '/' + f); return l.sort(); };
  // --dry: says what it would do, touches nothing
  let r = spawnSync('python3', [tool, '--prune', '--dry', '--out=' + out], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /dry run\): 4 room entries, 1 card entries, 7 fields, 26 files, 260 bytes/, r.stdout);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')), before); assert.equal(listing().length, keep.length + gone.length);
  // the real pass
  r = spawnSync('python3', [tool, '--prune', '--out=' + out], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr);
  const m = JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8'));
  assert.deepEqual(m, {
    version: 1, tile: before.tile, rooms: { plot_empty: before.rooms.plot_empty },
    actors: { fig: actor('fig', { file3x: 'actors/fig@3x.webp', frames: { atk: ['fig_atk2'], hit: 'fig_hit', hi3x: true } }), hero: actor('hero', { kind: 'hero' }), plain: actor('plain') },
    icons: before.icons, cards: { ward_bowl: before.cards.ward_bowl, ward_beds: before.cards.ward_beds },
  }, 'only the entries and fields of the removed paths are gone');
  assert.deepEqual(listing(), [...keep].sort(), 'exactly the files the manifest no longer names are deleted (the unlisted hero step files too)');
  // again: nothing to do
  r = spawnSync('python3', [tool, '--prune', '--out=' + out], { encoding: 'utf8' }); assert.equal(r.status, 0); assert.match(r.stdout, /prune: 0 room entries, 0 card entries, 0 fields, 0 files, 0 bytes/);
  assert.deepEqual(JSON.parse(readFileSync(join(out, 'manifest.json'), 'utf8')), m); assert.deepEqual(listing(), [...keep].sort());
  // a manifest that would be left naming a missing file is not pruned at all
  rmSync(join(out, 'actors/fig_hit@2x.webp')); writeFileSync(join(out, 'actors/stray@1x.webp'), 'x');
  r = spawnSync('python3', [tool, '--prune', '--out=' + out], { encoding: 'utf8' }); assert.equal(r.status, 1); assert.match(r.stdout, /NOT PRUNED/); assert.ok(existsSync(join(out, 'actors/stray@1x.webp')), 'nothing was deleted');
  rmSync(dir, { recursive: true, force: true });
});
console.log(n + ' ok');
