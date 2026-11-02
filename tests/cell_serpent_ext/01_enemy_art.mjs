// Enemy art: every species bakes every cell kind (incl. the mender pillow) and the head draws all idle states.
import assert from 'node:assert';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
for (const sp of Object.keys(kit.SPECIES)) for (const k of ['', 'upgrade', 'armor', 'bomb', 'mender']) {
  assert(kit.SPR.body(sp, false, k), `body ${sp} ${k}`);
  assert(kit.SPR.body(sp, true, k), `boss body ${sp} ${k}`);
}
for (const sp of Object.keys(kit.SPECIES)) for (const boss of [false, true]) for (const t of [0, 3.6, 5.3, 5.5, 8.8]) kit.drawHead(ctx(), 0, 0, 30, 1, { skin: sp, boss, t });
// round 2: frost sprite, squash/stretch/slow/look head states
assert(kit.SPR.frost(), 'frost sprite');
for (const sp of Object.keys(kit.SPECIES)) for (const o of [{ flash: 0.1 }, { sg: 'go' }, { sg: 'warn' }, { slow: 2, look: [0.5, 0.8] }]) kit.drawHead(ctx(), 0, 0, 30, 1, { skin: sp, t: 1, ...o });
console.log('01_enemy_art ok');
