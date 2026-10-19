// World, icons, crates: every function for every id and state, on the recording mock context.
import assert from 'node:assert/strict';
import { makeCtx } from './midnight_mog_mockctx.mjs';
import * as W from '../midnight_mog/js/render/world.js';
import * as I from '../midnight_mog/js/render/icons.js';
import { DISTRICTS } from '../midnight_mog/js/data/districts.js';
import { RELICS } from '../midnight_mog/js/data/relics.js';
import { BUILDINGS } from '../midnight_mog/js/data/buildings.js';
import { CRATES } from '../midnight_mog/js/data/crates.js';

const t0 = Date.now();
// layouts
for (const [w, h] of [[390, 800], [360, 640], [1280, 800], [1920, 1080], [800, 390]]) {
  for (const mode of ['battle', 'town']) {
    const L = W.layoutFor(w, h, mode);
    assert.ok(L.field.w > 0 && L.field.h > 0 && L.tileW > 0 && L.tileH > 0, 'field ' + w + 'x' + h);
    assert.ok(L.field.x >= -0.5 && L.field.x + L.field.w <= w + 0.5, 'field fits width ' + w);
    assert.ok(L.field.y + L.field.h <= L.handRect.y + 0.5, 'field above hand');
    assert.ok(L.field.y >= L.topBar.y + L.topBar.h - 0.5, 'field below top bar');
    const a = L.tile(1, 0), b = L.tile(8, 4);
    assert.ok(b.x > a.x && b.y > a.y && a.w === L.tileW);
    assert.equal(L.tile(1, 0), L.tile(1, 0));
    assert.deepEqual(L.toTile(a.cx, a.cy), { col: 1, lane: 0 });
    assert.ok(L.colX(0) < L.colX(1) && L.colX(9.5) > L.colX(8) && L.laneY(4) > L.laneY(0));
    assert.ok(L.baseRect.w > 0 && L.safe && L.bottomBar.h > 0 && L.town.plot(7, 8).w > 0);
  }
}
// worlds
const view = (id, hp) => ({ districtId: id, battle: { base: { hp, maxHp: 100 }, units: [{ kind: 'barricade', x: 3, y: 2, hp: 3, maxHp: 10, life: 3 }, { kind: 'cat', x: 1, y: 1 }], fx: { traps: [{ x: 4, y: 1, radius: 1, charges: 2, uid: 3 }] } }, hoverTile: { col: 3, lane: 2 }, placeable: [[1, 0], [2, 1]], ghost: { col: 2, lane: 1, kind: 'trap', radius: 1.2, valid: false }, baseFlash: 0.5 });
for (const [w, h] of [[390, 800], [1280, 800]]) {
  const L = W.layoutFor(w, h);
  for (const d of DISTRICTS) {
    for (const hp of [100, 60, 40, 10]) {
      const ctx = makeCtx(w, h);
      W.drawWorld(ctx, L, view(d.id, hp), 1.7);
      W.drawWorldFront(ctx, L, view(d.id, hp), 2.2);
      ctx.assertClean();
    }
    for (const pl of [true, (c, l) => c === l, [3, 5, 9], null]) { const ctx = makeCtx(w, h); W.drawWorld(ctx, L, { districtId: d.id, battle: null, placeable: pl, hoverTile: { col: 9, lane: 9 } }, 0); ctx.assertClean(); }
    const ctx = makeCtx(w, h);
    W.drawSkyline(ctx, w, h, 3, d.id); W.drawTownBackdrop(ctx, w, h, 4, { districtId: d.id });
    ctx.assertClean();
  }
}
{ const ctx = makeCtx(); W.drawWorld(ctx, W.layoutFor(390, 800), {}, NaN); W.drawWorld(ctx, W.layoutFor(390, 800), { districtId: 'nope' }, 1); ctx.assertClean(); }
{ // plots, traps, barricades
  const L = W.layoutFor(390, 800, 'town'); const ctx = makeCtx();
  for (let i = 0; i < 12; i++) W.drawPlot(ctx, L.town.plot(i, 12), { b: BUILDINGS[i % BUILDINGS.length].id, level: i * 9, selected: i === 2, hover: i === 3, ready: i === 4, locked: i === 5 }, 1);
  W.drawPlot(ctx, L.town.plot(0, 1), {}, 1); W.drawPlot(ctx, L.town.plot(1, 1), { locked: true }, 1);
  const B = W.layoutFor(390, 800);
  W.drawTrap(ctx, B, { x: 3, y: 1, radius: 1, charges: 9, side: 'enemy' }, 1); W.drawBarricade(ctx, B, { x: 2, y: 2, hp: 1, maxHp: 10, life: 2 }, 1); W.drawBarricade(ctx, B, { x: 2, y: 2, hp: 10 }, 1);
  W.drawPlacementGhost(ctx, B, { col: 3, lane: 2, kind: 'cat', valid: true }, 1);
  ctx.assertClean();
}
// icons
{
  const ctx = makeCtx();
  for (const c of I.CURRENCY_IDS) for (const s of [10, 24, 64]) I.drawCurrency(ctx, c, 50, 50, s, 1.3);
  assert.equal(I.RELIC_IDS.length, RELICS.length); assert.equal(RELICS.length, 27);
  for (const r of RELICS) for (const s of [24, 80]) I.drawRelic(ctx, r.id, 50, 50, s, 2.2);
  I.drawRelic(ctx, 'not_a_relic', 50, 50, 40, 1);
  assert.equal(I.BUILDING_IDS.length, BUILDINGS.length); assert.equal(BUILDINGS.length, 16);
  for (const b of BUILDINGS) for (const l of [0, 1, 5, 6, 11, 16, 21, 45, 80, 120, 500]) I.drawBuilding(ctx, b.id, l, 50, 50, 70, 2.1);
  I.drawBuilding(ctx, 'unknown_b', 3, 50, 50, 60, 1);
  assert.equal(CRATES.length, 5);
  for (const c of CRATES) for (const o of [0, 0.05, 0.3, 0.6, 1]) { I.drawCrate(ctx, c.id, 50, 50, 90, { open: o, t: 1.3, shake: 0.5 }); I.drawCrate(ctx, c.id, 50, 50, 90, { open: o, t: 2, glow: 'mythic' }); I.drawCrate(ctx, c.id, 50, 50, 90, { open: o, t: 2, glow: 0.4 }); }
  I.drawCrate(ctx, 'alley_crate', 50, 50, 90); I.drawCrate(ctx, 'zzz', 50, 50, 90, { open: NaN, t: NaN });
  for (const s of I.STATUS_IDS.concat(['fire', 'unknown_status', 'stun'])) I.drawStatusIcon(ctx, s, 20, 20, 16);
  for (const r of I.ROLE_IDS) I.drawRoleIcon(ctx, r, 20, 20, 24);
  I.drawRoleIcon(ctx, 'nope', 20, 20, 24);
  ctx.assertClean();
}
const ms = Date.now() - t0;
assert.ok(ms < 10000, 'under 10s: ' + ms);
console.log('midnight_mog world ok (' + ms + 'ms)');
