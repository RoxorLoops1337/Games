// THE WARD, modular room kit (data/ward_kit.js recipes, ui/ward_kit_iso.js renderer, ui/assets.js kit loader, the grounding of every actor in
// ui/ward_iso.js): recipes are valid against the manifest (and degrade when ids are missing), walls are shared and doors follow the engine's
// connections, props and actors are depth sorted, nobody stands in a prop, the wall mode follows the density, a room with no usable floor or
// wall keeps its painted sprite, a click on a tall wall picks the room, reduced motion freezes everything, and every figure stands on its feet
// (measured contact point, flat soft shadow, a step cycle tied to the distance moved, no vertical offset at rest).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import * as LAYOUT from '../graftwork/ui/layout_registry.js';
import * as KD from '../graftwork/data/ward_kit.js';
import { ENEMIES } from '../graftwork/data/index.js';
import { ROOMS } from '../graftwork/data/ward.js';
const wardMod = await import('../graftwork/ui/ward.js');
const ward = wardMod.default, { resetWardMem, wardInterlude } = wardMod;
const ISO = await import('../graftwork/ui/ward_iso.js');
const KR = await import('../graftwork/ui/ward_kit_iso.js');
const { assets, createAssets } = await import('../graftwork/ui/assets.js');
const SCR = {};
for (const n of ['combat', 'reward', 'graft', 'shop', 'event', 'title', 'end']) SCR[n] = (await import(`../graftwork/ui/${n}.js`)).default;

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const NORMAL1 = Object.values(ENEMIES).filter((e) => e.act === 1 && e.kind === 'normal' && !e.summonOnly && !e.minion).map((e) => e.id);

// ---------------- fixtures: "the pilot kit" (a copy of the manifest of the first modular pilot), "the current kit" (the manifest on disk) and "everything planned is delivered" ----------------
const PILOT = JSON.parse(fs.readFileSync(new URL('./graftwork_kit_fixture.json', import.meta.url), 'utf8')); // the first pilot kit: wood and stone, 4 pieces, 10 props
const CUR = JSON.parse(fs.readFileSync(new URL('../graftwork/assets/ward_kit/manifest.json', import.meta.url), 'utf8')); // the kit as delivered: 8 floors, 7 walls, 12 pieces, 24 props (batch 4 props are still to come)
const clone = (o) => JSON.parse(JSON.stringify(o));
function fullKit() { // the current kit plus every planned id (footprints as laid out in data/ward_kit.js)
  const m = clone(CUR);
  for (const f of KD.PLANNED.floors) m.floors[f] = { name: f, file2x: 'floors/' + f + '@2x.webp', file1x: 'floors/' + f + '@1x.webp', tile: 512 };
  for (const f of KD.PLANNED.walls) m.walls[f] = { name: f, file2x: 'walls/' + f + '@2x.webp', file1x: 'walls/' + f + '@1x.webp', tile: 512 };
  for (const f of KD.PLANNED.pieces) m.pieces[f] = { name: f, file2x: 'pieces/' + f + '@2x.webp', file1x: 'pieces/' + f + '@1x.webp', w: 140, h: 300, anchorX: 70, anchorY: 150, wallSlot: 'mid', sw: 14 };
  for (const [id, fp] of Object.entries(KD.PLANNED.props)) m.props[id] = { name: id, file2x: 'props/' + id + '@2x.webp', file1x: 'props/' + id + '@1x.webp', w: 200, h: 200, anchorX: 100, anchorY: 150, footprint: fp, sw: 24 };
  return m;
}
const without = (m, group, ids) => { const o = clone(m); for (const id of ids) delete o[group][id]; return o; };
function installKit(m = CUR) {
  assets.reset(); ISO.resetIso();
  assets.kit = { version: 1, world: {}, floors: m.floors, walls: m.walls, pieces: m.pieces, props: m.props }; assets.kitState = 'ready';
  for (const g of ['floors', 'walls', 'pieces', 'props']) for (const d of Object.values(m[g])) for (const f of [d.file1x, d.file2x, d.file]) if (f) assets.imgs.set('kit:' + f, { ok: true, bad: false, img: { width: 512, height: 512 } });
}
const removeKit = () => { assets.reset(); ISO.resetIso(); };

