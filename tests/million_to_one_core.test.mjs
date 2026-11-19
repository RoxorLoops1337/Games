// Million To One: race rules headless (no DOM, no audio).
import assert from 'node:assert/strict';
import { Race, newMeta, loadMeta, buyHabit, lv, idleTick, collectBank, factoryRate, mulberry, channel, centre, FORK_Y0, FORK_END, DEAD_Y, N_AGENTS,
  SYNERGIES, synergiesFor, RACE_EVENTS, EVENT_ORDER, FRENZY_TIERS, comboMult, dailySeed, ZSTART } from '../million_to_one/core.js';
import { ZONES, RACE_LEN, MUTATIONS, MUT_ORDER, HABITS, HABIT_ORDER, habitCost, RIVALS, TOTAL_SWIMMERS } from '../million_to_one/content.js';

let passed = 0;
const ok = (c, n) => { assert.ok(c, n); passed++; };
// drive a race with the autopilot; returns the race when it ends (or after maxSec)
function sim(meta, seed, maxSec = 600, each) {
  const r = new Race(meta, mulberry(seed), { autopilot: true });
  for (let t = 0; t < maxSec && !r.over; t += 1 / 60) {
    for (let i = 0; i < 4; i++) r.step(1 / 240);
    if (r.pending) r.choose(r.pending[0]);
    if (each) each(r);
    r.events.length = 0;
  }
  return r;
}
const maxed = () => { const m = newMeta(); for (const id of HABIT_ORDER) m.habits[id] = HABITS[id].max; return m; };

// ---------------------------------------------------------------- content
ok(ZONES.length === 7 && ZONES[ZONES.length - 1].egg, 'seven zones ending at the egg');
ok(ZONES.filter((z) => z.fork).length === 1, 'exactly one fork');
ok(MUT_ORDER.every((id) => MUTATIONS[id].name && MUTATIONS[id].desc && MUTATIONS[id].r >= 1 && MUTATIONS[id].r <= 3), 'every mutation has text and a rarity');
ok(HABIT_ORDER.every((id) => HABITS[id].name && habitCost(id, 0) > 0), 'every habit has a name and a cost');
ok(RIVALS.length >= 3, 'named rivals exist');

// ---------------------------------------------------------------- a fresh race
{
  const r = new Race(newMeta(), mulberry(1));
  ok(r.agents.length === N_AGENTS, 'the field is built');
  ok(r.rank > TOTAL_SWIMMERS * 0.99, 'you start dead last (rank ' + r.rank + ')');
  ok(r.agents.every((a) => a.y > r.p.y), 'every rival starts ahead of you');
  ok(r.p.e === 100 && r.p.shield === 0, 'start with a full 100 energy tank and no shield');
}

// ---------------------------------------------------------------- geometry is continuous and the player stays in the tube
{
  let jump = 0;
  for (let y = 0; y < RACE_LEN; y += 10) for (const s of [-1, 1]) {
    const a = channel(y, s), b = channel(y + 10, s);
    jump = Math.max(jump, Math.abs((a.c + s * a.h) - (b.c + s * b.h)));                          // the outer wall
    if (y >= FORK_Y0) jump = Math.max(jump, Math.abs((a.c - s * a.h) - (b.c - s * b.h)));         // the inner wall once the tube splits
  }
  ok(jump < 6, 'the tube walls never jump (max step ' + jump.toFixed(2) + ')');
  ok(channel(FORK_Y0 + 2000, -1).c < channel(FORK_Y0 + 2000, 1).c, 'the fork has a left and a right tube');
  let outside = 0, nan = 0;
  sim(newMeta(), 2, 200, (r) => { const ch = channel(r.p.y, r.p.side); if (r.p.x < ch.c - ch.h - 1 || r.p.x > ch.c + ch.h + 1) outside++; if (!isFinite(r.p.x + r.p.y + r.p.e + r.rank)) nan++; });
  ok(outside === 0, 'the swimmer never leaves the tube');
  ok(nan === 0, 'no NaN anywhere in a whole race');
}

