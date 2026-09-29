// CLAWSPIRE -- render suite. Drives every RENDER entry point headless with
// the loader's counting context plus a sequence-recording context of our
// own, and fails on: a throw, an unbalanced save/restore, a NaN argument,
// a draw that paints nothing, or two art keys that produce the same call
// fingerprint (the art would be indistinguishable).
import { boot, harness } from './clawspire_lib.mjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const h = harness('clawspire render');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HAS_DATA = fs.existsSync(path.join(__dirname, '..', 'clawspire', 'js', 'data.js'));

/* A context that records the call sequence and watches for NaN. */
function seqCtx() {
  const stat = { seq: [], nan: [], paints: 0, save: 0, restore: 0 };
  const grad = { addColorStop() {} };
  const check = (name, args) => {
    for (let i = 0; i < args.length; i++) {
      const v = args[i];
      if (typeof v === 'number' && !Number.isFinite(v)) stat.nan.push(name + ' arg' + i);
    }
  };
  const target = { canvas: { width: 540, height: 960 } };
  const ctx = new Proxy(target, {
    get(t, k) {
      if (k === 'canvas') return t.canvas;
      if (k === 'stat') return stat;
      if (k === 'measureText') return () => ({ width: 40 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return (...a) => { check(k, a); return grad; };
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
      if (typeof k !== 'string' || k === 'then') return t[k];
      if (k in t) return t[k];
      return (...a) => {
        check(k, a);
        // transforms carry their (rounded) args so a lunge or squash shows up
        stat.seq.push(k === 'translate' || k === 'scale' || k === 'rotate' ? k + '(' + a.map(v => Math.round(v * 100) / 100).join(',') + ')' : k);
        if (k === 'fill' || k === 'stroke' || k === 'fillRect' || k === 'fillText' || k === 'strokeText' || k === 'drawImage') stat.paints++;
        if (k === 'save') stat.save++;
        if (k === 'restore') stat.restore++;
      };
    },
    set(t, k, v) {
      if (typeof v === 'number' && !Number.isFinite(v)) stat.nan.push('set ' + k);
      if (k === 'globalAlpha' || k === 'globalCompositeOperation') stat.seq.push('set:' + k + '=' + v);
      t[k] = v; return true;
    },
  });
  return { ctx, stat };
}

const ITEM_KEYS = ['sword', 'dagger', 'axe', 'hammer', 'anvil', 'shield', 'buckler', 'potion', 'flask', 'bomb', 'torch', 'iceshard', 'snowball', 'coin', 'gem', 'rock', 'slag', 'iceblock', 'apple', 'bread', 'book', 'scroll', 'orb', 'ring', 'key', 'chain', 'horn', 'whetstone', 'feather', 'skull', 'star', 'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice',
  'chip', 'card', 'horseshoe', 'clover', 'slot', 'potato', 'pill', 'cookie'];
const ENEMY_KEYS = ['rat', 'slime', 'bat', 'gremlin', 'mimic', 'spider', 'goblin', 'hoard', 'imp', 'clockwork', 'golem', 'furnace', 'magnet', 'ironjaw', 'wraith', 'yeti', 'frostmage', 'icemimic', 'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist', 'raccoon', 'goat', 'magpie',
  'tickler', 'jelly', 'barker', 'magbat', 'mole', 'dozer', 'ghost', 'collector'];   // (round 4: the bestiary)
const TILE_TYPES = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event', 'shop', 'rest', 'forge', 'boss', 'start'];
const MOVE_KINDS = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape', 'gulp', 'bomb', 'corrode', 'jam', 'eggs',
  'tickle', 'glue', 'ceiling', 'plow', 'vanish', 'bury', 'wheel'];

const SHAPES = { circle: { kind: 'circle', r: 14 }, box: { kind: 'box', w: 44, h: 10 }, poly: { kind: 'poly', verts: [{ x: -16, y: 4 }, { x: -10, y: -12 }, { x: 10, y: -14 }, { x: 18, y: 0 }, { x: 12, y: 14 }] } };
// A rig the way PHYS.clawRig describes itself: a hub circle, two prongs as
// point chains (three capsule segments each) and an optional ghost prong.
const fakeRig = (opts) => {
  opts = opts || {};
  const s = 0.8, hx = 240, hy = 170;
  const prong = (d) => [[0, 0], [14, 28], [9, 48], [1, 57]].map(([lx, ly]) => ({ x: hx + d * (7 + lx) * s, y: hy + (7 + ly) * s }));
  return { bodies: { hub: { x: hx, y: hy, r: 13 * s }, prongs: [prong(-1), prong(1)], ghost: opts.ghost ? prong(0).map(p => ({ x: hx, y: p.y - 4 })) : null },
    cableTop: { x: 240, y: 26 }, sway: 0.05, phase: 'dropping', geo: { s }, cfg: opts.cfg || null };
};

/* Runs fn against a fresh sequence ctx; asserts no throw, balanced
   save/restore, no NaN and that something was painted. Returns the stat. */
function drawCheck(label, fn) {
  const { ctx, stat } = seqCtx();
  let threw = null;
  try { fn(ctx); } catch (e) { threw = e; }
  h.ok(!threw, label + ' does not throw' + (threw ? ' :: ' + (threw.stack || threw) : ''));
  h.eq(stat.save, stat.restore, label + ' save/restore balanced');
  h.eq(stat.nan.length, 0, label + ' no NaN args ' + stat.nan.slice(0, 3).join(','));
  h.ok(stat.paints > 0, label + ' paints something');
  return stat;
}
function fingerprint(stat) { return stat.seq.length + ':' + stat.seq.join(','); }
function uniqueRatio(map) {
  const seen = new Map();
  for (const [k, fp] of map) seen.set(fp, (seen.get(fp) || []).concat(k));
  const dupes = [...seen.values()].filter(v => v.length > 1);
  return { ratio: seen.size / map.size, dupes };
}

/* ------------------------------------------------- render only */
{
  const api = boot({ only: ['util', 'render'] });
  const R = api.RENDER;
  h.ok(R && typeof R.item === 'function', 'RENDER namespace loads with util only');
  for (const name of ['item', 'enemy', 'cabinet', 'cabinetBack', 'cabinetFront', 'claw', 'bodyDebug', 'hex', 'mapBg', 'bg', 'hpBar', 'statusPips', 'intent', 'portrait', 'relicIcon', 'title', 'enemyBox',
    'terrainHex', 'terrainFill', 'biomePal', 'groundOf', 'lightRim', 'bulb', 'mapCompass', 'mapHeader', 'mapArrow'])
    h.eq(typeof R[name], 'function', 'RENDER.' + name + ' exists');
  for (const name of ['burst', 'text', 'shake', 'flash', 'trail', 'update', 'draw', 'offset'])
    h.eq(typeof R.fx[name], 'function', 'RENDER.fx.' + name + ' exists');

  // loader's counting ctx: balanced after every call
  const ctx = api._ctx;
  const balanced = (label, fn) => {
    api._resetCounts();
    let threw = false;
    try { fn(ctx); } catch (e) { threw = true; }
    h.ok(!threw, label + ' (stub ctx) does not throw');
    h.eq(api._counts.save || 0, api._counts.restore || 0, label + ' (stub ctx) save == restore');
  };

  // items: every key, every shape kind, distinct fingerprints
  const fps = new Map();
  for (const key of ITEM_KEYS) {
    const def = { id: key, art: key, shape: SHAPES.box, color: '#ff2e88', color2: '#2ee6d6' };
    const stat = drawCheck('item ' + key, c => R.item(c, def, 100, 100, 0.3, 1, {}));
    fps.set(key, fingerprint(stat));
    for (const sk in SHAPES) drawCheck('item ' + key + ' ' + sk, c => R.item(c, { art: key, shape: SHAPES[sk] }, 0, 0, 0, 1));
    balanced('item ' + key, c => R.item(c, def, 0, 0, 0, 1, { plus: true, frozen: true, glow: true, alpha: 0.5 }));
  }
  const ur = uniqueRatio(fps);
  h.ok(ur.ratio >= 0.9, 'item art fingerprints distinct (' + Math.round(ur.ratio * 100) + '% unique) dupes=' + JSON.stringify(ur.dupes));
  for (const o of [{ plus: true }, { frozen: true }, { glow: true }, { glow: '#2ee6d6' }, { alpha: 0.3 }, { plus: true, frozen: true, glow: true }]) {
    const stat = drawCheck('item sword ' + JSON.stringify(o), c => R.item(c, { art: 'sword', shape: SHAPES.box }, 0, 0, 0, 1, o));
    h.ok(fingerprint(stat) !== fps.get('sword'), 'item option ' + JSON.stringify(o) + ' changes the drawing');
  }
  drawCheck('item unknown art', c => R.item(c, { id: 'thing', art: 'nope', shape: SHAPES.box }, 0, 0, 0, 1));
  drawCheck('item no shape', c => R.item(c, { art: 'coin' }, 0, 0));
  drawCheck('item null def', c => R.item(c, null, 0, 0, 0, 1));
  drawCheck('item vertical sword box rotates', c => R.item(c, { art: 'sword', shape: { kind: 'box', w: 10, h: 44 } }, 0, 0, 0, 1));

  // enemies: every key, every state, distinct
  const efp = new Map();
  const STATES = [{}, { hurt: 0.7 }, { attack: 0.5 }, { dead: 0.5 }, { frozen: true }, { poisoned: true }, { burning: true }, { hurt: 1, attack: 1, dead: 0.2, frozen: true, poisoned: true, burning: true }];
  for (const key of ENEMY_KEYS) {
    const def = { id: key, name: key, art: key, size: 1, tier: 'normal' };
    const stat = drawCheck('enemy ' + key, c => R.enemy(c, def, 200, 200, 1, 1.5, {}));
    efp.set(key, fingerprint(stat));
    const idle = stat;
    STATES.forEach((st, i) => {
      const s2 = drawCheck('enemy ' + key + ' state ' + i, c => R.enemy(c, def, 200, 200, 1, 2.5, st));
      if (i > 0 && i < 7) h.ok(fingerprint(s2) !== fingerprint(idle), 'enemy ' + key + ' state ' + JSON.stringify(st) + ' changes the drawing');
    });
    drawCheck('enemy ' + key + ' boss', c => R.enemy(c, { art: key, size: 1.2, tier: 'boss' }, 200, 200, 1, 0.7, {}));
    balanced('enemy ' + key, c => R.enemy(c, def, 0, 0, 1, 1, { hurt: 0.5, frozen: true }));
    const box = R.enemyBox(def, 1);
    h.ok(box.w > 20 && box.h > 20, 'enemyBox ' + key + ' sane ' + box.w + 'x' + box.h);
  }
  const eur = uniqueRatio(efp);
  h.ok(eur.ratio >= 0.95, 'enemy art fingerprints distinct (' + Math.round(eur.ratio * 100) + '% unique) dupes=' + JSON.stringify(eur.dupes));
  drawCheck('enemy unknown art', c => R.enemy(c, { name: 'Thing', art: 'nope' }, 0, 0, 1, 0, {}));
  drawCheck('enemy null', c => R.enemy(c, null, 0, 0));
  h.ok(R.enemyBox({ art: 'hoard', tier: 'boss' }, 1).w > R.enemyBox({ art: 'hoard' }, 1).w, 'boss tier scales enemyBox');

  // cabinet + claw + debug
  const cfg = { w: 480, h: 390, frame: 30, chuteW: 64, dividerH: 0.6 };
  const stB = drawCheck('cabinetBack', c => R.cabinetBack(c, 30, 410, cfg, { t: 1, act: 1 }));
  const stF = drawCheck('cabinetFront', c => R.cabinetFront(c, 30, 410, cfg, { t: 1, act: 1 }));
  h.ok(fingerprint(stB) !== fingerprint(stF), 'cabinet back and front differ');
  drawCheck('cabinet', c => R.cabinet(c, 30, 410, cfg, { t: 1, act: 2 }));
  for (const st of [{ fog: 0.8 }, { grease: 0.9 }, { tilt: 1 }, { act: 3 }, { act: '#a6ff5e' }, { fog: 1, grease: 1, tilt: -1, act: 2, t: 3 }]) {
    const s2 = drawCheck('cabinet ' + JSON.stringify(st), c => R.cabinet(c, 30, 410, cfg, st));
    h.ok(s2.seq.length > 0, 'cabinet state ' + JSON.stringify(st) + ' draws');
  }
  drawCheck('cabinet defaults', c => R.cabinet(c, 0, 0));
  const rig = fakeRig();
  drawCheck('claw', c => R.claw(c, rig, 30, 410, { prongs: 3 }));
  const sPlain = drawCheck('claw plain', c => R.claw(c, rig, 0, 0, {}));
  const sRub = drawCheck('claw rubber', c => R.claw(c, rig, 0, 0, { rubber: 1 }));
  const sMag = drawCheck('claw magnet', c => R.claw(c, rig, 0, 0, { magnet: 1 }));
  h.ok(fingerprint(sPlain) !== fingerprint(sRub), 'rubber tips change the claw');
  h.ok(fingerprint(sPlain) !== fingerprint(sMag), 'magnet changes the claw');
  // the flags also come from the rig's own cfg (the game passes the rig)
  const sRigRub = drawCheck('claw rig cfg rubber', c => R.claw(c, fakeRig({ cfg: { rubber: 1 } }), 0, 0, {}));
  h.eq(fingerprint(sRigRub), fingerprint(sRub), 'rig.cfg.rubber draws the rubber pads');
  const lines = (st) => st.seq.filter(k => k === 'lineTo').length;
  // each prong is a chain of three segments: at least 3 lineTo per prong per stroke pass
  h.ok(lines(sPlain) >= 2 * 3 * 2, 'prong chains are drawn as polylines (' + lines(sPlain) + ' lineTo)');
  h.ok(sPlain.seq.filter(k => k === 'arc').length >= 4, 'knuckle rivets and the hub are arcs');
  const sGhost = drawCheck('claw ghost prong', c => R.claw(c, fakeRig({ ghost: true }), 0, 0, { prongs: 3 }));
  h.ok(lines(sGhost) > lines(sPlain) + 2, 'the ghost third prong is drawn (' + lines(sGhost) + ' vs ' + lines(sPlain) + ' lineTo)');
  h.ok(sGhost.seq.indexOf('lineTo') < sPlain.seq.indexOf('lineTo') + 40, 'ghost prong drawn early (behind the pair)');
  const sOneProng = drawCheck('claw one prong', c => { const r2 = fakeRig(); r2.bodies.prongs.length = 1; R.claw(c, r2, 0, 0, {}); });
  h.ok(lines(sOneProng) < lines(sPlain), 'fewer prongs, fewer paths');
  // floor wedges: cfg.slopeW/slopeH add the two bowl slopes to the back
  const sFlat = drawCheck('cabinetBack flat', c => R.cabinetBack(c, 30, 410, cfg, { t: 1, act: 1 }));
  const sBowl = drawCheck('cabinetBack bowl', c => R.cabinetBack(c, 30, 410, Object.assign({ slopeW: 130, slopeH: 90 }, cfg), { t: 1, act: 1 }));
  h.ok(sBowl.paints > sFlat.paints + 4, 'floor wedges add paints (' + sBowl.paints + ' vs ' + sFlat.paints + ')');
  h.ok(sBowl.seq.filter(k => k === 'clip').length >= sFlat.seq.filter(k => k === 'clip').length + 2, 'each wedge clips its tread');
  h.eq(fingerprint(drawCheck('cabinetBack zero slopes', c => R.cabinetBack(c, 30, 410, Object.assign({ slopeW: 0, slopeH: 0 }, cfg), { t: 1, act: 1 }))), fingerprint(sFlat), 'zero slopes draw nothing extra');
  drawCheck('claw phases', c => { for (const ph of ['idle', 'moving', 'dropping', 'closing', 'lifting', 'carrying', 'releasing', 'returning']) { const r2 = fakeRig(); r2.phase = ph; R.claw(c, r2, 0, 0, { magnet: 1 }); } });
  drawCheck('claw empty rig', c => { R.claw(c, {}, 0, 0, {}); c.fillRect(0, 0, 1, 1); });
  balanced('claw', c => R.claw(c, rig, 0, 0, { rubber: 1, magnet: 1 }));
  // bodyDebug: part-based bodies (circle parts), a plain-shape body, wall and claw segments
  const partBody = { x: 100, y: 100, a: 0.3, type: 'dynamic', sl: false, parts: [{ r: 8 }, { r: 6 }], px: [100, 110], py: [100, 100] };
  const sleeper = Object.assign({}, partBody, { sl: true, x: 200 });
  const seg = { ax: 0, ay: 390, bx: 400, by: 390, r: 4 };
  const W = { bodies: [partBody, sleeper, { x: 10, y: 10, a: 0, shape: { kind: 'circle', r: 5 }, type: 'static' }, { x: 20, y: 20, a: 0, shape: { kind: 'poly', verts: [{ x: -3, y: -3 }, { x: 3, y: -3 }, { x: 0, y: 3 }] }, type: 'dynamic' }], segs: [seg], csegs: [seg], contactsOf: () => [{ px: 1, py: 1, nx: 0, ny: -1 }] };
  drawCheck('bodyDebug', c => R.bodyDebug(c, W));
  drawCheck('bodyDebug no contacts', c => R.bodyDebug(c, { bodies: W.bodies }));
  drawCheck('bodyDebug empty', c => { R.bodyDebug(c, null); c.fillRect(0, 0, 1, 1); });

  // hex: every type and state
  const hfp = new Map();
  for (const type of TILE_TYPES) {
    const hidden = drawCheck('hex hidden ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: false, q: 1, r: 2 }, { t: 1 }));
    const shown = drawCheck('hex revealed ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: true, q: 1, r: 2 }, { t: 1 }));
    hfp.set(type, fingerprint(shown));
    if (type !== 'boss') h.ok(fingerprint(hidden) !== fingerprint(shown), 'hex ' + type + ' hidden differs from revealed');
    drawCheck('hex visited ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: true, visited: true }, { t: 1 }));
    for (const st of [{ reachable: true }, { current: true }, { hover: true }, { reachable: true, current: true, hover: true, t: 2 }])
      drawCheck('hex ' + type + ' ' + JSON.stringify(st), c => R.hex(c, 0, 0, 24, { type, revealed: true }, st));
  }
  const hur = uniqueRatio(hfp);
  h.ok(hur.ratio >= 0.9, 'hex icons distinct per type (' + Math.round(hur.ratio * 100) + '%) dupes=' + JSON.stringify(hur.dupes));
  drawCheck('hex null tile', c => R.hex(c, 0, 0, 30, null, null));
  drawCheck('hex unknown type', c => R.hex(c, 0, 0, 30, { type: 'weird', revealed: true }, {}));
  for (const act of [1, 2, 3]) {
    drawCheck('mapBg act ' + act, c => R.mapBg(c, 540, 960, act, 1));
    drawCheck('bg act ' + act, c => R.bg(c, 540, 340, act, 1));
    balanced('bg act ' + act, c => R.bg(c, 540, 340, act, 2));
  }
  // the tileset: every ground type in every biome paints, with a
  // fingerprint of its own (24 distinct), plus the old terrain-only calls
  const GROUNDS = ['grass', 'forest', 'dirt', 'sand', 'hill', 'mountain', 'shallow', 'sea'];
  const tfp = new Map();
  for (const biome of ['cellar', 'foundry', 'vault']) {
    for (const g of GROUNDS) {
      const terr = g === 'sea' || g === 'shallow' ? g : 'land';
      const st = drawCheck(`terrainHex ${biome} ${g}`, c => R.terrainHex(c, 50, 50, 30, { terrain: terr, ground: g, elev: g === 'hill' ? 0.7 : 0.4, coast: g === 'sand' }, { biome, seed: 12345, t: 1, orient: 'v' }));
      tfp.set(biome + '/' + g, fingerprint(st));
      drawCheck(`terrainHex ${biome} ${g} other seed`, c => R.terrainHex(c, 50, 50, 30, { terrain: terr, ground: g, elev: 0.4 }, { biome, seed: 777, t: 2, orient: 'v' }));
    }
    for (const terr of ['land', 'shallow', 'sea']) drawCheck(`terrainHex ${biome} ${terr} (no ground)`, c => R.terrainHex(c, 50, 50, 30, { terrain: terr, elev: 0.9 }, { biome, seed: 12345, t: 1, orient: 'v' }));
    drawCheck(`terrainHex ${biome} lowland`, c => R.terrainHex(c, 50, 50, 30, { terrain: 'land', elev: 0.1 }, { biome, seed: 6, t: 2, orient: 'v' }));
  }
  const tur = uniqueRatio(tfp);
  h.ok(tur.ratio === 1, 'every ground type draws differently in every biome (' + Math.round(tur.ratio * 100) + '%) dupes=' + JSON.stringify(tur.dupes));
  h.eq(R.groundOf({ terrain: 'land', elev: 0.9 }), 'hill', 'groundOf: high land without a ground is a hill');
  h.eq(R.groundOf({ terrain: 'land', elev: 0.02, coast: true }), 'sand', 'groundOf: low coast is sand');
  h.eq(R.groundOf({ terrain: 'sea' }) + R.groundOf({ terrain: 'shallow' }) + R.groundOf({ ground: 'forest' }) + R.groundOf(null), 'seashallowforestgrass', 'groundOf: water, own ground, default');
  drawCheck('terrainHex defaults', c => R.terrainHex(c, 0, 0, 30, null, null));
  h.ok(R.terrainFill('cellar', 'land', 0.1) !== R.terrainFill('cellar', 'land', 0.9), 'terrainFill shades by elevation');
  h.ok(R.terrainFill('cellar', 'land', 0.4, 'grass') !== R.terrainFill('cellar', 'land', 0.4, 'forest') && R.terrainFill('cellar', 'land', 0.4, 'dirt') !== R.terrainFill('cellar', 'land', 0.4, 'sand'), 'terrainFill differs per ground');
  h.ok(R.terrainFill('vault', 'sea', 0.5) !== R.terrainFill('cellar', 'sea', 0.5) && R.terrainFill('vault', 'land', 0.4, 'grass') !== R.terrainFill('cellar', 'land', 0.4, 'grass'), 'terrainFill differs per biome');
  h.eq(R.terrainFill('cellar', 'land', 0.5), R.terrainFill('cellar', 'land', 0.5), 'terrainFill is stable');
  h.ok(/^rgb\(/.test(R.terrainFill('foundry', 'sea', 0.3)) && R.biomePal('nope') === R.biomePal('cellar'), 'fills are rgb strings, unknown biomes fall back');
  for (const b of ['cellar', 'foundry', 'vault']) for (const k of ['grass', 'forest', 'dirt', 'sand', 'hill', 'mtn', 'cap', 'sea', 'shallow', 'coast', 'foam', 'tint']) h.ok(typeof R.BIOME_PAL[b][k] === 'string', `BIOME_PAL ${b}.${k}`);
  // hex in terrain mode: coast edges, darkness (lighter next to the light),
  // the pickup on top of the ground, gone when done, no plate, no check
  const tst = { t: 1, fill: 'rgb(120,110,90)', mask: 0b101010, biome: 'cellar', orient: 'v' };
  const th = drawCheck('hex terrain hidden coast', c => R.hex(c, 50, 50, 30, { type: 'fight', revealed: false, q: 1, r: 2, terrain: 'land', coast: true }, tst));
  const ph = drawCheck('hex plain hidden', c => R.hex(c, 50, 50, 30, { type: 'fight', revealed: false, q: 1, r: 2 }, { t: 1, orient: 'v' }));
  h.ok(fingerprint(th) !== fingerprint(ph), 'terrain darkness differs from the solid fog');
  const dk = drawCheck('hex terrain dark', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: false, q: 1, r: 2, terrain: 'land' }, Object.assign({}, tst, { mask: 0 })));
  const nl = drawCheck('hex terrain dark near light', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: false, q: 1, r: 2, terrain: 'land' }, Object.assign({}, tst, { mask: 0, nearLight: true })));
  h.ok(dk.paints >= 1 && nl.paints >= 1, 'darkness paints');
  for (const type of ['fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event', 'shop', 'rest', 'forge', 'tower']) {
    const undone = drawCheck('hex terrain lit ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: true, q: 1, r: 2, terrain: 'land' }, Object.assign({}, tst, { mask: 0 })));
    const done = drawCheck('hex terrain done ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: true, done: true, visited: true, q: 1, r: 2, terrain: 'land' }, Object.assign({}, tst, { mask: 0 })));
    const empty = drawCheck('hex terrain empty vs ' + type, c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: true, q: 1, r: 2, terrain: 'land' }, Object.assign({}, tst, { mask: 0 })));
    h.ok(fingerprint(undone) !== fingerprint(done) && undone.paints > done.paints, type + ': an undone tile draws its icon, a done one does not');
    h.eq(fingerprint(done), fingerprint(empty), type + ': a done tile draws like bare terrain (no plate, no check mark)');
    const plainDone = drawCheck('hex plain done ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: true, done: true, q: 1, r: 2 }, { t: 1 }));
    const plainUndone = drawCheck('hex plain lit ' + type, c => R.hex(c, 50, 50, 30, { type, revealed: true, q: 1, r: 2 }, { t: 1 }));
    h.ok(plainUndone.paints > plainDone.paints, type + ': done hides the icon in the plain look too');
  }
  drawCheck('hex terrain revealed shop', c => R.hex(c, 50, 50, 30, { type: 'shop', revealed: true, q: 1, r: 2, terrain: 'land' }, tst));
  drawCheck('hex terrain visited empty', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: true, visited: true, q: 1, r: 2, terrain: 'land' }, tst));
  drawCheck('hex terrain ford hidden', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: false, q: 1, r: 2, terrain: 'shallow' }, tst));
  drawCheck('hex terrain ford revealed reachable', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: true, q: 1, r: 2, terrain: 'shallow' }, Object.assign({ reachable: true, path: 2, target: true }, tst)));
  drawCheck('hex terrain flare wash', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: false, q: 1, r: 2, terrain: 'land' }, Object.assign({ path: 1, flare: true }, tst)));
  drawCheck('hex terrain dark sea', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: false, q: 1, r: 2, terrain: 'sea' }, tst));
  drawCheck('hex terrain known landmark', c => R.hex(c, 50, 50, 30, { type: 'tower', revealed: false, known: true, q: 3, r: 4, terrain: 'land' }, tst));
  drawCheck('hex terrain lit mountain', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: true, q: 3, r: 4, terrain: 'land', ground: 'mountain' }, tst));
  // the glow where the light meets the dark, and the marquee bulb
  const rim = drawCheck('lightRim', c => R.lightRim(c, 50, 50, 30, 0b100101, true, 1));
  h.ok(rim.paints >= 2, 'lightRim paints its edges');
  drawCheck('lightRim none', c => { R.lightRim(c, 50, 50, 30, 0, true, 1); c.fillRect(0, 0, 1, 1); });
  drawCheck('lightRim defaults', c => R.lightRim(c, 0, 0, 0, 1));
  const bOn = drawCheck('bulb on', c => R.bulb(c, 20, 20, 8, 1, true)), bOff = drawCheck('bulb off', c => R.bulb(c, 20, 20, 8, 1, false));
  h.ok(fingerprint(bOn) !== fingerprint(bOff), 'a lit bulb draws differently from a dark one');
  drawCheck('bulb defaults', c => R.bulb(c));
  drawCheck('mapPath bulbs pill', c => R.mapPath(c, [{ x: 10, y: 10 }, { x: 40, y: 30 }, { x: 70, y: 30 }], 30, { cost: 3, ink: 2, label: 'Shop', unit: 'bulbs', t: 1 }));
  drawCheck('mapPath one bulb', c => R.mapPath(c, [{ x: 10, y: 10 }, { x: 40, y: 30 }], 30, { cost: 1, ink: 5, t: 1 }));
  drawCheck('mapPath flare', c => R.mapPath(c, [{ x: 10, y: 10 }, { x: 40, y: 30 }, { x: 70, y: 50 }], 30, { label: 'Flare', color: '#ffb347', t: 1 }));
  drawCheck('mapCompass', c => R.mapCompass(c, 100, 100, 28, 1));
  drawCheck('mapCompass defaults', c => R.mapCompass(c, 0, 0, 0, 0));
  drawCheck('mapHeader', c => R.mapHeader(c, 10, 10, 190, 32, 'The Damp Arcade', '7 of 246 hexes charted', 1));
  drawCheck('mapHeader no sub', c => R.mapHeader(c, 10, 10, 190, 32, 'Title', '', 1));
  drawCheck('mapArrow', c => R.mapArrow(c, 100, 100, -1.2, 16, 1, 'Boss'));
  drawCheck('mapArrow defaults', c => R.mapArrow(c, 0, 0, 0, 0, 0, ''));
  const b1 = drawCheck('bg act 1 fp', c => R.bg(c, 540, 340, 1, 1)), b2 = drawCheck('bg act 2 fp', c => R.bg(c, 540, 340, 2, 1)), b3 = drawCheck('bg act 3 fp', c => R.bg(c, 540, 340, 3, 1));
  h.ok(fingerprint(b1) !== fingerprint(b2) && fingerprint(b2) !== fingerprint(b3) && fingerprint(b1) !== fingerprint(b3), 'bg differs per act');
  drawCheck('bg defaults', c => R.bg(c));

  // ui
  drawCheck('hpBar', c => R.hpBar(c, 10, 10, 100, 12, 33, 50, 6));
  drawCheck('hpBar zero', c => R.hpBar(c, 10, 10, 100, 12, 0, 50, 0));
  drawCheck('hpBar over', c => R.hpBar(c, 10, 10, 100, 12, 80, 50, 0));
  drawCheck('hpBar bad', c => R.hpBar(c, 10, 10, 100, 12, NaN, 0, undefined));
  drawCheck('statusPips fallback', c => R.statusPips(c, 0, 0, { str: 3, weak: 1, poison: 2, burn: 1, chill: 1, freeze: 1, regen: 1, thorns: 1, dodge: 1, bleed: 1, stun: 1, grease: 1, fog: 1, shield_up: 1, enrage: 1, armor: 1, unknownStatus: 2, zero: 0 }, 16));
  drawCheck('statusPips empty', c => { R.statusPips(c, 0, 0, {}, 16); c.fillRect(0, 0, 1, 1); });
  const ifp = new Map();
  for (const k of MOVE_KINDS) {
    const st = drawCheck('intent ' + k, c => R.intent(c, 100, 100, { intent: { k, v: 7, n: 2 } }, 1));
    ifp.set(k, fingerprint(st));
    drawCheck('intent ' + k + ' charged', c => R.intent(c, 100, 100, { intent: { k, v: 12 }, charged: true }, 1));
  }
  const iur = uniqueRatio(ifp);
  h.ok(iur.ratio >= 0.6, 'intent icons distinct per kind (' + Math.round(iur.ratio * 100) + '%) dupes=' + JSON.stringify(iur.dupes));
  drawCheck('intent none', c => R.intent(c, 0, 0, {}, 0));
  drawCheck('intent null', c => R.intent(c, 0, 0, null));
  const pfp = new Map();
  for (const id of ['knight', 'alchemist', 'rogue', 'gambler', 'nobody']) pfp.set(id, fingerprint(drawCheck('portrait ' + id, c => R.portrait(c, id, 40, 40, 64, 1))));
  h.ok(pfp.get('knight') !== pfp.get('alchemist') && pfp.get('alchemist') !== pfp.get('rogue') && pfp.get('knight') !== pfp.get('rogue'), 'portraits differ per character');
  h.ok(['knight', 'alchemist', 'rogue', 'nobody'].every(id => pfp.get(id) !== pfp.get('gambler')), 'Lucky Lou has a face of his own');
  balanced('portrait gambler', c => R.portrait(c, 'gambler', 40, 40, 64, 1));
  // round 3: the Luck meter on the cabinet frame, every state
  h.eq(typeof R.luckMeter, 'function', 'RENDER.luckMeter exists');
  const lfp = new Set();
  for (const st of [{ luck: 0, on: true }, { luck: 4, on: true }, { luck: 10, on: true }, { luck: 5, pop: 1 }, { luck: 7, cash: 0.6 }, { luck: 99, max: 10 }, {}]) {
    lfp.add(fingerprint(drawCheck('luckMeter ' + JSON.stringify(st), c => R.luckMeter(c, 15, 420, 790, Object.assign({ t: 1 }, st)))));
    balanced('luckMeter ' + JSON.stringify(st), c => R.luckMeter(c, 15, 420, 790, st));
  }
  h.ok(lfp.size >= 5, 'the meter looks different as it fills, pops and pays (' + lfp.size + ')');
  drawCheck('luckMeter null', c => R.luckMeter(c, 15, 420, 790, null));
  for (const r of ['c', 'u', 'r', 'l', 'boss', 'event', 'zz']) drawCheck('relicIcon ' + r, c => R.relicIcon(c, { icon: 'X', rarity: r }, 0, 0, 32));
  drawCheck('relicIcon null', c => R.relicIcon(c, null, 0, 0, 32));
  drawCheck('title', c => R.title(c, 540, 960, 1));
  drawCheck('title t=0', c => R.title(c, 540, 960, 0));
  balanced('title', c => R.title(c, 540, 960, 5));

  // fx
  R.fx.clear && R.fx.clear();
  R.fx.burst(100, 100, '#ffc94d', 500, { speed: 200 });
  h.ok(R.fx.count() <= 400, 'particle pool caps at 400 (' + R.fx.count() + ')');
  h.eq(R.fx.count(), 400, 'pool is full after 500 spawns');
  R.fx.text(10, 10, '12', '#fff', { size: 24 });
  R.fx.text(10, 10, 'MISS', '#fff');
  for (let i = 0; i < 100; i++) R.fx.text(10, 10, 'x' + i, '#fff');
  for (let i = 0; i < 100; i++) R.fx.trail(10, 10, '#2ee6d6', { vy: 100 });
  R.fx.shake(10); R.fx.flash('#fff', 0.5);
  const off = R.fx.offset();
  h.ok(typeof off.x === 'number' && typeof off.y === 'number' && Math.abs(off.x) <= 24 && Math.abs(off.y) <= 24, 'fx.offset returns a bounded {x,y}');
  R.fx.reduced = true;
  const off2 = R.fx.offset();
  h.ok(Math.abs(off2.x) <= Math.abs(off.x) + 1e-9 && Math.abs(off2.y) <= Math.abs(off.y) + 1e-9, 'reduced flag shrinks the shake');
  R.fx.reduced = false;
  h.ok(R.fx.offset() === off, 'fx.offset reuses one object (no per-frame allocation)');
  let threw = false;
  try { for (let i = 0; i < 12; i++) R.fx.update(1 / 60); } catch (e) { threw = true; }
  h.ok(!threw, 'fx.update 60 frames does not throw');
  drawCheck('fx.draw mid-life', c => R.fx.draw(c));
  for (let i = 0; i < 300; i++) R.fx.update(1 / 30);
  h.eq(R.fx.count(), 0, 'all particles expire');
  h.ok(Math.abs(R.fx.offset().x) < 1e-9, 'shake decays to zero');
  drawCheck('fx.draw empty', c => { R.fx.draw(c); c.fillRect(0, 0, 1, 1); });
  R.fx.update(NaN); R.fx.update(undefined);
  h.ok(true, 'fx.update tolerates bad dt');
  // rapid spam does not grow beyond the pools
  for (let i = 0; i < 20; i++) { R.fx.burst(0, 0, '#fff', 100); R.fx.update(0.01); }
  h.ok(R.fx.count() <= 400, 'pool stays capped under spam');
  R.fx.clear();
}

/* ------------------------------------------------- with data.js */
if (HAS_DATA) {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  h.ok(R && D, 'RENDER loads next to DATA');
  const fps = new Map();
  let n = 0;
  for (const id in D.ITEMS) {
    const def = D.ITEMS[id];
    h.ok(ITEM_KEYS.includes(def.art), 'item ' + id + ' art key "' + def.art + '" is drawable');
    const st = drawCheck('DATA item ' + id, c => R.item(c, def, 100, 100, 0.2, 1, {}));
    fps.set(id, fingerprint(st));
    drawCheck('DATA item ' + id + ' plus/frozen/glow', c => R.item(c, def, 100, 100, 0, 0.55, { plus: true, frozen: true, glow: true }));
    n++;
  }
  h.ok(n >= 40, 'data has a real roster (' + n + ' items)');
  for (const id in D.ENEMIES) {
    const def = D.ENEMIES[id];
    h.ok(ENEMY_KEYS.includes(def.art), 'enemy ' + id + ' art key "' + def.art + '" is drawable');
    drawCheck('DATA enemy ' + id, c => R.enemy(c, def, 200, 250, 1, 1, {}));
    drawCheck('DATA enemy ' + id + ' states', c => { for (const st of [{ hurt: 0.5 }, { attack: 0.5 }, { dead: 0.5 }, { frozen: true, poisoned: true, burning: true }]) R.enemy(c, def, 200, 250, 1, 1, st); });
    const moves = def.moves || [];
    for (const m of moves) drawCheck('DATA intent ' + id + '/' + m.id, c => R.intent(c, 100, 100, { intent: m, charged: m.k === 'charge' }, 1));
  }
  if (D.STATUS) {
    const all = {};
    for (const id in D.STATUS) all[id] = 2;
    const st = drawCheck('DATA statusPips all', c => R.statusPips(c, 0, 0, all, 16));
    h.ok(st.seq.filter(k => k === 'fillText').length >= Object.keys(D.STATUS).length, 'a pip is drawn per status');
  }
  if (D.RELICS) for (const id in D.RELICS) drawCheck('DATA relic ' + id, c => R.relicIcon(c, D.RELICS[id], 0, 0, 32));
  if (D.CHARACTERS) for (const id in D.CHARACTERS) drawCheck('DATA portrait ' + id, c => R.portrait(c, id, 0, 0, 64, 1));
}

