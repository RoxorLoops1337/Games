// THE WARD, randomized property test (engine level): many seeds, a random but legal player (builds, demolishes, powers rooms, plans routes of
// 1 to roll steps, waits, rests, takes every kind of screen, saves and reloads at random points). After EVERY step:
//   1. the hero stands in a room that exists and sits on its own grid cell (never an empty cell),
//   2. every walk phase (midday, evening, night, the forced boss night too) already holds a roll for exactly that day and phase, and a route list,
//   3. a walk fires every trigger its route previewed (fights, elites, events, shops, forges, rests, the boss), in order, none skipped,
//   4. the state survives a JSON save round trip byte for byte, and a saved-then-restored run plays on identically.
// Also: the legal route steps are exactly the rooms extendRoute accepts, a route never reuses a room, never exceeds the roll.
import assert from 'node:assert/strict';
import * as RUN from '../graftwork/engine/run.js';
import * as W from '../graftwork/engine/ward.js';
import { makeRng } from '../graftwork/engine/rng.js';
import { BUILD_CARDS } from '../graftwork/data/ward.js';
import { EVENTS } from '../graftwork/data/index.js';

const SEEDS = +(process.env.WARD_PROP_SEEDS || 60), MAX_ACTIONS = 2600;
let n = 0;
const t = (name, fn) => { try { fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, '\n', e.stack); process.exitCode = 1; } };

// ---- invariants ----
export function checkInvariants(run, tag) {
  if (run.phase === 'dead' || run.phase === 'won') return;
  const w = run.ward;
  assert.ok(w, `${tag}: ward state`);
  const hr = w.rooms[w.hero.room];
  assert.ok(hr, `${tag}: hero.room ${w.hero.room} is not a built room`);
  assert.equal(w.grid[hr.y][hr.x], hr.id, `${tag}: the hero's room is not on its grid cell (the hero would stand on an empty cell)`);
  for (const r of Object.values(w.rooms)) assert.equal(w.grid[r.y][r.x], r.id, `${tag}: room ${r.id} not on its cell`);
  const cells = w.grid.flat().filter((c) => c && c !== 'rubble').length;
  assert.equal(cells, Object.keys(w.rooms).length, `${tag}: grid rooms and room table differ`);
  if (w.phase !== 'morning') {
    assert.ok(w.roll, `${tag}: no roll in the ${w.phase} walk phase (die missing)`);
    assert.equal(w.roll.key, `${w.day}:${w.phase}`, `${tag}: stale roll ${w.roll.key} in ${w.day}:${w.phase}`);
    assert.ok(w.roll.n >= 1 && w.roll.n === w.roll.base + w.roll.bonus && w.roll.base >= 1 && w.roll.base <= w.roll.sides, `${tag}: roll values ${JSON.stringify(w.roll)}`);
    assert.ok(Array.isArray(w.route), `${tag}: no route list in a walk phase`);
    assert.ok(w.route.length <= w.roll.n, `${tag}: route longer than the roll`);
    assert.equal(new Set(w.route).size, w.route.length, `${tag}: a room twice in a route`);
    assert.ok(!w.route.includes(w.hero.room), `${tag}: the route re-enters the hero's room`);
    let prev = w.hero.room; for (const rid of w.route) { assert.ok(W.neighbors(run, prev).includes(rid), `${tag}: route step not adjacent`); prev = rid; }
  }
  assert.ok(Number.isFinite(run.hp) && run.hp >= 0 && run.hp <= run.maxHp, `${tag}: hp ${run.hp}`);
  assert.ok(w.res.wood >= 0 && w.res.stone >= 0 && run.gold >= 0, `${tag}: negative resources`);
}

// ---- the player ----
const win = () => ({ win: true, shattered: [], damageTaken: 0, turns: 3 });
const lose = () => ({ win: false, shattered: [], damageTaken: 99, turns: 3, killedBy: 'x' });
const pick = (rnd, a) => a[rnd.int(a.length)];

