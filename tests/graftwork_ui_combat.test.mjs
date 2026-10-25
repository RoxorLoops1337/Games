// Headless gate for the combat screen: plays whole fights by simulated clicks and key presses through app.tick.
import assert from 'node:assert/strict';
import { makeApp, frames, click, key } from './graftwork_lib.mjs';
import * as RUN from '../graftwork/engine/run.js';
import * as audio from '../graftwork/ui/audio.js';
import { ENEMIES, HEROES, POTIONS } from '../graftwork/data/index.js';
import { canPlay, needsTarget } from '../graftwork/engine/combat.js';
import combat from '../graftwork/ui/combat.js';

const DT = 1 / 60;
const MAX_TICKS = 4000;

function setup({ hero = 'marrow', seed = 't', enemies, kind = 'normal', hp, potions = [], act = 1 }) {
  const run = RUN.newRun({ hero, seed });
  if (act > 1) { run.act = act; }
  run.phase = 'combat';
  run.pending = { kind: 'combat', fightKind: kind, enemies };
  if (hp) { run.hp = hp; run.maxHp = Math.max(run.maxHp, hp); }
  run.potions = potions.slice();
  const routed = [];
  const flow = { RUN, route() { routed.push(run.phase); }, openDeck() { flow.deck = (flow.deck || 0) + 1; }, openSettings() { flow.settings = (flow.settings || 0) + 1; } };
  return { run, routed, flow };
}
async function boot(ctx) {
  const app = await makeApp({ run: ctx.run, audio, flow: ctx.flow });
  app.register('combat', combat);
  app.go('combat', { run: ctx.run });
  return app;
}
function drag(app, from, to) {
  app.mouse.x = from.x; app.mouse.y = from.y; app.mouse.pressed = true; app.mouse.down = true; app.mouse.button = 0; app.tick(DT);
  for (let i = 1; i <= 4; i++) { app.mouse.x = from.x + (to.x - from.x) * i / 4; app.mouse.y = from.y + (to.y - from.y) * i / 4; app.tick(DT); }
  app.mouse.released = true; app.mouse.down = false; app.tick(DT);
}

// The bot: waits for the screen to settle, then plays a card by click, key press or drag, uses potions, answers pending
// choices, and ends the turn. Returns when flow.route() has fired or the tick budget is spent.
function playFight(app, ctx, style) {
  let ticks = 0, idle = 0, plays = 0, guard = 0;
  while (ctx.routed.length === 0 && ticks < MAX_TICKS) {
    const a = combat.api();
    if (a.busy && !a.ending) { if (!a.state().skip) key(app, ' '); else app.tick(DT); ticks++; idle = 0; continue; }
    if (a.ending) { app.tick(DT); ticks++; if (ticks % 40 === 0) click(app, 640, 300); continue; }
    if (a.pending) {
      idle++; if (idle < 4) { app.tick(DT); ticks++; continue; }
      const st = a.state();
      const need = a.pending.need;
      for (const uid of a.pending.pool.slice(0, need)) st.pend.add(uid);
      key(app, 'Enter'); app.tick(DT); ticks += 2; // keyboard confirm
      if (combat.api().pending) { /* fall back to the confirm button */ const cf = combat.api().pending.confirm; click(app, cf.x, cf.y); ticks += 2; }
      continue;
    }
    idle++;
    if (idle < 25) { app.tick(DT); ticks++; continue; } // let the fan settle
    const c = a.c;
    if (c.over) { app.tick(DT); ticks++; continue; }
    // potion first, in some styles
    if (style !== 'keys' && c.run.potions.length && plays % 3 === 1) {
      const p = POTIONS[c.run.potions[0]];
      click(app, 372 + 19, 28); ticks += 2;
      if (combat.api().state().potSel !== null && combat.api().state().potSel !== undefined) { const live = c.enemies.findIndex((e) => !e.dead); const ep = combat.api().enemyPos(live); click(app, ep.x, ep.y); ticks += 2; }
      plays++; idle = 0; continue;
    }
    let hi = -1;
    for (let i = 0; i < c.hand.length; i++) { if (canPlay(c, i).ok) { hi = i; break; } }
    if (hi < 0 || guard > 60) { guard = 0; click(app, a.endTurn.x, a.endTurn.y); ticks += 2; idle = 0; continue; }
    guard++;
    const live = c.enemies.map((e, i) => (e.dead ? -1 : i)).filter((i) => i >= 0);
    const prefer = live.find((i) => !c.enemies[i].minion) ?? live[0];
    const tgt = needsTarget(c, hi) ? prefer : -1;
    const hp = a.handPos(hi);
    if (style === 'keys') {
      key(app, String(((hi + 1) % 10)));
      if (tgt >= 0) { for (let k = 0; k < live.indexOf(tgt); k++) key(app, 'Tab'); }
      key(app, 'Enter'); ticks += 3;
    } else if (style === 'drag') {
      if (tgt >= 0) { const ep = a.enemyPos(tgt); drag(app, hp, ep); } else drag(app, hp, { x: 600, y: 240 });
      ticks += 6;
    } else {
      click(app, hp.x, hp.y); ticks += 2;
      if (tgt >= 0) { const ep = a.enemyPos(tgt); click(app, ep.x, ep.y); } else click(app, 520, 200);
      ticks += 2;
    }
    plays++; idle = 0;
  }
  return ticks;
}

