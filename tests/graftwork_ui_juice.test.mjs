// Juice gate: hit tiers, multi-hit counter, attack timeline, finishing blow, death and victory hand-off, reduced motion, no throws.
import assert from 'node:assert/strict';
import { makeApp, frames, click } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { ENEMIES, HEROES } from '../graftwork/data/index.js';
import { canPlay, needsTarget } from '../graftwork/engine/combat.js';
import { FX_OPTS } from '../graftwork/ui/fx.js';
import { timing } from '../graftwork/art/attacks.js';
import * as J from '../graftwork/ui/juice.js';
import combat from '../graftwork/ui/combat.js';

const DT = 1 / 60;
const errs = [];
const origErr = console.error;
console.error = (...a) => { errs.push(a.map(String).join(' ').slice(0, 200)); };

// ---- 1. tier classification table (relative to the victim's max HP)
{
  const t = (n, mx, hp, v) => J.classify(n, mx, hp, v).tier;
  assert.equal(t(3, 100, 100), 'light');
  assert.equal(t(7, 100, 100), 'light');
  assert.equal(t(8, 100, 100), 'medium');
  assert.equal(t(18, 100, 100), 'medium');
  assert.equal(t(19, 100, 100), 'heavy');
  assert.equal(t(30, 100, 100), 'heavy');
  assert.equal(t(31, 100, 100), 'crit');
  assert.equal(t(10, 100, 100, true), 'crit', 'Vulnerable upgrades a real hit to crit');
  assert.equal(t(3, 100, 100, true), 'light', 'a tiny hit on a Vulnerable target stays light');
  assert.equal(t(20, 100, 10), 'overkill');
  assert.equal(t(11, 100, 10), 'medium', 'one point over is not a flourish');
  assert.equal(t(3, 20, 100), 'medium', 'tiers are relative: 3 damage on a 20 HP victim is 15%');
  assert.equal(t(3, 400, 400), 'light');
  assert.ok(J.TIERS.heavy.stop === 90 && J.TIERS.medium.stop === 45 && J.TIERS.crit.stop === 120 && J.TIERS.overkill.stop === 140 && J.TIERS.light.stop === 0);
  assert.equal(J.classify(20, 100, 10).over, 10);
  assert.deepEqual(J.danger(0.5), { on: false, bpm: 0, lowpass: 0, level: 0 });
  assert.equal(J.danger(0.29).bpm, 60 + Math.round(0.01 / 0.15 * 50)); assert.equal(J.danger(0.1).bpm, 110); assert.equal(J.danger(0.1).lowpass, 800);
  assert.equal(J.comboLevel(19), 0); assert.equal(J.comboLevel(20), 1); assert.equal(J.comboLevel(40), 2); assert.equal(J.comboLevel(80), 3);
}

// ---- 2. multi-hit counter merges within 350 ms and slams on the last hit
{
  const hc = new J.HitCounter(350);
  hc.hit('a', 7, 0); hc.hit('a', 7, 120); const c = hc.hit('a', 7, 240);
  assert.equal(c.count, 3); assert.equal(c.total, 21); assert.equal(hc.list.length, 1);
  assert.ok(Math.abs(c.grow - 1.08) < 1e-9, 'grows 4% per hit');
  const c2 = hc.hit('a', 7, 800); assert.notEqual(c2, c, 'a gap over 350 ms starts a new counter');
  const c3 = hc.hit('b', 5, 810); assert.notEqual(c3, c2, 'other victims count separately');
  for (let i = 0; i < 5; i++) hc.hit('z', 7, 1000 + i * 50, i === 5);
  const z = hc.hit('z', 7, 1250, true);
  assert.equal(J.counterText(z), 'x6 = 42'); assert.ok(z.done);
  hc.update(5000); hc.update(7000); assert.equal(hc.list.length, 0, 'finished counters are collected');
  const tm = { tell: 120, act: 60, hold: 40, rec: 180 };
  assert.equal(J.atkPhase(tm, 10).phase, 'tell'); assert.equal(J.atkPhase(tm, 150).phase, 'act'); assert.equal(J.atkPhase(tm, 190).phase, 'hold'); assert.equal(J.atkPhase(tm, 300).phase, 'rec'); assert.equal(J.atkPhase(tm, 500).phase, 'idle');
  assert.ok(Math.abs(J.atkPhase(tm, 179.9).lunge - 1) < 0.01, 'contact is the peak of the lunge');
}