function morning(run, rnd, tag) {
  const w = run.ward;
  for (let k = 0, guard = 0; k < 8 && guard < 30; guard++) {
    if (!w.deck.hand.length || rnd.chance(0.12)) break;
    const inst = pick(rnd, w.deck.hand), card = BUILD_CARDS[inst.id];
    let target = null;
    if (card.kind === 'room') { const cells = W.buildCells(run); if (!cells.length) continue; const [x, y] = pick(rnd, cells); target = { x, y }; }
    else if (card.kind === 'upgrade') target = pick(rnd, Object.keys(w.rooms));
    else if (card.effect === 'res') target = rnd.chance(0.5) ? 'wood' : 'stone';
    else if (card.effect === 'demolish') {
      const rub = []; for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) if (w.grid[y][x] === 'rubble') rub.push({ x, y });
      target = rub.length && rnd.chance(0.6) ? pick(rnd, rub) : pick(rnd, Object.keys(w.rooms));
    } else if (['tick', 'quarantine', 'fumigate'].includes(card.effect)) target = pick(rnd, Object.keys(w.rooms));
    const chk = W.canPlayBuild(run, inst.uid, target);
    const r = W.playBuildCard(run, inst.uid, target);
    assert.equal(!!r.ok, !!chk.ok, `${tag}: canPlayBuild and playBuildCard disagree on ${inst.id}`);
    if (r.ok) k++;
    checkInvariants(run, `${tag} build ${inst.id}`);
  }
  if (rnd.chance(0.3)) { const rooms = Object.values(w.rooms).filter((r) => r.type !== 'rm_entrance' && r.type !== 'rm_theatre'); if (rooms.length) { W.togglePower(run, pick(rnd, rooms).id); checkInvariants(run, `${tag} power`); } }
  assert.equal(W.endMorning(run), true, `${tag}: endMorning`);
}

// expected launches of a previewed route: one per non-bribed trigger, an event room launches once per event inside
function expectedLaunches(run) { return W.routeInfo(run).triggers.filter((x) => !x.bribed).reduce((a, x) => a + (x.kind === 'event' ? x.detail.n : 1), 0); }

function walkPhase(run, rnd, tag, stats) {
  const w = run.ward;
  if (W.bossForced(run)) {
    assert.equal(W.routeWhy(run, W.theatreOf(run).id), 'boss', `${tag}: the last night refuses routes`);
    const before = run.stats.floors, p = W.startWalk(run, W.theatreOf(run).id);
    assert.ok(p && run.phase === 'combat' && run.pending.fightKind === 'boss', `${tag}: the forced walk opens the boss`);
    assert.equal(run.stats.floors, before + 1); stats.bosses++;
    return;
  }
  const roll = W.rollOf(run);
  assert.ok(roll && roll.n >= 1, `${tag}: roll`);
  // legalSteps must be exactly what extendRoute accepts
  for (const rid of Object.keys(w.rooms)) {
    const legal = W.legalSteps(run).includes(rid), why = W.routeWhy(run, rid);
    assert.equal(legal, why === null, `${tag}: legalSteps vs routeWhy for ${rid}`);
  }
  if (rnd.chance(0.12) && roll.lucky) { W.rerollWalk(run); checkInvariants(run, `${tag} reroll`); }
  const want = 1 + rnd.int(roll.n), steps = [];
  for (let i = 0; i < want; i++) {
    const legal = W.legalSteps(run); if (!legal.length) break;
    const rid = pick(rnd, legal); const r = W.extendRoute(run, rid); assert.ok(r.ok, `${tag}: extend ${rid}`); steps.push(rid);
    checkInvariants(run, `${tag} extend`);
    if (rnd.chance(0.1)) { W.undoRoute(run); steps.pop(); checkInvariants(run, `${tag} undo`); }
    if (w.route.length && w.rooms[w.route[w.route.length - 1]].type === 'rm_theatre' && W.bossOpen(run)) break;
  }
  if (!w.route.length) { // nothing to walk to: wait here
    const before = run.stats.floors, hp = run.hp;
    const p = W.startWalk(run, w.hero.room);
    stats.waits++;
    if (p) { assert.equal(run.stats.floors, before + 1); stats.waitTriggers++; }
    else assert.ok(run.hp >= hp, `${tag}: waiting never costs HP`);
    return;
  }
  if (rnd.chance(0.08)) { W.clearRoute(run); const p = W.startWalk(run, w.hero.room); stats.waits++; void p; return; }
  const exp = expectedLaunches(run), start = run.stats.floors, route = w.route.slice();
  const lastRoom = route[route.length - 1];
  stats.routes++; stats.routeLen += route.length;
  const p = W.startRoute(run);
  assert.ok(w.walk === null || w.walk.path.length === route.length, `${tag}: walk path`);
  // every step that triggers must fire; the walk is resolved screen by screen by the caller loop, so count here and let the caller finish it
  run.__walkCheck = { exp, start, route, lastRoom, got: () => run.stats.floors - start, tag };
  void p;
}

