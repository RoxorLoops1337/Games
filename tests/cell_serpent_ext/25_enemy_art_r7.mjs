// Round 7 enemy art: yell / wail faces, per-species surge look, dazed face, tail tip.
import assert from 'node:assert';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'globalAlpha' ? 1 : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
for (const sp of Object.keys(kit.SPECIES)) {
  for (const o of [{ sg: 'go' }, { sg: 'warn' }, { flash: 0.1 }, { sg: 'go', boss: true, p2: true }, {}]) kit.drawHead(ctx(), 0, 0, 30, 0.5, { skin: sp, t: 2, ...o });
  assert(kit.SPR.dazed(sp), 'dazed ' + sp); assert(kit.SPR.tail(sp), 'tail ' + sp);
}
const n0 = kit.cache.size;
for (let i = 0; i < 60; i++) for (const sp of ['love', 'mighty']) { kit.drawHead(ctx(), 0, 0, 30, i * 0.1, { skin: sp, t: i * 0.07, sg: i % 2 ? 'go' : 'warn' }); kit.drawHead(ctx(), 0, 0, 30, 0, { skin: sp, t: i * 0.07, flash: 0.1 }); kit.SPR.dazed(sp); kit.SPR.tail(sp); }
assert.equal(kit.cache.size, n0, 'the new enemy art bakes once, never per frame');
console.log('25_enemy_art_r7 ok');
