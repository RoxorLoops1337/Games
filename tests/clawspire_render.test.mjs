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

const ITEM_KEYS = ['sword', 'dagger', 'axe', 'hammer', 'anvil', 'shield', 'buckler', 'potion', 'flask', 'bomb', 'torch', 'iceshard', 'snowball', 'coin', 'gem', 'rock', 'slag', 'iceblock', 'apple', 'bread', 'book', 'scroll', 'orb', 'ring', 'key', 'chain', 'horn', 'whetstone', 'feather', 'skull', 'star', 'boot', 'bone', 'bottle', 'heart', 'lantern', 'wand', 'mask', 'egg', 'dice'];
const ENEMY_KEYS = ['rat', 'slime', 'bat', 'gremlin', 'mimic', 'spider', 'goblin', 'hoard', 'imp', 'clockwork', 'golem', 'furnace', 'magnet', 'ironjaw', 'wraith', 'yeti', 'frostmage', 'icemimic', 'prizemaster', 'mushroom', 'knight', 'wisp', 'crab', 'drone', 'tinker', 'cultist'];
const TILE_TYPES = ['empty', 'fight', 'elite', 'treasure', 'gem', 'ink', 'brush', 'event', 'shop', 'rest', 'forge', 'boss', 'start'];
const MOVE_KINDS = ['attack', 'block', 'buff', 'debuff', 'heal', 'shake', 'grease', 'fog', 'junk', 'steal', 'freezeItem', 'summon', 'tilt', 'charge', 'escape'];

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
    'terrainHex', 'terrainFill', 'biomePal', 'mapCompass', 'mapHeader', 'mapArrow'])
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
  // map terrain: every biome x terrain paints, land fill follows elevation and biome
  const tfp = new Map();
  for (const biome of ['cellar', 'foundry', 'vault']) {
    for (const terr of ['land', 'shallow', 'sea']) {
      const st = drawCheck(`terrainHex ${biome} ${terr}`, c => R.terrainHex(c, 50, 50, 30, { terrain: terr, elev: 0.9 }, { biome, seed: 12345, t: 1, orient: 'v' }));
      tfp.set(biome + terr, fingerprint(st));
    }
    drawCheck(`terrainHex ${biome} lowland`, c => R.terrainHex(c, 50, 50, 30, { terrain: 'land', elev: 0.1 }, { biome, seed: 6, t: 2, orient: 'v' }));
  }
  h.ok(uniqueRatio(new Map([['l', tfp.get('cellarland')], ['s', tfp.get('cellarshallow')], ['w', tfp.get('cellarsea')]])).ratio === 1, 'land, ford and sea draw differently');
  h.ok(tfp.get('cellarsea') !== tfp.get('foundrysea'), 'lava pools differ from water');
  drawCheck('terrainHex defaults', c => R.terrainHex(c, 0, 0, 30, null, null));
  h.ok(R.terrainFill('cellar', 'land', 0.1) !== R.terrainFill('cellar', 'land', 0.9), 'terrainFill shades by elevation');
  h.ok(R.terrainFill('vault', 'sea', 0.5) !== R.terrainFill('cellar', 'sea', 0.5), 'terrainFill differs per biome');
  h.eq(R.terrainFill('cellar', 'land', 0.5), R.terrainFill('cellar', 'land', 0.5), 'terrainFill is stable');
  h.ok(/^rgb\(/.test(R.terrainFill('foundry', 'sea', 0.3)) && R.biomePal('nope') === R.biomePal('cellar'), 'fills are rgb strings, unknown biomes fall back');
  // hex in terrain mode: coast edges, translucent fog, plate under the icon
  const tst = { t: 1, fill: 'rgb(120,110,90)', mask: 0b101010, biome: 'cellar', orient: 'v' };
  const th = drawCheck('hex terrain hidden coast', c => R.hex(c, 50, 50, 30, { type: 'fight', revealed: false, q: 1, r: 2, terrain: 'land', coast: true }, tst));
  const ph = drawCheck('hex plain hidden', c => R.hex(c, 50, 50, 30, { type: 'fight', revealed: false, q: 1, r: 2 }, { t: 1, orient: 'v' }));
  h.ok(fingerprint(th) !== fingerprint(ph), 'terrain fog differs from the solid fog');
  drawCheck('hex terrain revealed shop', c => R.hex(c, 50, 50, 30, { type: 'shop', revealed: true, q: 1, r: 2, terrain: 'land' }, tst));
  drawCheck('hex terrain visited empty', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: true, visited: true, q: 1, r: 2, terrain: 'land' }, tst));
  drawCheck('hex terrain ford hidden', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: false, q: 1, r: 2, terrain: 'shallow' }, tst));
  drawCheck('hex terrain ford revealed reachable', c => R.hex(c, 50, 50, 30, { type: 'empty', revealed: true, q: 1, r: 2, terrain: 'shallow' }, Object.assign({ reachable: true, path: 2, target: true }, tst)));
  drawCheck('hex terrain known landmark', c => R.hex(c, 50, 50, 30, { type: 'tower', revealed: false, known: true, q: 3, r: 4, terrain: 'land' }, tst));
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
  for (const id of ['knight', 'alchemist', 'rogue', 'nobody']) pfp.set(id, fingerprint(drawCheck('portrait ' + id, c => R.portrait(c, id, 40, 40, 64, 1))));
  h.ok(pfp.get('knight') !== pfp.get('alchemist') && pfp.get('alchemist') !== pfp.get('rogue') && pfp.get('knight') !== pfp.get('rogue'), 'portraits differ per character');
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

h.done();
