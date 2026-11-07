// Combat art gate: the battle draws the painted Ward actors (ui/combat_art.js) with the right facing, a grounded foot point, a contact shadow,
// a breathing idle that never lifts the sprite, a death that collapses on the floor, a procedural fallback for ids without a sprite,
// and a kit backdrop that degrades to the old one. Assets are a no-op in node: a fake manifest and fake images are injected here.
import assert from 'node:assert/strict';
import { makeApp, frames } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { ENEMIES } from '../graftwork/data/index.js';
import combat from '../graftwork/ui/combat.js';
import * as L from '../graftwork/ui/combat_layout.js';
import * as CA from '../graftwork/ui/combat_art.js';
import { assets } from '../graftwork/ui/assets.js';
import { readFileSync } from 'node:fs';

let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const fakeImg = { width: 256, height: 256, naturalWidth: 256, naturalHeight: 256, tag: 'fake' };
const actor = (kind, bbox) => ({ file1x: 'a1.webp', file2x: 'a2.webp', w: 256, h: 256, anchorX: 128, anchorY: 243, kind, scale: 1, bbox: bbox || [40, 18, 216, 243] });
const MAN = { version: 1, tile: { w: 2, h: 1 }, rooms: {}, icons: {}, cards: {}, actors: { marrow: actor('hero', [85, 18, 171, 243]), bedpan_slime: actor('normal', [19, 18, 236, 243]), orderly: actor('normal'), the_resident: actor('elite'), the_matron: actor('boss', [32, 18, 222, 243]) } };
function installAssets() {
  assets.manifest = MAN; assets.state = 'ready'; assets.imgs.set('a2.webp', { img: fakeImg, ok: true, bad: false }); assets.imgs.set('a1.webp', { img: fakeImg, ok: true, bad: false });
}
function removeAssets() { assets.manifest = null; assets.state = 'none'; assets.imgs.clear(); }

// records what the screen draws: a transform stack (translate / scale sign) plus every drawImage of the fake sprite and every radial gradient (the shadow)
function spy(ctx) {
  const st = [{ tx: 0, ty: 0, fx: 1 }], rec = { sprites: [], shadows: [], tl: [] };
  const cur = () => st[st.length - 1];
  const wrap = (name, fn) => { const o = ctx[name]; ctx[name] = function (...a) { fn(...a); return o && o.apply(this, a); }; };
  wrap('save', () => st.push({ ...cur() }));
  wrap('restore', () => { if (st.length > 1) st.pop(); });
  wrap('translate', (x, y) => { cur().tx += x; cur().ty += y; });
  wrap('scale', (x) => { cur().fx *= Math.sign(x) || 1; });
  wrap('drawImage', (im, ...a) => { if (im === fakeImg) rec.sprites.push({ ...cur(), a }); });
  wrap('createRadialGradient', (x0, y0) => { rec.shadows.push({ x: cur().tx + x0, y: cur().ty + y0 }); });
  return rec;
}
async function fight(enemies, { kind = 'normal', act = 1, hero = 'marrow', sprites = true } = {}) {
  if (sprites) installAssets(); else removeAssets();
  CA.__resetHi(); CA.__resetKit();
  const run = RUN.newRun({ hero, seed: 'art' + enemies.join('') });
  if (act > 1) run.act = act;
  run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: kind, enemies };
  const flow = { RUN, route() {}, openDeck() {}, openSettings() {} };
  const app = await makeApp({ run, audio, flow });
  app.register('combat', combat); app.go('combat', { run });
  frames(app, 120);
  return { app, st: combat.api().state() };
}

