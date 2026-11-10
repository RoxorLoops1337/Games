// Actor animation frames (design/WARD.md 12c): walk cycle on the Ward map, attack / hit / die frames in battle, and the fallback for every missing piece.
// Everything uses fake manifests and fake images (a frame is told apart by the tag of its image); no real art is needed.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import { ENEMIES } from '../graftwork/data/index.js';
import { assets, createAssets, normalizeFrames, walkIndex, pickAtkFrame } from '../graftwork/ui/assets.js';
import * as CA from '../graftwork/ui/combat_art.js';
const wardMod = await import('../graftwork/ui/ward.js');
const ward = wardMod.default;
const ISO = await import('../graftwork/ui/ward_iso.js');

let n = 0;
const ctx = (await makeApp({ run: RUN.newRun({ hero: 'marrow', seed: 'animc' }), audio: { sfx() {}, music() {} } })).ctx; // a fake canvas context for the direct battle draws
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const img = (tag) => ({ width: 256, height: 256, naturalWidth: 256, naturalHeight: 256, tag });
const stems = (id, ...names) => names.map((x) => `${id}_${x}`);
const W4 = ['walk1', 'walk2', 'walk3', 'walk4'];
// the manifest of one actor; fr = its frames entry (or undefined)
const actor = (kind, fr) => ({ file1x: 'a1.webp', file2x: 'a2.webp', w: 256, h: 256, anchorX: 128, anchorY: 243, kind, scale: 1, bbox: [40, 18, 216, 243], ...(fr ? { frames: fr } : {}) });
// install a manifest and decode the standing image ('stand:<id>') plus the listed frame stems ('<stem>')
function install(actors, decoded = 'all') {
  assets.reset();
  const man = { version: 1, tile: { w: 2, h: 1 }, rooms: {}, icons: {}, cards: {}, actors };
  assets.manifest = man; assets.state = 'ready';
  for (const [id, d] of Object.entries(actors)) {
    d.file1x = `${id}-s1.webp`; d.file2x = `${id}-s2.webp`; // one standing image per actor
    const std = img('stand:' + id); assets.imgs.set(d.file1x, { img: std, ok: true, bad: false }); assets.imgs.set(d.file2x, { img: std, ok: true, bad: false });
    const F = normalizeFrames(d.frames); if (!F) continue;
    for (const st of [...F.walk, ...F.atk, F.hit, F.die].filter(Boolean)) {
      if (decoded !== 'all' && !decoded.includes(st)) continue;
      const im = img(st); for (const s of ['1x', '2x', '3x']) assets.imgs.set(`actors/${st}@${s}.webp`, { img: im, ok: true, bad: false });
    }
  }
}
// records the tag of each sprite image drawn through a ctx
function tape(ctx) { const rec = []; const o = ctx.drawImage; ctx.drawImage = function (im, ...a) { if (im && im.tag) rec.push({ tag: im.tag, a }); return o && o.apply(this, a); }; return { rec, stop: () => { ctx.drawImage = o; } }; }
const HERO_FR = { walk: stems('marrow', ...W4), atk: stems('marrow', 'atk1', 'atk2', 'atk3'), hit: 'marrow_hit', die: 'marrow_die', hi3x: false };