// ---- fight plumbing
function setup({ hero = 'marrow', seed = 'j', enemies, kind = 'normal', hp, act = 1 }) {
  const run = RUN.newRun({ hero, seed });
  if (act > 1) run.act = act;
  run.phase = 'combat';
  run.pending = { kind: 'combat', fightKind: kind, enemies };
  if (hp) { run.hp = hp; run.maxHp = Math.max(run.maxHp, hp); }
  run.potions = [];
  const routed = [];
  const flow = { RUN, route() { routed.push(run.phase); }, openDeck() {}, openSettings() {} };
  return { run, routed, flow };
}
async function boot(ctx, extra = {}) {
  const app = await makeApp({ run: ctx.run, audio: extra.audio || audio, flow: ctx.flow });
  if (extra.post) app.post = extra.post;
  app.register('combat', combat);
  app.go('combat', { run: ctx.run });
  return app;
}
// plays cards by click; onTick(S, c) runs after every tick
function play(app, ctx, onTick, { maxTicks = 5000, endTurnOnly = false } = {}) {
  let ticks = 0, idle = 0, guard = 0;
  const tick = () => { app.tick(DT); ticks++; if (onTick) onTick(combat.api().state(), combat.api().c); };
  while (ctx.routed.length === 0 && ticks < maxTicks) {
    const a = combat.api();
    if (a.busy || a.ending) { tick(); idle = 0; continue; }
    if (a.pending) {
      idle++; if (idle < 4) { tick(); continue; }
      const st = a.state(); for (const uid of a.pending.pool.slice(0, a.pending.need)) st.pend.add(uid);
      app.pressedKeys.push({ key: 'Enter', preventDefault() {} }); tick(); if (combat.api().pending) { const cf = combat.api().pending.confirm; click(app, cf.x, cf.y); } continue;
    }
    idle++; if (idle < 25) { tick(); continue; }
    const c = a.c; if (c.over) { tick(); continue; }
    let hi = -1;
    if (!endTurnOnly) for (let i = 0; i < c.hand.length; i++) { const ck = canPlay(c, i); if (ck.ok && (hi < 0 || (ck.spec.type === 'attack' && canPlay(c, hi).spec.type !== 'attack'))) hi = i; }
    if (hi < 0 || guard > 60) { guard = 0; click(app, a.endTurn.x, a.endTurn.y); idle = 0; ticks += 2; if (onTick) onTick(a.state(), c); continue; }
    guard++;
    const live = c.enemies.map((e, i) => (e.dead ? -1 : i)).filter((i) => i >= 0);
    const tgt = needsTarget(c, hi) ? live[0] : -1;
    const hp = a.handPos(hi);
    click(app, hp.x, hp.y); ticks += 2;
    if (tgt >= 0) { const ep = a.enemyPos(tgt); click(app, ep.x, ep.y); } else click(app, 520, 200);
    ticks += 2; idle = 0;
  }
  return ticks;
}

// ---- 3. the damage event lands on contact (tell + act) with an attack rig
{
  const ctx = setup({ enemies: ['orderly'], hp: 900 });
  const app = await boot(ctx);
  frames(app, 5);
  const tm = timing('orderly', 'orderly'); assert.ok(tm && tm.act > 0, 'attacks.js provides a timing');
  const want = tm.tell + tm.act;
  let lastHp = null; const hits = [];
  play(app, ctx, (S) => {
    const ed = S.eds[0];
    if (lastHp !== null && S.P.hp < lastHp && ed && ed.atkT >= 0 && ed.atkKind === 'attack') hits.push(ed.atkT * 1000);
    lastHp = S.P.hp;
    if (hits.length >= 2) ctx.routed.push('stop');
  }, { endTurnOnly: true, maxTicks: 3000 });
  assert.ok(hits.length >= 1, 'saw at least one enemy hit land');
  for (const h of hits) assert.ok(Math.abs(h - want) <= 40, `damage at ${h.toFixed(0)} ms, contact is ${want} ms`);
}

// ---- 4. finishing blow only on the last kill
{
  const ctx = setup({ enemies: ['orderly', 'orderly'], hp: 900 });
  const app = await boot(ctx);
  frames(app, 5);
  for (const e of combat.api().c.enemies) { e.hp = 1; e.maxHp = 1; }
  let seenOne = false, seenFinal = false, post = 0;
  const posts = { shockwave() { post++; }, aberration() {} };
  app.post = posts;
  play(app, ctx, (S) => {
    const dy = S.eds.filter((e) => e.dyingOn).length;
    if (dy === 1 && S.eds.length === 2 && !S.finalBlow) seenOne = true;
    if (dy === 1 && S.eds.length === 2) assert.ok(!S.finalBlow, 'first of two kills is not the finishing blow');
    if (dy === 2 && S.finalBlow) seenFinal = true;
  });
  assert.ok(seenFinal, 'the last kill triggers the finishing blow');
  assert.ok(post >= 1, 'shockwave fired on a kill');
  assert.equal(ctx.routed.length, 1);
}