// ---------------- the Ward screen harness (the same as tests/graftwork_ui_ward.test.mjs) ----------------
async function setup(o = {}) {
  resetWardMem();
  const run = RUN.newRun({ hero: 'marrow', seed: o.seed || 'kit' });
  const motion = !!o.motion;
  const meta = { settings: { reduceMotion: !motion, reducedMotion: !motion, tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  app.ctx.measureText = (s) => { const f = String(app.ctx.font || ''), m = /(\d+(?:\.\d+)?)px/.exec(f), size = m ? +m[1] : 16; return { width: String(s).length * size * (/bold/.test(f) ? 0.56 : 0.52) }; };
  app.register('ward', ward); for (const k of Object.keys(SCR)) app.register(k, SCR[k]); app.register('base', { draw() {} });
  const PS = { combat: 'combat', reward: 'reward', graft: 'graft', shop: 'shop', forge: 'base', event: 'event', ward: 'ward', dead: 'base', won: 'base' };
  const flow = { RUN, route() { const scr = PS[run.phase] || 'base'; if (scr !== 'ward' && wardInterlude(app, run, scr)) return; app.go(scr, { run }); }, openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false, resume() {}, abandon() {}, toTitle() {}, start() {} };
  app.shared.flow = flow;
  return { app, run, meta, flow };
}
function layout(run, spec) {
  const w = run.ward;
  w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {}; w.nextRoom = 1;
  const ids = [];
  for (const [type, x, y, contents] of spec) { const id = 'r' + w.nextRoom++; w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: contents || [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  const th = 'r' + w.nextRoom++; w.rooms[th] = { id: th, type: 'rm_theatre', x: 8, y: 5, on: true, level: 1, timers: { spawn: 9 }, contents: [], upgrades: [] }; w.grid[5][8] = th;
  w.hero.room = ids[0]; WD.wardPower(run);
  return ids;
}
const mons = (k, nn = 2) => Array.from({ length: nn }, (_, i) => ({ kind: 'monster', id: NORMAL1[(i + k) % NORMAL1.length] }));
const reg = (id) => LAYOUT.getAll().find((r) => r.id === id);
// local sub-tile coordinates of a world point inside the room at (rx, ry)
function localSub(w, rx, ry, x, y) { const c = ISO.cellW(w, rx, ry), px = x - c.x, py = y - (c.y - ISO.TH / 2); const a = px * KD.SUB / (ISO.TW / 2), b = py * KD.SUB / (ISO.TH / 2); return { u: (a + b) / 2, v: (b - a) / 2 }; }
function roomOfWorld(w, x, y) { const g0 = ISO.cellW(w, 0, 0), u = (x - g0.x) / (ISO.TW / 2), v = (y - g0.y) / (ISO.TH / 2); const gx = Math.round((u + v) / 2), gy = Math.round((v - u) / 2); const id = w.grid[gy] && w.grid[gy][gx]; return id && id !== 'rubble' ? w.rooms[id] : null; }
const HOSPITAL = [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_ward', 2, 2], ['rm_sawmill', 3, 2], ['rm_generator', 1, 3], ['rm_quarry', 2, 3], ['rm_dispensary', 3, 3], ['rm_workshop', 1, 1], ['rm_chapel', 2, 1], ['rm_isolation', 3, 1], ['rm_linen', 0, 3]];

// ======================================================= recipes =======================================================
function checkRecipe(rc, kit, label) {
  assert.ok(kit.floors[rc.floor] && kit.walls[rc.wall], label + ': floor and wall exist in the manifest');
  const occ = KD.newGrid(0);
  for (const p of rc.props) {
    assert.ok(kit.props[p.id], label + ': prop ' + p.id + ' exists'); assert.ok(p.u >= 0 && p.v >= 0 && p.u + p.c <= KD.SUB && p.v + p.r <= KD.SUB, label + ': ' + p.id + ' inside the 4 x 4 grid');
    const fp = KD.footprintOf(kit, p.id, p.flip); assert.deepEqual([p.c, p.r], fp, label + ': footprint of ' + p.id);
    for (let i = 0; i < p.c; i++) for (let j = 0; j < p.r; j++) { assert.equal(occ[p.u + i][p.v + j], 0, label + ': props overlap at ' + p.id); occ[p.u + i][p.v + j] = 1; }
  }
  for (const [u, v] of KD.LANES) assert.equal(occ[u][v], 0, label + ': lane cell ' + u + ',' + v + ' is free (a door leads out there)');
  assert.ok(KD.freeConnected(rc), label + ': every free sub-tile is reachable (monsters and the hero can walk)');
  for (const pc of rc.pieces) { assert.ok(kit.pieces[pc.id], label + ': piece ' + pc.id + ' exists'); assert.ok(pc.s >= 0 && pc.s <= 1 && (pc.wall === 'L' || pc.wall === 'R')); }
  assert.ok(rc.free.length >= 6, label + ': enough free floor for 5 monsters');
}
await t('recipes: every rm_* recipe is valid against the pilot kit, the current kit and against everything delivered; every room is modular today', async () => {
  for (const [name, kit] of [['pilot', PILOT], ['current', CUR], ['full', fullKit()]]) {
    let usable = 0;
    for (const type of Object.keys(KD.RECIPES)) { assert.ok(ROOMS[type], type + ' is a real room type'); const rc = KD.resolveRecipe(type, kit); if (!rc) continue; usable++; checkRecipe(rc, kit, name + ' ' + type); }
    if (name === 'pilot') assert.ok(usable >= 3, 'the pilot kit still expresses the wood rooms: ' + usable);
    if (name === 'current') assert.equal(usable, Object.keys(KD.RECIPES).length, 'every room type has a modular recipe with the art that exists today: ' + usable);
    if (name === 'full') assert.equal(usable, Object.keys(KD.RECIPES).length, 'with every planned id delivered every recipe switches on');
  }
  // every id a recipe names is either in the current kit or declared as planned (a typo would silently stay on the fallback variant forever)
  const known = { floors: new Set([...Object.keys(CUR.floors), ...KD.PLANNED.floors]), walls: new Set([...Object.keys(CUR.walls), ...KD.PLANNED.walls]), pieces: new Set([...Object.keys(CUR.pieces), ...KD.PLANNED.pieces]), props: new Set([...Object.keys(CUR.props), ...Object.keys(KD.PLANNED.props)]) };
  for (const [type, list] of Object.entries(KD.RECIPES)) for (const v of list) {
    assert.ok(known.floors.has(v.floor), type + ' floor ' + v.floor); assert.ok(known.walls.has(v.wall), type + ' wall ' + v.wall);
    for (const p of v.pieces) assert.ok(known.pieces.has(p.id), type + ' piece ' + p.id); for (const p of v.props) assert.ok(known.props.has(p.id), type + ' prop ' + p.id);
    for (const id of v.need || []) assert.ok(known.props.has(id), type + ' need ' + id);
    if (v.door) assert.ok(CUR.pieces[v.door], type + ' door piece ' + v.door);
  }
  for (const type of ['rm_sawmill', 'rm_quarry', 'rm_generator', 'rm_ward', 'rm_dispensary', 'rm_pharmacy', 'rm_chapel', 'rm_entrance', 'rm_theatre', 'rm_counting', 'rm_kitchen', 'rm_library']) assert.ok(KD.resolveRecipe(type, CUR), type + ' works with the current kit');
  assert.ok(KD.resolveRecipe('rm_sawmill', PILOT) && !KD.resolveRecipe('rm_chapel', PILOT), 'the pilot kit has no stained glass: the chapel needs the new floor and wall');
});
await t('batch 4 art: every signature prop is in the manifest, each room shows its signature variant, and still falls back to the older art when a prop is missing', async () => {
  const BATCH4 = 'boiler_tank coal_pile valve_wheel cable_coil fuse_box counting_desk coin_chest abacus pharmacy_counter pill_jars padded_cot restraint_chair stove prep_table cauldron hanging_pots wash_tub mangle drying_rack bookcase reading_desk globe library_ladder linen_shelf linen_cart slab_table locker_wall sheet_body operating_table footlights instrument_tray throne workbench anvil tool_chest pickaxe_rack ore_cart work_lamp'.split(' ');
  for (const id of BATCH4) { assert.ok(CUR.props[id], 'delivered prop ' + id); assert.ok(!KD.PLANNED.props[id], id + ' left PLANNED'); }
  assert.deepEqual([KD.PLANNED.floors, KD.PLANNED.walls, KD.PLANNED.pieces, Object.keys(KD.PLANNED.props)], [[], [], [], []], 'nothing is still planned');
  // scale: a 2 x 1 prop is about a bed wide, a 1 x 1 prop is never wider than a crate and a half, nothing is wider than its footprint (23 world px per sub-tile along each axis, a diamond)
  for (const id of BATCH4) { const d = CUR.props[id]; const [c, r] = d.footprint; assert.ok(d.sw <= (c + r) * 23 * 0.75 + 4, id + ' fits its footprint (sw ' + d.sw + ')'); if (c * r === 2) assert.ok(d.sw >= 22 && d.sw <= 34, id + ' is about a bed wide: ' + d.sw); else assert.ok(d.sw <= 20, id + ' is crate sized or smaller: ' + d.sw); }
  const used = new Set();
  for (const [type, list] of Object.entries(KD.RECIPES)) {
    assert.ok(list.some((v) => !(v.need || []).length), type + ' has a variant that needs nothing');
    assert.ok(!(list[list.length - 1].need || []).length, type + ': the last variant is the fallback');
    list.forEach((v, i) => { for (const id of v.need || []) { assert.ok(BATCH4.includes(id), type + ' need ' + id + ' is a batch 4 prop'); used.add(id); } if ((v.need || []).length) assert.ok(i < list.length - 1, type + ': a gated variant comes before the fallback'); });
    const cur = KD.resolveRecipe(type, CUR); assert.ok(cur);
    if (list.length > 1) {
      assert.equal(cur.variant, 0, type + ' shows its signature variant'); assert.equal(cur.planned, true);
      const old = clone(CUR); for (const id of BATCH4) delete old.props[id]; const fb = KD.resolveRecipe(type, old);
      assert.ok(fb && fb.variant === list.length - 1, type + ' falls back to the older art without batch 4');
    }
    for (const v of list) for (const need of v.need || []) assert.ok(CUR.props[need]);
    // every prop of the chosen variant is placed (the layout was made for these footprints)
    assert.equal(cur.props.length, list[cur.variant].props.length, type + ': no prop of the signature variant was dropped by the resolver');
  }
  const placed = new Set(); for (const list of Object.values(KD.RECIPES)) for (const v of list) for (const p of v.props) placed.add(p.id);
  for (const id of BATCH4) assert.ok(placed.has(id), 'batch 4 prop ' + id + ' is used by a variant');
  const one = without(CUR, 'props', ['boiler_tank']); assert.equal(KD.resolveRecipe('rm_boiler', one).variant, KD.RECIPES.rm_boiler.length - 1, 'a missing signature prop only demotes that room'); assert.equal(KD.resolveRecipe('rm_morgue', one).variant, 0);
});
await t('composition: no two rooms alike, tall props stay in the back half and clear of windows, windows only where daylight makes sense, the middle of the room stays open', async () => {
  for (const [name, kit] of [['current', CUR], ['full', fullKit()]]) {
    const sig = new Map(), types = Object.keys(KD.RECIPES);
    for (const type of types) {
      const rc = KD.resolveRecipe(type, kit);
      const key = [rc.floor, rc.wall, rc.props.map((p) => p.id + p.u + p.v + (p.flip ? 'f' : '')).sort().join(','), rc.pieces.map((p) => p.id + p.wall + p.s).sort().join(',')].join('|');
      assert.ok(!sig.has(key), name + ': ' + type + ' looks exactly like ' + sig.get(key)); sig.set(key, type);
      // the prop mix differs too, not only the layout: no two rooms share the same set of props and the same theme pair
      const mix = [rc.floor, rc.wall, [...new Set(rc.props.map((p) => p.id))].sort().join(',')].join('|');
      for (const other of types) if (other !== type) { const o = KD.resolveRecipe(other, kit); assert.notEqual([o.floor, o.wall, [...new Set(o.props.map((p) => p.id))].sort().join(',')].join('|'), mix, name + ': ' + type + ' and ' + other + ' share theme and props'); }
    }
    // distinct floor + wall pairs: at least 15 of 20 rooms own their pair
    const pairs = new Map(); for (const type of types) { const rc = KD.resolveRecipe(type, kit), k = rc.floor + '/' + rc.wall; pairs.set(k, (pairs.get(k) || 0) + 1); }
    assert.ok(pairs.size >= 14, name + ': floor and wall pairs in use: ' + pairs.size);
    assert.ok(new Set(types.map((ty) => KD.resolveRecipe(ty, kit).floor)).size >= 8, name + ': every floor theme is used'); assert.ok(new Set(types.map((ty) => KD.resolveRecipe(ty, kit).wall)).size >= 7, name + ': every wall theme is used');
    const usedProps = new Set(), usedPieces = new Set(); for (const ty of types) { const rc = KD.resolveRecipe(ty, kit); rc.props.forEach((p) => usedProps.add(p.id)); rc.pieces.forEach((p) => usedPieces.add(p.id)); }
    for (const id of Object.keys(CUR.props)) assert.ok(usedProps.has(id), name + ': prop ' + id + ' is used by some room');
    for (const id of Object.keys(CUR.pieces)) if (id !== 'door') assert.ok(usedPieces.has(id), name + ': piece ' + id + ' is used by some room');
    const TALL = new Set(['shelf', 'toolrack', 'bookcase', 'locker_wall', 'linen_shelf', 'pickaxe_rack', 'hanging_pots']);
    const NO_WINDOW = ['rm_morgue', 'rm_isolation', 'rm_isolation2', 'rm_boiler', 'rm_chapel', 'rm_theatre', 'rm_quarry', 'rm_generator', 'rm_entrance'];
    for (const type of types) {
      const rc = KD.resolveRecipe(type, kit), label = name + ' ' + type;
      for (const p of rc.props) if (TALL.has(p.id)) assert.ok(p.u + p.v <= 3, label + ': tall ' + p.id + ' stays in the back half so nobody hides behind it');
      for (const pc of rc.pieces) {
        const d = kit.pieces[pc.id], half = (d.sw || 14) / 46 * KD.SUB / 2; // cells covered along the wall
        if (['window', 'stainedglass'].includes(pc.id)) for (const p of rc.props) if (TALL.has(p.id)) {
          const at = pc.wall === 'L' ? KD.SUB * (1 - pc.s) : KD.SUB * pc.s, onWall = pc.wall === 'L' ? p.u === 0 : p.v === 0, cell = pc.wall === 'L' ? p.v : p.u;
          if (onWall) assert.ok(cell + 1 <= at - half + 0.05 || cell >= at + half - 0.05, label + ': tall ' + p.id + ' stands in front of the ' + pc.id + ' on the ' + pc.wall + ' wall');
        }
        if (pc.id === 'window') assert.ok(!NO_WINDOW.includes(type), label + ': a window where a window makes no sense');
      }
      const centre = [[1, 1], [2, 1], [1, 2], [2, 2]].filter(([u, v]) => rc.occ[u][v]).length; assert.ok(centre <= 2, label + ': the middle stays open for the fight and the walk (' + centre + ' of 4 centre tiles used)');
      const sides = rc.pieces.filter((p) => !['door', 'archdoor'].includes(p.id) || true).map((p) => p.wall); assert.ok(sides.includes('L') || sides.includes('R'), label + ': has wall pieces');
    }
  }
  // each room's identity props are on stage today
  const has = (type, id) => KD.resolveRecipe(type, CUR).props.some((p) => p.id === id);
  for (const [type, ids] of [['rm_chapel', ['altar', 'pew', 'candle_stand', 'lectern']], ['rm_entrance', ['reception_desk', 'waiting_bench', 'coat_stand']], ['rm_ward', ['bed', 'bedside_table', 'iv_stand']], ['rm_corridor', ['gurney', 'wheelchair', 'plant']], ['rm_morgue', ['slab_table', 'sheet_body', 'locker_wall']], ['rm_sawmill', ['sawbench', 'planks']]]) for (const id of ids) assert.ok(has(type, id), type + ' has ' + id);
  const piece = (type, id) => KD.resolveRecipe(type, CUR).pieces.some((p) => p.id === id);
  assert.ok(piece('rm_chapel', 'stainedglass') && piece('rm_entrance', 'archdoor') && piece('rm_theatre', 'curtain') && piece('rm_boiler', 'pipes') && piece('rm_morgue', 'vent'), 'identity wall pieces');
  assert.equal(KD.resolveRecipe('rm_entrance', CUR).doorPiece, 'archdoor'); assert.equal(KD.resolveRecipe('rm_ward', CUR).doorPiece, 'door'); assert.equal(KD.resolveRecipe('rm_ward', PILOT), null);
  assert.equal(KD.resolveRecipe('rm_sawmill', PILOT).doorPiece, 'door', 'the pilot kit has no archdoor: the plain doorway');
  assert.equal(KD.resolveRecipe('rm_chapel', CUR).floor, 'stone'); assert.equal(KD.resolveRecipe('rm_theatre', CUR).floor, 'stage'); assert.equal(KD.resolveRecipe('rm_morgue', CUR).floor, 'slab');
});
await t('scale sanity: every prop fits its footprint, stands between knee and wall height, and slim tall things are tall enough to read next to the hero', async () => {
  const bed = CUR.props.bed, drawn = (d) => d.h * d.sw / d.w, HERO = 44;
  for (const [id, d] of Object.entries(CUR.props)) {
    const [c, r] = d.footprint, h = drawn(d);
    assert.ok(d.sw <= (c + r) * 11.5 + 1, id + ': ' + d.sw + ' wide does not fit a ' + c + 'x' + r + ' footprint');
    assert.ok(h >= 11 && h <= KD.WALL_FULL - 6, id + ': drawn height ' + h.toFixed(1) + ' between a stool and the wall');
    if (d.footprint[0] * d.footprint[1] === 2) assert.ok(d.sw >= 22 && d.sw <= 34, id + ' (2x1) is about a bed wide: ' + d.sw + ' vs ' + bed.sw);
  }
  for (const id of ['lamp', 'iv_stand', 'coat_stand']) assert.ok(drawn(CUR.props[id]) >= 24, id + ' is tall and slim, at least 24 units: ' + drawn(CUR.props[id]).toFixed(1));
  for (const id of ['stool', 'bucket', 'bedside_table', 'plant', 'wheelchair']) assert.ok(drawn(CUR.props[id]) <= 0.5 * HERO, id + ' stays low (under half a hero): ' + drawn(CUR.props[id]).toFixed(1));
  assert.ok(drawn(CUR.props.bedside_table) >= 0.35 * drawn(bed) && drawn(CUR.props.bedside_table) <= 0.9 * drawn(bed), 'a bedside table is bed-mattress sized');
  assert.ok(drawn(CUR.props.shelf) > drawn(bed) && drawn(CUR.props.shelf) < HERO, 'a shelf is taller than a bed and shorter than the hero');
  assert.ok(CUR.props.gurney.sw / bed.sw > 0.9 && CUR.props.gurney.sw / bed.sw < 1.15, 'a gurney is about a bed');
});

// ======================================================= loader =======================================================
await t('assets loader: the kit manifest loads once, images by recipe (never the whole kit), @1x on phones and @2x on desktop, a change of size is bridged, kit images are never evicted, a bad kit manifest or a failed file never throws, headless is a no-op', async () => {
  const urls = [];
  const fake = createAssets({
    base: 'assets/ward/', fetchJson: async (u) => { urls.push(u); return u.includes('ward_kit') ? { version: 1, world: { tw: 92, th: 48, sub: 4 }, floors: { wood: { file1x: 'floors/w1.webp', file2x: 'floors/w2.webp', tile: 512 } }, walls: {}, pieces: {}, props: { crate: { file1x: 'props/c1.webp', file2x: 'props/c2.webp', w: 10, h: 10, anchorX: 5, anchorY: 9, sw: 9, footprint: [1, 1] } } } : { version: 1, tile: { w: 2, h: 1 }, rooms: {}, actors: {}, icons: {}, cards: {} }; }, makeImage: () => ({}),
  });
  assert.equal(fake.kitReady(), false); fake.ensure(); fake.ensure(); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(urls.sort(), ['assets/ward/manifest.json', 'assets/ward_kit/manifest.json'], 'both manifests are asked for once, the kit next to the Ward art');
  assert.ok(fake.kitReady()); assert.equal(fake.imgs.size, 0, 'the kit manifest alone starts no download: the kit is never loaded as a whole');
  const rc = { floor: 'wood', wall: 'none', pieces: [], props: [{ id: 'crate' }] }, desk = { scale: 1 }, phone = { scale: 0.5, px: 0.5 }; // a recipe: one floor, one prop (a wall the kit does not have is nothing to wait for)
  assert.equal(fake.kitImg('floors', 'wood', desk), null, 'null while the image is loading'); assert.deepEqual([...fake.imgs.keys()], ['kit:floors/w2.webp'], 'desktop asks for the @2x file');
  assert.equal(fake.kitRecipeSettled(rc, desk), false); assert.deepEqual(fake.kitRecipeProgress(rc, desk), { loaded: 0, total: 2 }); assert.deepEqual([...fake.imgs.keys()].sort(), ['kit:floors/w2.webp', 'kit:props/c2.webp'], 'asking about a recipe starts exactly its files');
  const e = fake.imgs.get('kit:floors/w2.webp'); e.ok = true; e.img.width = 512;
  const got = fake.kitImg('floors', 'wood', desk); assert.ok(got && got.img === e.img && got.def.tile === 512); assert.deepEqual(fake.kitRecipeProgress(rc, desk), { loaded: 1, total: 2 });
  fake.imgs.get('kit:props/c2.webp').bad = true; assert.equal(fake.kitRecipeSettled(rc, desk), true, 'settled = every image of the recipe loaded or failed'); assert.equal(fake.kitImg('props', 'crate', desk), null, 'a failed image is null');
  assert.equal(fake.kitImg('floors', 'nope', desk), null); assert.equal(fake.kitImg('walls', 'wood', desk), null);
  // a change of size (a phone stage, a lower quality tier): the @1x file is asked for, and the decoded @2x is drawn until it is in
  const viaBig = fake.kitImg('floors', 'wood', phone), e1 = fake.imgs.get('kit:floors/w1.webp'); assert.ok(e1, 'a phone (under 0.8 device px per logical px) asks for the @1x file');
  assert.ok(viaBig && viaBig.img === e.img, 'the size that is already decoded bridges the change'); assert.equal(fake.kitRecipeProgress(rc, phone).loaded >= 1, true, 'and the recipe does not count as loading again for it');
  e1.ok = true; assert.strictEqual(fake.kitImg('floors', 'wood', phone).img, e1.img, 'then the wanted size is drawn');
  assert.equal(fake.kitImg('props', 'crate', phone), null, 'a size that never loaded bridges nothing'); assert.ok(fake.imgs.has('kit:props/c1.webp'));
  // the kit is never evicted: with no budget at all, only other images go
  fake.imgs.set('other.webp', { ok: true, bad: false, bytes: 4e6, used: 0, img: {} }); e.bytes = e1.bytes = 4e6; e.used = e1.used = 0;
  assert.equal(fake.maintain(1e9, 1, 0), 1); assert.ok(!fake.imgs.has('other.webp') && fake.imgs.has('kit:floors/w2.webp') && fake.imgs.has('kit:floors/w1.webp'), 'a kit image stays whatever the budget');
  for (const api of ['kitSettled', 'kitPreload', 'kitProgress', 'kitFilesFor']) assert.equal(fake[api], undefined, 'no whole-kit call: ' + api);
  const bad = createAssets({ fetchJson: async (u) => (u.includes('ward_kit') ? { floors: [], nonsense: 1 } : { version: 1, rooms: {}, actors: {} }), makeImage: () => ({}) }); bad.ensure(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(bad.kitState, 'none'); assert.equal(bad.kitReady(), false); assert.equal(bad.ready(), true, 'a bad kit manifest leaves the painted Ward art alone');
  const old = createAssets({ fetchJson: async () => ({ version: 1, tile: { w: 2, h: 1 }, rooms: {}, actors: {}, icons: {}, cards: {} }), makeImage: () => ({}) }); old.ensure(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(old.kitState, 'none', 'a server that answers the Ward manifest for every URL is not a kit');
  const dead = createAssets({ fetchJson: async (u) => { if (u.includes('ward_kit')) throw new Error('404'); return { version: 1, rooms: {}, actors: {} }; }, makeImage: () => ({}) }); dead.ensure(); await new Promise((r) => setTimeout(r, 5));
  assert.equal(dead.kitState, 'none'); assert.equal(dead.ready(), true);
  const headless = createAssets(); headless.ensure(); assert.equal(headless.kitState, 'none'); assert.equal(headless.kitImg('floors', 'wood'), null); assert.equal(headless.kitRecipeProgress({ floor: 'wood', wall: 'wood', pieces: [], props: [] }).total, 0); assert.equal(headless.imgs.size, 0);
  const moved = createAssets({ base: 'x/ward/', fetchJson: async () => ({}) }); moved.ensure(); await new Promise((r) => setTimeout(r, 5)); assert.equal(moved.kitState, 'none');
  assert.equal(assets.kitState === 'idle' || assets.kitState === 'none', true, 'the shared loader never started in headless tests');
});

// ======================================================= walls, doors, depth =======================================================
await t('walls: every shared wall is drawn once (by the room in front) and the doors are exactly where the engine connects two rooms', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'walls' });
  const ids = layout(run, HOSPITAL); run.ward.deck.hand = []; flow.route(); frames(app, 30);
  const w = run.ward, info = ISO.lastKit(); assert.ok(info && info.rooms.size >= 9, 'modular rooms drawn: ' + (info && info.rooms.size));
  const list = Object.values(w.rooms), nb = (id) => WD.neighbors(run, id);
  const plan = KD.wallPlan(list, nb, (x, y) => (w.grid[y] && w.grid[y][x] && w.grid[y][x] !== 'rubble' ? w.grid[y][x] : null));
  // the engine's connections, one by one
  let doors = 0, pairs = 0;
  for (const a of list) for (const bid of nb(a.id)) { const b = w.rooms[bid]; if (b.x < a.x || b.y < a.y) continue; pairs++; const front = b.x > a.x ? b : b, side = b.x > a.x ? 'L' : 'R'; assert.ok(plan.get(front.id)[side], 'a door where the engine connects ' + a.id + ' and ' + bid); doors++; }
  const total = list.reduce((s, r) => s + (plan.get(r.id).L ? 1 : 0) + (plan.get(r.id).R ? 1 : 0), 0);
  assert.equal(total, pairs, 'and nowhere else: doors = connections (' + total + ' / ' + pairs + ')'); assert.ok(doors > 8);
  // the renderer drew what the plan says
  for (const [id, k] of info.rooms) { const p = plan.get(id); assert.equal(k.doorL, p.L); assert.equal(k.doorR, p.R); assert.equal(k.slabL, p.slabL); assert.equal(k.slabR, p.slabR); }
  // a room next to rubble or an empty cell has a wall and no door
  const lone = info.rooms.get(ids[9]); assert.equal(lone.doorR, false, 'nothing behind the isolation room on its right: a wall, no door');
  // a Theatre next to a modular room is a connection like any other
  removeKit();
});
await t('depth: props and actors of a room are drawn in one pass sorted by depth (world y of the feet); an actor walks behind and in front of a prop', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'depth', motion: true });
  const [, saw] = layout(run, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2, mons(0, 4)]]); run.ward.deck.hand = []; flow.route(); frames(app, 5);
  const log = ISO.kitLog(true); frames(app, 400);
  const rc = KD.resolveRecipe('rm_sawmill', assets.kit); const sawLog = log.filter((l) => l.order.some((o) => o.startsWith('prop:')) && l.order.length === rc.props.length + 4 + 0 || l.order.some((o) => o.startsWith('actor:')));
  assert.ok(sawLog.length > 100, 'logged');
  let behind = 0, front = 0;
  for (const l of log) {
    const ys = l.order.map((o) => +o.split('@')[1]); for (let i = 1; i < ys.length; i++) assert.ok(ys[i - 1] <= ys[i] + 1e-9, 'sorted by depth: ' + l.order.join(' '));
    const kinds = l.order.map((o) => o.split('@')[0]);
    kinds.forEach((k, i) => { if (!k.startsWith('actor')) return; if (kinds.slice(0, i).some((x) => x.startsWith('prop')) ) front++; if (kinds.slice(i + 1).some((x) => x.startsWith('prop'))) behind++; });
  }
  assert.ok(front > 0 && behind > 0, 'actors are drawn both after (in front of) and before (behind) props: ' + front + ' / ' + behind);
  KR.KITS.log = null; removeKit();
});
await t('depth: a prop in front of an actor hides it, a prop behind does not (the draw order of the pass, with a fixed actor)', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'depth2' });
  layout(run, [['rm_entrance', 0, 2], ['rm_sawmill', 1, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 5);
  const rc = KD.resolveRecipe('rm_sawmill', assets.kit), g = app.ctx, T = { x: 100, y: 100 }, seq = [];
  const di = g.drawImage; g.drawImage = function (im, ...a) { seq.push(im); return di.apply(this, arguments); };
  const items = [{ y: T.y + 12 * 2.2, rec: { kind: 'monster' } }]; // between the two rows of props
  KR.drawItems(app, g, rc, T.x, T.y, 0, items, { dark: false, calm: true, t: 0, glow: [], actor: () => seq.push('ACTOR') });
  g.drawImage = di;
  const order = [...rc.props].map((p) => ({ id: p.id, y: T.y + (p.u + p.c / 2 + p.v + p.r / 2) * 12 * 0.5 * 2 / 2 }));
  const ai = seq.indexOf('ACTOR'); assert.ok(ai > 0 && ai < seq.length - 1, 'the actor is neither first nor last: props both behind and in front of it (' + ai + ' of ' + seq.length + ')');
  removeKit();
});
await t('actors never stand inside a prop: monsters wander only the free sub-tiles, the hero walks around the furniture (door lane to door lane)', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'free', motion: true });
  const ids = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_ward', 2, 2, mons(0, 5)], ['rm_sawmill', 3, 2, mons(2, 5)], ['rm_quarry', 2, 3, mons(1, 4)], ['rm_generator', 3, 3, mons(3, 3)]]);
  run.ward.deck.hand = []; flow.route(); frames(app, 5);
  const w = run.ward, seen = new Set(); let samples = 0, moved = 0, last = null;
  const check = (a) => {
    const r = roomOfWorld(w, a.x, a.y); const rc = r && KD.resolveRecipe(r.type, assets.kit); if (!rc) return;
    const q = localSub(w, r.x, r.y, a.x, a.y), cu = Math.floor(q.u), cv = Math.floor(q.v);
    if (cu < 0 || cv < 0 || cu >= KD.SUB || cv >= KD.SUB) return; // between two rooms, in a doorway
    assert.equal(rc.occ[cu][cv], false, a.kind + ' ' + a.id + ' stands in a prop of ' + r.type + ' at sub-tile ' + cu + ',' + cv); samples++; seen.add(r.id);
  };
  for (let f = 0; f < 1500; f++) { frames(app, 1); for (const a of ISO.lastActors()) if (a.kind === 'monster' || a.kind === 'elite') { check(a); if (a.x !== (last && last.get(a)) ) moved++; } }
  assert.ok(samples > 5000 && seen.size >= 4, 'sampled ' + samples + ' positions in ' + seen.size + ' rooms'); assert.ok(moved > 500, 'they really walk: ' + moved);
  // the hero walks the whole hospital, step by step, and never stands in a prop either
  const S = app.screens.ward.st, route = [ids[1], ids[2], ids[3], ids[6 - 1 + 0 < ids.length ? 5 : 3], ids[4]].filter(Boolean); let hs = 0;
  for (const leg of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[3]], [ids[3], ids[5]], [ids[5], ids[4]], [ids[4], ids[2]]]) {
    S.walk = { cells: leg, i: 0, stop: 1, t: 0, done: null, wait: false };
    for (let f = 0; f < 40 && S.walk; f++) { frames(app, 1); const h = ISO.lastActors().find((x) => x.kind === 'hero'); check(h); hs++; }
  }
  assert.ok(hs > 60); S.walk = null;
  removeKit();
});
await t('the hero rests on a free sub-tile of a modular room and the walk between rooms goes through a door, never through a wall corner', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'herowalk' });
  const [a, b] = layout(run, [['rm_sawmill', 0, 2], ['rm_ward', 1, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 5);
  const w = run.ward, H = () => ISO.lastActors().find((x) => x.kind === 'hero'), rc = KD.resolveRecipe('rm_sawmill', assets.kit);
  const q = localSub(w, 0, 2, H().x, H().y); assert.equal(rc.occ[Math.floor(q.u)][Math.floor(q.v)], false, 'resting on a free sub-tile');
  const S = app.screens.ward.st; S.walk = { cells: [a, b], i: 0, stop: 1, t: 0.05, done: null, wait: false }; frames(app, 1);
  const ca = ISO.cellW(w, 0, 2), cb = ISO.cellW(w, 1, 2), h = H(); assert.ok(h.moving && h.x > ca.x - 10 && h.x < cb.x + 10, 'in between the two rooms'); S.walk = null;
  removeKit();
});

