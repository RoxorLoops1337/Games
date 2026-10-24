// Headless test for js/art_entities.js: every id, every level and option draws without throwing, ctx save/restore stays balanced,
// the transform and alpha come back as found, and the sprite cache path works with a fake document. No browser needed.
import assert from 'node:assert/strict';
import * as A from '../drop_the_bass/js/art_entities.js';
import { TURRETS, ENEMIES, BOSSES, AFFIXES, RARITY } from '../drop_the_bass/js/data_core.js';

function mockCtx(stats) {
  const state = { globalAlpha: 1, depth: 0, maxDepth: 0, calls: 0 };
  const grad = { addColorStop() {} };
  const fns = {
    save() { state.depth++; state.maxDepth = Math.max(state.maxDepth, state.depth); },
    restore() { state.depth--; assert.ok(state.depth >= 0, 'restore without save'); },
    createLinearGradient: () => grad, createRadialGradient: () => grad,
    measureText: () => ({ width: 10 }),
  };
  const target = {};
  const p = new Proxy(target, {
    get(_, k) {
      if (k in state && typeof state[k] !== 'function' && k !== 'depth') return state[k];
      if (k === '__state') return state;
      if (fns[k]) return fns[k];
      if (k in target) return target[k];
      return (...a) => { state.calls++; for (const v of a) if (typeof v === 'number') assert.ok(Number.isFinite(v), 'non finite arg to ' + String(k)); };
    },
    set(_, k, v) { if (k === 'globalAlpha') state.globalAlpha = v; else target[k] = v; return true; },
  });
  return p;
}
const check = (ctx, label) => { const s = ctx.__state; assert.equal(s.depth, 0, label + ': unbalanced save/restore'); assert.ok(s.calls > 0, label + ': drew nothing'); };

function suite(tag) {
  const ctx = mockCtx();
  let n = 0;
  for (const id of Object.keys(TURRETS)) for (let L = 1; L <= 7; L++) {
    for (const o of [{}, { t: 3.3, ang: 1.2, fire: 1, jammed: true, buff: 'rate', selected: true, alpha: 0.5, scale: 1.2, spawn: 0.4 }, { t: 1, buff: 'dmg', spawn: 1 }]) { A.drawTurret(ctx, id, L, 100, 100, o); n++; }
    A.drawTurretIconFlat(ctx, id, 50, 50, 40);
  }
  A.drawTurret(ctx, 'nope', 1, 0, 0, {}); A.drawTurret(ctx, 'kick', 99, 0, 0); A.drawTurret(ctx, 'kick', 0, 0, 0);
  for (const id of Object.keys(ENEMIES)) {
    A.drawEnemy(ctx, id, 100, 100, {});
    A.drawEnemy(ctx, id, 100, 100, { t: 2.2, ang: 2, hp: 0.3, hit: 1, slow: true, stun: true, burn: true, mark: true, shield: 0.5, rage: true, scale: 1.4, alpha: 0.7 });
    for (const a of Object.keys(AFFIXES)) A.drawEnemy(ctx, id, 100, 100, { t: 1.1, affix: a, scale: AFFIXES[a].scale || 1 });
    n += 2;
  }
  for (const id of Object.keys(BOSSES)) {
    A.drawBoss(ctx, id, 100, 100, {});
    for (const ph of [1, 2, 3]) A.drawBoss(ctx, id, 100, 100, { t: 1.7 * ph, ang: 1, hp: 0.5, hit: 0.8, gated: ph === 2, phase: ph, scale: 1.2, alpha: 0.8 });
    n += 4;
  }
  for (const k of ['kick', 'snare', 'hat', 'scratch', 'cowbell', 'orb', 'vocal', 'synth', 'weird']) A.drawProjectile(ctx, k, 10, 10, { t: 1, ang: 1, scale: 1.5 });
  for (const g of A.GLYPH_NAMES) { A.drawGlyph(ctx, g, 10, 10, 24); A.drawIcon(ctx, g, 10, 10, 24, '#fff'); }
  for (const slot of ['head', 'mic', 'body', 'chain', 'feet', 'other']) for (const r of Object.keys(RARITY)) { A.drawGear(ctx, slot, 'item_' + slot + r, r, 10, 10, 64); n++; }
  for (const tier of ['garage', 'studio', 'platinum', 'bogus']) for (const open of [0, 0.5, 1]) A.drawCrate(ctx, tier, 10, 10, 100, { t: 2, open, shake: open ? 0 : 1 });
  for (const r of Object.keys(RARITY)) { A.drawRarityFrame(ctx, r, 10, 10, 150, 100, 2.5); A.drawRarityFrame(ctx, r, 10, 10, 150, 100); }
  A.drawEnemy(ctx, 'nope', 1, 1); A.drawBoss(ctx, 'nope', 1, 1);
  assert.equal(ctx.__state.depth, 0, tag + ': unbalanced after the whole suite');
  assert.equal(ctx.globalAlpha, 1, tag + ': globalAlpha leaked');
  return n;
}

// glyph set size and the names the contract lists
const need = 'note notes wave bolt shield heart bag clock star fire snow target skull crown magnet gift hat shoe mic disc speaker plug battery dice clover rocket bomb arrow_up double eye hourglass ticket tape van cat drop flower bell horn guitar sparkle coin diamond record fans lock check cross plus minus play pause ff gear merge sell reroll'.split(' ');
for (const g of need) assert.ok(A.GLYPH_NAMES.includes(g), 'missing glyph ' + g);
assert.ok(A.GLYPH_NAMES.length >= 40);

// 1) direct draw path (no document in node)
assert.equal(A.makeCanvas(4, 4), null);
const n1 = suite('direct');

// 2) cached path with a fake document: sprites are built once, then blitted
let made = 0;
globalThis.document = { createElement() { made++; return { width: 0, height: 0, getContext: () => mockCtx() }; } };
A.setArtScale(2);
const n2 = suite('cached');
const madeFirst = made;
assert.ok(madeFirst > 20, 'sprites should be cached into canvases, made ' + madeFirst);
suite('cached again');
assert.equal(made, madeFirst, 'second pass must not create new canvases');
A.setArtScale(1); // clears the cache
suite('rescaled');
assert.ok(made > madeFirst, 'setArtScale must rebuild sprites');
delete globalThis.document;
console.log('drop_the_bass art_entities OK (' + n1 + ' + ' + n2 + ' draws, ' + A.GLYPH_NAMES.length + ' glyphs, ' + madeFirst + ' cached sprites)');