// ---- 5. death hands off exactly once, with a cause, and the heartbeat stops
{
  const beats = [];
  const au = { ...audio, heartbeat(b) { beats.push(b); }, setLowpass() {} };
  const ctx = setup({ enemies: ['the_matron'], kind: 'boss', hp: 3 });
  const before = ctx.run.stats.fights;
  const app = await boot(ctx, { audio: au });
  frames(app, 5);
  let killer = null, endT = 0;
  play(app, ctx, (S) => { if (S.killer) killer = S.killer.text; if (S.ending) endT = Math.max(endT, S.ending.t); });
  assert.equal(ctx.routed.length, 1, 'routed once');
  frames(app, 240);
  assert.equal(ctx.routed.length, 1, 'still once after extra frames');
  assert.equal(ctx.run.stats.fights, before + 1, 'resolveFight applied once');
  assert.equal(ctx.run.phase, 'dead');
  assert.ok(killer && /^Killed by /.test(killer), 'cause of death: ' + killer);
  assert.ok(endT >= 2.7, 'death lasts 2.8 s of ending time, was ' + endT);
  assert.equal(beats[beats.length - 1], 0, 'heartbeat stops');
}

// ---- 6. victory hands off exactly once; reduced motion produces no hit-stop, shake, zoom or slow-mo; effects work otherwise
async function reducedRun(reduced, shake = true) {
  FX_OPTS.reduced = reduced; FX_OPTS.shake = shake;
  const ctx = setup({ seed: 'rm' + reduced, enemies: ['orderly', 'iron_lung'], hp: 900 });
  const before = ctx.run.stats.fights;
  const app = await boot(ctx);
  frames(app, 5);
  for (const e of combat.api().c.enemies) { e.hp = Math.min(e.hp, 30); e.maxHp = Math.min(e.maxHp, 30); }
  const m = { stop: 0, shake: 0, zoom: 1, slow: 0 };
  play(app, ctx, (S) => { m.stop = Math.max(m.stop, S.fx.stop); m.shake = Math.max(m.shake, S.shk.amp, S.fx.trauma || 0); m.zoom = Math.max(m.zoom, S.zp.z); m.slow = Math.max(m.slow, S.fx.slow); });
  frames(app, 200);
  assert.equal(ctx.routed.length, 1, 'victory/defeat routed once');
  assert.equal(ctx.run.stats.fights, before + 1);
  FX_OPTS.reduced = false;
  return m;
}
{
  const calm = await reducedRun(true);
  assert.equal(calm.stop, 0, 'no hit-stop in reduced motion'); assert.equal(calm.shake, 0, 'no shake'); assert.equal(calm.zoom, 1, 'no zoom'); assert.equal(calm.slow, 0, 'no slow-mo');
  const full = await reducedRun(false);
  assert.ok(full.stop > 0 && full.shake > 0 && full.zoom > 1 && full.slow > 0, 'effects exist when motion is on: ' + JSON.stringify(full));
  const noShake = await reducedRun(false, false);
  assert.equal(noShake.shake, 0, 'screen shake setting off');
  FX_OPTS.shake = true;
}

// ---- 7. every enemy id in a full headless fight: no throws (handle() swallows errors, so console.error is watched too)
{
  let n = 0;
  for (const id of Object.keys(ENEMIES)) {
    const d = ENEMIES[id];
    const kind = d.kind === 'boss' ? (d.final ? 'final' : 'boss') : d.kind === 'elite' ? 'elite' : 'normal';
    const heroes = Object.keys(HEROES);
    const ctx = setup({ seed: 'j' + id, hero: heroes[n++ % heroes.length], enemies: [id], kind, act: d.act || 1, hp: 900 });
    const app = await boot(ctx, { post: { shockwave() {}, aberration() {}, flash() {}, vignette() {}, setGrade() {} } });
    frames(app, 3);
    for (const e of combat.api().c.enemies) { e.hp = Math.min(e.hp, 12); e.maxHp = Math.min(e.maxHp, 12); }
    play(app, ctx, null, { maxTicks: 3000 });
    assert.equal(ctx.routed.length, 1, 'fight did not finish: ' + id);
  }
  assert.deepEqual(errs, [], 'console.error during fights: ' + errs.slice(0, 3).join(' | '));
}
console.error = origErr;
console.log('graftwork_ui_juice: ok');
