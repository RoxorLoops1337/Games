// Round 6 enemy art: dash spikes, per-species cell patterns, choir link drawing.
import assert from 'node:assert';
import { createArtDraw } from '../../cell_serpent/art_draw.js';
import { drawChoirLinks, drawQuartetLinks } from '../../cell_serpent/cellfx.js';
const ctx = () => new Proxy(function () {}, { get: (t, k) => (k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'globalAlpha' ? 1 : ctx()), set: () => true, apply: () => ctx() });
const kit = createArtDraw((w, h) => ({ width: w, height: h, getContext: () => ctx() }), 1);
for (const sp of Object.keys(kit.SPECIES)) for (const sg of ['', 'warn', 'go']) for (const boss of [false, true]) kit.drawHead(ctx(), 0, 0, 30, 1, { skin: sp, boss, p2: boss, t: 2, sg });
// the dash art is baked once: more frames bake nothing new
const n0 = kit.cache.size;
for (let i = 0; i < 40; i++) kit.drawHead(ctx(), 0, 0, 30, i * 0.2, { skin: 'rust', boss: true, p2: true, t: i * 0.1, sg: 'go' });
assert.equal(kit.cache.size, n0, 'dash spikes do not bake per frame');
// every species body still bakes with the new patterns
for (const sp of Object.keys(kit.SPECIES)) assert(kit.SPR.body(sp, false, ''), 'body ' + sp);
// links draw without throwing, with and without hurt neighbours
const mk = (i, o = {}) => ({ x: i * 40, y: 50, r: 20, hp: 50, max: 100, ...o });
const sn = { segs: [mk(0), mk(1), mk(2, { choir: true }), mk(3), mk(4, { hp: 100 }), mk(5, { quartet: true }), mk(6, { quartet: true })], qT: 1, qWin: 2 };
drawChoirLinks(ctx(), sn, 1.2); drawQuartetLinks(ctx(), sn, 1.2); sn.qT = 0; drawQuartetLinks(ctx(), sn, 2);
drawChoirLinks(ctx(), { segs: [mk(0)] }, 0);
console.log('24_enemy_art_r6 ok');