// ---------------------------------------------------------------- overtaking moves you up and builds combos
{
  let passes = 0, bestRank = Infinity, combo = 0;
  sim(newMeta(), 3, 30, (r) => { for (const e of r.events) if (e.type === 'pass') passes++; bestRank = Math.min(bestRank, r.rank); combo = Math.max(combo, r.p.combo); });
  ok(passes > 50, 'you overtake rivals in the first 30 seconds (' + passes + ')');
  ok(bestRank < TOTAL_SWIMMERS * 0.5, 'and climb the ranking (#' + bestRank + ')');
  ok(combo >= 10, 'plowing through the crowd builds a big combo (' + combo + ')');
}

// ---------------------------------------------------------------- energy runs out if you do nothing
{
  const r = new Race(newMeta(), mulberry(4));
  r.ents = []; r.genY = 1e9;   // no sugar at all
  for (let t = 0; t < 120 && !r.over; t += 1 / 60) { r.step(1 / 60); if (r.pending) r.choose(r.pending[0]); }
  ok(r.over && r.over.reason === 'energy', 'with no fruit sugar you run dry');
  ok(r.over.dna > 0 && r.meta.dna === r.over.dna, 'a failed swim still pays DNA');
}

// ---------------------------------------------------------------- mutations
{
  const r = new Race(newMeta(), mulberry(5)); r.offer();
  ok(r.pending.length === 3 && new Set(r.pending).size === 3, 'three different cards are offered');
  const sp = r.s.speed; r.pending = ['turbo', 'tank', 'helmet']; r.choose('turbo');
  ok(r.s.speed > sp * 1.09, 'Turbo Tail makes you faster');
  r.pending = ['tank']; r.choose('tank'); ok(r.p.maxE === 130 && r.p.e === 130, 'Big Fructose Tank grows and fills the tank');
  r.pending = ['helmet']; r.choose('helmet'); ok(r.p.shield === 1, 'Helmet Head gives a shield');
  ok(!r.choose('nose'), 'you cannot take a card that was not offered');
  r.muts.helmet = MUTATIONS.helmet.max; for (let i = 0; i < 30; i++) { r.offer(); ok(!r.pending.includes('helmet'), 'maxed cards are not offered'); }
}

// ---------------------------------------------------------------- the fork
{
  const r = new Race(newMeta(), mulberry(6));
  r.p.y = FORK_Y0 + 50; r.p.x = channel(r.p.y, -r.eggSide).c; r.zoneReached = 4; r.p.e = 1e6;
  r.agents.forEach((a) => { a.alive = false; });
  for (let t = 0; t < 40 && !r.over; t += 1 / 60) { r.input.tx = channel(r.p.y, r.p.side || -r.eggSide).c; r.step(1 / 60); if (r.pending) r.choose(r.pending[0]); r.p.e = 1e6; }
  ok(r.over && r.over.reason === 'wrong', 'the wrong tube is a dead end');
  ok(DEAD_Y > FORK_END, 'the dead end is past the fork');
}

// ---------------------------------------------------------------- the egg: winning makes a baby and starts a new generation
{
  const m = newMeta(); const r = new Race(m, mulberry(7));
  r.agents.forEach((a) => { a.alive = false; }); r.p.y = RACE_LEN - 200; r.p.side = r.eggSide; r.zoneReached = ZONES.length - 1; r.p.e = 1e6;
  for (let t = 0; t < 20 && !r.over; t += 1 / 60) { r.input.tap = 1; r.step(1 / 60); }
  ok(r.over && r.over.reason === 'win' && r.won, 'first into the egg wins');
  ok(m.babies.length === 1 && m.babies[0].name && m.gen === 1, 'a baby is born and the next generation starts');
  ok(r.over.dna >= 150, 'a win pays big DNA');
  const r2 = new Race(m, mulberry(8));
  ok(r2.agents[RIVALS.length + 1].sp > 0 && r2.gen === 1, 'the next race knows it is generation 2');
}
{ // someone already drilling beats a slow tapper
  const m = newMeta(); const r = new Race(m, mulberry(9));
  r.agents.forEach((a, i) => { a.alive = i === 0; }); const a = r.agents[0]; a.arrived = true; a.arrivedT = -1; a.drill = 2.9; a.y = RACE_LEN - 70;
  r.p.y = RACE_LEN - 100; r.p.side = r.eggSide; r.zoneReached = ZONES.length - 1; r.p.e = 1e6;
  for (let t = 0; t < 20 && !r.over; t += 1 / 60) r.step(1 / 60);
  ok(r.over && r.over.reason === 'late' && r.over.rank === 2, 'arrive second and do not tap: you lose at #2');
}

