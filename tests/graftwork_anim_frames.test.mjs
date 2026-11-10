// Actor animation frames (design/WARD.md 12c): attack / hit / die frames in battle and the fallback for every missing piece; and the Ward map, where
// walking is never a frame: the puppet (ui/puppet.js) when the sprite can be read, else the hop, both drawn from the ONE standing image.
// Everything uses fake manifests and fake images (a frame is told apart by the tag of its image); no real art is needed.
import assert from 'node:assert/strict';
import { makeApp, frames, fakeCtx } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as WD from '../graftwork/engine/ward.js';
import { ENEMIES } from '../graftwork/data/index.js';
import { assets, createAssets, normalizeFrames, pickAtkFrame } from '../graftwork/ui/assets.js';
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
    for (const st of [...F.atk, F.hit, F.die].filter(Boolean)) {
      if (decoded !== 'all' && !decoded.includes(st)) continue;
      const im = img(st); for (const s of ['1x', '2x', '3x']) assets.imgs.set(`actors/${st}@${s}.webp`, { img: im, ok: true, bad: false });
    }
  }
}
// records the tag of each sprite image drawn through a ctx
function tape(ctx) { const rec = []; const o = ctx.drawImage; ctx.drawImage = function (im, ...a) { if (im && im.tag) rec.push({ tag: im.tag, a }); return o && o.apply(this, a); }; return { rec, stop: () => { ctx.drawImage = o; } }; }
const HERO_FR = { atk: stems('marrow', 'atk1', 'atk2', 'atk3'), hit: 'marrow_hit', die: 'marrow_die', hi3x: false };
const OLD_WALK = { walk: stems('marrow', ...W4), walkOk: true }; // what a manifest built before the painted walks were removed still carries: ignored

// ---------------- pure helpers ----------------
await t('normalizeFrames_keeps_valid_stems_maps_atk_by_number_and_knows_no_walk', () => {
  const F = normalizeFrames({ walk: ['a_walk1', 'a_walk2', 7, ''], atk: ['a_atk2', 3, ''], hit: 'a_hit', die: 5 });
  assert.deepEqual(F, { atk: ['a_atk2'], atkBy: { 2: 'a_atk2' }, hit: 'a_hit', die: null, hi3x: false }, 'battle frames only: a walk list is not a frame group');
  assert.equal(normalizeFrames(undefined), null); assert.equal(normalizeFrames({}), null); assert.equal(normalizeFrames({ walk: [], atk: [] }), null); assert.equal(normalizeFrames('x'), null);
  assert.equal(normalizeFrames(OLD_WALK), null, 'an actor that only ever had a painted walk has no frames');
});
await t('pickAtkFrame_maps_phases_and_degrades_with_missing_frames', () => {
  const all = { 1: 'a1', 2: 'a2', 3: 'a3' }, only2 = { 2: 'a2' };
  assert.equal(pickAtkFrame(all, 'tell'), 'a1'); assert.equal(pickAtkFrame(all, 'act'), 'a2'); assert.equal(pickAtkFrame(all, 'hold'), 'a2'); assert.equal(pickAtkFrame(all, 'rec', 0.9), 'a3'); assert.equal(pickAtkFrame(all, 'idle'), null);
  assert.equal(pickAtkFrame(only2, 'tell'), null, 'no anticipation frame: stand'); assert.equal(pickAtkFrame(only2, 'act'), 'a2'); assert.equal(pickAtkFrame(only2, 'rec', 0.1), 'a2', 'strike held at the start of the recovery');
  assert.equal(pickAtkFrame(only2, 'rec', 0.8), null, 'then back to standing'); assert.equal(pickAtkFrame({ 3: 'a3' }, 'act'), 'a3'); assert.equal(pickAtkFrame({}, 'act'), null); assert.equal(pickAtkFrame(undefined, 'act'), null);
});
await t('assets_frame_answers_decoded_frames_with_the_standing_def_and_null_otherwise', () => {
  install({ marrow: actor('hero', HERO_FR), orderly: actor('normal') });
  const f = assets.frame('marrow', 'marrow_atk2', null);
  assert.equal(f.img.tag, 'marrow_atk2'); assert.equal(f.def, assets.def('actors', 'marrow'), 'a frame is drawn with the standing def (same canvas, same feet)');
  assert.equal(assets.frame('orderly', 'orderly_atk2', null), null, 'an actor without frames'); assert.equal(assets.frame('nobody', 'x', null), null);
  assets.reset(); assert.equal(assets.frame('marrow', 'marrow_atk2', null), null, 'no manifest');
});
await t('assets_loader_asks_for_a_frame_file_only_when_that_frame_is_asked_for', async () => {
  const asked = [], A = createAssets({ fetchJson: async (u) => (u.endsWith('ward/manifest.json') ? { version: 1, tile: { w: 2, h: 1 }, rooms: { r: {} }, actors: { marrow: actor('hero', { ...HERO_FR, ...OLD_WALK }) }, icons: {}, cards: {} } : Promise.reject(new Error('no kit'))), makeImage: () => { const o = {}; Object.defineProperty(o, 'src', { set: (v) => { asked.push(v); o.onload && o.onload(); } }); return o; } });
  A.ensure(null); await new Promise((r) => setTimeout(r, 5));
  assert.deepEqual(asked, [], 'the manifest alone loads no image');
  A.actor('marrow', null); assert.deepEqual(asked, ['assets/ward/a2.webp'], 'the standing figure: one file');
  A.frame('marrow', 'marrow_atk2', null); assert.deepEqual(asked.slice(1), ['assets/ward/actors/marrow_atk2@2x.webp'], 'a battle frame by its stem, when the battle asks');
  assert.ok(!asked.some((u) => /walk/.test(u)), 'a walk frame is never asked for');
});

