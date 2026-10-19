// Headless exercise of render/fx.js and render/text.js: every battle event type, every element, quality tier and edge case.
import assert from 'node:assert/strict';
import { makeCtx } from './midnight_mog_mockctx.mjs';
import { createFx, consume, update, draw, drawOverlay, emit, burstAt, setLayout, hitFlashOf, popOf, castOf, setQuality, setReducedMotion, clearFx, fxStats } from '../midnight_mog/js/render/fx.js';
import { drawText, wrapText, fitText, drawWrapped, textWidth, formatNum, formatTime, formatPct } from '../midnight_mog/js/render/text.js';
import { createBattle, step, drainEvents, playCard } from '../midnight_mog/js/sim/battle.js';
import { newProfile } from '../midnight_mog/js/sim/profile.js';

const t0 = Date.now();

// ---- text: number formatting
const cases = [[0, '0'], [7, '7'], [999, '999'], [1000, '1K'], [1234, '1.2K'], [12345, '12.3K'], [123456, '123K'], [999999, '1M'], [3.4e6, '3.4M'],
  [5.6e9, '5.6B'], [7.8e12, '7.8T'], [1e15, '1e15'], [1.234e18, '1.23e18'], [-1500, '-1.5K'], [NaN, '0'], [Infinity, '∞'], [1e308, '1e308']];
for (const [n, s] of cases) assert.equal(formatNum(n), s, 'formatNum ' + n);
assert.equal(formatNum(2.5, { decimals: 1 }), '2.5');
assert.equal(formatNum(undefined), '0');
assert.equal(formatNum('12000'), '12K');
assert.equal(formatNum(10n ** 20n), '1e20');
for (let e = 0; e < 320; e += 7) { const s = formatNum(Math.pow(10, e) * 1.37); assert.ok(!/NaN|undefined/.test(s), s); }
assert.equal(formatTime(45), '45s'); assert.equal(formatTime(725), '12m 05s'); assert.equal(formatTime(11220), '3h 07m'); assert.equal(formatTime(-5), '0s');
assert.equal(formatPct(0.125, 1), '12.5%');

// ---- text: drawing
{
  const ctx = makeCtx();
  for (const kind of ['body', 'display', 'mono']) for (const align of ['left', 'center', 'right']) {
    drawText(ctx, 'Hello neon', 100, 100, { size: 20, kind, align });
    drawText(ctx, 'Glow gradient', 100, 100, { size: 30, kind, align, glow: 12, gradient: ['#f4ecff', '#19e6ff'], maxWidth: 80, shadow: true, rotate: 0.2, scale: 1.2, alpha: 0.5, stroke: 4 });
  }
  drawText(ctx, '', 0, 0); drawText(ctx, undefined, 0, 0); drawText(ctx, 12345, NaN, NaN, { size: NaN });
  assert.equal(drawText(ctx, '', 1, 1), 0);
  const lines = wrapText(ctx, 'The quick brown fox jumps over the lazy dog\nsecond para', 100, { size: 14 });
  assert.ok(lines.length >= 3);
  assert.deepEqual(wrapText(ctx, 'Supercalifragilisticexpialidocious', 40, { size: 14 }).every((l) => l.length > 0), true);
  assert.deepEqual(wrapText(ctx, '', 50), ['']);
  const f = fitText(ctx, 'A very long title that cannot possibly fit', 60, { size: 30, min: 12, kind: 'display' });
  assert.ok(f.size >= 12 && f.size <= 30 && f.text.length > 0);
  assert.equal(fitText(ctx, 'ok', 500, { size: 20 }).size, 20);
  const dw = drawWrapped(ctx, 'one two three four five six seven eight nine ten', 10, 10, 90, 16, { size: 13, maxLines: 2 });
  assert.equal(dw.lines, 2);
  assert.ok(textWidth(ctx, 'abc', { size: 10 }) > 0);
  ctx.assertClean();
}

// ---- fx: layout mock matching the shared render/world.js API
function mockLayout(w, h) {
  const fw = w, fh = h * 0.5, fy = h * 0.14;
  const tw = fw / 10, th = fh / 5;
  return {
    w, h, scale: 1, field: { x: 0, y: fy, w: fw, h: fh },
    tile: (c, l) => ({ x: c * tw, y: fy + l * th, w: tw, h: th, cx: c * tw + tw / 2, cy: fy + l * th + th / 2 }),
    colX: (c) => c * tw + tw / 2, laneY: (l) => fy + l * th + th / 2,
    baseRect: { x: 0, y: fy, w: tw, h: fh }, handRect: { x: 0, y: h * 0.72, w, h: h * 0.28 }, topBar: { x: 0, y: 0, w, h: h * 0.08 }, safe: { top: 0, bottom: 0 },
  };
}

