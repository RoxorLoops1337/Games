// GRAFTWORK card art: draws every card (base, upgraded, tithed, jammed, 0..3 grafts) and every graft tile on the fake canvas.
import assert from 'node:assert/strict';
import { fakeCtx, installDom } from './graftwork_lib.mjs';
installDom();
const { CARD_LIST, GRAFT_LIST } = await import('../graftwork/data/index.js');
const { cardSpec } = await import('../graftwork/engine/cards.js');
const { motifOf, drawCard, drawCardBack, drawGraftPatch, drawSchoolGlyph, SCHOOL_SHAPES, CARD_W, CARD_H, MOTIF_NAMES, lightDir, SCHOOL_COLORS, clearCardCache } = await import('../graftwork/art/cards.js');
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

t('light_dir_is_a_pendulum_from_the_upper_left', () => {
  let lo = 9, hi = -9;
  for (let i = 0; i <= 60; i++) { const L = lightDir(i * 0.1); assert.ok(Math.abs(Math.hypot(L.x, L.y) - 1) < 1e-9); assert.ok(L.x < 0 && L.y < 0); lo = Math.min(lo, L.sway); hi = Math.max(hi, L.sway); }
  assert.ok(Math.abs(hi - 12 * Math.PI / 180) < 0.01 && Math.abs(lo + 12 * Math.PI / 180) < 0.01);
  assert.ok(Math.abs(lightDir(0).angle - lightDir(6).angle) < 1e-9);
});
t('motif_library_has_the_new_content_motifs', () => {
  assert.ok(MOTIF_NAMES.length >= 39);
  for (const m of ['knot', 'scissors', 'sewneedle', 'tangle', 'poisonvial', 'crackedshield', 'pulledstitch', 'hammerrivet']) assert.ok(MOTIF_NAMES.includes(m), m);
});
t('round6b_motifs_exist_and_every_card_art_keyword_resolves', () => {
  assert.ok(MOTIF_NAMES.length >= 60);
  for (const m of ['shears', 'spool', 'bobbin', 'threader', 'loom', 'crossstitch', 'thimble', 'hoop', 'tapestry', 'pinking', 'seamripper', 'fusewire', 'anvil', 'purse', 'mirror', 'batteryjar', 'tuningfork', 'scalpelfan', 'belljar', 'keyring', 'sutureknot', 'bandageroll', 'gavel', 'stamp']) assert.ok(MOTIF_NAMES.includes(m), m);
  for (const c of CARD_LIST) { if (c.art) assert.ok(MOTIF_NAMES.includes(c.art), c.id + ' art ' + c.art); assert.ok(MOTIF_NAMES.includes(motifOf(cardSpec({ uid: 1, id: c.id, grafts: [], up: 0 }))), c.id); }
  const arts = CARD_LIST.filter((c) => c.art && /^(shears|spool|bobbin|threader|loom|crossstitch|thimble|hoop|tapestry|pinking|seamripper|fusewire|anvil|purse|mirror|batteryjar|tuningfork|scalpelfan|belljar|keyring|sutureknot|bandageroll|gavel|stamp|powderkeg|tourniquet|matchstick|waxseal|ticket|dynamocoil)$/.test(c.art));
  assert.ok(arts.length >= 30);
});
t('school_colours_are_the_revised_set', () => { assert.equal(SCHOOL_COLORS.ember, '#E8571F'); assert.equal(SCHOOL_COLORS.gilded, '#EFD98F'); assert.equal(Object.keys(SCHOOL_COLORS).length, 7); });
t('every_new_motif_and_state_draws_via_spec_art', () => {
  clearCardCache();
  const base = cardSpec({ uid: 1, id: CARD_LIST[0].id, grafts: [], up: 0 });
  for (const m of MOTIF_NAMES) for (const o of [{}, { compact: true }]) drawCard(ctx, { ...base, id: 'art_' + m, art: m }, 50, 50, o);
});
t('compact_marks_rarity_tilt_states_draw', () => {
  const rng = makeRng(11); const gids = GRAFT_LIST.map((g) => g.id); let k = 1000;
  for (const c of CARD_LIST.filter((_, i) => i % 3 === 0)) {
    const grafts = []; const ng = rng.int(4); while (grafts.length < ng) { const id = gids[rng.int(gids.length)]; if (!grafts.includes(id)) grafts.push(id); }
    const spec = cardSpec({ uid: ++k, id: c.id, grafts, up: rng.int(2), fused: rng.int(2) ? [gids[0]] : [] });
    for (const mark of [undefined, 'numb', 'unpicked', 'reknit', 'frayed']) {
      drawCard(ctx, spec, 100, 100, { compact: true, scale: 0.6, mark });
      drawCard(ctx, spec, 100, 100, { compact: true, tithed: true, jam: true, scale: 0.54, mark, tilt: { x: 0.5, y: -1 } });
      drawCard(ctx, spec, 100, 100, { mark, tilt: { x: -1, y: 1 }, t: 2.2, hover: true });
    }
    for (const rarity of ['common', 'uncommon', 'rare', 'junk']) drawCard(ctx, spec, 100, 100, { rarity, t: 1.3, tilt: { x: 0.3, y: 0.3 } });
  }
  drawCardBack(ctx, 10, 10, { t: 3 });
});
t('hand_of_ten_costs_under_budget', () => {
  const rare = CARD_LIST.filter((c) => c.rarity === 'rare').slice(0, 5), unc = CARD_LIST.filter((c) => c.rarity === 'uncommon').slice(0, 5);
  const hand = [...rare, ...unc].map((c, i) => cardSpec({ uid: 2000 + i, id: c.id, grafts: [], up: 0 }));
  const frame = (f) => hand.forEach((sp, i) => drawCard(ctx, sp, 100 + i * 60, 600, { compact: true, scale: 0.6, rot: (i - 5) * 0.03, t: f / 60, tilt: i === 3 ? { x: 0.4, y: -0.4 } : undefined }));
  for (let f = 0; f < 30; f++) frame(f);
  const t0 = performance.now(); const N = 300; for (let f = 0; f < N; f++) frame(f);
  const per = (performance.now() - t0) / N;
  console.log('hand of 10 cpu ms/frame (fake ctx):', per.toFixed(3));
  assert.ok(per < 1.5, 'hand cost ' + per);
});
console.log(n + ' passed');