/* ------------------------------------------------- ART overrides */
// js/art.js hands render.js loaded PNGs. With a stub ART that returns a fake
// image, every hooked entry point must draw it (drawImage) and stay balanced;
// with ART returning null the drawing must be exactly the vector one.
if (HAS_DATA) {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, A = api.ART, D = api.DATA;
  const plain = boot({ only: ['util', 'render'] }).RENDER;   // no ART at all
  h.ok(A && typeof A.get === 'function', 'ART loads ahead of RENDER');
  const fake = { width: 64, height: 64, complete: true, naturalWidth: 64 };
  const wide = { width: 128, height: 32, complete: true, naturalWidth: 128, naturalHeight: 32 };
  let pick = () => null;
  A.get = (kind, key) => pick(kind, key);
  const ctx = api._ctx;
  // counting ctx: the image is drawn and save/restore still balance
  const withImage = (label, fn) => {
    api._resetCounts();
    let threw = null;
    try { fn(ctx); } catch (e) { threw = e; }
    h.ok(!threw, label + ' with art does not throw' + (threw ? ' :: ' + (threw.stack || threw) : ''));
    h.ok((api._counts.drawImage || 0) > 0, label + ' with art calls drawImage');
    h.eq(api._counts.save || 0, api._counts.restore || 0, label + ' with art save == restore');
  };
  // records the drawImage calls whose source is one of the fakes
  const imgCtx = () => {
    const draws = [];
    const grad = { addColorStop() {} };
    const c = new Proxy({ canvas: { width: 540, height: 960 } }, {
      get(t, k) {
        if (k === 'measureText') return () => ({ width: 40 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => grad;
        if (typeof k !== 'string' || k === 'then' || k in t) return t[k];
        return (...a) => { if (k === 'drawImage' && (a[0] === fake || a[0] === wide)) draws.push(a); };
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    return { c, draws };
  };
  const item = D.ITEMS.rusty_sword, enemyDef = D.ENEMIES.rat, bossDef = D.ENEMIES.hoard;
  const cases = [
    ['item', (c) => R.item(c, item, 100, 100, 0.3, 1, {}), (c) => plain.item(c, item, 100, 100, 0.3, 1, {}), true],
    ['item plus/frozen/glow/alpha', (c) => R.item(c, item, 100, 100, 0.3, 1, { plus: true, frozen: true, glow: true, alpha: 0.5 }), (c) => plain.item(c, item, 100, 100, 0.3, 1, { plus: true, frozen: true, glow: true, alpha: 0.5 }), false],
    ['enemy', (c) => R.enemy(c, enemyDef, 200, 250, 1, 1, {}), (c) => plain.enemy(c, enemyDef, 200, 250, 1, 1, {}), true],
    ['enemy all states', (c) => R.enemy(c, enemyDef, 200, 250, 1, 1, { hurt: 0.6, attack: 0.4, dead: 0.3, frozen: true, poisoned: true, burning: true }), (c) => plain.enemy(c, enemyDef, 200, 250, 1, 1, { hurt: 0.6, attack: 0.4, dead: 0.3, frozen: true, poisoned: true, burning: true }), false],
    ['boss enemy', (c) => R.enemy(c, bossDef, 270, 330, 1, 2, { hurt: 0.3 }), (c) => plain.enemy(c, bossDef, 270, 330, 1, 2, { hurt: 0.3 }), false],
    ['portrait', (c) => R.portrait(c, 'knight', 50, 50, 96, 1), (c) => plain.portrait(c, 'knight', 50, 50, 96, 1), true],
    ['hex', (c) => R.hex(c, 50, 50, 30, { type: 'shop', revealed: true, q: 1, r: 1 }, { t: 1 }), (c) => plain.hex(c, 50, 50, 30, { type: 'shop', revealed: true, q: 1, r: 1 }, { t: 1 }), true],
    ['relicIcon', (c) => R.relicIcon(c, D.RELICS.grip_tape, 0, 0, 32), (c) => plain.relicIcon(c, D.RELICS.grip_tape, 0, 0, 32), true],
    ['statusPips', (c) => R.statusPips(c, 0, 0, { poison: 2, str: 1 }, 16), (c) => plain.statusPips(c, 0, 0, { poison: 2, str: 1 }, 16), true],
    ['intent debuff', (c) => R.intent(c, 100, 100, { intent: { k: 'debuff', s: 'weak', v: 1 } }, 1), (c) => plain.intent(c, 100, 100, { intent: { k: 'debuff', s: 'weak', v: 1 } }, 1), true],
    ['bg', (c) => R.bg(c, 540, 960, 2, 1), (c) => plain.bg(c, 540, 960, 2, 1), false],
    ['mapBg', (c) => R.mapBg(c, 540, 960, 3, 1), (c) => plain.mapBg(c, 540, 960, 3, 1), true],
    ['title', (c) => R.title(c, 540, 960, 1), (c) => plain.title(c, 540, 960, 1), false],
    ['cabinetFront', (c) => R.cabinetFront(c, 30, 410, { w: 480, h: 390, frame: 30 }, { t: 1, act: 1 }), (c) => plain.cabinetFront(c, 30, 410, { w: 480, h: 390, frame: 30 }, { t: 1, act: 1 }), false],
    ['claw', (c) => R.claw(c, fakeRig(), 30, 410, { rubber: 1, magnet: 1 }), (c) => plain.claw(c, fakeRig(), 30, 410, { rubber: 1, magnet: 1 }), false],
  ];
  // ART returns null: the drawing is the plain vector one, and never an image
  pick = () => null;
  for (const [label, fn, vec, noImage] of cases) {
    const a = drawCheck('null art ' + label, fn), b = drawCheck('no ART ' + label, vec);
    h.eq(fingerprint(a), fingerprint(b), label + ': ART.get null draws the vector art');
    if (noImage) h.ok(!a.seq.includes('drawImage'), label + ': ART.get null calls no drawImage');
  }
  // ART returns the fake for every key: every entry point draws it
  pick = () => fake;
  for (const [label, fn] of cases) {
    withImage(label, fn);
    const st = drawCheck('art ' + label, fn);
    const { c, draws } = imgCtx();
    fn(c);
    h.ok(draws.length > 0, label + ': the stub image itself is drawn');
    h.ok(st.seq.includes('drawImage'), label + ': drawImage in the sequence');
  }
  // lookups: per-id overrides are asked for first, then the shared key
  const asked = [];
  pick = (kind, key) => { asked.push(kind + ':' + key); return null; };
  R.item(ctx, item, 0, 0, 0, 1, {});
  R.enemy(ctx, D.ENEMIES.slimeling, 0, 0, 1, 0, {});
  h.eq(asked.slice(0, 2).join(','), 'itemId:rusty_sword,item:sword', 'item asks itemId then the art key');
  h.eq(asked.slice(2, 4).join(','), 'enemy:slimeling,enemy:slime', 'enemy asks the id then the art key');
  pick = (kind, key) => (kind === 'item' && key === 'sword' ? fake : null);
  const swordOnly = imgCtx(); R.item(swordOnly.c, item, 0, 0, 0, 1, {});
  h.eq(swordOnly.draws.length, 1, 'shared art key image drawn once for an item');
  h.near(swordOnly.draws[0][3], 48, 1e-6, 'item image stretched to the physics width');
  h.near(swordOnly.draws[0][4], 10, 1e-6, 'item image stretched to the physics height');
  pick = () => wide;
  const tall = seqCtx(); R.item(tall.ctx, { id: 'x', art: 'sword', shape: { kind: 'box', w: 10, h: 44 } }, 0, 0, 0, 1, {});
  h.ok(tall.stat.seq.includes('rotate(-1.57)'), 'a landscape image stands up in a tall box');
  pick = () => fake;
  const en = imgCtx(); R.enemy(en.c, enemyDef, 0, 0, 1, 0, {});
  const ebox = R.enemyBox(enemyDef, 1), sz = enemyDef.size || 1;
  h.near(en.draws[0][4] * sz, ebox.h, 1e-6, 'enemy image height matches enemyBox');
  h.near(en.draws[0][2] + en.draws[0][4], 0, 1e-6, 'enemy image feet sit on the origin');
  A.get = () => { throw new Error('boom'); };
  drawCheck('ART.get throwing falls back', c => R.item(c, item, 0, 0, 0, 1, {}));
  A.get = () => ({ width: 0, height: 0, complete: true, naturalWidth: 0 });
  const zero = drawCheck('zero-size image falls back', c => R.enemy(c, enemyDef, 0, 0, 1, 0, {}));
  h.ok(!zero.seq.includes('drawImage'), 'a zero-size image is ignored');
}


/* ------------------------------------------------- the juice layer (fx presets, pools, shake, auras) */
{
  const api = boot({ only: ['util', 'render'] });
  const R = api.RENDER, fx = R.fx, ctx = api._ctx;
  const balanced = (label, fn) => {
    api._resetCounts();
    let threw = false;
    try { fn(ctx); } catch (e) { threw = true; console.log(e); }
    h.ok(!threw, label + ' does not throw');
    h.eq(api._counts.save || 0, api._counts.restore || 0, label + ' save == restore');
  };
  for (const name of ['emit', 'num', 'badge', 'ring', 'slash', 'fly', 'kick', 'vignette', 'hold', 'trauma', 'ringCount', 'flyCount', 'slashCount'])
    h.eq(typeof fx[name], 'function', 'RENDER.fx.' + name + ' exists');
  h.eq(typeof R.glint, 'function', 'RENDER.glint exists');
  h.eq(typeof R.enemyAura, 'function', 'RENDER.enemyAura exists');
  const PRESETS = ['hit', 'crit', 'sparks', 'dust', 'smoke', 'poof', 'coins', 'confetti', 'poison', 'burn', 'frost', 'shock', 'blood', 'heal', 'block', 'shatter', 'death', 'glint', 'trailDot', 'nope'];
  fx.clear();
  for (const p of PRESETS) {
    const n0 = fx.count();
    let threw = false;
    try { fx.emit(p, 100, 100, { col: '#ff2e88', power: 1.2 }); } catch (e) { threw = true; }
    h.ok(!threw && fx.count() > n0, 'preset ' + p + ' spawns particles');
  }
  balanced('fx.draw with every particle kind', c => fx.draw(c));
  for (let i = 0; i < 40; i++) for (const p of PRESETS) fx.emit(p, i, i);
  h.ok(fx.count() <= 400, 'preset spam stays under the 400 cap (' + fx.count() + ')');
  // reduced thins the bursts
  fx.clear(); fx.emit('confetti', 0, 0); const full = fx.count();
  fx.clear(); fx.reduced = true; fx.emit('confetti', 0, 0); const thin = fx.count(); fx.reduced = false;
  h.ok(thin > 0 && thin < full * 0.5, `reduced thins a preset (${thin} of ${full})`);
  // physics numbers pop and fall; badges rise; both expire
  fx.clear();
  const n = fx.num(200, 200, '-24', '#fff', { crit: true });
  h.ok(n && n.mode === 1 && n.size > 20, 'a crit number is a physics number, sized up');
  const small = fx.num(0, 0, '-2', '#fff'), big = fx.num(0, 0, '-60', '#fff');
  h.ok(big.size > small.size, 'numbers grow with the damage');
  fx.badge(100, 100, '*', 'Relic', '#2ee6d6');
  h.eq(fx.textCount(), 4, 'numbers and badges share the text pool');
  for (let i = 0; i < 8; i++) fx.update(1 / 60);
  h.ok(n.oy < 0, 'a number flies up first');
  for (let i = 0; i < 40; i++) fx.update(1 / 60);
  h.ok(n.vy > 0 || fx.textCount() < 4, 'then gravity pulls it down');
  balanced('fx.draw numbers and badges', c => fx.draw(c));
  for (let i = 0; i < 200; i++) fx.update(1 / 30);
  h.eq(fx.textCount(), 0, 'numbers and badges expire');
  // rings, slashes, flyers: pooled and capped
  for (let i = 0; i < 100; i++) { fx.ring(0, 0, '#fff', { r1: 50, delay: i % 3 ? 0 : 0.1 }); fx.slash(0, 0, 0.3, 80, '#fff', { claw: i % 2 === 0 }); }
  h.ok(fx.ringCount() <= 40 && fx.slashCount() <= 16, `rings and slashes are capped (${fx.ringCount()}, ${fx.slashCount()})`);
  balanced('fx.draw rings and both slash kinds', c => fx.draw(c));
  let arrived = 0;
  for (let i = 0; i < 60; i++) fx.fly(0, 0, 100, 50, { kind: i % 2 ? 'coin' : 'star', dur: 0.3, delay: 0.05, cb: () => arrived++ });
  h.ok(fx.flyCount() <= 48, 'flyers capped at 48');
  h.eq(arrived, 12, 'a recycled flyer still delivers its callback (12 recycled)');
  for (let i = 0; i < 4; i++) fx.update(1 / 60);
  balanced('fx.draw flyers mid-flight', c => fx.draw(c));
  for (let i = 0; i < 40; i++) fx.update(1 / 60);
  h.eq(arrived, 60, 'every flyer called back on arrival');
  h.eq(fx.flyCount(), 0, 'flyers leave the pool');
  let bad = false;
  fx.fly(0, 0, 1, 1, { dur: 0.01, cb: () => { throw new Error('x'); } });
  try { fx.update(0.1); } catch (e) { bad = true; }
  h.ok(!bad, 'a throwing callback never breaks the update');
  // trauma shake: trauma^2 falloff, bounded, a roll, reduced kills the roll and the kick
  fx.clear();
  fx.shake(4); const t1 = fx.trauma();
  fx.shake(4); const t2 = fx.trauma();
  h.ok(t2 > t1 && t1 > 0, 'shakes stack as trauma');
  for (let i = 0; i < 20; i++) fx.shake(20);
  h.ok(fx.trauma() <= 1, 'trauma caps at 1');
  let maxOff = 0, maxR = 0;
  for (let i = 0; i < 60; i++) { fx.update(1 / 240); const o = fx.offset(); maxOff = Math.max(maxOff, Math.abs(o.x), Math.abs(o.y)); maxR = Math.max(maxR, Math.abs(o.r)); }
  h.ok(maxOff > 2 && maxOff <= 24, `a full trauma shake moves the camera (${maxOff.toFixed(1)} px)`);
  h.ok(maxR > 0 && maxR < 0.03, 'and rolls it a little');
  fx.reduced = true;
  const ro = fx.offset();
  h.eq(ro.r, 0, 'reduced: no roll');
  fx.clear(); fx.kick(0, 8);
  h.eq(fx.offset().y, 0, 'reduced: no kick');
  fx.reduced = false;
  fx.kick(0, 8);
  h.ok(fx.offset().y > 5, 'a kick nudges the camera');
  for (let i = 0; i < 60; i++) fx.update(1 / 60);
  h.ok(Math.abs(fx.offset().y) < 0.05, 'the kick springs back');
  // vignettes: a pulse and a standing hold, both drawn balanced
  fx.vignette('#ff2e30', 0.8); fx.hold(0.3);
  balanced('fx.draw vignette + hold', c => fx.draw(c));
  fx.hold(0); fx.clear();
  // the per-function juice hooks
  const ALL = { poison: 2, burn: 2, chill: 1, freeze: 1, weak: 1, vuln: 2, str: 3, enrage: 1, thorns: 2, bleed: 1, stun: 1, shield_up: 1, armor: 2 };
  for (const layer of ['back', 'front']) balanced('enemyAura ' + layer + ' with every status', c => R.enemyAura(c, 200, 300, 120, 110, ALL, 1.3, layer));
  balanced('enemyAura with no status', c => R.enemyAura(c, 0, 0, 10, 10, null, 0, 'front'));
  for (let t = 0; t < 3; t += 0.37) balanced('glint at t ' + t.toFixed(2), c => R.glint(c, 10, 10, 16, t, 3, '#fff'));
  balanced('hpBar with a ghost, flash and shield sheen', c => R.hpBar(c, 0, 0, 100, 12, 30, 100, 5, { ghost: 60, flash: 0.7, shield: 0.4 }));
  balanced('hpBar old signature', c => R.hpBar(c, 0, 0, 100, 12, 30, 100, 5));
  balanced('statusPips with pops', c => R.statusPips(c, 0, 0, { poison: 2, weak: 1 }, 14, { poison: 0.5 }));
  const def = { id: 'x', art: 'goblin', name: 'Goblin' };
  balanced('enemy winding up, chilled', c => R.enemy(c, def, 100, 300, 1, 1, { windup: 0.8, chilled: true, attack: 0 }));
  for (const atk of [1, 0.9, 0.6, 0.2, 0]) balanced('enemy strike curve at ' + atk, c => R.enemy(c, def, 100, 300, 1, 1, { attack: atk }));
  balanced('cabinetBack party lights + marquee', c => R.cabinetBack(c, 30, 410, {}, { party: 1, marquee: 'JACKPOT!', t: 2.2, act: 1 }));
  const rig = { bodies: { hub: { x: 100, y: 120, r: 12 }, prongs: [[{ x: 90, y: 125 }, { x: 80, y: 150 }, { x: 85, y: 170 }], [{ x: 110, y: 125 }, { x: 120, y: 150 }, { x: 115, y: 170 }]] }, cableTop: { x: 96, y: 26 }, phase: 'carrying' };
  balanced('claw with juice (bend, squash, speed lines, glow)', c => R.claw(c, rig, 30, 410, { juice: { bend: 12, squash: 0.8, speed: 400, glow: 0.6 } }));
  balanced('item with a rarity glow alpha', c => R.item(c, { id: 'x', art: 'gem', shape: { kind: 'circle', r: 12 } }, 0, 0, 0, 1, { glow: '#ffc94d', glowA: 0.4 }));
  const src = fs.readFileSync(path.join(__dirname, '..', 'clawspire', 'js', 'render.js'), 'utf8');
  h.ok(!/Math\.random/.test(src), 'render.js never calls Math.random');
  h.ok(!/\u2014/.test(src), 'no em dashes in render.js');
}

/* ------------------------------------------------- cabinet materials (itemFx, shards, the claw's face) */
if (HAS_DATA) {
  const api = boot();
  const R = api.RENDER, D = api.DATA, P = api.PHYS;
  h.ok(typeof R.itemFx === 'function' && typeof R.shard === 'function' && typeof R.clawHead === 'function', 'RENDER.itemFx, shard and clawHead exist');
  // every item with its own material, in every state and layer, at a few times
  const STATES = [
    { crack: 0, slosh: 0, fuse: 0, golden: false, mag: 0, melt: 0 },
    { crack: 1, slosh: 0.6, fuse: 2, golden: true, mag: 1, melt: 0.5 },
    { crack: 2, slosh: -0.8, fuse: 1, golden: false, mag: 0.4, melt: 0.3 },
  ];
  let n = 0, bad = 0;
  const mats = new Set();
  for (const def of Object.values(D.ITEMS)) {
    const mat = P.materialOf(def);
    mats.add(mat.id);
    for (const s0 of STATES) {
      for (const layer of ['back', 'front', 'top']) {
        const { ctx, stat } = seqCtx();
        let threw = null;
        const st = Object.assign({ mat, t: 1.7 + n * 0.13, seed: n % 7 }, s0);
        try { R.itemFx(ctx, def, 100, 200, 0.7, 0.85, st, layer); } catch (e) { threw = e; }
        n++;
        if (threw || stat.save !== stat.restore || stat.nan.length) { bad++; if (bad < 4) h.ok(false, `itemFx ${def.id} ${layer} :: ${threw || stat.nan.join(',') || 'save/restore'}`); }
      }
    }
  }
  h.eq(bad, 0, `itemFx draws ${n} item / state / layer combos cleanly`);
  for (const m of ['metal', 'glass', 'heavy', 'rubber', 'potion', 'food', 'magic', 'bomb', 'frost']) h.ok(mats.has(m), 'the roster has a ' + m + ' item');
  // the looks actually paint
  const pot = Object.values(D.ITEMS).find(d => d.art === 'potion' && (d.tags || []).includes('potion'));
  const bomb = Object.values(D.ITEMS).find(d => d.art === 'bomb');
  const magic = Object.values(D.ITEMS).find(d => (d.tags || []).includes('magic'));
  drawCheck('itemFx potion liquid + crack (front)', c => R.itemFx(c, pot, 0, 0, 1.2, 1, { mat: P.materialOf(pot), t: 1, crack: 1, slosh: 0.4 }, 'front'));
  drawCheck('itemFx bomb fuse badge (top)', c => R.itemFx(c, bomb, 0, 0, 0, 1, { mat: P.materialOf(bomb), t: 1, fuse: 1 }, 'top'));
  drawCheck('itemFx magic glow (back)', c => R.itemFx(c, magic, 0, 0, 0, 1, { mat: P.materialOf(magic), t: 1 }, 'back'));
  drawCheck('itemFx golden prize (front)', c => R.itemFx(c, magic, 0, 0, 0, 1, { mat: P.materialOf(magic), t: 1, golden: true }, 'front'));
  const quiet = seqCtx();
  R.itemFx(quiet.ctx, { id: 'x', art: 'rock', shape: { kind: 'circle', r: 10 } }, 0, 0, 0, 1, { mat: P.materialOf({ id: 'x2', tags: [] }), t: 1 }, 'top');
  h.eq(quiet.stat.paints, 0, 'plain stuff with no state draws nothing on top');
  h.ok(!(() => { try { R.itemFx(quiet.ctx, null, 0, 0, 0, 1, null); R.itemFx(quiet.ctx, null, 0, 0, 0, 1, {}, 'front'); return false; } catch (e) { return true; } })(), 'itemFx tolerates missing args');
  drawCheck('a glass shard', c => R.shard(c, 10, 10, 0.4, 5, '#bfe8ff'));
  // the claw's face in every mood, the lucky flames, the LED chase, the magnet's field
  const pull = [{ x: 220, y: 240 }, { x: 270, y: 250 }];
  for (const mood of ['', 'focus', 'happy', 'sad', 'wow', 'lucky', 'nonsense']) {
    for (const ph of ['idle', 'dropping', 'carrying']) {
      const r = fakeRig({ cfg: { magnet: 1, rubber: 1 } }); r.phase = ph;
      drawCheck(`claw mood '${mood}' ${ph}`, c => R.claw(c, r, 30, 410, { juice: { t: 2.3, idle: ph === 'idle' ? 1 : 0, mood, blink: 1, look: -0.6, chase: 0.7, lucky: 1, pull, pullN: 2, bend: 4, squash: 0.2 } }));
    }
  }
  const a = seqCtx(), b = seqCtx();
  R.claw(a.ctx, fakeRig(), 30, 410, { juice: { t: 1, mood: 'happy' } });
  R.claw(b.ctx, fakeRig(), 30, 410, { juice: { t: 1, mood: 'sad' } });
  h.ok(fingerprint(a.stat) !== fingerprint(b.stat), 'happy and sad faces draw differently');
  drawCheck('claw with an old-style cfg (no juice)', c => R.claw(c, fakeRig(), 30, 410, {}));
  for (const p of ['crumbs', 'blast']) { R.fx.emit(p, 100, 100, { col: '#d9a05b' }); }
  h.ok(R.fx.count ? R.fx.count() > 0 : true, 'the crumbs and blast presets emit');
  R.fx.update(1 / 60);
}

// ---------------------------------------------------------------- BOSSES (the boss arena looks)
if (HAS_DATA) {
  const api = boot({ only: ['util', 'data', 'combat', 'render'] });
  const R = api.RENDER, D = api.DATA, C = api.COMBAT;
  const big = Object.values(D.ENEMIES).filter(e => e.tier === 'elite' || e.tier === 'boss');
  h.ok(big.length >= 10, 'six elites and four bosses to show');
  // The versus card at every beat of its timeline, for every elite and boss.
  for (const def of big) {
    const boss = def.tier === 'boss';
    for (const t of [0, 0.1, 0.3, 0.37, 0.5, 0.7, 1.2, 2.0, 3.1, 3.3]) {
      drawCheck(`vsCard ${def.id} t${t}`, c => R.vsCard(c, 540, 960, { t, dur: boss ? 3.3 : 2.3, boss, title: boss ? 'ACT 1 BOSS' : 'ELITE', name: def.name, taunt: def.taunt,
        affixes: [{ icon: '*', name: 'Hasty', color: '#ffe066' }, { icon: '!', name: 'Spiky', color: '#8fae3a' }], charId: 'rogue', charName: 'ROGUE', def, color: def.color, now: t }));
    }
  }
  drawCheck('vsCard reduced', c => R.vsCard(c, 540, 960, { t: 1, dur: 2, def: big[0], name: 'X', taunt: 'y', reduced: true }));
  drawCheck('vsCard with nothing', c => R.vsCard(c));
  const a = seqCtx(), b = seqCtx();
  R.vsCard(a.ctx, 540, 960, { t: 1.2, dur: 3, boss: true, title: 'ACT 2 BOSS', name: 'The Smelter', def: D.ENEMIES.smelter, charId: 'knight', now: 1 });
  R.vsCard(b.ctx, 540, 960, { t: 1.2, dur: 3, boss: false, title: 'ELITE', name: 'Ironjaw', def: D.ENEMIES.ironjaw, charId: 'knight', now: 1 });
  h.ok(fingerprint(a.stat) !== fingerprint(b.stat), 'a boss card and an elite card look different');
  // round 3: the crawler answers back on the card (DATA.CHARACTERS[id].vsLine)
  for (const t of [0.3, 0.7, 1.4, 3.2]) drawCheck('vsCard gambler t' + t, c => R.vsCard(c, 540, 960, { t, dur: 3.3, boss: true, title: 'ACT 1 BOSS', name: 'The Hoard', def: D.ENEMIES.hoard, charId: 'gambler', charName: 'LUCKY LOU', now: t }));
  const g1 = seqCtx(), g2 = seqCtx();
  R.vsCard(g1.ctx, 540, 960, { t: 1.4, dur: 3, title: 'ELITE', name: 'Ironjaw', def: D.ENEMIES.ironjaw, charId: 'gambler', charName: 'LUCKY LOU', now: 1 });
  const keepLine = D.CHARACTERS.gambler.vsLine;
  D.CHARACTERS.gambler.vsLine = '';
  R.vsCard(g2.ctx, 540, 960, { t: 1.4, dur: 3, title: 'ELITE', name: 'Ironjaw', def: D.ENEMIES.ironjaw, charId: 'gambler', charName: 'LUCKY LOU', now: 1 });
  D.CHARACTERS.gambler.vsLine = keepLine;
  h.ok(fingerprint(g1.stat) !== fingerprint(g2.stat) && D.CHARACTERS.gambler.vsLine.length > 0, 'Lucky Lou has his own line on the versus card');
  // Cabinet signs and the signature looks inside the machine.
  for (const [id, col] of Object.entries(R.SIG_COL)) {
    for (const k of [0.2, 1]) drawCheck(`bossSign ${id} k${k}`, c => R.bossSign(c, 270, 398, id.toUpperCase() + ' NEXT TURN', col, 1.3, k));
  }
  const empty = seqCtx();
  R.bossSign(empty.ctx, 270, 398, 'X', '#fff', 1, 0);
  h.eq(empty.stat.paints, 0, 'a sign at k 0 is not there');
  const cfg = { w: 480, h: 390, chuteW: 64, dividerH: 0.45, frame: 30, railY: 26, chuteX: 416 };
  const looks = {
    heat: { heat: 1 }, snow: { snow: 1 }, lid: { ice: { part: 'lid', hp: 1, k: 1 } }, rail: { ice: { part: 'rail', hp: 2, k: 0.5 } },
    hijack: { hijack: 1, hx: 120 }, alarm: { alarm: 1 },
  };
  const prints = {};
  for (const [k, st] of Object.entries(looks)) {
    for (const layer of ['back', 'front']) {
      const s0 = Object.assign({ t: 2.2 }, st);
      const quiet = (k === 'lid' || k === 'rail' || k === 'hijack' || k === 'alarm') ? layer === 'back' : layer === 'front' && k === 'snow';
      if (quiet) continue;
      const stat = drawCheck(`bossCab ${k} ${layer}`, c => R.bossCab(c, 30, 410, cfg, s0, layer));
      prints[k + layer] = fingerprint(stat);
    }
  }
  h.eq(new Set(Object.values(prints)).size, Object.keys(prints).length, 'every signature look draws differently');
  drawCheck('bossCab everything at once', c => { for (const l of ['back', 'front']) R.bossCab(c, 30, 410, cfg, { t: 1, heat: 1, snow: 1, ice: { part: 'lid', hp: 1 }, hijack: 1, alarm: 1 }, l); });
  const none = seqCtx();
  R.bossCab(none.ctx, 30, 410, cfg, { t: 1 }, 'front'); R.bossCab(none.ctx, 30, 410, cfg, null, 'back');
  h.eq(none.stat.save, none.stat.restore, 'bossCab with no state stays balanced');
  drawCheck('cabinetBack in the red alarm', c => R.cabinetBack(c, 30, 410, cfg, { t: 1, act: 3, alarm: 1 }));
  drawCheck('hotItem', c => R.hotItem(c, 100, 100, 14, 1.2, 3));
  const crown = drawCheck('eliteBadge boss (crown)', c => R.eliteBadge(c, 50, 50, 'boss', 1, 24));
  const skull = drawCheck('eliteBadge elite (skull)', c => R.eliteBadge(c, 50, 50, 'elite', 1, 24));
  h.ok(fingerprint(crown) !== fingerprint(skull), 'a crown for bosses, a skull for elites');
  for (const st of [{ white: 1 }, { white: 0.5, card: 0.1, boss: true, title: 'BOSS DEFEATED', sub: 'GAME OVER, Prize Master.' }, { card: 1, boss: false, sub: 'Ironjaw is down.' }, { card: 0.4, reduced: true, boss: true }]) {
    drawCheck('finale ' + JSON.stringify(st).slice(0, 40), c => R.finale(c, 540, 960, Object.assign({ now: 1, y: 190 }, st)));
  }
  const nofin = seqCtx();
  R.finale(nofin.ctx, 540, 960, { white: 0, card: -1 });
  h.eq(nofin.stat.paints, 0, 'no whiteout and no card: nothing drawn');
  // The intent bubble carries the signature's ribbon when it is due.
  for (const id of ['hoard', 'smelter', 'glacius', 'prizemaster']) {
    const F = C.newFight({ hp: 50, maxHp: 50, act: D.ENEMIES[id].act, bin: [], relics: [] }, [id], api.U.rng(2));
    const e = F.enemies[0];
    e.acts = 0;
    const off = drawCheck(`intent ${id} (no signature)`, c => R.intent(c, 270, 120, e, 1));
    e.acts = 1;
    const on = drawCheck(`intent ${id} (signature due)`, c => R.intent(c, 270, 120, e, 1));
    h.ok(on.seq.length > off.seq.length, `${id}: the ribbon adds to the bubble`);
  }
}

/* ------------------------------------------------- claw types and the label layout */
{
  const api = boot({ only: ['util', 'physics', 'render'] });
  const R = api.RENDER, P = api.PHYS;
  // every claw type draws in every phase and state, and they all look different
  const looks = new Map();
  for (const t of Object.keys(P.CLAW_TYPES)) {
    for (const open of [0, 0.5, 1]) {
      const pose = P.clawPose(t, { x: 200, y: 120, open });
      const J = { t: 1.3, mood: 'happy', spin: open, tap: 1 - open, squish: 0.5, lucky: 1, hold: [{ x: 210, y: 180 }], holdN: 1, pull: [{ x: 150, y: 200 }], pullN: 1, field: 1, chase: 0.5, idle: 1 };
      const st = drawCheck(`claw ${t} open ${open}`, c => R.claw(c, pose, 30, 410, { juice: J }));
      if (open === 1) looks.set(t, fingerprint(st));
    }
    drawCheck(`claw ${t} bare (no juice)`, c => R.claw(c, P.clawPose(t, {}), 0, 0, {}));
    // a live rig of that type, mid-grab
    const W = P.world({ gravity: { x: 0, y: 1150 }, w: 480, h: 390 }), C = P.cabinet(W, { w: 480, h: 390, chuteW: 64, dividerH: 0.45 });
    const rig = P.clawRig(W, { cabinet: C, type: t });
    rig.drop();
    for (let i = 0; i < 40; i++) { rig.update(1 / 60); W.step(1 / 60); }
    drawCheck(`claw ${t} live rig dropping`, c => R.claw(c, rig, 30, 410, { juice: { t: 2, mood: 'focus' } }));
  }
  const u = uniqueRatio(looks);
  h.eq(u.ratio, 1, 'every claw type looks different ' + JSON.stringify(u.dupes));
  drawCheck('claw sleepy mood', c => R.claw(c, P.clawPose('classic', {}), 0, 0, { juice: { mood: 'sleepy', t: 3 } }));
  drawCheck('coin slot idle', c => R.coinSlot(c, 76, 815, { t: 1 }));
  drawCheck('coin slot clunk', c => R.coinSlot(c, 76, 815, { t: 1, coin: 0.5, flash: 1 }));

  // the label layout manager: a stress test of 40 labels spawned on one spot
  const fx = R.fx;
  fx.clear();
  fx.zone('marquee', 178, 376, 362, 408);
  fx.zone('hud', 0, 0, 540, 68);
  const words = ['SWALLOWED: Dented Shield', 'HICCUP! +1', 'STOLEN: Rusty Sword', 'GREASED', 'FOG', 'JUNK', 'TILT', 'COPY', 'BOOM!',
    'DIGESTED: Crisp Apple (back after the fight)', 'RUSTED: Iron Nut', 'CLAW JAMMED! (one grab fewer)', '+PLAYED', 'DOUBLE', 'SLIP'];
  const check = (label) => {
    const L = fx.labels();
    let overlap = 0, off = 0, inZone = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (a.x0 < 0 || a.x1 > 540 || a.y0 < 0 || a.y1 > 960) off++;
      for (const z of fx.zones()) if (a.x0 < z.x1 && a.x1 > z.x0 && a.y0 < z.y1 && a.y1 > z.y0) inZone++;
      for (let j = i + 1; j < L.length; j++) { const b = L[j]; if (a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0) overlap++; }
    }
    h.eq(overlap, 0, label + ': no two labels overlap');
    h.eq(off, 0, label + ': every label is on the screen');
    h.eq(inZone, 0, label + ': no label sits in a keep-out zone');
    return L;
  };
  for (let i = 0; i < 40; i++) fx.text(270 + ((i * 37) % 60) - 30, 430 + (i % 5) * 6, words[i % words.length] + (i >= words.length ? ' ' + i : ''), '#ffffff', { size: 14 + (i % 4) * 4 });
  let L = check('40 labels at once');
  h.ok(L.length >= 20, `the labels that fit are laid out (${L.length}); the rest wait for room`);
  for (let f = 0; f < 90; f++) { fx.update(1 / 60); if (f % 10 === 0) check('frame ' + f); }
  // labels spawning next to the marquee get pushed off it
  fx.clear();
  const p = fx.text(270, 392, 'SWALLOWED: Dented Shield', '#ff2e88');
  L = check('a label born on the marquee');
  h.ok(L.length === 1 && (L[0].y0 >= 408 || L[0].y1 <= 376), 'it moved off the marquee');
  for (let f = 0; f < 60; f++) fx.update(1 / 60);
  check('...and it never rises into it');
  h.ok(p.life > 0, 'still readable after a second');
  // merging, long labels, lifetime by length, opting out
  fx.clear();
  const a1 = fx.text(270, 430, 'HICCUP! +1', '#a6ff5e');
  const a2 = fx.text(275, 432, 'HICCUP! +1', '#a6ff5e');
  h.ok(a1 === a2 && a1.str === 'HICCUP! +1 x2', 'the same label within a moment merges into "x2"');
  const a3 = fx.text(270, 430, 'HICCUP! +1', '#a6ff5e');
  h.eq(a3.str, 'HICCUP! +1 x3', '...and again "x3"');
  h.eq(fx.textCount(), 1, 'one label on screen for the three');
  for (let f = 0; f < 40; f++) fx.update(1 / 60);
  const a4 = fx.text(270, 430, 'HICCUP! +1', '#a6ff5e');
  h.ok(a4 !== a1, 'after the merge window it is a new label');
  const b1 = fx.badge(110, 386, '*', 'Squire Gauntlet', '#ffc94d');
  const b2 = fx.badge(110, 386, '*', 'Squire Gauntlet', '#ffc94d');
  h.ok(b1 === b2 && b1.mode === 2, 'badges merge too and stay badges');
  const long = fx.text(270, 500, 'A VERY LONG LABEL THAT WOULD NEVER FIT ACROSS THE WHOLE PHONE SCREEN AT ALL', '#fff', { size: 28 });
  h.ok(long.size < 28, 'a long label shrinks to fit the screen width');
  const short = fx.text(100, 600, 'OK', '#fff');
  h.ok(long.max > short.max, 'a long label lives longer than a short one');
  const free = fx.text(270, 430, 'FREE', '#fff', { free: true });
  h.ok(!free.lay, 'o.free opts out of the layout');
  const dmg = fx.num(300, 200, '12', '#fff');
  h.ok(!dmg.lay, 'damage numbers keep their physics flight');
  drawCheck('fx draw with laid-out labels', c => fx.draw(c));
  fx.zone('marquee'); fx.zone('hud');
  h.eq(fx.zones().length, 0, 'zones are removed by id');
  fx.clear();
  // LABELS (round 9): the damage numbers reserve their rects (they keep their flight, nudged aside),
  // the labels flow around them, soft zones give way only when there is no room close by
  fx.zone('hud', 0, 0, 540, 68);
  fx.zone('bub', 230, 120, 310, 180, true);
  const z0 = fx.zones().find((z) => z.id === 'bub');
  fx.zone('bub', 232, 120, 310, 180, true);
  h.ok(fx.zones().find((z) => z.id === 'bub') === z0 && z0.x0 === 232 && z0.soft, 'a zone set again moves in place and keeps its soft flag');
  const ns = [];
  for (let i = 0; i < 5; i++) ns.push(fx.num(270, 230, String(9 + i * 7), '#fff', { vx: 0, vy: -300, crit: i === 4 }));
  h.ok(ns.every((n) => !n.lay && n.nlay), 'numbers keep their flight but join the layout');
  const lab = fx.text(270, 230, 'PINCH!', '#ffc94d');
  const hitR = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  let nOver = 0, nHard = 0, nFar = 0, inSoft = 0;
  for (let f = 0; f < 70; f++) {
    fx.update(1 / 60);
    const RR = fx.rects(), all = RR.nums.concat(RR.labels);
    for (let i = 0; i < all.length; i++) {
      if (all[i].num && all[i].nudge > 185) nFar++;
      for (const z of fx.zones()) if (hitR(all[i], z)) { if (z.soft) inSoft++; else nHard++; }
      for (let j = i + 1; j < all.length; j++) if (hitR(all[i], all[j])) nOver++;
    }
    if (f === 0) h.ok(RR.nums.length === 5 && RR.labels.length === 1, 'five numbers and a label on one spot');
  }
  h.eq(nOver, 0, 'five numbers and a label born on one spot never overlap');
  h.eq(nHard, 0, '...never sit in a hard zone');
  h.eq(nFar, 0, '...and stay close to where they fly');
  h.ok(inSoft < 70 * 6, 'a soft zone is kept clear most of the time');
  h.ok(lab.life > 0 || lab.hide === false, 'the label lives on beside them');
  fx.clear();
  const lone = fx.num(100, 500, '5', '#fff', { vx: 0, vy: 0, gravity: 0 });
  fx.update(1 / 60);
  h.ok(lone.lx === 0 && lone.ly === 0, 'a number with room flies untouched');
  fx.layout = false;
  const off = fx.num(270, 230, '12', '#fff');
  h.ok(!off.nlay, 'layout off: numbers are not laid out');
  fx.layout = true;
  fx.zone('hud'); fx.zone('bub');
  fx.clear();
  // MEMORY (round 9): the glow sprite cache kept a canvas per colour and whole-pixel radius (17 MB after 16 fights)
  const g0 = R.q9.glowStats();
  for (let r = 4; r <= 600; r++) R.glowSprite('#123457', r);
  const g1 = R.q9.glowStats();
  h.ok(g1.n - g0.n <= 45, `597 radii share ${g1.n - g0.n} sprites`);
  const big = R.glowSprite('#123457', 600);
  h.ok(big && big.width <= 2 * 128 + 2, 'no glow sprite is built past radius 128 (it is drawn larger)');
  h.eq(R.glowSprite('#123457', 12), R.glowSprite('#123457', 12.2), 'small radii keep their own sprite per pixel');
  for (let c = 0; c < 120; c++) for (const r of [60, 90, 128]) R.glowSprite('#' + (0x100000 + c * 977).toString(16), r);
  h.ok(R.q9.glowStats().mb <= 8, `a flood of colours stays under the budget (${R.q9.glowStats().mb} MB)`);
}

// ---- Polish and QA: the versus card keeps the crawler's words in its own panel
h.test('vs card: a long crawler name and its comeback stay left of the seam', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER;
  const texts = [];
  const st0 = { font: '10px sans-serif', textAlign: 'left', tx: 0, stack: [] };
  const size = () => { const m = /(\d+(?:\.\d+)?)px/.exec(st0.font); return m ? +m[1] : 10; };
  const ctx = new Proxy(st0, {
    get(o, p) {
      if (p === 'measureText') return (s) => ({ width: String(s).length * size() * 0.62 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (p === 'translate') return (x) => { o.tx += x; };
      if (p === 'save') return () => { o.stack.push(o.tx); };
      if (p === 'restore') return () => { if (o.stack.length) o.tx = o.stack.pop(); };
      if (p === 'fillText') return (s, x, y) => { texts.push({ s: String(s), x: x + o.tx, y, w: String(s).length * size() * 0.62, align: o.textAlign }); };
      if (p in o) return o[p];
      if (typeof p !== 'string' || p === 'then') return undefined;
      return () => {};
    },
    set(o, p, v) { o[p] = v; return true; },
  });
  const def = api.DATA.ENEMIES.prizemaster || Object.values(api.DATA.ENEMIES)[0];
  // the seam runs from (340, 250) to (200, 700)
  const seam = (y) => 340 + (200 - 340) * (y - 250) / 450;
  const cases = Object.values(api.DATA.CHARACTERS).map((c) => [String(c.name).toUpperCase(), c.vsLine || 'Hi.', c.id]);
  cases.push(['SIR GRABSWORTH THE UNREASONABLY LONG', 'Have at thee, prize! And another thing, too!', 'knight']);
  for (const [cn, vl, id] of cases) {
    texts.length = 0;
    R.vsCard(ctx, 540, 960, { t: 2.2, dur: 3.3, boss: true, title: 'FINAL BOSS', name: 'THE PRIZE MASTER', taunt: 'x', def, charId: id, charName: cn, charLine: vl, now: 2.2 });
    const name = texts.find((x) => x.s === cn);
    const line = texts.find((x) => x.s === vl);
    h.ok(name && name.x + name.w / 2 <= seam(name.y) - 6 && name.x - name.w / 2 >= 0, `${cn}: the name sits between the edge and the seam (${name && Math.round(name.x - name.w / 2)}..${name && Math.round(name.x + name.w / 2)})`);
    h.ok(line && line.x >= 0 && line.x + line.w <= seam(596), `${cn}: the comeback ends before the seam (${line && Math.round(line.x + line.w)} <= ${Math.round(seam(596))})`);
  }
});

// ---- Polish and QA: enemy status chips stop short of the next enemy
h.test('status pips: maxW cuts the row, the rest is one +N chip, centred on x', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER;
  const rects = [], texts = [];
  let tx = 0, ty = 0;
  const stack = [];
  const ctx = new Proxy({}, {
    get(o, p) {
      if (p === 'measureText') return (s) => ({ width: String(s).length * 7 });
      if (p === 'translate') return (x, y) => { tx += x; ty += y; };
      if (p === 'save') return () => stack.push([tx, ty]);
      if (p === 'restore') return () => { const s = stack.pop(); if (s) { tx = s[0]; ty = s[1]; } };
      if (p === 'arcTo' || p === 'moveTo' || p === 'lineTo') return (x, y) => { rects.push([x + tx, y + ty]); };
      if (p === 'fillText') return (s) => texts.push(String(s));
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (typeof p !== 'string' || p === 'then' || p in o) return o[p];
      return () => {};
    },
    set(o, p, v) { o[p] = v; return true; },
  });
  const status = { poison: 22, burn: 13, chill: 2, vuln: 3, weak: 2, str: 5, thorns: 3, bleed: 4 };
  R.statusPips(ctx, 270, 330, status, 14, null, { maxW: 108, center: true, rows: 1 });
  const xs = rects.map((r) => r[0]), ys = rects.map((r) => r[1]);
  h.ok(Math.min(...xs) >= 270 - 54 - 1 && Math.max(...xs) <= 270 + 54 + 1, 'the row stays inside maxW around x (' + Math.round(Math.min(...xs)) + '..' + Math.round(Math.max(...xs)) + ')');
  h.ok(Math.max(...ys) - Math.min(...ys) <= 15, 'one row');
  h.ok(texts.includes('+6'), 'the rest is a +N chip (' + texts.join(' ') + ')');
  // without options: the old left-aligned run of every chip
  rects.length = 0; texts.length = 0;
  R.statusPips(ctx, 100, 330, status, 14);
  h.ok(Math.min(...rects.map((r) => r[0])) >= 99 && !texts.some((s) => s[0] === '+'), 'no options: every chip, left-aligned as before');
});

// ---- Polish and QA: item sprites (the art is drawn once, then blitted)
h.test('item sprites: built once per def / look / scale bucket, blitted after, live when headless', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  // a recording context with a real-looking transform
  const mk = (k) => {
    const calls = [];
    const t = { k, calls, canvas: { width: 100, height: 100 } };
    return new Proxy(t, { get(o, p) {
      if (p === 'calls') return calls;
      if (p === 'canvas') return o.canvas;
      if (p === 'getTransform') return () => ({ a: o.k, b: 0, c: 0, d: o.k, e: 0, f: 0 });
      if (p === 'scale') return (x) => { o.k *= x; calls.push('scale'); };
      if (p === 'save') return () => { (o.st || (o.st = [])).push(o.k); calls.push('save'); };
      if (p === 'restore') return () => { if (o.st && o.st.length) o.k = o.st.pop(); calls.push('restore'); };
      if (p === 'measureText') return () => ({ width: 10 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (typeof p !== 'string' || p === 'then') return o[p];
      return (...a) => { calls.push(p); };
    }, set(o, p, v) { o[p] = v; return true; } });
  };
  const made = [];
  // item sprites (not glow sprites, which are one gradient fillRect)
  const built = { get length() { return made.filter((g) => g.calls.includes('fill') || g.calls.includes('stroke')).length; }, get 0() { return made.find((g) => g.calls.includes('fill')); } };
  const doc = api._document, ce0 = doc.createElement;
  doc.createElement = (tag) => { const c = { width: 0, height: 0, getContext: () => { const g = mk(1); made.push(g); return g; } }; return c; };
  const def = D.ITEMS.rusty_sword || Object.values(D.ITEMS)[0];
  const main = mk(1.5);
  R.item(main, def, 100, 100, 0.3, 1, {});
  h.eq(built.length, 1, 'the first draw renders the sprite once');
  h.ok(built[0].calls.filter((c) => c === 'fill' || c === 'stroke').length > 2, 'on the offscreen canvas, with the real art');
  const n0 = main.calls.length;
  R.item(main, def, 120, 140, 1.2, 1, {});
  const again = main.calls.slice(n0);
  h.eq(built.length, 1, 'the second draw builds nothing');
  h.eq(again.filter((c) => c === 'drawImage').length, 1, 'and is one blit');
  h.ok(!again.includes('fill') && !again.includes('clip'), 'with no path work on the main canvas');
  R.item(main, def, 120, 140, 0, 1, { plus: true });
  R.item(main, def, 120, 140, 0, 1, { frozen: true });
  R.item(main, def, 120, 140, 0, 1.9, {});
  h.eq(built.length, 4, 'plus, frozen and a bigger scale each get their own sprite');
  R.item(main, def, 120, 140, 0, 0.95, {});
  h.eq(built.length, 4, 'a scale in the same quarter bucket reuses one');
  R.item(main, def, 120, 140, 0, 1, { glow: '#ffc94d', alpha: 0.5 });
  h.eq(built.length, 4, 'glow and alpha are live, the art is still the sprite');
  // a recoloured def (same object) rebuilds
  const d2 = Object.assign({}, def);
  R.item(main, d2, 0, 0, 0, 1, {});
  h.eq(built.length, 5, 'another def object has its own sprite');
  d2.color = '#123456';
  R.item(main, d2, 0, 0, 0, 1, {});
  h.eq(built.length, 6, 'a changed colour rebuilds it');
  doc.createElement = ce0;
  // the loader's stub context has no transform: every draw is the live art
  const st = api._ctx;
  api._resetCounts();
  R.item(st, def, 50, 50, 0, 1, {});
  R.item(st, def, 50, 50, 0, 1, {});
  h.ok((api._counts.fill || 0) + (api._counts.stroke || 0) > 4 && !(api._counts.drawImage > 0), 'headless draws stay live (the art suites keep testing the art)');
});

// ---------------------------------------------------------------- ARCADE (DESIGN.md "Arcade")
h.test('arcade: cabinet icons on the map, the three machines, monsters, scenes and dice', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, DATA = api.DATA;
  const fps = new Map();
  for (const type of ['plinko', 'wheel', 'slots']) {
    for (const [lbl, tile] of [['lit', { type, revealed: true, q: 1, r: 2 }], ['landmark', { type, revealed: false, known: true, q: 1, r: 2 }], ['done', { type, revealed: true, done: true }]]) {
      const s = drawCheck(`hex ${type} ${lbl}`, c => R.hex(c, 60, 60, 30, tile, { t: 0.4, orient: 'v', fill: '#445544' }));
      if (lbl === 'lit') fps.set(type, fingerprint(s));
    }
    drawCheck('arcIcon ' + type, c => R.arcIcon(c, type, 20, 1.2));
  }
  h.eq(uniqueRatio(fps).ratio, 1, 'the three cabinets draw distinctly');
  const pegs = [];
  for (let i = 0; i < 9; i++) for (let j = 0; j < (i % 2 ? 8 : 9); j++) pegs.push({ x: 90 + j * 46, y: 290 + i * 44, row: i, wall: 0 });
  const slots = [{ k: 'gold', label: '8', col: '#ffc94d' }, { k: 'tix', label: '3 TIX', col: '#ff9ec7' }, { k: 'cap', tier: 'u', label: 'CAPSULE', col: '#ff2e88' }, { k: 'ink', label: '2 BULBS', col: '#8dfff5' }, { k: 'jackpot', label: 'JACKPOT', col: '#fff' }];
  const base = { t: 1.3, col: '#2ee6d6', title: 'PLINKO', party: 0, flash: 0 };
  for (const party of [0, 2]) drawCheck('arcCabinet party ' + party, c => R.arcCabinet(c, 20, 96, 500, 740, Object.assign({}, base, { party, flash: party ? 0.5 : 0 })));
  const pl = Object.assign({}, base, { pegs, slots, lit: { 3: 1, 10: 0.4 }, x0: 50, x1: 490, top: 214, divTop: 682, floor: 760, ballR: 12, pegR: 6, edges: null });
  const a = drawCheck('arcPlinko aiming', c => R.arcPlinko(c, Object.assign({}, pl, { aim: 250, ball: null, win: -1 })));
  const b = drawCheck('arcPlinko dropping', c => R.arcPlinko(c, Object.assign({}, pl, { aim: -1, ball: { x: 250, y: 400 }, win: -1 })));
  drawCheck('arcPlinko won', c => R.arcPlinko(c, Object.assign({}, pl, { aim: -1, ball: null, win: 4, edges: [50, 150, 250, 284, 384, 490] })));
  h.ok(fingerprint(a) !== fingerprint(b), 'aiming and dropping look different');
  const wedges = [{ k: 'gold', label: '15', col: '#ffc94d' }, { k: 'cap', tier: 'r', label: 'CAPSULE', col: '#ff2e88' }, { k: 'curse', label: 'CURSE', col: '#4a3a5a' }, { k: 'double', label: 'x2 SPIN', col: '#2ee6d6' }, { k: 'heal', label: '+10 HP', col: '#a6ff5e' }, { k: 'jackpot', label: 'JACKPOT', col: '#fff' }];
  const w0 = drawCheck('arcWheel still', c => R.arcWheel(c, Object.assign({}, base, { cx: 270, cy: 476, r: 196, rot: 0, flap: 0, wedges, win: -1, mult: 1, spinning: false })));
  const w1 = drawCheck('arcWheel spinning x2', c => R.arcWheel(c, Object.assign({}, base, { cx: 270, cy: 476, r: 196, rot: 2.1, flap: 0.8, wedges, win: 5, mult: 2, spinning: true, party: 2 })));
  h.ok(fingerprint(w0) !== fingerprint(w1), 'the wheel turns');
  const strips = [0, 1, 2].map(() => ['cherry', 'A', 'bell', 'bulb', 'cherry', 'B', 'seven', 'bell', 'cherry', 'C', 'bulb', 'A']);
  const items = Object.keys(DATA.ITEMS).slice(0, 3);
  for (const [lbl, extra] of [['idle', { lever: 0, reels: [{ pos: 0 }, { pos: 3 }, { pos: 6 }], free: 1 }], ['spin', { lever: 1, reels: [{ pos: 2.4, blur: 1 }, { pos: 7.7, blur: 1, flash: 0.5 }, { pos: 11.2, blur: 0.8 }], tease: 1 }],
    ['won', { lever: 0.1, reels: [{ pos: 6 }, { pos: 6 }, { pos: 6 }], winTier: 3, party: 2 }], ['bare', { strips: null, items: null, reels: null }]]) {
    drawCheck('arcSlots ' + lbl, c => R.arcSlots(c, Object.assign({ strips, items, cost: 3, tix: 5 }, base, extra)));
  }
  const syms = new Map();
  for (const s of ['cherry', 'bell', 'bulb', 'seven', 'A', 'B', 'C', 'nope']) syms.set(s, fingerprint(drawCheck('arcSym ' + s, c => R.arcSym(c, s, 50, 50, 58, items, 0.3))));
  h.ok(uniqueRatio(syms).ratio >= 0.85, 'slot symbols draw distinctly');
  const rat = DATA.ENEMIES.rat || Object.values(DATA.ENEMIES)[0];
  const r0 = drawCheck('arcRoamer asleep', c => R.arcRoamer(c, 100, 100, 40, { def: rat, awake: false, t: 1, hop: 0, seed: 3, woke: 0 }));
  const r1 = drawCheck('arcRoamer awake with its arrow', c => R.arcRoamer(c, 100, 100, 40, { def: rat, awake: true, t: 1, hop: 0.5, seed: 3, woke: 1.2, arrow: { x: 160, y: 100, a: 0 } }));
  drawCheck('arcRoamer no def', c => R.arcRoamer(c, 100, 100, 40, null));
  h.ok(fingerprint(r0) !== fingerprint(r1), 'asleep and awake look different');
  const scenes = new Map();
  for (const id of Object.keys(DATA.EVENTS)) {
    const def = DATA.EVENTS[id], enemy = DATA.ENEMIES[def.art] || null;
    const item = enemy ? null : (Object.values(DATA.ITEMS).find(x => x.art === def.art) || null);
    scenes.set(id, fingerprint(drawCheck('arcScene ' + id, c => R.arcScene(c, 508, 190, { id, def, t: 0.7, act: 1, enemy, item, roll: -1, face: 3 }))));
  }
  h.ok(uniqueRatio(scenes).ratio > 0.8, 'the event vignettes differ');
  for (const roll of [0, 0.4, 1]) for (const act of [1, 2, 3]) drawCheck(`arcScene dice ${roll} act ${act}`, c => R.arcScene(c, 508, 190, { id: 'ring_toss', t: 1, act, roll, face: 5 }));
  drawCheck('arcScene empty', c => R.arcScene(c, 508, 190, null));
  for (let f = 1; f <= 6; f++) drawCheck('arcDice ' + f, c => R.arcDice(c, 30, 30, 30, 0.3, f));
});

// ---- Feel (round 4): tip card art, the shopkeeper, the campfire, the forge
h.test('feel: every tip has its own picture, the rooms draw every state', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  for (const n of ['feelTipArt', 'feelKeeper', 'feelCampfire', 'feelForge']) h.eq(typeof R[n], 'function', 'RENDER.' + n + ' exists');
  const I = Object.values(D.ITEMS), E = D.ENEMIES;
  const pick = (f) => I.find(f) || I[0];
  const o = {
    enemy: E.trashpanda || E.rat, item: pick(d => d.art === 'bomb'), items: [pick(d => (d.tags || []).includes('weapon')), pick(d => d.art === 'shield')],
    clover: pick(d => d.art === 'clover'),
  };
  const ids = ['map', 'combo', 'hungry', 'bomb', 'fuse', 'crack', 'capsule', 'tickets', 'arcade', 'roam', 'tower', 'tool', 'luck', 'sig', 'affix', '?'];
  const arts = new Map();
  for (const id of ids) {
    const args = Object.assign({}, o, id === 'crack' ? { item: pick(d => (d.tags || []).includes('glass')) } : id === 'hungry' ? { item: pick(d => (d.tags || []).includes('food')) } : {});
    arts.set(id, fingerprint(drawCheck('feelTipArt ' + id, c => R.feelTipArt(c, id, 56, 1.1, args))));
  }
  h.eq(uniqueRatio(arts).ratio, 1, 'every tip picture is distinct (' + uniqueRatio(arts).dupes.map(d => d.join('=')).join(' ') + ')');
  drawCheck('feelTipArt with no defs falls back', c => R.feelTipArt(c, 'hungry', 56, 0, null));
  const moods = new Map();
  for (const [mood, extra] of [['idle', {}], ['happy', { moodK: 1 }], ['broke', { moodK: 1 }], ['talk', { talk: 1 }], ['blink', { blink: 1 }]])
    moods.set(mood, fingerprint(drawCheck('feelKeeper ' + mood, c => R.feelKeeper(c, 508, 132, Object.assign({ t: 1.7, mood: mood === 'talk' || mood === 'blink' ? 'idle' : mood, look: 0.5 }, extra)))));
  h.eq(uniqueRatio(moods).ratio, 1, 'the keeper looks different in every mood');
  drawCheck('feelKeeper no state', c => R.feelKeeper(c, 508, 132, null));
  const f0 = drawCheck('feelCampfire', c => R.feelCampfire(c, 508, 170, { t: 2.2, charId: 'knight', heal: 0 }));
  const f1 = drawCheck('feelCampfire healing', c => R.feelCampfire(c, 508, 170, { t: 2.2, charId: 'knight', heal: 0.6 }));
  for (const ch of ['alchemist', 'rogue', 'gambler', 'nobody']) drawCheck('feelCampfire ' + ch, c => R.feelCampfire(c, 508, 170, { t: 5, charId: ch, heal: 0 }));
  h.ok(fingerprint(f0) !== fingerprint(f1), 'a heal shows at the fire');
  const flames = new Set();
  for (const t of [0.1, 0.5, 1.3]) flames.add(fingerprint(drawCheck('feelCampfire t ' + t, c => R.feelCampfire(c, 508, 170, { t, charId: 'rogue' }))));
  h.ok(flames.size === 3, 'the fire moves');
  const sword = pick(d => (d.tags || []).includes('weapon'));
  const g0 = drawCheck('feelForge idle', c => R.feelForge(c, 508, 150, { t: 1, item: null, hit: 9, strikes: [] }));
  const g1 = drawCheck('feelForge strike', c => R.feelForge(c, 508, 150, { t: 1, item: sword, heat: 1, hit: 0.03, strikes: [0.05] }));
  const g2 = drawCheck('feelForge done', c => R.feelForge(c, 508, 150, { t: 1, item: sword, heat: 0.3, hit: 0.6, strikes: [0.6, 0.3], done: 0.8 }));
  drawCheck('feelForge no state', c => R.feelForge(c, 508, 150, null));
  h.ok(fingerprint(g0) !== fingerprint(g1) && fingerprint(g1) !== fingerprint(g2), 'the hammer falls, the sparks fly, the upgrade sparkles');
});

// ---------------------------------------------------------------- BESTIARY (round 4)
h.test('bestiary: every enemy breathes, blinks and fidgets its own way; low hp shows', () => {
  const api = boot({ only: ['util', 'data', 'combat', 'render'] });
  const R = api.RENDER, D = api.DATA, L = R.best && R.best.life;
  h.ok(typeof L === 'function', 'RENDER.best.life');
  if (!L) return;
  const kinds = new Set();
  for (const key of ENEMY_KEYS) {
    const def = { id: key, art: key, size: 1, tier: 'normal' };
    let blink = false, fid = false, kind = '';
    for (let t = 0; t < 12; t += 0.02) { const s = L(def, t, {}, 150); if (s.blink > 0.6) blink = true; if (s.fid > 0.9) { fid = true; kind = s.kind; } }
    h.ok(blink, key + ' blinks within 12 s');
    h.ok(fid, key + ' fidgets within 12 s (' + kind + ')');
    kinds.add(kind);
    // deterministic in its inputs (the intro redraws frames), never while frozen or dead
    h.eq(JSON.stringify(L(def, 3.3, {}, 150)), JSON.stringify(L(def, 3.3, {}, 150)), key + ' life is a pure function of t and x');
    let still = true;
    for (let t = 0; t < 12; t += 0.05) { const a = L(def, t, { frozen: true }, 150), b = L(def, t, { dead: 0.5 }, 150); if (a.blink || a.fid || b.blink || b.fid) still = false; }
    h.ok(still, key + ' frozen or dying: no blink, no fidget');
    // low hp changes the drawing (sweat, cracks, dizzy stars)
    const full = drawCheck('enemy ' + key + ' full hp', c => R.enemy(c, def, 200, 250, 1, 1.1, { hpk: 1 }));
    const low = drawCheck('enemy ' + key + ' low hp', c => R.enemy(c, def, 200, 250, 1, 1.1, { hpk: 0.1 }));
    h.ok(fingerprint(full) !== fingerprint(low), key + ' looks hurt at low hp');
  }
  h.ok(kinds.size >= 12, `a dozen or more different fidgets (${[...kinds].join(', ')})`);
  // two of the same enemy side by side never blink together
  const rat = { id: 'rat', art: 'rat', size: 1 };
  let apart = 0;
  for (let t = 0; t < 10; t += 0.02) { const a = L(rat, t, { seed: 0 }, 150), b = L(rat, t, { seed: 1 }, 330); if ((a.blink > 0.6) !== (b.blink > 0.6)) apart++; }
  h.ok(apart > 5, 'twins blink on their own clocks');
  // the blink is cleared after each enemy: a portrait drawn after a mid-blink enemy keeps its eyes open
  let tb = 0;
  for (let t = 0; t < 12 && !tb; t += 0.01) if (L(rat, t, {}, 200).blink > 0.6) tb = t;
  const p0 = drawCheck('portrait before', c => R.portrait(c, 'knight', 40, 40, 64, 1));
  const p1 = drawCheck('portrait after a blink', c => { R.enemy(c, rat, 200, 200, 1, tb, {}); c.stat.seq.length = 0; R.portrait(c, 'knight', 40, 40, 64, 1); });
  h.eq(fingerprint(p0), fingerprint(p1), 'LIFE never leaks into the next drawing');
  // the goblin twirls its wrench, bosses heave
  const gob = { art: 'goblin', size: 1 };
  let tf = 0;
  for (let t = 0; t < 12 && !tf; t += 0.01) if (L(gob, t, {}, 200).fid > 0.95) tf = t;
  h.ok(L(gob, tf, {}, 200).spin > 0.5, 'the goblin spins its wrench');
  for (const id of ['tickler', 'jelly', 'barker', 'magbat', 'mole', 'dozer', 'ghost', 'collector']) drawCheck('DATA enemy ' + id + ' mid fidget', c => { for (let t = 0; t < 8; t += 0.37) R.enemy(c, D.ENEMIES[id], 200, 250, 1, t, { hpk: (t % 1) }); });
});

h.test('bestiary: the machine tricks draw clean and read differently', () => {
  const api = boot({ only: ['util', 'data', 'combat', 'render'] });
  const R = api.RENDER, D = api.DATA, B = R.best;
  const sword = D.ITEMS.rusty_sword || Object.values(D.ITEMS)[0];
  const fps = new Map();
  fps.set('ceiling', fingerprint(drawCheck('best ceiling', c => B.ceiling(c, 30, 412, 416, 1, 1.3))));
  fps.set('field', fingerprint(drawCheck('best field', c => B.field(c, 100, 424, 140, 520, 1.3, 1, 2))));
  fps.set('goo', fingerprint(drawCheck('best goo', c => B.goo(c, 100, 700, 150, 720, 0.4, 1.3))));
  fps.set('slimed', fingerprint(drawCheck('best slimed', c => B.slimed(c, 100, 700, 16, 1.3, 2))));
  fps.set('mound', fingerprint(drawCheck('best mound', c => B.mound(c, 200, 797, sword, 1.3, 1, 3))));
  fps.set('ghostItem', fingerprint(drawCheck('best ghostItem', c => B.ghostItem(c, sword, 200, 700, 0.3, 20, 1.3, 1, false, 2))));
  fps.set('blade', fingerprint(drawCheck('best blade', c => B.blade(c, 300, 650, 800, 446, 1.3, 1))));
  fps.set('wheelSign', fingerprint(drawCheck('best wheelSign', c => B.wheelSign(c, 270, 530, 66, { rot: 1, t: 1.3, k: 1, hi: 3, label: 'YOU: +15 GOLD', who: 'you', flash: 0.5 }))));
  fps.set('feathers', fingerprint(drawCheck('best feathers', c => B.feathers(c, 250, 450, 1.3, 1))));
  fps.set('rival', fingerprint(drawCheck('best rival', c => B.rival(c, 100, 470, 420, 0.5, 1.3, true))));
  fps.set('reticle', fingerprint(drawCheck('best reticle', c => B.reticle(c, 200, 760, 16, 1.3))));
  fps.set('miniClaw', fingerprint(drawCheck('best miniClaw', c => B.miniClaw(c, 50, 50, 1, 0.5, 1, 0.2))));
  h.eq(uniqueRatio(fps).ratio, 1, 'every trick has its own look');
  // off states draw nothing, bad input never throws
  for (const [n, fn] of [['ceiling', c => B.ceiling(c, 30, 412, 416, 0, 1)], ['blade', c => B.blade(c, 300, 650, 800, 446, 1, 0)], ['feathers', c => B.feathers(c, 250, 450, 1, 0)]]) {
    const { ctx, stat } = seqCtx(); fn(ctx); h.eq(stat.paints, 0, n + ' off: nothing drawn');
  }
  const { ctx } = seqCtx();
  let threw = false;
  try { B.mound(ctx, 0, 0, null, NaN, undefined, 0); B.ghostItem(ctx, null, 0, 0, 0, 0, 0, 0); B.wheelSign(ctx, 0, 0, 10, {}); B.goo(ctx, 0, 0, 0, 0, 5, 0); } catch (e) { threw = true; }
  h.ok(!threw, 'bad input never throws');
  // the wheel: its landed wedge lights up; the sign grows in
  const w0 = drawCheck('wheel no hi', c => B.wheelSign(c, 270, 530, 66, { rot: 1, t: 1, k: 1, hi: -1 }));
  const w1 = drawCheck('wheel hi', c => B.wheelSign(c, 270, 530, 66, { rot: 1, t: 1, k: 1, hi: 2, label: 'IT HEALS 12', who: 'it' }));
  h.ok(fingerprint(w0) !== fingerprint(w1), 'the landed wedge and its prize show');
  // the invisible item: fading back in draws differently at each step
  const g1 = drawCheck('ghost 1', c => B.ghostItem(c, sword, 200, 700, 0, 20, 1, 1, false, 0));
  const g0 = drawCheck('ghost 0', c => B.ghostItem(c, sword, 200, 700, 0, 20, 1, 0, false, 0));
  h.ok(fingerprint(g1) !== fingerprint(g0), 'hidden vs found');
});

/* ------------------------------------------------- POLISH (round 5): item identity, relic medallions */
h.test('polish: every item at every rarity and state draws (decals, silhouettes, rim light)', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  h.ok(R.pol && typeof R.pol.art === 'function' && R.pol.on === true, 'RENDER.pol exposed and on by default');
  let n = 0;
  for (const id in D.ITEMS) {
    for (const rarity of ['c', 'u', 'r', 'l', 'junk']) {
      const def = Object.assign({}, D.ITEMS[id], { rarity });
      for (const o of [{}, { plus: true }, { frozen: true }, { plus: true, frozen: true }]) {
        // the raw art (no sprite cache, no try/catch): a throw fails the test
        const st = drawCheck('pol art ' + id + ' ' + rarity + ' ' + JSON.stringify(o), c => R.pol.art(c, def, o));
        if (st.paints) n++;
      }
    }
    drawCheck('pol item ' + id, c => R.item(c, D.ITEMS[id], 50, 50, 0.7, 0.8, { plus: true, glow: true }));
  }
  h.ok(n >= Object.keys(D.ITEMS).length * 20, 'every item x rarity x state drawn (' + n + ')');
  // the silhouettes are real items, the decals are known kinds
  for (const id in R.pol.SIL) h.ok(!!D.ITEMS[id], 'silhouette for a real item: ' + id);
  h.ok(Object.keys(R.pol.SIL).length >= 20 && Object.keys(R.pol.SIL).length <= 45, 'twenty to forty-odd unique silhouettes (' + Object.keys(R.pol.SIL).length + ')');
  const KINDS = ['skull', 'flame', 'rime', 'glint', 'rune', 'pips', 'coin', 'star'];
  const used = {};
  for (const id in D.ITEMS) for (const d of R.pol.info(D.ITEMS[id]).decals) { h.ok(KINDS.includes(d), id + ' decal kind ' + d); used[d] = 1; }
  for (const k of KINDS) h.ok(used[k], 'the ' + k + ' decal is on some item');
  // keyword driven: poison items carry the skull, legendaries the star; small items one decal at most
  for (const id in D.ITEMS) {
    const def = D.ITEMS[id], info = R.pol.info(def), kw = D.kwIds(def);
    if (def.rarity === 'l') h.ok(info.decals.includes('star'), id + ': a legendary star');
    if (kw.includes('poison') && def.rarity !== 'junk') h.ok(info.decals.includes('skull'), id + ': poison skull');
    const sh = def.shape, L = sh.kind === 'circle' ? sh.r * 2 : sh.kind === 'box' ? Math.max(sh.w, sh.h) : 99;
    if (L < 22) h.ok(info.decals.filter(d => d !== 'star').length <= 1, id + ': a small item keeps to one decal');
    if (def.rarity === 'junk') h.eq(info.decals.length, 0, id + ': junk has no decals');
  }
});

h.test('polish: items that share an art key now look different (call fingerprints)', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  const count = () => {
    const fps = new Map();
    for (const id in D.ITEMS) { const { ctx, stat } = seqCtx(); R.pol.art(ctx, D.ITEMS[id], {}); fps.set(id, fingerprint(stat)); }
    return new Set(fps.values()).size;
  };
  R.pol.on = false;
  const off = count();
  R.pol.on = true;
  const on = count();
  const total = Object.keys(D.ITEMS).length;
  h.ok(off <= 60, 'without the pass the items look like their art key (' + off + ' of ' + total + ')');
  h.ok(on >= total - 3, 'with it nearly every item has its own drawing (' + on + ' of ' + total + ')');
});

h.test('polish: the item sprite cache keys include the decals and rebuild when they change', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  const venom = D.ITEMS.venom_dart, shiv = D.ITEMS.shiv, aegis = D.ITEMS.aegis;
  h.ok(R.pol.key(venom).includes('skull'), 'the poison dart key names its skull');
  h.ok(R.pol.key(aegis).includes('star') && R.pol.key(aegis).includes(':l'), 'a legendary key names its star and rim');
  h.ok(R.pol.key(venom) !== R.pol.key(shiv), 'two daggers with different decals key differently');
  h.ok(R.pol.key(venom, { plus: true }) !== R.pol.key(venom), 'plus is in the key');
  h.ok(R.pol.key(venom, { frozen: true }) !== R.pol.key(venom), 'frozen is in the key');
  // a transformable ctx: RENDER.item builds a sprite on an offscreen canvas
  const mk = () => { const { ctx, stat } = seqCtx(); ctx.getTransform = () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }); return { ctx, stat }; };
  const a = mk();
  R.item(a.ctx, venom, 40, 40, 0, 1, {});
  const V1 = R.pol.sprites(venom);
  const sp1 = V1 && Object.values(V1).find(Boolean);
  h.ok(!!sp1, 'a sprite was cached');
  h.eq(sp1 && sp1.dk, R.pol.info(venom).key, 'the sprite carries its decal key');
  h.ok(a.stat.seq.includes('drawImage'), 'the cached sprite is blitted');
  R.item(mk().ctx, venom, 40, 40, 0, 1, {});
  h.ok(Object.values(R.pol.sprites(venom)).includes(sp1), 'a second draw reuses the sprite');
  // the identity layer off: the key changes and the sprite is drawn again
  R.pol.on = false;
  R.item(mk().ctx, venom, 40, 40, 0, 1, {});
  const sp2 = Object.values(R.pol.sprites(venom)).find(Boolean);
  h.ok(sp2 && sp2 !== sp1 && sp2.dk === 'off', 'turning the layer off re-keys and redraws the sprite');
  R.pol.on = true;
  R.item(mk().ctx, venom, 40, 40, 0, 1, {});
  const sp3 = Object.values(R.pol.sprites(venom)).find(Boolean);
  h.ok(sp3 && sp3 !== sp2 && sp3.dk === R.pol.info(venom).key, 'and back on again');
});