async function fight(opts, style = 'clicks') {
  const ctx = setup(opts);
  const app = await boot(ctx);
  frames(app, 5);
  const before = ctx.run.stats.fights;
  const ticks = playFight(app, ctx, style);
  if (!ctx.routed.length) { const a = combat.api(); console.log('STUCK', a.busy, a.canAct, a.ending, a.queueLen, !!a.c.pending, a.c.turn, a.c.hand.length, a.c.energy, a.c.enemies.map((e) => e.id + ':' + e.hp + (e.dead ? 'x' : ''))); }
  assert.ok(ctx.routed.length > 0, `fight did not finish in ${MAX_TICKS} ticks: ${opts.enemies.join(',')} (${style})`);
  assert.notEqual(ctx.run.phase, 'combat', 'run did not leave combat');
  assert.equal(ctx.run.stats.fights, before + 1, 'resolveFight was not applied exactly once');
  assert.equal(combat.api().queueLen, 0, 'event queue did not drain');
  return { ticks, phase: ctx.run.phase, ctx };
}

// ---- 1. every hero, several encounters, three input styles
let total = 0;
const heroes = Object.keys(HEROES);
const styles = ['clicks', 'keys', 'drag'];
let si = 0;
for (const hero of heroes) {
  for (const enemies of [['bedpan_slime'], ['bedpan_slime', 'orderly', 'iron_lung'], ['orderly', 'orderly']]) {
    const r = await fight({ hero, seed: 'a' + si, enemies, hp: 400 }, styles[si++ % 3]);
    assert.ok(['reward', 'dead', 'map', 'won', 'graft'].includes(r.phase), 'unexpected phase ' + r.phase);
    total += r.ticks;
  }
}

// ---- 2. every enemy id across acts, alone (bosses and elites included), with potions in the belt
const ids = Object.keys(ENEMIES);
let k = 0;
for (const id of ids) {
  const d = ENEMIES[id];
  const kind = d.kind === 'boss' ? (d.final ? 'final' : 'boss') : d.kind === 'elite' ? 'elite' : 'normal';
  const r = await fight({ hero: heroes[k % heroes.length], seed: 'e' + id, enemies: [id], kind, act: d.act || 1, hp: 900, potions: ['p_firebomb', 'p_sting', 'p_tonic'] }, styles[k++ % 3]);
  total += r.ticks;
}

// ---- 3. six enemies at once, and a death
{
  const r = await fight({ seed: 'six', enemies: Array(6).fill('bedpan_slime'), hp: 900 }, 'clicks');
  assert.ok(r.ticks > 0);
  const d = await fight({ seed: 'die', enemies: ['the_matron'], kind: 'boss', hp: 3 }, 'clicks');
  assert.equal(d.phase, 'dead', 'a 3 HP hero must lose to the boss');
}

// ---- 4. layout robustness: hand sizes 0..10, enemy counts 1..6, selection, hover, piles modal, deck/settings buttons
{
  for (let n = 1; n <= 6; n++) {
    const ctx = setup({ seed: 'lay' + n, enemies: Array(n).fill('orderly'), hp: 500 });
    const app = await boot(ctx);
    frames(app, 200);
    const st = combat.api().state();
    for (let h = 0; h <= 10; h++) {
      const c = st.c;
      const pool = [...c.hand, ...c.drawPile, ...c.discard];
      c.hand.length = 0; c.drawPile.length = 0; c.discard.length = 0;
      for (let i = 0; i < pool.length; i++) (i < h ? c.hand : c.discard).push(pool[i]);
      st.idleSynced = false;
      frames(app, 40);
      assert.equal(st.hand.length, c.hand.length, `display hand matches engine (${h} cards, ${n} enemies)`);
      if (h) { const a = combat.api(); const p = a.handPos(h - 1); app.mouse.x = p.x; app.mouse.y = p.y; frames(app, 5); }
    }
    app.mouse.x = -999; app.mouse.y = -999;
  }
  const ctx = setup({ seed: 'ui', enemies: ['orderly', 'iron_lung'], hp: 500 });
  const app = await boot(ctx);
  frames(app, 200);
  click(app, 1106, 28); assert.equal(ctx.flow.deck, 1, 'deck button opens the deck');
  click(app, 1198, 28); assert.equal(ctx.flow.settings, 1, 'gear opens settings');
  key(app, 'q'); frames(app, 5); assert.ok(combat.api().modal, 'Q opens the piles'); app.mouse.wheel = 200; frames(app, 5);
  key(app, 'Escape'); frames(app, 3); assert.ok(!combat.api().modal, 'Esc closes the piles');
  click(app, 64, 642); assert.ok(combat.api().modal, 'clicking the draw pile opens it'); key(app, 'Escape'); frames(app, 3);
  // select, cancel with Esc and with right click
  const a = combat.api(); const p = a.handPos(0);
  click(app, p.x, p.y); assert.ok(combat.api().sel, 'click selects a card'); key(app, 'Escape'); assert.ok(!combat.api().sel, 'Esc cancels');
  click(app, p.x, p.y); assert.ok(combat.api().sel);
  app.mouse.x = 640; app.mouse.y = 250; app.mouse.pressed = true; app.mouse.button = 2; app.tick(DT); app.mouse.pressed = false; app.mouse.button = 0; frames(app, 2);
  assert.ok(!combat.api().sel, 'right click cancels');
  // an unaffordable card shakes and does not play
  const st = combat.api().state(); st.c.energy = 0; st.energy = 0;
  const plays0 = st.c.playsTurn;
  const costly = st.c.hand.findIndex((_, i) => !canPlay(st.c, i).ok);
  if (costly >= 0) { const q = combat.api().handPos(costly); click(app, q.x, q.y); click(app, q.x, q.y); assert.equal(st.c.playsTurn, plays0, 'unplayable card was not played'); }
}

assert.ok(total > 0);
console.log('graftwork ui combat ok, ticks', total, 'fights', ids.length + heroes.length * 3 + 2);
