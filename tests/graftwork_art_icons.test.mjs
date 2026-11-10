// Draws every status, relic, potion, node state, intent, HUD piece and background theme with the fake canvas: nothing may throw.
import assert from "node:assert/strict";
import { fakeCtx, installDom } from './graftwork_lib.mjs';
installDom();
const I = await import('../graftwork/art/icons.js');
const B = await import('../graftwork/art/backgrounds.js');
const { STATUSES, RELICS, POTIONS } = await import('../graftwork/data/index.js');
const ctx = fakeCtx();
let n = 0;
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exit(1); } n++; };
for (const s of Object.values(STATUSES)) { I.drawStatus(ctx, s.id, 50, 50, 32, s.good); ok(I.STATUS_IDS_DRAWN.includes(s.id), 'status glyph for ' + s.id); }
I.drawStatus(ctx, 'unknown_x', 10, 10, 20, true); I.drawStatus(ctx, 'unknown_y', 10, 10, 48, false);
for (const k of ['attack', 'defend', 'buff', 'debuff', 'junk', 'summon', 'unknown', 'weird', ['attack', 'buff']]) I.drawIntent(ctx, k, 40, 40, 32);
const glyphs = new Set();
for (const r of Object.values(RELICS)) { I.drawRelic(ctx, r.id, 40, 40, 40); glyphs.add(I.RELIC_GLYPHS[r.id] || r.id); }
I.drawRelic(ctx, 'r_future_thing', 40, 40, 40);
for (const p of Object.values(POTIONS)) I.drawPotion(ctx, p.id, 40, 40, 40);
I.drawPotion(ctx, 'p_new', 40, 40, 40);
for (const t of ['fight', 'elite', 'event', 'shop', 'forge', 'rest', 'boss', 'zzz']) for (const s of ['available', 'visited', 'locked', 'current']) I.drawNodeIcon(ctx, t, 40, 40, 40, s); // the Ward's trigger seals (and an unknown kind)
I.drawEnergyOrb(ctx, 40, 40, 60, 3, 3); I.drawEnergyOrb(ctx, 40, 40, 60, 0);
I.drawCoin(ctx, 1, 1, 20); I.drawHeart(ctx, 1, 1, 20); I.drawShield(ctx, 1, 1, 40, 5); I.drawShield(ctx, 1, 1, 40);
I.drawBudgetGauge(ctx, 10, 10, 400, 4, 6, 0); I.drawBudgetGauge(ctx, 10, 10, 400, 8, 6, 2); I.drawBudgetGauge(ctx, 10, 10, 400, 0, 6, 3);
I.drawStrainMeter(ctx, 10, 10, 200, 2, 6); I.drawDeckIcon(ctx, 1, 1, 40);
for (const k of ['draw', 'discard', 'exhaust']) I.drawPileIcon(ctx, 1, 1, 40, k);
for (const th of [...B.BACKGROUND_THEMES, 'nonsense']) for (const t of [0, 1.7, 40]) B.drawBackground(ctx, th, t, { dim: 0.2 });
B.drawBackground(ctx, 'ward', 1); B.drawVignette(ctx, 0.5); B.drawLampCone(ctx, 10, 10);
// ---- round 4 additions: three sizes, new pictograms, intents, thread language, school colours
const NEW_ST = ['poison', 'brittle', 'rejection', 'infection', 'numb', 'unpicked', 'cadencelock', 'stagefright', 'dread', 'leaden', 'weightofdebt', 'stitchedup'];
for (const sz of [20, 26, 40]) {
  for (const id of [...NEW_ST, ...Object.keys(STATUSES), 'brand_new_status_zz']) { for (const good of [true, false]) { I.drawStatus(ctx, id, 30, 30, sz, good); I.drawStatus(ctx, id, 30, 30, sz, good, { shape: true }); I.drawStatus(ctx, id, 30, 30, sz, good, true); } }
  for (const k of ['attack', 'defend', 'buff', 'debuff', 'poison', 'summon', 'junk', 'unknown', 'multi', 'heavy', 'conditional', 'stun', 'heal', 'weird']) I.drawIntent(ctx, k, 30, 30, sz);
  I.drawIntent(ctx, 'attack', 30, 30, sz, { hits: 3 }); I.drawIntent(ctx, 'attack', 30, 30, sz, { heavy: true, conditional: true }); I.drawIntent(ctx, ['defend', 'conditional'], 30, 30, sz); I.drawIntent(ctx, ['attack', 'buff'], 30, 30, sz);
  for (const r of Object.values(RELICS)) I.drawRelic(ctx, r.id, 30, 30, sz);
  for (const p of Object.values(POTIONS)) I.drawPotion(ctx, p.id, 30, 30, sz);
  for (const t of ['fight', 'elite', 'event', 'shop', 'forge', 'rest', 'boss']) for (const st of ['available', 'visited', 'locked', 'current']) I.drawNodeIcon(ctx, t, 30, 30, sz, st);
  I.drawNeedle(ctx, 30, 30, sz); I.drawScissors(ctx, 30, 30, sz); I.drawKnot(ctx, 30, 30, sz, '#B3263A'); I.drawLooseThread(ctx, 30, 30, sz); I.drawClasp(ctx, 30, 30, sz);
  I.drawEnergyOrb(ctx, 30, 30, sz * 2, 2, 3); I.drawHeart(ctx, 30, 30, sz); I.drawShield(ctx, 30, 30, sz, 7); I.drawCoin(ctx, 30, 30, sz);
}
for (const id of NEW_ST) ok(I.STATUS_IDS_DRAWN.includes(id), 'dedicated glyph for ' + id);
for (const k of ['ember', 'echo', 'hoard', 'blood', 'rust', 'static', 'gilded']) ok(/^#[0-9A-F]{6}$/.test(I.SCHOOL_GLYPH_COLORS[k]), 'school colour ' + k);
ok(I.SCHOOL_GLYPH_COLORS.ember === '#E8571F' && I.SCHOOL_GLYPH_COLORS.gilded === '#EFD98F', 'school colours mirror the bible');
for (const f of ['drawNeedle', 'drawScissors', 'drawKnot', 'drawLooseThread', 'drawClasp']) ok(typeof I[f] === 'function', f + ' exported');
ok(glyphs.size >= 49, 'relic glyphs distinct enough: ' + glyphs.size);
console.log('graftwork_art_icons ok', n);

// ---- R1: engraved forge / reward / event icons, event plates, vellum
{
  const P = await import('../graftwork/art/plates.js');
  const { EVENTS } = await import('../graftwork/data/index.js');
  for (const id of I.FORGE_ICON_IDS) for (const sz of [48, 104, 128]) { I.drawForgeIcon(ctx, id, 50, 50, sz); I.drawForgeIcon(ctx, id, 50, 50, sz, { t: 2.3, k: 1, quality: 'low' }); I.drawForgeIcon(ctx, id, 50, 50, sz, { t: 2.3, k: 1, reduced: true }); }
  I.drawForgeIcon(ctx, 'nonsense', 50, 50, 64);
  ok(I.FORGE_ICON_IDS.length === 6 && I.FORGE_ICON_IDS.every((k) => /^#[0-9A-F]{6}$/i.test(I.FORGE_ICON_SPOT[k])), 'one spot colour per forge icon');
  for (const k of I.REWARD_KINDS) for (const sz of [32, 56]) { I.drawRewardIcon(ctx, k, 40, 40, sz, { id: k === 'relic' ? Object.keys(RELICS)[0] : Object.keys(POTIONS)[0] }); }
  ok(['gold', 'relic', 'potion', 'card', 'graft'].every((k) => I.REWARD_KINDS.includes(k)), 'reward kinds');
  for (const st of ['take', 'taken', 'full']) for (const hv of [false, true]) I.drawRewardChip(ctx, 10, 10, 130, 40, st, hv);
  for (const okk of [true, false]) I.drawEventSeal(ctx, 20, 20, 12, okk, okk);
  ok(P.EVENT_MOTIFS.length >= 12, 'at least 12 event motifs: ' + P.EVENT_MOTIFS.length);
  const used = new Set(); let generic = 0;
  for (const ev of Object.values(EVENTS)) { const m = P.eventMotif(ev.id); if (m === 'generic') generic++; else used.add(m); P.drawEventPlate(ctx, ev.id, ev.act || 1, 36, 40, 520, 560); }
  ok(used.size >= 12 && generic === 0, 'every event has a motif (motifs used ' + used.size + ', generic ' + generic + ')');
  ok(P.eventMotif('e_unknown_future') === 'generic', 'generic fallback');
  for (const act of [1, 2, 3, 9]) P.drawEventPlate(ctx, 'e_unknown_future', act, 0, 0, 260, 280);
  P.drawVellum(ctx, 14, 10, 1252, 700, { r: 14, alpha: 0.9 }); P.drawVellum(ctx, 0, 0, 100, 80); P.drawEmptyMark(ctx, 100, 100);
  console.log('graftwork_art_icons R1 ok');
}

// ---- round 4 backgrounds: every theme with parallax, ambient colours, cost benchmark (fake canvas = call overhead only)
{
  const { fakeCtx: fc } = await import('./graftwork_lib.mjs');
  const Bg = await import('../graftwork/art/backgrounds.js');
  const g = fc();
  for (const th of Bg.BACKGROUND_THEMES) {
    assert.ok(/^#[0-9a-f]{6}$/i.test(Bg.ambient(th)), 'ambient ' + th);
    for (const par of [0, -1, 1, 5]) { const o = { parallax: par }; Bg.drawBackground(g, th, 1.5, o); assert.ok(o.parallax >= -1 && o.parallax <= 1, 'parallax clamped'); }
    const t0 = performance.now(); for (let i = 0; i < 30; i++) Bg.drawBackground(g, th, i / 60, {}); const ms = (performance.now() - t0) / 30;
    assert.ok(ms < 2, th + ' background costs ' + ms.toFixed(2) + ' ms');
  }
  for (const th of ['ward', 'market', 'theatre', 'title', 'table', 'shop', 'forge', 'event', 'win', 'lose']) assert.ok(Bg.BACKGROUND_THEMES.includes(th), 'theme ' + th);
  assert.equal(Bg.BACKGROUND_THEMES.length, 10, 'no theme without a screen: ' + Bg.BACKGROUND_THEMES);
  assert.ok(typeof Bg.keyLamp(1).x === 'number');
  Bg.drawVignette(g, 0.5); Bg.drawLampCone(g, 100, 0);
}