await t('sprite is chosen by id: painted enemy and hero, procedural for ids the manifest lacks', async () => {
  const { app } = await fight(['bedpan_slime', 'jarhead']);
  const rec = spy(app.ctx); frames(app, 3);
  assert.ok(CA.spriteOf('bedpan_slime', app) && CA.spriteOf('marrow', app));
  assert.equal(CA.spriteOf('jarhead', app), null, 'Act 2 enemy has no sprite');
  assert.equal(CA.spriteOf('', app), null);
  assert.ok(rec.sprites.length >= 2 * 3, 'hero and the one painted enemy are drawn every frame (' + rec.sprites.length + ')');
  assert.equal(rec.sprites.length, 2 * 3, 'the unpainted enemy draws no sprite');
  assert.ok(CA.spriteBounds(ENEMIES.bedpan_slime, app).sprite && CA.spriteBounds(ENEMIES.jarhead, app) === null);
});
await t('facing: the hero is drawn as is, enemies are flipped to face the hero', async () => {
  const { app, st } = await fight(['orderly']);
  const rec = spy(app.ctx); frames(app, 2);
  const hero = rec.sprites.find((s) => Math.abs(s.tx - L.HERO_X) < 40), foe = rec.sprites.find((s) => Math.abs(s.tx - st.eds[0].x) < 40);
  assert.ok(hero && foe);
  assert.equal(hero.fx, 1, 'hero not flipped'); assert.equal(foe.fx, -1, 'enemy flipped horizontally');
  assert.ok(foe.tx > hero.tx, 'the enemy stands right of the hero');
});
await t('grounded: feet sit on the floor lines, with a contact shadow under each, drawn before the sprite', async () => {
  const { app, st } = await fight(['orderly', 'bedpan_slime']);
  const rec = spy(app.ctx); frames(app, 2);
  const hero = rec.sprites.find((s) => Math.abs(s.tx - L.HERO_X) < 40);
  assert.ok(Math.abs(hero.ty - L.FOOT_Y) < 0.01, 'hero foot on FOOT_Y');
  for (const ed of st.eds) {
    const s = rec.sprites.find((q) => Math.abs(q.tx - ed.x) < 40 && q !== hero);
    assert.ok(s && Math.abs(s.ty - L.ENEMY_FOOT) < 0.01, 'enemy foot on ENEMY_FOOT');
    assert.ok(rec.shadows.some((h) => Math.abs(h.x - ed.x) < 60 && Math.abs(h.y - (L.ENEMY_FOOT - 1) * 1) < 2), 'contact shadow at the foot of ' + ed.e.def.id);
  }
  assert.ok(rec.shadows.some((h) => Math.abs(h.x - L.HERO_X) < 30 && Math.abs(h.y - (L.FOOT_Y - 1)) < 2), 'hero shadow');
});
await t('idle breathing scales from the feet: the anchor y never moves', async () => {
  const { app } = await fight(['orderly']);
  const ys = new Set();
  for (let i = 0; i < 90; i++) { const rec = spy(app.ctx); frames(app, 1); for (const s of rec.sprites) ys.add(s.ty.toFixed(3)); }
  assert.equal(ys.size, 2, 'only the hero floor line and the enemy floor line: ' + [...ys]);
  const P0 = CA.enemyPoseOf({ anim: { sq: 0 }, phase: 0, scale: 1, atk: { phase: 'idle' }, atkT: -1 }, ENEMIES.orderly, 0.3, false), P1 = CA.enemyPoseOf({ anim: { sq: 0 }, phase: 0, scale: 1, atk: { phase: 'idle' }, atkT: -1 }, ENEMIES.orderly, 1.1, false);
  assert.equal(P0.dy, 0); assert.equal(P1.dy, 0); assert.notEqual(P0.sy, P1.sy, 'it breathes (scale) ...'); assert.ok(Math.abs(P0.sy - 1) < 0.03);
  const R = CA.enemyPoseOf({ anim: { sq: 0 }, phase: 0, scale: 1, atk: { phase: 'idle' }, atkT: -1 }, ENEMIES.orderly, 0.3, true); assert.equal(R.sy, 1, 'reduced motion: still');
});
await t('attack pose: wind-up away, lunge toward the hero, hit flash, shake', () => {
  const ed = (phase, k) => ({ anim: { sq: 0 }, phase: 0, scale: 1.1, atk: { phase, k }, atkT: 0.1, atkKind: 'attack' });
  const tell = CA.enemyPoseOf(ed('tell', 1), ENEMIES.orderly, 1, false), act = CA.enemyPoseOf(ed('act', 1), ENEMIES.orderly, 1, false);
  assert.ok(tell.dx > 0, 'wind-up pulls back (away from the hero)'); assert.ok(act.dx < tell.dx - 20, 'the strike lunges toward the hero (left)');
  const hit = CA.enemyPoseOf({ anim: { sq: -0.2, hit: 1 }, phase: 0, scale: 1, atk: { phase: 'idle' }, atkT: -1, hurt: 0 }, ENEMIES.orderly, 1, false);
  assert.ok(hit.flash > 0.9, 'white flash on a hit'); assert.ok(hit.sy < 1, 'squash');
  const cast = CA.enemyPoseOf({ anim: { sq: 0 }, phase: 0, scale: 1, atk: { phase: 'idle' }, atkT: 0.225, atkKind: 'cast' }, ENEMIES.orderly, 1, false); assert.ok(cast.sy > 1 && cast.glow > 0, 'cast rises and glows');
  const hp = (u) => CA.heroAttackPose(u);
  assert.ok(hp(0.2).dx < 0, 'hero anticipation pulls back'); assert.ok(hp(0.46).dx > 30, 'hero strike lunges forward'); assert.ok(Math.abs(hp(1).dx) < 1e-6, 'and recoils to rest');
});
await t('death collapse: squash first, then sink and fade on the floor (never dissolve in the air)', () => {
  const at = (d) => CA.enemyPoseOf({ anim: { sq: 0 }, phase: 0, scale: 1, atk: { phase: 'idle' }, atkT: -1, dying: d }, ENEMIES.orderly, 1, false);
  const seq = [0.1, 0.2, 0.34, 0.5, 0.7, 0.9, 1].map(at);
  assert.ok(seq[0].sy < 1 && seq[1].sy < seq[0].sy && seq[2].sy < seq[1].sy, 'squashes down');
  assert.equal(seq[1].alpha, 1); assert.equal(seq[2].alpha, 1, 'still solid while it squashes');
  assert.ok(seq[3].dy > 0 && seq[4].dy > seq[3].dy, 'drops toward the floor'); assert.ok(seq[4].alpha < 1 && seq[6].alpha === 0, 'fades at the end');
  assert.ok(seq[4].sy < 0.6 && seq[2].sx > 1.1, 'flat and wide');
  assert.ok(seq[3].shadowA <= seq[2].shadowA && seq[6].shadowA === 0, 'the shadow goes with it');
});
await t('a killed painted enemy runs the collapse in the real screen and is gone after', async () => {
  const { app, st } = await fight(['orderly', 'bedpan_slime']);
  const ed = st.eds[0]; ed.dyingOn = true; ed.dying = 0.0001;
  let minSy = 9, sawAlpha = false;
  for (let i = 0; i < 70; i++) { frames(app, 1); minSy = Math.min(minSy, CA.enemyPoseOf(ed, ed.e.def, 1, false).sy); if (ed.dying > 0.7) sawAlpha = true; }
  assert.ok(ed.gone && ed.dying >= 1, 'removed when the collapse ends'); assert.ok(minSy < 0.6 && sawAlpha);
});
await t('status and block overlays, elite aura, boss presence draw without throwing', async () => {
  for (const [en, kind] of [[['the_resident'], 'elite'], [['the_matron'], 'boss']]) {
    const { app, st } = await fight(en, { kind });
    for (const ed of st.eds) { ed.block = 8; ed.bpulse = 0.5; ed.st.poison = 3; ed.st.burn = 2; ed.st.vulnerable = 1; ed.stunT = 1; }
    st.P.block = 5; st.P.st.poison = 2; frames(app, 30);
    st.P.dying = 0.5; st.ending = { win: false, t: 1 }; frames(app, 5);
  }
});
await t('the fallback (Act 2 enemy, or no manifest at all) keeps the procedural look with the same shadow and a colour grade', async () => {
  const { app } = await fight(['jarhead'], { act: 2 });
  const filters = []; const proto = app.ctx; let f = 'none';
  Object.defineProperty(proto, 'filter', { configurable: true, get: () => f, set: (v) => { f = v; filters.push(v); } });
  const rec = spy(app.ctx); frames(app, 3);
  assert.ok(filters.includes(CA.GRADE), 'graded'); assert.equal(f, 'none', 'grade is reset after each figure');
  assert.ok(rec.shadows.some((h) => Math.abs(h.y - (L.ENEMY_FOOT - 1)) < 2), 'same contact shadow');
  const bare = await fight(['bedpan_slime'], { sprites: false }); frames(bare.app, 5);
  assert.equal(CA.spriteOf('bedpan_slime', bare.app), null);
});
await t('layout: painted figures size the lane from their own box, every group stays inside the lane', async () => {
  const { app } = await fight(['bedpan_slime']);
  const sb = (d) => CA.spriteBounds(d, app);
  const names = ['bedpan_slime', 'orderly', 'the_resident', 'the_matron'];
  for (let n2 = 1; n2 <= 4; n2++) {
    const defs = names.slice(0, n2).map((i) => ENEMIES[i]), sl = L.enemySlots(defs, sb);
    sl.forEach((s, i) => { assert.ok(s.h <= L.ENEMY_FOOT - 156 + 1, `${n2} enemies: figure ${i} top below the intent plate (h ${s.h.toFixed(0)})`); assert.ok(s.x - s.sw / 2 >= L.ENEMY_REGION.x0 - 1 && s.x + s.sw / 2 <= L.ENEMY_REGION.x1 + 1, 'inside the lane'); });
    for (let i = 1; i < sl.length; i++) assert.ok(sl[i].x - sl[i].sw / 2 >= sl[i - 1].x + sl[i - 1].sw / 2 - 0.5, 'slots do not overlap');
  }
  const norm = L.enemySlots([ENEMIES.orderly], sb)[0], elite = L.enemySlots([ENEMIES.the_resident], sb)[0];
  assert.ok(elite.h > norm.h, 'an elite stands taller than a normal');
  const mixed = L.enemySlots([ENEMIES.orderly, ENEMIES.jarhead], sb); assert.equal(mixed.length, 2, 'painted and procedural share a lane');
  assert.deepEqual(L.enemySlots([ENEMIES.orderly]), L.enemySlots([ENEMIES.orderly], () => null), 'no sprite box: the old layout');
});
await t('phone stage: a painted fight draws and keeps the hero:body registry id', async () => {
  const { app } = await fight(['bedpan_slime', 'orderly']);
  app.scale = 0.64; frames(app, 5);
  const reg = app.layoutRects ? app.layoutRects() : null;
  assert.ok(!reg || reg.some((r) => r.id === 'hero:body'));
});
await t('backdrop: kit room when the kit images are there, the old backdrop when not', async () => {
  const { app } = await fight(['orderly']);
  assert.equal(CA.drawBackdrop(app, app.ctx, { act: 1, kind: 'normal', t: 0 }), false, 'no kit images: the caller draws the old backdrop');
  for (const k of ['floors/wood', 'floors/stone', 'walls/wood', 'walls/stone', 'pieces/window', 'pieces/door', 'pieces/banner', 'pieces/sconce']) CA.__setKit(k, fakeImg, app);
  assert.equal(CA.drawBackdrop(app, app.ctx, { act: 1, kind: 'normal', t: 0 }), true);
  const r = (a, k) => CA.recipeOf(a, k);
  assert.equal(r(1, 'normal').wall, 'wood'); assert.equal(r(1, 'elite').wall, 'stone'); assert.equal(r(1, 'boss').floor, 'stone');
  assert.ok(r(2, 'normal').tint !== r(1, 'normal').tint && r(3, 'boss').pieces.some((p) => p[0] === 'banner'), 'chosen by act and encounter type');
  CA.__resetKit();
  assert.equal(CA.drawBackdrop(app, app.ctx, { act: 3, kind: 'boss', t: 0 }), false);
});
await t('combat still plays a whole turn with painted figures', async () => {
  const { app, st } = await fight(['orderly']);
  const c = st.c; c.energy = 0; st.energy = 0;
  const a = combat.api(); app.mouse.x = a.endTurn.x; app.mouse.y = a.endTurn.y; app.mouse.pressed = true; app.mouse.down = true; app.tick(1 / 60); app.mouse.released = true; app.mouse.down = false; frames(app, 400);
  assert.ok(c.turn >= 2 || c.over);
});
await t('assets: the combat variant (file3x, bbox) is in the manifest and on disk', () => {
  const root = new URL('../graftwork/assets/ward/', import.meta.url).pathname, man = JSON.parse(readFileSync(root + 'manifest.json', 'utf8'));
  let hi = 0;
  for (const [id, e] of Object.entries(man.actors)) {
    assert.ok(Array.isArray(e.bbox) && e.bbox.length === 4 && e.bbox[2] > e.bbox[0] && e.bbox[3] <= e.h, id + ' bbox');
    if (e.file3x) { hi++; const b = readFileSync(root + e.file3x); assert.equal(b.toString('latin1', 8, 12), 'WEBP', id); }
  }
  assert.ok(hi >= 20, 'most actors carry the 512 px combat file: ' + hi);
});
await t('art gap list: design/WARD.md names every enemy still without a sprite', () => {
  const man = JSON.parse(readFileSync(new URL('../graftwork/assets/ward/manifest.json', import.meta.url).pathname, 'utf8'));
  const doc = readFileSync(new URL('../graftwork/design/WARD.md', import.meta.url).pathname, 'utf8');
  const sec = doc.slice(doc.indexOf('Enemies still without a sprite'));
  assert.ok(sec.length > 40, 'the list exists');
  for (const id of Object.keys(ENEMIES)) if (!man.actors[id]) assert.ok(sec.includes('`' + id + '`'), 'missing from the art gap list: ' + id);
});
removeAssets();
console.log(n + ' ok');