// ---------------------------------------------------------------- balance: not too easy, not impossible
{
  let wins0 = 0, winsMax = 0, right = 0;
  for (let s = 1; s <= 6; s++) {
    if (sim(newMeta(), 100 + s).won) wins0++;
    const r = sim(maxed(), 200 + s); if (r.won) winsMax++; if (r.p.side === r.eggSide) right++;
  }
  ok(wins0 <= 1, 'with no habits the autopilot rarely wins (' + wins0 + '/8)');
  ok(winsMax >= Math.max(1, right - 2), 'with every habit maxed it wins whenever it finds the right tube (' + winsMax + '/' + right + ')');
}

// ---------------------------------------------------------------- meta: shop, save, idle factory
{
  const m = newMeta(); m.dna = 1000;
  const c0 = habitCost('broccoli', 0);
  ok(buyHabit(m, 'broccoli') && lv(m, 'broccoli') === 1 && m.dna === 1000 - c0, 'buying a habit costs DNA and adds a level');
  m.dna = 0; ok(!buyHabit(m, 'broccoli'), 'you cannot buy without DNA');
  m.habits.hottub = HABITS.hottub.max; m.dna = 1e9; ok(!buyHabit(m, 'hottub'), 'you cannot buy past max');
  const back = loadMeta(JSON.parse(JSON.stringify(m)));
  ok(back.habits.broccoli === 1 && back.dna === m.dna, 'the save round-trips');
  const junk = loadMeta({ dna: -5, habits: { broccoli: 999, nope: 3 }, babies: 'x' });
  ok(junk.dna === 0 && junk.habits.broccoli === HABITS.broccoli.max && !junk.habits.nope && Array.isArray(junk.babies), 'a damaged save is cleaned up');
  ok(loadMeta(null).dna === 0, 'no save gives a new game');
  const im = newMeta(); idleTick(im, 1000); idleTick(im, 1000 + 2 * 3600000);
  ok(Math.abs(im.bank - 2 * factoryRate(im)) < 0.01, 'the factory makes DNA while you are away');
  idleTick(im, 1000 + 100 * 3600000); ok(im.bank <= factoryRate(im) * 8 + 0.01, 'the factory caps at 8 hours');
  const got = collectBank(im); ok(got > 0 && im.dna === got, 'collecting moves it to your DNA');
}

// ================================================================ combos, synergies, events, daily
// a quiet race: no rivals, no spawning, no events, so one system can be poked at a time
function quiet(seed = 31, opts = {}) {
  const r = new Race(newMeta(), mulberry(seed), { events: false, ...opts });
  r.agents.forEach((a) => { a.alive = false; }); r.ents = []; r.genY = 1e9; r.p.e = 100;
  return r;
}
const give = (r, ...ids) => { for (const id of ids) { r.pending = [id]; r.choose(id); } };
const types = (r) => r.events.map((e) => e.type);
const wbcAt = (x, y) => ({ t: 'wbc', x, y, r: 24, vx: 0, vy: 0, hunt: 0, eat: 0, ph: 0 });

// ---------------------------------------------------------------- new mutations: data
{
  ok(['slick', 'lucky', 'echo', 'chain'].every((id) => MUTATIONS[id] && MUT_ORDER.includes(id)), 'new mutations are in the draft pool');
  ok(MUTATIONS.chain.r === 3, 'Chain Reaction is legendary');
}

