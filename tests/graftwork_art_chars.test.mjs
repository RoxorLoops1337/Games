// Character art: every enemy and hero draws in every state without throwing (fake canvas).
import assert from 'node:assert/strict';
import { fakeCtx, installDom } from './graftwork_lib.mjs';
globalThis.__GW_ART_THROW = 1;
installDom();
const { ENEMY_LIST } = await import('../graftwork/data/index.js');
const { drawEnemy, enemyBounds } = await import('../graftwork/art/enemies.js');
const { drawHero, drawPortrait } = await import('../graftwork/art/heroes.js');
const ctx = fakeCtx();
const st = { burn: 9, bleed: 2, stun: 1, hidden: 1, vulnerable: 1, marked: 1, regen: 1, charge: 1, strength: 3, strings: 1, countdown: 2, baton: 2, applause: 2 };
const states = [{ t: 0 }, { t: 1.7, hurt: 1 }, { t: 2, attack: 1 }, { t: 2, attack: -1, flip: true }, { t: 3, st }, { t: 3, flip: true, scale: 0.8, st: { hidden: 1 } }];
for (const d of [0.1, 0.4, 0.7, 1]) states.push({ t: 1, dying: d });
let n = 0;
for (const e of ENEMY_LIST) {
  const b = enemyBounds(e);
  assert.ok(b.w > 0 && b.h > 0, e.id + ' bounds');
  for (const o of states) { drawEnemy(ctx, e, 300, 400, o); n++; }
}
drawEnemy(ctx, { id: 'weird', art: { body: 'nope', color: '#abc' } }, 10, 10, {});
drawEnemy(ctx, { id: 'bare' }, 10, 10, { dying: 0.5 });
assert.ok(enemyBounds({ id: 'bare' }).w > 0);
for (const h of ['marrow', 'wick', 'odile', 'unknown']) {
  for (const o of [{ t: 0 }, { t: 1, hurt: 1 }, { t: 1, attack: 1 }, { t: 1, attack: -1 }, { t: 1, dying: 0.3 }, { t: 1, dying: 1, flip: true }]) drawHero(ctx, h, 200, 400, o);
  drawPortrait(ctx, h, 100, 100, 160);
}
console.log('graftwork art chars ok', ENEMY_LIST.length, 'enemies', n, 'draws');
