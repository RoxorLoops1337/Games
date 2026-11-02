// Batch 7 backgrounds: mist banks, wind gusts, dash reader, stone floor cracks and the ring danger reader.
import assert from 'node:assert/strict';
import { makeBanks, drawMist, makeWind, stepWind, drawGust, dashState, ringDanger, mistFor } from '../../cell_serpent/bg_mist.js';
import { drawFloorFx, floorKind } from '../../cell_serpent/floor_fx.js';
import { createBgFx, drawMotes, makeMotes, WORLDS } from '../../cell_serpent/bg_world.js';

const proxy = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => proxy() : proxy()),
  set: () => true, apply: () => proxy(),
});
const kit = { bake: () => ({ c: {} }) };

// mist only on the sleepy and gloomy worlds
assert.ok(mistFor('sleepy') && mistFor('gloomy') && !mistFor('love'));
for (const skin of ['sleepy', 'gloomy', 'love']) for (const low of [false, true]) drawMist(proxy(), kit, skin, makeBanks(), 3, 120, true, low);

// a kill (kick falling back to 0) gives the wind a shove that then dies away; reduce motion keeps it still
const w = makeWind(); stepWind(w, 1, 5, false); stepWind(w, 1.05, 5.05, false);
assert.equal(w.wv, 0, 'calm before a kill');
stepWind(w, 1.1, 0, false);
assert.ok(Math.abs(w.wv) >= 100 && Math.abs(w.wv) <= 260, 'a kill blows a gust');
const x0 = w.wx; for (let t = 1.2; t < 5; t += 0.1) stepWind(w, t, t, false);
assert.ok(Math.abs(w.wx - x0) > 20 && Math.abs(w.wv) < 5, 'gust pushed things and faded');
const r = makeWind(); stepWind(r, 1, 5, true); stepWind(r, 1.1, 0, true); assert.equal(r.wv, 0);
w.wv = 200; drawGust(proxy(), w, 2, false); drawGust(proxy(), w, 2, true);

// dash reader: warn, go, and the head x of the snake that dashes
const sn = (surge, x) => ({ surge, segs: [{ x, y: 100, r: 20 }] });
assert.equal(dashState([sn('idle', 50)]).k, 0);
assert.equal(dashState([sn('warn', 50), sn('idle', 80)]).k, 1);
const d = dashState([sn('warn', 50), sn('go', 300)]); assert.equal(d.k, 2); assert.equal(d.x, 300);

// ring danger grows as a head nears the rim
const ring = { cx: 195, cy: 450, R: 100 };
assert.equal(ringDanger([{ segs: [{ x: 195, y: 0, r: 20 }] }], ring), 0);
assert.ok(ringDanger([{ segs: [{ x: 195, y: 340, r: 20 }] }], ring) > 0.8);

// stone floor for mighty, drawing with and without a dash
assert.equal(floorKind('mighty'), 'stone');
for (const flare of [0, 0.5, 1]) for (const low of [false, true]) drawFloorFx(proxy(), { kit, skin: 'mighty', stage: 8, boss: false, t: 2.3, pulse: 0.4, low, flare, goT: 2.0, goX: 150 });
drawFloorFx(proxy(), { kit, skin: 'mighty', stage: 8, boss: false, t: 2.3, pulse: 0.4, reduce: true, flare: 1 });

// whole bg frame with snakes, motes pushed by a gust
const bg = createBgFx();
for (let t = 0; t < 3; t += 0.1) bg.draw(proxy(), { kit, skin: 'mighty', stage: 8, boss: false, th: { base: '#fff', lite: '#fff' }, t, kick: t % 1, reduce: false, low: false, snakes: [sn(t > 1 ? 'go' : 'idle', 100)] });
assert.ok(bg.flare > 0.5 && bg.goX === 100, 'a dashing snake lights the cracks');
drawMotes(proxy(), 'frosty', { base: '#fff', lite: '#fff' }, makeMotes(), 2, 900);
assert.ok(WORLDS.sleepy && WORLDS.gloomy);
console.log('25_bg_mist_r7 ok');