h.test('polish: PNG overrides still win over the drawn item and relic art', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, ART = api.ART;
  const img = { naturalWidth: 64, naturalHeight: 64, width: 64, height: 64, complete: true };
  const orig = ART.get;
  const st0 = Object.assign({}, R.pol.stats);
  drawCheck('pol no png', c => R.pol.art(c, D.ITEMS.cherry_bomb, {}));
  drawCheck('pol no png aegis', c => R.pol.art(c, D.ITEMS.aegis, {}));
  h.ok(R.pol.stats.decal > st0.decal && R.pol.stats.rim > st0.rim, 'drawn art gets its decals and rim');
  // an item PNG (by id, then by art key)
  for (const kind of ['itemId', 'item']) {
    ART.get = (k, key) => (k === kind && (key === 'aegis' || key === 'shield') ? img : null);
    const s1 = Object.assign({}, R.pol.stats);
    const st = drawCheck('pol png ' + kind, c => R.pol.art(c, D.ITEMS.aegis, { plus: true }));
    h.ok(st.seq.includes('drawImage'), kind + ' PNG is drawn');
    h.eq(R.pol.stats.decal, s1.decal, kind + ' PNG: no decals over it');
    h.eq(R.pol.stats.rim, s1.rim, kind + ' PNG: no rim pass');
    const stItem = drawCheck('pol png item ' + kind, c => R.item(c, D.ITEMS.aegis, 30, 30, 0, 1, {}));
    h.ok(stItem.seq.includes('drawImage'), kind + ' PNG wins in RENDER.item too');
    h.eq(R.pol.stats.decal, s1.decal, kind + ' PNG in RENDER.item: still no decals');
  }
  // a relic PNG: no medallion
  const rid = Object.keys(D.RELICS)[0];
  ART.get = (k, key) => (k === 'relic' && key === rid ? img : null);
  const b0 = R.pol.stats.badge;
  const st = drawCheck('relic png', c => R.relicIcon(c, D.RELICS[rid], 20, 20, 32, 1.2));
  h.ok(st.seq.includes('drawImage'), 'the relic PNG is drawn');
  h.eq(R.pol.stats.badge, b0, 'no medallion around a relic PNG');
  h.ok(!R.relicLive(D.RELICS[rid], 0.1), 'a relic PNG never needs a redraw');
  ART.get = orig;
  drawCheck('relic drawn', c => R.relicIcon(c, D.RELICS[rid], 20, 20, 32));
  h.eq(R.pol.stats.badge, b0 + 1, 'without the PNG the medallion is drawn');
});

