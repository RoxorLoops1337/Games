// GRAFTWORK template system (ui/templates.js, art/cards.js template mode, ui/chrome.js skins, ui/rig.js): manifest parsing, 9-slice, slots,
// fit, fallback identity (no assets = the exact old calls), template composition with fake images, rig step cycle.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fakeCtx, installDom } from './graftwork_lib.mjs';
installDom();
const T = await import('../graftwork/ui/templates.js');
const R = await import('../graftwork/ui/rig.js');
let n = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };
const tick = () => new Promise((r) => setTimeout(r, 5));
const fakeImg = (w = 220, h = 310) => () => { const im = { width: w, height: h, naturalWidth: w, naturalHeight: h }; Object.defineProperty(im, 'src', { set() { setTimeout(() => im.onload && im.onload(), 0); } }); return im; };

await t('parse_rejects_non_manifests_and_drops_bad_entries', () => {
  assert.equal(T.parseManifest(null), null); assert.equal(T.parseManifest([]), null); assert.equal(T.parseManifest('x'), null);
  const m = T.parseManifest({ version: 2, atlases: { a: { file: 'a.webp', w: 100, h: 100 } }, frames: {
    ok: { file: 'ok.webp', w: 64, h: 64, slice: [8, 8, 8, 8], content: { x: 8, y: 8, w: 48, h: 48 } },
    noFile: { w: 10, h: 10 }, evil: { file: '../x.webp' }, abs: { file: '/etc/x' }, badSlice: { file: 'b.webp', slice: [1, 2, 3] }, negSlice: { file: 'c.webp', slice: [-1, 0, 0, 0] },
    atl: { atlas: 'a', rect: [10, 10, 20, 20] }, atlMissing: { atlas: 'zz', rect: [0, 0, 5, 5] }, atlBadRect: { atlas: 'a', rect: [0, 0, 0, 5] },
  }, icons: { i: { file: 'i.webp' }, j: 5 }, templates: { card_front: { slots: { window: { x: 1, y: 2, w: 3, h: 4 }, junk: 'no' } } } });
  assert.equal(m.version, 2);
  assert.deepEqual(Object.keys(m.frames).sort(), ['atl', 'badSlice', 'negSlice', 'ok'].sort());
  assert.deepEqual(m.frames.ok.slice, [8, 8, 8, 8]); assert.equal(m.frames.badSlice.slice, undefined); assert.equal(m.frames.negSlice.slice, undefined);
  assert.equal(m.frames.atl.w, 20); assert.deepEqual(Object.keys(m.icons), ['i']);
  assert.deepEqual(m.templates.card_front.slots.window, { x: 1, y: 2, w: 3, h: 4 }); assert.equal(m.templates.card_front.slots.junk, undefined);
});
await t('nine_slice_keeps_margins_and_covers_the_target', () => {
  const src = { sx: 0, sy: 0, sw: 128, sh: 128, k: 2, lw: 64, lh: 64 };
  const r = T.sliceRects(src, [8, 8, 8, 8], 10, 20, 100, 50);
  assert.equal(r.length, 9);
  const area = r.reduce((a, q) => a + q[6] * q[7], 0); assert.equal(area, 100 * 50);
  assert.deepEqual(r[0], [0, 0, 16, 16, 10, 20, 8, 8]); // corner: 8 logical = 16 image px, 8 target px
  assert.deepEqual(r[8], [112, 112, 16, 16, 102, 62, 8, 8]);
  assert.equal(T.sliceRects(src, [8, 8, 8, 8], 0, 0, 100, 50, false).length, 8); // no centre
  const tiny = T.sliceRects(src, [8, 8, 8, 8], 0, 0, 8, 8); // smaller than the margins: they shrink together, nothing negative
  for (const q of tiny) assert.ok(q[6] >= 0 && q[7] >= 0);
  assert.equal(tiny.reduce((a, q) => a + q[6] * q[7], 0), 64);
});
await t('content_rect_keeps_native_insets', () => {
  const def = { w: 64, h: 64, slice: [8, 8, 8, 8], content: { x: 10, y: 12, w: 40, h: 36 } };
  assert.deepEqual(T.contentRect(def, 100, 100, 200, 100), { x: 110, y: 112, w: 200 - 10 - 14, h: 100 - 12 - 16 });
  assert.deepEqual(T.contentRect({ w: 64, h: 64, slice: [8, 6, 8, 6] }, 0, 0, 100, 100), { x: 8, y: 6, w: 84, h: 88 });
  assert.deepEqual(T.contentRect({ w: 10, h: 10 }, 5, 5, 20, 20), { x: 5, y: 5, w: 20, h: 20 });
});
await t('slots_anchor_pivot_and_repeat', () => {
  const a = T.resolveSlot({ anchor: [1, 0], pivot: [1, 0], dx: -4, dy: 6, w: 40, h: 20 }, 220, 310);
  assert.deepEqual([a.x, a.y, a.w, a.h], [110 - 40 - 4, -155 + 6, 40, 20]);
  const c = T.resolveSlot({ anchor: [0.5, 0.5], w: 20, h: 20 }, 220, 310); assert.deepEqual([c.x, c.y], [-10, -10]); // pivot defaults to the anchor
  const rep = T.resolveSlot({ x: 0, y: 0, w: 10, h: 10, step: { x: 0, y: 44 }, n: 3 }, 220, 310);
  assert.deepEqual(rep.items.map((i) => i.y), [0, 44, 88]);
  assert.equal(T.resolveSlot({ w: 1, h: 1 }, 220, 310), null);
});
await t('default_template_matches_the_procedural_layout', () => {
  const full = T.resolveSlots(T.CARD_TEMPLATE, {}), cmp = T.resolveSlots(T.CARD_TEMPLATE, { compact: true }), cmpG = T.resolveSlots(T.CARD_TEMPLATE, { compact: true, grafts: true });
  assert.deepEqual([full.window.x, full.window.y, full.window.w, full.window.h], [-90, -112, 180, 90]);
  assert.deepEqual([cmp.window.y, cmp.window.h], [-102, 118]); assert.equal(cmpG.window.h, 70);
  assert.deepEqual([full.textBox.x, full.textBox.y, full.textBox.w, full.textBox.y + full.textBox.h], [-88, 2, 176, 143]);
  assert.deepEqual(full.graftSlots.items.map((i) => [i.x + i.w / 2, i.y + i.h / 2]), [[114, 28], [114, 72], [114, 116]]);
  assert.deepEqual([full.costGem.x + 20, full.costGem.y + 20], [-98, -141]);
  assert.deepEqual([cmp.costGem.x + 25, cmp.costGem.y + 25], [-96, -139]);
  assert.equal(full.fusedSlots.items[0].y + 9, 30); assert.equal(cmp.fusedSlots.items[0].y + 9, 8);
  assert.ok(full.textBox && !cmp.textBox && cmp.graftBand && !full.graftBand && cmp.keyNumber && !full.keyNumber);
  assert.equal(cmp.keyNumber.y, cmp.window.y + cmp.window.h);
});
await t('merge_overrides_slots_without_mutating', () => {
  const m = T.mergeTemplate(T.CARD_TEMPLATE, { slots: { window: { y: -100 } } }, { slots: { namePlate: { x: -50 } } });
  assert.equal(m.slots.window.y, -100); assert.equal(m.slots.window.h, 90); assert.equal(m.slots.namePlate.x, -50);
  assert.equal(T.CARD_TEMPLATE.slots.window.y, -112);
});
await t('fit_font_size_shrinks_to_width', () => {
  const meas = (s, str) => str.length * s * 0.5;
  assert.equal(T.fitFontSize(meas, 'abcd', 100, 17, 9), 17);
  const s = T.fitFontSize(meas, 'a'.repeat(30), 100, 17, 9); assert.ok(s < 17 && s >= 9 && meas(s, 'a'.repeat(30)) <= 100 + 1e-9 || s === 9);
  assert.equal(T.fitFontSize(meas, 'a'.repeat(200), 100, 17, 9.5), 9.5);
});
await t('frame_id_candidates_run_specific_to_generic', () => {
  assert.deepEqual(T.cardFrameIds({ type: 'attack', school: 'ember' }, 'rare'), ['card_front.attack.rare.ember', 'card_front.attack.rare', 'card_front.attack', 'card_front.rare', 'card_front']);
  assert.deepEqual(T.cardFrameIds({ type: 'junk' }, 'junk').slice(0, 2), ['card_front.junk.junk', 'card_front.junk']);
  assert.deepEqual(T.cardBackIds('plain', 'marrow', 2), ['card_back.plain.marrow', 'card_back.plain.act2', 'card_back.plain', 'card_back.marrow', 'card_back.act2', 'card_back']);
  assert.deepEqual(T.cardBackIds('gilt'), ['card_back.gilt', 'card_back']);
});
await t('loader_is_a_noop_headless_and_lazy_with_fakes', async () => {
  const L = T.createTemplates();
  L.ensure(); assert.equal(L.state, 'none'); assert.equal(L.ready(), false); assert.equal(L.frameImg('x'), null); assert.equal(L.pickFrame(['a', 'b']), null);
  let fetched = 0;
  const L2 = T.createTemplates({ live: true, fetchJson: (u) => { fetched++; assert.equal(u, 'assets/ui/manifest.json'); return Promise.resolve({ frames: { p: { file: 'p@1x.webp', file2x: 'p@2x.webp', w: 64, h: 64, slice: [8, 8, 8, 8] } } }); }, makeImage: fakeImg(128, 128) });
  L2.ensure(); L2.ensure(); assert.equal(fetched, 1); assert.equal(L2.frameImg('p'), null);
  await tick(); assert.ok(L2.ready());
  assert.equal(L2.frameImg('p'), null); // image requested, not decoded yet
  await tick();
  const fr = L2.frameImg('p'); assert.ok(fr && fr.src.k === 2 && fr.src.lw === 64);
  assert.equal(L2.frameImg('nope'), null); assert.equal(L2.pickFrame(['nope', 'p']).id, 'p');
  const L3 = T.createTemplates({ live: true, fetchJson: () => Promise.reject(new Error('404')) }); L3.ensure(); await tick(); assert.equal(L3.state, 'none');
  const L4 = T.createTemplates({ live: true, fetchJson: () => Promise.resolve('<html>') }); L4.ensure(); await tick(); assert.equal(L4.state, 'none');
});
await t('phone_scale_picks_the_1x_file', async () => {
  const seen = [];
  const L = T.createTemplates({ live: true, fetchJson: () => Promise.resolve({ frames: { p: { file1x: 'a1.webp', file2x: 'a2.webp', w: 10, h: 10 } } }), makeImage: () => { const im = { width: 10, height: 10 }; Object.defineProperty(im, 'src', { set(v) { seen.push(v); setTimeout(() => im.onload(), 0); } }); return im; } });
  L.ensure({ scale: 0.6 }); await tick(); L.frameImg('p'); await tick(); assert.deepEqual(seen, ['assets/ui/a1.webp']);
});
await t('draw_icon_fits_inside_the_box', async () => {
  const L = T.createTemplates({ live: true, fetchJson: () => Promise.resolve({ atlases: { a: { file: 'a.webp', w: 100, h: 100 } }, icons: { star: { atlas: 'a', rect: [0, 0, 20, 10] } } }), makeImage: fakeImg(200, 200) });
  L.ensure(); await tick(); assert.equal(L.drawIcon(fakeCtx(), 'star', 0, 0, 40, 40), false); await tick();
  const calls = []; const ctx = { drawImage: (...a) => calls.push(a) };
  assert.equal(L.drawIcon(ctx, 'star', 10, 10, 40, 40), true);
  assert.deepEqual(calls[0].slice(1), [0, 0, 40, 20, 10, 20, 40, 20]); // atlas rect at 2x, contained, centred vertically
  assert.equal(L.drawIcon(ctx, 'none', 0, 0, 1, 1), false);
});

