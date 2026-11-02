// Round 4 enemy art: gold cell sprite, ward/lullaby/coin badges, boss-specific heads.
import assert from 'node:assert';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
for (const sp of Object.keys(kit.SPECIES)) {
  assert(kit.SPR.body(sp, false, 'gold'), `gold body ${sp}`);
  assert(kit.SPR.body(sp, true, 'gold'), `boss gold body ${sp}`);
  kit.drawHead(ctx(), 0, 0, 30, 1, { skin: sp, boss: true, t: 2 });
}
for (const k of ['coin', 'ward', 'lull']) assert(kit.SPR.badge(k), 'badge ' + k);
assert(kit.SPR.badge('ward') !== kit.SPR.badge('lull'), 'badges are distinct sprites');
console.log('22_enemy_art_r4 ok');
