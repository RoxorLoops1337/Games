// Headless exercise of render/catart.js: every cat, anim, card and frame, with and without offscreen caching.
import assert from 'node:assert/strict';
import { makeCtx } from './midnight_mog_mockctx.mjs';
import { drawCat, drawCatPortrait, drawCardArt, drawRarityFrame, drawStarPips, cornerStud, filigreeCorner, crownEdge, haloRing,
  CAT_IDS, CARD_ART_IDS, clearCatCache, catCacheStats, prewarmCats, catSignature, hash } from '../midnight_mog/js/render/catart.js';
import { CATS } from '../midnight_mog/js/data/cats.js';
import { CARDS } from '../midnight_mog/js/data/cards.js';
import { RARITY_ORDER } from '../midnight_mog/js/palette.js';

const t0 = Date.now();
const offs = [];
function installOffscreen() {
  globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; this._c = makeCtx(w, h); offs.push(this._c); } getContext() { return this._c; } };
}
const ANIMS = ['idle', 'walk', 'attack', 'cast', 'hit', 'die', 'sleep'];

function run(label) {
  const ctx = makeCtx(800, 600);
  for (const id of CAT_IDS) {
    for (const anim of ANIMS) for (const at of [0, 0.15, 0.4, 0.85, 1]) {
      drawCat(ctx, id, 100, 200, 48, { t: at * 3 + 0.2, anim, animT: at, level: 7, stars: 1 + (at > 0.5 ? 2 : 0), hitFlash: anim === 'hit' ? at : 0, facing: at > 0.5 ? -1 : 1, shield: at > 0.8, tint: at === 0.4 ? '#19e6ff' : undefined });
    }
    for (const s of [16, 32, 96, 220]) drawCat(ctx, id, 50, 80, s, { t: 1.7 });
    drawCatPortrait(ctx, id, 10, 10, 120, 160, { t: 1 });
    drawCatPortrait(ctx, id, 10, 10, 200, 100, { t: 1, crop: 'bust', stars: 3 });
    assert.ok(catSignature(id).fur);
  }
  drawCat(ctx, 'not_a_cat', 10, 10, 40, {}); drawCat(ctx, CAT_IDS[0], NaN, 10, 40, { t: NaN, animT: NaN }); drawCat(ctx, CAT_IDS[0], 0, 0, 0, {}); drawCat(ctx, CAT_IDS[0], 0, 0, 30);
  for (const c of CARDS) { drawCardArt(ctx, c, 10, 10, 200, 130, { t: 2 }); drawCardArt(ctx, c, 10, 10, 90, 120, { t: 0.4, pop: false }); }
  drawCardArt(ctx, 'pounce', 0, 0, 100, 80); drawCardArt(ctx, 'missing', 0, 0, 100, 80); drawCardArt(ctx, { id: 'x', type: 'spell', rarity: 'epic', effect: {} }, 0, 0, 100, 80);
  for (const r of [...RARITY_ORDER, 'bogus']) for (const layer of ['all', 'back', 'front']) for (const tt of [0, 1.3, 9]) {
    drawRarityFrame(ctx, r, 5, 5, 140, 200, tt, { layer }); drawRarityFrame(ctx, r, 5, 5, 20, 20, tt);
  }
  drawStarPips(ctx, 5, 50, 50, 40, 1); drawStarPips(ctx, 0, 50, 50, 40, 1);
  cornerStud(ctx, 5, 5, 4, '#fff', 0); filigreeCorner(ctx, 5, 5, 8, '#fff', 0, -1, -1); crownEdge(ctx, 0, 20, 100, 8, '#fff', 0); haloRing(ctx, 50, 50, 30, '#fff', 1);
  ctx.assertClean();
  for (const o of offs) o.assertClean();
  assert.ok(ctx.calls.length > 5000, label + ' drew something');
  assert.equal(CAT_IDS.length, CATS.length);
  assert.ok(CARD_ART_IDS.length >= 36);
  assert.equal(hash(5), hash(5));
}

clearCatCache();
run('live');
installOffscreen();
clearCatCache();
prewarmCats(null, [48]);
assert.ok(catCacheStats().cores >= 32, 'cores baked');
run('cached');
assert.ok(offs.length > 0);
assert.ok(Date.now() - t0 < 10000, 'under 10s');
console.log('midnight_mog catart ok (' + (Date.now() - t0) + 'ms, ' + catCacheStats().cores + ' cores)');