const types = ['hit', 'crit', 'death', 'spawn', 'cast', 'heal', 'status', 'shield', 'base_hit', 'chain', 'pierce', 'aoe', 'knockback', 'pull', 'execute',
  'trap_set', 'trap_trigger', 'barricade', 'aura', 'energy', 'draw', 'revive', 'wave', 'rule', 'reward', 'cleanse', 'taunt', 'reflect', 'attack', 'merge',
  'burrow', 'emerge', 'summon_call', 'loot', 'win', 'lose'];
const ELEMS = ['phys', 'fire', 'elec', 'poison', 'holy', 'shadow', 'void', 'bleed', 'nonsense'];

function allEvents() {
  const E = [];
  for (const el of ELEMS) {
    E.push({ type: 'hit', src: 1, tgt: 2, x: 4, y: 2, amount: 37, absorbed: 5, crit: false, element: el, kind: 'hit' });
    E.push({ type: 'hit', src: 1, tgt: 2, x: 4, y: 2, amount: 3700, absorbed: 0, crit: true, element: el, kind: 'hit' });
    E.push({ type: 'hit', src: 0, tgt: 3, x: 1, y: 1, amount: 8, absorbed: 0, crit: false, element: el, kind: 'dot', dot: true });
    E.push({ type: 'crit', src: 1, tgt: 2, x: 4, y: 2, amount: 10, element: el });
    E.push({ type: 'aoe', x: 5, y: 2, radius: 1.5, element: el });
    E.push({ type: 'chain', path: [{ x: 3, y: 1 }, { x: 4, y: 2 }, { x: 5, y: 3 }, { x: 6, y: 2 }], element: el });
    E.push({ type: 'pierce', x1: 2, y1: 2, x2: 8, y2: 2, element: el });
    E.push({ type: 'status', tgt: 2, x: 4, y: 2, status: 'dot', element: el, dps: 3 });
  }
  E.push({ type: 'chain', path: [] }, { type: 'chain', path: [{ x: 1, y: 1 }] }, { type: 'chain', path: new Array(30).fill(0).map((_, i) => ({ x: i * 0.3, y: i % 5 })), element: 'elec' });
  for (const id of ['enemy_x', 'pigeon_scout', 'king_coo']) for (const side of ['cat', 'enemy']) for (const boss of [false, true]) for (const expired of [false, true]) {
    E.push({ type: 'death', uid: 5, id, side, kind: side === 'cat' ? 'cat' : 'enemy', x: 6, y: 3, boss, expired });
  }
  E.push({ type: 'death', uid: 6, id: 'minion', side: 'enemy', kind: 'minion', x: 6, y: 3, boss: false });
  E.push({ type: 'death', uid: 7, id: 'bar', side: 'cat', kind: 'barricade', x: 3, y: 3, boss: false, expired: true });
  E.push({ type: 'spawn', uid: 1, id: 'scrap_tabby', x: 2, y: 2, side: 'cat' }, { type: 'spawn', uid: 2, id: 'pigeon_scout', x: 9.5, y: 2, side: 'enemy', boss: false, elite: false },
    { type: 'spawn', uid: 3, id: 'pigeon_scout', x: 9.5, y: 2, side: 'enemy', elite: true }, { type: 'spawn', uid: 4, id: 'king_coo', x: 9.5, y: 2, side: 'enemy', boss: true },
    { type: 'spawn', uid: 8, id: 'x', x: 9, y: 1, side: 'enemy', split: true }, { type: 'spawn', uid: 9, id: 'x', x: 9, y: 1, side: 'enemy', minion: true });
  E.push({ type: 'cast', src: 1, id: 'roar', name: 'Big Roar', x: 2, y: 2 }, { type: 'cast', src: 1, id: 'roar', name: 'Big Roar', echo: true, x: 2, y: 2 }, { type: 'cast', src: 99, id: 'zz', name: 'Unknown', x: 3, y: 3 });
  for (const ct of ['spell', 'summon', 'trap', 'build', undefined]) E.push({ type: 'cast', card: 'pounce', name: 'Pounce', cardType: ct, x: 3, y: 2 }, { type: 'cast', card: 'pounce', name: 'Pounce', cardType: ct, echo: true });
  E.push({ type: 'heal', src: 1, tgt: 2, x: 3, y: 2, amount: 12, base: false }, { type: 'heal', src: 1, tgt: 0, x: 0, y: 2, amount: 50, base: true }, { type: 'heal', tgt: 2, x: 3, y: 2, amount: 0, base: false });
  for (const s of ['stun', 'dot', 'buff', 'debuff', 'reflect', 'slow', 'weird']) E.push({ type: 'status', tgt: 2, x: 4, y: 2, status: s, stat: 'dmg', pct: 0.2, dur: 3 });
  E.push({ type: 'shield', tgt: 2, x: 3, y: 2, amount: 30 }, { type: 'base_hit', src: 4, amount: 25, hp: 100, x: 0, y: 2 }, { type: 'base_hit', amount: 0, hp: 100, x: 0, y: 2 });
  E.push({ type: 'knockback', tgt: 2, x0: 5, x1: 7, y: 2 }, { type: 'pull', tgt: 2, x0: 8, y0: 1, x1: 5, y1: 2 });
  E.push({ type: 'execute', tgt: 2, x: 4, y: 2, killed: true }, { type: 'execute', tgt: 2, x: 4, y: 2, killed: false }, { type: 'execute', tgt: 2, x: 4, y: 2, killed: false, fizzle: true });
  E.push({ type: 'trap_set', uid: 11, x: 4, y: 2, radius: 1.2, charges: 1 }, { type: 'trap_trigger', uid: 11, tgt: 2, x: 4, y: 2 }, { type: 'barricade', uid: 12, x: 3, y: 3, hp: 90 },
    { type: 'aura', uid: 13, x: 3, y: 2, radius: 2 }, { type: 'energy', amount: 2, energy: 5 }, { type: 'energy', amount: -1, energy: 4 }, { type: 'draw', count: 2 }, { type: 'draw', count: 0 },
    { type: 'revive', tgt: 2, x: 3, y: 2 }, { type: 'revive', base: true, hp: 50 });
  E.push({ type: 'wave', wave: 2, waves: 6, name: 'Wave 2', isBossWave: false }, { type: 'wave', wave: 6, waves: 6, name: 'Boss wave', isBossWave: true },
    { type: 'wave', name: 'Royal Roost', boss: 4, phase: 1, x: 9, y: 2 }, { type: 'wave', name: 'x', boss: 4, phase: 0, x: 9, y: 2 });
  E.push({ type: 'rule', rule: 'extra_draw', value: 1 }, { type: 'reward', resource: 'fish', pct: 0.2 }, { type: 'reward', resource: 'yarn', flat: 50 }, { type: 'reward', resource: 'zz' });
  E.push({ type: 'cleanse', tgt: 2, x: 3, y: 2, removed: 2 }, { type: 'taunt', src: 1, x: 3, y: 2, radius: 2, dur: 4 });
  E.push({ type: 'reflect', src: 1, tgt: 2, amount: 12 }, { type: 'reflect', src: 1234, tgt: 5678, amount: 12 });
  E.push({ type: 'attack', src: 1, tgt: 2, ranged: true, x: 2, y: 2, tx: 6, ty: 2 }, { type: 'attack', src: 1, tgt: 2, ranged: false, x: 4, y: 2, tx: 5, ty: 2 },
    { type: 'attack', src: 2, tgt: 0, ranged: false, x: 1, y: 2, tx: 0, ty: 2 }, { type: 'attack', src: 2, tgt: 0, ranged: true, x: 4, y: 2, tx: 0, ty: 2 });
  for (const merged of [1, 2, 3]) E.push({ type: 'merge', uid: 1, gone: true, id: 'scrap_tabby', x: 3, y: 2, fx: 2, fy: 2 }, { type: 'merge', uid: 1, id: 'scrap_tabby', stars: merged, merged, x: 2, y: 2, fx: 3, fy: 2 });
  E.push({ type: 'merge', uid: 2, id: 'not_a_cat', stars: 1, merged: 1, x: 2, y: 2, fx: 3, fy: 2 });
  E.push({ type: 'burrow', uid: 2, x: 4, y: 2 }, { type: 'emerge', uid: 2, x: 4, y: 2 }, { type: 'summon_call', uid: 4, id: 'pigeon_scout', count: 4 }, { type: 'summon_call', uid: 777, id: 'x', count: 2 });
  for (const kind of ['fish', 'yarn', 'gems', 'tokens', 'key', 'card', 'cat']) E.push({ type: 'loot', kind, id: 'alley_crate', amount: 120 });
  E.push({ type: 'loot', kind: 'cat', id: 'x', amount: 1, rarity: 'legend' }, { type: 'loot', kind: 'fish', amount: 1e12 }, { type: 'loot', kind: 'fish', amount: 0 });
  E.push({ type: 'win', wave: 6, seconds: 120 }, { type: 'lose', wave: 3, seconds: 90, reason: 'base' });
  E.push({ type: 'mystery' }, null, {});
  return E;
}

