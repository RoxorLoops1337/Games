// Round 5 enemy art: gold fade-out sprites, boss phase 2 silhouette, animated boss ornaments.
import assert from 'node:assert';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'globalAlpha' ? 1 : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
for (const sp of Object.keys(kit.SPECIES)) {
  assert(kit.SPR.body(sp, false, 'gold2'), `fading gold body ${sp}`);
  assert(kit.SPR.body(sp, false, 'gold2') !== kit.SPR.body(sp, false, 'gold'), 'fading gold is its own sprite');
  for (const p2 of [false, true]) for (const t of [0, 1.3, 5.7]) kit.drawHead(ctx(), 0, 0, 30, 1, { skin: sp, boss: true, t, p2 });
}
assert(kit.SPR.badge('coinx') && kit.SPR.badge('coinx') !== kit.SPR.badge('coin'), 'dull coin badge exists');
// the animated ornament pieces are baked once, not per frame
const before = kit.cache.size;
for (let i = 0; i < 50; i++) kit.drawHead(ctx(), 0, 0, 30, 1, { skin: 'rust', boss: true, t: i * 0.1, p2: true });
assert.equal(kit.cache.size, before, 'boss live layers do not bake anything new after the first frames');
console.log('23_enemy_art_r5 ok');
