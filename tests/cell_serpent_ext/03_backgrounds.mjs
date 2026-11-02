// Backgrounds: every species has a world and every world bakes and animates without throwing.
import assert from 'node:assert/strict';
import { WORLDS, bakeWorld, makeMotes, drawMotes, drawRing } from '../../cell_serpent/bg_world.js';
import { SKINS } from '../../cell_serpent/sim.js';

const proxy = () => new Proxy(function () {}, {
  get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => proxy() : proxy()),
  set: () => true, apply: () => proxy(),
});
const th = { base: '#ff7eb6', lite: '#ffc2dc' };
for (const s of SKINS) {
  assert.ok(WORLDS[s], 'world for ' + s);
  for (const boss of [false, true]) bakeWorld(proxy(), s, boss, false, th);
  const m = makeMotes(); drawMotes(proxy(), s, th, m, 1.5);
}
drawRing(proxy(), { cx: 360, cy: 900, R: 220 }, 2, true);
assert.equal(new Set(SKINS.map(s => WORLDS[s].mote)).size, SKINS.length, 'each species has its own mote');
console.log('03_backgrounds ok');
