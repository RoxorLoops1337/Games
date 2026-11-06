// Perf round 6: per-frame garbage. Counts calls and objects instead of timing (the box is loaded).
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createArtDraw, mix, shade } = await import(join(root, 'art_draw.js'));
const ALL = { needles: 3, stick: 3, bubble: 3, satellite: 3, maw: 3, swab: 3, daggers: 3, tower: 3, dragon: 3 };
const mk = (stage, seed = 5) => { const g = sim.createGame({ seed, stage, bot: true, skills: ALL }); for (const w of sim.WEAPONS) g.weap[w.id] = { lv: 3, cd: 0 }; g.revivesLeft = 1e9; return g; };
const tick = g => { g.events.length = 0; sim.step(g, 1 / 60, sim.botInput(g)); if (g.phase === 'levelup') sim.choose(g, 0); };

// 1. the step loop never calls Math.hypot (it allocates a number per call) and the cell glide matches pointAt exactly
{
  const real = Math.hypot; let calls = 0;
  for (const stage of [12, 50]) { const g = mk(stage); Math.hypot = (...a) => { calls++; return real(...a); }; try { for (let i = 0; i < 900; i++) tick(g); } finally { Math.hypot = real; } }
  assert.equal(calls, 0, 'Math.hypot called ' + calls + ' times while stepping');
  const g = mk(12), path = g.path, o = { x: 0, y: 0 };
  for (const s of [-30, 0, 15, 200, 777, path.len - 3, path.len + 40, 1e5]) {
    const a = sim.pointAt(path, s), b = sim.pointInto(path, s, o);
    assert.equal(b, o, 'pointInto returns its scratch point');
    assert.ok(Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9, 'pointInto matches pointAt at ' + s);
  }
}

// 2. bullets are recycled: a long run makes far fewer bullet objects than it fires, and the hit list is empty on reuse
{
  const g = mk(12), gone = new Set(); let live = new Set(), reused = 0, poolSeen = 0;
  for (let i = 0; i < 1500; i++) {
    tick(g); const now = new Set(g.bullets); poolSeen = Math.max(poolSeen, g.bpool ? g.bpool.length : 0);
    for (const b of live) if (!now.has(b)) gone.add(b);
    for (const b of now) if (!live.has(b) && gone.has(b)) { reused++; gone.delete(b); assert.equal(b.hit.length, 0, 'a recycled bullet starts with no hits'); }
    live = now;
  }
  assert.ok(reused > 20, reused + ' bullets were recycled');
  assert.ok(g.bpool && poolSeen > 0 && g.bpool.length <= 96, 'pool is bounded (b12d: the pool can be empty at the final frame, so use the peak): ' + poolSeen);
  for (const b of g.bpool) assert.ok(Array.isArray(b.hit), 'pooled bullets keep their hit list');
  // a fresh bullet taken from the pool carries no old hits, kind or damage
  for (const b of g.bullets) for (const h of b.hit) assert.ok(typeof h === 'object', 'hits are cells');
  // determinism with the pool: two identical runs agree on every cell and bullet
  const sig = () => { const q = mk(20, 7); for (let i = 0; i < 1200; i++) tick(q); return JSON.stringify([q.kills, q.coins, q.score, q.shots, q.bullets.map(b => [b.x, b.y, b.hit.length]), q.snakes.map(s => s.segs.map(c => [c.x, c.y, c.hp]))]); };
  assert.equal(sig(), sig(), 'pooled bullets stay deterministic');
}

// 3. sprite lookups by value: a steady frame returns the same sprite and bakes nothing; clearing the cache rebuilds
{
  let made = 0; const noop = () => {};
  const ctx = new Proxy({}, { get: (_t, k) => (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : k === 'measureText' ? () => ({ width: 10 }) : noop, set: () => true });
  const kit = createArtDraw((w, h) => { made++; return { width: w, height: h, getContext: () => ctx }; }, 2);
  const a = [kit.SPR.body('love', false, ''), kit.SPR.body('love', true, ''), kit.SPR.body('love', false, 'armor'), kit.SPR.minion('green'), kit.SPR.pickup('gem'), kit.SPR.note(true), kit.SPR.note(false), kit.SPR.pet('kitten', 0), kit.SPR.pet('kitten', 2), kit.SPR.weapon('swab'), kit.SPR.weapon('swab', 4)];
  assert.equal(new Set(a).size, a.length, 'every variant is its own sprite');
  const m0 = made;
  const b = [kit.SPR.body('love', false, ''), kit.SPR.body('love', true, ''), kit.SPR.body('love', false, 'armor'), kit.SPR.minion('green'), kit.SPR.pickup('gem'), kit.SPR.note(true), kit.SPR.note(false), kit.SPR.pet('kitten', 0), kit.SPR.pet('kitten', 2), kit.SPR.weapon('swab'), kit.SPR.weapon('swab', 4)];
  a.forEach((s, i) => assert.equal(s, b[i], 'steady lookup ' + i + ' returns the same sprite'));
  assert.equal(made, m0, 'no canvases in a steady frame');
  assert.equal(kit.SPR.body(undefined, false), kit.SPR.body(undefined, false), 'unknown skin is stable too');
  const gen = kit.gen; kit.cache.clear();
  assert.equal(kit.gen, gen + 1, 'clearing bumps the generation');
  const c = kit.SPR.body('love', false, '');
  assert.ok(c && c !== a[0], 'after a clear (colour-blind palette) the body is baked again');
  assert.equal(kit.SPR.body('love', false, ''), c);
}

// 4. mix is memoised and still returns the same colours
{
  const ref = (a, b, t) => { const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; const x = p(a), y = p(b); return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
  for (const [a, b, t] of [['#ff7eb6', '#ffffff', 0.35], ['#ff7eb6', '#4a1a30', 0.28], ['#000000', '#ffffff', 0.5], ['#12ab34', '#fedcba', 0.01]]) { assert.equal(mix(a, b, t), ref(a, b, t)); assert.equal(mix(a, b, t), ref(a, b, t)); }
  assert.equal(shade('#ff7eb6'), ref('#ff7eb6', '#4a1a30', 0.28));
  for (let i = 0; i < 2000; i++) mix('#' + (0x100000 + i * 7).toString(16), '#ffffff', 0.3);   // unbounded callers cannot grow the memo without limit
  assert.equal(mix('#102030', '#ffffff', 0.5), ref('#102030', '#ffffff', 0.5));
}
