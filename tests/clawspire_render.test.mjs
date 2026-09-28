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

h.done();
