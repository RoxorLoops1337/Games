// Motion budgets (design/JUICE.md): card choreography, attack timelines, easing curves, and that the damage event lands on card contact.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
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
// 5. melee reach: melee bodies close on the hero, ranged ones stay put; profile 0 at tell, rises through act, 1 on hold, eases back
{
  assert.ok(J.isMelee(ENEMIES.bedpan_slime), 'slime leaps at the hero');
  assert.ok(J.isMelee(ENEMIES.orderly));
  assert.ok(!J.isMelee(ENEMIES.leech_jar), 'ranged beam stays put');
  const tm = { tell: 100, act: 100, hold: 50, rec: 100 };
  assert.equal(J.reachK(tm, 50), 0); assert.equal(J.reachK(tm, 220), 1); assert.equal(J.reachK(tm, 400), 0);
  let prev = -1; for (let ms = 100; ms <= 200; ms += 10) { const k = J.reachK(tm, ms); assert.ok(k >= prev); prev = k; }
  assert.ok(J.reachK(tm, 199) > 0.95, 'contact frame is at full reach');
}
// 6. live fight: first enemy action within 250 ms of End Turn; hit flash fades inside 150 ms; reduced motion runs clean
for (const reduced of [false, true]) {
  const { FX_OPTS } = await import('../graftwork/ui/fx.js'); FX_OPTS.reduced = reduced;
  const run = RUN.newRun({ hero: 'marrow', seed: 'mo2' }); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['bedpan_slime'] }; run.hp = 900; run.maxHp = 900; run.potions = [];
  const app = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} } });
  app.register('combat', combat); app.go('combat', { run }); frames(app, 120);
  const key = () => { app.pressedKeys.push({ key: 'e', preventDefault() {} }); };
  key(); frames(app, 30); key();
  const S = combat.api().state(); let ms = 0, tAct = -1;
  for (let i = 0; i < 120 && tAct < 0; i++) { app.tick(1 / 60); ms += 1000 / 60; if (S.eds[0].atkT >= 0) tAct = ms; }
  assert.ok(tAct > 0 && tAct <= 250, `first enemy action ${tAct.toFixed(0)} ms after End Turn (reduced=${reduced})`);
  frames(app, 120);
  FX_OPTS.reduced = false;
}
// 7. hit flash: a medium hit's white fades within ~60 ms (JUICE.md), not the old 125 ms, and a hit-stop never stretches it past stop + 100 ms
{
  const run = RUN.newRun({ hero: 'marrow', seed: 'mo' }); run.phase = 'combat'; run.pending = { kind: 'combat', fightKind: 'normal', enemies: ['orderly'] }; run.hp = 900; run.maxHp = 900; run.potions = [];
  const app = await makeApp({ run, audio, flow: { RUN, route() {}, openDeck() {}, openSettings() {} } });
  app.register('combat', combat); app.go('combat', { run }); frames(app, 120);
  const a = combat.api(); const idx = a.c.hand.findIndex((k) => k.inst.id === 'm_cut');
  if (idx >= 0) {
    const hp = a.handPos(idx), ep = a.enemyPos(0); click(app, hp.x, hp.y); frames(app, 10); click(app, ep.x, ep.y);
    const S = combat.api().state(); let live = 0, peak = 0, seen = false;
    for (let i = 0; i < 90; i++) { app.tick(1 / 60); const h = S.eds[0].hurt; peak = Math.max(peak, h); if (h > 0.05) { seen = true; if (S.fx.stop <= 0) live += 1000 / 60; } }
    assert.ok(seen && peak > 0.2, 'the victim flashes on a hit');
    assert.ok(live <= 70, `hit flash fades over ${live.toFixed(0)} ms outside hit-stop`);
  }
}