// every type is covered
{
  const seen = new Set(allEvents().map((e) => e && e.type));
  for (const t of types) assert.ok(seen.has(t), 'event type not exercised: ' + t);
}

const SIZES = [[390, 800], [1280, 800]];
function installOffscreen() {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this._c = makeCtx(w, h); } getContext() { return this._c; } };
}

function runFx(label) {
  for (const [w, h] of SIZES) for (const q of [0, 1, 2]) {
    const fx = createFx(7);
    setQuality(fx, q, false);
    const ctx = makeCtx(w, h);
    const layout = mockLayout(w, h);
    const bat = { units: [{ uid: 1, id: 'scrap_tabby', side: 'cat', x: 2, y: 2, maxHp: 100, hp: 100 }], enemies: [{ uid: 2, id: 'pigeon_scout', side: 'enemy', x: 5, y: 2, maxHp: 50, hp: 50 }, { uid: 4, id: 'king_coo', side: 'enemy', x: 9, y: 2, maxHp: 900, hp: 900 }] };
    const evs = allEvents();
    // fire the whole set, then also in small batches over time
    consume(fx, evs, layout, bat);
    for (let f = 0; f < 120; f++) {
      update(fx, 1 / 60);
      draw(ctx, fx, f / 60);
      if (f === 30) consume(fx, evs.slice(0, 60), layout, bat);
    }
    assert.ok(fx.shake.x === fx.shake.x && Number.isFinite(fx.shake.y));
    assert.ok(fx.n <= 2400, 'pool overflow');
    ctx.assertClean();
    const s = fxStats(fx);
    assert.equal(s.errors, 0, label + ' handler errors');
    // run to completion: everything must die out
    for (let f = 0; f < 60 * 12; f++) update(fx, 1 / 30);
    drawOverlay(ctx, fx); draw(ctx, fx, 1);
    assert.equal(fx.n, 0, 'particles leaked ' + fx.n);
    assert.equal(fxStats(fx).floaters, 0);
    assert.equal(fx.hitstop, 0);
    assert.equal(fx.timeScale, 1);
    ctx.assertClean();
  }
}
runFx('no offscreen');
installOffscreen();
runFx('offscreen');