// ---------------------------------------------------------------- synergies: data and activation
{
  ok(SYNERGIES.length >= 6 && new Set(SYNERGIES.map((x) => x.id)).size === SYNERGIES.length, 'at least six synergies with unique ids');
  ok(SYNERGIES.every((x) => x.name && x.desc && x.needs.length === 2 && x.needs.every((id) => MUTATIONS[id])), 'every synergy names two real mutations');
  ok(SYNERGIES.every((x) => !/\u2014/.test(x.name + x.desc)), 'synergy text has no em dash');
}
{ // owning one half of a pair does nothing, the second half fires the synergy event once
  const r = quiet();
  give(r, 'ram');
  ok(!types(r).includes('synergy') && !r.syn.bulldozer, 'Battering Ram alone is not Bulldozer');
  give(r, 'rush');
  const ev = r.events.filter((e) => e.type === 'synergy');
  ok(ev.length === 1 && ev[0].id === 'bulldozer' && ev[0].name === 'Bulldozer' && r.syn.bulldozer, 'Ram + Overtake Rush emits the Bulldozer synergy');
  ok(ev[0].fresh && r.meta.synergiesSeen.includes('bulldozer'), 'a first-ever synergy is marked fresh and remembered in the save');
  r.events.length = 0; give(r, 'rush');
  ok(!types(r).includes('synergy'), 'taking a second level does not fire the synergy again');
  ok(r.s.ramW > 16, 'Bulldozer widens the bump');
  ok(synergiesFor(r.muts).some((x) => x.id === 'bulldozer'), 'synergiesFor lists owned synergies');
}
{ // Supernova: a FRENZY start pops every Big Mac near you
  const r = quiet(); give(r, 'hype', 'nitro');
  const w = [wbcAt(r.p.x + 100, r.p.y + 80), wbcAt(r.p.x, r.p.y + 900)]; r.ents.push(...w);
  r.p.combo = r.frenzyThreshold(0) - 1; r.events.length = 0;
  r.addCombo('pass', r.p.x, r.p.y);
  ok(w[0].dead && !w[1].dead, 'Supernova pops the near Big Mac and spares the far one');
  ok(types(r).includes('blast') && r.p.combo > r.frenzyThreshold(0), 'the blast pops count as combo links');
}
{ // Sugar High: sugar is a combo link
  const r = quiet(); give(r, 'magnet', 'sweet');
  r.ents.push({ t: 'sugar', x: r.p.x, y: r.p.y, r: 9 });
  r.stepEnts(1 / 60, false, false, 0);
  ok(r.p.combo === 1, 'Sugar High turns a fruit sugar into +1 combo');
}
{ // Jetstream: dashing out of a draft is free
  const free = quiet(); give(free, 'draft', 'whip');
  const paid = quiet(); give(paid, 'draft');
  for (const r of [free, paid]) { r.p.draft = 0.3; r.p.e = 50; r.input.dash = true; r.step(1 / 60); }
  ok(free.p.dashT > 0.7 && paid.p.dashT > 0 && paid.p.dashT < 0.6, 'a Jetstream dash lasts longer');
  ok(free.p.e - paid.p.e > paid.s.dashCost * 0.8, 'and costs no energy (' + free.p.e.toFixed(1) + ' vs ' + paid.p.e.toFixed(1) + ')');
}
{ // Porcupine: a spiky pop chains into the neighbours
  const r = quiet(); give(r, 'spiky', 'helmet');
  const w = [wbcAt(r.p.x, r.p.y), wbcAt(r.p.x + 90, r.p.y + 40), wbcAt(r.p.x, r.p.y + 600)]; r.ents.push(...w);
  r.stepEnts(1 / 60, false, false, 0);
  ok(w[0].dead && w[1].dead && !w[2].dead && !r.over, 'Porcupine chain-pops a neighbour but not a distant cell');
  ok(r.p.combo >= 2, 'each pop is a combo link');
}
{ // Comeback Kid: Second Wind also starts FRENZY and speeds you up
  const r = quiet(); give(r, 'second', 'bloom');
  const sp = r.s.speed; r.p.e = 0.0001; r.events.length = 0;
  r.step(1 / 60);
  ok(!r.over && types(r).includes('second') && r.p.frenzyT > 0, 'Comeback Kid: Second Wind lights FRENZY');
  ok(r.s.speed > sp * 1.09, 'and gives +10% speed');
}
{ // Hype Squad: a FRENZY brings the Wingman back
  const r = quiet(); give(r, 'wingman', 'hype'); r.p.wing = 0;
  r.p.combo = r.frenzyThreshold(0) - 1; r.addCombo('pass', 0, 0);
  ok(r.p.wing === 1, 'Hype Squad respawns the Wingman on FRENZY');
}
{ // Echo Chamber keeps half a dropped combo, Elephant Brain keeps three quarters
  const none = quiet(), echo = quiet(), ele = quiet();
  give(echo, 'echo'); give(ele, 'echo', 'memory');
  for (const r of [none, echo, ele]) { r.p.combo = 40; r.dropCombo(); }
  ok(none.p.combo === 0, 'without Echo a dropped combo is gone');
  ok(echo.p.combo === 20 && echo.p.comboT > 0, 'Echo Chamber keeps half and keeps it ticking');
  ok(ele.p.combo === 30, 'Elephant Brain keeps three quarters');
  ok(echo.p.tier === echo.tierOf(20), 'the kept combo keeps its FRENZY tier progress');
}
{ // Slick Moves and Greased Lightning: near misses
  const r = quiet(); give(r, 'slick', 'goo');
  r.p.dashCd = 2; r.p.e = 50;
  r.nearMiss(r.p.x, r.p.y);
  ok(r.p.combo === 2 && r.p.e === 52, 'Slick Moves: a near miss is +2 combo and +2 energy');
  ok(Math.abs(r.p.dashCd - 1.4) < 1e-9, 'Greased Lightning: a near miss recharges the dash');
}
{ // Chain Reaction: double combo in FRENZY, overtakes stretch it
  const r = quiet(); give(r, 'chain');
  r.addCombo('pass', 0, 0); ok(r.p.combo === 1, 'outside FRENZY Chain Reaction does nothing');
  r.p.frenzyT = 2; r.addCombo('pass', 0, 0);
  ok(r.p.combo === 3 && Math.abs(r.p.frenzyT - 2.2) < 1e-9, 'in FRENZY a pass counts double and adds 0.2s of FRENZY');
  r.p.frenzyT = 100; r.addCombo('pass', 0, 0); ok(r.p.frenzyT === 100, 'the extension is capped');
}
{ // Lucky Swimmer: bigger DNA blobs
  const r = quiet(); give(r, 'lucky');
  r.ents.push({ t: 'dna', x: r.p.x, y: r.p.y, r: 11 }); const d0 = r.dnaRun;
  r.stepEnts(1 / 60, false, false, 0);
  ok(Math.abs(r.dnaRun - d0 - 7) < 1e-9, 'a Lucky DNA blob is worth 7');
}

