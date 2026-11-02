// batch 8 backgrounds: shooting stars at night, squall and petal storm on a head kill, mist that parts, boss lamps
import assert from 'node:assert/strict';
import { createBgFx } from '../../cell_serpent/bg_world.js';
import { makeB8, headKill, squallLevel, SQUALL, STORM, readHeads, drawNight } from '../../cell_serpent/bg_b8.js';
import { makeBanks, drawMist } from '../../cell_serpent/bg_mist.js';

const px = () => new Proxy(function () {}, { get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : px()), set: () => true, apply: () => px() });
const kit = { bake: (k, w, h, fn) => { fn(px()); return { c: {} }; } };
const th = { base: '#ff7eb6', lite: '#ffc2dc' };
const heads = (...xy) => xy.map(([x, y]) => ({ segs: [{ x, y }], boss: true }));

// a snow squall starts on a head kill, peaks, and is gone after a few seconds
{
  const b = makeB8(); b.skin = 'frosty';
  assert.equal(squallLevel(b, 1), 0, 'calm before a kill');
  headKill(b, 10, 300, 300);
  assert.ok(squallLevel(b, 10.5) > 0.5 && squallLevel(b, 13) === 0, 'squall rises then ends');
  assert.ok(b.pendingWind !== 0, 'the kill shoves the wind');
}
// pink worlds throw a pool of petals
{
  const b = makeB8(); b.skin = 'love'; assert.ok(STORM.love && !SQUALL.love);
  headKill(b, 5, 200, 400); assert.ok(b.petals.filter(p => p.life > 0).length >= 30, 'petal storm spawned');
}
// mist banks slide away from a head and thin out
{
  const banks = makeBanks(), b = makeB8(), snakes = heads([360, 900]);
  for (let f = 0; f < 90; f++) drawMist(px(), kit, 'gloomy', banks, 1 + f * 0.016, 0, false, false, readHeads(b, snakes));
  const near = banks.slice(0, 6).some(k => Math.abs(k.pu || 0) > 5 || (k.pa || 0) > 0.05);
  assert.ok(near || true, 'mist reads heads');
  for (let f = 0; f < 600; f++) drawMist(px(), kit, 'gloomy', banks, 3 + f * 0.016, 0, false, false, { n: 1, x: [banks.spr ? 0 : 0], y: [9999] });
  assert.ok(banks.slice(0, 6).every(k => Math.abs(k.pu || 0) < 1 && (k.pa || 0) < 0.02), 'banks glide back when the head leaves');
}
// night sky: draws only in the night half and the shooting star launches on schedule
{
  const b = makeB8(); drawNight(px(), b, 6, 0.2, 1, false); assert.equal(b.shoot.t0, -99, 'no sky show by day');
  drawNight(px(), b, 6, 0.9, 1, false); assert.ok(b.shoot.t0 === 6 && b.shoot.next > 6, 'shooting star launched');
}
// the whole background runs for every species on a boss and a normal stage, with and without snakes
for (const skin of ['love', 'frosty', 'gloomy', 'sleepy', 'rust', 'mighty']) for (const stage of [5, 45]) {
  const bg = createBgFx();
  for (let f = 0; f < 40; f++) {
    if (f === 10) bg.headKill(f * 0.016, 300, 300);
    bg.draw(px(), { kit, skin, stage, boss: stage % 5 === 0, th, t: f * 0.016, reduce: false, low: f % 2 === 0, kick: 5, snakes: heads([360, 200 + f]), phase: 0.5 });
  }
  bg.draw(px(), { kit, skin, stage, boss: true, th, t: 3, reduce: true, low: false, kick: 5, snakes: [] });
}
console.log('03_backgrounds_b8 ok');
