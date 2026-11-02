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
console.log('04_hit_juice ok');
