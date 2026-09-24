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
const fakeRig = () => {
  const quad = (w, hh) => [{ x: -w / 2, y: -hh / 2 }, { x: w / 2, y: -hh / 2 }, { x: w / 2, y: hh / 2 }, { x: -w / 2, y: hh / 2 }];
  const prong = (d) => ({ x: 240 + d * 22, y: 190, a: d * 0.5, shape: { kind: 'poly', verts: [{ x: -4, y: -4 }, { x: 4, y: -4 }, { x: 3, y: 30 }, { x: -1, y: 34 }, { x: -6, y: 20 }] } });
  return { bodies: { carriage: { x: 240, y: 26, a: 0, shape: { kind: 'poly', verts: quad(40, 16) } }, palm: { x: 240, y: 170, a: 0.05, shape: { kind: 'poly', verts: quad(40, 18) } }, prongs: [prong(-1), prong(1), prong(0)] }, cableTop: { x: 240, y: 26 }, sway: 0.05, phase: 'dropping' };
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
  for (const name of ['item', 'enemy', 'cabinet', 'cabinetBack', 'cabinetFront', 'claw', 'bodyDebug', 'hex', 'mapBg', 'bg', 'hpBar', 'statusPips', 'intent', 'portrait', 'relicIcon', 'title', 'enemyBox'])
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
  drawCheck('claw 2 prongs', c => { const r2 = fakeRig(); r2.bodies.prongs.length = 2; R.claw(c, r2, 0, 0, {}); });
  drawCheck('claw phases', c => { for (const ph of ['idle', 'moving', 'dropping', 'closing', 'lifting', 'carrying', 'releasing', 'returning']) { const r2 = fakeRig(); r2.phase = ph; R.claw(c, r2, 0, 0, { magnet: 1 }); } });
  drawCheck('claw empty rig', c => { R.claw(c, {}, 0, 0, {}); c.fillRect(0, 0, 1, 1); });
  balanced('claw', c => R.claw(c, rig, 0, 0, { rubber: 1, magnet: 1 }));
  const W = { bodies: [rig.bodies.palm, ...rig.bodies.prongs, { x: 10, y: 10, a: 0, shape: { kind: 'circle', r: 5 }, type: 'static' }], contactsOf: () => [{ px: 1, py: 1, nx: 0, ny: -1 }] };
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

h.done();
