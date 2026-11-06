// Round 8 enemy art: mid-snake spine, crowned boss dazed face.
import assert from 'node:assert';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'globalAlpha' ? 1 : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
for (const sp of Object.keys(kit.SPECIES)) {
  for (const kind of ['', 'gold', 'armor', 'bomb', 'mender', 'upgrade']) assert(kit.SPR.body(sp, false, kind), 'body ' + sp + kind);
  assert(kit.SPR.dazed(sp, true), 'boss dazed ' + sp);
  assert.notEqual(kit.SPR.dazed(sp, true), kit.SPR.dazed(sp, false), 'boss dazed is its own sprite ' + sp);
}
const n0 = kit.cache.size;
for (let i = 0; i < 50; i++) for (const sp of ['love', 'frosty']) { kit.SPR.body(sp, false, ''); kit.SPR.dazed(sp, true); }
assert.equal(kit.cache.size, n0, 'spine and crown bake once');
console.log('26_enemy_art_r8 ok');