// ---- per-unit pulses, stopped state, edge cases
{
  const fx = createFx(1);
  const layout = mockLayout(390, 800);
  consume(fx, [{ type: 'hit', src: 1, tgt: 2, x: 4, y: 2, amount: 10, crit: false, element: 'phys', kind: 'hit' }, { type: 'spawn', uid: 9, id: 'x', x: 3, y: 2, side: 'cat' }, { type: 'cast', src: 9, id: 'a', name: 'A', x: 3, y: 2 }], layout, null);
  assert.ok(hitFlashOf(fx, 2) > 0.9);
  assert.ok(popOf(fx, 9) > 0.9);
  assert.ok(castOf(fx, 9) > 0.9);
  update(fx, 0.1); update(fx, 0.1);
  assert.equal(hitFlashOf(fx, 2), 0);
  assert.equal(hitFlashOf(fx, 12345), 0);
  // consume without layout, with empty events, with garbage dt
  const fx2 = createFx(2);
  consume(fx2, [{ type: 'base_hit', amount: 5 }, { type: 'wave', name: 'W', wave: 1, waves: 3 }, { type: 'loot', kind: 'fish', amount: 5 }, { type: 'draw', count: 1 }, { type: 'energy', amount: 1 }], null, null);
  consume(fx2, [], null, null); consume(fx2, null, null, null);
  update(fx2, NaN); update(fx2, -1); update(fx2, 99);
  const ctx = makeCtx();
  draw(ctx, fx2, NaN); drawOverlay(ctx, fx2);
  ctx.assertClean();
  // manual emit and UI burst
  emit(fx2, 'aoe', 3, 2, { radius: 2, element: 'fire' });
  burstAt(fx2, 100, 100, '#19e6ff', 30, { shape: 'star', flash: true }); burstAt(fx2, 100, 100, '#ff2e88', 10);
  setLayout(fx2, mockLayout(500, 500));
  update(fx2, 0.05); draw(ctx, fx2, 0.1);
  // reduced motion kills shake / chroma / slowmo, keeps hit feedback
  setReducedMotion(fx2, true);
  consume(fx2, [{ type: 'base_hit', amount: 25, x: 0, y: 2 }, { type: 'win' }, { type: 'death', uid: 4, id: 'king_coo', side: 'enemy', kind: 'enemy', x: 4, y: 2, boss: true }], mockLayout(390, 800), null);
  update(fx2, 0.016);
  assert.equal(fx2.shake.x, 0); assert.equal(fx2.chroma, 0); assert.equal(fx2.timeScale, 1);
  clearFx(fx2); assert.equal(fx2.n, 0);
  // pool cap: flood it
  const fx3 = createFx(3); setQuality(fx3, 2);
  const flood = []; for (let i = 0; i < 400; i++) flood.push({ type: 'merge', uid: 1, id: 'scrap_tabby', stars: 3, merged: 3, x: 3, y: 2, fx: 2, fy: 2 }, { type: 'death', uid: 5, id: 'king_coo', side: 'enemy', kind: 'enemy', x: 6, y: 3, boss: true });
  consume(fx3, flood, mockLayout(390, 800), null);
  for (let f = 0; f < 60; f++) { update(fx3, 1 / 60); assert.ok(fx3.n <= 2300); }
  draw(ctx, fx3, 1);
  ctx.assertClean();
  // determinism: same seed and stream give identical pool state
  const a = createFx(5), b = createFx(5);
  const L = mockLayout(390, 800);
  consume(a, allEvents(), L, null); consume(b, allEvents(), L, null);
  for (let i = 0; i < 30; i++) { update(a, 1 / 60); update(b, 1 / 60); }
  assert.equal(a.n, b.n);
  assert.deepEqual(Array.from(a.P.subarray(0, a.n * 18)), Array.from(b.P.subarray(0, b.n * 18)));
}