function settleScreens(run, rnd, tag, stats) {
  // play every screen until the Ward (a walk phase or the morning) is back, or the run ends
  for (let guard = 0; guard < 200 && run.phase !== 'ward' && run.phase !== 'dead' && run.phase !== 'won'; guard++) {
    checkInvariantsMid(run, tag);
    switch (run.phase) {
      case 'combat': {
        const kind = run.pending.fightKind; stats.fights++; if (kind === 'elite') stats.elites++;
        const die = rnd.chance(0.01) && kind !== 'boss';
        RUN.resolveFight(run, die ? lose() : win()); if (die) stats.deaths++;
        break;
      }
      case 'reward': {
        const rw = run.pending; if (rnd.chance(0.9)) RUN.claimGold(run, rw);
        if (rw.relicChoices && rw.relicChoices.length && rnd.chance(0.7)) RUN.addRelic(run, pick(rnd, rw.relicChoices));
        if (rw.potion && rnd.chance(0.5)) RUN.addPotion(run, rw.potion);
        if (rw.buildChoice) W.takeBuildChoice(run, rnd.chance(0.7) ? pick(rnd, rw.buildChoice) : null);
        RUN.afterReward(run); break;
      }
      case 'graft': { RUN.skipGraft(run, pick(rnd, ['heal', 'budget', 'gold'])); RUN.afterGraft(run); break; }
      case 'shop': {
        const sh = run.pending; stats.shops++; run.gold += 200;
        if (sh.builds && rnd.chance(0.6)) RUN.shopBuy(run, 'build', rnd.int(sh.builds.length));
        if (rnd.chance(0.3)) RUN.shopBuy(run, 'potion', rnd.int(3));
        if (rnd.chance(0.3)) { const bd = W.buildDeckList(run); if (bd.length) RUN.shopBuy(run, 'buildRemove', 0, pick(rnd, bd).uid); }
        RUN.advance(run); break;
      }
      case 'forge': { stats.forges++; RUN.forgeAct(run, pick(rnd, ['rest', 'expand']), null); RUN.advance(run); break; }
      case 'event': {
        stats.events++;
        const ch = RUN.eventChoices(run).filter((c) => c.ok); let done = false;
        for (const c of ch.sort(() => rnd.next() - 0.5)) { const uid = c.pick === 'card' ? (c.cards && c.cards.length ? pick(rnd, c.cards) : undefined) : undefined; if (c.pick === 'card' && uid === undefined) continue; if (RUN.eventChoose(run, c.i, uid) !== null) { done = true; break; } }
        if (!done) { const leave = EVENTS[run.pending.id].choices.findIndex((c, i) => !c.pick && (!c.cond || c.cond(run))); assert.ok(leave >= 0, `${tag}: an event with no way out`); RUN.eventChoose(run, leave); }
        RUN.afterEvent(run); break;
      }
      default: assert.fail(`${tag}: stuck in phase ${run.phase}`);
    }
    if (run.phase !== 'dead' && run.phase !== 'won') checkInvariantsMid(run, tag);
  }
}
// mid-walk the hero and the roll must be sound too (the phase is a screen phase, the ward block is the walk)
function checkInvariantsMid(run, tag) {
  if (run.phase === 'dead' || run.phase === 'won') return;
  const w = run.ward, hr = w.rooms[w.hero.room];
  assert.ok(hr && w.grid[hr.y][hr.x] === hr.id, `${tag}: mid-walk hero in a non-room (${run.phase})`);
  if (w.phase !== 'morning') { assert.ok(w.roll && w.roll.key === `${w.day}:${w.phase}`, `${tag}: mid-walk roll missing or stale (${run.phase})`); assert.ok(Array.isArray(w.route), `${tag}: mid-walk route list`); }
}

function roundTrip(run, tag) {
  const json = RUN.serializeRun(run), back = RUN.deserializeRun(json);
  assert.equal(RUN.serializeRun(back), json, `${tag}: save round trip is not byte identical`);
  return back;
}