// ---------------------------------------------------------------- combo multiplier and FRENZY tiers
{
  ok(comboMult(0) === 1 && comboMult(25) > comboMult(10) && comboMult(500) === comboMult(50) && comboMult(50) <= 3.01, 'the combo multiplier grows with the chain and is capped');
  const cold = quiet(), hot = quiet();
  hot.p.combo = 50; hot.p.mult = comboMult(50);
  for (const r of [cold, hot]) { r.ents.push({ t: 'dna', x: r.p.x, y: r.p.y, r: 11 }); r.stepEnts(1 / 60, false, false, 0); }
  ok(hot.dnaRun > cold.dnaRun * 2.5, 'a long combo multiplies DNA pickups (' + hot.dnaRun.toFixed(1) + ' vs ' + cold.dnaRun.toFixed(1) + ')');
  const a = quiet(), b = quiet(); a.p.combo = 2; b.p.combo = 40;
  a.addCombo('pass', 0, 0); b.addCombo('pass', 0, 0);
  ok(b.dnaRun > a.dnaRun * 2, 'combo links pay more deep into a chain');
}
{
  ok(FRENZY_TIERS.length === 5 && FRENZY_TIERS.every((t, i) => t.name && (!i || t.at > FRENZY_TIERS[i - 1].at && t.speed > FRENZY_TIERS[i - 1].speed)), 'five FRENZY tiers with rising thresholds and speed');
  const r = quiet();
  r.p.combo = r.frenzyThreshold(0) - 1; r.addCombo('pass', 0, 0);
  let fe = r.events.filter((e) => e.type === 'frenzy');
  ok(r.p.tier === 1 && fe.length === 1 && fe[0].tier === 1 && fe[0].name === FRENZY_TIERS[0].name, 'combo 10 starts tier 1 FRENZY');
  r.events.length = 0; r.p.combo = r.frenzyThreshold(4) - 1; r.addCombo('pass', 0, 0);
  fe = r.events.filter((e) => e.type === 'frenzy');
  ok(r.p.tier === 5 && fe[0].name === 'GOD MODE!', 'an 85 chain reaches GOD MODE');
  r.p.combo = 400; r.addCombo('pass', 0, 0);
  ok(r.p.tier === 5 && r.p.bestTier === 5, 'the tier never goes past GOD MODE');
  r.dropCombo(); ok(r.p.tier === 0 && r.p.combo === 0, 'losing the combo drops the tier');
}
{ // GOD MODE: a Big Mac cannot eat you; without FRENZY it can
  const god = quiet(), plain = quiet();
  god.p.combo = god.frenzyThreshold(4) - 1; god.addCombo('pass', 0, 0);
  for (const r of [god, plain]) { r.ents.push(wbcAt(r.p.x, r.p.y + 5)); r.step(1 / 60); }
  ok(!god.over, 'GOD MODE shrugs off a Big Mac');
  ok(plain.over && plain.over.reason === 'wbc', 'with no FRENZY the same Big Mac eats you');
}
{ // HYPER FRENZY: acid cannot burn you
  const hyper = quiet(), plain = quiet();
  hyper.p.combo = hyper.frenzyThreshold(3) - 1; hyper.addCombo('pass', 0, 0);
  for (const r of [hyper, plain]) { r.ents.push({ t: 'acid', x: r.p.x, y: r.p.y + 5, r: 60, seed: 1 }); r.p.e = 80; r.step(1 / 30); }
  ok(hyper.p.tier === 4 && hyper.p.acid === 0 && plain.p.acid === 1, 'HYPER FRENZY is acid proof');
}

