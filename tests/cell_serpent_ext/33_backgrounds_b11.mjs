// Batch 11 backgrounds: beat-reactive second weather layer, twinkling night stars, golden finale for stages 41 to 50.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SKINS } from '../../cell_serpent/sim.js';
import { createBgFx } from '../../cell_serpent/bg_world.js';
import * as b11 from '../../cell_serpent/bg_b11.js';

const px = () => new Proxy(function () {}, { get: (t, k) => (k === 'globalAlpha' ? 1 : k === 'addColorStop' ? () => {} : px()), set: () => true, apply: () => px() });
const baked = new Map();
const kit = { bake: (key, w, h) => { baked.set(key, (baked.get(key) || 0) + 1); return { c: {}, w, h }; } };
const th = { base: '#ff7eb6', lite: '#ffc2dc' };

assert.equal(b11.weather11For('rust'), 'leaves');
assert.equal(b11.weather11For('disco'), 'confetti');
assert.equal(b11.weather11For('frosty'), 'dust');
assert.equal(b11.weather11For('love'), '');
const st = b11.makeB11();
assert.equal(st.p.length, b11.NP);
assert.ok(new Set(st.p.map(m => m.z)).size === 3, 'three depths');
for (const [skin, kind] of [['rust', 'leaves'], ['disco', 'confetti'], ['frosty', 'dust']]) {
  assert.ok(b11.drawLayer2(px(), kit, kind, st, 4.2, 0.6, 20, 30, false) > 10, skin + ' layer draws');
  assert.ok(b11.drawLayer2(px(), kit, kind, st, 4.2, 0, 0, 0, true) <= 9, skin + ' low quality draws fewer');
}
assert.equal(b11.drawLayer2(px(), kit, '', st, 1, 0, 0, 0, false), 0);
assert.equal(b11.drawLayer2(px(), null, 'leaves', st, 1, 0, 0, 0, false), 0, 'no kit, no crash');

// night stars appear only late, finale only from stage 41
assert.equal(b11.drawTwinkle(px(), kit, st, 0.1, 1, 0.5, false), 0, 'no twinkles in the day');
assert.ok(b11.drawTwinkle(px(), kit, st, 0.9, 1, 0.5, false) >= 12);
assert.ok(b11.drawTwinkle(px(), kit, st, 0.9, 1, 0.5, true) < 12);
assert.equal(b11.isFinale(40), false); assert.equal(b11.isFinale(41), true);
assert.equal(b11.finaleLevel(40, false), 0);
assert.ok(b11.finaleLevel(50, false) > b11.finaleLevel(41, false), 'the finale builds up');
assert.ok(b11.finaleLevel(50, true) < b11.finaleLevel(50, false), 'boss stages keep the finale lighter');
assert.equal(b11.drawFinale(px(), kit, st, 30, false, 2, 0.5, false), 0);
assert.ok(b11.drawFinale(px(), kit, st, 45, false, 2, 0.5, false) > 5);

// sprites are baked once and reused (no per-frame bake closures beyond the lookup)
const before = baked.size;
for (let i = 0; i < 40; i++) { b11.drawLayer2(px(), kit, 'leaves', st, i * 0.1, 0.3, 0, 0, false); b11.drawFinale(px(), kit, st, 50, false, i * 0.1, 0.3, false); }
assert.ok(baked.size <= before + 8, 'a handful of sprite keys only');

// the whole bg runs for every world at stage 12, 45 and 50, normal, low and reduced
const fx = createBgFx();
for (const skin of SKINS) for (const stage of [12, 45, 50]) for (const [reduce, low] of [[false, false], [false, true], [true, false]])
  for (let t = 0; t < 3; t += 0.5) fx.draw(px(), { kit, skin, stage, boss: stage % 5 === 0, th, t, reduce, low, kick: 1 });

// no colour strings are built per frame in the new file's draw functions
const src = readFileSync(new URL('../../cell_serpent/bg_b11.js', import.meta.url), 'utf8');
assert.ok(!/`[^`]*\$\{[^`]*\}[^`]*`/.test(src.split('export function drawLayer2')[1]), 'no template strings in the draw loops');
assert.ok(!src.includes('—'), 'no em dash');
console.log('33_backgrounds_b11 ok');