// 8. ceremonies: wipe lengths, Temper hammer timeline (continuous, strikes in sync with sounds, no long stillness), graft stitch budget
{
  const T = await import('../graftwork/ui/transitions.js');
  for (const k of ['ink', 'seal', 'thread']) assert.ok(T.WIPE[k] >= 0.35 && T.WIPE[k] <= 0.5, `${k} wipe ${T.WIPE[k]} s is 350 to 500 ms`);
  assert.ok(T.WIPE.fade <= 0.2, 'reduced motion wipe is a short cross-fade');
  const S = T.TEMPER.strikes;
  assert.ok(T.TEMPER.dur <= 2.4, `temper lasts ${T.TEMPER.dur} s`);
  for (let i = 1; i < S.length; i++) assert.ok(S[i] - S[i - 1] >= 0.12 && S[i] - S[i - 1] <= 0.22, 'strike spacing reads as a rhythm');
  assert.ok(T.TEMPER.pop - S[2] <= 0.25 && T.TEMPER.pop > S[2], 'rivets pop right after the last strike');
  // hammer: no teleport between frames, comes up between strikes (follow-through), lands (contact pose) on each strike frame
  let prev = T.hammerPose(0), maxDy = 0, maxAng = 0, still = 0, maxStill = 0;
  for (let t = 1 / 60; t < T.TEMPER.dur; t += 1 / 60) { const q = T.hammerPose(t); maxDy = Math.max(maxDy, Math.abs(q.dy - prev.dy)); maxAng = Math.max(maxAng, Math.abs(q.ang - prev.ang)); if (Math.abs(q.dy - prev.dy) < 0.05 && Math.abs(q.ang - prev.ang) < 0.0008) { still += 1 / 60; maxStill = Math.max(maxStill, still); } else still = 0; prev = q; }
  assert.ok(maxDy < 26 && maxAng < 0.4, `hammer jumps ${maxDy.toFixed(1)} px / ${maxAng.toFixed(3)} rad in one frame`);
  assert.ok(maxStill <= 0.2, `hammer still for ${(maxStill * 1000).toFixed(0)} ms`);
  for (const st of S) { const pre = T.hammerPose(st - 0.02), hit = T.hammerPose(st + 0.001), re = T.hammerPose(st + 0.09); assert.ok(hit.dy > pre.dy - 1 && re.dy < hit.dy - 20, 'hammer rebounds after each strike'); }
  // sounds fire on the strike frames (+1 frame), not before
  const log = [], app = { shared: { audio: { sfx: (n) => log.push([n, now]) } } }; let now = 0;
  const a = { t: 0 }; for (let i = 0; i < 160; i++) { now = (i + 1) / 60; T.temperUpdate(app, a, null, 1 / 60); }
  const hits = log.filter((l) => l[0] === 'hitHeavy').map((l) => l[1]); assert.equal(hits.length, 3, 'three hammer sounds');
  hits.forEach((h, i) => assert.ok(h >= S[i] && h - S[i] < 0.04, `strike ${i} sound at ${h.toFixed(3)} vs ${S[i]}`));
  // the graft ceremony: one Overload sound, over by 2.2 s, a clunk sound before the slam
  const graftS = (await import('../graftwork/ui/graft.js')).default, D = await import('../graftwork/data/index.js'), E = await import('../graftwork/engine/cards.js');
  const sfx = []; let routed = -1, t = 0;
  const run = RUN.newRun({ hero: 'marrow', seed: 'gm' }); const c = run.deck[0];
  for (const g of Object.values(D.GRAFTS).filter((g) => g.weight === 1 && E.canGraft(c, g.id)).slice(0, 2)) RUN.applyGraft(run, c.uid, g.id);
  RUN.startGraftPick(run); run.pending.offer.cards[0] = c.uid;
  const gapp = await makeApp({ run, transitions: T, audio: { sfx: (n) => sfx.push([n, t]), setIntensity() {}, audioState() { return {}; } }, flow: { RUN, route() { if (routed < 0) routed = t; }, openDeck() {}, openSettings() {} }, meta: { settings: {}, tips: { graftpick: 1, boonprice: 1, budget: 1, strain: 1, skipping: 1 } } });
  gapp.register('graft', graftS); gapp.go('graft', { run }); frames(gapp, 60);
  const st = graftS.st; st.selCard = c.uid; st.selGraft = st.offer.grafts.find((gid) => E.canGraft(RUN.findInst(run, c.uid), gid)); frames(gapp, 5);
  sfx.length = 0; t = 0; key(gapp, 'Enter');
  for (let i = 0; i < 200 && routed < 0; i++) { t += 1 / 60; gapp.tick(1 / 60); }
  assert.ok(routed > 0 && routed <= 2.2, `overload sewing ends after ${routed} s`);
  assert.equal(sfx.filter((l) => l[0] === 'overload').length, 1, 'the Overload sound fires once');
  const ov = sfx.find((l) => l[0] === 'overload'), cl = sfx.find((l) => l[0] === 'tithe' || l[0] === 'upgrade'), tick1 = sfx.find((l) => l[0] === 'seamExtend');
  assert.ok(tick1 && cl && ov && tick1[1] < cl[1] && cl[1] <= ov[1], 'stitch ticks, then the clunk, then the Overload slam');
  assert.ok(ov[1] >= 0.9 && ov[1] <= 1.3, `Overload sound at ${ov[1].toFixed(2)} s`);
}
console.log('graftwork motion ok');
