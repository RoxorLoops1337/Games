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
const ENEMY_KEYS = ['rat', 'slime', 'bat', 'gremlin', 'mimic', 'spider', 'goblin', 'hoard', 'imp', 'clockwork', 'golem', 'furnace', 'magnet', 'ironjaw', 'wraith', 'yeti', 'frostmage', 'icemimic', 'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist', 'raccoon', 'goat', 'magpie'];
const TILE_TYPES = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event', 'shop', 'rest', 'forge', 'boss', 'start'];
const MOVE_KINDS = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape', 'gulp', 'bomb', 'corrode', 'jam', 'eggs'];

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

h.done();