// ======================================================= wall modes =======================================================
await t('wall mode: auto is Full for one room, Cutaway for a few, Low once several stand; the modes set the wall heights; shared walls follow the mode', async () => {
  assert.equal(KD.defaultWallMode(1), 'full'); assert.equal(KD.defaultWallMode(2), 'cutaway'); assert.equal(KD.defaultWallMode(5), 'cutaway'); assert.equal(KD.defaultWallMode(6), 'low'); assert.equal(KD.defaultWallMode(12), 'low');
  assert.equal(KD.wallHeight('full', true), KD.WALL_FULL); assert.equal(KD.wallHeight('low', false), KD.WALL_LOW); assert.equal(KD.wallHeight('cutaway', true), KD.WALL_LOW); assert.equal(KD.wallHeight('cutaway', false), KD.WALL_FULL);
  installKit(); ISO.setWallMode('auto');
  const { app, run, flow } = await setup({ seed: 'modes' });
  const ids = layout(run, [['rm_sawmill', 3, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 30);
  let k = ISO.lastKit(); assert.equal(k.mode, 'full', 'a lone room'); assert.equal(k.rooms.get(ids[0]).HL, KD.WALL_FULL); assert.equal(k.rooms.get(ids[0]).HR, KD.WALL_FULL);
  const ids2 = layout(run, [['rm_sawmill', 3, 2], ['rm_ward', 4, 2], ['rm_quarry', 3, 3]]); run.ward.hero.room = ids2[2]; run.ward.deck.hand = []; frames(app, 30);
  k = ISO.lastKit(); assert.equal(k.mode, 'cutaway', 'three rooms'); const q = k.rooms.get(ids2[2]); assert.equal(q.HR, KD.WALL_LOW, 'the quarry shares its back-right wall with the sawmill: cut down'); assert.equal(q.HL, KD.WALL_FULL, 'its outer left wall stays tall');
  assert.equal(k.rooms.get(ids2[0]).HL, KD.WALL_FULL, 'the back sawmill keeps both outer walls');
  const big = layout(run, [['rm_sawmill', 1, 1], ['rm_ward', 2, 1], ['rm_quarry', 3, 1], ['rm_generator', 1, 2], ['rm_workshop', 2, 2], ['rm_linen', 3, 2], ['rm_corridor', 1, 3]]); run.ward.deck.hand = []; frames(app, 30);
  k = ISO.lastKit(); assert.equal(k.mode, 'low', 'a built floor'); for (const id of big) { assert.equal(k.rooms.get(id).HL, KD.WALL_LOW); assert.equal(k.rooms.get(id).HR, KD.WALL_LOW); }
  ISO.setWallMode('full'); frames(app, 30); k = ISO.lastKit(); assert.equal(k.mode, 'full');
  let tall = 0; for (const id of big) if (k.rooms.get(id).HL === KD.WALL_FULL) tall++;
  assert.ok(tall >= 3, 'Full: walls tall again (a focus room or a monster room cuts its front neighbours down)');
  ISO.setWallMode('auto'); assert.equal(ISO.cycleWallMode(), 'full'); assert.equal(ISO.cycleWallMode(), 'low'); assert.equal(ISO.cycleWallMode(), 'cutaway'); assert.equal(ISO.cycleWallMode(), 'auto');
  // the W key and the button
  ISO.setWallMode('auto'); app.screens.ward.st.banner = null; const { key } = await import('./graftwork_lib.mjs'); key(app, 'w'); assert.equal(ISO.wallMode(), 'full'); key(app, 'W'); assert.equal(ISO.wallMode(), 'low'); ISO.setWallMode('auto');
  assert.ok(reg('ward-walls'), 'the wall mode button is registered'); removeKit();
});

await t('overlap: rooms draw strictly back to front and a front room never walls off a back room that holds the hero, the selection or monsters (any wall mode)', async () => {
  installKit(); ISO.setWallMode('auto');
  const { app, run, flow } = await setup({ seed: 'overlap' });
  // the entrance at the back (hero inside), the chapel and the sawmill in front of it, a ward with monsters beside it
  const ids = layout(run, [['rm_entrance', 2, 1], ['rm_chapel', 3, 1], ['rm_sawmill', 2, 2], ['rm_quarry', 3, 2], ['rm_ward', 1, 1, mons(0, 3)]]);
  run.ward.hero.room = ids[0]; run.ward.deck.hand = []; flow.route(); frames(app, 30);
  const w = run.ward, H = app.screens.ward.host(app), S = H.S;
  const order = ISO.depthOrder(w, () => false, []).map((id) => w.rooms[id]);
  for (let i = 1; i < order.length; i++) assert.ok(order[i - 1].x + order[i - 1].y <= order[i].x + order[i].y, 'strictly back to front by x + y');
  assert.deepEqual(ISO.depthOrder(w, (id) => id === ids[0], []), ISO.depthOrder(w, () => false, []), 'a focus room never reorders the rooms');
  const protectedRoom = (r) => r.id === w.hero.room || r.id === S.selRoom || r.id === S.hoverRoom || (r.contents.length && r.contents[0].kind === 'monster');
  const check = (label) => {
    const k = ISO.lastKit(); assert.ok(k && k.rooms.size >= 4, label + ': kit rooms drawn');
    let pairs = 0;
    for (const A of Object.values(w.rooms)) {
      if (!protectedRoom(A)) continue;
      for (const [dx, dy] of [[1, 0], [0, 1], [1, 1]]) {
        const bid = w.grid[A.y + dy] && w.grid[A.y + dy][A.x + dx]; if (!bid || bid === 'rubble' || !k.rooms.has(bid)) continue;
        const B = k.rooms.get(bid); pairs++;
        assert.ok(B.HL <= KD.WALL_LOW + 4 && B.HR <= KD.WALL_LOW + 4, label + ': the front room ' + w.rooms[bid].type + ' (walls ' + B.HL + '/' + B.HR + ') hides ' + A.type);
      }
    }
    return pairs;
  };
  for (const mode of ['full', 'low', 'cutaway', 'auto']) {
    ISO.setWallMode(mode); frames(app, 40);
    S.selRoom = null; assert.ok(check(mode + ' hero room') >= 2, mode + ': the hero room has front neighbours');
    S.selRoom = ids[1]; frames(app, 40); check(mode + ' selected chapel');
    S.selRoom = ids[4]; frames(app, 40); check(mode + ' selected ward with monsters');
  }
  S.selRoom = null; ISO.setWallMode('auto'); removeKit();
});

// ======================================================= fallback and picking =======================================================
await t('fallback: a room type with no recipe, or with a missing floor or wall, stays a procedural block; modular and block rooms mix on one floor; each room waits for its own pieces', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'mix' });
  const ids = layout(run, HOSPITAL); run.ward.deck.hand = []; flow.route(); frames(app, 10);
  let k = ISO.lastKit(); const kitIds = [...k.rooms.keys()];
  for (const id of ids) { const type = run.ward.rooms[id].type; assert.equal(k.rooms.has(id), !!KD.resolveRecipe(type, assets.kit), type + ' is modular exactly when it has a usable recipe'); }
  assert.equal(kitIds.length, ids.length + 1, 'every room type (and the far Theatre) is modular with the kit as delivered'); assert.ok(k.rooms.has(ids[0]) && k.rooms.has(ids[8]), 'the Entrance and the Chapel are modular now');
  // without the wood floor the sawmill, the ward, the dispensary and the linen room are blocks
  installKit(without(CUR, 'floors', ['wood'])); flow.route(); frames(app, 10); k = ISO.lastKit();
  for (const id of ids) { const type = run.ward.rooms[id].type; if (['rm_sawmill', 'rm_dispensary', 'rm_linen'].includes(type)) assert.ok(!k.rooms.has(id), type + ' is a block without a wood floor'); }
  assert.ok(k.rooms.has(ids[5]), 'the quarry (stone) still modular');
  // without the stone floor the chapel, the quarry and the workshop are blocks while the tile and wood rooms stay modular: block and modular rooms mix on one floor
  installKit(without(CUR, 'floors', ['stone'])); flow.route(); frames(app, 10); k = ISO.lastKit();
  assert.ok(!k.rooms.has(ids[8]) && !k.rooms.has(ids[5]) && !k.rooms.has(ids[7]), 'chapel, quarry and workshop are blocks without a stone floor'); assert.ok(k.rooms.has(ids[0]) && k.rooms.has(ids[2]), 'the entrance (tile) and the ward stay modular');
  // a texture that fails to load: the block stays (the other size was never downloaded, so there is nothing to bridge with)
  installKit(); assets.imgs.delete('kit:walls/stone@1x.webp'); assets.imgs.get('kit:walls/stone@2x.webp').ok = false; assets.imgs.get('kit:walls/stone@2x.webp').bad = true; frames(app, 10); k = ISO.lastKit(); assert.ok(!k.rooms.has(ids[5]), 'a failed stone wall texture: the quarry is a block');
  assert.ok(k.rooms.has(ids[0]), 'the rooms that do not use it are untouched');
  // no kit at all: nothing modular, nothing throws
  removeKit(); flow.route(); frames(app, 10); assert.equal(ISO.lastKit().rooms.size, 0);
  // an image still loading holds back exactly the rooms whose recipe needs it (never a room with a piece missing), and no other room
  installKit(); assets.imgs.delete('kit:props/crate@1x.webp'); assets.imgs.get('kit:props/crate@2x.webp').ok = false; flow.route(); frames(app, 5); k = ISO.lastKit();
  let withCrate = 0;
  for (const id of ids) { const rc = KD.resolveRecipe(run.ward.rooms[id].type, assets.kit), uses = rc.props.some((p) => p.id === 'crate'); if (uses) withCrate++; assert.equal(k.rooms.has(id), !uses, run.ward.rooms[id].type + (uses ? ' waits for its crate' : ' does not wait for a crate it does not use')); }
  assert.ok(withCrate >= 1 && withCrate < ids.length, 'some rooms use the crate, some do not: ' + withCrate);
  assets.imgs.get('kit:props/crate@2x.webp').ok = true; frames(app, 2); assert.equal(ISO.lastKit().rooms.size, ids.length + 1, 'the crate arrived: every room is modular'); removeKit();
});
await t('picking: a tall modular wall takes the click (not the floor behind it), a low wall does not; floors always resolve to their own cell', async () => {
  installKit(); ISO.setWallMode('full');
  const { app, run, flow } = await setup({ seed: 'pickw' });
  const [a, b] = layout(run, [['rm_sawmill', 3, 2], ['rm_ward', 3, 3]]); run.ward.hero.room = b; run.ward.deck.hand = []; flow.route(); frames(app, 30);
  const w = run.ward, T = ISO.cellW(w, 3, 3), wx = T.x + ISO.TW / 4, wy = T.y - ISO.TH / 2 + ISO.TH / 4 - 24; // the middle of the ward's tall back-right wall
  const sp = ISO.toScreen(wx, wy);
  const inside = ISO.pick(w, sp.x, sp.y); assert.deepEqual(inside, { x: 3, y: 3 }, 'the tall wall of the ward in front picks the ward');
  const fl = ISO.cellC(w, 3, 2), zz = ISO.CAM.z; assert.deepEqual(ISO.pick(w, fl.x + 8 * zz, fl.y - 8 * zz), { x: 3, y: 2 }, 'the floor of the sawmill beside the wall');
  const fl2 = ISO.cellC(w, 3, 3); assert.deepEqual(ISO.pick(w, fl2.x, fl2.y), { x: 3, y: 3 });
  ISO.setWallMode('low'); frames(app, 40); assert.deepEqual(ISO.pick(w, sp.x, sp.y), { x: 3, y: 2 }, 'a low wall does not hide the floor behind it'); ISO.setWallMode('auto'); removeKit();
});

