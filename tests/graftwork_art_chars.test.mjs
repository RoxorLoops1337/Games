// Character art: every enemy and hero draws in every state without throwing (fake canvas).
import assert from 'node:assert/strict';
import { fakeCtx, installDom, canvasCalls } from './graftwork_lib.mjs';
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
// regression: ui/combat.js passes its own anim object as o.state (fields sq, hold, hit ... are numbers): must not collide with the art springs
for (const e of ENEMY_LIST) for (const hp of [1, 0.5, 0.2, 0]) { const state = { sq: 0.1, sqv: 3, hold: 0, hit: 1, seamLit: 0.4, hem: 'x', jel: 5, brn: 2 }; drawEnemy(ctx, e, 300, 400, { t: 2, hurt: 0.3, state, hpFrac: hp }); drawEnemy(ctx, e, 300, 400, { t: 2.05, state, hpFrac: hp }); }
drawEnemy(ctx, { id: 'weird', art: { body: 'nope', color: '#abc' } }, 10, 10, {});
drawEnemy(ctx, { id: 'bare' }, 10, 10, { dying: 0.5 });
assert.ok(enemyBounds({ id: 'bare' }).w > 0);
for (const h of ['marrow', 'wick', 'odile', 'unknown']) {
  const hs = [{ t: 0 }, { t: 1, hurt: 1 }, { t: 1, attack: 1 }, { t: 1, attack: -1 }, { t: 1, dying: 0.3 }, { t: 1, dying: 1, flip: true }, { t: 2, lowHp: true }, { t: 2, lowHp: 0.5, dying: 0.5 }];
  for (const state of ['idle', 'hurt', 'attack', 'cast', 'victory']) for (const p of [0, 0.2, 0.5, 0.8, 1]) hs.push({ t: 3 + p, state, p });
  for (const d of [0, 0.25, 0.5, 0.75, 0.95, 1]) hs.push({ t: 4, dying: d });
  for (const o of hs) drawHero(ctx, h, 200, 400, o);
  drawPortrait(ctx, h, 100, 100, 160);
}
console.log('graftwork art chars ok', ENEMY_LIST.length, 'enemies', n, 'draws');

// ---- round 4: attack rig, springs, seam pop, new ids, benchmark
const NEW_IDS = ['suture_wasp', 'ward_clerk', 'knitter', 'surge_tick', 'needle_nanny', 'brine_surgeon', 'scissor_nurse', 'ferric_warden', 'tax_collector', 'stage_manager', 'understudys_shadow', 'locksmith'];
const bodies = ['wings', 'tall', 'figure', 'tail', 'lamp', 'jar', 'hunched', 'outline', 'patchwork', 'dome'];
const newDefs = NEW_IDS.map((id, i) => ({ id, name: id, kind: i % 5 === 0 ? 'elite' : 'normal', art: { body: bodies[i % bodies.length], color: '#7a8a6a', notes: 'x' } }));
const stNew = { poison: 4, stitchedup: 6, weightofdebt: 5, burn: 3 };
let n2 = 0;
for (const e of [...ENEMY_LIST, ...newDefs]) {
  const state = {};
  let t = 0;
  for (const hpFrac of [1, 0.5, 0.1]) {
    for (const [phase, kk] of [['tell', 0], ['tell', 1], ['act', 0.5], ['hold', 0.5], ['rec', 1], [null, 0]]) {
      t += 1 / 60;
      drawEnemy(ctx, e, 300 + (phase === 'act' ? 20 : 0), 400, { t, hurt: phase === 'hold' ? 0.8 : 0, atk: phase ? { phase, k: kk } : null, state, hpFrac, st: stNew });
      drawEnemy(ctx, e, 300, 400, { t, flip: true, scale: 0.9, atk: phase ? { phase, k: kk } : undefined, state, hpFrac });
      n2 += 2;
    }
  }
  assert.ok(state.__art.seamPopped, e.id + ' seam popped at <= 50%');
  const AS = state.__art; assert.ok(AS.sq && AS.hem && AS.jel && AS.brn && AS.fl, e.id + ' springs persist in o.state.__art (private namespace)');
  assert.ok(AS.popT > 0, e.id + ' popT advances');
  drawEnemy(ctx, e, 300, 400, { t: 0, state: {} }); drawEnemy(ctx, e, 300, 400, { dying: 0.6, state, hpFrac: 0.2 }); drawEnemy(ctx, e, 300, 400, { t: 1, scale: 1.2, hpFrac: 0.3, atk: { phase: 'nope', k: 2 } });
}
{ // a hit squashes the victim, then the spring settles back
  const e = ENEMY_LIST[0], state = {};
  drawEnemy(ctx, e, 300, 400, { t: 1, hurt: 0, state });
  drawEnemy(ctx, e, 300, 400, { t: 1.016, hurt: 1, state });
  assert.ok(state.__art.sq.x < -0.15, 'hit squash starts near 0.8, got ' + state.__art.sq.x);
  for (let i = 1; i < 90; i++) drawEnemy(ctx, e, 300, 400, { t: 1.016 + i / 60, hurt: 0, state });
  assert.ok(Math.abs(state.__art.sq.x) < 0.02, 'squash springs back');
  const s2 = {}; drawEnemy(ctx, e, 300, 400, { t: 1, hpFrac: 0.9, state: s2 }); assert.ok(!s2.__art.seamPopped, 'no pop above 50%');
  drawEnemy(ctx, e, 300, 400, { t: 1.1, hpFrac: 0.49, state: s2 }); assert.ok(s2.__art.seamPopped, 'pop below 50%');
}
{ // budget: 6 enemies + hero per frame, counted in canvas calls over every fake context (it was "under 3 ms a frame" on the wall clock, which a
  // busy machine fails; the cost in a real browser is measured by tools/graftwork_profile.mjs). Measured: 1925 calls a frame.
  const six = ENEMY_LIST.slice(0, 6), sts = six.map(() => ({}));
  let tt = 0;
  for (let w = 0; w < 30; w++) { tt += 1 / 60; six.forEach((e, i) => drawEnemy(ctx, e, 100 + i * 150, 500, { t: tt, state: sts[i], hpFrac: 0.6, atk: i === 2 ? { phase: 'act', k: 0.5 } : null })); drawHero(ctx, 'marrow', 80, 500, { t: tt }); }
  const c0 = canvasCalls(), N = 120;
  for (let f = 0; f < N; f++) { tt += 1 / 60; six.forEach((e, i) => drawEnemy(ctx, e, 100 + i * 150, 500, { t: tt, state: sts[i], hpFrac: 0.6, atk: i === 2 ? { phase: 'act', k: 0.5 } : null })); drawHero(ctx, 'marrow', 80, 500, { t: tt }); }
  const per = (canvasCalls() - c0) / N;
  console.log('canvas calls per frame (6 enemies + hero, every fake context):', per.toFixed(0));
  assert.ok(per < 2600, 'frame cost ' + per + ' canvas calls');
}
console.log('graftwork art chars round 4 ok', n2, 'draws');