// ---- fallback identity: the card render is the exact old call sequence when no assets exist
const GOLDEN = { hash: 'bec2fabf7637723d2590800a53b4e5cc30d3bb56', calls: 131933 };
for (const mode of ['plain', 'empty', 'broken']) {
  await t('card_render_unchanged_when_assets_are_missing_' + mode, () => {
    const r = spawnSync(process.execPath, [new URL('./graftwork_rec_hash.mjs', import.meta.url).pathname, mode], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr); assert.deepEqual(JSON.parse(r.stdout.trim().split('\n').pop()), GOLDEN);
  });
}

// ---- template mode: a fake frame makes the composer run; slots and painters line up
await t('card_template_mode_composes_frame_then_painters', async () => {
  const { templates } = T;
  const man = { frames: { 'card_front.attack': { file: 'f.webp', w: 220, h: 310, slots: { window: { x: -80, y: -100, w: 160, h: 80 } }, baked: ['namePlate'] }, 'card_back': { file: 'b.webp', w: 220, h: 310 } } };
  templates.configure({ live: true, fetchJson: () => Promise.resolve(man), makeImage: fakeImg(440, 620) });
  templates.ensure(); await tick(); templates.preload(); await tick();
  const { CARD_LIST } = await import('../graftwork/data/index.js');
  const { cardSpec } = await import('../graftwork/engine/cards.js');
  const C = await import('../graftwork/art/cards.js');
  const atk = CARD_LIST.find((c) => c.type === 'attack'), skl = CARD_LIST.find((c) => c.type === 'skill');
  const log = [];
  const prev = globalThis.document.createElement;
  globalThis.document.createElement = () => { const g = fakeCtx(); const orig = g.drawImage; g.drawImage = (im, ...a) => { if (im && im.naturalWidth === 440) log.push(a); return orig(); }; return { width: 0, height: 0, getContext: () => g, style: {} }; };
  C.clearCardCache();
  C.drawCard(fakeCtx(), cardSpec({ uid: 1, id: atk.id, grafts: [], up: 0 }), 0, 0, { t: 1 });
  const framed = log.length;
  C.drawCard(fakeCtx(), cardSpec({ uid: 2, id: skl.id, grafts: [], up: 0 }), 0, 0, { t: 1 }); // no skill frame: stays procedural
  assert.ok(framed >= 1, 'the attack face drew the frame image');
  assert.equal(log.length, framed, 'a type without a frame draws no frame');
  // slot override reaches the card window used for layers
  const fr = templates.pickFrame(T.cardFrameIds({ type: 'attack' }, 'common'));
  assert.deepEqual(T.resolveSlots(templates.cardTemplate(fr), {}).window, { x: -80, y: -100, w: 160, h: 80, r: 5 });
  // the back
  const b0 = log.length; C.drawCardBack(fakeCtx(), 0, 0, { t: 1, back: 'plain' }); assert.ok(log.length > b0, 'template back drawn');
  globalThis.document.createElement = prev; templates.configure({ live: false, fetchJson: null, makeImage: null }); C.clearCardCache();
});
await t('compose_calls_painters_in_order_with_baked_flags', () => {
  const calls = [];
  const P = {}; for (const k of T.FRONT_ORDER) P[k] = (g, r, inf) => calls.push([k, inf.baked, r.w]);
  const fr = { img: {}, def: { baked: ['typeBand'] }, src: { sx: 0, sy: 0, sw: 1, sh: 1, k: 1, lw: 1, lh: 1 } };
  let drew = 0; T.composeCardFront({ drawImage: () => drew++ }, T.CARD_TEMPLATE, fr, { compact: false }, P);
  assert.equal(drew, 1); assert.deepEqual(calls.map((c) => c[0]), ['window', 'namePlate', 'typeBand', 'textBox', 'graftSlots', 'fusedSlots', 'pips']);
  assert.equal(calls.find((c) => c[0] === 'typeBand')[1], true); assert.equal(calls.find((c) => c[0] === 'window')[1], false);
  calls.length = 0; T.composeCardFront({ drawImage() {} }, T.CARD_TEMPLATE, null, { compact: true, grafts: true }, P);
  assert.deepEqual(calls.map((c) => c[0]), ['window', 'namePlate', 'keyNumber', 'graftBand', 'fusedSlots', 'typeGlyph', 'schoolGlyph']);
});

