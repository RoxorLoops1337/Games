// Hit juice round 7: finishing-blow badge, kill-chain pitch ladder, chest and bomb juice, crit tiers, pooled marks.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import assert from 'node:assert/strict';
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'cell_serpent');
const sim = await import(join(root, 'sim.js'));
const { createRenderer } = await import(join(root, 'render.js'));
const stubCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : k.startsWith('create') ? () => ({ addColorStop() {} }) : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
const R = createRenderer({ width: 420, height: 860, getContext: stubCtx }, null, null);
const g = sim.createGame({ seed: 7, stage: 4 });
const S = R.state, P = R.hj.pools;
const kinds = () => P.marks.map(m => m.k);

// a head kill right after a dagger hit pops a dagger-coloured FINISH badge; a plain kill does not
R.onEvent({ t: 'hit', x: 300, y: 400, d: 5, crit: false, src: 'daggers', s: {} }, g);
R.onEvent({ t: 'kill', x: 300, y: 400, r: 30, kind: 'normal', skin: 'love', head: true }, g);
const fin = P.marks.find(m => m.k === 'finish');
assert.ok(fin && fin.wk === 'daggers', 'finish badge for the weapon that landed the blow');
R.onEvent({ t: 'kill', x: 100, y: 400, r: 30, kind: 'normal', skin: 'love' }, g);
assert.equal(kinds().filter(k => k === 'finish').length, 1, 'no badge for a body cell');
for (let i = 0; i < 90; i++) R.draw(g, null, 1 / 60);
assert.ok(!kinds().includes('finish'), 'the badge ends');

// the chest and the bomb leave their own marks
R.onEvent({ t: 'chest', x: 300, y: 500, frag: 'swab' }, g);
assert.ok(kinds().includes('beam') && kinds().includes('chunk'), 'chest beam and coins');
R.onEvent({ t: 'boom', x: 200, y: 500, r: 150 }, g);
assert.ok(kinds().includes('scorch') && kinds().includes('boomtxt'), 'bomb scorch and tag');
for (let i = 0; i < 120; i++) R.draw(g, null, 1 / 60);
assert.equal(P.marks.length, 0, 'all marks end');

// crit tiers climb with crits in a row and reset after a pause
S.t = 100;
const tiers = [];
for (let i = 0; i < 5; i++) { R.onEvent({ t: 'hit', x: 200, y: 300, d: 9, crit: true, src: 'capsule', s: { i } }, g); tiers.push(R.hj.critTier()); S.t += 0.2; }
assert.deepEqual(tiers, [0, 1, 2, 2, 3]);
assert.ok(S.floats.some(f => f.crit && f.tier === 3), 'the float carries its tier');
S.t += 3; R.onEvent({ t: 'hit', x: 200, y: 300, d: 9, crit: true, src: 'capsule', s: {} }, g);
assert.equal(R.hj.critTier(), 0);

// pooled marks are recycled: caps hold in a busy fight and pooled objects keep one shape
for (let n = 0; n < 40; n++) { R.onEvent({ t: 'hit', x: 100 + n, y: 300, d: 3, crit: false, src: 'swab', s: {} }, g); for (let i = 0; i < 6; i++) R.draw(g, null, 1 / 60); }
assert.ok(P.marks.length <= 44 && P.trail.length <= 56, 'caps hold');
const sizes = new Set(P.marks.filter(m => m.pool).map(m => Object.keys(m).length));
assert.ok(sizes.size <= 1, 'one shape');

// the ladder draws without errors for a long chain
S.t += 5; for (let i = 0; i < 20; i++) { R.onEvent({ t: 'kill', x: 100 + i * 5, y: 300, r: 26, kind: 'normal', skin: 'love' }, g); S.t += 0.1; R.draw(g, null, 0.1); }