// ---------------- pure helpers ----------------
await t('normalizeFrames_keeps_valid_stems_and_maps_atk_by_number', () => {
  const F = normalizeFrames({ walk: ['a_walk1', 'a_walk2', 7, ''], atk: ['a_atk2'], hit: 'a_hit', die: 5 });
  assert.deepEqual(F.walk, ['a_walk1', 'a_walk2']); assert.deepEqual(F.atkBy, { 2: 'a_atk2' }); assert.equal(F.hit, 'a_hit'); assert.equal(F.die, null);
  assert.equal(normalizeFrames(undefined), null); assert.equal(normalizeFrames({}), null); assert.equal(normalizeFrames({ walk: [], atk: [] }), null); assert.equal(normalizeFrames('x'), null);
});
await t('walkIndex_advances_by_half_steps_and_plants_walk1_at_every_even_contact', () => {
  assert.deepEqual([0, 0.49, 0.5, 0.99, 1, 1.5, 2, 2.5, 3.9, 4].map((p) => walkIndex(p, 4)), [0, 0, 1, 1, 2, 3, 0, 1, 3, 0]);
  assert.deepEqual([0, 0.9, 1, 1.9, 2].map((p) => walkIndex(p, 2)), [0, 0, 1, 1, 0], 'two frames swap at each plant like the old _b frame');
  assert.equal(walkIndex(-3, 4), 0); assert.equal(walkIndex(1, 1), 0, 'one frame is not a cycle');
});
await t('pickAtkFrame_maps_phases_and_degrades_with_missing_frames', () => {
  const all = { 1: 'a1', 2: 'a2', 3: 'a3' }, only2 = { 2: 'a2' };
  assert.equal(pickAtkFrame(all, 'tell'), 'a1'); assert.equal(pickAtkFrame(all, 'act'), 'a2'); assert.equal(pickAtkFrame(all, 'hold'), 'a2'); assert.equal(pickAtkFrame(all, 'rec', 0.9), 'a3'); assert.equal(pickAtkFrame(all, 'idle'), null);
  assert.equal(pickAtkFrame(only2, 'tell'), null, 'no anticipation frame: stand'); assert.equal(pickAtkFrame(only2, 'act'), 'a2'); assert.equal(pickAtkFrame(only2, 'rec', 0.1), 'a2', 'strike held at the start of the recovery');
  assert.equal(pickAtkFrame(only2, 'rec', 0.8), null, 'then back to standing'); assert.equal(pickAtkFrame({ 3: 'a3' }, 'act'), 'a3'); assert.equal(pickAtkFrame({}, 'act'), null); assert.equal(pickAtkFrame(undefined, 'act'), null);
});
await t('walkOk_false_drops_the_painted_walk_but_keeps_the_combat_frames', () => {
  const F = normalizeFrames({ walk: stems('odile', ...W4), walkOk: false, hit: 'odile_hit' });
  assert.deepEqual(F.walk, [], 'the painted cycle is ignored'); assert.equal(F.walkOk, false); assert.equal(F.hit, 'odile_hit');
  assert.equal(normalizeFrames({ walk: stems('odile', ...W4), walkOk: false }), null, 'a walk-only actor with walkOk false has no usable frames: the procedural walk and the standing figure stay');
  assert.equal(ISO.frameStemFor(F, { pose: '', cycle: true, stride: 1 }), null, 'moving: no painted frame is chosen');
  assert.deepEqual(normalizeFrames({ walk: stems('a', ...W4) }).walk.length, 4); assert.equal(normalizeFrames({ walk: stems('a', ...W4) }).walkOk, true, 'walkOk defaults to true');
});
await t('assets_frame_answers_decoded_frames_with_the_standing_def_and_null_otherwise', () => {
  install({ marrow: actor('hero', HERO_FR), orderly: actor('normal') });
  const f = assets.frame('marrow', 'marrow_atk2', null);
  assert.equal(f.img.tag, 'marrow_atk2'); assert.equal(f.def, assets.def('actors', 'marrow'), 'a frame is drawn with the standing def (same canvas, same feet)');
  assert.equal(assets.frame('orderly', 'orderly_atk2', null), null, 'an actor without frames'); assert.equal(assets.frame('nobody', 'x', null), null);
  assert.ok(assets.walkReady('marrow', null)); assert.ok(!assets.walkReady('orderly', null));
  install({ marrow: actor('hero', HERO_FR) }, ['marrow_walk1', 'marrow_walk2', 'marrow_walk3']);
  assert.ok(!assets.walkReady('marrow', null), 'one walk frame still decoding: the cycle does not start');
  assets.reset(); assert.equal(assets.frame('marrow', 'marrow_atk2', null), null, 'no manifest');
});
await t('assets_loader_requests_frame_files_by_stem_and_preloads_the_walk_cycle', async () => {
  const asked = [], A = createAssets({ fetchJson: async (u) => (u.endsWith('ward/manifest.json') ? { version: 1, tile: { w: 2, h: 1 }, rooms: { r: {} }, actors: { marrow: actor('hero', HERO_FR) }, icons: {}, cards: {} } : Promise.reject(new Error('no kit'))), makeImage: () => { const o = {}; Object.defineProperty(o, 'src', { set: (v) => { asked.push(v); o.onload && o.onload(); } }); return o; } });
  A.ensure(null); await new Promise((r) => setTimeout(r, 5)); A.preload(null);
  for (const w of W4) assert.ok(asked.some((u) => u.endsWith(`actors/marrow_${w}@2x.webp`)), 'walk frame ' + w + ' preloaded: ' + asked.join(' '));
  assert.ok(!asked.some((u) => u.includes('atk')), 'combat frames are loaded by the battle, not the map');
});