// ---------------- the Ward map: the standing image only, moved by the puppet or by the hop ----------------
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
// walk the hero across the rooms: per frame, the hero record and the tagged images drawn
async function runWalk(S, nFrames = 140) {
  const { app, ids, st } = S, T = tape(app.ctx), rows = [];
  st.walk = { cells: ids, i: 0, a: 0, stop: ids.length - 1, t: 0, done: null, wait: false };
  for (let i = 0; i < nFrames; i++) { const k = T.rec.length; frames(app, 1); const h = hero(); rows.push({ cycle: h.cycle, stride: h.stride, bob: h.bob, pp: h.pp ? { ...h.pp } : null, tags: T.rec.slice(k).map((r) => r.tag) }); }
  T.stop(); return { rows, rec: T.rec };
}
// A canvas whose pixels can be read: a mannequin with two legs, so the puppet has something to cut (node has no pixels otherwise)
function mannequin(w, h) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const u = (x + 0.5) / w, v = (y + 0.5) / h;
    if (Math.hypot((u - 0.5) * w / h, v - 0.14) < 0.09 || (v >= 0.22 && v < 0.6 && u >= 0.34 && u < 0.66) || (v >= 0.6 && v < 0.94 && ((u >= 0.36 && u < 0.47) || (u >= 0.53 && u < 0.64)))) d[(y * w + x) * 4 + 3] = 255;
  }
  return d;
}
async function withPixels(fn) {
  const oc = document.createElement;
  document.createElement = () => { const c = { width: 0, height: 0, style: {} }, g = fakeCtx(); g.getImageData = (x, y, w, h) => ({ width: w, height: h, data: mannequin(w, h) }); g.createImageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(0, w * h * 4)) }); c.getContext = () => g; return c; };
  try { return await fn(); } finally { document.createElement = oc; }
}
const OLD_ACTOR = () => ({ ...actor('hero', { ...HERO_FR, ...OLD_WALK }), walk1x: 'b1.webp', walk2x: 'b2.webp' }); // an old cached manifest: step files and a walk list

