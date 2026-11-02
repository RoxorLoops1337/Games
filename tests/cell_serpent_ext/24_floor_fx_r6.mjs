// Floor effects: tile floors, puddles, ice glints, rain and the boss crack draw without throwing, honour reduce motion, and track the beat.
import assert from 'node:assert/strict';
import { drawFloorFx, drawRain, drawBossCracks, beatIndex, floorKind } from '../../cell_serpent/floor_fx.js';
import { beatPulse } from '../../cell_serpent/bg_world.js';
import { SKINS } from '../../cell_serpent/sim.js';

const proxy = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => proxy() : proxy()),
  set: () => true, apply: () => proxy(),
});
let calls = 0;
const kit = { bake: () => ({ c: {} }) };
const counting = () => new Proxy(function () {}, { get: (t, k) => (k === 'globalAlpha' ? 1 : (...a) => { calls++; return undefined; }), set: () => true });
for (const skin of SKINS.concat('piggy')) for (const [reduce, low] of [[false, false], [false, true], [true, false]])
  for (let t = 0; t < 6; t += 0.31) { drawFloorFx(proxy(), { kit, skin, stage: 6, boss: false, t, pulse: beatPulse(t, 6, false), reduce, low }); drawRain(proxy(), t, { skin, reduce, low }); }
for (const ph of [0, 0.02, 0.5, 1]) drawBossCracks(proxy(), kit, 3, ph, 0.5);
drawBossCracks(proxy(), null, 3, 1, 0.5);
assert.equal(floorKind('disco'), 'tiles'); assert.equal(floorKind('love'), 'hearts'); assert.equal(floorKind('grumpy'), 'puddles'); assert.equal(floorKind('frosty'), 'ice'); assert.equal(floorKind('sleepy'), '');
calls = 0; drawFloorFx(counting(), { kit, skin: 'disco', stage: 1, boss: false, t: 1, pulse: 0.5, reduce: true }); assert.equal(calls, 0, 'reduce motion draws nothing');
calls = 0; drawFloorFx(counting(), { kit, skin: 'sleepy', stage: 1, boss: false, t: 1, pulse: 0.5 }); assert.equal(calls, 0, 'plain floors draw nothing');
assert.equal(beatIndex(0, 1, false), 0); assert.ok(beatIndex(10, 1, false) >= 17 && beatIndex(10, 1, false) <= 18, '104 bpm');
assert.ok(beatPulse(0.001, 1, false) > 0.9 && beatIndex(0.001, 1, false) === 0);
console.log('24_floor_fx_r6 ok');
