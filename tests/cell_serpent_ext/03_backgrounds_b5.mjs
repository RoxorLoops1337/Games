// batch 5: themed floors, themed ring discs, skyline windows that light with progress, sun and moon across the 50 stages
import assert from 'node:assert/strict';
import { bakeWorld, drawRing } from '../../cell_serpent/bg_world.js';
import { SKINS } from '../../cell_serpent/sim.js';
import * as fl from '../../cell_serpent/bg_floor.js';
import * as far from '../../cell_serpent/bg_far.js';

const px = () => new Proxy(function () {}, { get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : px()), set: () => true, apply: () => px() });
const th5 = { base: '#ff7eb6', lite: '#ffc2dc' }, kits = { bake: (k, w, h, fn) => { fn(px()); return { c: {} }; } };
const styles = new Set();
for (const s of SKINS.concat('piggy')) {
  fl.bakeFloor(px(), s); fl.ringSurface(px(), 0, 0, 160, s, false); fl.ringSurface(px(), 0, 0, 160, s, true);
  assert.match(fl.rimOf(s, false), /^\d+,\d+,\d+$/, 'rim colour for ' + s); styles.add(fl.rimOf(s, false));
  drawRing(px(), { cx: 360, cy: 900, R: 160 }, 1, false, 0.5, kits, s);
  for (const stg of [1, 20, 49]) { bakeWorld(px(), s, false, true, th5, stg, 0); far.drawFar(px(), kits, { skin: s, boss: false, stage: stg, t: 2, px: 300, reduce: false, low: false, lit: 0.6, pop: 0.1 }); }
}
assert.ok(styles.size >= 9, 'each species rims its ring in its own colour');
assert.equal(fl.rimOf('love', true), '255,50,90', 'boss ring stays red');
assert.ok(fl.hasVinyl('disco') && !fl.hasVinyl('frosty'), 'vinyl grooves only on the record floors');
console.log('03_backgrounds_b5 floors, ring, windows, sky ok');