// ---- chrome skins
await t('panel_and_button_use_a_9_slice_skin_only_when_a_frame_decoded', async () => {
  const { templates } = T; const CH = await import('../graftwork/ui/chrome.js');
  const mk = () => { const calls = []; return { calls, scale: 1, px: 1, ctx: { globalAlpha: 1, drawImage: (...a) => calls.push(a), save() {}, restore() {}, beginPath() {}, fill() {}, stroke() {}, fillRect() {}, createLinearGradient: () => ({ addColorStop() {} }) }, rr() {} }; };
  const base = mk(); CH.panel(base, 10, 10, 200, 100, {}); CH.button(base, 10, 10, 100, 40, {}, 2);
  templates.configure({ live: true, fetchJson: () => Promise.resolve({ frames: { panel: { file: 'p.webp', w: 48, h: 48, slice: [12, 12, 12, 12] }, 'button.down': { file: 'bd.webp', w: 48, h: 24, slice: [8, 8, 8, 8] }, button: { file: 'b.webp', w: 48, h: 24, slice: [8, 8, 8, 8] } } }), makeImage: fakeImg(96, 96) });
  const a = mk(); CH.panel(a, 10, 10, 200, 100, {}); await tick(); CH.panel(a, 10, 10, 200, 100, {}); await tick();
  const n0 = a.calls.length; CH.panel(a, 10, 10, 200, 100, {}); assert.equal(a.calls.length - n0, 9);
  const n1 = a.calls.length; CH.panel(a, 10, 10, 200, 100, { frame: false }); assert.ok(a.calls.length - n1 <= 1, 'opt out bakes the vector panel'); // one drawImage of the baked canvas at most
  const n2 = a.calls.length; CH.panel(a, 10, 10, 200, 100, { plain: true }); assert.ok(a.calls.length - n2 <= 1);
  CH.button(a, 10, 10, 100, 40, {}, 0); await tick(); const n3 = a.calls.length; const dy = CH.button(a, 10, 10, 100, 40, {}, 2); assert.equal(a.calls.length - n3, 9); assert.equal(dy, 2);
  templates.configure({ live: false, fetchJson: null, makeImage: null });
  const b = mk(); CH.panel(b, 10, 10, 200, 100, {}); CH.button(b, 10, 10, 100, 40, {}, 2);
  assert.equal(b.calls.length, base.calls.length, 'no assets: same drawing as before');
});