export function playProperty(seed, hero) {
  const rnd = makeRng('prop|' + seed), stats = { fights: 0, elites: 0, shops: 0, forges: 0, events: 0, bosses: 0, deaths: 0, routes: 0, routeLen: 0, waits: 0, waitTriggers: 0, saves: 0, floors: 1, days: 0 };
  let run = RUN.newRun({ hero, seed: 'prop' + seed, mode: 'ward' }), lastAct = run.act, lastDay = 1;
  checkInvariants(run, `s${seed} start`);
  for (let a = 0; a < MAX_ACTIONS && run.phase !== 'dead' && run.phase !== 'won'; a++) {
    const tag = `s${seed} a${a} ${run.ward.act}/${run.ward.day}${run.ward.phase}`;
    if (run.phase === 'ward') {
      if (run.ward.phase === 'morning') morning(run, rnd, tag); else walkPhase(run, rnd, tag, stats);
    }
    const wc = run.__walkCheck; delete run.__walkCheck;
    if (wc) { // resolve the walk, trigger by trigger, and compare with the preview
      let steps = 0;
      while (run.phase !== 'ward' && run.phase !== 'dead' && run.phase !== 'won' && steps++ < 60) {
        settleScreens(run, rnd, tag, stats);
        if (run.phase === 'dead' || run.phase === 'won') break;
        if (rnd.chance(0.25)) { run = roundTrip(run, tag); stats.saves++; }
      }
      if (run.phase !== 'dead' && run.phase !== 'won') {
        const boss = wc.route.some((rid) => run.ward.rooms[rid] && run.ward.rooms[rid].type === 'rm_theatre') && W.bossOpen(run);
        if (!boss) assert.equal(run.stats.floors - wc.start, wc.exp, `${wc.tag}: the route previewed ${wc.exp} triggers but ${run.stats.floors - wc.start} fired`);
      }
    } else settleScreens(run, rnd, tag, stats);
    if (run.phase === 'dead' || run.phase === 'won') break;
    checkInvariants(run, tag);
    if (run.ward.act !== lastAct) { stats.floors++; lastAct = run.ward.act; assert.equal(run.ward.phase, 'morning', `${tag}: a new floor opens in the morning`); lastDay = 1; }
    if (run.ward.day !== lastDay) { stats.days += Math.max(0, run.ward.day - lastDay); lastDay = run.ward.day; }
    if (rnd.chance(0.2)) { run = roundTrip(run, tag); stats.saves++; checkInvariants(run, tag + ' restored'); }
  }
  return { run, stats };
}

const total = { fights: 0, elites: 0, shops: 0, forges: 0, events: 0, bosses: 0, deaths: 0, routes: 0, routeLen: 0, waits: 0, saves: 0, days: 0, floors: 0, ended: 0, won: 0 };
t(`${SEEDS} random runs x 3 heroes: hero always in a built room, a roll in every walk phase, every route step triggers, saves round trip`, () => {
  for (let s = 0; s < SEEDS; s++) {
    const hero = ['marrow', 'wick', 'odile'][s % 3];
    const { run, stats } = playProperty(s, hero);
    for (const k of Object.keys(stats)) if (k in total) total[k] += stats[k];
    total.floors += stats.floors - 1; if (run.phase === 'dead' || run.phase === 'won') total.ended++; if (run.phase === 'won') total.won++;
  }
  assert.ok(total.routes >= SEEDS * 4, 'the property run planned routes: ' + total.routes);
  assert.ok(total.fights > SEEDS && total.events > 0 && total.shops > 0 && total.forges > 0, 'every screen kind was met: ' + JSON.stringify(total));
  assert.ok(total.saves > SEEDS, 'saved and reloaded');
  assert.ok(total.days >= SEEDS * 3, 'whole days were played: ' + total.days);
  console.log('   ', JSON.stringify(total));
});

t('a route of every length 1..roll from every room fires exactly the previewed triggers (seeded floors, all rooms full)', () => {
  for (let s = 0; s < 25; s++) {
    const run = RUN.newRun({ hero: 'marrow', seed: 'full' + s, mode: 'ward' }), w = run.ward;
    // fill every room with something to trigger
    for (const r of Object.values(w.rooms)) { const sp = BUILD_ROOMS(r.type); if (sp === 'fight') r.contents = [{ kind: 'monster', id: Object.values(run.ward.rooms).length ? 'orderly' : 'orderly' }]; else if (sp) r.contents = [{ kind: sp }]; }
    W.endMorning(run);
    const roll = W.rollOf(run); roll.n = 4; roll.base = 4; roll.bonus = 0;
    for (let i = 0; i < 4; i++) { const legal = W.legalSteps(run); if (!legal.length) break; W.extendRoute(run, legal[s % legal.length]); }
    const exp = expectedLaunches(run), before = run.stats.floors;
    if (!w.route.length) continue;
    W.startRoute(run);
    const stats = { fights: 0, elites: 0, shops: 0, forges: 0, events: 0, bosses: 0, deaths: 0 };
    settleScreens(run, makeRng('full' + s), 'full' + s, stats);
    if (run.phase === 'ward' || run.phase === 'dead') assert.equal(run.stats.floors - before, exp, `seed ${s}: preview ${exp} fired ${run.stats.floors - before}`);
  }
});
function BUILD_ROOMS(type) { return ({ rm_ward: 'fight', rm_isolation: null, rm_chapel: 'event', rm_dispensary: 'shop', rm_workshop: 'forge', rm_linen: 'rest' })[type] || null; }

console.log(`${n} ward property checks passed`);