// ---------------- the Ward map ----------------
async function mapSetup(actors, o = {}) {
  wardMod.resetWardMem(); install(actors, o.decoded);
  const run = RUN.newRun({ hero: 'marrow', seed: o.seed || 'animw' });
  const meta = { settings: { reduceMotion: !!o.reduced, reducedMotion: !!o.reduced, tips: false, textScale: 100 }, tips: {}, seen: { cards: {}, grafts: {}, enemies: {}, relics: {}, statuses: {} } };
  const app = await makeApp({ run, meta, audio: { sfx() {}, music() {} } });
  app.ctx.measureText = (s) => ({ width: String(s).length * 8 });
  app.register('ward', ward); app.register('base', { draw() {} });
  app.shared.flow = { RUN, route() { app.go('ward', { run }); }, openDeck() {}, openSettings() {}, saveMeta() {}, hasSave: () => false };
  const w = run.ward; w.grid = Array.from({ length: w.h }, () => Array(w.w).fill(null)); w.rooms = {};
  const ids = [];
  for (const [i, [type, x, y]] of [['rm_entrance', 0, 2], ['rm_corridor', 1, 2], ['rm_corridor', 2, 2]].entries()) { const id = 'r' + (i + 1); w.rooms[id] = { id, type, x, y, on: true, level: 1, timers: { spawn: 3 }, contents: [], upgrades: [] }; w.grid[y][x] = id; ids.push(id); }
  w.nextRoom = 4; w.hero.room = ids[0]; WD.wardPower(run); run.ward.deck.hand = [];
  app.shared.flow.route(); frames(app, 60);
  return { app, run, ids, st: app.screens.ward.st };
}
const hero = () => ISO.lastActors().find((x) => x.kind === 'hero');
// walk the hero across the rooms and collect what was drawn each frame
function walkTape(ctx, st, ids, nFrames = 150) {
  const T = tape(ctx); st.walk = { cells: ids, i: 0, a: 0, stop: ids.length - 1, t: 0.05, done: null, wait: false };
  const used = [], moving = [];
  for (let i = 0; i < nFrames; i++) { frames(ctx.__app || null, 0); }
  return { T, used, moving };
}
async function runWalk(S, nFrames = 140) {
  const { app, ids, st } = S, T = tape(app.ctx), used = [], tags = [];
  st.walk = { cells: ids, i: 0, a: 0, stop: ids.length - 1, t: 0, done: null, wait: false };
  for (let i = 0; i < nFrames; i++) { const k = T.rec.length; frames(app, 1); const h = hero(); used.push(h.used); tags.push(T.rec.slice(k).map((r) => r.tag)); }
  T.stop(); return { used, tags, rec: T.rec };
}
await t('map_walk_cycle_plays_the_four_frames_in_order_while_the_hero_moves_and_stands_at_rest', async () => {
  const S = await mapSetup({ marrow: actor('hero', HERO_FR) }); S.app.shared.meta.settings.reduceMotion = S.app.shared.meta.settings.reducedMotion = false;
  assert.equal(hero().used, '', 'idle is the standing frame'); const idle = tape(S.app.ctx); frames(S.app, 3); idle.stop();
  assert.ok(idle.rec.some((r) => r.tag === 'stand:marrow') && !idle.rec.some((r) => r.tag.startsWith('marrow_')), 'at rest only the standing image');
  const { used } = await runWalk(S); const seq = used.filter(Boolean);
  assert.ok(seq.length > 20, 'frames were used while walking: ' + seq.length);
  const order = []; for (const u of seq) if (order[order.length - 1] !== u) order.push(u);
  assert.ok(order.length >= 5, 'the cycle advances: ' + order.join(','));
  for (let i = 1; i < order.length; i++) { const a = W4.indexOf(order[i - 1].slice(7)), b = W4.indexOf(order[i].slice(7)); assert.equal(b, (a + 1) % 4, `walk frames advance in order (${order[i - 1]} then ${order[i]})`); }
  assert.ok(seq.every((u) => W4.includes(u.slice(7))), 'only walk frames, no attack frames on the map');
});
await t('map_walk_frames_advance_with_distance_not_time_and_plant_walk1_at_the_contact', async () => {
  const S = await mapSetup({ marrow: actor('hero', HERO_FR) }); S.app.shared.meta.settings.reduceMotion = S.app.shared.meta.settings.reducedMotion = false;
  const { st, ids } = S; st.walk = { cells: ids, i: 0, a: 0, stop: ids.length - 1, t: 0, done: null, wait: false };
  let checked = 0;
  for (let i = 0; i < 160; i++) { frames(S.app, 1); const h = hero(); if (!h.used) continue; const want = ISO_walkIdx(h.stride); assert.equal(h.used, `marrow_walk${want + 1}`, 'the frame is a function of the stride phase ' + h.stride.toFixed(2)); checked++; if (h.stride - Math.floor(h.stride) < 0.02 && Math.floor(h.stride) % 2 === 0) assert.equal(h.used, 'marrow_walk1', 'contact of the first foot'); }
  assert.ok(checked > 20);
});
function ISO_walkIdx(ph) { return walkIndex(ph, 4); }
await t('map_all_frames_are_drawn_on_the_same_feet_so_the_figure_never_slides', async () => {
  const S = await mapSetup({ marrow: actor('hero', HERO_FR) }); S.app.shared.meta.settings.reduceMotion = S.app.shared.meta.settings.reducedMotion = false;
  const { rec } = await runWalk(S, 100); const sp = rec.filter((r) => r.tag === 'stand:marrow' || r.tag.startsWith('marrow_walk'));
  assert.ok(sp.some((r) => r.tag.startsWith('marrow_walk')) && sp.some((r) => r.tag === 'stand:marrow'));
  const rel = (r) => `${(r.a[1] / r.a[3]).toFixed(4)}|${(r.a[2] / r.a[3]).toFixed(4)}`; // offset of the feet in sprite units
  assert.equal(new Set(sp.map(rel)).size, 1, 'every frame sits on the standing frame feet point: ' + [...new Set(sp.map(rel))]);
});
await t('map_falls_back_to_the_old_step_frame_when_frames_are_missing_or_still_decoding', async () => {
  for (const [label, actors, dec] of [['no frames key', { marrow: actor('hero') }, 'all'], ['frames still decoding', { marrow: actor('hero', HERO_FR) }, ['marrow_walk1', 'marrow_walk2']], ['walk missing', { marrow: actor('hero', { atk: ['marrow_atk2'], hit: 'marrow_hit' }) }, 'all'], ['only two walk frames, one lost', { marrow: actor('hero', { walk: ['marrow_walk1', 'marrow_walk2'] }) }, ['marrow_walk1']]]) {
    const A = { ...actors }; A.marrow = { ...A.marrow, walk1x: 'b1.webp', walk2x: 'b2.webp' };
    const S = await mapSetup(A, { decoded: dec }); const b = img('step:marrow'); assets.imgs.set('b1.webp', { img: b, ok: true }); assets.imgs.set('b2.webp', { img: b, ok: true });
    S.app.shared.meta.settings.reduceMotion = S.app.shared.meta.settings.reducedMotion = false;
    const { used, rec } = await runWalk(S, 100);
    assert.ok(used.every((u) => !u), label + ': no frame stem used'); assert.ok(!rec.some((r) => r.tag.startsWith('marrow_')), label + ': no frame image drawn');
    assert.ok(rec.some((r) => r.tag === 'step:marrow') && rec.some((r) => r.tag === 'stand:marrow'), label + ': the old two frame walk is intact');
  }
});
await t('map_reduced_motion_and_a_missing_manifest_keep_the_figure_standing_or_procedural', async () => {
  const R = await mapSetup({ marrow: actor('hero', HERO_FR) }, { reduced: true }); const { used, rec } = await runWalk(R, 60);
  assert.ok(used.every((u) => !u) && !rec.some((r) => r.tag.startsWith('marrow_')), 'reduced motion: no cycle');
  assets.reset(); const bare = await mapSetup({}, {}); assets.reset(); frames(bare.app, 20); assert.ok(hero(), 'no art at all: the procedural hero is still drawn');
});
await t('map_pose_hit_and_die_use_their_frames_when_a_map_event_sets_them_and_ignore_them_otherwise', async () => {
  const S = await mapSetup({ marrow: actor('hero', HERO_FR) });
  const h = hero(); assert.equal(typeof ISO.frameStemFor, 'function');
  const F = assets.frames('marrow');
  assert.equal(ISO.frameStemFor(F, { pose: 'hit', cycle: true, stride: 1 }), 'marrow_hit', 'a hit pose beats the walk'); assert.equal(ISO.frameStemFor(F, { pose: 'die', cycle: false, stride: 0 }), 'marrow_die');
  assert.equal(ISO.frameStemFor(normalizeFrames({ walk: W4.map((w) => 'x_' + w) }), { pose: 'hit', cycle: false, stride: 0 }), null, 'no hit frame: nothing, the caller draws the standing figure');
  assert.equal(ISO.frameStemFor(null, { pose: 'die' }), null); assert.equal(ISO.frameStemFor(F, { pose: '', cycle: false, stride: 0 }), null);
  h.pose = 'die'; const T = tape(S.app.ctx); const rr = ISO.lastActors(); void rr; T.stop();
});