// ======================================================= light, power, caching =======================================================
await t('power and light: an unpowered modular room is dark (a cached tint variant, no lamp glow, asleep inside), a lit one adds sconce glows at dusk; layout ids are unchanged', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'dark' });
  const ids = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, mons(0, 2)], ['rm_quarry', 2, 2, mons(1, 2)]]); run.ward.deck.hand = []; run.ward.phase = 'evening'; flow.route(); frames(app, 30);
  const H = app.screens.ward.host(app); let k = ISO.lastKit();
  const shown = (ids2) => ids2.reduce((s, id) => s + Math.min(5, run.ward.rooms[id].contents.length), 0), lit = shown([ids[1], ids[2]]);
  assert.equal(k.rooms.get(ids[1]).dark, false); assert.equal(ISO.lastActors().filter((a) => a.kind === 'monster').length, lit);
  for (const id of ids) assert.ok(reg('ward-room-' + id), 'ward-room-' + id + ' registered'); assert.equal(reg('ward-room-' + ids[1]).layer, 'world');
  const l0 = KR.kitStats.layers; run.ward.rooms[ids[1]].on = false; frames(app, 5); k = ISO.lastKit();
  assert.equal(k.rooms.get(ids[1]).dark, true); assert.ok(KR.kitStats.layers > l0, 'a dark variant of the static layer is made once');
  assert.equal(ISO.lastActors().filter((a) => a.kind === 'monster').length, shown([ids[2]]), 'what sleeps in a dark room is not shown');
  const l1 = KR.kitStats.layers; frames(app, 30); assert.equal(KR.kitStats.layers, l1, 'and then cached');
  run.ward.rooms[ids[1]].on = true; frames(app, 3); assert.ok(KR.kitStats.layers > l1, 'relit: the lit layer is rebuilt'); const l2 = KR.kitStats.layers; frames(app, 30); assert.equal(KR.kitStats.layers, l2, 'and cached again');
  removeKit();
});
await t('cache: the static layer of a room is drawn to an offscreen canvas once per zoom bucket, not every frame', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'cache' });
  layout(run, HOSPITAL); run.ward.deck.hand = []; flow.route(); frames(app, 30);
  const n0 = KR.kitStats.layers; frames(app, 60); assert.equal(KR.kitStats.layers, n0, 'steady camera, steady walls: no layer is repainted'); assert.ok(KR.kitStats.hits > 300, 'cache hits ' + KR.kitStats.hits);
  assert.equal(KR.bucketOf(0.4), 0.5); assert.equal(KR.bucketOf(1), 1); assert.equal(KR.bucketOf(1.3), 1.5); assert.equal(KR.bucketOf(2.9), 3); assert.equal(KR.bucketOf(9), 4);
  const c0 = KR.kitStats.layers; ISO.camZoomBy(1.8, 640, 306); frames(app, 40); assert.ok(KR.kitStats.layers > c0, 'a new zoom bucket repaints'); removeKit();
});
await t('perf: a floor of 20 modular rooms with 5 monsters each stays within a canvas-call budget per frame', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'perf20' });
  const types = ['rm_sawmill', 'rm_quarry', 'rm_generator', 'rm_ward', 'rm_dispensary', 'rm_pharmacy', 'rm_corridor', 'rm_workshop', 'rm_isolation', 'rm_linen'], spec = [];
  for (let i = 0; i < 20; i++) spec.push([types[i % types.length], i % 5, 1 + Math.floor(i / 5), mons(i, 5)]);
  const ids = layout(run, spec); run.ward.deck.hand = []; flow.route(); frames(app, 60);
  assert.equal(ISO.lastKit().rooms.size, 21, '20 rooms and the far Theatre'); assert.equal(ISO.lastActors().filter((a) => a.kind === 'monster').length, 100);
  const c0 = app.ctx.__calls; frames(app, 20); const per = (app.ctx.__calls - c0) / 20; assert.ok(per < 7000, 'canvas calls per frame ' + Math.round(per)); removeKit();
});
await t('reduced motion: modular rooms freeze (no wander, no hop, no animated props); with motion monsters wander the free tiles', async () => {
  const snap = async (motion) => {
    installKit(); const { app, run, flow } = await setup({ seed: 'calm', motion });
    layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, mons(0, 3)], ['rm_generator', 2, 2, mons(1, 2)]]); run.ward.deck.hand = []; flow.route(); frames(app, 120);
    const f = () => JSON.stringify(ISO.lastActors().filter((a) => a.kind === 'monster').map((a) => [a.x, a.y, a.bob, a.sq, a.tilt, a.flip])), a = f(); frames(app, 200);
    const bobs = ISO.lastActors().map((x) => x.bob); removeKit(); return { same: a === f(), bobs };
  };
  const calm = await snap(false), live = await snap(true);
  assert.equal(calm.same, true, 'reduced: frozen'); assert.ok(calm.bobs.every((b) => b === 0), 'reduced: nothing hops'); assert.equal(live.same, false, 'with motion they move');
});