// ---- rig
await t('rig_step_cycle_alternates_feet', () => {
  const foot = (ph) => { const b = R.solveRig(R.HUMANOID, R.walkPose(ph), 0, 0, 1); const f = (nme) => b.find((q) => q.name === nme); return { l: f('footL').x, r: f('footR').x, ly: f('footL').y, ry: f('footR').y }; };
  assert.equal(R.leadFoot(0), 'L'); assert.equal(R.leadFoot(0.99), 'L'); assert.equal(R.leadFoot(1), 'R'); assert.equal(R.leadFoot(2), 'L');
  for (let step = 0; step < 6; step++) {
    const c = foot(step), nxt = foot(step + 1);
    if (step % 2 === 0) { assert.ok(c.l > c.r + 10, 'L leads at an even contact'); assert.ok(nxt.r > nxt.l + 10, 'R leads at the next'); } else { assert.ok(c.r > c.l + 10); assert.ok(nxt.l > nxt.r + 10); }
  }
  const mid = foot(0.5); assert.ok(Math.abs(mid.l - mid.r) < 4, 'passing: legs together');
  const lift = (ph) => { const f = foot(ph); return [f.ly, f.ry]; };
  assert.ok(lift(1.5)[0] < lift(1.0)[0] - 1 || lift(0.5)[1] < lift(0)[1] - 1, 'the swinging foot lifts');
  const p0 = R.walkPose(0), p5 = R.walkPose(0.5); assert.ok(p0.bob > p5.bob, 'body lowest at contact, highest at passing'); assert.ok(p0.armL * p0.legL < 0, 'arm swings against the same-side leg');
  assert.ok(R.walkPhase(92, 46) === 2 && R.walkPhase(-3, 46) === 0);
});
await t('rig_draws_placeholder_and_parts', () => {
  const ctx = fakeCtx(); const bones = R.drawRig(ctx, R.HUMANOID, R.walkPose(0.3), 100, 200, { scale: 2, flip: true });
  assert.equal(bones.length, R.HUMANOID.bones.length); for (let i = 1; i < bones.length; i++) assert.ok(bones[i].z >= bones[i - 1].z);
  const imgs = []; const nop = () => {}; const c2 = { save: nop, restore: nop, translate: nop, rotate: nop, beginPath: nop, moveTo: nop, lineTo: nop, closePath: nop, fill: nop, stroke: nop, drawImage: (...a) => imgs.push(a) };
  R.drawRig(c2, R.HUMANOID, R.IDLE_POSE, 0, 0, { part: (nme) => (nme === 'head' ? { img: { width: 16, height: 16 }, px: 8, py: 12, w: 16, h: 16 } : null) });
  assert.equal(imgs.length, 1);
  const f = R.solveRig(R.HUMANOID, R.walkPose(0), 0, 0, 1, true); const g = R.solveRig(R.HUMANOID, R.walkPose(0), 0, 0, 1, false);
  assert.ok(Math.abs(f.find((q) => q.name === 'footL').x + g.find((q) => q.name === 'footL').x) < 1e-9, 'flip mirrors');
});
console.log(n + ' templates tests done');
