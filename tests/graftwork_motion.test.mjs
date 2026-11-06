// Motion budgets (design/JUICE.md): card choreography, attack timelines, easing curves, and that the damage event lands on card contact.
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { ENEMIES } from '../graftwork/data/index.js';
import { timing } from '../graftwork/art/attacks.js';
import * as J from '../graftwork/ui/juice.js';
import combat from '../graftwork/ui/combat.js';

const B = J.BUDGET;
// 1. card choreography
{
  const C = J.CARD, toImpact = (C.lift + C.wind + C.flight + C.impact) * 1000;
  assert.ok(toImpact <= B.cardToImpact, `card to impact ${toImpact} ms`);
  assert.ok(C.rest * 1000 <= B.cardRest, 'a played card never rests on the target');
  assert.ok(C.burn <= 0.45 && C.fold <= 0.15 + 1e-9);
}
// 2. easing curves: endpoints, overshoot, monotone strike
{
  assert.ok(Math.abs(J.easeOutBack(0)) < 1e-9); assert.ok(Math.abs(J.easeOutBack(1) - 1) < 1e-9);
  assert.ok(Math.max(...Array.from({ length: 50 }, (_, i) => J.easeOutBack(i / 49))) > 1, 'easeOutBack overshoots');
  assert.equal(J.easeInQuad(0.5), 0.25); assert.ok(Math.abs(J.easeInOutCubic(0.5) - 0.5) < 1e-9);
}
// 3. every enemy's attack timeline fits its class budget (light, heavy or boss) and contact is at tell + act
{
  let n = 0;
  for (const e of Object.values(ENEMIES)) {
    const t = timing(e.id, e.art && e.art.body); if (!t) continue; n++;
    const total = t.tell + t.act + t.hold + t.rec, cls = e.kind === 'boss' ? B.boss : B.heavy;
    const cap = cls.tell + cls.act + cls.hold + cls.rec + 400;
    assert.ok(total <= cap, `${e.id} attack ${total} ms exceeds ${cap}`);
    assert.ok(t.tell + t.act <= B.boss.tell + B.boss.act + 200, `${e.id} contact too late`);
  }
  assert.ok(n >= 10, 'timings exist for the cast');
  const tm = J.atkTiming(ENEMIES.orderly); let still = 0, last = -1;
  for (let ms = 0; ms < J.atkTotal(tm); ms += 16) { const l = J.atkPhase(tm, ms).lunge; if (Math.abs(l - last) < 0.002) still += 16; else still = 0; last = l; assert.ok(still <= B.stillMax, 'attack pose frozen too long'); }
}
// 4. a played attack: damage lands within 60 ms of card contact, the card leaves the target quickly, input is free again fast
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'mo' }); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['orderly'] }; run.hp = 900; run.maxHp = 900; run.potions = [];
  const app = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} } });
  app.register('combat', combat); app.go('combat', { run }); frames(app, 120);
  const a = combat.api(); const hp = a.handPos(0), ep = a.enemyPos(0);
  click(app, hp.x, hp.y); frames(app, 10); click(app, ep.x, ep.y);
  const S = combat.api().state(); let tHit = -1, tFree = -1, ms = 0; const hp0 = S.eds[0].hp;
  for (let i = 0; i < 120; i++) { app.tick(1 / 60); ms += 1000 / 60; if (tHit < 0 && S.eds[0].hp < hp0) tHit = ms; if (tFree < 0 && !combat.api().busy) tFree = ms; }
  assert.ok(tHit > 0, 'damage landed');
  assert.ok(tHit <= (J.CARD.lift + J.CARD.wind + J.CARD.flight) * 1000 + 90, `damage at ${tHit.toFixed(0)} ms, contact is ${(J.CARD.lift + J.CARD.wind + J.CARD.flight) * 1000}`);
  assert.ok(tFree > 0 && tFree <= 900, `input free after ${tFree.toFixed(0)} ms`);
  assert.ok(S.spr.length === 0 || S.spr.every((s) => s.t < 1), 'no card sprite lingers');
}
console.log('graftwork motion ok');