h.test('polish: relic medallions for every relic at every rarity, the shine and the rainbow', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  const TIERS = { c: 'c', u: 'u', r: 'r', boss: 'l', l: 'l', event: 'event' };
  for (const id in D.RELICS) {
    for (const rarity in TIERS) {
      const def = Object.assign({}, D.RELICS[id], { rarity });
      h.eq(R.pol.tier(def), TIERS[rarity], id + ' ' + rarity + ' tier');
      for (const t of [undefined, 0, 0.37, 2.2, 7.9]) drawCheck('relic ' + id + ' ' + rarity + ' t' + t, c => R.relicIcon(c, def, 30, 30, 44, t));
    }
  }
  drawCheck('relic without a def', c => R.relicIcon(c, null, 10, 10, 20, 1));
  const def = D.RELICS[Object.keys(D.RELICS)[0]];
  const fp = (rar) => fingerprint(drawCheck('relic fp ' + rar, c => R.relicIcon(c, Object.assign({}, def, { rarity: rar }), 30, 30, 44)));
  h.ok(fp('r') !== fp('c') && fp('boss') !== fp('r') && fp('boss') !== fp('c'), 'gold and rainbow frames draw differently from bronze');
  // animation: legendary always live; a common only while its shine sweeps, each relic on its own phase
  const leg = Object.assign({}, def, { rarity: 'boss' }), com = Object.assign({}, def, { rarity: 'c' });
  h.ok(R.relicLive(leg, 0) && R.relicLive(leg, 3.3), 'the rainbow is always turning');
  let live = 0, steps = 0;
  for (let t = 0; t < R.pol.SHINE.period; t += 0.05, steps++) if (R.relicLive(com, t)) live++;
  const frac = live / steps;
  h.ok(frac > 0.08 && frac < 0.3, 'a common shines a short part of the time (' + frac.toFixed(2) + ')');
  const phases = new Set();
  for (const id of Object.keys(D.RELICS).slice(0, 12)) { let t = 0; while (R.pol.shine(D.RELICS[id], t) < 0 && t < 10) t += 0.05; phases.add(Math.round(t * 4)); }
  h.ok(phases.size > 3, 'relics shine on their own phases (' + phases.size + ')');
  h.eq(R.pol.shine(def, undefined), -1, 'no t: a still badge (no sweep)');
  let tIn = 0; while ((R.pol.shine(def, tIn) < 0.3 || R.pol.shine(def, tIn) > 0.7) && tIn < 10) tIn += 0.01;
  h.ok(fingerprint(drawCheck('still', c => R.relicIcon(c, def, 30, 30, 44))) !== fingerprint(drawCheck('sweep', c => R.relicIcon(c, def, 30, 30, 44, tIn))), 'the shine sweep draws');
});

h.test('bestiary: map decor on lit land per biome, never on the dark or the sea; the act 3 aurora', () => {
  const api = boot({ only: ['util', 'data', 'map', 'render'] });
  const R = api.RENDER;
  const land = (biome, ground, revealed) => ({ q: 1, r: 2, type: 'empty', terrain: 'land', ground, biome, elev: 0.3, revealed });
  for (const biome of ['cellar', 'foundry', 'vault']) {
    let decorated = 0;
    for (let seed = 1; seed < 400; seed += 7) {
      const st = { t: 1.2, orient: 'v', biome, fill: '#333', seed: (seed * 2654435761) >>> 0 };
      const lit = drawCheck('hex decor ' + biome + ' ' + seed, c => R.hex(c, 100, 100, 46, land(biome, 'grass', true), st));
      const bare = drawCheck('hex no seed ' + biome, c => R.hex(c, 100, 100, 46, land(biome, 'grass', true), { t: 1.2, orient: 'v', biome, fill: '#333' }));
      if (fingerprint(lit) !== fingerprint(bare)) decorated++;
      const dark = drawCheck('hex dark ' + biome, c => R.hex(c, 100, 100, 46, land(biome, 'grass', false), st));
      const darkBare = drawCheck('hex dark bare ' + biome, c => R.hex(c, 100, 100, 46, land(biome, 'grass', false), { t: 1.2, orient: 'v', biome, fill: '#333' }));
      h.eq(fingerprint(dark), fingerprint(darkBare), biome + ' dark hex: no decor');
      const sea = { q: 1, r: 2, type: 'empty', terrain: 'sea', ground: 'sea', biome, revealed: true };
      h.eq(fingerprint(drawCheck('sea ' + biome, c => R.hex(c, 100, 100, 46, sea, st))), fingerprint(drawCheck('sea bare', c => R.hex(c, 100, 100, 46, sea, { t: 1.2, orient: 'v', biome, fill: '#333' }))), biome + ' sea: no decor');
    }
    h.ok(decorated >= 12 && decorated <= 45, `${biome}: about four lit hexes in eleven get a prop (${decorated} of 57)`);
  }
  // animated but a pure function of t (the intro redraws frames)
  const st = { t: 2.7, orient: 'v', biome: 'foundry', fill: '#333', seed: 12345677 };
  h.eq(fingerprint(drawCheck('decor a', c => R.hex(c, 100, 100, 46, land('foundry', 'dirt', true), st))), fingerprint(drawCheck('decor b', c => R.hex(c, 100, 100, 46, land('foundry', 'dirt', true), st))), 'decor is deterministic in t');
  const sky3 = drawCheck('sky act 3', c => R.best.sky(c, 0, 172, 540, 3, 1.5));
  h.ok(sky3.paints > 3, 'the act 3 map has an aurora');
  const { ctx, stat } = seqCtx(); R.best.sky(ctx, 0, 172, 540, 1, 1.5); R.best.sky(ctx, 0, 172, 540, 2, 1.5);
  h.eq(stat.paints, 0, 'acts 1 and 2 keep their sky');
});

// VAULT (round 5): the Prize Vault's cosmetics on the cabinet, the claw, the portraits, the trail; thumbnails, the wall, the share card.
h.test('vault: render-only (no DATA) every slot is the default look', () => {
  const R = boot({ only: ['util', 'render'] }).RENDER;
  h.ok(R.vault && typeof R.vault.equip === 'function' && typeof R.vault.thumb === 'function' && typeof R.vault.share === 'function', 'RENDER.vault loads without DATA');
  const cfg = { w: 480, h: 390 };
  const base = fingerprint(drawCheck('cabinet, no vault', c => R.cabinetBack(c, 30, 410, cfg, { t: 1, act: 1 })));
  R.vault.equip({ skin: 'skin_space', paint: 'paint_gold', marquee: 'mq_hot', trail: 'trail_fire', outfit: { knight: 'fit_knight_cape' } });
  h.eq(fingerprint(drawCheck('cabinet, ids without DATA', c => R.cabinetBack(c, 30, 410, cfg, { t: 1, act: 1 }))), base, 'unknown ids change nothing');
  drawCheck('a thumbnail without DATA', c => R.vault.thumb(c, 'skin_space', 50, 50, 100, 0.5));
  drawCheck('the share card without DATA', c => R.vault.share(c, { char: 'knight', score: 10 }));
});
h.test('vault: every skin, marquee, paint, outfit and trail draws, balanced and distinct', () => {
  const api = boot({ only: ['util', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, P = api.PHYS;
  const cfg = { w: 480, h: 390, frame: 30, chuteW: 64, dividerH: 0.45 };
  const base = fingerprint(drawCheck('cabinet, nothing equipped', c => R.cabinetBack(c, 30, 410, cfg, { t: 1.3, act: 2 })));
  h.eq(fingerprint(drawCheck('cabinet, the classic skin', c => R.cabinetBack(c, 30, 410, cfg, { t: 1.3, act: 2, skin: 'skin_classic', mqId: 'mq_classic' }))), base, 'the default skin and marquee are the old cabinet exactly');
  // skins
  const skins = new Map();
  for (const id of D.vaultList('skin')) {
    const fp = drawCheck('skin ' + id, c => { R.cabinetBack(c, 30, 410, cfg, { t: 2.1, act: 1, skin: id }); R.cabinetFront(c, 30, 410, cfg, { t: 2.1, skin: id }); });
    skins.set(id, fingerprint(fp));
    drawCheck('skin ' + id + ' in a party, tilted', c => R.cabinetBack(c, 30, 410, cfg, { t: 0.7, act: 3, skin: id, party: 1, marquee: 'JACKPOT!', tilt: 1 }));
    drawCheck('skin ' + id + ' under the alarm', c => R.cabinetBack(c, 30, 410, cfg, { t: 0.7, act: 3, skin: id, alarm: 1 }));
  }
  const us = uniqueRatio(skins);
  h.eq(us.ratio, 1, 'every skin draws differently ' + JSON.stringify(us.dupes));
  // the equipped skin applies with no st.skin
  R.vault.equip({ skin: 'skin_space' });
  h.eq(fingerprint(drawCheck('equipped skin', c => { R.cabinetBack(c, 30, 410, cfg, { t: 2.1, act: 1 }); R.cabinetFront(c, 30, 410, cfg, { t: 2.1 }); })), skins.get('skin_space'), 'equip: the cabinet wears the equipped skin');
  h.eq(fingerprint(drawCheck('st.skin wins', c => R.cabinetBack(c, 30, 410, cfg, { t: 1.3, act: 2, skin: null }))), base, 'st.skin null is the default look, whatever is equipped');
  R.vault.equip({});
  // marquees
  const mqs = new Map();
  for (const id of D.vaultList('marquee')) mqs.set(id, fingerprint(drawCheck('marquee ' + id, c => R.cabinetBack(c, 30, 410, cfg, { t: 1.7, act: 1, mqId: id }))));
  h.eq(uniqueRatio(mqs).ratio, 1, 'every marquee draws differently (text, style, bulbs)');
  for (const id of D.vaultList('marquee')) drawCheck('marquee plate ' + id, c => R.vault.marquee(c, D.COSMETICS[id].look, 100, 20, 13, 0.9, '#ff2e88'));
  // paints on every claw type (a paint may only change colours: fingerprint the colours too)
  const colorPrint = (fn) => {
    const seq = [];
    const ctx = new Proxy({ canvas: { width: 540, height: 960 } }, {
      get(t, k) {
        if (k === 'canvas') return t.canvas;
        if (k === 'measureText') return () => ({ width: 40 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop(o, c) { seq.push('stop:' + c); } });
        if (typeof k !== 'string' || k === 'then') return t[k];
        if (k in t) return t[k];
        return () => { seq.push(k); };
      },
      set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') seq.push(k + '=' + (typeof v === 'string' ? v : 'obj')); t[k] = v; return true; },
    });
    fn(ctx);
    return seq.join(',');
  };
  const J = { t: 1.1, mood: 'happy' };
  const pose = (ty) => P.clawPose(ty, { x: 200, y: 120, open: 0.6 });
  const paints = new Map();
  const plain = colorPrint(c => R.claw(c, pose('classic'), 0, 0, { juice: J }));
  for (const id of D.vaultList('paint')) {
    for (const ty of Object.keys(P.CLAW_TYPES)) {
      drawCheck(`paint ${id} on ${ty}`, c => R.claw(c, pose(ty), 0, 0, { paint: id, juice: J }));
      const fp = colorPrint(c => R.claw(c, pose(ty), 0, 0, { paint: id, juice: J }));
      if (ty === 'classic') paints.set(id, fp);
      else if (id !== 'paint_chrome') h.ok(fp !== colorPrint(c => R.claw(c, pose(ty), 0, 0, { juice: J })), `${id} shows on the ${ty}`);
    }
  }
  h.eq(uniqueRatio(paints).ratio, 1, 'every paint draws differently');
  h.eq(paints.get('paint_chrome'), plain, 'Factory Chrome is the old claw');
  h.eq(colorPrint(c => R.claw(c, pose('classic'), 0, 0, { juice: J })), plain, 'the paint never leaks into the next claw');
  R.vault.equip({ paint: 'paint_frost' });
  h.eq(colorPrint(c => R.claw(c, pose('classic'), 0, 0, { juice: J })), paints.get('paint_frost'), 'equip: the claw wears the equipped paint');
  R.vault.equip({});
  // outfits
  const bare = {};
  for (const ch of ['knight', 'alchemist', 'rogue', 'gambler']) bare[ch] = fingerprint(drawCheck('portrait ' + ch, c => R.portrait(c, ch, 60, 60, 90, 0.8)));
  const fits = new Map();
  for (const id of D.vaultList('outfit')) {
    const ch = D.COSMETICS[id].char;
    const fp = fingerprint(drawCheck('outfit ' + id, c => R.vault.withOutfit(c, ch, 60, 60, 90, 0.8, id)));
    h.ok(fp !== bare[ch], id + ' shows on ' + ch);
    fits.set(id, fp);
    const other = ch === 'knight' ? 'rogue' : 'knight';
    h.eq(fingerprint(drawCheck('outfit ' + id + ' on ' + other, c => R.vault.withOutfit(c, other, 60, 60, 90, 0.8, id))), bare[other], id + ' is not for ' + other);
  }
  h.eq(uniqueRatio(fits).ratio, 1, 'every outfit draws differently');
  R.vault.equip({ outfit: { alchemist: 'fit_alch_wizard' } });
  h.eq(fingerprint(drawCheck('equipped outfit', c => R.portrait(c, 'alchemist', 60, 60, 90, 0.8))), fits.get('fit_alch_wizard'), 'equip: the portrait (HUD, map token, versus card) wears it');
  h.eq(fingerprint(drawCheck('other crawler', c => R.portrait(c, 'knight', 60, 60, 90, 0.8))), bare.knight, 'the other crawlers are untouched');
  R.vault.equip({});
  // trails
  const pts = [];
  for (let i = 0; i < 12; i++) pts.push({ x: 40 + i * 12, y: 100 + Math.sin(i) * 8, a: i * 0.18, s: i });
  const trails = new Map();
  for (const id of D.vaultList('trail')) {
    if (id === D.VAULT_DEFAULT.trail) { const { ctx, stat } = seqCtx(); R.vault.trail(ctx, pts, pts.length, 1, id, 46); h.eq(stat.paints, 0, 'the default trail adds nothing (the old dust puffs stay)'); continue; }
    trails.set(id, fingerprint(drawCheck('trail ' + id, c => R.vault.trail(c, pts, pts.length, 1.3, id, 46))));
  }
  h.eq(uniqueRatio(trails).ratio, 1, 'every trail draws differently');
  const old = pts.map(p => ({ x: p.x, y: p.y, a: 9, s: p.s }));
  const { ctx: c0, stat: s0 } = seqCtx(); R.vault.trail(c0, old, old.length, 1, 'trail_hearts', 46);
  h.eq(s0.paints, 0, 'marks past their life are gone');
  // thumbnails
  const th = new Map();
  for (const id of D.COSMETIC_IDS) { drawCheck('thumb ' + id, c => R.vault.thumb(c, id, 50, 50, 80, 0.6)); th.set(id, colorPrint(c => R.vault.thumb(c, id, 50, 50, 80, 0.6))); }
  h.ok(uniqueRatio(th).ratio === 1, 'every thumbnail is distinct ' + JSON.stringify(uniqueRatio(th).dupes.slice(0, 3)));
});
h.test('vault: the wall, the glass and the share card', () => {
  const api = boot({ only: ['util', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  const win = { x: 14, y: 84, w: 512, h: 252 };
  drawCheck('the vault wall', c => R.vault.wall(c, 540, 960, 1.2, { win }));
  drawCheck('the vault wall, no window', c => R.vault.wall(c, 540, 960, 0, {}));
  drawCheck('the glass', c => R.vault.glass(c, win, 3.3));
  const items = ['rusty_sword', 'dented_shield', 'bubble_flask', 'prize_marble'].map(id => D.ITEMS[id]).filter(Boolean);
  const card = { char: 'alchemist', name: 'Mira', title: 'The Alchemist', won: true, score: 123456, mode: 'endless', tilt: 4, loop: 3, act: 3,
    muts: [{ icon: 'G', name: 'Glass', color: '#8dfff5' }, { icon: 'L', name: 'Low Gravity', color: '#a6ff5e' }], combo: { name: 'Mega Jackpot', tier: 3 }, bigHit: 88,
    boss: 'The Prize Master', items, skin: 'skin_rainbow', paint: 'paint_rainbow', marquee: 'mq_rainbow', outfit: 'fit_alch_wizard', clawType: 'magnet', url: 'https://games-71g.pages.dev/clawspire/', date: '2026-09-28', t: 0.8 };
  const won = drawCheck('the share card, a win', c => R.vault.share(c, card));
  const lost = drawCheck('the share card, a loss', c => R.vault.share(c, Object.assign({}, card, { won: false, muts: [], combo: null, outfit: null, loop: 0, mode: 'classic' })));
  h.ok(fingerprint(won) !== fingerprint(lost), 'a win and a loss make different cards');
  const { ctx, stat } = seqCtx();
  R.vault.share(ctx, card);
  h.ok(stat.seq.filter(k => k === 'fillText').length >= 12, 'the card is full of words (score, stats, the URL)');
  drawCheck('the share card, empty', c => R.vault.share(c, {}));
});

// ---------------------------------------------------------------- PETS (round 5)
h.test('pets: every pet in every pose, mood and level look, distinct', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  for (const n of ['pet', 'petTag', 'petBed', 'petIcon', 'arcMoles', 'arcSkee']) h.eq(typeof R[n], 'function', 'RENDER.' + n + ' exists');
  h.eq(JSON.stringify(R.pets.KEYS.slice().sort()), JSON.stringify(D.PET_IDS.slice().sort()), 'the renderer draws exactly the pets in DATA');
  const kinds = new Map();
  for (const id of D.PET_IDS) {
    const base = drawCheck('pet ' + id, c => R.pet(c, id, 100, 200, 1.2, { t: 1.3, lv: 1 }));
    kinds.set(id, fingerprint(base));
    const looks = new Map(), moods = new Map(), poses = new Map();
    for (const lv of [1, 2, 4, 5]) looks.set(lv, fingerprint(drawCheck(`pet ${id} lv ${lv}`, c => R.pet(c, id, 100, 200, 1, { t: 1.3, lv }))));
    h.eq(uniqueRatio(looks).ratio, 1, id + ': a new look at Lv 2, 4 and 5');
    for (const mood of ['', 'happy', 'cheer', 'scared', 'sleep', 'sad', 'eat']) moods.set(mood || 'none', fingerprint(drawCheck(`pet ${id} ${mood}`, c => R.pet(c, id, 100, 200, 1, { t: 1.3, lv: 1, mood, moodK: 1 }))));
    h.ok(uniqueRatio(moods).ratio >= 6 / 7, id + ': the moods read differently ' + JSON.stringify(uniqueRatio(moods).dupes));
    for (const pose of ['sit', 'run', 'fly', 'act', 'ride']) poses.set(pose, fingerprint(drawCheck(`pet ${id} ${pose}`, c => R.pet(c, id, 100, 200, 1, { t: 1.3, lv: 3, pose, k: 0.4, dir: -1, sq: 0.5, air: pose === 'fly', lvUp: 0.5, blink: 1, look: -0.6 }))));
  }
  h.eq(uniqueRatio(kinds).ratio, 1, 'every pet is drawn differently');
  // the octopus's holding arm
  const arm = drawCheck('octopus holding', c => R.pet(c, 'octopus', 100, 200, 1, { t: 1, lv: 1, pose: 'ride', reach: { x: 20, y: 30 } }));
  h.ok(fingerprint(arm) !== fingerprint(drawCheck('octopus riding', c => R.pet(c, 'octopus', 100, 200, 1, { t: 1, lv: 1, pose: 'ride' }))), 'the octopus reaches for what it holds');
  drawCheck('an unknown pet falls back', c => R.pet(c, 'dragon', 100, 200, 1, null));
  drawCheck('a pet with no state', c => R.pet(c, 'cat', 100, 200));
  // deterministic: the same frame twice
  h.eq(fingerprint(drawCheck('goose again', c => R.pet(c, 'goose', 1, 2, 1, { t: 2.5, lv: 5, mood: 'happy' }))), fingerprint(drawCheck('goose again 2', c => R.pet(c, 'goose', 1, 2, 1, { t: 2.5, lv: 5, mood: 'happy' }))), 'a pet frame is a pure function of its state');
  // the tag, the bed, the icons
  const t0 = drawCheck('tag', c => R.petTag(c, 64, 399, { name: 'Mittens', lv: 3, col: '#ff2e88', xpK: 0.4 }));
  h.ok(t0.seq.includes('fillText'), 'the tag writes the name');
  drawCheck('tag, flash and full xp', c => R.petTag(c, 64, 399, { name: 'A very long name', lv: 5, xpK: 1, flash: 1 }));
  drawCheck('tag, no state', c => R.petTag(c, 64, 399, null));
  drawCheck('bed', c => R.petBed(c, 50, 50, 1, '#2ee6d6'));
  const icons = new Map();
  for (const ty of ['petshop', 'moles', 'skee']) icons.set(ty, fingerprint(drawCheck('icon ' + ty, c => R.petIcon(c, ty, 20, 1.2))));
  h.eq(uniqueRatio(icons).ratio, 1, 'three distinct map icons');
  // the map hexes: lit with the icon, dark as a landmark silhouette
  for (const type of ['petshop', 'moles', 'skee']) {
    const lit = drawCheck('hex ' + type, c => R.hex(c, 100, 100, 40, { q: 1, r: 1, type, revealed: true, terrain: 'land', ground: 'grass' }, { t: 1, fill: '#556b2f', orient: 'v' }));
    const empty = drawCheck('hex empty', c => R.hex(c, 100, 100, 40, { q: 1, r: 1, type: 'empty', revealed: true, terrain: 'land', ground: 'grass' }, { t: 1, fill: '#556b2f', orient: 'v' }));
    h.ok(lit.paints > empty.paints + 5, type + ': the hex shows its icon');
    drawCheck('hex dark ' + type, c => R.hex(c, 100, 100, 40, { q: 1, r: 1, type, revealed: false, known: true, terrain: 'land' }, { t: 1, fill: '#556b2f', orient: 'v' }));
  }
});
h.test('pets: the whack-a-mole and skee-ball machines, the tip pictures', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER;
  const holes = []; for (const y of [372, 512, 652]) for (const x of [130, 270, 410]) holes.push({ x, y });
  const base = { t: 1.1, holes, moles: [], score: 0, best: 0, combo: 0, time: 14, dur: 14, phase: 'idle' };
  const states = new Map();
  states.set('idle', fingerprint(drawCheck('moles idle', c => R.arcMoles(c, base))));
  states.set('count', fingerprint(drawCheck('moles count', c => R.arcMoles(c, Object.assign({}, base, { phase: 'count', count: 2, countK: 0.4 })))));
  states.set('go', fingerprint(drawCheck('moles go', c => R.arcMoles(c, Object.assign({}, base, { phase: 'count', count: 0, countK: 0.2 })))));
  const up = [{ hole: 0, kind: 'mole', up: 1, hit: 0 }, { hole: 4, kind: 'gold', up: 0.6, hit: 0 }, { hole: 8, kind: 'bomb', up: 1, hit: 0 }];
  states.set('play', fingerprint(drawCheck('moles play', c => R.arcMoles(c, Object.assign({}, base, { phase: 'play', moles: up, score: 120, combo: 4, time: 6.2 })))));
  states.set('whack', fingerprint(drawCheck('moles whack', c => R.arcMoles(c, Object.assign({}, base, { phase: 'play', moles: [{ hole: 3, kind: 'mole', up: 1, hit: 0.8 }], mallet: { x: 130, y: 470, k: 0.7 }, flash: { 3: 1 }, time: 2 })))));
  states.set('bomb', fingerprint(drawCheck('moles bomb', c => R.arcMoles(c, Object.assign({}, base, { phase: 'play', moles: [{ hole: 3, kind: 'bomb', up: 1, hit: 0.8 }], flash: { 3: 0.3 }, time: 1 })))));
  h.eq(uniqueRatio(states).ratio, 1, "every whack-a-mole state draws differently " + JSON.stringify(uniqueRatio(states).dupes));
  drawCheck('moles with no state', c => R.arcMoles(c, null));
  const board = { cx: 270, cy: 322, rings: [108, 84, 62, 42, 22], cups: [{ x: 140, y: 196, r: 15 }, { x: 400, y: 196, r: 15 }] };
  const lane = { x0: 205, x1: 335, y0: 452, x2: 135, x3: 405, y1: 790 };
  const sk = { t: 0.7, board, lane, ball: null, balls: 5, thrown: [], total: 0, lit: {}, aim: 250, pow: 0.6, phase: 'idle' };
  const ss = new Map();
  ss.set('idle', fingerprint(drawCheck('skee idle', c => R.arcSkee(c, sk))));
  ss.set('swipe', fingerprint(drawCheck('skee swipe', c => R.arcSkee(c, Object.assign({}, sk, { swipe: { x0: 270, y0: 760, x1: 260, y1: 600 } })))));
  ss.set('roll', fingerprint(drawCheck('skee roll', c => R.arcSkee(c, Object.assign({}, sk, { phase: 'play', balls: 4, ball: { x: 262, y: 600, r: 13 } })))));
  ss.set('air', fingerprint(drawCheck('skee air', c => R.arcSkee(c, Object.assign({}, sk, { phase: 'play', balls: 4, ball: { x: 262, y: 380, r: 9, air: true, sy: 452 } })))));
  ss.set('lit', fingerprint(drawCheck('skee lit', c => R.arcSkee(c, Object.assign({}, sk, { phase: 'play', balls: 3, thrown: [50, 100], total: 150, lit: { 4: 1, c1: 1 } })))));
  h.eq(uniqueRatio(ss).ratio, 1, "every skee-ball state draws differently " + JSON.stringify(uniqueRatio(ss).dupes));
  drawCheck('skee with no state', c => R.arcSkee(c, null));
  const tips = new Map();
  for (const id of ['pet', 'petshop', 'moles', 'skee', 'arcade', 'map']) tips.set(id, fingerprint(drawCheck('tip art ' + id, c => R.feelTipArt(c, id, 56, 1.1, {}))));
  h.eq(uniqueRatio(tips).ratio, 1, 'the round 5 tips have their own pictures');
});

/* ------------------------------------------------- ACCESS (round 6) */
h.test('round 6: colour-blind palettes change every signal colour and keep the roles apart', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, A = R.acc, D = api.DATA;
  h.ok(A && typeof A.set === 'function', 'RENDER.acc exists');
  h.eq(A.mode, 'off', 'off by default');
  const SIG = ['#ff5a4a', '#a6ff5e', '#2ee6d6', '#ff2e88', '#ffc94d', '#ff8a2b', '#3b6fd6'];
  h.ok(SIG.every(c => A.col(c) === c), 'off: every colour passes through');
  const rar0 = JSON.stringify(R.RARITY_COL);
  const key0 = R.pol.key(D.ITEMS[Object.keys(D.ITEMS).find(id => D.ITEMS[id].rarity === 'r')]);
  for (const mode of ['deutan', 'protan', 'tritan']) {
    A.set({ mode });
    h.eq(A.mode, mode, mode + ' set');
    const out = SIG.map(A.col);
    h.ok(out.every((c, i) => c !== SIG[i]), mode + ': every signal colour changes (' + out.join(' ') + ')');
    h.eq(new Set(out).size, out.length, mode + ': the roles stay apart');
    h.ok(A.col('#FF5A4A') === out[0] && A.col('rgba(255,0,0,1)') === 'rgba(255,0,0,1)', mode + ': any case, other colours untouched');
    for (const r of ['u', 'r', 'l']) h.ok(R.RARITY_COL[r] !== JSON.parse(rar0)[r], mode + ': rarity ' + r + ' recoloured');
    h.eq(R.RARITY_COL.c, JSON.parse(rar0).c, mode + ': common stays grey');
    h.eq(new Set(['c', 'u', 'r', 'l'].map(r => R.RARITY_COL[r])).size, 4, mode + ': four distinct rarity colours');
    // damage vs heal vs block numbers: their own colours, and signs or words besides
    const dn = R.fx.num(100, 100, '−5', '#ff5a4a'), hn = R.fx.num(200, 100, '+5', '#a6ff5e'), bn = R.fx.text(300, 100, '+5 block', '#2ee6d6');
    h.ok(dn.col === out[0] && hn.col === out[1] && bn.col === out[2], mode + ': the numbers take the palette');
    h.ok(dn.col !== hn.col && hn.col !== bn.col && dn.col !== bn.col, mode + ': damage, heal and block differ');
    h.ok(/^−/.test(dn.str) && /^\+/.test(hn.str) && /block/.test(bn.str), mode + ': and never by colour alone (sign, words)');
    R.fx.clear();
    // the intent bubbles and the status chips draw clean in every mode
    for (const k of ['attack', 'buff', 'debuff', 'heal', 'charge']) drawCheck(mode + ' intent ' + k, c => R.intent(c, 200, 120, { intent: { k, v: 6, s: 'str' }, charged: k === 'charge' }, 0.5));
    drawCheck(mode + ' status chips', c => R.statusPips(c, 20, 20, { poison: 3, str: 2, weak: 1 }, 18));
  }
  h.ok(R.pol.key(D.ITEMS[Object.keys(D.ITEMS).find(id => D.ITEMS[id].rarity === 'r')]) !== key0, 'the item sprites re-key (their rim light recolours)');
  A.set({ mode: 'off' });
  h.eq(JSON.stringify(R.RARITY_COL), rar0, 'off again: the rarity table is the old one exactly');
  h.ok(SIG.every(c => A.col(c) === c), 'off again: colours pass through');
  A.set({ mode: 'nonsense' });
  h.eq(A.mode, 'off', 'an unknown mode is off');
});

h.test('round 6: statuses keep distinct shapes, the map marks dangers and pickups', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, A = R.acc, D = api.DATA;
  const icons = Object.values(D.STATUS).map(s => s.icon);
  h.eq(new Set(icons).size, icons.length, 'every status has its own icon (' + icons.length + ')');
  const sb = A.shape('buff'), sd = A.shape('debuff');
  h.ok(sb.outline !== sd.outline && sb.mark !== sd.mark, 'a buff and a debuff differ in outline and mark');
  const chip = (st) => fingerprint(drawCheck('chip ' + Object.keys(st)[0], c => R.statusPips(c, 20, 20, st, 18)));
  const offB = chip({ str: 2 }), offD = chip({ weak: 2 });
  A.set({ mode: 'deutan' });
  const onB = chip({ str: 2 }), onD = chip({ weak: 2 });
  h.ok(onB !== offB && onD !== offD, 'a colour-blind mode adds the marks');
  h.ok(onB.split(',').filter(s => s === 'lineTo').length !== onD.split(',').filter(s => s === 'lineTo').length, 'the debuff chip is angular, the buff chip round');
  for (const k of ['up', 'down', 'danger', 'pickup']) drawCheck('mark ' + k, c => A.mark(c, k, 20, 20, 8));
  h.eq(A.tileKind('fight'), 'danger', 'a fight is a danger'); h.eq(A.tileKind('elite'), 'danger', 'an elite too'); h.eq(A.tileKind('boss'), 'danger', 'the boss too');
  h.eq(A.tileKind('treasure'), 'pickup', 'a treasure is a pickup'); h.eq(A.tileKind('gem'), 'pickup', 'a gem too'); h.eq(A.tileKind('empty'), null, 'an empty hex neither');
  const hexFp = (type) => fingerprint(drawCheck('hex ' + type, c => R.hex(c, 60, 60, 30, { type, revealed: true, q: 1, r: 1 }, { t: 0.3, orient: 'v' })));
  const fOn = hexFp('fight'), tOn = hexFp('treasure');
  A.set({ mode: 'off' });
  const fOff = hexFp('fight'), tOff = hexFp('treasure');
  h.ok(fOn !== fOff && tOn !== tOff, 'the marks show only in a colour-blind mode');
  h.ok(fOn.includes('fillText') && fOn.split('fillText').length > fOff.split('fillText').length, 'the danger mark carries a bang');
});

h.test('round 6: text size, reduced flashing and the high-contrast items', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, A = R.acc, fx = R.fx, D = api.DATA;
  const size = () => { const p = fx.text(100, 100, 'HELLO', '#fff', { size: 20, free: true }); fx.clear(); return p.size; };
  h.eq(size(), 20, 'normal text');
  A.set({ text: 'l' }); h.near(size(), 23, 1e-9, 'large text x1.15');
  A.set({ text: 'xl' }); h.near(size(), 26, 1e-9, 'extra large x1.3');
  const n = fx.num(100, 100, '−12', '#fff'); h.ok(n.size >= 20 * 1.3, 'damage numbers scale too (' + n.size.toFixed(1) + ')');
  A.set({ text: 'n' }); fx.clear();
  // reduced flashing: the screen flash is capped (the stroke of white never pops)
  const flashAlpha = () => { const { ctx, stat } = seqCtx(); fx.flash('#ffffff', 0.6); fx.draw(ctx); fx.clear(); const a = stat.seq.filter(s => s.startsWith('set:globalAlpha=')).map(s => +s.split('=')[1]); return Math.max(...a.filter(v => v < 1), 0); };
  h.near(flashAlpha(), 0.6, 1e-9, 'a flash at full strength');
  A.set({ noFlash: true });
  h.ok(flashAlpha() <= 0.08 + 1e-9, 'reduced flashing caps it (' + flashAlpha() + ')');
  h.eq(A.strobe(10), 2, 'strobing bulbs run at a fifth of the rate');
  drawCheck('party bulbs, reduced flashing', c => R.cabinetBack ? R.cabinetBack(c, 30, 410, { w: 480, h: 390, chuteW: 64, dividerH: 0.45, frame: 30, railY: 26, chuteX: 416 }, { t: 3, party: 1, marquee: 'JACKPOT!' }) : R.cabinet(c, 30, 410, { w: 480, h: 390 }, { t: 3 }));
  A.set({ noFlash: false });
  h.eq(A.strobe(10), 10, 'and full speed again');
  // high contrast: the bin items get a rim (their own sprite key), the same art otherwise
  const def = D.ITEMS[Object.keys(D.ITEMS)[0]];
  const plain = drawCheck('item plain', c => R.item(c, def, 50, 50, 0, 1, {}));
  const hc = drawCheck('item high contrast', c => R.item(c, def, 50, 50, 0, 1, { hc: true }));
  h.ok(hc.paints > plain.paints * 2, 'the outline paints the silhouette round the art (' + plain.paints + ' -> ' + hc.paints + ')');
});

// ---------------------------------------------------------------- SECRET (round 6): keys, the Back Room, The Machine, the door, the ending
h.test('secret: every look draws, balanced, without NaN, and each state reads differently', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, X = R.sec;
  h.ok(X && ['key', 'glint', 'terrain', 'mapBg', 'arena', 'face', 'cab', 'door', 'ending'].every(k => typeof X[k] === 'function'), 'RENDER.sec has every piece');
  const keys = new Map();
  for (const t of [0, 0.4, 1.3]) keys.set('key' + t, fingerprint(drawCheck('golden key t' + t, c => X.key(c, 100, 100, 1, t, { rot: t }))));
  drawCheck('golden key, faded, no glow', c => X.key(c, 100, 100, 0.5, 1, { alpha: 0.3, glow: false }));
  drawCheck('key glint', c => X.glint(c, 100, 100, 10, 2, 0.8));
  // the Back Room's tiles: catwalks and the void, both orientations, and they are not the cellar's
  const tiles = new Map();
  for (const terrain of ['land', 'sea']) for (const seed of [4, 5, 6, 7]) for (const orient of ['v', 'h']) {
    const tile = { q: 0, r: 0, terrain, ground: terrain === 'sea' ? 'sea' : 'grass', biome: 'machine', elev: 0.3 };
    tiles.set(terrain + seed + orient, fingerprint(drawCheck(`machine ${terrain} ${seed} ${orient}`, c => R.terrainHex(c, 100, 100, 40, tile, { t: 1.2, orient, seed, biome: 'machine' }))));
  }
  const kinds = (tr) => new Set([...tiles].filter(([k]) => k.startsWith(tr)).map(([, v]) => v)).size;
  h.ok(kinds('sea') >= 4 && kinds('land') >= 2, `the machine tiles vary with their seed (void ${kinds('sea')}, catwalk ${kinds('land')})`);
  const cellar = fingerprint(drawCheck('cellar land', c => R.terrainHex(c, 100, 100, 40, { terrain: 'land', ground: 'grass', biome: 'cellar' }, { t: 1, orient: 'v', seed: 3, biome: 'cellar' })));
  h.ok(cellar !== tiles.get("land4v"), 'the machine biome draws its own tiles');
  h.ok(R.BIOME_PAL.machine && R.terrainFill('machine', 'sea', 0.5, 'sea') !== R.terrainFill('cellar', 'sea', 0.5, 'sea'), 'the machine palette');
  drawCheck('back room map bg', c => X.mapBg(c, 540, 960, 2));
  const arena = new Map();
  for (const ph of [0, 1, 2]) for (const m of [false, true]) arena.set(ph + ':' + m, fingerprint(drawCheck(`arena phase ${ph} machine ${m}`, c => X.arena(c, 540, 960, 1.5, ph, m))));
  h.ok(arena.get('0:false') !== arena.get('0:true') && arena.get('0:true') !== arena.get('1:true'), 'The Machine\'s arena shows its screen and its light show');
  // The Machine: its own drawing (def.look), distinct from the Prize Master, per phase
  const md = D.ENEMIES.machine;
  const faces = new Map();
  for (const ph of [0, 1, 2]) { X.V.phase = ph; faces.set(ph, fingerprint(drawCheck('The Machine phase ' + ph, c => R.enemy(c, md, 200, 280, 1, 1.1, {})))); }
  X.V.phase = 0;
  h.eq(uniqueRatio(faces).ratio, 1, 'every phase looks different');
  const pm = fingerprint(drawCheck('the Prize Master', c => R.enemy(c, D.ENEMIES.prizemaster, 200, 280, 1, 1.1, {})));
  h.ok(pm !== faces.get(0), 'The Machine is not the Prize Master');
  for (const st of [{ hurt: 0.6 }, { attack: 0.7 }, { dead: 0.5 }, { enraged: true, rage: 0.4 }]) drawCheck('The Machine ' + JSON.stringify(st), c => R.enemy(c, md, 200, 280, 1, 1, st));
  h.ok(R.enemyBox(md, 1).h > R.enemyBox(D.ENEMIES.prizemaster, 1).h, 'its box is its own');
  // its face on the Rig: eyes, the marquee lights as its hp, the coin slot mouth
  const cab = { x: 30, y: 410, w: 480, h: 390, frame: 30, chuteX: 416, chuteW: 64, dividerTop: 214 };
  const face = new Map();
  for (const hpk of [1, 0.5, 0.1]) face.set('hp' + hpk, fingerprint(drawCheck('face hp ' + hpk, c => X.face(c, cab, { t: 1, phase: 0, hpk }))));
  h.eq(uniqueRatio(face).ratio, 1, 'the marquee lights go dark as its hp drops');
  for (const st of [{ phase: 1, hpk: 0.5, atk: 1 }, { phase: 2, hpk: 0.2, hurt: 1, look: -1, blink: 1 }, { phase: 2, hpk: 0, pd: 0.5 }, { phase: 2, hpk: 0, pd: 1 }]) drawCheck('face ' + JSON.stringify(st), c => X.face(c, cab, Object.assign({ t: 2 }, st)));
  const f0 = fingerprint(drawCheck('face open mouth', c => X.face(c, cab, { t: 1, phase: 0, hpk: 1, atk: 1 })));
  h.ok(f0 !== face.get('hp1'), 'the mouth bites on its attacks');
  // the cabinet events, each on its own and all at once, both layers
  const ev = new Map();
  const base = { t: 1.3, phase: 0, rail: 0, hx: 200, shut: { hp: 2, max: 2, k: 0 }, grav: 0, crack: 0, seed: 7, pd: 0 };
  const states = { rail: { rail: 1 }, shut: { shut: { hp: 1, max: 2, k: 1 } }, grav: { grav: 1 }, crack: { crack: 0.6 }, melt: { phase: 2, crack: 1 }, pd: { pd: 0.9 }, show: { phase: 1 } };
  for (const k in states) for (const layer of ['back', 'front']) {
    const st = drawCheck(`cab ${k} ${layer}`, c => { c.fillRect(0, 0, 1, 1); X.cab(c, cab, Object.assign({}, base, states[k]), layer); });
    ev.set(k + layer, fingerprint(st));
  }
  const none = { back: fingerprint(drawCheck('cab calm back', c => { c.fillRect(0, 0, 1, 1); X.cab(c, cab, base, 'back'); })), front: fingerprint(drawCheck('cab calm front', c => { c.fillRect(0, 0, 1, 1); X.cab(c, cab, base, 'front'); })) };
  for (const [k, layer] of [['rail', 'front'], ['shut', 'front'], ['grav', 'back'], ['crack', 'front'], ['melt', 'front'], ['pd', 'front'], ['show', 'back']]) h.ok(ev.get(k + layer) !== none[layer], `${k} shows on the ${layer} layer`);
  const c1 = fingerprint(drawCheck('crack a little', c => X.cab(c, cab, Object.assign({}, base, { crack: 0.2 }), 'front')));
  const c2 = fingerprint(drawCheck('crack a lot', c => X.cab(c, cab, Object.assign({}, base, { crack: 0.9 }), 'front')));
  h.ok(c1 !== c2 && c2.length > c1.length, 'the glass cracks progressively');
  const s1 = fingerprint(drawCheck('shutter 2 left', c => X.cab(c, cab, Object.assign({}, base, { shut: { hp: 2, max: 2, k: 1 } }), 'front')));
  const s2 = fingerprint(drawCheck('shutter 1 left', c => X.cab(c, cab, Object.assign({}, base, { shut: { hp: 1, max: 2, k: 1 } }), 'front')));
  h.ok(s1 !== s2, 'a dent shows on the shutter');
  // the hidden door at every beat, the true ending at dawn
  const door = new Map();
  for (const [keys, open] of [[0, 0], [1.5, 0], [3, 0], [3, 0.5], [3, 1]]) door.set(keys + ':' + open, fingerprint(drawCheck(`door keys ${keys} open ${open}`, c => X.door(c, 540, 960, { t: 2, keys, open }))));
  h.eq(uniqueRatio(door).ratio, 1, 'the keys fly in and the door opens');
  const end = new Map();
  for (const [dawn, walk] of [[0, 0], [0.5, 0.3], [1, 1]]) end.set(dawn + ':' + walk, fingerprint(drawCheck(`ending dawn ${dawn} walk ${walk}`, c => X.ending(c, 540, 960, { t: 3, dawn, walk, charId: 'rogue' }))));
  h.eq(uniqueRatio(end).ratio, 1, 'dawn breaks, the crawler walks out');
  drawCheck('door with nothing', c => { c.fillRect(0, 0, 1, 1); X.door(c); });
  drawCheck('ending with nothing', c => { c.fillRect(0, 0, 1, 1); X.ending(c); });
  const sg = drawCheck('the ZERO G sign', c => R.bossSign(c, 270, 398, 'ZERO G', R.SIG_COL.secGrav, 1, 1));
  h.ok(sg.paints > 0 && R.SIG_COL.machine && R.SIG_COL.secShut && R.SIG_COL.secZap, 'the cabinet signs have their colours');
});

