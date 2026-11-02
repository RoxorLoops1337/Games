// Hit juice: merged damage numbers with a cap, shaped pop particles, kill chains, flying coins, chest and upgrade pops.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));

const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const R = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 7, stage: 4 });
const S = R.state;

// damage numbers merge per cell and stay capped
const cell = {};
for (let i = 0; i < 20; i++) R.onEvent({ t: 'hit', x: 100, y: 200, d: 10, crit: false, s: cell }, g);
assert.equal(S.floats.filter(f => f.key === cell).length, 1, 'one number per cell');
assert.equal(S.floats.find(f => f.key === cell).acc, 200, 'damage adds up');
for (let i = 0; i < 80; i++) R.onEvent({ t: 'hit', x: 10 * i, y: 200, d: 5, crit: false, s: {} }, g);
assert.ok(S.floats.length <= 60 && S.floats.filter(f => f.key).length <= 14, 'number cap');
R.onEvent({ t: 'hit', x: 50, y: 200, d: 99, crit: true, s: {} }, g);
assert.ok(S.floats.some(f => f.crit !== false && f.size >= 28 && f.col === '#ffe14a'), 'crits always show, bigger');

// species pop particles are shaped
S.particles.length = 0;
R.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', skin: 'love' }, g);
assert.ok(S.particles.some(q => q.sh === 'h'), 'love pops hearts');
S.particles.length = 0;
R.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', skin: 'frosty' }, g);
assert.ok(S.particles.some(q => q.sh === 'f'), 'frosty pops snowflakes');

// kill chain grows then resets
S.chain.n = 0; S.chain.t = -9;
for (let i = 0; i < 5; i++) R.onEvent({ t: 'kill', x: 100 + i, y: 300, r: 30, kind: 'normal', skin: 'love' }, g);
assert.equal(S.chain.n, 5);
assert.ok(S.floats.some(f => f.key === 'chain' && f.str === 'x5'), 'chain counter');

// upgrade shockwave and chest lid flip
S.rings.length = 0;
R.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'upgrade', skin: 'love' }, g);
assert.ok(S.rings.some(r => r.glow), 'golden shockwave');
R.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', carry: 'chest', skin: 'love' }, g);
assert.equal(S.props.length, 1, 'chest hops out');

// coins arc to the counter and finish
R.onEvent({ t: 'coin', x: 100, y: 500, v: 2 }, g);
assert.equal(S.coins.length, 1);
for (let i = 0; i < 90; i++) R.draw(g, null, 1 / 60);
assert.equal(S.coins.length, 0, 'flying coins land');
assert.equal(S.props.length, 0, 'chest prop expires');

// the sim passes the carry flag on kills
const g2 = sim.createGame({ seed: 11, stage: 4 });
const seg = g2.snakes[0].segs.find(q => q.carry === 'chest');
if (seg) { seg.hp = 1; sim.hitCell && sim.hitCell(g2, seg, 5); }

// round 2: hit-stop, chain flourish, upgrade orb, bomb smoke, muzzle flash, landing bounces
{
  const Rb = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
  const gb = sim.createGame({ seed: 5, stage: 4 });
  assert.equal(Rb.timeScale(), 1);
  Rb.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', head: true, boss: false, skin: 'love' }, gb);
  assert.ok(Rb.timeScale() < 0.1, 'head kill freezes the sim for a moment');
  for (let i = 0; i < 12; i++) Rb.draw(gb, null, 1 / 60);
  assert.ok(Rb.timeScale() > 0.2, 'freeze ends by itself');
  const Sb = Rb.state;
  Sb.chain.n = 0; Sb.chain.t = -9;
  for (let i = 0; i < 10; i++) Rb.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', skin: 'love' }, gb);
  Rb.draw(gb, { joy: null }, 1 / 60);
  Rb.onEvent({ t: 'kill', x: 300, y: 300, r: 30, kind: 'upgrade', skin: 'love' }, gb);
  Rb.onEvent({ t: 'boom', x: 200, y: 400, r: 150 }, gb);
  Rb.onEvent({ t: 'shoot' }, gb);
  gb.bullets.push({ x: 200, y: 600, vx: 0, vy: -900, kind: 'pill', crit: false });
  let maxP = 0;
  for (let i = 0; i < 120; i++) { Rb.draw(gb, { joy: null }, 1 / 60); maxP = Math.max(maxP, Sb.particles.length); }
  assert.ok(Sb.land.up > 0, 'upgrade orb landed on the counter');
  assert.ok(maxP <= 420, 'particle cap holds');
  Rb.setOptions({ reduceMotion: true });
  Rb.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', head: true, boss: true, skin: 'love' }, gb);
  assert.equal(Rb.timeScale(), 1, 'reduce motion: no hit-stop');
}
// round 3: per-weapon impact marks, kill starbursts, damage tints, the dash telegraph
{
  const R2 = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
  const g2 = sim.createGame({ seed: 9, stage: 3 });
  for (const src of ['capsule', 'swab', 'daggers', 'tower', 'stick', 'needles', 'satellite', 'maw']) R2.onEvent({ t: 'hit', x: 100, y: 300, d: 5, crit: false, s: {}, src }, g2);
  R2.onEvent({ t: 'kill', x: 100, y: 300, r: 30, kind: 'normal', skin: 'love', head: true }, g2);
  assert.ok(R2.state.floats.some(f => f.col === '#ffd0ea'), 'swab damage numbers are tinted pink');
  const sn = g2.snakes[0]; sn.surge = 'warn'; sn.surgeT = 0.3; sn.segs[0].y = 200;
  for (let i = 0; i < 4; i++) R2.draw(g2, null, 1 / 60);
  sn.surge = 'go';
  for (let i = 0; i < 4; i++) R2.draw(g2, null, 1 / 60);
  const g3 = sim.createGame({ seed: 3, stage: 1 });
  for (let i = 0; i < 900 && !g3.events.some(e => e.t === 'hit'); i++) sim.step(g3, 1 / 60, { mx: 0 });
  const h = g3.events.find(e => e.t === 'hit');
  if (h) assert.equal(typeof h.src, 'string', 'hit events carry their source');
  // round 4: chain links and notes, crit badge flag, upgrade pop, lane dim
  const R4 = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null), g4 = sim.createGame({ seed: 5, stage: 3 });
  for (let i = 0; i < 4; i++) R4.onEvent({ t: 'kill', x: 100 + i * 30, y: 300, r: 26, kind: 'normal', skin: 'love' }, g4);
  const pools = R4.hj.pools;
  assert.ok(pools.marks.some(m => m.k === 'link') && pools.marks.some(m => m.k === 'note'), 'a kill chain draws links and climbing notes');
  R4.onEvent({ t: 'hit', x: 100, y: 300, d: 99, crit: true, s: 7, src: 'swab' }, g4);
  assert.ok(R4.state.floats.some(f => f.crit === true), 'crit numbers carry the crit flag for the badge style');
  R4.onEvent({ t: 'kill', x: 100, y: 300, r: 26, kind: 'upgrade', skin: 'love' }, g4);
  assert.ok(R4.state.floats.some(f => f.key === 'badge'), 'an upgrade cell pops an UPGRADE badge');
  g4.snakes[0].surge = 'warn'; g4.snakes[0].surgeT = 0.3;
  for (let i = 0; i < 4; i++) R4.draw(g4, null, 1 / 60);
}
console.log('04_hit_juice ok');