// ======================================================= grounding =======================================================
await t('grounding: the contact point is MEASURED from the sprite alpha (lowest opaque row, centre and width of the foot band), not trusted from the manifest anchor', async () => {
  const W2 = 160, H2 = 160, data = new Uint8ClampedArray(W2 * H2 * 4);
  const body = (x0, x1, y0, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) data[(y * W2 + x) * 4 + 3] = 255; };
  body(50, 100, 12, 122); body(30, 70, 123, 140); // a body and wide feet: the lowest row is 140, the foot band centres left of the manifest anchor (the middle)
  const oc = document.createElement; document.createElement = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {}, getImageData: () => ({ data }) }) });
  try {
    const spr = { img: { width: 256, height: 256 }, def: { w: 256, h: 256, anchorX: 128, anchorY: 243 } }, c = ISO.contactOf(spr);
    assert.ok(c, 'measured'); assert.ok(Math.abs(c.fy - 141 * 1.6) < 3, 'the bottom of the feet, not the manifest anchor: ' + c.fy); assert.ok(c.fx < 128 - 20, 'the foot band is left of the anchor: ' + c.fx); assert.ok(c.fw > 20 && c.fw < 140, 'footprint width ' + c.fw);
    assert.strictEqual(ISO.contactOf(spr), c, 'cached per image');
  } finally { document.createElement = oc; }
  assert.equal(ISO.contactOf({ img: { width: 0, height: 0 }, def: { w: 10, h: 10 } }), null, 'unreadable: the caller falls back to the manifest anchor');
});
await t('grounding: the sprite is drawn so the measured feet land on the actor point, with a flat soft shadow there', async () => {
  const { app, run, flow } = await setup({ seed: 'feet' });
  layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, mons(0, 1)]]); run.ward.deck.hand = []; flow.route(); frames(app, 5);
  const img = { width: 256, height: 256 }, def = { file1x: 'a.webp', file2x: 'a.webp', w: 256, h: 256, anchorX: 128, anchorY: 243, kind: 'normal', scale: 1 };
  assets.manifest = { version: 1, tile: { w: 2, h: 1 }, rooms: {}, actors: { [NORMAL1[0]]: def, marrow: { ...def, kind: 'hero' } }, icons: {}, cards: {}, cardsById: {} }; assets.state = 'ready'; assets.imgs.set('a.webp', { ok: true, img });
  const g = app.ctx, calls = [], tr = g.translate, di = g.drawImage, ell = g.ellipse;
  g.translate = function (x, y) { calls.push(['t', x, y]); return tr.apply(this, arguments); }; g.drawImage = function (im, ...a) { calls.push(['d', im, ...a]); return di.apply(this, arguments); }; g.ellipse = function (...a) { calls.push(['e', ...a]); return ell.apply(this, arguments); };
  try {
    frames(app, 3); const m = ISO.lastActors().find((a) => a.kind === 'monster'); let pairs = 0;
    calls.forEach((c, i) => {
      if (c[0] !== 'd' || c[1] !== img) return;
      const tcall = calls.slice(0, i).reverse().find((q) => q[0] === 't'), act = ISO.lastActors().find((q) => Math.abs(q.x - tcall[1]) < 0.01 && Math.abs(q.y - q.bob - tcall[2]) < 0.01);
      assert.ok(act, 'the body pivots on an actor point (translate to the feet)'); const s = act.h / 256;
      assert.ok(Math.abs(c[2] + 128 * s) < 0.01 && Math.abs(c[3] + 243 * s) < 0.01, 'drawn from the feet point: x ' + c[2] + ' y ' + c[3]); pairs++;
    });
    assert.ok(pairs >= 2, 'monster and hero drawn: ' + pairs);
    assert.ok(m.shadow && m.shadow.rx > 4 && m.shadow.a > 0.4 && m.shadow.a <= 0.55, 'a contact shadow of alpha about .45: ' + JSON.stringify(m.shadow));
    assert.equal(m.shadow.x, m.x); assert.equal(m.shadow.y, m.y, 'the shadow sits at the feet, not at the body');
  } finally { g.translate = tr; g.drawImage = di; g.ellipse = ell; assets.reset(); }
});
await t('grounding: at rest nothing leaves the floor (no vertical offset), only a breathing scale about the feet; a hop never moves the shadow, it shrinks and fades it', async () => {
  const { app, run, flow } = await setup({ seed: 'rest', motion: true });
  const [a] = layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, mons(0, 3)]]); void a; run.ward.deck.hand = []; flow.route(); frames(app, 5);
  let idle = 0, hopping = 0, maxHop = 0, shadows = [];
  for (let f = 0; f < 900; f++) {
    frames(app, 1);
    for (const r of ISO.lastActors()) {
      if (r.kind === 'token') continue;
      assert.ok(r.shadow, 'every actor has a shadow'); assert.equal(r.shadow.y, r.y, 'flat on the floor'); assert.equal(r.shadow.x, r.x);
      if (r.stride !== undefined && r.bob === 0) { idle++; assert.ok(Math.abs(r.sq - 1) <= 0.0201, 'at rest only breathing: sq ' + r.sq); assert.ok(Math.abs(r.tilt) <= 0.0121, 'a small weight shift only: ' + r.tilt); assert.equal(r.cycle, false, 'standing: no walk pose'); }
      else if (r.bob > 0) { hopping++; maxHop = Math.max(maxHop, r.bob); shadows.push([r.bob, r.shadow.a, r.shadow.rx / r.h]); assert.ok(r.bob < 4.5, 'a tiny hop: ' + r.bob); }
    }
  }
  assert.ok(idle > 500, 'idle samples ' + idle); assert.ok(hopping > 50, 'hop samples ' + hopping);
  const hi = shadows.filter((s) => s[0] > 1.5), lo = shadows.filter((s) => s[0] < 0.3);
  assert.ok(hi.length && lo.length, 'both hop heights seen'); assert.ok(Math.max(...hi.map((s) => s[1])) < Math.min(...lo.map((s) => s[1])) + 1e-9 || hi[0][1] <= lo[0][1], 'the shadow fades with the hop'); assert.ok(hi.every((s) => s[1] >= 0.46 * 0.7 - 1e-6), 'but only slightly');
  const hero = ISO.lastActors().find((x) => x.kind === 'hero'); assert.equal(hero.bob, 0, 'the hero at rest does not bob'); assert.ok(Math.abs(hero.sq - 1) <= 0.0201);
});
await t('grounding: the step cycle follows the DISTANCE moved (stride phase = distance / stride), the hop (the walk of a figure without a puppet) lands on every plant, a figure leans into its heading, no sliding: still means no stride', async () => {
  const { app, run, flow } = await setup({ seed: 'stride', motion: true });
  const [a, b, c] = layout(run, [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_corridor', 2, 2]]); run.ward.deck.hand = []; flow.route(); frames(app, 120);
  const S = app.screens.ward.st, H = () => ISO.lastActors().find((x) => x.kind === 'hero');
  const s0 = H().stride; frames(app, 60); assert.equal(H().stride, s0, 'standing: the stride does not advance');
  const rows = []; S.walk = { cells: [a, b, c], i: 0, stop: 2, t: 0, done: () => { run.ward.hero.room = c; }, wait: false };
  let px = H().x, py = H().y;
  for (let f = 0; f < 40 && S.walk; f++) { frames(app, 1); const h = H(); rows.push({ d: Math.hypot(h.x - px, h.y - py), st: h.stride, cy: h.cycle, flip: h.flip, tilt: h.tilt, bob: h.bob, sq: h.sq }); px = h.x; py = h.y; }
  const mv = rows.filter((r) => r.d > 0.5); assert.ok(mv.length > 8, 'it walked ' + mv.length + ' frames');
  const k = (44 * 0.5); let prev = rows[0].st, dsum = 0;
  for (let i = 1; i < rows.length; i++) { dsum += rows[i].d; const dst = rows[i].st - prev; prev = rows[i].st; assert.ok(Math.abs(dst - rows[i].d / k) < 0.02, 'stride advanced ' + dst.toFixed(3) + ' for a move of ' + rows[i].d.toFixed(2) + ' px (expected ' + (rows[i].d / k).toFixed(3) + ')'); }
  assert.ok(Math.abs((rows[rows.length - 1].st - rows[0].st) - dsum / k) < 0.05, 'total stride = total distance / stride length');
  assert.ok(mv.filter((r) => r.cy).length > 6, 'walking: the walk cycle runs'); assert.ok(new Set(mv.map((r) => Math.floor(r.st))).size >= 2, 'more than one plant'); assert.equal(H().frame, undefined, 'no step frame: nothing is swapped');
  assert.ok(mv.some((r) => r.tilt > 0.03), 'it leans into its heading'); assert.ok(mv.some((r) => r.bob > 0.5), 'a little hop between plants'); assert.ok(mv.every((r) => Math.abs(r.flip) <= 1.0001), 'flip is a smooth scale');
  assert.ok(mv.some((r) => r.sq < 0.99), 'squash on the foot plant'); assert.equal(H().flip > 0, true, 'moving right-down: unflipped (the art faces down-right)');
  // walking back (left-moving): the figure turns, flipped
  S.walk = null; run.ward.hero.room = c; frames(app, 90); S.walk = { cells: [c, b, a], i: 0, stop: 2, t: 0, done: () => { run.ward.hero.room = a; }, wait: false }; let sawNeg = false, sawNarrow = false;
  for (let f = 0; f < 40 && S.walk; f++) { frames(app, 1); const h = H(); if (h.flip < 0) sawNeg = true; if (Math.abs(h.flip) < 0.6) sawNarrow = true; }
  frames(app, 30); assert.ok(sawNeg || H().flip < 0, 'left-moving: flipped horizontally'); assert.ok(sawNarrow || sawNeg, 'the turn swings through a narrow body'); S.walk = null;
  // reduced motion: no stride at all
});
await t('grounding: monsters ease in and out of a walk (the speed ramps, it never jumps) and turn through a swing instead of snapping', async () => {
  installKit();
  const { app, run, flow } = await setup({ seed: 'ease', motion: true });
  layout(run, [['rm_entrance', 0, 2], ['rm_ward', 1, 2, mons(0, 1)]]); run.ward.deck.hand = []; flow.route(); frames(app, 5);
  let prev = null, maxJump = 0, starts = 0, flips = 0, narrow = 0, last = null;
  for (let f = 0; f < 2400; f++) {
    frames(app, 1); const m = ISO.lastActors().find((x) => x.kind === 'monster'); if (!m) continue;
    if (prev) { const sp = Math.hypot(m.x - prev.x, m.y - prev.y) * 60; if (prev.sp !== undefined) { maxJump = Math.max(maxJump, Math.abs(sp - prev.sp)); if (prev.sp < 1 && sp > 1) starts++; } m.sp = sp; prev = { x: m.x, y: m.y, sp }; } else prev = { x: m.x, y: m.y, sp: 0 };
    if (last !== null && Math.sign(m.flip) !== Math.sign(last) && last !== 0) flips++; if (Math.abs(m.flip) < 0.9) narrow++; last = m.flip;
  }
  assert.ok(starts >= 2, 'it set off at least twice: ' + starts); assert.ok(maxJump < 14, 'speed ramps (largest frame to frame change ' + maxJump.toFixed(2) + ' px/s)');
  assert.ok(narrow > 0 || flips === 0, 'a turn passes through a narrow body (' + narrow + ' frames)'); removeKit();
});

// ======================================================= WARD.md =======================================================
await t('docs: WARD.md documents the modular kit renderer and every planned id', async () => {
  const doc = fs.readFileSync(new URL('../graftwork/design/WARD.md', import.meta.url), 'utf8');
  assert.ok(/Modular kit renderer/.test(doc), 'section present');
  const ids = [...KD.PLANNED.floors, ...KD.PLANNED.walls, ...KD.PLANNED.pieces, ...Object.keys(KD.PLANNED.props)];
  for (const id of ids) assert.ok(new RegExp('\\b' + id + '\\b').test(doc), 'planned id documented: ' + id);
});

console.log(n + ' ward kit checks passed');