/* ------------------------------------------------- round 6: the boon machine, the Compactor */
h.test('sets: the boon draft machine draws for every Tilt, flip and pick', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER;
  h.ok(typeof R.boonBack === 'function' && typeof R.cmpScene === 'function' && R.sets && typeof R.sets.cmpPlate === 'function', 'RENDER.boonBack, cmpScene, sets.cmpPlate');
  const fp = new Map();
  for (const tilt of [0, 5, 9]) for (const [k, st] of Object.entries({ down: { up: [false, false, false] }, flip: { up: [true, false, false] }, picked: { up: [true, true, true], done: true, pick: 1 }, walked: { up: [true, true, true], done: true, pick: -1 } })) {
    fp.set(tilt + k, fingerprint(drawCheck(`boonBack T${tilt} ${k}`, (c) => R.boonBack(c, Object.assign({ t: 1.3, w: 540, h: 960, tilt }, st)))));
  }
  h.ok(fp.get('0down') !== fp.get('9down'), 'high Tilt looks spicier (red, cracked glass, NO REFUNDS)');
  h.ok(fp.get('0picked') !== fp.get('0walked'), 'the machine smiles at a deal and sulks at a walk-away');
  drawCheck('boonBack null state', (c) => R.boonBack(c, null));
  // a pure function of its state: the same frame twice is the same picture
  h.eq(fingerprint(drawCheck('boonBack again', (c) => R.boonBack(c, { t: 2.2, tilt: 3 }))), fingerprint(drawCheck('boonBack again 2', (c) => R.boonBack(c, { t: 2.2, tilt: 3 }))), 'deterministic');
});

h.test('sets: the Compactor press draws every phase of a crush', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, I = api.DATA.ITEMS;
  const ins = ['toxic_vial', 'venom_dart', 'rusty_sword'].map((id) => ({ def: I[id], plus: false }));
  const res = { def: I.morning_flail || I.longsword || I.rusty_sword, plus: true };
  const K = { feed: 0.55, slam: 0.95, lift: 1.7, pop: 2.2 };
  const P = R.sets.cmpPlate;
  h.ok(P('idle', 0, K) === 0 && P('feed', 0.3, K) === 0 && P('press', 0.75, K) > 0 && P('press', 0.75, K) < 1 && P('grind', 1.2, K) === 1 && P('lift', 1.95, K) < 1 && P('done', 3, K) === 0, 'the plate: up, coming down, down, lifting, up');
  let prev = -1, mono = true;
  for (let k = K.feed; k <= K.slam; k += 0.05) { const p = P('press', k, K); if (p < prev) mono = false; prev = p; }
  h.ok(mono, 'the ram only comes down while pressing');
  const fp = new Map();
  const phases = { empty: ['idle', 0, [], null], two: ['idle', 0, ins.slice(0, 2), null], ready: ['idle', 0, ins, null], feed: ['feed', 0.2, ins, res], press: ['press', 0.8, ins, res],
    grind: ['grind', 1.2, ins, res], lift: ['lift', 1.95, ins, res], done: ['done', 2.5, ins, res] };
  for (const [name, [phase, k, list, r]] of Object.entries(phases)) {
    fp.set(name, fingerprint(drawCheck('cmpScene ' + name, (c) => R.cmpScene(c, { t: 1 + k, x: 0, y: 70, w: 540, h: 350, phase, k, K, ins: list, res: r, shake: phase === 'grind' ? 0.6 : 0 }))));
  }
  h.eq(uniqueRatio(fp).ratio, 1, 'every phase draws differently');
  drawCheck('cmpScene reduced', (c) => R.cmpScene(c, { t: 1, phase: 'grind', k: 1.2, K, ins, res, shake: 1, reduced: true }));
  drawCheck('cmpScene null state', (c) => R.cmpScene(c, null));
});

/* ---------------- round 7: evolved item art, the evolution ceremony, the pet synergy badge */
if (HAS_DATA) {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  h.test('evolve: every evolved item has its own drawing, a live aura and a distinct look', () => {
    h.ok(R.evo && typeof R.evo.ceremony === 'function' && typeof R.evo.petBadge === 'function', 'RENDER.evo');
    const fps = new Map();
    for (const id of D.EVO_IDS) {
      const d = D.ITEMS[id], base = D.ITEMS[D.EVOLUTIONS[id].from];
      h.ok(typeof R.evo.ART[id] === 'function' && R.evo.artFn(d) === R.evo.ART[id], `${id}: its own art function`);
      h.eq(R.evo.artFn(base), null, `${id}: the base item keeps its art`);
      const st = drawCheck(`evo item ${id}`, (c) => R.pol.art(c, d, {}));
      fps.set(id, fingerprint(st));
      const sb = drawCheck(`base item ${base.id}`, (c) => R.pol.art(c, base, {}));
      h.ok(fingerprint(sb) !== fingerprint(st), `${id}: looks nothing like ${base.id}`);
      drawCheck(`evo item ${id} via item()`, (c) => R.item(c, d, 100, 100, 0.4, 1.2, { glow: '#ffe27a' }));
      drawCheck(`evo item ${id} at 24 px`, (c) => R.item(c, d, 20, 20, 0, 24 / Math.max(30, 1), {}));
      for (const layer of ['back', 'front']) {
        const a = drawCheck(`evo aura ${id} ${layer}`, (c) => R.itemFx(c, d, 200, 200, 0.3, 1, { t: 1.3, seed: 2, mat: { traits: {} } }, layer));
        const b = drawCheck(`evo aura ${id} ${layer} later`, (c) => R.itemFx(c, d, 200, 200, 0.3, 1, { t: 2.1, seed: 2, mat: { traits: {} } }, layer));
        h.ok(fingerprint(a) !== fingerprint(b) || layer === 'front', `${id}: the ${layer} aura moves with t`);
      }
    }
    h.eq(uniqueRatio(fps).ratio, 1, 'every evolved item draws differently');
  });
  h.test('evolve: the ceremony at every beat, reduced, and the pet badge', () => {
    const from = D.ITEMS.rusty_sword, to = D.ITEMS.excalibur_claw;
    const base = { dur: 2.6, rise: 0.7, burst: 1.35, x0: 490, y0: 780, x: 270, y: 560, from, to, name: to.name, aura: `${to.auraName}: ${to.auraText}`, col: '#ffe27a', W: 540, H: 960, plus: true };
    const fps = new Map();
    for (const t of [0.05, 0.4, 0.9, 1.3, 1.4, 1.7, 2.3]) {
      const st = drawCheck(`ceremony t ${t}`, (c) => R.evo.ceremony(c, Object.assign({}, base, { t })));
      fps.set(String(t), fingerprint(st));
    }
    h.eq(uniqueRatio(fps).ratio, 1, 'every beat of the ceremony draws differently');
    const pre = drawCheck('ceremony before the burst', (c) => R.evo.ceremony(c, Object.assign({}, base, { t: 1 })));
    const post = drawCheck('ceremony after the burst', (c) => R.evo.ceremony(c, Object.assign({}, base, { t: 1.8 })));
    h.ok(fingerprint(pre).indexOf('strokeText') >= 0 && fingerprint(post).split('fillText').length > fingerprint(pre).split('fillText').length, 'the reveal adds the name and the aura words');
    drawCheck('ceremony reduced', (c) => R.evo.ceremony(c, Object.assign({}, base, { t: 1.4, reduced: true })));
    drawCheck('ceremony without defs', (c) => R.evo.ceremony(c, { t: 1, x0: 0, y0: 0, x: 10, y: 10 }));
    let threw = null;
    try { R.evo.ceremony(seqCtx().ctx, null); } catch (e) { threw = e; }
    h.ok(!threw, 'a null state is a no-op');
    const lines = R.evo.wrap('Whenever an enemy dies, gain 5 Block. Then some more words to wrap around the line.', 30);
    h.ok(lines.length >= 2 && lines.length <= 3 && lines.every(l => l.length <= 34), `wrap splits the aura line [${lines.join(' / ')}]`);
    for (const id of D.PET_IDS) drawCheck(`pet badge ${id}`, (c) => R.evo.petBadge(c, 64, 399, { name: 'Mittens', lv: 3 }, D.PET_SYN[id], 1.2));
    const none = seqCtx();
    R.evo.petBadge(none.ctx, 64, 399, { name: 'x' }, null, 0);
    h.eq(none.stat.paints, 0, 'no synergy, no badge');
  });
}