await t('map_walk_without_a_puppet_is_the_hop_on_the_one_standing_image_and_asks_for_no_file', async () => {
  const S = await mapSetup({ marrow: OLD_ACTOR() }); S.app.shared.meta.settings.reduceMotion = S.app.shared.meta.settings.reducedMotion = false;
  const idle = tape(S.app.ctx); frames(S.app, 3); idle.stop();
  assert.ok(idle.rec.length && idle.rec.every((r) => r.tag === 'stand:marrow'), 'at rest: the standing image');
  const files0 = [...assets.imgs.keys()].sort(), { rows, rec } = await runWalk(S), mv = rows.filter((r) => r.cycle);
  assert.ok(mv.length > 20, 'the hero walked: ' + mv.length + ' frames');
  assert.ok(rec.length > 100 && rec.every((r) => r.tag === 'stand:marrow'), 'walking draws the standing image and nothing else: ' + [...new Set(rec.map((r) => r.tag))]);
  assert.deepEqual([...assets.imgs.keys()].sort(), files0, 'and asks the loader for no other file (no step frame, no walk frame)');
  assert.ok(mv.every((r) => r.pp === null), 'node cannot read the sprite: no puppet'); assert.ok(mv.some((r) => r.bob > 0.5), 'so the walk is the hop: the body leaves the floor between plants');
  assert.ok(new Set(mv.map((r) => Math.floor(r.stride))).size >= 3, 'plant after plant'); assert.equal(hero().frame, undefined); assert.equal(hero().used, undefined);
  const rel = (r) => `${(r.a[1] / r.a[3]).toFixed(4)}|${(r.a[2] / r.a[3]).toFixed(4)}`; // offset of the feet in sprite units
  assert.equal(new Set(rec.map(rel)).size, 1, 'the image is always drawn from the same feet point (the hop is a transform): ' + [...new Set(rec.map(rel))]);
});
await t('map_walk_is_the_puppet_when_the_sprite_can_be_read: legs cut from the standing image, one foot then the other', async () => {
  await withPixels(async () => {
    const S = await mapSetup({ marrow: OLD_ACTOR() }, { seed: 'animp' }); S.app.shared.meta.settings.reduceMotion = S.app.shared.meta.settings.reducedMotion = false;
    const files0 = [...assets.imgs.keys()].sort(), { rows } = await runWalk(S), mv = rows.filter((r) => r.cycle);
    assert.ok(mv.length > 20 && mv.every((r) => r.pp), 'every walking frame has a puppet pose');
    assert.ok(mv.every((r) => !r.tags.includes('stand:marrow')), 'the whole image is not drawn while the puppet walks: its three parts are');
    assert.ok(mv.every((r) => r.bob === 0), 'a legged puppet does not hop: its feet carry it');
    const plants = []; for (const r of mv) { const p = r.pp.plantL && !r.pp.plantR ? 'L' : r.pp.plantR && !r.pp.plantL ? 'R' : ''; if (p && plants[plants.length - 1] !== p) plants.push(p); }
    assert.ok(plants.length >= 4, 'single support alternates: ' + plants.join('')); for (let i = 1; i < plants.length; i++) assert.notEqual(plants[i], plants[i - 1]);
    assert.deepEqual([...assets.imgs.keys()].sort(), files0, 'the puppet needs no file');
    frames(S.app, 90); const rest = tape(S.app.ctx); frames(S.app, 2); rest.stop(); assert.ok(rest.rec.some((r) => r.tag === 'stand:marrow') && hero().pp === null, 'at rest the standing image is back');
  });
});
await t('map_reduced_motion_and_a_missing_manifest_keep_the_figure_standing_or_procedural', async () => {
  await withPixels(async () => {
    const R = await mapSetup({ marrow: OLD_ACTOR() }, { reduced: true }); const { rows, rec } = await runWalk(R, 60);
    assert.ok(rows.every((r) => !r.cycle && !r.pp && r.bob === 0) && rec.every((r) => r.tag === 'stand:marrow'), 'reduced motion: no walk of any kind');
  });
  assets.reset(); const bare = await mapSetup({}, {}); assets.reset(); frames(bare.app, 20); assert.ok(hero(), 'no art at all: the procedural hero is still drawn');
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
  const cases = { 'no frames': undefined, 'only an old walk list': OLD_WALK, 'only hit': { hit: 'marrow_hit' }, 'only die': { die: 'marrow_die' }, 'only atk2': { atk: ['marrow_atk2'] } };
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
const ENEMY_FR = { atk: ['orderly_atk2'], hit: 'orderly_hit', die: 'orderly_die' };
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
