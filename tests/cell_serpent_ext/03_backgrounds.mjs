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
{
  const { skyGrade, createBgFx, beatPulse, weatherFor, makeWeather } = await import('../../cell_serpent/bg_world.js');
  const lum = h => { const n = parseInt(h.slice(1), 16); return ((n >> 16) + ((n >> 8) & 255) + (n & 255)) / 3; };
  assert.ok(lum(skyGrade(1).topT) > lum(skyGrade(50).topT), 'sky gets darker over the stages');
  assert.ok(skyGrade(50).topA > skyGrade(1).topA, 'later skies are more dramatic');
  for (const st of [1, 6, 10, 25, 50]) for (const s of SKINS) bakeWorld(proxy(), s, st % 5 === 0, st === 6, th, st);
  const kit = { bake: () => ({ c: {} }) }, fx = createBgFx();
  for (const [reduce, low, boss] of [[false, false, true], [true, false, false], [false, true, false]])
    for (let t = 0; t < 12; t += 0.37) fx.draw(proxy(), { kit, skin: 'sleepy', stage: 50, boss, th, t, reduce, low, kick: t % 3 });
  assert.ok(beatPulse(0, 1, false) > beatPulse(0.3, 1, false), 'pulse peaks on the beat');
  assert.equal(weatherFor('frosty', 1), 'snow'); assert.equal(weatherFor('disco', 1), ''); assert.equal(makeWeather().length, 26);
}
{
  const st = await import('../../cell_serpent/bg_stage.js');
  const px = () => new Proxy(function () {}, { get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : px()), set: () => true, apply: () => px() });
  const th2 = { base: '#ff7eb6', lite: '#ffc2dc' }, kit = { bake: () => ({ c: {} }) };
  for (const boss of [false, true]) { st.bakeStageExtras(px(), th2, boss); st.drawFootlights(px(), 1.3, 0.5, th2, boss); st.drawCrowdLights(px(), 2, th2, boss, 0.4, false); st.drawBossFx(px(), 2, 0.6, boss); st.paintGrooves(px(), 0, 0, 200, boss); }
  st.drawClouds(px(), kit, 'love', '#ffffff', 0.5, 9, false, false); st.drawClouds(px(), null, 'love', '#fff', 0, 1, false, true);
  assert.equal(st.CLOUDS.length, 5, 'five clouds');
  console.log('03_backgrounds stage extras ok');
}
{
  const far = await import('../../cell_serpent/bg_far.js');
  const { drawBossPhase, bakeWorld: bw } = await import('../../cell_serpent/bg_world.js');
  const px = () => new Proxy(function () {}, { get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : px()), set: () => true, apply: () => px() });
  const th3 = { base: '#ff7eb6', lite: '#ffc2dc' }, kit = { bake: () => ({ c: {} }) };
  for (const s of SKINS.concat('piggy')) {
    assert.ok(far.FAR_KIND[s], 'far skyline for ' + s);
    for (const st of [1, 10, 30, 50]) { far.bakeFar(px(), s, st % 5 === 0, st); for (const reduce of [false, true]) far.drawFar(px(), kit, { skin: s, boss: st % 5 === 0, stage: st, t: 3.3, px: 100, reduce, low: !reduce }); }
  }
  assert.equal(new Set(SKINS.map(s => far.farKind(s))).size, SKINS.length, 'each species has its own landmarks');
  far.drawFar(px(), null, { skin: 'love', boss: false, stage: 1, t: 0, px: 360 });
  for (const part of [0, 1, 2]) bw(px(), 'frosty', false, false, th3, 20, part);
  for (const f of [0, 1]) drawBossPhase(px(), kit, 2, 0.8, 0.5, f, false, false);
  console.log('03_backgrounds far skyline + boss phase ok');
}