// ---------------------------------------------------------------- SEASON (round 7): seasonal events
{
  const api = boot({ only: ['util', 'art', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  const cab = { w: 480, h: 390, frame: 30, chuteW: 64, dividerH: 0.45, railY: 26 };
  h.test('season: the overlays draw in season and nothing out of it', () => {
    for (const id of ['halloween', 'winter']) {
      for (const t of [0, 1.7, 33.3]) {
        drawCheck(`title ${id} t${t}`, (c) => R.sea.title(c, 540, 960, t, id));
        drawCheck(`map ${id} t${t}`, (c) => R.sea.map(c, 0, 172, 540, 768, t, id));
        drawCheck(`sky ${id} t${t}`, (c) => R.sea.sky(c, 540, 70, 380, t, id));
        drawCheck(`cabinet ${id} t${t}`, (c) => R.sea.cab(c, 30, 410, cab, { t }, id));
        drawCheck(`prop ${id}`, (c) => R.sea.prop(c, 100, 100, 8, t, id, 3));
      }
      drawCheck(`cabinet ${id} with a skin, the party lights and the alarm`, (c) => R.sea.cab(c, 30, 410, cab, { t: 1, party: 1, alarm: 1, skinned: true }, id));
    }
    const pa = drawCheck('title with the lights', (c) => R.sea.cab(c, 30, 410, cab, { t: 1 }, 'halloween'));
    const pb = drawCheck('title without the lights', (c) => R.sea.cab(c, 30, 410, cab, { t: 1, skinned: true }, 'halloween'));
    h.ok(pa.paints > pb.paints, 'the orange and purple bulbs step aside for an equipped skin');
    h.ok(fingerprint(drawCheck('halloween title', (c) => R.sea.title(c, 540, 960, 2, 'halloween'))) !== fingerprint(drawCheck('winter title', (c) => R.sea.title(c, 540, 960, 2, 'winter'))), 'the two seasons look different');
    for (const id of [null, undefined, '', 'easter']) {
      for (const fn of [(c) => R.sea.title(c, 540, 960, 1, id), (c) => R.sea.map(c, 0, 172, 540, 768, 1, id), (c) => R.sea.sky(c, 540, 70, 380, 1, id), (c) => R.sea.cab(c, 30, 410, cab, { t: 1 }, id)]) {
        const { ctx, stat } = seqCtx();
        fn(ctx);
        h.eq(stat.paints, 0, `no season (${id}): the base art is untouched`);
      }
    }
    // animated: a later frame differs
    h.ok(fingerprint(drawCheck('map t1', (c) => R.sea.map(c, 0, 172, 540, 768, 1, 'halloween'))) !== fingerprint(drawCheck('map t2', (c) => R.sea.map(c, 0, 172, 540, 768, 2.5, 'halloween'))), 'the fog and bats move');
  });
  h.test('season: the costumes, the party hats and the Pumpkin King', () => {
    const E = D.ENEMIES, prints = new Map();
    for (const id of ['rat_vamp', 'slime_ghost', 'goblin_witch', 'pumpking']) {
      for (const st of [{}, { hurt: 0.6 }, { attack: 0.5 }, { dead: 0.5 }, { frozen: true }, { windup: 0.7, enraged: true }]) drawCheck(`${id} ${Object.keys(st).join(',') || 'idle'}`, (c) => R.enemy(c, E[id], 200, 300, 1, 1.3, st));
      prints.set(id, fingerprint(drawCheck(`${id} print`, (c) => R.enemy(c, E[id], 200, 300, 1, 1.3, {}))));
    }
    for (const [base, cos] of [['rat', 'rat_vamp'], ['slime', 'slime_ghost'], ['goblin', 'goblin_witch']]) {
      const a = drawCheck(base, (c) => R.enemy(c, E[base], 200, 300, 1, 1.3, {})), b = drawCheck(cos, (c) => R.enemy(c, E[cos], 200, 300, 1, 1.3, {}));
      h.ok(b.paints > a.paints, `${cos} wears a costume over the ${base}`);
    }
    h.ok(fingerprint(drawCheck('mushroom', (c) => R.enemy(c, E.mushroom, 200, 300, 1, 1.3, {}))) !== prints.get('pumpking'), 'the Pumpkin King has his own drawing, not his art key\'s');
    const box = R.enemyBox(E.pumpking, 1);
    h.ok(box.w > 100 && box.h > 140, 'his body box is his own');
    for (const hat of ['witch', 'pumpkin', 'horns', 'santa']) {
      const plain = drawCheck('bat', (c) => R.enemy(c, E.bat, 200, 300, 1, 1, {}));
      const hatted = drawCheck('bat in ' + hat, (c) => R.enemy(c, Object.assign({}, E.bat, { seaHat: hat }), 200, 300, 1, 1, {}));
      h.ok(hatted.paints > plain.paints, `a ${hat} hat on a bat`);
    }
    for (const t of [0.3, 1.2, 2.1]) drawCheck('vs card of the Pumpkin King t' + t, (c) => R.vsCard(c, 540, 960, { t, dur: 2.3, boss: false, title: 'ELITE', name: E.pumpking.name, taunt: E.pumpking.taunt, def: E.pumpking, charId: 'knight', color: E.pumpking.color, now: t }));
  });
  h.test('season: the door, its tile, the currency, the items', () => {
    const outs = [null, { kind: 'treat', k: 'candy' }, { kind: 'treat', k: 'item', id: 'pumpkin_bomb' }, { kind: 'trick', k: 'fight' }, { kind: 'trick', k: 'curse' }];
    const prints = new Set();
    for (const out of outs) for (const [open, rev] of [[0, 0], [0.5, 0], [1, 0.3], [1, 1]]) {
      const st = { t: 1.4, knock: open ? 0 : 0.8, knocks: 2, open, reveal: rev, out: open ? out : null, prize: out && out.id ? D.ITEMS[out.id] : null };
      prints.add(fingerprint(drawCheck(`door ${out ? out.k : 'closed'} open ${open} reveal ${rev}`, (c) => R.sea.door(c, 540, 960, st))));
    }
    h.ok(prints.size >= 10, `the door looks different at every beat and outcome (${prints.size})`);
    drawCheck('a relic prize in the doorway', (c) => R.sea.door(c, 540, 960, { t: 1, open: 1, reveal: 1, out: { kind: 'treat', k: 'relic' }, prize: D.RELICS.ghost_sheet }));
    drawCheck('door, null state', (c) => R.sea.door(c, 540, 960, null));
    const lit = drawCheck('treat hex lit', (c) => R.hex(c, 60, 60, 46, { type: 'treat', revealed: true, q: 1, r: 2 }, { t: 1, orient: 'v' }));
    const dark = drawCheck('treat hex known in the dark', (c) => R.hex(c, 60, 60, 46, { type: 'treat', revealed: false, known: true, q: 1, r: 2 }, { t: 1, orient: 'v' }));
    const gem = drawCheck('gem hex', (c) => R.hex(c, 60, 60, 46, { type: 'gem', revealed: true, q: 1, r: 2 }, { t: 1, orient: 'v' }));
    h.ok(fingerprint(lit) !== fingerprint(gem) && dark.paints > 0, 'the trick-or-treat tile has its own icon, and a silhouette in the dark');
    drawCheck('candy', (c) => R.sea.coin(c, 20, 20, 8, 1, 'halloween'));
    drawCheck('snowflake', (c) => R.sea.coin(c, 20, 20, 8, 1, 'winter'));
    // the seasonal items: each its own drawing, in every state
    const fps = new Set();
    for (const id of D.SEASONS.halloween.items) {
      const def = D.ITEMS[id];
      h.ok(typeof R.pol.SIL[id] === 'function' && Object.keys(R.pol.SIL).indexOf(id) < 0, id + ': a silhouette, kept out of the year-round list');
      for (const o of [{}, { plus: true }, { frozen: true }, { glow: '#ffc94d' }]) drawCheck(`item ${id} ${Object.keys(o).join(',') || 'plain'}`, (c) => R.item(c, def, 50, 50, 0.4, 1, o));
      const { ctx, stat } = seqCtx();
      R.pol.art(ctx, def, {});
      fps.add(fingerprint(stat));
      for (const layer of ['back', 'front', 'top']) {
        const s2 = seqCtx();
        let threw = null;
        try { R.itemFx(s2.ctx, def, 50, 50, 0.3, 1, { t: 1, mat: api.PHYS.materialOf(def), fuse: 1, crack: 1 }, layer); } catch (e) { threw = e; }
        h.ok(!threw && s2.stat.save === s2.stat.restore && !s2.stat.nan.length, `itemFx ${id} ${layer}: clean`);
      }
    }
    h.eq(fps.size, D.SEASONS.halloween.items.length, 'every seasonal item draws differently');
  });
  h.test('season: the event cosmetics on the cabinet, the claw, the crawlers and the trail', () => {
    const prints = new Map();
    for (const id of D.SEA_COSMETIC_IDS) prints.set(id, fingerprint(drawCheck('thumb ' + id, (c) => R.vault.thumb(c, id, 50, 50, 90, 0.8))));
    h.eq(new Set(prints.values()).size, D.SEA_COSMETIC_IDS.length, 'every event cosmetic has its own thumbnail');
    for (const id of ['skin_sea_mansion', 'skin_sea_frost']) {
      const a = drawCheck(id + ' cabinet', (c) => R.cabinetBack(c, 30, 410, cab, { t: 1, act: 1, skin: id }));
      const b = drawCheck('classic cabinet', (c) => R.cabinetBack(c, 30, 410, cab, { t: 1, act: 1, skin: 'skin_classic' }));
      h.ok(fingerprint(a) !== fingerprint(b), id + ': a cabinet of its own');
    }
    for (const ch of ['knight', 'alchemist', 'rogue', 'gambler']) {
      const hat = D.seaCosmetics('halloween', 'outfit', ch)[0];
      const a = drawCheck(ch + ' in a witch hat', (c) => R.vault.withOutfit(c, ch, 60, 60, 80, 1, hat));
      const b = drawCheck(ch + ' bare', (c) => R.vault.withOutfit(c, ch, 60, 60, 80, 1, null));
      h.ok(a.paints > b.paints, ch + ': the witch hat is drawn');
    }
    const pts = [];
    for (let i = 0; i < 12; i++) pts.push({ x: 20 + i * 12, y: 60 + Math.sin(i) * 8, a: i * 0.15, s: i * 1.3 });
    const bats = drawCheck('bat trail', (c) => R.vault.trail(c, pts, pts.length, 1, 'trail_sea_bats', 46));
    const dust = drawCheck('dust trail', (c) => R.vault.trail(c, pts, pts.length, 1, 'trail_sparkle', 46));
    h.ok(fingerprint(bats) !== fingerprint(dust), 'bats flap up out of every step');
    drawCheck('pumpkin paint claw', (c) => R.vault.thumb(c, 'paint_sea_pumpkin', 50, 50, 90, 0.4));
  });
}

// ---------------------------------------------------------------- WIN (round 12): Winter Wonderclaw
{
  const api = boot({ only: ['util', 'art', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, Wn = R.sea.win;
  const cab = { w: 480, h: 390, frame: 30, chuteW: 64, dividerH: 0.45, railY: 26 };
  h.test('winter: the title, the map, the arena and the cabinet in winter; animated; nothing out of season', () => {
    for (const t of [0, 1.7, 33.3]) {
      drawCheck(`winter title t${t}`, (c) => R.sea.title(c, 540, 960, t, 'winter'));
      drawCheck(`winter map t${t}`, (c) => R.sea.map(c, 0, 172, 540, 768, t, 'winter'));
      drawCheck(`winter sky t${t}`, (c) => R.sea.sky(c, 540, 70, 380, t, 'winter'));
      drawCheck(`winter cabinet t${t}`, (c) => R.sea.cab(c, 30, 410, cab, { t }, 'winter'));
      for (let s = 0; s < 3; s++) drawCheck(`winter prop ${s} t${t}`, (c) => R.sea.prop(c, 100, 100, 8, t, 'winter', s));
    }
    const lit = drawCheck('winter cabinet with its lights', (c) => R.sea.cab(c, 30, 410, cab, { t: 1 }, 'winter'));
    for (const st of [{ skinned: true }, { party: 1 }, { alarm: 1 }]) h.ok(drawCheck('winter cabinet ' + Object.keys(st)[0], (c) => R.sea.cab(c, 30, 410, cab, Object.assign({ t: 1 }, st), 'winter')).paints < lit.paints, 'the fairy lights step aside for ' + Object.keys(st)[0]);
    const tw = new Set();
    for (const t of [0.2, 1.1, 2.3, 3.9, 5.2]) tw.add(fingerprint(drawCheck('twinkle ' + t, (c) => Wn.garland(c, 0, 540, 80, 20, 3, 22, t, 4))));
    h.ok(tw.size >= 3, `the fairy lights twinkle (${tw.size} looks in 5 frames)`);
    h.ok([0, 1, 2].every(k => Array.from({ length: 30 }, (_, i) => Wn.twinkle(i * 3 + k, 1.3)).some(Boolean)), 'every colour of bulb lights up');
    h.ok(fingerprint(drawCheck('snowman prop', (c) => R.sea.prop(c, 100, 100, 8, 1, 'winter', 0))) !== fingerprint(drawCheck('cottage prop', (c) => R.sea.prop(c, 100, 100, 8, 1, 'winter', 1))), 'snowmen and cottages on the map');
    h.ok(fingerprint(drawCheck('winter title a', (c) => R.sea.title(c, 540, 960, 1, 'winter'))) !== fingerprint(drawCheck('winter title b', (c) => R.sea.title(c, 540, 960, 2.6, 'winter'))), 'the snow falls, the aurora ripples');
    for (const fn of [(c) => Wn.title(c, 540, 960, 1), (c) => Wn.cab(c, R.cabCfg ? R.cabCfg(cab) : Object.assign({}, cab), {}, 1, true), (c) => Wn.map(c, 0, 172, 540, 768, 1)]) drawCheck('winter part', fn);
  });
  h.test('winter: the costumes, the winter hats and Krampus', () => {
    const E = D.ENEMIES;
    for (const id of ['rat_reindeer', 'slime_snowman', 'goblin_elf', 'krampus']) {
      for (const st of [{}, { hurt: 0.6 }, { attack: 0.5 }, { dead: 0.5 }, { frozen: true }, { chilled: true }, { windup: 0.7, enraged: true }]) drawCheck(`${id} ${Object.keys(st).join(',') || 'idle'}`, (c) => R.enemy(c, E[id], 200, 300, 1, 1.3, st));
    }
    for (const [base, cos] of [['rat', 'rat_reindeer'], ['slime', 'slime_snowman'], ['goblin', 'goblin_elf']]) {
      const a = drawCheck(base, (c) => R.enemy(c, E[base], 200, 300, 1, 1.3, {})), b = drawCheck(cos, (c) => R.enemy(c, E[cos], 200, 300, 1, 1.3, {}));
      h.ok(b.paints > a.paints, `${cos} wears a costume over the ${base}`);
    }
    const goat = Object.assign({}, E.krampus, { look: undefined, sig: undefined });
    h.ok(fingerprint(drawCheck('goat', (c) => R.enemy(c, goat, 200, 300, 1, 1.3, {}))) !== fingerprint(drawCheck('krampus', (c) => R.enemy(c, E.krampus, 200, 300, 1, 1.3, {}))), 'Krampus has his own drawing, not his art key\'s');
    const box = R.enemyBox(E.krampus, 1);
    h.ok(box.w > 120 && box.h > 160, `his body box is his own (${box.w} x ${box.h})`);
    for (const hat of ['elf', 'antlers']) {
      const plain = drawCheck('bat', (c) => R.enemy(c, E.bat, 200, 300, 1, 1, {}));
      const hatted = drawCheck('bat in ' + hat, (c) => R.enemy(c, Object.assign({}, E.bat, { seaHat: hat }), 200, 300, 1, 1, {}));
      h.ok(hatted.paints > plain.paints, `a ${hat} hat on a bat`);
    }
    for (const t of [0.3, 1.2, 2.1]) drawCheck('vs card of Krampus t' + t, (c) => R.vsCard(c, 540, 960, { t, dur: 2.3, boss: false, title: 'ELITE', name: E.krampus.name, taunt: E.krampus.taunt, def: E.krampus, charId: 'knight', color: E.krampus.color, now: t }));
  });
  h.test('winter: the advent tile, the unwrapping at every beat and gift, the winter items', () => {
    const lit = drawCheck('advent hex lit', (c) => R.hex(c, 60, 60, 46, { type: 'advent', revealed: true, q: 1, r: 2 }, { t: 1, orient: 'v' }));
    const dark = drawCheck('advent hex known in the dark', (c) => R.hex(c, 60, 60, 46, { type: 'advent', revealed: false, known: true, q: 1, r: 2 }, { t: 1, orient: 'v' }));
    const treat = drawCheck('treat hex', (c) => R.hex(c, 60, 60, 46, { type: 'treat', revealed: true, q: 1, r: 2 }, { t: 1, orient: 'v' }));
    h.ok(fingerprint(lit) !== fingerprint(treat) && dark.paints > 0, 'the advent present has its own icon, and a silhouette in the dark');
    const outs = [null, { kind: 'treat', k: 'flakes', day: 3, candy: 9 }, { kind: 'treat', k: 'item', day: 6, big: true, id: 'hot_cocoa' }, { kind: 'treat', k: 'gold', day: 9, gold: 14 }, { kind: 'treat', k: 'capsule', day: 11, tier: 'c' }, { kind: 'treat', k: 'relic', day: 18, id: 'warm_scarf' }];
    const prints = new Set();
    for (const out of outs) for (const [tugs, tug, open, rev] of [[0, 0, 0, 0], [2, 0.8, 0, 0], [3, 0, 0.5, 0], [3, 0, 1, 0.3], [3, 0, 1, 1]]) {
      const st = { t: 1.4, tug, tugs, open, reveal: rev, out: open ? out : null, day: out ? out.day : 5, prize: out && out.id ? (D.ITEMS[out.id] || D.RELICS[out.id]) : null };
      prints.add(fingerprint(drawCheck(`gift ${out ? out.k : 'wrapped'} tugs ${tugs} open ${open} reveal ${rev}`, (c) => R.sea.gift(c, 540, 960, st))));
    }
    h.ok(prints.size >= 15, `the present looks different at every beat and gift (${prints.size})`);
    for (const day of [1, 12, 24]) drawCheck('calendar on door ' + day, (c) => R.sea.gift(c, 540, 960, { t: 2, day }));
    drawCheck('gift, null state', (c) => R.sea.gift(c, 540, 960, null));
    let threw = null;
    try { R.sea.gift(seqCtx().ctx, 540, 960, { t: NaN, open: 'x', reveal: -3, day: 99 }); } catch (e) { threw = e; }
    h.ok(!threw, 'junk state never throws');
    const fps = new Set();
    const ids = D.SEASONS.winter.items.concat(['win_snowball', 'win_coal']);
    for (const id of ids) {
      const def = D.ITEMS[id];
      h.ok(typeof R.pol.SIL[id] === 'function' && Object.keys(R.pol.SIL).indexOf(id) < 0, id + ': a drawing of its own, kept out of the year-round list');
      for (const o of [{}, { plus: true }, { frozen: true }, { glow: '#ffc94d' }]) drawCheck(`item ${id} ${Object.keys(o).join(',') || 'plain'}`, (c) => R.item(c, def, 50, 50, 0.4, 1, o));
      const { ctx, stat } = seqCtx();
      R.pol.art(ctx, def, {});
      fps.add(fingerprint(stat));
      for (const layer of ['back', 'front', 'top']) {
        const s2 = seqCtx();
        let thr = null;
        try { R.itemFx(s2.ctx, def, 50, 50, 0.3, 1, { t: 1, mat: api.PHYS.materialOf(def), fuse: 1, crack: 1 }, layer); } catch (e) { thr = e; }
        h.ok(!thr && s2.stat.save === s2.stat.restore && !s2.stat.nan.length, `itemFx ${id} ${layer}: clean`);
      }
    }
    h.eq(fps.size, ids.length, 'every winter item draws differently');
  });
  h.test('winter: the Snowflake Stand\'s looks on the cabinet, the claw, the marquee, the crawlers and the trail', () => {
    const prints = new Set();
    for (const id of D.WIN_COSMETIC_IDS) prints.add(fingerprint(drawCheck('thumb ' + id, (c) => R.vault.thumb(c, id, 50, 50, 90, 0.8))));
    h.eq(prints.size, D.WIN_COSMETIC_IDS.length, 'every winter prize has its own thumbnail');
    const ginger = drawCheck('gingerbread cabinet', (c) => R.cabinetBack(c, 30, 410, cab, { t: 1, act: 1, skin: 'skin_sea_ginger' }));
    h.ok(fingerprint(ginger) !== fingerprint(drawCheck('frosted cabinet', (c) => R.cabinetBack(c, 30, 410, cab, { t: 1, act: 1, skin: 'skin_sea_frost' }))), 'the Gingerbread House is a cabinet of its own');
    const mq = drawCheck('festive marquee', (c) => R.cabinet(c, 30, 410, cab, { t: 1, act: 1, mqId: 'mq_sea_festive' }));
    h.ok(fingerprint(mq) !== fingerprint(drawCheck('classic marquee', (c) => R.cabinet(c, 30, 410, cab, { t: 1, act: 1, mqId: 'mq_classic' }))), 'MERRY CLAWMAS on the marquee');
    const on = [], offs = [];
    for (let k = 0; k < 20; k++) { const v = R.vault.bulbOn('sea_twinkle', k, 1.3, 0, 3); (v ? on : offs).push(k); }
    h.ok(on.length > 5 && offs.length > 1, `the festive bulbs twinkle at random (${on.length} lit of 20)`);
    h.ok([0, 1, 2, 3, 4].some(k => [0.2, 0.9, 1.6, 2.4].some(t => R.vault.bulbOn('sea_twinkle', k, t, 0, 3) !== R.vault.bulbOn('sea_twinkle', k, t + 0.5, 0, 3))), '...and change over time');
    for (const ch of ['knight', 'alchemist', 'rogue', 'gambler', 'engineer', 'bubbler']) {
      const fit = D.seaCosmetics('winter', 'outfit', ch)[0];
      const a = drawCheck(ch + ' in a scarf', (c) => R.vault.withOutfit(c, ch, 60, 60, 80, 1, fit));
      const b = drawCheck(ch + ' bare', (c) => R.vault.withOutfit(c, ch, 60, 60, 80, 1, null));
      h.ok(a.paints > b.paints, ch + ': scarf and earmuffs drawn');
    }
    const pts = [];
    for (let i = 0; i < 12; i++) pts.push({ x: 20 + i * 12, y: 60 + Math.sin(i) * 8, a: i * 0.15, s: i * 1.3 });
    h.ok(fingerprint(drawCheck('flake trail', (c) => R.vault.trail(c, pts, pts.length, 1, 'trail_sea_flakes', 46))) !== fingerprint(drawCheck('snowfall trail', (c) => R.vault.trail(c, pts, pts.length, 1, 'trail_snow', 46))), 'the Snowflake Trail is not the old Snowfall');
    h.ok(fingerprint(drawCheck('peppermint claw', (c) => R.vault.thumb(c, 'paint_sea_cane', 50, 50, 90, 0.4))) !== fingerprint(drawCheck('candy cane claw', (c) => R.vault.thumb(c, 'paint_candy', 50, 50, 90, 0.4))), 'Peppermint Swirl is not the old Candy Cane paint');
  });
}

// ---------------------------------------------------------------- QA (round 7): the intent bubble reads the real numbers
h.test('qa: the intent bubble: the real hit, a multi-hit total over "hit x n", a charge\'s unleash; the old bubble without numbers', () => {
  const api = boot({ only: ['util', 'data', 'combat', 'render'] });
  const R = api.RENDER;
  const say = (enemy, qa) => {
    const texts = [];
    const ctx = new Proxy({}, {
      get(o, p) {
        if (p === 'measureText') return (s) => ({ width: String(s).length * 7 });
        if (p === 'fillText') return (s) => texts.push(String(s));
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (typeof p !== 'string' || p === 'then' || p in o) return o[p];
        return () => {};
      },
      set(o, p, v) { o[p] = v; return true; },
    });
    R.intent(ctx, 200, 120, enemy, 0.5, qa);
    return texts;
  };
  const bite = { intent: { id: 'bite', k: 'attack', v: 22, n: 1 }, affix: [] };
  h.ok(say(bite).includes('22'), 'no numbers: the move\'s own value, as before');
  h.ok(say(bite, { k: 'attack', hit: 37, n: 1, jab: 0, total: 37 }).includes('37'), 'a plain hit: the real number');
  const zap = { intent: { id: 'zap', k: 'attack', v: 14, n: 2 }, affix: [] };
  const t2 = say(zap, { k: 'attack', hit: 25, n: 2, jab: 0, total: 50, big: true });
  h.ok(t2.includes('50') && t2.includes('25x2'), 'a multi-hit: the total, "25x2" under it (' + t2.join(' ') + ')');
  const t3 = say(zap, { k: 'attack', hit: 25, n: 2, jab: 12, total: 74 });
  h.ok(t3.includes('74') && t3.includes('25x2+12x2'), 'a Hasty jab rides along (' + t3.join(' ') + ')');
  const gape = { intent: { id: 'gape', k: 'charge', v: 83 }, affix: [] };
  h.ok(!say(gape).some(s => /\d/.test(s)), 'a charge without numbers: just the warning');
  const t4 = say(gape, { k: 'charge', next: 129, big: true });
  h.ok(t4.includes('!') && t4.includes('129'), 'a charge: the warning and next turn\'s exact unleash');
  // the title logo fits the stage: its measured width plus the outer glow stroke stays inside a margin
  for (const [w, perChar] of [[540, 0.78], [540, 0.6], [400, 0.78]]) {
    let font = '', px = 0, logoPx = 0, maxLine = 0, x = 0, drawn = 0;
    const ctx = new Proxy({}, {
      get(o, p) {
        if (p === 'measureText') return (s) => ({ width: String(s).length * perChar * px });
        if (p === 'strokeText') return (s, sx) => { if (s === 'CLAWSPIRE') { drawn++; maxLine = Math.max(maxLine, o.lineWidth || 0); x = sx; logoPx = px; } };
        if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
        if (typeof p !== 'string' || p === 'then' || p in o) return o[p];
        return () => {};
      },
      set(o, p, v) { o[p] = v; if (p === 'font') { font = v; const m = /(\d+(\.\d+)?)px/.exec(String(v)); px = m ? +m[1] : 0; } return true; },
    });
    R.title(ctx, w, 960, 0.5);
    const width = 9 * perChar * logoPx + maxLine;
    h.ok(drawn >= 2 && width <= w - 28 + 0.5 && Math.abs(x - w / 2) < 0.01, `the logo fits a ${w} px stage at ${perChar} em a letter: ${Math.round(width)} px wide (${logoPx} px)`);
    if (perChar === 0.6) h.ok(logoPx === Math.min(w * 0.16, 92), 'a narrow font keeps the full size');
  }
  for (const mode of ['deutan', 'tritan', 'off']) { R.acc.set({ mode }); drawCheck('qa intent ' + mode, (c) => R.intent(c, 200, 120, zap, 1, { k: 'attack', hit: 25, n: 2, jab: 0, total: 50, big: true })); }
});

/* ------------------------------------------------- HISTORY (round 8): run cards, charts, the recap, photo mode */
h.test('history: stamps, charts, the bin, the map, the timeline, the killer, the header, photo filters and frames', () => {
  const api = boot();
  const R = api.RENDER, D = api.DATA, His = R.his;
  h.ok(His && ['stamp', 'chart', 'bin', 'map', 'timeline', 'foe', 'hero', 'photo', 'viewfinder'].every((k) => typeof His[k] === 'function'), 'RENDER.his has every drawing');
  // (the stamps share a shape: they differ in their word and colour, so read the words)
  const words = (fn) => { const out = []; const ctx = new Proxy({}, { get(t, k) { if (k === 'measureText') return () => ({ width: 40 }); if (k === 'fillText') return (s) => out.push(String(s)); if (k in t) return t[k]; return () => {}; }, set(t, k, v) { t[k] = v; return true; } }); fn(ctx); return out.join('|'); };
  for (const r of ['win', 'loss', 'endless', 'quit']) drawCheck('stamp ' + r, (c) => His.stamp(c, r, 100, 50, 24));
  h.eq(['win', 'loss', 'endless', 'quit'].map((r) => words((c) => His.stamp(c, r, 0, 0, 24))).join(), 'VICTORY,K.O.,ENDLESS,QUIT', 'four stamps, four words');
  drawCheck('stamp junk result', (c) => His.stamp(c, 'nope', 0, 0));
  // the charts: a history, one run, none
  const recs = [];
  for (let i = 0; i < 30; i++) recs.push({ id: 'r' + i, c: ['knight', 'rogue', 'alchemist', 'gambler'][i % 4], s: 500 + ((i * 7919) % 20000), r: ['loss', 'win', 'loss', 'endless', 'quit'][i % 5], d: i });
  const full = D.hisChart(recs, { knight: [9, 3], rogue: [8, 1], alchemist: [7, 0], gambler: [6, 6] });
  const cs = drawCheck('chart full', (c) => His.chart(c, full, 508, 176, { t: 1, names: { knight: 'Grabsworth' } }));
  const c1 = drawCheck('chart one run', (c) => His.chart(c, D.hisChart(recs.slice(0, 1), { knight: [1, 0] }), 508, 176, { t: 0 }));
  drawCheck('chart empty', (c) => His.chart(c, D.hisChart([], {}), 508, 176, {}));
  drawCheck('chart null', (c) => His.chart(c, null, 508, 176));
  h.ok(fingerprint(cs) !== fingerprint(c1), 'the chart shows the data');
  // the bin: prizes of every rarity, plus, empty
  const ids = Object.keys(D.ITEMS).filter((id) => !D.ITEMS[id].season);
  const defs = ids.slice(0, 8).map((id, i) => ({ def: D.ITEMS[id], plus: i % 2 === 0 }));
  drawCheck('bin of 8', (c) => His.bin(c, defs, 508, 176, { t: 1 }));
  drawCheck('bin of 3', (c) => His.bin(c, defs.slice(0, 3), 508, 176, {}));
  drawCheck('bin empty', (c) => His.bin(c, [], 508, 176));
  // the map: a packed act map, every biome, none
  const M = { cols: 16, rows: 22, tiles: {}, pos: { q: 2, r: 9 }, boss: { q: 10, r: 11 }, start: { q: -5, r: 11 } };
  for (let r = 0; r < 22; r++) for (let c = 0; c < 16; c++) { const q = c - Math.floor(r / 2); M.tiles[q + ',' + r] = { terrain: (c * 3 + r) % 9 === 0 ? 'sea' : 'land', revealed: (c + r) % 3 === 0, visited: (c + r) % 6 === 0 }; }
  const mp = D.hisMapPack(M), cells = D.hisMapCells(mp);
  for (const biome of ['cellar', 'foundry', 'glacier', 'machine', undefined]) drawCheck('map ' + biome, (c) => His.map(c, cells, mp, 508, 300, { biome, t: 2 }));
  const mNone = drawCheck('map none', (c) => His.map(c, null, null, 508, 300, {}));
  h.ok(mNone.seq.indexOf('fillText') >= 0, 'no map says so');
  // the last turns
  const turns = [{ n: 3, dmg: 12, bl: 5, blk: 5 }, { n: 4, dmg: 0, bl: 14, blk: 20 }, { n: 5, dmg: 0, bl: 0, blk: 0 }, { n: 6, dmg: 9, bl: 0, blk: 0 }, { n: 7, dmg: 46, bl: 3, blk: 3 }];
  const tl = drawCheck('timeline', (c) => His.timeline(c, turns, 460, 150, {}));
  drawCheck('timeline of one', (c) => His.timeline(c, turns.slice(-1), 460, 150, {}));
  drawCheck('timeline of none', (c) => His.timeline(c, [], 460, 150, {}));
  drawCheck('timeline zeros', (c) => His.timeline(c, [{ n: 1, dmg: 0, bl: 0, blk: 0 }], 460, 150));
  h.ok(tl.seq.filter((k) => k === 'fillText').length >= 10, 'every turn has its number and its label');
  // the killer, every enemy art and none
  let foes = 0;
  for (const id of Object.keys(D.ENEMIES).slice(0, 40)) { drawCheck('foe ' + id, (c) => His.foe(c, D.ENEMIES[id], 240, 176, { t: 1 })); foes++; }
  drawCheck('foe unknown', (c) => His.foe(c, null, 96, 80, {}));
  h.ok(foes > 20, 'the killer portrait for many enemies');
  // the detail header for every result, with an outfit and a Tilt
  for (const r of ['win', 'loss', 'endless', 'quit']) drawCheck('hero ' + r, (c) => His.hero(c, { char: 'knight', outfit: 'fit_knight_cape', name: 'Sir Grabsworth', date: 'Sep 28, 2026', result: r, score: 48299, where: 'Loop 5 · Endless', tilt: r === 'win' ? 3 : 0, t: 1 }, 508, 160));
  drawCheck('hero empty', (c) => His.hero(c, null, 508, 160));
  // photo mode: every filter with every frame, the stamp, reduced flashing, the viewfinder
  const src = { width: 1080, height: 1920 };
  const fps = new Map(), frs = new Map();
  for (const f of His.FILTERS) for (const fr of His.FRAMES) {
    const st = drawCheck(`photo ${f} ${fr}`, (c) => His.photo(c, src, { w: 540, h: 960, filter: f, frame: fr, t: 1.3, stamp: { char: 'rogue', outfit: null, name: 'Pip Quickclaw' }, caption: 'Pip Quickclaw · Act 2', sub: 'Sep 28, 2026' }));
    if (fr === 'none') fps.set(f, fingerprint(st));
    if (f === 'none') frs.set(fr, fingerprint(st));
  }
  h.eq(uniqueRatio(fps).ratio, 1, 'five distinct filters');
  h.eq(uniqueRatio(frs).ratio, 1, 'four distinct frames');
  const calm = drawCheck('photo marquee calm', (c) => His.photo(c, src, { filter: 'neon', frame: 'marquee', t: 1.3, noFlash: true }));
  const calm2 = drawCheck('photo marquee calm later', (c) => His.photo(c, src, { filter: 'neon', frame: 'marquee', t: 2.9, noFlash: true }));
  h.eq(fingerprint(calm), fingerprint(calm2), 'reduced flashing: the bulbs and the glow hold still');
  const live = drawCheck('photo marquee live later', (c) => His.photo(c, src, { filter: 'neon', frame: 'marquee', t: 2.9 }));
  h.ok(fingerprint(live) !== fingerprint(calm2), 'the bulbs chase otherwise');
  const noStamp = drawCheck('photo no stamp', (c) => His.photo(c, src, { filter: 'none', frame: 'none', stamp: null }));
  h.ok(fingerprint(noStamp) !== frs.get('none'), 'the stamp is drawn when on');
  drawCheck('photo junk', (c) => His.photo(c, null, { filter: 'x', frame: 'y' }));
  drawCheck('photo no state', (c) => His.photo(c, src));
  for (const ph of ['back', 'front']) drawCheck('viewfinder ' + ph, (c) => His.viewfinder(c, ph, 70, 62, 400, 710, 540, 960, { t: 1 }));
  for (const fr of His.FRAMES) { const r = His.photoRect(fr, 540, 960); h.ok(r.w > 400 && r.h > 700 && r.x >= 0 && r.y >= 0 && r.x + r.w <= 540 && r.y + r.h <= 960, 'the picture fits its frame ' + fr); }
});

// ---------- round 8: stories, the rival and the alternate bosses (DESIGN.md "Stories, the rival and alternate bosses (round 8)")
if (HAS_DATA) h.test('story: Gary, the Card Shark, the alternate bosses, their junk, the claw-off, the cameo', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, E = D.ENEMIES;
  h.ok(R.sto && typeof R.sto.board === 'function', 'RENDER.sto');
  const LOOKS = ['gary', 'cardshark', 'plushqueen', 'conveyorking', 'arcticarcade'];
  const prints = new Map();
  for (const id of LOOKS) {
    const st = drawCheck('enemy ' + id, (c) => R.enemy(c, E[id], 270, 300, 1, 1.3, {}));
    prints.set(id, fingerprint(st));
    const fall = fingerprint(drawCheck('its art key ' + E[id].art, (c) => R.enemy(c, { id: 'x', art: E[id].art, tier: E[id].tier, size: E[id].size, color: E[id].color }, 270, 300, 1, 1.3, {})));
    h.ok(fall !== prints.get(id), id + ' has its own drawing, not its art key\'s');
    for (const k of ['hurt', 'attack', 'dead', 'frozen', 'burning', 'enraged']) drawCheck(`enemy ${id} ${k}`, (c) => R.enemy(c, E[id], 270, 300, 1, 2.1, { [k]: k === 'frozen' || k === 'burning' || k === 'enraged' ? true : 0.6 }));
    const box = R.enemyBox(E[id], 1);
    h.ok(box.w > 40 && box.h > 60, id + ' has a body box');
    for (const t of [0.3, 1.2, 2.4]) drawCheck(`vs card ${id} t${t}`, (c) => R.vsCard(c, 540, 960, { t, dur: E[id].tier === 'boss' ? 3.3 : 2.3, boss: E[id].tier === 'boss', title: E[id].tier === 'boss' ? 'ACT ' + E[id].act + ' BOSS' : 'ELITE', name: E[id].name, taunt: E[id].taunt, def: E[id], charId: 'rogue', color: E[id].color, now: t }));
  }
  h.eq(uniqueRatio(prints).ratio, 1, 'five distinct drawings');
  // Gary's gear shows: every level its own look
  const gear = new Map();
  for (let g = 0; g <= 4; g++) { R.sto.gear = g; gear.set(g, fingerprint(drawCheck('gary gear ' + g, (c) => R.enemy(c, E.gary, 270, 300, 1, 0.7, {})))); }
  h.eq(uniqueRatio(gear).ratio, 1, 'rookie cap, shades, chain, jacket and turbo claw all show');
  R.sto.gear = 99; h.eq(R.sto.gear, 4, 'gear clamps'); R.sto.gear = 0;
  // the bosses' junk: their own silhouettes
  const junk = new Map();
  for (const id of ['sto_plush', 'sto_crate', 'sto_glacier1']) {
    const st = drawCheck('item ' + id, (c) => R.item(c, D.ITEMS[id], 100, 100, 0.3, 1, {}));
    junk.set(id, fingerprint(st));
    h.ok(fingerprint(drawCheck('fallback ' + id, (c) => R.item(c, Object.assign({}, D.ITEMS[id], { id: 'x_' + id }), 100, 100, 0.3, 1, {}))) !== junk.get(id), id + ': its own silhouette');
  }
  h.eq(uniqueRatio(junk).ratio, 1, 'plush, crate and ice differ');
  for (const id of D.STO_ICE) drawCheck('item ' + id, (c) => R.item(c, D.ITEMS[id], 100, 100, 0, 1, {}));
  h.ok(!Object.keys(R.pol.SIL).includes('sto_plush') && !!R.pol.SIL.sto_plush, 'the silhouettes are reachable, never listed');
  // the signatures' sign colours, the vignettes' props
  for (const k of ['plush', 'belt', 'glacier']) h.ok(/^#/.test(R.SIG_COL[k]), 'sign colour ' + k);
  for (const id of D.STORY_IDS) drawCheck('story vignette ' + id, (c) => R.arcScene(c, 508, 190, { id, def: { art: D.STORIES[id].art }, t: 0.9, act: 2, enemy: E[D.STORIES[id].art] || null, item: null, roll: 1, face: 6 }));
  // the rival tile, on the map and as a dark landmark
  const tile = fingerprint(drawCheck('hex rival', (c) => R.hex(c, 50, 50, 30, { type: 'rival', revealed: true, q: 1, r: 2 }, { t: 1 })));
  h.ok(tile !== fingerprint(drawCheck('hex event', (c) => R.hex(c, 50, 50, 30, { type: 'event', revealed: true, q: 1, r: 2 }, { t: 1 }))), 'the rival tile has its own icon');
  drawCheck('hex rival dark', (c) => R.hex(c, 50, 50, 30, { type: 'rival', revealed: false, known: true, q: 1, r: 2 }, { t: 1 }));
  drawCheck('rival icon', (c) => R.sto.tile(c, 20, 0.4));
  // the claw-off board, the bubble, the belt, the glaze, the cameo
  const boards = new Map();
  for (const who of ['p', 'g']) boards.set(who, fingerprint(drawCheck('board ' + who, (c) => R.sto.board(c, { t: 1, p: 9, g: 4, pd: 2, gd: 1, who, name: 'Pip', flashP: who === 'p' ? 1 : 0, label: 'YOUR DROP' }))));
  h.eq(uniqueRatio(boards).ratio, 1, 'the board lights the side at the claw');
  drawCheck('board empty', (c) => R.sto.board(c, null));
  drawCheck('bubble', (c) => R.sto.bubble(c, 270, 240, 300, 'Name\'s Gary. Grabby Gary. Undefeated claw-off champion, three arcades running.', 0.1, 400, 300));
  drawCheck('bubble no tail', (c) => R.sto.bubble(c, 270, 240, 300, '', 2));
  for (const k of [0.3, 1]) drawCheck('belt k' + k, (c) => R.sto.belt(c, 30, 446, 788, 1.3, 70, k));
  drawCheck('glaze', (c) => R.sto.glaze(c, 200, 600, 70, 50, 0.2, 1));
  const al = new Map();
  for (const id of ['crab', 'ghost']) al.set(id, fingerprint(drawCheck('ally ' + id, (c) => R.sto.ally(c, id, 150, 300, 1.1, 1, { attack: 0.5 }))));
  h.eq(uniqueRatio(al).ratio, 1, 'the crab and the ghost differ');
  drawCheck('ally unknown', (c) => R.sto.ally(c, 'nobody', 150, 300, 1, 1, null));
});

// ---------------- CR8 (round 8): Mama Mech's face and hats, her turret, the vacuum and the twins
h.test('CR8: Mama Mech, her turret at every level, the vacuum\'s canister, the twin heads', () => {
  const api = boot({ only: ['util', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, P = api.PHYS;
  // a deeper fingerprint than the call names: every call's rounded args and the fill colour
  // it paints with (a lamp lighting up or a head reeling down changes only those)
  const deep = (fn) => {
    const out = [];
    const t = { canvas: { width: 540, height: 960 }, fillStyle: '#000' };
    const ctx = new Proxy(t, {
      get(o, k) {
        if (typeof k !== 'string' || k === 'then') return o[k];
        if (k in o) return o[k];
        if (k === 'measureText') return () => ({ width: 40 });
        if (k.startsWith('create')) return () => ({ addColorStop() {} });
        if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 });
        return (...a) => out.push(k + '(' + a.map(v => (typeof v === 'number' ? Math.round(v) : typeof v)).join(',') + ')' + (k === 'fill' ? o.fillStyle : ''));
      },
      set(o, k, v) { o[k] = v; return true; },
    });
    fn(ctx);
    return out.join(';');
  };
  h.ok(R.cr8 && ['vacuum', 'twin', 'portrait', 'hat', 'turret', 'bolt'].every(k => typeof R.cr8[k] === 'function'), 'RENDER.cr8');
  // her face
  const pfp = new Map();
  for (const id of ['knight', 'alchemist', 'rogue', 'gambler', 'engineer']) pfp.set(id, fingerprint(drawCheck('portrait ' + id, c => R.portrait(c, id, 40, 40, 64, 1))));
  h.eq(uniqueRatio(pfp).ratio, 1, 'Mama Mech has a face of her own');
  // her two hats: each changes the portrait, and they differ
  const bare = pfp.get('engineer'), hats = new Map();
  for (const fit of ['fit_mama_welder', 'fit_mama_hardhat', 'fit_mama_witch']) {
    R.vault.equip({ outfit: { engineer: fit } });
    hats.set(fit, fingerprint(drawCheck('portrait engineer ' + fit, c => R.portrait(c, 'engineer', 40, 40, 64, 1))));
    drawCheck('thumb ' + fit, c => R.vault.thumb(c, fit, 50, 50, 100, 0.5));
  }
  R.vault.equip({ outfit: {} });
  h.ok([...hats.values()].every(fp => fp !== bare), 'every hat shows on her');
  h.eq(uniqueRatio(hats).ratio, 1, 'and the hats differ');
  // the turret: six levels, each its own look; firing, levelling up and the gatling spin show
  const lv = new Map();
  for (let l = 0; l <= 5; l++) {
    const st = { lv: l, parts: [0, 2, 4, 7, 11, 16][l], need: [2, 4, 7, 11, 16, 16][l], t: 1, aim: -2.4, fire: 0, up: 0, spin: 0, mood: '', k: 1.7 };
    lv.set(l, fingerprint(drawCheck('turret lv ' + l, c => R.cr8.turret(c, 500, 400, st))));
  }
  h.eq(uniqueRatio(lv).ratio, 1, 'every turret level looks different');
  const st3 = (o) => Object.assign({ lv: 3, parts: 8, need: 11, t: 1, aim: -2.4, fire: 0, up: 0, spin: 0, mood: '', k: 1.7 }, o);
  h.ok(fingerprint(drawCheck('turret firing', c => R.cr8.turret(c, 500, 400, st3({ fire: 1 })))) !== lv.get(3), 'a shot recoils and flashes');
  h.ok(fingerprint(drawCheck('turret level-up', c => R.cr8.turret(c, 500, 400, st3({ up: 1 })))) !== lv.get(3), 'a level-up pops');
  h.ok(fingerprint(drawCheck('turret happy', c => R.cr8.turret(c, 500, 400, st3({ mood: 'happy' })))) !== lv.get(3), 'the dome smiles');
  drawCheck('turret gatling spin', c => R.cr8.turret(c, 500, 400, st3({ lv: 4, spin: 7.1, fire: 0.6 })));
  drawCheck('turret null state', c => { R.cr8.turret(c, 500, 400, null); c.fillRect(0, 0, 1, 1); });
  for (const l of [1, 3, 5]) for (const u of [0, 0.5, 1]) drawCheck(`bolt lv ${l} at ${u}`, c => R.cr8.bolt(c, 500, 380, 200, 250, u, l));
  // the vacuum: an empty canister, one, two, three prizes, a clog: each shows
  const vac = new Map();
  for (const [k, o] of [['empty', {}], ['one', { fill: 0.34 }], ['two', { fill: 0.67 }], ['full', { fill: 1 }], ['clog', { clog: 1 }], ['suck', { field: 1 }]]) {
    const pose = P.clawPose('vacuum', Object.assign({ x: 200, y: 120, phase: 'dropping' }, o));
    drawCheck('vacuum ' + k, c => R.claw(c, pose, 30, 410, { juice: { t: 1.2 } }));
    vac.set(k, deep(c => R.claw(c, pose, 30, 410, { juice: { t: 1.2 } })));
  }
  h.eq(uniqueRatio(vac).ratio, 1, 'the canister shows how full it is, the clog and the suction');
  // the twins: open, closed, and the heads apart show
  const tw = new Map();
  for (const open of [0, 1]) {
    const pose = P.clawPose('twin', { x: 200, y: 120, open });
    drawCheck('twin open ' + open, c => R.claw(c, pose, 30, 410, { juice: { t: 1 } }));
    tw.set('open ' + open, deep(c => R.claw(c, pose, 30, 410, { juice: { t: 1 } })));
  }
  const apart = P.clawPose('twin', { x: 200, y: 120, open: 1 });
  apart.bodies.twin[0].x -= 20; apart.bodies.twin[0].y += 30;
  for (const p of apart.bodies.prongs.slice(0, 2)) for (const q of p) { q.x -= 20; q.y += 30; }
  drawCheck('twin heads apart', c => R.claw(c, apart, 30, 410, { juice: { t: 1 } }));
  tw.set('apart', deep(c => R.claw(c, apart, 30, 410, { juice: { t: 1 } })));
  h.eq(uniqueRatio(tw).ratio, 1, 'the twin heads close and reel on their own');
  // her items: each its own silhouette
  const its = new Map();
  for (const id of Object.keys(D.ITEMS).filter(id => D.ITEMS[id].char === 'engineer')) its.set(id, fingerprint(drawCheck('item ' + id, c => R.item(c, D.ITEMS[id], 100, 100, 0.3, 1, {}))));
  h.ok(its.size >= 10 && uniqueRatio(its).ratio === 1, `her ${its.size} items all look different`);
  for (const id of ['thunder_bolt', 'mech_plating']) drawCheck('evolved ' + id, c => R.item(c, D.ITEMS[id], 100, 100, 0, 1, {}));
});

// ---------------- FAMILY (round 9): the nine members, their icons, bond lines, the Crescendo staff, the plate
h.test('FAMILY: every member draws its own look, the band bounces on one beat, the family layers draw', () => {
  const api = boot({ only: ['util', 'data', 'combat', 'render'] });
  const R = api.RENDER, D = api.DATA, C = api.COMBAT;
  h.ok(R.fam && typeof R.fam.bond === 'function' && R.fam.KEYS.length === 9, 'RENDER.fam');
  const looks = new Map();
  for (const id of R.fam.KEYS) {
    const def = D.ENEMIES[id];
    h.ok(!!def && def.look === id, id + ' has its look');
    const st = drawCheck('member ' + id, c => R.enemy(c, def, 200, 280, 1, 1.3, {}));
    looks.set(id, fingerprint(st));
    for (const s of [{ hurt: 1 }, { attack: 0.6 }, { dead: 0.5 }, { frozen: true }, { windup: 1 }, { hpk: 0.1 }, { burning: true, poisoned: true }]) drawCheck(id + ' ' + JSON.stringify(s), c => R.enemy(c, def, 200, 280, 1, 2.2, s));
    // its own drawing, not its art key's
    const base = fingerprint(drawCheck('base ' + def.art, c => R.enemy(c, Object.assign({}, def, { look: null }), 200, 280, 1, 1.3, {})));
    h.ok(base !== looks.get(id), id + ' differs from its fallback art (' + def.art + ')');
    h.ok(R.enemyBox(def, 1).h > 20, id + ' has a body box');
  }
  h.eq(uniqueRatio(looks).ratio, 1, 'all nine look different ' + uniqueRatio(looks).dupes.join(' '));
  // the Band's beat is shared: two draws of the drummer at the same t match, at another t they move
  const beat = (t) => fingerprint(drawCheck('drummer t' + t, c => R.enemy(c, D.ENEMIES.fam_drummer, 200, 280, 1, t, { still: true })));
  h.eq(beat(0.2), beat(0.2), 'the same beat draws the same');
  const b0 = R.fam.beat(0.2), n0 = b0.n, h0 = b0.hit;
  h.ok(h0 >= 0 && h0 <= 1 && Number.isInteger(n0), 'beat(t): a hit 0..1 and a count');
  h.eq(R.fam.beat(60 / R.fam.BPM * 3).n, 3, 'three beats in at the tempo');
  // the family intents: new kinds, a SOLO and a hum with their harmony chips
  const run = { hp: 90, maxHp: 90, act: 1, relics: [], claw: { grabs: 3 }, bin: [] };
  const F = C.newFight(run, D.FAM.band.members, api.U.rng(3));
  const moves = [{ k: 'restock', v: 10, id: 'r' }, { k: 'cans', n: 2, id: 'c' }, { k: 'change', v: 12, id: 'g' }, { k: 'fumble', id: 'f' }];
  const ic = new Map();
  for (const m of moves) {
    const e = Object.assign({}, F.enemies[0], { intent: m });
    ic.set(m.k, fingerprint(drawCheck('intent ' + m.k, c => R.intent(c, 200, 150, e, 0.7))));
  }
  const solo = Object.assign({}, F.enemies[0], { intent: { id: 'solo', k: 'attack', v: 9, n: 1, fam: 'solo' } });
  const hum = Object.assign({}, F.enemies[0], { intent: { id: 'hum', k: 'attack', v: 11, n: 1, fam: 'chorus' } });
  ic.set('solo', fingerprint(drawCheck('intent SOLO x3', c => R.intent(c, 200, 150, solo, 0.7, { hit: 14, n: 1, jab: 0, total: 14, band: 3, fam: 'solo' }))));
  ic.set('hum', fingerprint(drawCheck('intent hum x2', c => R.intent(c, 200, 150, hum, 0.7, { hit: 16, n: 1, jab: 0, total: 16, band: 2, fam: 'chorus' }))));
  drawCheck('intent SOLO alone (no chip)', c => R.intent(c, 200, 150, solo, 0.7, { hit: 9, n: 1, jab: 0, total: 9, band: 1, fam: 'solo' }));
  drawCheck('intent SOLO without qa', c => R.intent(c, 200, 150, solo, 0.7));
  h.eq(uniqueRatio(ic).ratio, 1, 'every family intent has its own icon');
  // the arena layers
  const pts = [{ x: 150, y: 230 }, { x: 270, y: 225 }, { x: 390, y: 232 }];
  const bonds = new Map();
  for (const f of D.FAM_IDS) {
    bonds.set(f, fingerprint(drawCheck('bond ' + f, c => R.fam.bond(c, pts, f, 1.1, { k: 1 }))));
    drawCheck('bond ' + f + ' angry reduced', c => R.fam.bond(c, pts.slice(0, 2), f, 1.1, { k: 0.5, angry: true, reduced: true }));
    drawCheck('burst ' + f, c => R.fam.burst(c, 200, 200, f, 1, 0.6));
    drawCheck('plate ' + f, c => R.fam.plate(c, { fam: f, name: D.FAM[f].name, tag: D.FAM[f].tag, k: 0.4, t: 1 }));
    drawCheck('plate ' + f + ' reduced', c => R.fam.plate(c, { fam: f, name: D.FAM[f].name, tag: D.FAM[f].tag, k: 0.1, t: 1, reduced: true }));
  }
  h.eq(uniqueRatio(bonds).ratio, 1, 'each family has its own bond line');
  const staffs = new Map();
  for (const [k, cres, st] of [['empty', 0, {}], ['half', 4, { pop: 1 }], ['full', 8, {}], ['solo', 8, { solo: true }], ['reduced', 6, { reduced: true }]]) {
    staffs.set(k, fingerprint(drawCheck('staff ' + k, c => R.fam.staff(c, 130, 420, 106, cres, 8, 1.4, st))));
  }
  h.ok(uniqueRatio(staffs).ratio >= 0.8, 'the staff shows the meter, the pop, full and SOLO');
  drawCheck('spot', c => R.fam.spot(c, 270, 300, 120, 1, '#ff2e88', 0.8));
  drawCheck('angry', c => R.fam.angry(c, 270, 300, 80, 110, 1, 1));
  drawCheck('can item', c => R.item(c, D.ITEMS.fam_can, 100, 100, 0.3, 1, {}));
  // nothing painted where there is nothing to show (and nothing throws on junk input)
  const quiet = (fn) => { const calls = []; const ctx = new Proxy({ canvas: { width: 540, height: 960 } }, { get(t, k) { if (k in t) return t[k]; if (k === 'measureText') return () => ({ width: 40 }); return () => calls.push(k); }, set(t, k, v) { t[k] = v; return true; } }); fn(ctx); return calls; };
  for (const fn of [c => R.fam.bond(c, [], 'band', 1, {}), c => R.fam.bond(c, null, 'band', 1), c => R.fam.plate(c, { k: 0 }), c => R.fam.plate(c, null), c => R.fam.spot(c, 0, 0, 0, 0, null, 0), c => R.fam.angry(c, 0, 0, 1, 1, 0, 0)]) {
    let threw = null, calls = null;
    try { calls = quiet(fn); } catch (e) { threw = e; }
    h.ok(!threw && !calls.some(k => k === 'fill' || k === 'stroke' || k === 'fillText'), 'an empty family layer paints nothing and does not throw');
  }
});

// ---------------- HOLO (round 9): the holo card numbers
h.test('HOLO: every rarity, the pointer, the idle sweep, reduced motion and reduced flashing', () => {
  const api = boot({ only: ['util', 'render'] });
  const H = api.RENDER.holo;
  h.ok(H && typeof H.look === 'function' && H.SPARKS.length >= 4, 'RENDER.holo');
  const fin = (o) => ['rx', 'ry', 'deg', 'ax', 'ay', 'hx', 'hy', 'foil', 'glare', 'hue', 'sx', 'sy'].every(k => Number.isFinite(o[k]));
  for (const rar of ['c', 'u', 'r', 'l', 'boss', 'junk', undefined]) {
    for (const st of [{ t: 1.3, ph: 0.2 }, { t: 1.3, on: true, px: 0.9, py: 0.1 }, { t: 5, reduced: true }, { t: 2, noFlash: true }, { t: 0, gx: 0.5, gy: -0.3 }, {}, null]) {
      const o = H.look(rar, st, {});
      h.ok(fin(o), `look ${rar} ${JSON.stringify(st)}: finite`);
      h.ok(o.hx >= 0 && o.hx <= 100 && o.hy >= 0 && o.hy <= 100 && o.foil >= 0 && o.foil <= 1 && o.glare >= 0 && o.glare <= 1, `look ${rar}: in range`);
    }
  }
  // rarity: common has no foil, rare a foil, legendary more foil, a turning hue and sparkles
  const L = (r, st) => H.look(r, Object.assign({ t: 2, ph: 0.3 }, st), {});
  h.eq(L('c').foil, 0, 'common: no foil');
  h.ok(L('r').foil > L('u').foil && L('l').foil > L('r').foil, 'the foil grows with rarity');
  h.ok(L('l').spark > 0 && L('r').spark === 0, 'only a legendary sparkles');
  h.ok(L('l').hue !== L('l', { t: 3 }).hue && L('r').hue === 0, 'a legendary foil turns its hue');
  h.eq(L('boss').foil, L('l').foil, 'a boss relic shines like a legendary');
  // the pointer: the tilt leans toward it, the foil and glare sit under it
  const on = L('r', { on: true, px: 1, py: 0 });
  h.ok(on.ry > 0 && on.rx > 0 && on.hx === 100 && on.hy === 0, 'tilts toward the pointer (top right) and the foil follows');
  const on2 = L('r', { on: true, px: 0, py: 1 });
  h.ok(on2.ry < 0 && on2.rx < 0, 'the other way at the bottom left');
  h.ok(on.glare > L('r').glare, 'the glare brightens under a finger');
  h.ok(on.sx < 0, 'the shadow falls away from the tilt');
  // idle: a wobble and a slow sweep that change with time, differently per card
  h.ok(L('r', { t: 1 }).hx !== L('r', { t: 2 }).hx && L('r', { t: 1 }).deg !== L('r', { t: 1, ph: 0.8 }).deg, 'an idle wobble and sweep, each card its own');
  // reduced motion: still, the foil at rest; reduced flashing: dimmer
  const rm = L('l', { reduced: true }), rm2 = L('l', { reduced: true, t: 9 });
  h.ok(rm.deg === 0 && rm.hue === 0 && rm.hx === rm2.hx && rm.hy === rm2.hy && !rm.twinkle, 'reduced motion: no tilt, a still foil, no twinkle');
  h.ok(L('r', { reduced: true, on: true, px: 1, py: 0 }).deg === 0, 'reduced motion: no tilt under a finger either');
  const nf = L('l', { noFlash: true });
  h.ok(nf.foil < L('l').foil && nf.glare < L('l').glare && !nf.twinkle, 'reduced flashing: dimmer foil and glare, still sparkles');
  // pure: the same inputs, the same numbers, and the out object is reused
  const out = {};
  h.ok(H.look('l', { t: 1, ph: 0.5 }, out) === out, 'writes into the given object');
  h.eq(JSON.stringify(H.look('l', { t: 1, ph: 0.5 }, {})), JSON.stringify(H.look('l', { t: 1, ph: 0.5 }, {})), 'deterministic');
});

/* ---------------------------------------------------------------- LORE (round 9) */
h.test('LORE: every Codex picture, locked and found, the landmarks, the bubble, the board, the act cards, medals, the weekly banner', () => {
  const api = boot({ only: ['util', 'art', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, P = api.PHYS, L = R.lore;
  // a print that also sees the colours and the words (a card or a medal differs by its palette and its text)
  const lp = (fn) => {
    const out = [], o = { canvas: { width: 540, height: 960 }, fillStyle: '#000', strokeStyle: '#000' };
    const ctx = new Proxy(o, {
      get(t, k) {
        if (typeof k !== 'string' || k === 'then') return t[k];
        if (k in t) return t[k];
        if (k === 'measureText') return () => ({ width: 40 });
        if (k.startsWith('create')) return () => ({ addColorStop() {} });
        return (...a) => out.push(k + '(' + a.map(v => (typeof v === 'number' ? Math.round(v) : String(v))).join(',') + ')' + (/^fill/.test(k) ? t.fillStyle : /^stroke/.test(k) ? t.strokeStyle : ''));
      },
      set(t, k, v) { t[k] = v; return true; },
    });
    fn(ctx);
    return out.join(';');
  };
  h.ok(L && ['vignette', 'scene', 'mark', 'snippet', 'board', 'intro', 'medal', 'wkBanner', 'wrap'].every(k => typeof L[k] === 'function'), 'RENDER.lore');
  h.eq(JSON.stringify(L.KINDS.slice().sort()), JSON.stringify(D.LORE_ART.slice().sort()), 'the renderer draws every picture kind the book uses');
  const B = D.loreBook(), col = (e) => B.chapters.find(c => c.id === e.ch).col;
  // what the game hands over (game.js loreArtSt): the enemy, a crawler's prizes, the Rig's claw
  const stOf = (e, o) => {
    const a = e.art, st = Object.assign({ t: 1.3, col: col(e) }, o || {});
    if (a.k === 'enemy') st.def = D.ENEMIES[a.id];
    if (a.k === 'gary') st.def = D.ENEMIES.gary;
    if (a.k === 'char') st.items = D.CHARACTERS[a.id].bin.slice(0, 6).map(id => D.ITEMS[id]);
    if (a.k === 'prizes' || a.k === 'rig') st.items = ['rusty_sword', 'dented_shield', 'prize_marble', 'crisp_apple'].map(id => D.ITEMS[id]);
    if (a.k === 'act') st.defs = [D.ENEMIES.rat, D.ENEMIES.slime];
    if (a.k === 'rig') st.pose = P.clawPose('classic', { x: 120, y: 42, open: 0.55, cable: 22 });
    return st;
  };
  const pages = new Map();
  for (const e of B.entries) {
    const fp = fingerprint(drawCheck('page ' + e.id, c => L.vignette(c, e.art, 480, 200, stOf(e))));
    pages.set(e.id, fp);
    const lk = fingerprint(drawCheck('page ' + e.id + ' locked', c => L.vignette(c, e.art, 120, 72, stOf(e, { locked: true }))));
    h.ok(lk !== fp, `${e.id}: a locked page is darkened`);
    drawCheck('page ' + e.id + ' thumbnail', c => L.vignette(c, e.art, 120, 72, stOf(e)));
    drawCheck('page ' + e.id + ' toast chip', c => L.vignette(c, e.art, 60, 40, stOf(e)));
  }
  const ur = uniqueRatio(pages);
  h.eq(ur.ratio, 1, 'every page has its own picture ' + JSON.stringify(ur.dupes));
  const tw = B.byId.spire_tower;
  h.ok(fingerprint(drawCheck('tower later', c => L.vignette(c, tw.art, 480, 200, stOf(tw, { t: 4.2 })))) !== pages.get('spire_tower'), 'the picture moves with time');
  h.ok(fingerprint(drawCheck('gary gear 0', c => L.vignette(c, { k: 'gary', gear: 0 }, 480, 200, stOf(B.byId.gy_meet)))) !== fingerprint(drawCheck('gary gear 4', c => L.vignette(c, { k: 'gary', gear: 4 }, 480, 200, stOf(B.byId.gy_meet)))), 'Gary wears his gear');
  drawCheck('vignette with nothing', c => { L.vignette(c, null, 0, 0, null); c.fillRect(0, 0, 1, 1); });
  drawCheck('vignette of an unknown kind', c => L.vignette(c, { k: 'nope' }, 200, 100, { t: 1 }));
  drawCheck('an enemy page without its def', c => L.vignette(c, { k: 'enemy', id: 'nope' }, 200, 100, { t: 1 }));
  // the landmarks on the map
  const marks = new Map();
  for (const k of ['jukebox', 'tickets', 'hiscore']) {
    marks.set(k, fingerprint(drawCheck('mark ' + k, c => L.mark(c, k, 200, 400, 46, 1.2))));
    drawCheck('mark ' + k + ' zoomed out', c => L.mark(c, k, 200, 400, 46 * 0.6, 7));
  }
  h.eq(uniqueRatio(marks).ratio, 1, 'the three landmarks look different');
  drawCheck('mark unknown', c => L.mark(c, 'nope', 0, 0, 46, 0));
  // the bubble: short, long, at the stage's edges, fading
  const long = D.LORE_SNIPS.petshop[0] + ' ' + D.LORE_SNIPS.tickets[1];
  for (const [x, y] of [[270, 500], [4, 190], [536, 940]]) drawCheck(`snippet at ${x},${y}`, c => L.snippet(c, x, y, long, { icon: '♪', name: 'Broken Jukebox', col: '#ff6bb0', t: 0.05, a: 0.5 }));
  drawCheck('snippet with nothing', c => { L.snippet(c, 10, 10, '', null); c.fillRect(0, 0, 1, 1); });
  // the high score board: yours in gold, an empty history the house's
  const hof = [{ id: 'a', c: 'knight', s: 12000 }, { id: 'b', c: 'rogue', s: 30000 }];
  const bFull = fingerprint(drawCheck('board with runs', c => L.board(c, D.loreBoard(hof, 8), 440, 560, { t: 1 })));
  const bEmpty = fingerprint(drawCheck('board empty', c => L.board(c, D.loreBoard([], 8), 440, 560, { t: 1 })));
  h.ok(bFull !== bEmpty, 'your climbs show on the board');
  drawCheck('board junk', c => L.board(c, null, 0, 0, null));
  // the act cards: every floor its own, the typing and the beat show, reduced motion holds still
  const cards = new Map();
  for (const k of ['a1', 'a2', 'a3', 'room', 'L2']) {
    const I = D.loreIntro(k, 2);
    for (const u of [0, 0.05, 0.3, 0.7, 1]) drawCheck(`intro ${k} at ${u}`, c => L.intro(c, 540, 960, Object.assign({ u, typed: Math.round(u * 60), t: u * 2.8, a: 1 }, I)));
    cards.set(k, lp(c => L.intro(c, 540, 960, Object.assign({ u: 0.5, typed: 20, t: 1.4, a: 1 }, I))));
  }
  h.eq(uniqueRatio(cards).ratio, 1, 'every floor has its own card');
  const I1 = D.loreIntro('a1');
  h.ok(fingerprint(drawCheck('intro typed 5', c => L.intro(c, 540, 960, Object.assign({ u: 0.5, typed: 5, t: 1 }, I1)))) !== fingerprint(drawCheck('intro typed all', c => L.intro(c, 540, 960, Object.assign({ u: 0.5, typed: 999, t: 1 }, I1)))), 'the lines type out');
  const rA = fingerprint(drawCheck('intro reduced early', c => L.intro(c, 540, 960, Object.assign({ u: 0.02, typed: 0, t: 0.1, reduced: true }, I1))));
  const rB = fingerprint(drawCheck('intro reduced later', c => L.intro(c, 540, 960, Object.assign({ u: 0.2, typed: 0, t: 0.1, reduced: true }, I1))));
  h.ok(rA.replace(/\d+(\.\d+)?/g, '') === rB.replace(/\d+(\.\d+)?/g, ''), 'reduced motion: no slam, the bars do not slide');
  drawCheck('intro with nothing', c => L.intro(c, 0, 0, null));
  // medals and the weekly banner
  const med = new Map();
  for (const m of ['', 'bronze', 'silver', 'gold', 'platinum']) { drawCheck('medal ' + (m || 'none'), c => L.medal(c, m, 40, 40, 20, 1)); med.set(m || 'none', lp(c => L.medal(c, m, 40, 40, 20, 1))); }
  h.eq(uniqueRatio(med).ratio, 1, 'every medal (and the empty slot) differs');
  const wk = D.wkDef('2026-W40');
  const ban = (o) => fingerprint(drawCheck('banner ' + JSON.stringify(o), c => L.wkBanner(c, Object.assign({ name: wk.name, icon: wk.icon, col: wk.col, week: 'WEEK 40 · 2026', left: 'ENDS IN 5D 00H', blurb: wk.blurb, char: wk.char, claw: 'Scoop', t: 1 }, o), 508, 170)));
  h.ok(ban({}) !== ban({ medal: 'gold', best: 6100 }), 'the banner shows the best medal');
  drawCheck('banner with nothing', c => L.wkBanner(c, null, 0, 0));
});

/* ---------------------------------------------------------------- RUSH (round 10) */
h.test('RUSH: NEXT CHALLENGER at every beat, the gallery in every state, the banner, the stage; the ghost, its race chart, GHOST PASSED!', () => {
  const api = boot({ only: ['util', 'art', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, Rr = R.rush, Rg = R.gho;
  h.ok(Rr && ['back', 'boss', 'gallery', 'challenger', 'banner'].every(k => typeof Rr[k] === 'function') && Rr.T && Rr.T.reveal > Rr.T.sil, 'RENDER.rush');
  h.ok(Rg && ['marker', 'sheet', 'chart', 'pass'].every(k => typeof Rg[k] === 'function') && Rg.PASS.dur > 1, 'RENDER.gho');
  const order = D.rushOrder(7, { machine: true }), defs = order.map(id => D.ENEMIES[id]);
  // the slam: every beat draws, and the beats differ (the label slams, the silhouette slides, the reveal, the name, the gallery)
  const st = (t, o) => Object.assign({ t, now: t, label: 'NEXT CHALLENGER', def: defs[2], i: 2, n: order.length, clock: '3:21.4', split: 'last split 1:02.3', defs, beat: 2, secret: 7 }, o || {});
  const beats = new Map();
  for (const t of [0, 0.1, 0.35, 0.7, 1.02, 1.2, 1.4, 2, 6]) beats.set(String(t), fingerprint(drawCheck('slam at ' + t, c => Rr.challenger(c, 540, 960, st(t)))));
  h.ok(new Set(beats.values()).size >= 7, 'the slam moves on at every beat');
  const hid = fingerprint(drawCheck('the silhouette', c => Rr.challenger(c, 540, 960, st(0.8))));
  const shown = fingerprint(drawCheck('revealed', c => Rr.challenger(c, 540, 960, st(1.5))));
  h.ok(hid !== shown, 'a silhouette, then the boss');
  const bosses = new Map();
  for (const d of defs) bosses.set(d.id, fingerprint(drawCheck('challenger ' + d.id, c => Rr.challenger(c, 540, 960, st(2, { def: d })))));
  h.ok(new Set(bosses.values()).size === defs.length, 'every challenger draws its own boss');
  const red = (t) => fingerprint(drawCheck('reduced at ' + t, c => Rr.challenger(c, 540, 960, st(t, { reduced: true, now: 1 }))));
  h.ok(red(0.1) === red(0.9), 'reduced motion: no slam, no slide, no flash (the whole card at once)');
  h.ok(red(0.1) !== fingerprint(drawCheck('full at 0.1', c => Rr.challenger(c, 540, 960, st(0.1, { now: 1 })))), 'the full slam starts from an empty stage');
  drawCheck('challenger with nothing', c => Rr.challenger(c, 0, 0, null));
  // the gallery: beaten in colour with a KO, the next pulsing, the rest dark, the one that beat you, the Machine a '?'
  const gal = (o) => fingerprint(drawCheck('gallery ' + JSON.stringify(o), c => Rr.gallery(c, 10, 10, 500, 72, Object.assign({ defs, t: 1, secret: 7 }, o))));
  const g0 = gal({ beat: 0, cur: 0 }), g3 = gal({ beat: 3, cur: 3 }), gAll = gal({ beat: 8, cur: -1 }), gDead = gal({ beat: 3, cur: -1, dead: 3 });
  h.ok(new Set([g0, g3, gAll, gDead]).size === 4, 'the gallery fills as you go, and marks the fall');
  h.ok(gal({ beat: 3, cur: 3, pop: 2, popK: 0.2 }) !== gal({ beat: 3, cur: 3, pop: 2, popK: 1 }), 'the KO stamp slams in');
  h.ok(gal({ beat: 6, cur: 6, secret: 7 }) !== gal({ beat: 6, cur: 6, secret: -1 }), 'The Machine hides until it is reached');
  drawCheck('gallery of one', c => Rr.gallery(c, 0, 0, 80, 60, { defs: [defs[0]], beat: 1 }));
  const { ctx: c0, stat: s0 } = seqCtx();
  Rr.gallery(c0, 0, 0, 100, 60, null);
  h.eq(s0.save, s0.restore, 'an empty gallery stays balanced');
  // the banner and the stage
  const all = [].concat(D.RUSH.ACTS[1], D.RUSH.ACTS[2], D.RUSH.ACTS[3], [D.RUSH.FINAL, D.RUSH.SECRET]).map(id => D.ENEMIES[id]);
  const bn = (o) => fingerprint(drawCheck('banner ' + JSON.stringify(o).slice(0, 40), c => Rr.banner(c, 508, 200, Object.assign({ t: 1, defs: all, got: {}, secret: 7 }, o))));
  h.ok(new Set([bn({}), bn({ locked: true }), bn({ got: { hoard: 1, smelter: 2 }, best: '9:12.3' }), bn({ met: true })]).size === 4, 'the banner: locked, beaten in colour, the best time, The Machine once met');
  drawCheck('banner with nothing', c => Rr.banner(c, 0, 0, null));
  const b1 = fingerprint(drawCheck('stage t1', c => Rr.back(c, 540, 960, 1, {}))), b2 = fingerprint(drawCheck('stage t3', c => Rr.back(c, 540, 960, 3, { col: '#2ee6d6' })));
  h.ok(b1 !== b2, 'the stage lights sweep');
  drawCheck('boss silhouette', c => Rr.boss(c, D.ENEMIES.hoard, 100, 200, 80, 80, 1, true));
  // the ghost: its look per crawler, sad once its climb ended, a tag, never a leak of the flat colour
  const gm = new Map();
  for (const id of Object.keys(D.CHARACTERS)) gm.set(id, fingerprint(drawCheck('ghost ' + id, c => Rg.marker(c, 200, 300, 46, { charId: id, t: 1, a: 0.6, tag: 'GHOST' }))));
  h.ok(new Set(gm.values()).size === gm.size, 'every crawler has its own ghost');
  h.ok(fingerprint(drawCheck('ghost sad', c => Rg.marker(c, 200, 300, 46, { charId: 'knight', t: 1, sad: true, tag: 'GHOST OUT' }))) !== gm.get('knight'), 'a fallen ghost is grey');
  h.ok(fingerprint(drawCheck('ghost t1', c => Rg.marker(c, 200, 300, 46, { charId: 'knight', t: 1 }))) !== fingerprint(drawCheck('ghost t2', c => Rg.marker(c, 200, 300, 46, { charId: 'knight', t: 2 }))), 'it bobs and its sheet ripples');
  drawCheck('ghost with nothing', c => Rg.marker(c, 0, 0, 0, null));
  const after = fingerprint(drawCheck('a hoard after the ghost', c => { Rg.marker(c, 100, 100, 40, { charId: 'rogue', t: 1 }); R.enemy(c, D.ENEMIES.hoard, 300, 300, 1, 1, {}); }));
  const alone = fingerprint(drawCheck('a hoard alone', c => { Rg.marker(c, 100, 100, 40, { charId: 'rogue', t: 1 }); }));
  h.ok(after.length > alone.length, 'the art after a ghost draws as ever');
  // the chart: ahead, behind, a lone attempt, junk
  const ch = (o) => fingerprint(drawCheck('chart ' + JSON.stringify(o), c => Rg.chart(c, 480, 150, o)));
  h.ok(new Set([ch({ me: [0, 600, 1200, 2000], ghost: [0, 500, 900, 1300] }), ch({ me: [0, 300, 500], ghost: [0, 500, 900, 1300] }), ch({ me: [0, 300], ghost: [] })]).size === 3, 'the race chart shows who led');
  drawCheck('chart with nothing', c => Rg.chart(c, 0, 0, null));
  drawCheck('chart with junk', c => Rg.chart(c, 480, 150, { me: [NaN, 'x', 5], ghost: [Infinity] }));
  // GHOST PASSED!: the slam, the ghost left behind, the fade out
  const ps = new Map();
  for (const t of [0, 0.06, 0.3, 1, 2.1]) ps.set(String(t), fingerprint(drawCheck('pass at ' + t, c => Rg.pass(c, 270, 400, { t, charId: 'knight', sub: '+120 ahead after 3 fights' }))));
  h.ok(new Set(ps.values()).size === ps.size, 'GHOST PASSED! slams in, the ghost falls behind, it fades');
  h.ok(fingerprint(drawCheck('pass reduced', c => Rg.pass(c, 270, 400, { t: 0.05, reduced: true }))) !== ps.get('0.06'), 'reduced motion: no slam, no streaks');
  drawCheck('pass with nothing', c => Rg.pass(c, 0, 0, null));
});

// MIX (round 10): the trauma budget (DESIGN.md "Mix and juice pass 2 (round 10)")
h.test('mix: the trauma budget keeps a chain of shakes from stacking into nausea', () => {
  const { RENDER } = boot({ only: ['util', 'data', 'render'] });
  const fx = RENDER.fx, TB = fx.TB;
  fx.clear(); fx.reduced = false;
  h.eq(fx.budget(), TB.cap, 'a full budget to start');
  fx.shake(12);
  h.near(fx.trauma(), 0.6, 1e-9, 'one big hit still lands in full');
  for (let i = 0; i < 40; i++) fx.shake(20);
  h.ok(fx.trauma() <= TB.max + 1e-9, `forty crushing hits never pass the ceiling (${fx.trauma().toFixed(2)})`);
  let maxOff = 0;
  for (let i = 0; i < 90; i++) { fx.update(1 / 60); const o = fx.offset(); maxOff = Math.max(maxOff, Math.abs(o.x), Math.abs(o.y)); }
  h.ok(maxOff <= TB.max * TB.max * 16 + 0.01, `the camera moves at most ${(TB.max * TB.max * 16).toFixed(1)} px (${maxOff.toFixed(1)})`);
  // a volley at a steady rate: what it adds per second is held near the refill
  fx.clear();
  let spent = 0, heldHi = 0;
  for (let i = 0; i < 180; i++) {
    if (i % 6 === 0) { const b = fx.budget(), t0 = fx.trauma(); fx.shake(8); spent += Math.max(0, fx.trauma() - t0); heldHi = Math.max(heldHi, fx.trauma()); if (b > 0) h.ok(fx.budget() <= b, 'a shake spends the budget'); }
    fx.update(1 / 60);
  }
  const want = 30 * 8 / 20;
  h.ok(spent < want * 0.6, `a 3 s volley of 30 hits adds ${spent.toFixed(2)} trauma, not ${want} (the budget and the ceiling)`);
  h.ok(heldHi <= TB.max + 1e-9, 'and never passes the ceiling');
  h.ok(spent > TB.cap, 'but every hit still gives a little (the floor)');
  // it refills
  for (let i = 0; i < 40; i++) fx.update(0.1);
  h.near(fx.budget(), TB.cap, 1e-9, 'the budget refills when the hits stop');
  h.eq(fx.trauma(), 0, 'and the shake has died away');
  // a tiny shake after a quiet spell is a tiny shake
  fx.shake(2);
  h.near(fx.trauma(), 0.1, 1e-9, 'a small bump is still small');
  fx.shake(0); fx.shake(-5); fx.shake('x');
  h.near(fx.trauma(), 0.1, 1e-9, 'zero, negative and junk amounts add nothing');
  // kicks add up to a cap
  fx.clear();
  for (let i = 0; i < 10; i++) fx.kick(0, 8);
  h.ok(fx.offset().y <= TB.kick + 1e-9 && fx.offset().y > 8, `ten kicks nudge ${fx.offset().y.toFixed(1)} px, capped at ${TB.kick}`);
  fx.reduced = true; fx.clear(); fx.shake(20);
  let redOff = 0;
  for (let i = 0; i < 30; i++) { fx.update(1 / 60); const o = fx.offset(); redOff = Math.max(redOff, Math.abs(o.x), Math.abs(o.y)); }
  h.ok(redOff <= TB.max * TB.max * 16 * 0.2 + 0.01, 'reduced motion keeps its fifth');
  fx.reduced = false; fx.clear();
  h.eq(fx.budget(), TB.cap, 'clear refills the budget');
});

// ---------------- ROS (round 10): Ms. Bubbles' face, outfits and items, the bubbles, the mutator pack's looks, the new pets
h.test('ROS: Ms. Bubbles, her outfits and items, the bubbles, water, goo, the signs, the gauge and three new pets', () => {
  const api = boot({ only: ['util', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA;
  h.ok(R.ros && ['bubble', 'water', 'goo', 'mirrorSign', 'mirrorFinger', 'quakeSign', 'meter', 'portrait', 'hat', 'snorkel'].every(k => typeof R.ros[k] === 'function'), 'RENDER.ros');
  const pfp = new Map();
  for (const id of Object.keys(D.CHARACTERS)) pfp.set(id, fingerprint(drawCheck('portrait ' + id, c => R.portrait(c, id, 40, 40, 64, 1))));
  h.eq(uniqueRatio(pfp).ratio, 1, 'Ms. Bubbles has a face of her own');
  const bare = pfp.get('bubbler'), fits = new Map();
  for (const fit of ['fit_bub_showercap', 'fit_bub_snorkel', 'fit_bub_witch']) {
    R.vault.equip({ outfit: { bubbler: fit } });
    fits.set(fit, fingerprint(drawCheck('portrait bubbler ' + fit, c => R.portrait(c, 'bubbler', 40, 40, 64, 1.3))));
    drawCheck('thumb ' + fit, c => R.vault.thumb(c, fit, 50, 50, 100, 0.5));
  }
  R.vault.equip({ outfit: {} });
  h.ok([...fits.values()].every(fp => fp !== bare), 'every outfit shows on her');
  h.eq(uniqueRatio(fits).ratio, 1, 'and they differ');
  const its = new Map();
  for (const id of Object.keys(D.ITEMS).filter(id => D.ITEMS[id].char === 'bubbler')) its.set(id, fingerprint(drawCheck('item ' + id, c => R.item(c, D.ITEMS[id], 100, 100, 0.3, 1, {}))));
  h.ok(its.size === 10 && uniqueRatio(its).ratio === 1, `her ${its.size} items all look different`);
  const evo = new Map();
  for (const id of ['captain_quack', 'bubble_shield']) evo.set(id, fingerprint(drawCheck('evolved ' + id, c => R.item(c, D.ITEMS[id], 100, 100, 0, 1, {}))));
  h.ok(evo.get('captain_quack') !== its.get('rubber_duck') && evo.get('bubble_shield') !== its.get('soap_bar'), 'the evolutions look new');
  // a bubble forming, floating, held and popping all look different
  const bub = new Map();
  for (const [k, st] of [['form', { t: 1, k: 0.4 }], ['float', { t: 1, k: 1 }], ['held', { t: 1, k: 1, held: true }], ['pop', { t: 1, k: 1, pop: 0.5 }]]) bub.set(k, fingerprint(drawCheck('bubble ' + k, c => R.ros.bubble(c, 200, 300, 24, st))));
  h.eq(uniqueRatio(bub).ratio, 1, 'every bubble state shows');
  drawCheck('bubble null state', c => { R.ros.bubble(c, 200, 300, 24, null); c.fillRect(0, 0, 1, 1); });
  drawCheck('water', c => R.ros.water(c, 30, 446, 600, 800, 1.2));
  drawCheck('goo', c => R.ros.goo(c, 200, 450, 220, 500, 1, false));
  drawCheck('goo stuck', c => R.ros.goo(c, 200, 450, 220, 500, 1, true));
  drawCheck('mirror sign', c => R.ros.mirrorSign(c, 42, 418, 1));
  drawCheck('mirror finger', c => R.ros.mirrorFinger(c, 100, 380, 770, 1));
  drawCheck('quake sign', c => R.ros.quakeSign(c, 270, 450, 1, 0.7));
  const g = new Map();
  for (const [k, st] of [['empty', { n: 0, want: 3 }], ['two', { n: 2, want: 1, popped: 3 }], ['full', { n: 6, want: 0, popped: 9, combo: 1 }]]) g.set(k, fingerprint(drawCheck('gauge ' + k, c => R.ros.meter(c, 522, 450, Object.assign({ t: 1 }, st)))));
  h.eq(uniqueRatio(g).ratio, 1, 'the gauge counts');
  // the new pets: in DATA and in RENDER, every pose and mood, all distinct from the old ones
  h.ok(['penguin', 'molerat', 'roomba'].every(id => R.pets.KEYS.includes(id) && R.pets.ART[id]), 'drawn by the pets table');
  const pets = new Map();
  for (const id of D.PET_IDS) pets.set(id, fingerprint(drawCheck('pet ' + id, c => R.pet(c, id, 100, 100, 1.2, { t: 1, lv: 1 }))));
  h.eq(uniqueRatio(pets).ratio, 1, 'eleven different pets');
  for (const id of ['penguin', 'molerat', 'roomba']) {
    const poses = new Map();
    for (const pose of ['sit', 'run', 'act']) poses.set(pose, fingerprint(drawCheck(`${id} ${pose}`, c => R.pet(c, id, 100, 100, 1.2, { t: 1.3, lv: 1, pose, k: 0.3 }))));
    h.eq(uniqueRatio(poses).ratio, 1, id + ': sitting, running and at work look different');
    for (const mood of ['happy', 'cheer', 'scared', 'sleep', 'sad', 'focus']) drawCheck(`${id} ${mood}`, c => R.pet(c, id, 100, 100, 1, { t: 1, lv: 5, mood, look: 0.5, dir: -1 }));
    const lv1 = fingerprint(drawCheck(id + ' lv1', c => R.pet(c, id, 100, 100, 1, { t: 1, lv: 1 }))), lv4 = fingerprint(drawCheck(id + ' lv4', c => R.pet(c, id, 100, 100, 1, { t: 1, lv: 4 })));
    h.ok(lv1 !== lv4, id + ': the level looks show');
  }
});

// ---- DUO (round 11): the hand-off card, the coin toss, the claw-off's board, sabotage cards, the podium
h.test('DUO: the hand-off at every beat, the coin toss, the board, every sabotage card, the podium in every result', () => {
  const api = boot({ only: ['util', 'art', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, Rd = R.duo;
  h.ok(Rd && ['spot', 'tag', 'target', 'card', 'handoff', 'coin', 'board', 'podium'].every(k => typeof Rd[k] === 'function') && Rd.T.flip > 0, 'RENDER.duo');
  const e0 = Rd.E.n;
  // colours and words are not in the call fingerprint: this one keeps every fill colour and every word painted
  const ink = (fn) => {
    const out = [];
    const ctx = new Proxy({ canvas: { width: 540, height: 960 } }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'measureText') return () => ({ width: 40 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
        if (k === 'fillText' || k === 'strokeText') return (s) => out.push('T:' + s);
        return () => {};
      },
      set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') out.push(k[0] + ':' + v); t[k] = v; return true; },
    });
    fn(ctx);
    return out.join('|');
  };
  // the hand-off: the back of the card (edge on), the front, the countdown, READY?, a taunt; each beat looks different
  const st = (t, o) => Object.assign({ t, now: t, name: 'Jasmin', col: '#2ee6d6', char: 'alchemist', count: Math.max(0, 3 - Math.max(0, t - 0.6)), total: 3, from: 'Roxor', fromCol: '#ff2e88', fromChar: 'knight', label: 'Round 1 · drop 2 of 6', sub: 'Roxor 3 : 0 Jasmin' }, o || {});
  const beats = new Map();
  for (const t of [0.05, 0.2, 0.45, 0.7, 1.9, 3.8]) beats.set(String(t), fingerprint(drawCheck('hand-off at ' + t, c => Rd.handoff(c, 540, 960, st(t)))));
  h.ok(new Set(beats.values()).size >= 5, 'the card turns over, then counts 3, 2, 1, then READY?');
  const back = fingerprint(drawCheck('hand-off back', c => Rd.handoff(c, 540, 960, st(0.1)))), front = fingerprint(drawCheck('hand-off front', c => Rd.handoff(c, 540, 960, st(0.9))));
  h.ok(back !== front, 'the back of the card is not its front');
  const plain = fingerprint(drawCheck('hand-off ready', c => Rd.handoff(c, 540, 960, st(4))));
  const taunt = fingerprint(drawCheck('hand-off with a taunt', c => Rd.handoff(c, 540, 960, st(4, { msg: { text: 'Nyah nyah!', icon: 'x' }, msgT: 0.5 }))));
  h.ok(plain !== taunt, 'a taunt shows in its bubble');
  const cols = new Map();
  for (const c of D.DUO.COLORS) { drawCheck('hand-off in ' + c.id, (x) => Rd.handoff(x, 540, 960, st(4, { col: c.col }))); cols.set(c.id, ink((x) => Rd.handoff(x, 540, 960, st(4, { col: c.col })))); }
  h.eq(new Set(cols.values()).size, D.DUO.COLORS.length, 'every player colour shows on the card');
  h.ok(ink((x) => Rd.handoff(x, 540, 960, st(4))).includes('T:JASMIN') && ink((x) => Rd.handoff(x, 540, 960, st(1))).includes('T:3'), 'the name and the count are on it');
  const red = fingerprint(drawCheck('hand-off reduced', c => Rd.handoff(c, 540, 960, st(0, { reduced: true, now: 1 }))));
  h.ok(red !== fingerprint(drawCheck('hand-off t0', c => Rd.handoff(c, 540, 960, st(0, { now: 1 })))), 'reduced motion: no flip, the front at once');
  drawCheck('hand-off with nothing', c => Rd.handoff(c, 0, 0, null));
  // the coin toss: it spins (the faces change), lands on the winner, who gets the spotlight
  const cs = (t, w, o) => Object.assign({ t, dur: 2, w, flips: D.duoToss(w ? 2 : 1).flips, names: ['Roxor', 'Jasmin'], cols: ['#ff2e88', '#2ee6d6'], chars: ['knight', 'rogue'] }, o || {});
  const spin = new Map();
  for (const t of [0.1, 0.4, 0.8, 1.2, 1.6]) spin.set(String(t), fingerprint(drawCheck('coin at ' + t, c => Rd.coin(c, 540, 960, cs(t, 1)))));
  h.ok(new Set(spin.values()).size >= 4, 'the coin turns over as it flies');
  const l0 = fingerprint(drawCheck('coin lands on P1', c => Rd.coin(c, 540, 960, Object.assign(cs(3, 0), { flips: D.duoToss(1).w === 0 ? D.duoToss(1).flips : 10 })))), l1 = fingerprint(drawCheck('coin lands on P2', c => Rd.coin(c, 540, 960, cs(3, 1))));
  h.ok(l0 !== l1, 'who starts shows');
  drawCheck('coin reduced', c => Rd.coin(c, 540, 960, cs(0, 1, { reduced: true })));
  drawCheck('coin with nothing', c => Rd.coin(c, 0, 0, null));
  // the board: whose drop, the scores, rounds won, drops left, a flash
  const bd = (o) => { const s = Object.assign({ t: 1, names: ['Roxor', 'Jasmin'], cols: ['#ff2e88', '#2ee6d6'], sc: [3, 5], wins: [1, 0], drops: 4, used: [1, 2], who: 0, round: 2 }, o); return fingerprint(drawCheck('board ' + JSON.stringify(o), c => Rd.board(c, s))) + '#' + ink((c) => Rd.board(c, s)); };
  const boards = [bd({}), bd({ who: 1 }), bd({ sc: [9, 5] }), bd({ wins: [1, 1] }), bd({ used: [3, 2] }), bd({ flash: [1, 0] })];
  h.eq(new Set(boards).size, boards.length, 'the board shows whose drop, the scores, the rounds, the drops left and a scoring flash');
  drawCheck('board with nothing', c => Rd.board(c, null));
  // every sabotage card, its back and its thumbnail
  const cards = new Map();
  for (const id of D.DUO.CARD_IDS) cards.set(id, fingerprint(drawCheck('card ' + id, c => Rd.card(c, 100, 150, 150, 214, D.DUO.CARDS[id], { text: true, glow: true }))) + '#' + ink((c) => Rd.card(c, 100, 150, 150, 214, D.DUO.CARDS[id], { text: true })));
  h.eq(new Set(cards.values()).size, D.DUO.CARD_IDS.length, 'every sabotage card looks its own');
  const bk = fingerprint(drawCheck('card back', c => Rd.card(c, 100, 150, 150, 214, D.DUO.CARDS.fog, { back: true })));
  const mini = fingerprint(drawCheck('card thumb', c => Rd.card(c, 30, 45, 60, 86, D.DUO.CARDS.fog, { mini: true })));
  h.ok(bk !== cards.get('fog') && mini !== cards.get('fog'), 'a card back and a thumbnail differ from the face');
  drawCheck('card with nothing', c => Rd.card(c, 100, 150, 150, 214, null, null));
  // the podium: either winner, a draw, a team win, a knock out
  const pd = (o) => fingerprint(drawCheck('podium ' + JSON.stringify(o), c => Rd.podium(c, 540, 960, Object.assign({ t: 1, names: ['Roxor', 'Jasmin'], cols: ['#ff2e88', '#2ee6d6'], chars: ['knight', 'alchemist'], sc: [2, 1] }, o))));
  const pods = [pd({ win: 0 }), pd({ win: 1, sc: [1, 2] }), pd({ win: -1, sc: [1, 1] }), pd({ coop: true, won: true }), pd({ coop: true, won: false })];
  h.eq(new Set(pods).size, pods.length, 'the podium: either winner up top, a draw, a team win, a knock out');
  drawCheck('podium with nothing', c => Rd.podium(c, 0, 0, null));
  drawCheck('tag', c => Rd.tag(c, 100, 100, 'ROXOR', '#ff2e88', true));
  drawCheck('tag unlit', c => Rd.tag(c, 100, 100, 'ROXOR', 'not a colour', false));
  drawCheck('target', c => Rd.target(c, 300, 120, 'Jasmin', '#2ee6d6', 2));
  drawCheck('spot', c => Rd.spot(c, 300, 500, 80, '#ffc94d', 0.3));
  h.eq(Rd.E.n - e0, 0, 'no duo draw fell over inside its try ' + Rd.E.last);
});

// ---- SCHOOL (round 11): Claw School and the Practice Cabinet
h.test('SCHOOL: the chalkboard, Professor Pincher, stars, the scoreboard, the target, the classroom, the result card, the report card and the diploma', () => {
  const api = boot({ only: ['util', 'art', 'physics', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, Rs = R.sch;
  h.ok(Rs && ['chalk', 'wrap', 'board', 'cap', 'prof', 'star', 'stars', 'score', 'target', 'room', 'result', 'stamp', 'report', 'diploma'].every(k => typeof Rs[k] === 'function'), 'RENDER.sch');
  const e0 = Rs.E.n;
  // words and colours are not in the call fingerprint: this ctx keeps every fill colour and word painted
  const ink = (fn) => {
    const out = [];
    const ctx = new Proxy({ canvas: { width: 540, height: 960 } }, {
      get(t, k) {
        if (k in t) return t[k];
        if (k === 'measureText') return (s) => ({ width: String(s).length * 9 });
        if (k === 'createLinearGradient' || k === 'createRadialGradient' || k === 'createPattern') return () => ({ addColorStop() {} });
        if (k === 'fillText' || k === 'strokeText') return (s) => out.push('T:' + s);
        return () => {};
      },
      set(t, k, v) { if (k === 'fillStyle' || k === 'strokeStyle') out.push(k[0] + ':' + v); t[k] = v; return true; },
    });
    fn(ctx);
    return out.join('|');
  };
  const both = (label, fn) => fingerprint(drawCheck(label, fn)) + '#' + ink(fn);
  // the board: a title and wrapped lines, never past its bottom; the side room narrows the lines
  const wctx = { measureText: (s) => ({ width: String(s).length * 10 }), set font(v) { this.f = v; } };
  const lines = Rs.wrap(wctx, 'Dig the golden duck out from under the pile of rocks and slag', 200, 17);
  h.ok(lines.length > 1 && lines.every(l => l.length * 10 <= 200 || !l.includes(' ')), 'the words wrap inside the board: ' + lines.join(' / '));
  h.eq(lines.join(' '), 'Dig the golden duck out from under the pile of rocks and slag', 'no word is lost to the wrap');
  const b1 = both('board', c => Rs.board(c, 24, 60, 492, 248, { title: 'Buried Treasure', lines: [{ s: 'Dig it out', size: 21 }, null, { s: '3 stars: in 2 drops', size: 15 }] }));
  const b2 = both('board narrow', c => Rs.board(c, 24, 60, 492, 248, { title: 'Buried Treasure', pad: 76, lines: [{ s: 'Dig the golden duck out from under the whole pile of rocks', size: 21 }] }));
  h.ok(b1 !== b2, 'a different goal draws a different board');
  let painted = 0;
  const tall = new Proxy({}, { get(t, k) { if (k === 'measureText') return (s) => ({ width: String(s).length * 11 }); if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} }); if (k === 'fillText') return (s, x, y) => { if (y > 60 + 100 + 1) painted++; }; return () => {}; }, set() { return true; } });
  Rs.board(tall, 24, 60, 300, 100, { title: 'T', lines: Array.from({ length: 12 }, () => ({ s: 'a line of chalk that goes on and on', size: 17 })) });
  h.eq(painted, 0, 'lines past the bottom of the board are never painted');
  drawCheck('board with nothing', c => Rs.board(c, 0, 0, 100, 60, null));
  // Professor Pincher in every mood, the cap alone
  const moods = new Map();
  for (const m of ['happy', 'sad', 'focus', '']) moods.set(m || 'none', fingerprint(drawCheck('prof ' + m, c => Rs.prof(c, 470, 96, 0.72, 1.3, m))));
  h.ok(new Set(moods.values()).size >= 3, 'the professor\'s face shows his mood');
  drawCheck('cap', c => Rs.cap(c, 100, 100, 1, '#241a3a', 2));
  // stars: on, off, popping in, a row of 0..3
  const on = both('star on', c => Rs.star(c, 50, 50, 20, true, { t: 1 })), off = both('star off', c => Rs.star(c, 50, 50, 20, false, { t: 1 }));
  const half = fingerprint(drawCheck('star popping', c => Rs.star(c, 50, 50, 20, true, { pop: 0.5 })));
  h.ok(on !== off && half.split('#')[0] !== on.split('#')[0], 'an earned star, an empty slot and a star popping in all differ');
  const rows = [0, 1, 2, 3].map(n => both('stars ' + n, c => Rs.stars(c, 270, 100, 20, n, 8, null, 1)));
  h.eq(new Set(rows).size, 4, 'zero to three stars in a row all differ');
  drawCheck('star with nothing', c => Rs.star(c, 0, 0, 10, true, null));
  // the scoreboard: the numbers show, a flash shows
  const sc = (o) => both('score ' + JSON.stringify(o), c => Rs.score(c, 20, 58, 500, 80, Object.assign({ t: 1, cells: [{ k: 'DELIVERED', v: 3, col: '#ffc94d' }, { k: 'THIS GRAB', v: 1 }, { k: 'BEST GRAB', v: 2 }, { k: 'GRABS', v: 4 }] }, o)));
  const s0 = sc({}), s1 = sc({ cells: [{ k: 'DELIVERED', v: 4, col: '#ffc94d' }, { k: 'THIS GRAB', v: 1 }, { k: 'BEST GRAB', v: 2 }, { k: 'GRABS', v: 4 }] }), s2 = sc({ cells: [{ k: 'DELIVERED', v: 3, col: '#ffc94d', flash: 1 }, { k: 'THIS GRAB', v: 1 }, { k: 'BEST GRAB', v: 2 }, { k: 'GRABS', v: 4 }] });
  h.ok(s0 !== s1 && s0 !== s2, 'the scoreboard shows its numbers and flashes a change');
  drawCheck('score with nothing', c => Rs.score(c, 0, 0, 100, 40, null));
  for (const t of [0, 0.3]) drawCheck('target ' + t, c => Rs.target(c, 200, 300, 14, t));
  const geo = (t) => { const out = []; Rs.target(new Proxy({}, { get(o, k) { if (k === 'arc' || k === 'moveTo') return (...a) => out.push(a.map(v => Math.round(v * 10) / 10).join(',')); return () => {}; }, set() { return true; } }), 200, 300, 14, t); return out.join('|'); };
  h.ok(geo(0) !== geo(0.3), 'the target marker pulses and its arrow bobs');
  // the classroom: bare, with a board and the professor, without the pennants
  const rm = [both('room', c => Rs.room(c, 540, 960, { t: 1 })), both('room titled', c => Rs.room(c, 540, 960, { t: 1, title: 'CLAW SCHOOL', sub: 'Learn the claw.' })),
    both('room no flags', c => Rs.room(c, 540, 960, { t: 1, flags: false })), both('room no prof', c => Rs.room(c, 540, 960, { t: 1, title: 'X', prof: false }))];
  h.eq(new Set(rm).size, 4, 'the classroom with and without its board, the professor and the pennants');
  drawCheck('room with nothing', c => Rs.room(c, 540, 960, null));
  // the result card: a pass with 1..3 stars (they pop in), a fail, tickets, a new best, reduced motion
  const rs = (o) => both('result ' + JSON.stringify(o), c => Rs.result(c, 270, 560, Object.assign({ t: 2, win: true, stars: 3, title: 'PERFECT!', sub: '1 drop' }, o)));
  const res = [rs({}), rs({ stars: 2, title: 'CLEARED!' }), rs({ stars: 1, title: 'CLEARED!' }), rs({ win: false, title: 'TRY AGAIN', sub: 'Out of drops.' }), rs({ tix: 18 }), rs({ best: true })];
  h.eq(new Set(res).size, res.length, 'every result card reads differently');
  const early = fingerprint(drawCheck('result early', c => Rs.result(c, 270, 560, { t: 0.35, win: true, stars: 3 }))), late = fingerprint(drawCheck('result late', c => Rs.result(c, 270, 560, { t: 3, win: true, stars: 3 })));
  h.ok(early !== late, 'the stars pop in one by one');
  h.eq(fingerprint(drawCheck('result reduced early', c => Rs.result(c, 270, 560, { t: 0.05, win: true, stars: 3, reduced: true }))), fingerprint(drawCheck('result reduced late', c => Rs.result(c, 270, 560, { t: 3, win: true, stars: 3, reduced: true }))), 'reduced motion: the card is all there at once');
  drawCheck('result with nothing', c => Rs.result(c, 270, 560, null));
  // grades, the report card, the diploma
  const stamps = ['A+', 'A', 'B', 'C', 'D', '-'].map(g => both('stamp ' + g, c => Rs.stamp(c, 100, 100, 20, g, 1)));
  h.eq(new Set(stamps).size, 6, 'every grade stamps its own');
  const rows0 = D.SCH_LESSONS.map((L, i) => ({ name: L.name, icon: L.icon, got: i * 3, max: L.ch.length * 3, grade: D.schGrade(i * 3, L.ch.length * 3), col: L.color, locked: i > 2 }));
  const rp = [both('report', c => Rs.report(c, 26, 66, 488, 430, { name: 'Sir Grabsworth', rows: rows0, got: 30, max: D.SCH.MAX_STARS, t: 1 })),
    both('report full', c => Rs.report(c, 26, 66, 488, 430, { name: 'Sir Grabsworth', rows: rows0.map(r => Object.assign({}, r, { got: r.max, grade: 'A+', locked: false })), got: D.SCH.MAX_STARS, max: D.SCH.MAX_STARS, t: 1 }))];
  h.ok(rp[0] !== rp[1], 'the report card shows the grades');
  drawCheck('report with nothing', c => Rs.report(c, 0, 0, 300, 300, null));
  const dp = [both('diploma', c => Rs.diploma(c, 50, 516, 440, 250, { name: 'Sir Grabsworth', t: 1 })), both('diploma locked', c => Rs.diploma(c, 50, 516, 440, 250, { name: 'Sir Grabsworth', locked: true, left: 12, t: 1 }))];
  h.ok(dp[0] !== dp[1], 'the diploma is a faint preview until every star is in');
  drawCheck('diploma reduced', c => Rs.diploma(c, 50, 516, 440, 250, { name: 'X', t: 1, reduced: true }));
  drawCheck('diploma with nothing', c => Rs.diploma(c, 0, 0, 200, 120, null));
  h.eq(Rs.E.n - e0, 0, 'no school draw fell over inside its try ' + Rs.E.last);
});

// ---------- round 12 (LEG): legends: the crest, the fight's looks, the animated cabinets
// A context that records every call with its rounded numbers and every style
// and text it is given, so a sprite that moved (or changed colour) reads differently.
function argCtx() {
  const log = [];
  const r = (v) => (typeof v === 'number' ? Math.round(v * 10) / 10 : typeof v === 'string' ? v : '');
  const ctx = new Proxy({ canvas: { width: 540, height: 960 } }, {
    get(o, p) {
      if (p === 'log') return log;
      if (p === 'canvas') return o.canvas;
      if (p === 'measureText') return () => ({ width: 40 });
      if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
      if (typeof p !== 'string' || p === 'then') return o[p];
      if (p in o) return o[p];
      return (...a) => { log.push(p + '(' + a.map(r).join(',') + ')'); };
    },
    set(o, p, v) { if (p === 'fillStyle' || p === 'strokeStyle' || p === 'globalAlpha') log.push(p + '=' + r(v)); o[p] = v; return true; },
  });
  return ctx;
}
const argPrint = (fn) => { const c = argCtx(); let bad = null; try { fn(c); } catch (e) { bad = e; } h.ok(!bad, 'arg draw does not throw ' + (bad || '')); return c.log.join(';'); };
h.test('LEG: the animated cabinets draw live, hold still under reduced motion, and keep the cache bounded', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, L = R.leg;
  h.ok(L && typeof L.anim === 'function', 'RENDER.leg');
  const cfg = { w: 480, h: 390, frame: 30, chuteW: 64, dividerH: 0.45, railY: 26 };
  const animated = D.vaultList('skin').filter(id => L.animOf(D.COSMETICS[id]));
  for (const id of ['skin_space', 'skin_lava', 'skin_haunted', 'skin_jungle', 'skin_gold', 'skin_rainbow'].concat(D.LEG.SKINS)) h.ok(animated.includes(id), id + ' animates');
  for (const id of ['skin_classic', 'skin_candy', 'skin_wood', 'skin_chrome']) h.ok(!animated.includes(id), id + ' stays still');
  // the live layer on its own (the cabinet's own bulbs and chute glow move with t anyway)
  const lay = (id, t, red) => { R.fx.reduced = !!red; const s = argPrint(c => L.anim(c, cfg, D.COSMETICS[id], t, false)); R.fx.reduced = false; return s; };
  const moving = new Map();
  for (const id of animated) {
    const a = lay(id, 1.1), b = lay(id, 2.35);
    h.ok(a.length > 40 && a !== b, id + ': the live layer moves between frames');
    moving.set(id, a);
    h.eq(lay(id, 1.1, true), lay(id, 7.9, true), id + ': reduced motion holds one still pose');
    drawCheck(id + ' cabinet', c => { R.cabinetBack(c, 30, 410, cfg, { t: 2.1, act: 1, skin: id }); R.cabinetFront(c, 30, 410, cfg, { t: 2.1, skin: id }); });
    R.acc.set({ noFlash: true });
    drawCheck(id + ' reduced flashing', c => R.cabinetBack(c, 30, 410, cfg, { t: 3.3, act: 2, skin: id }));
    R.acc.set({ noFlash: false });
    drawCheck(id + ' under the alarm and the party', c => R.cabinetBack(c, 30, 410, cfg, { t: 3.3, act: 3, skin: id, alarm: 1, party: 1, marquee: 'JACKPOT!' }));
    drawCheck(id + ' thumbnail', c => R.vault.thumb(c, id, 50, 50, 100, 2.2));
  }
  h.eq(new Set(moving.values()).size, moving.size, 'every animated cabinet draws its own');
  h.eq(lay('skin_classic', 1.1), '', 'the classic cabinet has no live layer (the old look exactly)');
  // the cache: a fake document; 60 frames of every animated skin build one layer each, never more than the cap
  const mk = () => new Proxy({ calls: [] }, { get(o, p) {
    if (p === 'getTransform') return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'createLinearGradient' || p === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (p === 'calls') return o.calls;
    if (typeof p !== 'string' || p === 'then') return o[p];
    return (...a) => { o.calls.push(p); };
  }, set(o, p, v) { o[p] = v; return true; } });
  let built = 0;
  const doc = api._document, ce0 = doc.createElement;
  doc.createElement = () => ({ width: 0, height: 0, getContext: () => { built++; return mk(); } });
  try {
    R.perf.cabLayer = true;
    const main = mk();
    const b0 = built;
    for (let f = 0; f < 60; f++) R.cabinetBack(main, 30, 410, cfg, { t: f / 60, act: 1, skin: 'skin_space' });
    const once = built - b0;
    h.ok(once >= 1 && once <= 4, 'skin_space: 60 frames build its back once (plus a few glow sprites) [' + once + ']');
    for (const id of animated) for (let f = 0; f < 20; f++) R.cabinetBack(main, 30, 410, cfg, { t: f / 20, act: 1, skin: id });
    const before = built;
    for (let f = 0; f < 30; f++) R.cabinetBack(main, 30, 410, cfg, { t: 2 + f / 30, act: 1, skin: animated[animated.length - 1] });
    h.ok(built - before <= 1, 'the live layers never rebuild the cached back frame to frame');
  } finally { doc.createElement = ce0; R.perf.cabLayer = true; }
});

h.test('LEG: the legendary crest, the Hype plate, the peek chip, the black hole, the golden sparkle, the new evolved art', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, L = R.leg;
  for (const id of D.LEG.RELICS) {
    const def = D.RELICS[id];
    const a = fingerprint(drawCheck('legendary ' + id, c => R.relicIcon(c, def, 30, 30, 44, 1.2)));
    const b = fingerprint(drawCheck('as a boss relic ' + id, c => R.relicIcon(c, Object.assign({}, def, { rarity: 'boss' }), 30, 30, 44, 1.2)));
    h.ok(a !== b, id + ': the crest sets a legendary apart from a boss relic');
    h.ok(R.relicLive(def, 0), id + ': its medallion is live');
  }
  for (const n of [0, 1, 5, 10]) drawCheck('hype ' + n, c => L.hype(c, 40, 830, n, 1.3));
  const hy = [0, 1, 5, 10].map(n => argPrint(c => L.hype(c, 40, 830, n, 1.3)));
  h.eq(new Set(hy).size, 4, 'the Hype plate reads every level');
  const PK = [{ k: 'attack', v: 12, n: 1 }, { k: 'attack', v: 4, n: 3 }, { k: 'block', v: 6, n: 1 }, { k: 'charge', v: 0, n: 1 }, { k: '?', unknown: true }];
  for (const o of PK) drawCheck('peek ' + JSON.stringify(o), c => L.peek(c, 200, 100, o, 0.7));
  const pk = PK.map(o => argPrint(c => L.peek(c, 200, 100, o, 0.7)));
  h.eq(new Set(pk).size, pk.length, 'the peek chip says what comes');
  h.eq(argPrint(c => L.peek(c, 0, 0, null, 0)).indexOf('fill('), -1, 'no peek, nothing drawn');
  h.ok(fingerprint(drawCheck('vortex', c => L.vortex(c, 480, 780, 16, 1, 0))) !== fingerprint(drawCheck('vortex flared', c => L.vortex(c, 480, 780, 16, 1, 1))), 'the black hole flares');
  drawCheck('golden sparkle', c => L.gold(c, 200, 450, 2, 1));
  // the new evolved items: their own drawings, apart from their bases
  const prints = new Set();
  for (const id of D.LEG.EVOS) {
    const d = D.ITEMS[id], base = D.ITEMS[D.EVOLUTIONS[id].from];
    const a = fingerprint(drawCheck('evolved ' + id, c => R.pol.art(c, d, {})));
    const b = fingerprint(drawCheck('base ' + base.id, c => R.pol.art(c, base, {})));
    h.ok(a !== b, id + ': drawn apart from its base');
    h.ok(typeof R.evo.ART[id] === 'function', id + ': an EVO_ART drawing');
    prints.add(a);
    drawCheck('evolved ' + id + ' in the cabinet', c => { R.item(c, d, 100, 100, 0.4, 1, {}); R.itemFx(c, d, 100, 100, 0.4, 1, { t: 1, mat: { traits: {} } }, 'back'); });
  }
  h.eq(prints.size, D.LEG.EVOS.length, 'ten distinct drawings');
});

// ---------------------------------------------------------------- TRD (round 14): the Trading Post and the evolved pets
h.test('TRD: Rocco, his cart, the counter and the haggle at every beat; the map icon; every evolved pet', () => {
  const api = boot({ only: ['util', 'art', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, T = R.trd;
  h.ok(T && typeof T.scene === 'function' && typeof T.icon === 'function' && typeof T.rocco === 'function', 'RENDER.trd');
  const K = { give: 0.7, think: 1.15, get: 1.75, shake: 2.0, done: 2.6 };
  const give = [{ kind: 'item', def: D.ITEMS.rusty_sword, plus: true }, { kind: 'gold', n: 78 }];
  const get = [{ kind: 'item', def: D.ITEMS.torch, hidden: true }, { kind: 'relic', def: D.RELICS.festering_jar }, { kind: 'clean', mode: 'curse' }];
  const st = (phase, k, o) => Object.assign({ t: 1.3, x: 0, y: 66, w: 540, h: 330, phase, k, K, give, get, stamp: 0, line: '', lineK: 0, reduced: false }, o || {});
  const beats = [['idle', 0], ['haggle', 0.3], ['haggle', 0.9], ['haggle', 1.4], ['haggle', 1.9], ['haggle', 2.05], ['haggle', 2.4], ['done', 2.6]];
  const prints = beats.map(([ph, k]) => argPrint(c => T.scene(c, st(ph, k, ph === 'haggle' && k > 2 ? { stamp: 0.9 } : {}))));
  for (let i = 0; i < beats.length; i++) drawCheck('trade scene ' + beats[i].join(' '), c => T.scene(c, st(beats[i][0], beats[i][1])));
  h.eq(new Set(prints).size, prints.length, 'every beat of the haggle draws apart');
  h.ok(prints[5].indexOf('DEAL!') >= 0, 'the DEAL! stamp at the handshake');
  h.ok(prints[3].indexOf('HMM...') >= 0, 'Rocco thinks it over');
  h.ok(argPrint(c => T.scene(c, st('idle', 0, { line: 'Fair and square, friend.', lineK: 1 }))).indexOf('Fair and square, friend.') >= 0, 'Rocco talks when tapped');
  h.eq(argPrint(c => T.scene(c, st('idle', 0, { reduced: true, t: 1 }))), argPrint(c => T.scene(c, st('idle', 0, { reduced: true, t: 1 }))), 'deterministic');
  drawCheck('trade scene null-safe', c => { T.scene(c, null); T.scene(c, { phase: 'haggle', k: 1 }); T.rocco(c, 0, 0, 1, null); T.token(c, null, 0, 0, 1); T.icon(c, 12, 0); });
  const poses = ['idle', 'think', 'take', 'give', 'shake', 'grin'].map(p => argPrint(c => T.rocco(c, 270, 300, 1, { t: 1, pose: p })));
  h.eq(new Set(poses).size, poses.length, 'six poses of Rocco');
  const toks = [{ kind: 'item', def: D.ITEMS.torch }, { kind: 'item', def: D.ITEMS.torch, hidden: true }, { kind: 'relic', def: D.RELICS.festering_jar }, { kind: 'gold', n: 5 }, { kind: 'clean' }].map(k => argPrint(c => T.token(c, k, 50, 50, 1)));
  h.eq(new Set(toks).size, toks.length, 'every good on the counter draws its own way');
  // the map icon: its own, apart from the shop's and the pet shop's
  const hx = (type, revealed) => fingerprint(drawCheck(`hex ${type} ${revealed ? 'lit' : 'dark'}`, c => R.hex(c, 50, 50, 30, { type, revealed, known: true, q: 1, r: 2 }, { t: 1 })));
  h.ok(hx('trader', true) !== hx('petshop', true) && hx('trader', true) !== hx('shop', true), 'the icon on the map is its own');
  h.ok(hx('trader', false) !== hx('empty', false), 'and its silhouette shows in the dark');
  // every final form: bigger, glowing, its own flourish; an ordinary Lv 5 pet is untouched
  const forms = new Set();
  for (const id of D.PET_IDS) {
    const f = D.PEV_FORMS[id];
    const plain = argPrint(c => R.pet(c, id, 100, 100, 1, { t: 1, lv: 5 }));
    const evo = argPrint(c => R.pet(c, id, 100, 100, 1, { t: 1, lv: 5, evo: f }));
    h.ok(plain !== evo, id + ': the final form draws apart');
    h.eq(plain, argPrint(c => R.pet(c, id, 100, 100, 1, { t: 1, lv: 5, evo: null })), id + ': no evo, the old look');
    const lk = Math.round(T.LOOK * 10) / 10;   // (argPrint keeps one decimal)
    h.ok(T.LOOK > 1 && evo.indexOf('scale(' + lk + ',' + lk + ')') >= 0, id + ': bigger');
    drawCheck('evolved ' + id, c => R.pet(c, id, 100, 100, 1, { t: 2, lv: 5, evo: f, mood: 'cheer', pose: 'run' }));
    forms.add(f.flair);
  }
  h.eq(forms.size, 6, 'six kinds of flourish');
  // the evolution ceremony draws the pet through st.art
  let drew = 0;
  const cer = { t: 2.0, dur: 3.2, burst: 1.4, rise: 0.7, x0: 270, y0: 1000, x: 270, y: 470, from: null, to: { name: 'Turbo Hamster' }, name: 'Turbo Hamster', aura: 'Stampede: Every trick also hits a random enemy for 3.', col: '#ffb347', W: 540, H: 960, art: (c, x, y, spin, sc, after) => { drew++; R.pet(c, 'hamster', x, y, sc, { t: 2, lv: 5, evo: after ? D.PEV_FORMS.hamster : null }); } };
  drawCheck('pet ceremony before', c => R.evo.ceremony(c, Object.assign({}, cer, { t: 0.8 })));
  drawCheck('pet ceremony after', c => R.evo.ceremony(c, cer));
  h.eq(drew, 2, 'the ceremony drew the pet both times');
});

/* ------------------------------------------------- DEP (round 15): the Neon Depths */
if (HAS_DATA) h.test('DEP: the Depths\' tiles, map, arena, cabinet water, the six monsters, their tricks and intents', () => {
  const api = boot({ only: ['util', 'data', 'render'] });
  const R = api.RENDER, D = api.DATA, X = R.dep;
  h.ok(X && ['terrain', 'prop', 'mapBg', 'mapFx', 'arena', 'cabBack', 'caustics', 'water', 'lure', 'pincer', 'jellyGlow', 'chestTell', 'intentIcon', 'fish', 'loreAct'].every(k => typeof X[k] === 'function'), 'RENDER.dep has every piece');
  h.ok(R.BIOME_PAL.depths && R.SIG_COL.tide, 'the Depths\' palette and the High Tide sign colour');
  // the tiles: every ground, both orientations, animated, and not the vault's
  const tiles = new Map();
  for (const g of ['grass', 'forest', 'dirt', 'sand', 'mountain', 'sea', 'shallow', 'ford']) for (const orient of ['v', 'h']) {
    const terrain = g === 'sea' || g === 'shallow' ? 'sea' : 'land';
    const tile = { q: 1, r: 2, terrain, ground: g, biome: 'depths', elev: g === 'mountain' ? 0.9 : 0.3, ford: g === 'ford' };
    tiles.set(g + orient, fingerprint(drawCheck(`depths ${g} ${orient}`, c => R.terrainHex(c, 100, 100, 40, tile, { t: 1.2, orient, seed: 5, biome: 'depths' }))));
  }
  const grounds = new Set(['grass', 'forest', 'dirt', 'sand', 'mountain', 'sea'].map(g => tiles.get(g + 'v')));
  h.ok(grounds.size >= 5, `the grounds read apart (${grounds.size} of 6)`);
  const vault = fingerprint(drawCheck('vault grass', c => R.terrainHex(c, 100, 100, 40, { terrain: 'land', ground: 'grass', biome: 'vault' }, { t: 1.2, orient: 'v', seed: 5, biome: 'vault' })));
  h.ok(vault !== tiles.get('grassv'), 'the Depths draw their own tiles');
  const seas = new Set([0, 1, 2, 3, 5, 8].map(seed => fingerprint(drawCheck('depths sea seed ' + seed, c => X.terrain(c, 100, 100, 40, { terrain: 'sea', ground: 'sea' }, { t: 1 + seed * 0.3, orient: 'v', seed })))));
  h.ok(seas.size >= 3, `the deep water varies (ripples, rising bubbles) with its seed (${seas.size})`);
  h.ok(X.dark('depths') !== X.dark('vault'), 'the fog is tinted teal');
  drawCheck('depths map bg', c => X.mapBg(c, 540, 960, 2));
  drawCheck('depths map fx', c => X.mapFx(c, 0, 0, 540, 960, 2, false));
  drawCheck('depths map fx reduced', c => X.mapFx(c, 0, 0, 540, 960, 2, true));
  // the arena: animated, the tide and the live water read
  const arena = new Map();
  for (const st of [{}, { tide: 1 }, { live: 1 }]) arena.set(JSON.stringify(st), fingerprint(drawCheck(`arena ${JSON.stringify(st)}`, c => X.arena(c, 540, 340, 1, st))));
  h.eq(uniqueRatio(arena).ratio, 1, 'the arena floods and sparks');
  for (const t of [0, 2.5, 9.7]) drawCheck('arena t' + t, c => X.arena(c, 540, 340, t, {}));
  drawCheck('arena reduced', c => X.arena(c, 540, 340, 1, { reduced: true }));
  drawCheck('arena tall', c => X.arena(c, 540, 960, 1, {}));
  // the cabinet: back, caustics, the water at every level and state
  drawCheck('cab back', c => X.cabBack(c, 30, 410, 480, 390, 1));
  const water = new Map();
  for (const st of [{}, { tide: 1 }, { live: 1 }]) water.set(JSON.stringify(st), fingerprint(drawCheck(`water ${JSON.stringify(st)}`, c => { X.caustics(c, 30, 410, 480, 390, 1.3, 700); X.water(c, 30, 510, 700, 800, 1.3, st); })));
  h.eq(uniqueRatio(water).ratio, 1, 'the water, at high tide, live');
  for (const y of [420, 520, 790]) drawCheck('water at ' + y, c => { X.caustics(c, 30, 410, 480, 390, 1.3, y); X.water(c, 30, 510, y, 800, 1.3, {}); });
  drawCheck('water empty', c => { c.fillRect(0, 0, 1, 1); X.water(c, 30, 510, 800, 800, 1, {}); });
  // the tricks in the cabinet
  const lu = [0.2, 1].map(k => fingerprint(drawCheck('lure ' + k, c => X.lure(c, 200, 420, 600, 1, k))));
  h.ok(lu[0] !== lu[1], 'the lure fades in');
  drawCheck('pincer', c => X.pincer(c, 200, 700, 14, 1, 1));
  const jg = [false, true].map(tc => fingerprint(drawCheck('jelly glow ' + tc, c => X.jellyGlow(c, 200, 700, 16, 1, tc))));
  h.ok(jg[0] !== jg[1], 'a touched jelly flares');
  const tell = [true, false].map(real => fingerprint(drawCheck('chest tell ' + real, c => { c.fillRect(0, 0, 1, 1); X.chestTell(c, 200, 700, 15, 1.7, real, 1); })));
  h.ok(tell[0] !== tell[1], 'the real chest glints');
  // the six monsters: their own looks, every state
  const looks = new Map();
  for (const id of X.KEYS) {
    const def = D.ENEMIES[id];
    h.ok(def && def.look === id, id + ' has its look');
    looks.set(id, fingerprint(drawCheck('monster ' + id, c => R.enemy(c, def, 200, 280, 1, 1.3, {}))));
    for (const s of [{ hurt: 1 }, { attack: 0.6 }, { dead: 0.5 }, { frozen: true }, { windup: 1 }, { hpk: 0.1 }, { enraged: true, rage: 0.5 }]) drawCheck(id + ' ' + JSON.stringify(s), c => R.enemy(c, def, 200, 280, 1, 2.2, s));
    const base = fingerprint(drawCheck('base ' + def.art, c => R.enemy(c, Object.assign({}, def, { look: null }), 200, 280, 1, 1.3, {})));
    h.ok(base !== looks.get(id), id + ' differs from its fallback art (' + def.art + ')');
    const box = R.enemyBox(def, 1);
    h.ok(box.w > 20 && box.h > 20, id + ' has a body box');
  }
  h.eq(uniqueRatio(looks).ratio, 1, 'all six look different ' + uniqueRatio(looks).dupes.join(' '));
  h.ok(R.enemyBox(D.ENEMIES.dep_jukebox, 1).h > R.enemyBox(D.ENEMIES.dep_jelly, 1).h, 'the boss stands taller than a jelly');
  // the junk items draw their own silhouettes
  for (const id of ['dep_boot', 'dep_jellyling', 'dep_chest']) h.ok(typeof X.SIL[id] === 'function' || X.SIL[id], id + ' has a silhouette');
  // the intent icons, one for each trick
  const icons = new Map();
  for (const k of D.DEP_KINDS) {
    let ok = false;
    icons.set(k, fingerprint(drawCheck('intent ' + k, c => { ok = X.intentIcon(c, k, { n: 2 }, 0, 1, 0); })));
    h.ok(ok, k + ': an icon');
  }
  h.eq(uniqueRatio(icons).ratio, 1, 'each trick has its own icon');
  h.ok(!X.intentIcon(seqCtx().ctx, 'attack', {}, 0, 1, 0), 'other kinds are not the Depths\'');
  // the Codex pictures
  for (const e of D.loreBook().entries.filter(e => e.art && e.art.dep)) drawCheck('codex ' + e.id, c => R.lore.scene(c, e.art, 300, 200, {}, 1));
});

// CAB (round 16): the cabinet is alive (DESIGN.md "The cabinet is alive (round 16)")
h.test('CAB: the event sign at every beat, the Jackpot Lamp and its fever, coins, the surge, every face, the strain, the gritted claw', () => {
  const { RENDER: R, PHYS: P } = boot({ only: ['util', 'i18n', 'physics', 'data', 'render'] });
  const RC = R.cab;
  h.ok(RC && ['sign', 'lamp', 'coin', 'icon', 'surge', 'face', 'strain', 'bolt'].every((k) => typeof RC[k] === 'function'), 'RENDER.cab has its pieces');
  const ids = ['surge', 'coins', 'capsule'], names = ['POWER SURGE!', 'COIN SHOWER!', 'CAPSULE DROP!'];
  const signs = new Map();
  for (const [i, id] of ids.entries()) {
    for (const [lab, st] of [['swing in', { k: 0.4, roll: 0.1, spin: 1 }], ['spinning', { k: 1, roll: 0.5, spin: 4 }], ['landed', { k: 1, roll: 1, land: 0.3 }], ['held', { k: 1, roll: 1, land: 1 }], ['leaving', { k: 0.3, roll: 1, land: 1 }], ['reduced', { k: 1, roll: 1, land: 0.5, reduced: true }]]) {
      const s = drawCheck(`sign ${id} ${lab}`, (c) => RC.sign(c, 238, 560, Object.assign({ id, idx: i, ids, names, name: names[i], text: 'A line of words that has to wrap onto a second line here.', col: '#2ee6d6', t: 1.3, top: 410 }, st)));
      if (lab === 'held') signs.set(id, fingerprint(s));
    }
  }
  h.eq(uniqueRatio(signs).ratio, 1, 'each event\'s sign looks different');
  const { ctx: c0, stat: s0 } = seqCtx();
  RC.sign(c0, 238, 560, { k: 0 });
  h.eq(s0.paints, 0, 'a sign at k 0 draws nothing');
  const lamps = new Map();
  for (const [lab, st] of [['empty', { n: 0 }], ['half', { n: 6, pop: 0.5 }], ['almost', { n: 10 }], ['full', { n: 12 }], ['fever', { n: 12, fever: 0.8 }], ['burst', { n: 0, fever: 1, burst: 0.5 }], ['reduced fever', { n: 12, fever: 1, reduced: true }]]) {
    lamps.set(lab, fingerprint(drawCheck('lamp ' + lab, (c) => RC.lamp(c, 104, 395, 206, Object.assign({ max: 12, t: 2.1 }, st)))));
  }
  h.eq(uniqueRatio(lamps).ratio, 1, 'every lamp state looks different');
  drawCheck('lamp junk state', (c) => RC.lamp(c, 104, 395, 206, { n: NaN, max: 0, fever: null }));
  for (const a of [0, 0.7, 1.57, 3]) drawCheck('coin ' + a, (c) => RC.coin(c, 100, 700, 7.5, a, 1));
  for (const id of ids) drawCheck('icon ' + id, (c) => RC.icon(c, id, 100, 500, 60, 1));
  drawCheck('surge', (c) => RC.surge(c, 30, 436, 416, 1.7, false));
  drawCheck('surge reduced', (c) => RC.surge(c, 30, 436, 416, 1.7, true));
  const faces = new Map();
  for (const mood of ['', 'scared', 'gasp', 'ride', 'dizzy']) for (const legend of (mood === 'ride' || mood === 'dizzy' ? [false] : [false, true])) {   // (closed or spinning eyes have no pupils to glint)
    faces.set(mood + legend, fingerprint(drawCheck(`face ${mood || 'idle'}${legend ? ' legendary' : ''}`, (c) => RC.face(c, 200, 700, 14, { mood, lx: 0.5, ly: -0.4, blink: 0, t: 1.2, legend }))));
  }
  h.eq(uniqueRatio(faces).ratio, 1, 'every face looks different');
  const { ctx: cb, stat: sb } = seqCtx(); RC.face(cb, 200, 700, 14, { mood: '', blink: 1, t: 1 });
  h.ok(fingerprint(sb) !== faces.get('false'), 'a blink shuts the eyes');
  for (const k of [0.2, 0.6, 1]) drawCheck('strain ' + k, (c) => RC.strain(c, 238, 500, 13, k, 1.1, false, 238, 436));
  const { ctx: cz, stat: sz } = seqCtx(); RC.strain(cz, 238, 500, 13, 0, 1, false);
  h.eq(sz.paints, 0, 'no strain, nothing drawn');
  // the claw's gritted eyes
  const pose = P.clawPose('classic', {});
  const strained = fingerprint(drawCheck('claw strain mood', (c) => R.claw(c, pose, 0, 0, { juice: { mood: 'strain', t: 3 } })));
  const plain = fingerprint(drawCheck('claw no mood', (c) => R.claw(c, pose, 0, 0, { juice: { mood: '', t: 3 } })));
  h.ok(strained !== plain, 'a straining claw grits its eyes');
});

h.done();