// ---------------- battle ----------------
const spriteWith = (id, fr, kind = 'hero', decoded = 'all', hi = false) => { CA.__resetHi(); install({ [id]: actor(kind, fr && { ...fr, hi3x: hi }) }, decoded); const sp = CA.spriteOf(id, null); assert.ok(sp, 'sprite for ' + id); return sp; };
const drawnHero = (sp, hs) => { const T = tape(ctx); CA.drawHeroSprite(ctx, sp, 300, 458, { t: 1, reduced: false, ...hs }); T.stop(); return T.rec.filter((r) => r.tag.startsWith('marrow') || r.tag.startsWith('stand')).map((r) => r.tag); };
await t('hero_attack_maps_anticipation_strike_recovery_onto_atk1_atk2_atk3', () => {
  const sp = spriteWith('marrow', HERO_FR);
  assert.deepEqual(drawnHero(sp, { attack: 0.2 }), ['marrow_atk1'], 'u 0.1: anticipation'); assert.deepEqual(drawnHero(sp, { attack: 0.6 }), ['marrow_atk2'], 'u 0.3: strike');
  assert.deepEqual(drawnHero(sp, { attack: 1.4 }), ['marrow_atk3'], 'u 0.7: recovery'); assert.deepEqual(drawnHero(sp, { attack: 0 }), ['stand:marrow'], 'idle is the standing frame');
  assert.deepEqual(drawnHero(sp, { attack: 0.2, hit: 1 }), ['marrow_atk1'], 'an attack in progress is not interrupted by a flinch');
});
await t('hero_hit_flinch_and_death_use_hit_then_die_frames_at_the_end_of_the_collapse', () => {
  const sp = spriteWith('marrow', HERO_FR);
  assert.deepEqual(drawnHero(sp, { hit: 0.8 }), ['marrow_hit']); assert.deepEqual(drawnHero(sp, { hit: 0.1 }), ['stand:marrow'], 'a faint flash does not flinch');
  assert.deepEqual(drawnHero(sp, { dying: 0.15 }), ['marrow_hit'], 'start of the collapse: the flinch'); assert.deepEqual(drawnHero(sp, { dying: 0.6 }), ['marrow_die'], 'end of the collapse: lying down');
  assert.deepEqual(drawnHero(sp, { dying: 1 }), ['marrow_die']);
  const rots = []; const o = ctx.rotate; ctx.rotate = (a) => { rots.push(a); }; drawnHero(sp, { dying: 0.9 }); assert.ok(rots.every((r) => r === 0) || rots.length === 0, 'the die frame is not rotated again'); ctx.rotate = o;
  const rotsPlain = []; ctx.rotate = (a) => { rotsPlain.push(a); }; drawnHero(spriteWith('marrow', undefined), { dying: 0.9 }); assert.ok(rotsPlain.some((r) => Math.abs(r) > 0.5), 'without a die frame the procedural topple still runs'); ctx.rotate = o;
});
await t('hero_missing_frames_fall_back_to_the_standing_figure_for_every_combination', () => {
  const cases = { 'no frames': undefined, 'only walk': { walk: stems('marrow', ...W4) }, 'only hit': { hit: 'marrow_hit' }, 'only die': { die: 'marrow_die' }, 'only atk2': { atk: ['marrow_atk2'] } };
  for (const [label, fr] of Object.entries(cases)) {
    const sp = spriteWith('marrow', fr);
    for (const hs of [{ attack: 0.2 }, { attack: 0.6 }, { attack: 1.4 }, { hit: 1 }, { dying: 0.15 }, { dying: 0.9 }, {}]) {
      const tags = drawnHero(sp, hs); assert.equal(tags.length, 1, label + ' ' + JSON.stringify(hs) + ' draws exactly one figure');
      const want = label === 'only atk2' && hs.attack === 0.6 ? 'marrow_atk2' : label === 'only hit' && (hs.hit === 1 || hs.dying === 0.15) ? 'marrow_hit' : label === 'only die' && hs.dying === 0.9 ? 'marrow_die' : 'stand:marrow';
      assert.equal(tags[0], want, label + ' ' + JSON.stringify(hs));
    }
  }
  const sp = spriteWith('marrow', HERO_FR, 'hero', ['marrow_atk1']); assert.deepEqual(drawnHero(sp, { attack: 0.6 }), ['stand:marrow'], 'listed but not decoded yet: standing');
  assert.deepEqual(drawnHero(sp, { attack: 0.2 }), ['marrow_atk1'], 'the decoded one is used');
});
const ENEMY_FR = { atk: ['orderly_atk2'], hit: 'orderly_hit', die: 'orderly_die', walk: stems('orderly', ...W4) };
const edOf = (o = {}) => ({ anim: { sq: 0 }, phase: 0, scale: 1, w: 150, h: 200, atk: { phase: 'idle', k: 0 }, atkT: -1, ...o });
const drawnEnemy = (sp, ed) => { const T = tape(ctx); CA.drawEnemySprite(ctx, sp, ENEMIES.orderly, ed, 900, 356, 1, { reduced: false }); T.stop(); return T.rec.filter((r) => r.tag.startsWith('orderly') || r.tag.startsWith('stand')).map((r) => r.tag); };
await t('monster_with_only_atk2_hit_die_uses_what_it_has_and_stands_otherwise', () => {
  const sp = spriteWith('orderly', ENEMY_FR, 'normal'), atk = (phase, k) => edOf({ atk: { phase, k }, atkT: 0.1, atkKind: 'attack' });
  assert.deepEqual(drawnEnemy(sp, edOf()), ['stand:orderly'], 'idle'); assert.deepEqual(drawnEnemy(sp, atk('tell', 1)), ['stand:orderly'], 'no atk1: the wind-up is the procedural pull back');
  assert.deepEqual(drawnEnemy(sp, atk('act', 0.5)), ['orderly_atk2']); assert.deepEqual(drawnEnemy(sp, atk('hold', 0.5)), ['orderly_atk2']);
  assert.deepEqual(drawnEnemy(sp, atk('rec', 0.1)), ['orderly_atk2']); assert.deepEqual(drawnEnemy(sp, atk('rec', 0.9)), ['stand:orderly']);
  assert.deepEqual(drawnEnemy(sp, edOf({ anim: { sq: 0, hit: 1 } })), ['orderly_hit']); assert.deepEqual(drawnEnemy(sp, edOf({ hurt: 0.5 })), ['orderly_hit']);
  assert.deepEqual(drawnEnemy(sp, edOf({ dying: 0.2 })), ['orderly_hit'], 'start of the collapse'); assert.deepEqual(drawnEnemy(sp, edOf({ dying: 0.7 })), ['orderly_die'], 'end of the collapse');
  assert.deepEqual(drawnEnemy(sp, edOf({ atkT: 0.2, atkKind: 'cast' })), ['stand:orderly'], 'a cast is not an attack frame');
});
await t('monster_pose_is_unchanged_without_frames_and_the_die_frame_is_not_squashed_flat', () => {
  const plain = spriteWith('orderly', undefined, 'normal'); const sy = [];
  const o = ctx.scale; /* only the figure's own scale, not the flat shadow's */ ctx.scale = (x, y) => { if (Math.abs(x) > 0.5 && y > 0.3) sy.push(y); }; drawnEnemy(plain, edOf({ dying: 0.5 })); const plainMin = Math.min(...sy); sy.length = 0;
  const sp = spriteWith('orderly', ENEMY_FR, 'normal'); drawnEnemy(sp, edOf({ dying: 0.5 })); const frameMin = Math.min(...sy); ctx.scale = o;
  assert.ok(plainMin < 0.7, 'procedural collapse squashes flat (' + plainMin + ')'); assert.ok(frameMin >= 0.99, 'the die frame is already lying down (' + frameMin + ')');
  for (const fr of [undefined, { walk: stems('orderly', ...W4) }, { hit: 'orderly_hit' }]) { const s2 = spriteWith('orderly', fr, 'normal'); assert.deepEqual(drawnEnemy(s2, edOf({ dying: 0.9 })), ['stand:orderly']); }
});
await t('battle_warm_requests_combat_frames_and_a_hi3x_flag_prefers_the_512_file', () => {
  const prevApp = assets.app; assets.app = { px: 2, perf: null }; // wantHi (combat_art.js) asks for the 512 file only when the screen has the pixels for it
  CA.__resetHi(); install({ marrow: actor('hero', { ...HERO_FR, hi3x: true }) });
  const big = img('big:marrow_atk2'); CA.__setHi('actors/marrow_atk2@3x.webp', big);
  const sp = CA.spriteOf('marrow', null); assert.equal(CA.frameImg(sp, 'marrow_atk2').tag, 'big:marrow_atk2', '@3x preferred when hi3x'); assert.equal(CA.frameImg(sp, 'marrow_hit').tag, 'marrow_hit', 'else the 2x file');
  assert.equal(CA.frameImg(sp, 'marrow_nope'), null); assert.equal(CA.frameImg(null, 'x'), null);
  const sp2 = spriteWith('marrow', HERO_FR); assert.equal(CA.frameImg(sp2, 'marrow_atk2').tag, 'marrow_atk2', 'without hi3x the 3x file is never asked for');
  assets.app = prevApp;
});
await t('real_battle_screen_draws_hero_attack_frames_end_to_end', async () => {
  const { default: combat } = await import('../graftwork/ui/combat.js'), audio = await import('../graftwork/ui/audio.js');
  CA.__resetHi(); CA.__resetKit(); install({ marrow: actor('hero', HERO_FR), orderly: actor('normal', ENEMY_FR) });
  const run = RUN.newRun({ hero: 'marrow', seed: 'animfight' }); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['orderly'] };
  const app = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} } });
  app.register('combat', combat); app.go('combat', { run }); frames(app, 100);
  const T = tape(app.ctx); frames(app, 5); assert.ok(T.rec.some((r) => r.tag === 'stand:marrow') && T.rec.some((r) => r.tag === 'stand:orderly'), 'idle battle draws standing figures');
  const S = combat.api().state(); S.P.attack = 1.0; S.heroHit = 0; frames(app, 1); assert.ok(T.rec.some((r) => r.tag === 'marrow_atk2' || r.tag === 'marrow_atk1' || r.tag === 'marrow_atk3'), 'an attack in progress draws an atk frame'); T.stop();
});
assets.reset();
console.log(`${n} animation frame checks passed`);