// ---- adaptive quality: slow frames lower it, fast frames raise it again
{
  const fx = createFx(1);
  assert.equal(fx.quality, 2);
  for (let i = 0; i < 120; i++) update(fx, 0.05);
  assert.equal(fx.quality, 0);
  for (let i = 0; i < 60 * 30; i++) update(fx, 1 / 100);
  assert.equal(fx.quality, 2);
  setQuality(fx, 1, false);
  for (let i = 0; i < 120; i++) update(fx, 0.05);
  assert.equal(fx.quality, 1, 'manual quality is respected');
}

// ---- real battle stream: play a seeded battle and feed every event
{
  const profile = newProfile(11);
  const b = createBattle({ seed: 11, district: 1, stage: 1, profile });
  const fx = createFx(1);
  const ctx = makeCtx(390, 800);
  const L = mockLayout(390, 800);
  const seen = new Set();
  for (let i = 0; i < 30 * 70 && !b.over; i++) {
    if (i % 45 === 0) for (let h = 0; h < b.hand.length; h++) { if (playCard(b, h, { x: 1 + ((i / 45) % 8 | 0), y: (i / 45 | 0) % 5 }).ok) break; }
    step(b, 1 / 30);
    const evs = drainEvents(b);
    for (const e of evs) seen.add(e.type);
    consume(fx, evs, L, b);
    update(fx, 1 / 30);
    draw(ctx, fx, i / 30);
  }
  ctx.assertClean();
  assert.equal(fxStats(fx).errors, 0);
  assert.ok(seen.size >= 6, 'battle produced events: ' + [...seen].join(','));
}

const dt = Date.now() - t0;
console.log('midnight_mog_fx ok (' + dt + 'ms)');
assert.ok(dt < 10000, 'too slow: ' + dt);
