// GRAFTWORK card art: draws every card (base, upgraded, tithed, jammed, 0..3 grafts) and every graft tile on the fake canvas.
import assert from 'node:assert/strict';
import { fakeCtx, installDom } from './graftwork_lib.mjs';
installDom();
const { CARD_LIST, GRAFT_LIST } = await import('../graftwork/data/index.js');
const { cardSpec } = await import('../graftwork/engine/cards.js');
const { drawCard, drawCardBack, drawGraftPatch, drawSchoolGlyph, SCHOOL_SHAPES, CARD_W, CARD_H, MOTIF_NAMES } = await import('../graftwork/art/cards.js');
const { makeRng } = await import('../graftwork/engine/rng.js');

let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const ctx = fakeCtx();

t('constants_keep_contract_size', () => { assert.equal(CARD_W, 220); assert.equal(CARD_H, 310); });
t('school_shapes_cover_seven_distinct_shapes', () => { assert.equal(new Set(Object.values(SCHOOL_SHAPES)).size, 7); assert.ok(MOTIF_NAMES.length >= 30); });
t('school_glyph_draws_all_schools_and_unknown', () => { for (const s of [...Object.keys(SCHOOL_SHAPES), 'nope']) drawSchoolGlyph(ctx, s, 10, 10, 8); });
t('card_back_draws', () => { drawCardBack(ctx, 100, 100, { scale: 0.5, rot: 0.2, dim: 0.5, hover: true }); });
t('graft_patch_draws_every_graft_in_all_states', () => {
  for (const g of GRAFT_LIST) for (const o of [{}, { hover: true }, { selected: true, scale: 1.1 }, { dim: 0.6 }, { sold: true }]) drawGraftPatch(ctx, g, 10, 10, 200, 240, o);
  drawGraftPatch(ctx, GRAFT_LIST[0], 0, 0, 60, 60, {});
});
t('every_card_draws_in_every_variant_without_throwing', () => {
  const rng = makeRng(7); let k = 0;
  const gids = GRAFT_LIST.map((g) => g.id);
  for (const c of CARD_LIST) {
    for (const up of [0, 1]) for (let ng = 0; ng <= 3; ng++) {
      const grafts = []; while (grafts.length < ng) { const id = gids[rng.int(gids.length)]; if (!grafts.includes(id)) grafts.push(id); }
      const spec = cardSpec({ uid: ++k, id: c.id, grafts, up });
      drawCard(ctx, spec, 100, 100, {});
      drawCard(ctx, spec, 100, 100, { tithed: true, jam: true, cost: 'X', glow: 1, selected: true, dim: 0.5, alpha: 0.7, hover: true, preview: true, scale: 1.2, rot: 0.3 });
      drawCard(ctx, spec, 100, 100, { cost: 0 });
    }
  }
  assert.ok(k > 500);
});
console.log(n + ' passed');