// ---------------------------------------------------------------- random race events
{
  ok(EVENT_ORDER.length >= 4 && EVENT_ORDER.every((id) => RACE_EVENTS[id].name && RACE_EVENTS[id].text), 'every race event has a name and text');
  let seen = new Set(), bad = 0;
  for (let s = 1; s <= 30; s++) {
    const r = new Race(newMeta(), mulberry(s));
    if (r.schedule.length !== 3) bad++;
    for (const e of r.schedule) {
      seen.add(e.id);
      const z = ZONES[e.zi];
      if (!RACE_EVENTS[e.id].zones.includes(z.id) || e.y0 < ZSTART[e.zi] || e.y1 > ZSTART[e.zi] + z.len) bad++;
    }
    if (new Set(r.schedule.map((e) => e.id)).size !== r.schedule.length) bad++;
  }
  ok(bad === 0, 'each run schedules three different events inside zones that allow them');
  ok(seen.size >= 5, 'runs differ: ' + seen.size + ' kinds of event across 30 runs');
  ok(new Race(newMeta(), mulberry(1), { events: false }).schedule.length === 0, 'events can be switched off');
}
{ // entering and leaving an event window
  const r = new Race(newMeta(), mulberry(12)); const e = r.schedule[0];
  r.p.y = e.y0 + 10; r.stepEvent();
  const st = r.events.find((x) => x.type === 'event');
  ok(st && st.id === e.id && st.name === RACE_EVENTS[e.id].name && st.text, 'swimming into the window emits the event with a name and text');
  r.events.length = 0; r.p.y = e.y1 + 10; r.stepEvent();
  ok(types(r).includes('eventEnd') && r.ev === null, 'swimming out of it ends the event');
}
{ // event effects on the spawn layout: same seed, with and without the event
  const count = (id, t) => {   // summed over ten daily seeds so the comparison is not luck
    let n = 0;
    for (let day = 770; day < 780; day++) {
      const r = new Race(newMeta(), mulberry(1), { seed: day, events: false });
      const y0 = ZSTART[3] + 2000;
      if (id) r.schedule = [{ id, zi: 3, y0, y1: y0 + 3200 }];
      r.genY = y0; r.p.y = y0 + 3200 - 2200; r.spawnAhead();
      n += r.ents.filter((e) => e.t === t).length;
    }
    return n;
  };
  ok(count('sugarRush', 'sugar') > count(null, 'sugar') * 2, 'Sugar Rush fills the tube with fruit');
  ok(count('stampede', 'wbc') > count(null, 'wbc') * 1.5, 'a Big Mac stampede brings more white blood cells');
  ok(count('goldRush', 'dna') > count(null, 'dna') * 2, 'Golden Hour rains DNA');
}
{ // Dad sneezed: turbulence pushes you sideways even when you do not steer
  const mk = (on) => { const r = quiet(); if (on) r.schedule = [{ id: 'sneeze', zi: 0, y0: 0, y1: 1e5 }]; r.p.y = 500; r.p.x = centre(500); return r; };
  const calm = mk(false), sneeze = mk(true);
  for (let i = 0; i < 30; i++) for (const r of [calm, sneeze]) { r.input.tx = null; r.step(1 / 60); }
  ok(Math.abs(sneeze.p.x - centre(sneeze.p.y)) > Math.abs(calm.p.x - centre(calm.p.y)) + 5, 'a sneeze pushes the swimmer sideways');
}
{ // Slipstream Highway doubles drafting
  const mk = (on) => { const r = new Race(newMeta(), mulberry(5), { events: false }); r.ents = []; r.genY = 1e9; if (on) r.schedule = [{ id: 'slipstream', zi: 0, y0: 0, y1: 1e5 }];
    r.agents.forEach((a, i) => { a.alive = i === RIVALS.length; }); const a = r.agents[RIVALS.length]; a.y = r.p.y + 40; a.lane = 0; a.kx = 0; a.sp = 1e-6; r.p.x = r.agentX(a); return r; };
  const off = mk(false), on = mk(true);
  for (const r of [off, on]) for (let i = 0; i < 4; i++) { r.input.tx = r.p.x; r.step(1 / 60); }
  ok(on.p.draft > off.p.draft * 1.6, 'Slipstream Highway doubles draft (' + on.p.draft.toFixed(3) + ' vs ' + off.p.draft.toFixed(3) + ')');
}

