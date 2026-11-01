// Draws every status, relic, potion, node state, intent, HUD piece and background theme with the fake canvas: nothing may throw.
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
for (const t of ['fight', 'elite', 'event', 'shop', 'forge', 'boss', 'final', 'zzz']) for (const s of ['available', 'visited', 'locked', 'current']) I.drawNodeIcon(ctx, t, 40, 40, 40, s);
I.drawEnergyOrb(ctx, 40, 40, 60, 3, 3); I.drawEnergyOrb(ctx, 40, 40, 60, 0);
I.drawCoin(ctx, 1, 1, 20); I.drawHeart(ctx, 1, 1, 20); I.drawShield(ctx, 1, 1, 40, 5); I.drawShield(ctx, 1, 1, 40);
I.drawBudgetGauge(ctx, 10, 10, 400, 4, 6, 0); I.drawBudgetGauge(ctx, 10, 10, 400, 8, 6, 2); I.drawBudgetGauge(ctx, 10, 10, 400, 0, 6, 3);
I.drawStrainMeter(ctx, 10, 10, 200, 2, 6); I.drawDeckIcon(ctx, 1, 1, 40);
for (const k of ['draw', 'discard', 'exhaust']) I.drawPileIcon(ctx, 1, 1, 40, k);
I.drawMapPath(ctx, 0, 0, 100, 100, 'available', 1); I.drawMapPath(ctx, 0, 0, 100, 100, 'visited'); I.drawMapPath(ctx, 0, 0, 100, 100, 'locked');
for (const th of [...B.BACKGROUND_THEMES, 'nonsense']) for (const t of [0, 1.7, 40]) B.drawBackground(ctx, th, t, { dim: 0.2 });
B.drawBackground(ctx, 'ward', 1); B.drawVignette(ctx, 0.5); B.drawLampCone(ctx, 10, 10);
ok(glyphs.size >= 49, 'relic glyphs distinct enough: ' + glyphs.size);
console.log('graftwork_art_icons ok', n);