// ---------------------------------------------------------------- daily seed race
{
  ok(dailySeed(new Date(Date.UTC(2026, 0, 2, 23))) - dailySeed(new Date(Date.UTC(2026, 0, 1, 1))) === 1, 'the daily seed changes once per UTC day');
  const day = 20411;
  const a = new Race(newMeta(), mulberry(1), { seed: day }), b = new Race(maxed(), mulberry(999), { seed: day });
  ok(a.eggSide === b.eggSide, 'the same day has the same egg side for everybody');
  ok(a.agents.every((x, i) => x.y === b.agents[i].y && x.side === b.agents[i].side), 'the same day lines up the same field');
  ok(JSON.stringify(a.schedule) === JSON.stringify(b.schedule), 'the same day has the same race events');
  a.offer(); b.offer(); ok(a.pending.join() === b.pending.join(), 'the same day deals the same first cards');
  for (const r of [a, b]) { r.p.y = 3000; r.spawnAhead(); }
  const lay = (r) => r.ents.filter((e) => e.y >= 2700 && e.y < 5000).map((e) => e.t + Math.round(e.x) + ':' + Math.round(e.y)).join();
  ok(lay(a).length > 0 && lay(a) === lay(b), 'the same day spawns the same layout, even with a head start from habits');
  const c = new Race(newMeta(), mulberry(1), { seed: day + 1 }); c.p.y = 3000; c.spawnAhead();
  ok(lay(c) !== lay(a), 'the next day has a different layout');
  const sides = new Set(); for (let d = 0; d < 30; d++) sides.add(new Race(newMeta(), mulberry(1), { seed: d }).eggSide);
  ok(sides.size === 2, 'over a month the egg shows up on both sides');
  ok(new Race(newMeta(), mulberry(1)).daily === null, 'a normal race is not a daily');
}
{ // the daily best is remembered per day
  const m = newMeta();
  const r1 = new Race(m, mulberry(1), { seed: 500 }); r1.rank = 5000; r1.end('energy');
  ok(m.dailyDay === 500 && m.dailyRuns === 1 && m.dailyBest === 5000 && r1.over.dailyBest, 'a daily run records the best rank of the day');
  const r2 = new Race(m, mulberry(2), { seed: 500 }); r2.rank = 9000; r2.end('energy');
  ok(m.dailyRuns === 2 && m.dailyBest === 5000 && !r2.over.dailyBest, 'a worse run the same day keeps the best');
  const r3 = new Race(m, mulberry(3), { seed: 501 }); r3.rank = 80000; r3.end('energy');
  ok(m.dailyDay === 501 && m.dailyRuns === 1 && m.dailyBest === 80000, 'a new day starts a fresh daily board');
  const back = loadMeta(JSON.parse(JSON.stringify(m)));
  ok(back.dailyDay === 501 && back.dailyBest === 80000 && Array.isArray(back.synergiesSeen), 'daily stats survive the save');
}

console.log(`million_to_one_core: ${passed} passed, 0 failed`);
