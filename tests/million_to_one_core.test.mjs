// Million To One: race rules headless (no DOM, no audio).
import assert from 'node:assert/strict';
import { Race, newMeta, loadMeta, buyHabit, lv, idleTick, collectBank, factoryRate, factoryCapHours, mulberry, channel, centre, playBand, FORK_Y0, FORK_END, DEAD_Y, N_AGENTS,
  SYNERGIES, synergiesFor, RACE_EVENTS, EVENT_ORDER, FRENZY_TIERS, comboMult, styleMult, dailySeed, ZSTART, VIEW_W, EGG_DRILL, BOSS_Y, MID_DRAFT_Y, SEA_I, EGG_I,
  maxLv, habitEffect, genFactor, HABIT_FX, BANK_AT, bankDna, finisherMult, genSpeed, bossGenSpeed, factoryCapHours as capH, nextGoal, goalMet, META_VER, LINK_DNA } from '../million_to_one/core.js';
import { ZONES, RACE_LEN, MUTATIONS, MUT_ORDER, HABITS, HABIT_ORDER, habitCost, RIVALS, TOTAL_SWIMMERS } from '../million_to_one/content.js';

let passed = 0;
let failed = 0;
// a failed check is reported and counted (the run goes on, so one red line shows every other one too)
const ok = (c, n) => { if (c) passed++; else { failed++; console.log('FAIL: ' + n); } };
// drive a race with the autopilot; returns the race when it ends (or after maxSec).
// o.bot: steer like the autopilot but count as a person (no autopilot DNA cut). o.dt: physics step.
// o.tap: taps per second at the egg, in a human rhythm (each gap 0.7..1.3 of the mean).
function sim(meta, seed, maxSec = 600, each, o = {}) {
  const r = new Race(meta, mulberry(seed), { autopilot: !o.bot, bot: !!o.bot });
  const dt = o.dt || 1 / 240, n = Math.max(1, Math.round(1 / 60 / dt)), trng = mulberry(seed ^ 0xabc);
  let nextTap = null;
  for (let t = 0; t < maxSec && !r.over; t += 1 / 60) {
    if (o.tap && r.drill) { if (nextTap == null) nextTap = r.t; while (r.t >= nextTap) { r.input.tap++; nextTap += (0.7 + 0.6 * trng()) / o.tap; } }
    for (let i = 0; i < n; i++) r.step(1 / 60 / n);
    if (r.pending) r.choose(o.choose ? o.choose(r) : r.pending[0]);
    if (each) each(r);
    r.events.length = 0;
  }
  return r;
}
const veteran = () => { const m = newMeta(); m.runs = 10; return m; };   // past the rookie grace
const maxed = (gen = 0) => { const m = veteran(); m.gen = gen; for (const id of HABIT_ORDER) m.habits[id] = maxLv(m, id); return m; };
const first = (R) => R.name.split(' ')[0];
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// ---------------------------------------------------------------- content
ok(ZONES.length === 7 && ZONES[ZONES.length - 1].egg, 'seven zones ending at the egg');
ok(ZONES.filter((z) => z.fork).length === 1, 'exactly one fork');
ok(MUT_ORDER.every((id) => MUTATIONS[id].name && MUTATIONS[id].desc && MUTATIONS[id].r >= 1 && MUTATIONS[id].r <= 3), 'every mutation has text and a rarity');
ok(HABIT_ORDER.every((id) => HABITS[id].name && habitCost(id, 0) > 0), 'every habit has a name and a cost');
ok(RIVALS.length >= 3, 'named rivals exist');
ok(RIVALS.every((R) => R.drill > 0.5 && R.drill < 2 && R.sp > 0.5), 'every named rival has a speed and a drill rate');
{
  const z = Object.fromEntries(ZONES.map((x) => [x.id, x]));
  ok(z.goo.col[0] === '#2e3448' && z.goo.col[1] === '#7d86a8' && z.goo.wall === '#eef2ff' && z.sea.wall === '#ff7a5c' && z.fork.col[0] === '#0a0820' && z.fork.col[1] === '#24124a' && z.launch.wall === '#ff7aa8',
    'zone colours: slate goo, red sea, deep night fork, pink launch');
  ok(z.fork.hazards.acid > 0 && z.fork.hazards.goo > 0, 'the Fork has its own puddles');
}

// ---------------------------------------------------------------- a fresh race: the field is spread up the track
{
  const r = new Race(newMeta(), mulberry(1));
  ok(r.agents.length === N_AGENTS, 'the field is built');
  ok(r.rank > TOTAL_SWIMMERS * 0.99, 'you start dead last (rank ' + r.rank + ')');
  ok(r.agents.every((a) => a.y > r.p.y), 'every rival starts ahead of you');
  ok(r.p.e === 100 && r.p.shield === 0, 'start with a full 100 energy tank and no shield');
  const field = r.agents.filter((a) => !a.boss), pack = field.filter((a) => a.y >= 60 && a.y <= 2500);
  ok(Math.abs(pack.length - N_AGENTS * 0.35) <= 2, '35% of the field starts in the pack (' + pack.length + ')');
  ok(field.every((a) => (a.y >= 60 && a.y <= 2500) || (a.y >= ZSTART[1] && a.y <= ZSTART[5])), 'the rest are spread from the Acid Lagoon to the end of the Fork');
  const inZ = (i) => field.filter((a) => a.y >= ZSTART[i] && a.y < ZSTART[i + 1]).length;
  ok(inZ(1) > inZ(2) && inZ(3) > inZ(4) && inZ(4) > 0, 'more of them early, where more are still alive (' + [1, 2, 3, 4].map(inZ).join('/') + ')');
  ok(RIVALS.every((R, k) => r.agents[k].boss === R) && RIVALS.map((R, k) => r.agents[k].y).sort((a, b) => a - b).join() === BOSS_Y.slice().sort((a, b) => a - b).join(), 'the named rivals start on the milestone slots');
  const steveY = new Set(); for (let s = 0; s < 20; s++) steveY.add(new Race(newMeta(), mulberry(s)).agents[0].y);
  ok(steveY.size >= 3, 'the slots are shuffled every run (Steve started at ' + steveY.size + ' different milestones)');
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

// ---------------------------------------------------------------- the egg: winning makes a baby and starts a new generation
{
  const m = newMeta(); const r = new Race(m, mulberry(7));
  r.agents.forEach((a) => { a.alive = false; }); r.p.y = RACE_LEN - 200; r.p.side = r.eggSide; r.zoneReached = ZONES.length - 1; r.p.e = 1e6;
  for (let t = 0; t < 20 && !r.over; t += 1 / 60) { r.input.tap = 1; r.step(1 / 60); }
  ok(r.over && r.over.reason === 'win' && r.won, 'first into the egg wins');
  ok(m.babies.length === 1 && m.babies[0].name && m.gen === 1, 'a baby is born and the next generation starts');
  ok(m.babies[0].gen === m.gen + 1 && m.babies[0].gen === 2 && !m.babies[0].practice, 'the hero is Gen 1, so the first baby is Gen 2');
  ok(r.over.dna >= 150, 'a win pays big DNA');
  ok(r.over.rivalsBeaten.length === RIVALS.length && r.over.by === null, 'a win beats every named rival');
  const r2 = new Race(m, mulberry(8));
  ok(r2.agents[RIVALS.length + 1].sp > 0 && r2.gen === 1, 'the next race knows it is generation 2');
}
{ // someone already drilling beats a slow tapper
  const m = newMeta(); const r = new Race(m, mulberry(9));
  r.agents.forEach((a, i) => { a.alive = i === 0; }); const a = r.agents[0]; a.arrived = true; a.arrivedT = -1; a.drill = 2.9; a.y = RACE_LEN - 70;
  r.p.y = RACE_LEN - 100; r.p.side = r.eggSide; r.zoneReached = ZONES.length - 1; r.p.e = 1e6;
  for (let t = 0; t < 20 && !r.over; t += 1 / 60) r.step(1 / 60);
  ok(r.over && r.over.reason === 'late' && r.over.rank === 2, 'arrive second and do not tap: you lose at #2');
  ok(r.over.by === 'Steve' && !r.over.rivalsBeaten.includes('Steve'), 'the result knows Steve took the egg');
  ok(m.rivals.Steve.lost === 1 && m.rivals.Chad.beat === 1, 'the save keeps a head-to-head record per rival');
}

// ================================================================ 1. core bugs
// a quiet race: no rivals, no spawning, no events, so one system can be poked at a time.
// zoneReached 3 so the FRENZY tier cap (Launch Tube) is out of the way.
function quiet(seed = 31, opts = {}) {
  const r = new Race(veteran(), mulberry(seed), { events: false, ...opts });
  r.agents.forEach((a) => { a.alive = false; }); r.ents = []; r.genY = 1e9; r.p.e = 100; r.zoneReached = 3;
  return r;
}
const give = (r, ...ids) => { for (const id of ids) { r.pending = [id]; r.choose(id); } };
const types = (r) => r.events.map((e) => e.type);
const styled = (r) => { r.p.kinds = ['pass', 'close', 'gate', 'dodge']; r.p.style = 4; r.p.lastKind = 'dodge'; r.p.sameRun = 1; return r; };   // STYLE 4: every FRENZY tier open
const wbcAt = (x, y) => ({ t: 'wbc', x, y, r: 24, vx: 0, vy: 0, hunt: 0, eat: 0, ph: 0 });
const gateAt = (y, gapX) => ({ t: 'gate', x: VIEW_W / 2, y, r: 120, gaps: [gapX], gw: 80, side: 0, bonkT: 0, contact: 0 });
const atEgg = (r, out) => { r.p.y = RACE_LEN - 70 - out; r.p.x = centre(r.p.y); r.p.side = r.eggSide; r.zoneReached = EGG_I; r.p.e = 1e6; };

{ // 1a: nothing happens after the race is over
  const r = quiet(); atEgg(r, 1);
  const a = r.agents[1]; a.alive = true; a.arrived = true; a.arrivedT = -1; a.y = RACE_LEN - 70; a.drill = r.rivalNeed() - 0.001;
  r.step(1 / 60);
  const ty = types(r), at = ty.indexOf('over');
  ok(at >= 0 && r.over.reason === 'late', 'an arrived rival finishing its drill ends the race');
  ok(!ty.slice(at + 1).some((t) => t === 'drill' || t === 'second'), 'no drill or Second Wind after the race is over (' + ty.join(',') + ')');
}
{ // 1a: Second Wind does not fire after a Big Mac ended the race
  const r = quiet(); give(r, 'second'); r.p.e = 0.01;
  r.ents.push(wbcAt(r.p.x, r.p.y + 5)); r.step(1 / 60);
  const ty = types(r);
  ok(r.over && r.over.reason === 'wbc' && !ty.slice(ty.indexOf('over')).includes('second'), 'eaten is eaten: no Second Wind after the end');
}
{ // 1a: FRENZY running out while drilling says so exactly once
  const r = quiet(); atEgg(r, 0); r.startDrill(); r.p.frenzyT = 0.1; r.events.length = 0;
  for (let i = 0; i < 30; i++) r.step(1 / 60);
  ok(types(r).filter((t) => t === 'frenzyEnd').length === 1, 'a drill started with 0.1s of FRENZY emits exactly one frenzyEnd');
}
{ // 1b: a goo gate bonks once, holds you quietly, and lets you squelch through after a while
  const r = quiet(); r.p.y = 500; r.p.x = centre(500) - 60;
  r.ents.push(gateAt(560, centre(560) + 80));
  for (let i = 0; i < 12; i++) r.addCombo(i % 2 ? 'pass' : 'close', r.p.x, r.p.y);
  let bonks = 0, surf = 0, breaks = 0, banks = 0;
  for (let t = 0; t < 3; t += 1 / 60) {
    r.input.tx = centre(r.p.y) - 100; r.p.e = 100; r.step(1 / 60);
    for (const e of r.events) { if (e.type === 'bonk') bonks++; if (e.type === 'surf') surf++; if (e.type === 'comboBreak') breaks++; if (e.type === 'comboBank') banks++; }
    r.events.length = 0;
  }
  ok(bonks >= 1 && bonks <= 2, 'steering away from the gap for 3 s bonks once or twice, not 60 times a second (' + bonks + ')');
  ok(surf === 1 && r.p.y > 560, 'after 1.2 s of contact you squelch through');
  ok(breaks >= 1 && banks === 0, 'the bonk breaks the combo and the chain pays no bank (' + breaks + ' breaks, ' + banks + ' banks)');
}
{ // 1c: the play band never leaves the 400-wide view, even in the wide zones
  let bad = 0, worst = [VIEW_W, 0];
  for (let zi = 0; zi < ZONES.length; zi++) {
    for (const dir of [-999, 999]) {
      const r = quiet(); r.zoneReached = zi; r.midDraft = true; r.p.y = ZSTART[zi] + 400; r.p.side = r.p.y >= FORK_Y0 ? r.eggSide : 0; r.p.e = 1e6;
      for (let t = 0; t < 1.5 && !r.over; t += 1 / 60) {
        r.input.tx = dir; r.step(1 / 60); r.p.e = 1e6; if (r.pending) r.choose(r.pending[0]);
        worst = [Math.min(worst[0], r.p.x), Math.max(worst[1], r.p.x)];
        if (r.p.x < 22 || r.p.x > VIEW_W - 22) bad++;
      }
    }
  }
  ok(bad === 0, 'steering hard left and right in every zone keeps 22 <= x <= 378 (' + worst.map((v) => v.toFixed(1)).join('..') + ')');
  let badBand = 0, badAgent = 0;
  const r = new Race(newMeta(), mulberry(3));
  for (let y = 0; y < RACE_LEN; y += 50) for (const s of [-1, 1]) { const b = playBand(y, s); if (b.l < 22 || b.r > VIEW_W - 22 || b.l >= b.r) badBand++; }
  for (const a of r.agents) for (const y of [a.y, a.y + 20000]) { const x = r.agentX({ ...a, y }); if (x < 22 || x > VIEW_W - 22) badAgent++; }
  ok(badBand === 0 && badAgent === 0, 'playBand and every rival stay inside the view');
}

// ================================================================ 2. opening and pacing
{ // an idle start never reaches past FRENZY tier 1 in the Launch Tube
  let worst = 0;
  for (const seed of [11, 12, 13]) {
    const r = new Race(newMeta(), mulberry(seed));
    for (let t = 0; t < 10 && !r.over; t += 1 / 60) { r.step(1 / 60); if (r.pending) r.choose(r.pending[0]); }
    worst = Math.max(worst, r.p.bestTier);
  }
  ok(worst <= 1, 'an idle 10 s race has bestTier <= 1 (' + worst + ')');
}
{ // zone 0: a plain pass is rank only, an earned one is a link
  const mk = () => { const r = quiet(); r.zoneReached = 0; const a = r.agents[RIVALS.length + 3]; a.alive = true; a.y = r.p.y + 6; a.lane = 0.8; a.kx = 0; a.sp = 1; r.prevPY = r.p.y; return r; };
  const plain = mk(); plain.p.x = plain.agentX(plain.agents[RIVALS.length + 3]) - 150; plain.p.y += 10; plain.stepAgents(1 / 60);
  const close = mk(); close.p.x = close.agentX(close.agents[RIVALS.length + 3]) - 40; close.p.y += 10; close.stepAgents(1 / 60);
  ok(types(plain).includes('pass') && plain.p.combo === 0, 'Launch Tube: a plain pass moves you up but is not a combo link');
  ok(close.p.combo === 1, 'Launch Tube: a close shave pass (dx < 70) is a link');
  const boss = quiet(); boss.zoneReached = 0; const b = boss.agents[2]; b.alive = true; b.y = boss.p.y + 6; b.kx = 0; b.sp = 1; boss.prevPY = boss.p.y; boss.p.x = boss.agentX(b) - 150; boss.p.y += 10;
  const d0 = boss.dnaRun; boss.stepAgents(1 / 60);
  const pe = boss.events.find((e) => e.type === 'pass');
  ok(boss.p.combo === 3 && boss.dnaRun - d0 >= 4 && pe.k === 2 && pe.boss === RIVALS[2].name, 'passing a named rival is always 3 links and +4 DNA');
  const tc = styled(quiet()); tc.zoneReached = 1; tc.p.combo = tc.frenzyThreshold(2) + 5; tc.addCombo('close', 0, 0);
  ok(tc.p.tier === 3, 'before the Great Womb Sea FRENZY tops out at tier 3');
}
{ // the opening takes a while, and the rank keeps getting better
  const hist = [];
  sim(newMeta(), 21, 70, (r) => { if (Math.abs(r.t * 4 - Math.round(r.t * 4)) < 1e-6 || hist.length === 0 || r.t - hist[hist.length - 1][0] >= 0.25) hist.push([r.t, r.rank]); });
  const at = (t) => { let best = hist[0]; for (const h of hist) if (Math.abs(h[0] - t) < Math.abs(best[0] - t)) best = h; return best[1]; };
  ok(at(6) > 50000, 'six seconds in you are still far back (#' + at(6) + ')');
  ok(at(45) < at(15), 'the rank at 45 s is better than at 15 s (#' + at(15) + ' -> #' + at(45) + ')');
  let worst = 0;
  for (const [t, rk] of hist) {
    if (t < 10) continue;
    let mn = Infinity; for (const [t2, r2] of hist) if (t2 >= t - 5 && t2 <= t) mn = Math.min(mn, r2);
    worst = Math.max(worst, rk / mn);
  }
  ok(worst <= 3, 'after 10 s the rank never gets 3x worse within 5 s (worst x' + worst.toFixed(2) + ')');
}
{ // energy matters: with no habits the autopilot often runs dry
  let dry = 0;
  for (let s = 1; s <= 8; s++) if (sim(veteran(), 300 + s, 600, null, { dt: 1 / 60 }).over.reason === 'energy') dry++;
  ok(dry >= 2, 'a no-habit autopilot ends on energy in at least 2 of 8 seeds (' + dry + ')');
}
{ // a clean swimmer is faster than the dummy field
  const r = new Race(newMeta(), mulberry(2));
  ok(r.s.speed === 445 && r.agents.filter((a) => !a.boss).every((a) => a.sp <= 430 * 1.03 + 1e-9), 'base speed 445 beats every dummy rival');
  ok(r.s.dashCost === 8 && Math.abs(r.s.drain - 4.3) < 1e-9, 'a dash costs 8 and the drain is 4.3 a second');
}

// ================================================================ 3. rival events and the finale
{ // a fast boss overtaking a still player taunts once
  const r = quiet(); r.zoneReached = 0; r.s.speed = 1;
  const a = r.agents[4]; a.alive = true; a.y = r.p.y - 60; a.sp = 900; a.lane = 0; a.kx = 0; r.p.x = r.agentX(a) + 30;
  let n = 0, ev = null;
  for (let t = 0; t < 4; t += 1 / 60) { r.step(1 / 60); r.p.e = 100; for (const e of r.events) if (e.type === 'passedBy') { n++; ev = e; } r.events.length = 0; }
  ok(n === 1 && ev.boss === RIVALS[4].name && ev.k === 4, 'one passedBy within 4 s when a boss overtakes you (' + n + ')');
}
{ // a boss you pass back and forth only taunts every 4 s
  const r = quiet(); r.zoneReached = 0; const a = r.agents[1]; a.alive = true; a.kx = 0; a.lane = 0;
  let n = 0;
  for (let i = 0; i < 120; i++) { a.y = r.p.y + (i % 2 ? 5 : -5); r.prevPY = r.p.y; const y0 = a.y; a.sp = 0; r.stepAgents(1 / 60); a.y = y0; for (const e of r.events) if (e.type === 'passedBy') n++; r.events.length = 0; }
  ok(n <= 1, 'the taunt cooldown holds (' + n + ' in 2 s)');
}
{ // the first rival at the egg claims it, and the claim says how it stands
  const r = quiet(); r.p.y = RACE_LEN - 6000; r.zoneReached = 5;
  const a = r.agents[3]; a.alive = true; a.side = r.eggSide; a.y = RACE_LEN - 75; a.sp = 600;
  r.stepAgents(1 / 30);
  const c = r.events.find((e) => e.type === 'eggClaim');
  ok(c && c.boss === RIVALS[3].name && c.k === 3 && c.col === RIVALS[3].col && Math.abs(c.need - (EGG_DRILL + 5930 / 1200)) < 1e-6 && c.remaining > 5000, 'eggClaim names the rival, its colour, the drill it needs (4 + 5930/1200) and how far you are');
  ok(!types(r).includes('arrive'), 'the first arrival is an eggClaim, not a bare arrive');
  r.events.length = 0; let fs = [];
  for (let t = 0; t < 8.5 && !r.over; t += 1 / 60) { r.stepAgents(1 / 60); for (const e of r.events) if (e.type === 'rivalDrill') fs.push(e.f); r.events.length = 0; }
  ok(fs.length === 2 && fs[0] >= 0.5 && fs[0] < 0.55 && fs[1] >= 0.8 && fs[1] < 0.85, 'rivalDrill fires as the leader crosses 50% and 80% (' + fs.map((f) => f.toFixed(2)).join(',') + ')');
}
{ // a late end by a boss names it
  const r = quiet(); atEgg(r, 30);
  const a = r.agents[4]; a.alive = true; a.arrived = true; a.arrivedT = -1; a.y = RACE_LEN - 70; a.drill = 4.95;
  for (let t = 0; t < 2 && !r.over; t += 1 / 60) r.step(1 / 60);
  ok(r.over && r.over.reason === 'late' && r.over.by === 'Chad', "a 'late' end by Chad sets over.by = 'Chad'");
  ok(r.over.gapSec >= 0 && isFinite(r.over.gapSec), 'and says how far off you were (' + r.over.gapSec + ' s)');
}
{ // a claim is a chase you can win: far from the egg the claimant needs much longer
  // arrange: a boss about to arrive, you 6000 out at base speed
  const r = quiet(); r.p.y = RACE_LEN - 70 - 6000; r.p.side = r.eggSide; r.zoneReached = 5;
  const a = r.agents[4]; a.alive = true; a.side = r.eggSide; a.y = RACE_LEN - 75; a.sp = 600;
  // act
  let claimT = null;
  for (let t = 0; t < 30 && !r.over; t += 1 / 60) { r.step(1 / 60); r.p.e = 100; if (r.pending) r.choose(r.pending[0]); if (claimT == null && types(r).includes('eggClaim')) claimT = r.t; r.events.length = 0; }
  // assert
  ok(claimT != null && r.over && r.t - claimT >= 7, 'with the player 6000 out the race lasts 7+ s after the eggClaim (' + (r.t - claimT).toFixed(1) + ' s)');
  const mid = quiet(); atEgg(mid, 0); mid.startDrill();
  const b = mid.agents[1]; b.alive = true; b.side = mid.eggSide; b.y = RACE_LEN - 72; b.sp = 600; mid.step(1 / 60);
  ok(b.arrived && b.need === mid.drill.need && b.drill < 0.05, 'a rival arriving mid-drill needs exactly what Kevin needs, from 0');
}
{ // tug of war: taps push the drilling bosses back, up to 8 counted taps a second
  const tap = quiet(), idle = quiet();
  for (const r of [tap, idle]) { atEgg(r, 0); r.startDrill(); const a = r.agents[0]; a.alive = true; a.arrived = true; a.arrivedT = -1; a.y = RACE_LEN - 70; a.drill = 1; a.shoveT = 9; }
  let shoves = 0, taps = 0;
  for (let i = 0; i < 30; i++) { if (i % 8 === 0) { tap.input.tap = 1; taps++; } tap.step(1 / 60); idle.step(1 / 60); shoves += tap.events.filter((e) => e.type === 'drillShove' && e.k === 0).length; tap.events.length = 0; }
  ok(shoves === taps && Math.abs(idle.agents[0].drill - tap.agents[0].drill - 0.07 * taps) < 1e-6, 'every tap shoves Steve back 0.07 (' + tap.agents[0].drill.toFixed(2) + ' vs ' + idle.agents[0].drill.toFixed(2) + ')');
  ok(Math.abs(idle.drill.me - 0.3 * 0.5) < 0.02 && Math.abs(tap.drill.me - idle.drill.me - 0.07 * taps) < 1e-6, 'an idle player drills at 0.3 a second, each tap adds 0.07');
  const spam = quiet(); atEgg(spam, 0); spam.startDrill(); let counted = 0;
  for (let i = 0; i < 120; i++) { spam.input.tap = 3; spam.step(1 / 60); for (const e of spam.events) if (e.type === 'drillTap') counted += e.n; spam.events.length = 0; }
  ok(counted <= 8 * 2 + 2, 'mashing 180 taps a second counts at most 8 a second (' + counted + ' in 2 s)');
  ok(EGG_DRILL === 4 && Math.abs(new Race(maxed(3), mulberry(1)).playerNeed() - (4 + 0.45)) < 1e-9 && new Race(maxed(20), mulberry(1)).playerNeed() === 4 + 0.15 * 8, 'Kevin needs 4 + 0.15 per generation (to gen 8)');
}
{ // the bosses at the egg shove back every 1.4 s, and the lead changes are announced
  const r = quiet(); atEgg(r, 0); r.startDrill(); r.drill.me = 1;
  const a = r.agents[4]; a.alive = true; a.arrived = true; a.arrivedT = -1; a.y = RACE_LEN - 70; a.drill = 0; a.need = r.drill.need; a.shoveT = 1.4;
  let shoves = 0; const leads = [];
  for (let t = 0; t < 2.9 && !r.over; t += 1 / 60) { r.step(1 / 60); for (const e of r.events) { if (e.type === 'rivalShove' && e.k === 4) shoves++; if (e.type === 'drillLead') leads.push(e.kevin ? 'K' : e.k); } r.events.length = 0; }
  ok(shoves === 2, 'an arrived boss shoves you back every 1.4 s (' + shoves + ' in 2.9 s)');
  ok(leads[0] === 'K' && leads.includes(4), 'drillLead says when Chad takes the lead from Kevin (' + leads.join(',') + ')');
}
{ // the drill duel: a 6 taps/s player vs an arrived Chad is a coin flip with an edge, 10/s wins
  const duel = (rate, s) => {
    const r = quiet(100 + s); atEgg(r, 0); r.startDrill();
    const a = r.agents[4]; a.alive = true; a.arrived = true; a.arrivedT = r.t; a.y = RACE_LEN - 70; a.drill = 0; a.need = r.drill.need;
    const trng = mulberry(7 + s); let next = 0;
    for (let i = 0; i < 1200 && !r.over; i++) { if (r.t >= next) { r.input.tap++; next += (0.7 + 0.6 * trng()) / rate; } r.step(1 / 60); }
    return r.won;
  };
  let w6 = 0, w10 = 0; for (let s = 0; s < 40; s++) { if (duel(6, s)) w6++; if (duel(10, s)) w10++; }
  ok(w6 >= 16 && w6 <= 30, 'a 6 taps/s player beats an arrived Chad 40-75% of the time (' + w6 + '/40)');
  ok(w10 >= 34, 'a 10 taps/s player beats him 85%+ (' + w10 + '/40)');
}
{ // entering THE EGG: the two strongest rivals come for it, one ahead and one behind
  const mk = (rec) => {
    const m = veteran(); if (rec) m.rivals = { Brock: { beat: 0, lost: 9 } };
    const r = new Race(m, mulberry(3), { events: false }); r.agents.forEach((a) => { a.alive = false; }); r.ents = []; r.genY = 1e9; r.p.e = 100;
    r.zoneReached = 5; r.p.y = ZSTART[EGG_I] - 5; r.p.side = r.eggSide;
    for (const k of [0, 1, 2, 3]) { const a = r.agents[k]; a.alive = true; a.side = r.eggSide; a.y = ZSTART[EGG_I] - 1500 - 1000 * k; a.sp = 400; }
    for (let i = 0; i < 4; i++) r.step(1 / 60);
    return r;
  };
  const r = mk(true), fin = r.events.find((e) => e.type === 'finale');
  const [A, B] = fin.ks.slice(0, 2).map((k) => r.agents[k]);
  ok(fin && fin.ks[0] === 1 && fin.sprinters[0] === RIVALS[1].name, 'the nemesis (most losses to) leads the finale (' + fin.ks.join(',') + ')');
  ok(Math.abs(A.y - (ZSTART[EGG_I] + 700)) < 30 && Math.abs(B.y - (ZSTART[EGG_I] - 450)) < 30 && A.sprint && B.sprint, 'rival A starts 700 ahead of you, rival B 450 behind, both sprinting');
  ok(A.sp >= r.s.speed * 1.03 - 1e-9 && B.sp >= r.s.speed * 1.03 - 1e-9 && !r.pending, 'both swim at least 3% faster than you, and there is no card deal');
  const d1 = new Race(veteran(), mulberry(1), { seed: 4242 }), d2 = new Race(veteran(), mulberry(2), { seed: 4242 });
  ok(d1.frng() === d2.frng(), 'the daily finale picks come from the layout seed');
}
{ // Big Macs lock on, and a dodge pays
  const r = quiet(); const w = wbcAt(r.p.x + 40, r.p.y + 200); r.ents.push(w);
  let lock = 0, dodge = 0;
  for (let t = 0; t < 2 && !r.over; t += 1 / 60) { r.input.tx = w.x - 48; r.step(1 / 60); for (const e of r.events) { if (e.type === 'lockon') lock++; if (e.type === 'combo' && e.kind === 'dodge') dodge++; } r.events.length = 0; }
  ok(lock === 1, 'a white blood cell locking on says so once');
  ok(!r.over && dodge === 1 && r.p.combo >= 2, 'slipping past a hunting Big Mac is a 2-link dodge');
}

// ================================================================ 4. combo depth
{ // style: mixing moves out-earns spamming one
  const mix = quiet(), spam = quiet(), kinds = ['pass', 'close', 'gate', 'dodge'];
  for (let i = 0; i < 8; i++) { mix.addCombo(kinds[i % 4], 0, 0); spam.addCombo('pass', 0, 0); }
  ok(mix.p.style === 4 && spam.p.style === 1, 'style counts the different kinds in the last 8 links');
  const ev = mix.events.filter((e) => e.type === 'combo');
  ok(ev[1].fresh && !ev[4].fresh && ev[7].style === 4 && Math.abs(ev[7].mult - comboMult(8) * styleMult(4)) < 1e-9, 'combo events carry style, mult and fresh');
  mix.dropCombo(); spam.dropCombo();
  ok(mix.dnaRun >= spam.dnaRun * 1.25, '8 mixed links out-earn 8 passes by 25% or more (' + mix.dnaRun.toFixed(2) + ' vs ' + spam.dnaRun.toFixed(2) + ')');
  const same = quiet(), alt = quiet();
  for (let i = 0; i < 10; i++) { same.addCombo('pass', 0, 0); alt.addCombo(i % 2 ? 'pass' : 'close', 0, 0); }
  ok(same.p.frenzyT === 0 && alt.p.frenzyT > 0, 'the same move 4+ times in a row climbs FRENZY at half speed');
}
{ // bank: a clean finish pays, graded
  const r = quiet();
  for (let i = 0; i < 30; i++) r.addCombo(i % 3 ? 'pass' : 'close', 0, 0);
  const d0 = r.dnaRun; r.p.comboT = 0.001; r.step(1 / 60);
  const b = r.events.find((e) => e.type === 'comboBank');
  ok(b && b.n === 30 && b.grade === 1 && Math.abs(b.dna - Math.round(0.07 * Math.pow(30, 1.4) * styleMult(2) * 10) / 10) < 1e-9, 'a 30 chain banks 0.07 * n^1.4 * style DNA, grade 1');
  ok(r.dnaRun - d0 > 2 && r.p.bank === 0, 'the bank is paid into the run');
  ok(BANK_AT.join() === '10,25,40,60,85', 'bank grades at 10/25/40/60/85');
}
{ // break: a hit you survive costs three quarters of the chain and the whole bank
  const r = quiet(); r.p.shield = 1;
  for (let i = 0; i < 20; i++) r.addCombo(i % 2 ? 'pass' : 'close', 0, 0);
  r.ents.push(wbcAt(r.p.x, r.p.y + 5)); r.step(1 / 60);
  const br = r.events.find((e) => e.type === 'comboBreak');
  ok(!r.over && br && br.n === 20 && br.why === 'shieldHit' && r.p.combo === 5 && r.p.bank === 0, 'a shield hit breaks the chain to a quarter (' + r.p.combo + ')');
  const god = styled(quiet()); god.p.combo = god.frenzyThreshold(4) - 1; god.addCombo('pass', 0, 0); const n = god.p.combo; god.breakCombo('bonk');
  ok(god.p.combo === n, 'no combo break in GOD MODE');
}
{ // honest near misses: only on the way out, only when untouched
  const thru = quiet(), edge = quiet();
  for (const [r, off] of [[thru, 0], [edge, 60]]) {
    r.p.y = 500; r.p.x = centre(500);
    r.ents.push({ t: 'acid', x: r.p.x + off, y: 640, r: 45, seed: 1 }); r.p.e = 100;
    let close = 0, first = -1;
    for (let t = 0; t < 0.8; t += 1 / 60) { r.input.tx = r.p.x; r.step(1 / 60); r.p.e = 100; for (const e of r.events) if (e.type === 'combo' && e.kind === 'close') { close++; if (first < 0) first = r.p.y; } r.events.length = 0; }
    r.close = close; r.firstClose = first;
  }
  ok(thru.close === 0, 'steering straight through an acid centre gives 0 close');
  ok(edge.close === 1 && edge.firstClose > 640 + 45 * 0.8, 'brushing the edge pays one close, once you are out of it');
}
{ // touch steering is snappy and does not overshoot; keys stay softer
  const run = (touch) => {
    const r = quiet(); r.p.y = 500; r.p.x = centre(500) - 40; const x0 = r.p.x, tx = x0 + 80;
    let hit = Infinity, max = -Infinity;
    for (let i = 0; i < 120; i++) { r.input.tx = tx; r.input.touch = touch; r.step(1 / 240); if (hit === Infinity && r.p.x - x0 >= 72) hit = r.t; max = Math.max(max, r.p.x); }
    return { hit, over: max - tx };
  };
  const t = run(true), k = run(false);
  ok(t.hit <= 0.22 && t.over < 6, 'touch covers 90% of an 80 gap within 0.22 s with < 6 overshoot (' + t.hit.toFixed(3) + ' s, +' + t.over.toFixed(1) + ')');
  ok(k.hit > t.hit, 'keyboard steering is softer');
}

// ================================================================ 5. economy and meta
{
  ok(genFactor(0) === 1 && Math.abs(genFactor(4) - 1.6) < 1e-9 && genFactor(10) === 2.5 && genFactor(20) === 2.5, 'DNA multiplier 1 + 0.15 per generation, capped at gen 10');
  const g = newMeta(); g.gen = 3;
  ok(maxLv(newMeta(), 'broccoli') === HABITS.broccoli.max && maxLv(g, 'broccoli') === HABITS.broccoli.max + 3 && maxLv(g, 'walk') === HABITS.walk.max, 'Grandad habits grow with every generation');
  g.habits.broccoli = HABITS.broccoli.max; g.dna = 1e6; ok(buyHabit(g, 'broccoli'), 'and can be bought past the old max');
  const back = loadMeta(JSON.parse(JSON.stringify(g)));
  ok(back.habits.broccoli === HABITS.broccoli.max + 1, 'the save keeps a grandad level');
  const e = habitEffect('broccoli', 5);
  ok(e.value === HABIT_FX.broccoli * 5 && /25%/.test(e.label) && habitEffect('water', 2).value === 24 && habitEffect('factory', 0).value === 36, 'habitEffect reads the race constants');
  const fm = newMeta(); fm.gen = 4; fm.habits.factory = 3;
  ok(habitEffect('factory', 3, fm).value === factoryRate(fm) && habitEffect('factory', 3, fm).value > habitEffect('factory', 3).value, 'habitEffect(factory, l, meta) matches factoryRate(meta), generation included');
  const sl = newMeta(); sl.habits.sleep = 3; const sr = new Race(sl, mulberry(1));
  ok(Math.abs(sr.s.drain - 4.3 * Math.pow(0.95, 3)) < 1e-9 && Math.abs(habitEffect('sleep', 3).value - (1 - Math.pow(0.95, 3))) < 1e-9 && /14%/.test(habitEffect('sleep', 3).label), 'Sleep is multiplicative: drain x0.95 per level, and the shop says so');
  ok(maxLv(g, 'sleep') === HABITS.sleep.max && maxLv(g, 'berries') === HABITS.berries.max, 'sleep and berries no longer grow with the generations');
  ok(HABIT_ORDER.every((id) => typeof habitEffect(id, 1).label === 'string' && habitEffect(id, 1).label), 'every habit has an effect label');
}
{ // a first run pays a modest pile of DNA
  const pays = []; let combos = 0;
  for (let s = 1; s <= 5; s++) { const r = sim(newMeta(), 400 + s, 600, null, { bot: true, dt: 1 / 60 }); pays.push(r.over.dna); combos += r.p.bestCombo; }
  pays.sort((a, b) => a - b);
  ok(pays[2] >= 100 && pays[2] <= 200, 'the first no-habit run pays 100-200 DNA (median ' + pays[2] + ' of ' + pays.join(',') + ')');
  ok(combos / 5 < 60, 'a bot with no intent averages a best combo under 60 (' + (combos / 5).toFixed(1) + ')');
}
{ // the breakdown adds up to what you were paid
  const r = sim(newMeta(), 77, 600, null, { bot: true, dt: 1 / 60 }), b = r.over.breakdown;
  ok(['dist', 'place', 'combo', 'bank', 'bounty', 'photo', 'genMul', 'autoCut', 'dailyBonus', 'goal'].every((k) => typeof b[k] === 'number'), 'over.breakdown has every part');
  ok(Math.abs((b.dist + b.place + b.combo + b.bank + b.bounty + b.photo) * b.genMul - b.autoCut + b.dailyBonus + b.goal - r.over.dna) <= 4, 'and it adds up to the DNA paid');
  ok(b.bounty >= 8 * r.over.rivalsBeaten.length, 'rivals beaten pay a bounty');
}
{ // autopilot pays less and does not count as a record
  const m = newMeta();
  const auto = sim(m, 55, 600, null, { dt: 1 / 60 });
  const man = sim(newMeta(), 55, 600, null, { bot: true, dt: 1 / 60 });
  ok(auto.over.auto && !man.over.auto && auto.over.breakdown.autoCut > 0, 'a mostly-autopilot run is flagged and cut');
  ok(m.best === TOTAL_SWIMMERS && m.runs === 1, 'and does not set your best place');
}
{ // a greedy cheapest-first buyer tapping 6/s: a few buys after run 1, something to buy every run, a first win only after a few runs
  const greedy = (m) => { let n = 0; for (;;) { let best = null; for (const id of HABIT_ORDER) if (lv(m, id) < maxLv(m, id) && (!best || habitCost(id, lv(m, id)) < habitCost(best, lv(m, best)))) best = id; if (!best || !buyHabit(m, best)) return n; n++; } };
  const buys = [], pays = []; let lateWinSeeds = 0, firstBuyMax = 0;
  for (let seed = 1; seed <= 4; seed++) {
    const m = newMeta(), runs = seed === 1 ? 30 : 3; let firstWin = 0;
    for (let run = 1; run <= runs; run++) {
      const r = sim(m, seed * 1000 + run, 600, null, { bot: true, dt: 1 / 30, tap: 6 });
      if (r.won && !firstWin) firstWin = run;
      const n = greedy(m);
      if (run === 1) firstBuyMax = Math.max(firstBuyMax, n);
      if (seed === 1) { buys.push(n); pays.push(r.over.dna); }
    }
    if (!firstWin || firstWin >= 4) lateWinSeeds++;
  }
  ok(firstBuyMax <= 4, 'after run 1 the greedy buyer can afford at most 4 habits (' + firstBuyMax + ')');
  let dryRow = 0, worstDry = 0; for (const n of buys) { dryRow = n ? 0 : dryRow + 1; worstDry = Math.max(worstDry, dryRow); }
  ok(buys.reduce((a, b) => a + b, 0) >= 30 && worstDry <= 1, 'something to buy every run through run 30 (' + buys.join(',') + ')');
  ok(lateWinSeeds >= 3, 'the first win comes at run 4 or later on 3+ of 4 seeds (' + lateWinSeeds + ')');
  // maxing every habit (no generations) costs more than 80 of the best of those 30 runs
  let total = 0; for (const id of HABIT_ORDER) for (let l = 0; l < HABITS[id].max; l++) total += habitCost(id, l);
  ok(total > 80 * pays.reduce((a, b) => a + b, 0) / pays.length, 'a greedy buyer is not maxed before run 80 (all habits ' + total + ' DNA)');
}
{ // maxed habits win often but not always, the finale is a real contest, and 30 generations later you can still win
  let w0 = 0, fin = 0, close = 0, w30 = 0;
  for (let s = 1; s <= 16; s++) {
    let drillT = null, finT = null; const arr = [];
    const r = sim(maxed(0), 500 + s, 600, (q) => { for (const e of q.events) { if (e.type === 'finale') finT = q.t; if (e.type === 'drill') drillT = q.t; if ((e.type === 'eggClaim' || e.type === 'arrive') && e.k >= 0) arr.push(q.t); } }, { bot: true, dt: 1 / 60, tap: 6 });
    if (r.won) w0++;
    if (finT != null) { fin++; if (drillT != null && arr.some((t) => Math.abs(t - drillT) <= 2.5)) close++; }
    if (sim(maxed(30), 600 + s, 600, null, { bot: true, dt: 1 / 60, tap: 6 }).won) w30++;
  }
  ok(w0 >= 9 && w0 <= 13, 'a maxed 6-taps/s bot wins 55-80% at gen 0 (' + w0 + '/16)');
  ok(fin > 0 && close >= 0.7 * fin, 'in 70%+ of finales a boss reaches the egg within 2.5 s of you (' + close + '/' + fin + ')');
  ok(w30 >= 3, 'maxed habits still win >= 3/16 at gen 30 (' + w30 + ')');
}
{ // generations: faster field, nastier tube
  const r0 = new Race(newMeta(), mulberry(1)), m = newMeta(); m.gen = 6; const r6 = new Race(m, mulberry(1));
  ok(Math.abs(r6.agents[10].sp / r0.agents[10].sp - genSpeed(6)) < 1e-9 && Math.abs(genSpeed(6) - 1.15) < 1e-9 && Math.abs(genSpeed(12) - 1.24) < 1e-9 && genSpeed(30) === genSpeed(12), 'the field: +3%/gen to gen 4, +1.5% after, capped at gen 12');
  ok(Math.abs(r6.agents[4].sp / r0.agents[4].sp - bossGenSpeed(6)) < 1e-9 && Math.abs(bossGenSpeed(6) - 1.18) < 1e-9, 'named rivals get an extra 0.5% per generation');
  ok(r0.hzGen === 0 && r6.hzGen === 6, 'after generation 3 the hazards grow');
  for (const r of [r0, r6]) { r.p.y = ZSTART[2] + 1000; r.genY = ZSTART[2] + 600; r.spawnAhead(); }
  const minGw = (r) => Math.min(...r.ents.filter((e) => e.t === 'gate').map((e) => e.gw));
  ok(minGw(r6) >= 60 && minGw(r6) < 60 + 30 && Math.min(...r6.ents.filter((e) => e.t === 'gate').map((e) => e.gw)) < Math.max(...r0.ents.filter((e) => e.t === 'gate').map((e) => e.gw)), 'gates get narrower (floor 60)');
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
  const junk = loadMeta({ dna: -5, habits: { broccoli: 999, nope: 3 }, babies: 'x', rivals: 'x', dailyStreak: -3 });
  ok(junk.dna === 0 && junk.habits.broccoli === HABITS.broccoli.max && !junk.habits.nope && Array.isArray(junk.babies), 'a damaged save is cleaned up');
  ok(junk.rivals.Chad.beat === 0 && junk.dailyStreak === 0, 'including the rival record and the streak');
  ok(loadMeta(null).dna === 0, 'no save gives a new game');
  ok(HABITS.gps.base === 1200 && habitCost('hottub', 1) === Math.round(150 * 2.5) && habitCost('factory', 1) === Math.round(60 * 1.45), 'autopilot, hot tub and factory prices');
  ok(['broccoli', 'water', 'berries', 'jeans', 'sleep', 'walk', 'beatbox'].map((id) => HABITS[id].base).join() === '40,30,35,45,55,60,55', 'habit prices start at 40/30/35/45/55/60/55');
  const im = newMeta(); idleTick(im, 1000); idleTick(im, 1000 + 2 * 3600000);
  ok(Math.abs(im.bank - 2 * factoryRate(im)) < 0.01 && factoryRate(im) === 36, 'the factory makes 36 DNA an hour while you are away');
  idleTick(im, 1000 + 100 * 3600000); ok(im.bank <= factoryRate(im) * factoryCapHours(im) + 0.01 && factoryCapHours(im) === 8, 'the factory caps at 8 hours');
  const got = collectBank(im); ok(got > 0 && im.dna === got, 'collecting moves it to your DNA');
  const f6 = newMeta(); f6.habits.factory = 6; f6.gen = 2;
  ok(factoryCapHours(f6) === 10 && factoryRate(f6) === Math.round(36 * (1 + 0.35 * 6) * Math.sqrt(1.3)), 'a bigger factory stores longer and makes more, times the root of the generation bonus');
  const t5 = newMeta(); idleTick(t5, 5000); t5.lastSeen = 10000; idleTick(t5, 10000 + 5 * 3600000);
  ok(Math.abs(t5.bank - 5 * factoryRate(t5)) < 0.01, 'five hours away banks five hours');
}

// ================================================================ 6. card deal and synergies
{ // 2000 seeded drafts: chasing pairs finds synergies often, legendary ones sometimes
  const r = new Race(newMeta(), mulberry(1));
  const legendary = (x) => x.needs.some((id) => MUTATIONS[id].r === 3);
  const chase = (rr) => {
    const comp = rr.completers(), p = rr.pending;
    return p.find((id) => comp.has(id)) || p.find((id) => SYNERGIES.some((x) => x.needs.includes(id))) || p[0];
  };
  let any = 0, leg = 0, badDeal = 0, rareMiss = 0, bloomLate = 0;
  const ys = [ZSTART[1], ZSTART[2], ZSTART[3], MID_DRAFT_Y, ZSTART[4], ZSTART[5]];
  for (let s = 0; s < 2000; s++) {
    r.orng = mulberry(9000 + s); r.muts = {}; r.syn = {}; r.draftN = 0; r.refreshStats();
    for (const y of ys) {
      r.p.y = y; r.draft(y === MID_DRAFT_Y);
      if (r.pending.filter((id) => MUTATIONS[id].r === 3).length > 1) badDeal++;
      if (r.draftN >= 3 && !r.pending.some((id) => MUTATIONS[id].r >= 2)) rareMiss++;
      if (r.draftN > 4 && r.pending.includes('bloom')) bloomLate++;
      r.choose(chase(r));
    }
    const got = SYNERGIES.filter((x) => r.syn[x.id]);
    if (got.length) any++; if (got.some(legendary)) leg++;
  }
  ok(any / 2000 >= 0.55, 'a pair-chasing chooser reaches a synergy in >= 55% of runs (' + (any / 20).toFixed(1) + '%)');
  ok(leg / 2000 >= 0.12, 'and a legendary synergy in >= 12% (' + (leg / 20).toFixed(1) + '%)');
  ok(badDeal === 0, 'never more than one legendary in a deal');
  ok(rareMiss === 0, 'from the third draft on a rare or better is guaranteed');
  ok(bloomLate === 0, 'Late Bloomer only shows up in the first 4 drafts');
}
{ // no card deal at the egg, an extra one halfway across the sea
  const egg = quiet(); egg.zoneReached = 5; egg.p.y = ZSTART[EGG_I] - 3; egg.p.side = egg.eggSide; for (let i = 0; i < 3; i++) egg.step(1 / 60);
  ok(egg.zoneReached === EGG_I && !egg.pending && !types(egg).includes('offer'), 'no offer on entering THE EGG');
  const sea = quiet(); sea.zoneReached = SEA_I; sea.p.y = MID_DRAFT_Y - 3; for (let i = 0; i < 3 && !sea.pending; i++) sea.step(1 / 60);
  const of = sea.events.find((e) => e.type === 'offer');
  ok(sea.pending && of && of.mid === true && sea.midDraft, 'a mid-zone draft halfway across the Great Womb Sea');
  sea.choose(sea.pending[0]); sea.events.length = 0; for (let i = 0; i < 30; i++) sea.step(1 / 60);
  ok(!types(sea).includes('offer'), 'only once');
}
{ // a deal that can complete a pair leans towards it
  let withComp = 0;
  for (let s = 0; s < 400; s++) { const r = quiet(); r.orng = mulberry(s); give(r, 'ram'); r.draftN = 1; r.offer(); if (r.pending.includes('rush')) withComp++; }
  ok(withComp / 400 >= 0.5, 'holding Battering Ram, Overtake Rush shows up in half the deals or more (' + (withComp / 4).toFixed(0) + '%)');
}
{ // the three new synergies
  const dom = quiet(); give(dom, 'mosh', 'chain');
  ok(dom.syn.domino && dom.events.some((e) => e.type === 'synergy' && e.id === 'domino' && e.bonus === 10), 'Mosh Pit + Chain Reaction is Domino Effect, and a first discovery pays 10 DNA');
  for (let i = 0; i < 4; i++) { const a = dom.agents[RIVALS.length + i]; a.alive = true; a.y = dom.p.y + 50 + i * 20; }
  dom.p.combo = dom.frenzyThreshold(0) - 1; const c0 = dom.p.combo; dom.addCombo('pass', 0, 0);
  ok(dom.p.combo === c0 + 1 + 4 && Math.abs(dom.p.frenzyT - (dom.s.frenzyLen + 1.2)) < 1e-9 && types(dom).includes('domino'), 'Domino: every rival the Mosh knocks is +1 combo and +0.3 s FRENZY');
  const res = quiet(), plainSW = quiet(); give(res, 'tank', 'second'); give(plainSW, 'tank'); give(plainSW, 'second'); plainSW.syn.reserveTank = false;
  for (const r of [res, plainSW]) { r.p.e = 0.0001; r.step(1 / 60); }
  ok(res.syn.reserveTank && res.p.e === res.p.maxE && res.p.shield === 1, 'Reserve Tank: Second Wind refills to max and gives a shield');
  ok(plainSW.p.e === 60 && plainSW.p.shield === 0, 'plain Second Wind gives 60 and no shield');
  const jack = quiet(), solo = quiet(); give(jack, 'lucky', 'magnet'); give(solo, 'lucky');
  for (const r of [jack, solo]) { r.p.frenzyT = 2; r.ents.push({ t: 'dna', x: r.p.x, y: r.p.y, r: 11 }); r.stepEnts(1 / 60, true, false, 1); }
  ok(jack.syn.jackpot && jack.p.combo === 1 && solo.p.combo === 0, 'Jackpot: a DNA blob in FRENZY is +1 combo');
  const again = new Race(dom.meta, mulberry(2), { events: false }); give(again, 'mosh', 'chain');
  ok(again.events.find((e) => e.type === 'synergy').bonus === 0, 'the discovery bonus is paid only once per save');
}

// ================================================================ 7. hazards, the fork
{ // every hazard a zone declares can actually spawn
  const T = { sugar: 'sugar', acid: 'acid', alkali: 'alkali', gate: 'gate', goo: 'goo', wbc: 'wbc', current: 'current', cilia: 'cilia' };
  const missing = [];
  for (let zi = 0; zi < ZONES.length; zi++) {
    const seen = new Set();
    for (const seed of [1, 2, 3]) {
      const r = new Race(newMeta(), mulberry(seed), { events: false }); r.p.side = r.eggSide;
      r.genY = ZSTART[zi]; for (let y = ZSTART[zi]; y < ZSTART[zi] + ZONES[zi].len - 2200; y += 500) { r.p.y = y; r.spawnAhead(); }
      for (const e of r.ents) if (zoneIndex(e.y) === zi) seen.add(e.t);
    }
    for (const k of Object.keys(ZONES[zi].hazards)) if (!T[k] || !seen.has(T[k])) missing.push(ZONES[zi].id + '.' + k);
  }
  ok(missing.length === 0, 'every key in every zone hazards object spawns (missing: ' + missing.join(',') + ')');
  const r = new Race(newMeta(), mulberry(4), { events: false }); r.p.side = r.eggSide; r.genY = ZSTART[FORK_I()];
  for (let y = ZSTART[FORK_I()]; y < FORK_END - 2200; y += 500) { r.p.y = y; r.spawnAhead(); }
  ok(r.ents.filter((e) => (e.t === 'acid' || e.t === 'goo') && e.y >= FORK_Y0 + 1500 && e.y < FORK_END).every((e) => e.r <= 0.55 * channel(e.y, -1).h + 1e-6), 'Fork puddles fit the narrow tubes');
}
function zoneIndex(y) { for (let i = ZONES.length - 1; i >= 0; i--) if (y >= ZSTART[i]) return i; return 0; }
function FORK_I() { return ZONES.findIndex((z) => z.fork); }
{ // currents really push
  const r = quiet(); r.p.y = 500; r.p.x = centre(500); const x0 = r.p.x;
  const cur = { t: 'current', x: r.p.x, y: 510, r: 120, h: 400, dir: 1 }; r.ents.push(cur);
  for (let t = 0; t < 3 && r.p.y < cur.y + cur.h + 20; t += 1 / 120) { r.input.tx = r.p.x; r.step(1 / 120); r.p.e = 100; }
  ok(r.p.x - x0 >= 80, 'holding still in a 400-long current drifts you 80+ (' + (r.p.x - x0).toFixed(1) + ')');
  const ride = quiet(), fight = quiet();
  for (const [q, dir] of [[ride, 1], [fight, -1]]) { q.p.y = 500; q.p.x = centre(500); q.ents.push({ t: 'current', x: q.p.x, y: 400, r: 120, h: 800, dir }); q.p.vx = 200; q.input.tx = q.p.x + 300; q.step(1 / 60); }
  ok(ride.p.vy > fight.p.vy * 1.15, 'riding a current is faster than fighting it');
}
{ // cilia: a swat on the beat shoves you, never kills; a dodge is a close
  const r = quiet(); r.p.y = 500; r.p.x = centre(500) - 60;
  const c = { t: 'cilia', x: centre(560) - 120, y: 560, r: 120, wall: -1, len: 0.5, period: 1.4, off: 0, state: 0, phase: 0 };
  r.t = 1.4 - 0.3 - 0.1; r.ents.push(c);   // the swat starts just as you reach it
  const x0 = r.p.x; let swat = 0;
  for (let i = 0; i < 40; i++) { r.input.tx = r.p.x; r.step(1 / 60); r.p.e = 100; swat += r.events.filter((e) => e.type === 'swat').length; r.events.length = 0; }
  ok(swat === 1 && r.p.x - x0 > 60 && !r.over, 'a cilia swat shoves you away from its wall and is never lethal');
  // a trembling hair you brush past is a close; an idle one is nothing
  const brush = (t0) => {
    const d = quiet(); d.p.y = 500; d.p.x = centre(500) + 30;
    d.ents.push({ t: 'cilia', x: centre(560) - 120, y: 560, r: 130, wall: -1, len: 0.5, period: 1.4, off: 0, state: 0, phase: 0 }); d.t = t0;
    let close = 0; for (let i = 0; i < 40; i++) { d.input.tx = d.p.x; d.step(1 / 60); d.p.e = 100; close += d.events.filter((e) => e.type === 'combo' && e.kind === 'close').length; d.events.length = 0; }
    return close;
  };
  ok(brush(0) === 0, 'slipping past an idle hair gives no near miss');
  ok(brush(0.65) === 1, 'slipping past a trembling one is a close');
  // swept: a dash that jumps over the hair's row in one step still gets swatted
  const dash = quiet(); dash.p.y = 520; dash.p.x = centre(560) - 60;
  dash.ents.push({ t: 'cilia', x: centre(560) - 120, y: 560, r: 130, wall: -1, len: 0.5, period: 1.4, off: 0, state: 0, phase: 0 }); dash.t = 1.4 - 0.2;
  dash.s.speed = 6000; dash.step(1 / 60);
  ok(dash.p.y > 600 && types(dash).includes('swat'), 'a swat hit test is swept, so a fast step cannot tunnel through');
  const slip = quiet(); slip.p.y = 500; slip.p.x = centre(500) + 30;
  slip.ents.push({ t: 'cilia', x: centre(560) - 120, y: 560, r: 130, wall: -1, len: 0.5, period: 1.4, off: 0, state: 0, phase: 0 }); slip.t = 1.4 - 0.32;
  let dodge = 0; for (let i = 0; i < 40; i++) { slip.input.tx = slip.p.x; slip.step(1 / 60); slip.p.e = 100; for (const e of slip.events) if (e.type === 'combo' && e.kind === 'dodge') dodge += 1; slip.events.length = 0; }
  ok(dodge === 1 && slip.p.combo === 2, 'slipping past a hair mid-swat, unhit, is a 2-link dodge');
}
{ // the fork: the autopilot sniffs the right tube 3 times in 4
  let right = 0; for (let s = 0; s < 400; s++) { const r = new Race(newMeta(), mulberry(s)); if (r.autoFork === r.eggSide) right++; }
  ok(right / 400 > 0.68 && right / 400 < 0.82, 'autopilot picks the egg side 75% of the time (' + (right / 4).toFixed(0) + '%)');
}
{ // the wrong tube is a dead end that spits you back out
  const r = new Race(newMeta(), mulberry(6));
  r.p.y = FORK_Y0 + 50; r.p.x = channel(r.p.y, -r.eggSide).c; r.zoneReached = 4; r.p.e = 1e6;
  r.agents.forEach((a) => { a.alive = false; });
  let back = null;
  for (let t = 0; t < 40 && !r.over && !back; t += 1 / 60) { r.input.tx = channel(r.p.y, r.p.side || -r.eggSide).c; r.p.e = 1e6; r.step(1 / 60); if (r.pending) r.choose(r.pending[0]); back = r.events.find((e) => e.type === 'backflow'); r.events.length = 0; }
  ok(back && !r.over && back.y >= DEAD_Y - 40, 'the wrong tube ends in a backflow, not the end of the run');
  ok(r.p.side === r.eggSide && r.p.y === FORK_END && r.p.stuck === 1.2 && r.p.e === r.p.maxE - 25, 'the backflow puts you back at the fork exit on the egg side, dizzy and 25 energy down');
  ok(DEAD_Y > FORK_END, 'the dead end is past the fork');
  const w = new Race(newMeta(), mulberry(6)); w.agents.forEach((a) => { a.alive = false; });
  w.p.y = FORK_END + 500; w.p.side = -w.eggSide; w.p.x = channel(w.p.y, w.p.side).c; w.zoneReached = 5; w.p.e = 0.01; w.ents = []; w.genY = 1e9;
  w.step(1 / 60);
  ok(w.over && w.over.reason === 'wrong', 'running dry in the wrong tube is the wrong-tube ending');
}

// ================================================================ combos, synergies, events, daily
// ---------------------------------------------------------------- new mutations: data
{
  ok(['slick', 'lucky', 'echo', 'chain'].every((id) => MUTATIONS[id] && MUT_ORDER.includes(id)), 'new mutations are in the draft pool');
  ok(MUTATIONS.chain.r === 3, 'Chain Reaction is legendary');
}

// ---------------------------------------------------------------- synergies: data and activation
{
  ok(SYNERGIES.length >= 12 && new Set(SYNERGIES.map((x) => x.id)).size === SYNERGIES.length, 'at least twelve synergies with unique ids');
  ok(['domino', 'reserveTank', 'jackpot'].every((id) => SYNERGIES.some((x) => x.id === id)), 'Domino, Reserve Tank and Jackpot exist');
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
  ok(Math.abs(hot.dnaRun - cold.dnaRun * (1 + (comboMult(50) - 1) * 0.5)) < 1e-9, 'a long combo multiplies DNA pickups by half its multiplier (' + hot.dnaRun.toFixed(1) + ' vs ' + cold.dnaRun.toFixed(1) + ')');
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
  r.events.length = 0; styled(r); r.p.combo = r.frenzyThreshold(4) - 1; r.addCombo('pass', 0, 0);
  fe = r.events.filter((e) => e.type === 'frenzy');
  ok(r.p.tier === 5 && fe[0].name === 'GOD MODE!', 'an 85 chain with STYLE 4 reaches GOD MODE');
  r.p.combo = 400; r.addCombo('pass', 0, 0);
  ok(r.p.tier === 5 && r.p.bestTier === 5, 'the tier never goes past GOD MODE');
  r.dropCombo(); ok(r.p.tier === 0 && r.p.combo === 0, 'losing the combo drops the tier');
  const z0 = styled(quiet()); z0.zoneReached = 0; z0.p.combo = z0.frenzyThreshold(4) - 1; z0.addCombo('pass', 0, 0);
  ok(z0.p.tier === 1, 'in the Launch Tube FRENZY is capped at tier 1');
}
{ // GOD MODE: a Big Mac cannot eat you; without FRENZY it can
  const god = quiet(), plain = quiet();
  styled(god); god.p.combo = god.frenzyThreshold(4) - 1; god.addCombo('pass', 0, 0);
  for (const r of [god, plain]) { r.ents.push(wbcAt(r.p.x, r.p.y + 5)); r.step(1 / 60); }
  ok(!god.over, 'GOD MODE shrugs off a Big Mac');
  ok(plain.over && plain.over.reason === 'wbc', 'with no FRENZY the same Big Mac eats you');
}
{ // HYPER FRENZY: acid cannot burn you
  const hyper = quiet(), plain = quiet();
  styled(hyper); hyper.p.combo = hyper.frenzyThreshold(3) - 1; hyper.addCombo('pass', 0, 0);
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
  const g = maxed(6), ga = new Race(g, mulberry(1), { seed: day }); ga.p.y = 3000; ga.spawnAhead();
  ok(ga.hzGen === 0 && lay(ga) === lay(a), 'a grandad generation gets the same daily layout too');
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
{ // the daily streak
  const m = newMeta(), run = (day) => { const r = new Race(m, mulberry(day), { seed: day }); r.rank = 9000; r.end('energy'); return r.over; };
  const d1 = run(800);
  ok(d1.streak === 1 && d1.dailyBonus === 25 && m.dailyStreak === 1, 'day 1 of a streak pays 25');
  const again = run(800);
  ok(again.dailyBonus === 0 && m.dailyStreak === 1, 'the bonus is paid once per day');
  let o = null; for (let d = 801; d <= 806; d++) o = run(d);
  ok(o.streak === 7 && o.dailyBonus === 25 * 7 * 2 && m.dailyStreak === 7, 'day 7 pays double');
  const gap = run(809);
  ok(gap.streak === 1 && m.dailyStreak === 1 && gap.dailyBonus === 25, 'a missed day resets the streak');
  ok(loadMeta(JSON.parse(JSON.stringify(m))).dailyLastDay === 809, 'the streak survives the save');
}

// ================================================================ correctness pass
{ // only the winner is #1: a loss with every rival behind you is still #2
  const m = veteran(); const r = new Race(m, mulberry(41), { events: false });
  r.agents.forEach((a) => { a.alive = false; }); r.rank = r.computeRank();
  r.end('energy');
  ok(r.over.rank === 2 && m.best === 2, 'a loss with everybody behind is recorded as #2, not #1 (' + r.over.rank + ')');
  const d = veteran(); const q = new Race(d, mulberry(42), { seed: 900, events: false }); q.agents.forEach((a) => { a.alive = false; }); q.rank = 1; q.end('late');
  ok(q.over.rank === 2 && d.dailyBest === 2, 'and the daily board gets #2 too');
}
{ // the death cause
  const run = (setup, reason) => { const r = quiet(); setup(r); r.end(reason); return r.over.cause; };
  ok(run((r) => { r.p.acidT = r.t - 1; }, 'energy') === 'acid', 'running dry right after an acid burn is cause acid');
  ok(run((r) => { r.p.zoneBonks = 3; }, 'energy') === 'bonk', '3+ goo bonks in the zone is cause bonk');
  ok(run(() => {}, 'energy') === 'energy' && run(() => {}, 'wbc') === 'wbc' && run(() => {}, 'late') === 'late' && run(() => {}, 'wrong') === 'wrong', 'otherwise the cause is the reason');
  const a = quiet(); a.p.e = 0.4; a.ents.push({ t: 'acid', x: a.p.x, y: a.p.y + 40, r: 60, seed: 1 });
  for (let i = 0; i < 120 && !a.over; i++) { a.input.tx = a.p.x; a.step(1 / 60); }
  ok(a.over && a.over.reason === 'energy' && a.over.cause === 'acid', 'melting to zero in a puddle is an acid death (' + (a.over && a.over.cause) + ')');
}
{ // bad steps change nothing; a NaN steering target is ignored
  const r = quiet(); r.p.y = 500; r.p.x = centre(500);
  const snap = () => JSON.stringify([r.t, r.p.x, r.p.y, r.p.e, r.p.vx]);
  const before = snap();
  for (const dt of [NaN, -1, 0, 5, Infinity]) r.step(dt);
  ok(snap() === before, 'step(NaN / -1 / 0 / 5 / Infinity) changes nothing');
  r.input.tx = NaN; for (let i = 0; i < 30; i++) r.step(1 / 60);
  ok(isFinite(r.p.x) && isFinite(r.p.vx) && r.p.y > 500, 'input.tx = NaN keeps p.x finite');
  const d = quiet(); atEgg(d, 0); d.startDrill(); const me = d.drill.me; d.stepDrill(NaN); d.stepDrill(-1);
  ok(d.drill.me === me && !d.over, 'stepDrill ignores bad steps too');
}
{ // generations: autopilot wins are practice, and the sat-nav waits for Gen 3
  const m = veteran(); const r = new Race(m, mulberry(7), { autopilot: true, events: false });
  r.agents.forEach((a) => { a.alive = false; }); atEgg(r, 0); r.startDrill();
  for (let t = 0; t < 30 && !r.over; t += 1 / 60) r.step(1 / 60);
  ok(r.won && r.over.auto && r.over.practice && m.gen === 0 && m.babies[0].practice, 'an autopilot win makes a practice baby but no new generation');
  ok(r.over.breakdown.place < 150, 'and pays no +150 win bonus');
  ok(Math.abs(r.over.breakdown.autoCut - (r.over.dna + r.over.breakdown.autoCut - r.over.breakdown.goal) * 0.6) <= 2, 'the autopilot keeps 40%');
  const g = newMeta(); ok(maxLv(g, 'gps') === 0 && (g.gen = 2, maxLv(g, 'gps') === 1), 'the sat-nav unlocks from generation 2');
  const old = loadMeta({ dna: 5, babies: [{ name: 'A', gen: 1, traits: [] }, { name: 'B', gen: 2, traits: [] }] });
  ok(old.babies.map((b) => b.gen).join() === '2,3' && old.ver === META_VER, 'an old save moves its babies up one generation');
  ok(loadMeta(JSON.parse(JSON.stringify(old))).babies.map((b) => b.gen).join() === '2,3', 'and only once');
}

// ================================================================ rival threat
{ // the run announces who it is against
  const r = quiet(); r.step(1 / 60);
  const t = r.events.filter((e) => e.type === 'threat');
  ok(t.length === 1 && t[0].k === r.threatK && r.threatK >= 0, 'one threat event on the first step names threatK');
  r.events.length = 0; r.step(1 / 60); ok(!types(r).includes('threat'), 'only once');
  const ks = new Set(); for (let s = 0; s < 30; s++) ks.add(new Race(newMeta(), mulberry(s)).threatK);
  ok(ks.size >= 2, 'the threat changes between runs (' + [...ks].join(',') + ')');
  const R0 = new Race(newMeta(), mulberry(5)), tOf = (k) => R0.agents[k].T;
  ok(RIVALS.every((R, k) => tOf(k) >= 112 * 0.96 - 1e-9 && tOf(k) <= 132 * 1.04 + 1e-9), 'every named rival aims to reach the egg in 112-132 s at gen 0');
}
{ // who takes the egg changes from run to run
  const by = {}; let late = 0;
  for (let s = 1; s <= 40; s++) { const r = sim(maxed(0), 2000 + s, 600, null, { bot: true, dt: 1 / 30 }); if (r.over.reason === 'late' && r.over.by) { late++; by[r.over.by] = (by[r.over.by] || 0) + 1; } }
  const top = Math.max(...Object.values(by));
  ok(Object.keys(by).length >= 3 && top <= 0.45 * late, 'over 40 runs 3+ different rivals take the egg, none more than 45% (' + JSON.stringify(by) + ')');
}

// ================================================================ the egg finale
{ // a Big Macro mid-snack barely moves, and sulks after a dodge
  const r = quiet(); const w = wbcAt(r.p.x + 200, r.p.y + 100); w.hunt = 1; w.vx = -170; r.ents.push(w);
  const a = r.agents[RIVALS.length + 2]; a.alive = true; a.y = w.y; a.lane = 0; a.kx = 0; w.x = r.agentX(a);
  const x0 = w.x; r.stepEnts(1 / 60, false, false, 0);
  ok(w.eat > 0.8 && w.hunt <= 0.3, 'a snack starts with 0.9 s of eating and drops the lock to 0.3');
  for (let t = 0; t < 0.5; t += 1 / 60) r.stepEnts(1 / 60, false, false, 0);
  ok(Math.abs(w.x - x0) <= 30, 'an eating Big Macro moves at most 30 sideways in 0.5 s (' + Math.abs(w.x - x0).toFixed(1) + ')');
  const c = quiet(); const v = wbcAt(c.p.x + 300, c.p.y + 50); v.paid = 1; v.cool = 2.5; v.hunt = 0; c.ents.push(v);
  for (let t = 0; t < 1; t += 1 / 60) c.stepEnts(1 / 60, false, false, 0);
  ok(v.hunt === 0, 'a dodged Big Macro waits 2.5 s before it locks on again');
}

// ================================================================ combo depth
{ // the same kind in a row is worth less; mixing is worth more
  const pure = quiet(), mix = quiet(), kinds = ['pass', 'close', 'gate'];
  for (let i = 0; i < 12; i++) { pure.addCombo('pass', 0, 0); mix.addCombo(kinds[i % 3], 0, 0); }
  ok(pure.p.combo === 3 + 8 * 0.5 + 0.25 && mix.p.combo === 12, '12 passes in a row are 7.25 links, 12 mixed are 12 (' + pure.p.combo + ')');
  ok(mix.fzPoints() > pure.fzPoints(), 'and mixing climbs FRENZY faster');
  ok(Math.abs(pure.p.comboT - pure.p.comboMax * 0.4) < 1e-9 && mix.p.comboT === mix.p.comboMax, 'spam refills the timer to 40%, a fresh kind refills it all');
  const p4 = quiet(); for (let i = 0; i < 4; i++) p4.addCombo('pass', 0, 0);
  ok(Math.abs(p4.p.comboT - p4.p.comboMax * 0.65) < 1e-9, 'from the 4th same-kind link the timer only refills to 65%');
}
{ // FRENZY tiers need STYLE
  const one = quiet(); one.p.combo = one.frenzyThreshold(2) + 1; one.p.comboT = 1; one.addCombo('pass', 0, 0);
  const three = quiet(); three.p.kinds = ['pass', 'close']; three.p.combo = three.frenzyThreshold(4) + 1; three.p.comboT = 1; three.addCombo('gate', 0, 0);
  const four = styled(quiet()); four.p.combo = four.frenzyThreshold(4) + 1; four.p.comboT = 1; four.addCombo('pop', 0, 0);
  ok(one.p.tier === 1 && three.p.tier === 3 && four.p.tier === 5, 'one kind tops out at tier 1, three kinds at tier 3, four reach GOD MODE (' + [one.p.tier, three.p.tier, four.p.tier].join('/') + ')');
}
{ // CLUTCH: a link in the last quarter of the timer is +1 and grows the bank
  const r = quiet(); r.addCombo('pass', 0, 0); r.addCombo('close', 0, 0);
  const n0 = r.p.combo; r.p.comboT = r.p.comboMax * 0.2; r.events.length = 0; r.addCombo('gate', 0, 0);
  const c = r.events.find((e) => e.type === 'clutch');
  ok(r.p.combo === n0 + 2 && c && c.n === n0 + 2 && Math.abs(r.p.clutch - 0.1) < 1e-9, 'a clutch link is +1 bonus link, +0.1 bank multiplier and says so');
  r.p.comboT = r.p.comboMax * 0.5; const n1 = r.p.combo; r.addCombo('pass', 0, 0);
  ok(r.p.combo === n1 + 1 && Math.abs(r.p.clutch - 0.1) < 1e-9, 'a link with half the timer left is not a clutch');
  r.p.clutch = 0.5; const bank = r.p.bank, style = r.p.style; r.events.length = 0; r.p.comboT = 0.001; r.step(1 / 60);
  const b = r.events.find((e) => e.type === 'comboBank');
  ok(b && Math.abs(b.dna - Math.round(bankDna(bank, style) * 1.5 * 10) / 10) < 1e-9 && r.p.clutch === 0, 'the clutch multiplier pays on the bank and resets');
  const br = quiet(); br.addCombo('pass', 0, 0); br.addCombo('close', 0, 0); br.p.clutch = 0.3; br.addCombo('gate', 0, 0); br.p.shield = 1;
  br.ents.push(wbcAt(br.p.x, br.p.y + 5)); br.events.length = 0; br.step(1 / 60);
  ok(types(br).includes('comboBreak') && !types(br).includes('comboBank') && br.p.clutch === 0 && br.p.bank === 0, 'a broken chain banks nothing and loses its clutch');
}
{ // FINISHER: cash the chain out on purpose
  const plain = quiet(), slick = styled(quiet());
  for (const r of [plain, slick]) for (let i = 0; i < 20; i++) r.addCombo(['pass', 'close', 'pass', 'gate'][i % 4], 0, 0);
  slick.p.kinds = ['pass', 'close', 'gate', 'pop', 'pass', 'close', 'gate', 'pop']; slick.p.style = 4;
  const exp = (r) => Math.round(bankDna(r.p.bank, r.p.style) * (r.p.style >= 4 ? 1.5 : 1.25) * 10) / 10;
  const e1 = exp(plain), e2 = exp(slick);
  for (const r of [plain, slick]) { r.events.length = 0; r.input.cashOut = true; r.step(1 / 60); }
  const b1 = plain.events.find((e) => e.type === 'comboBank'), b2 = slick.events.find((e) => e.type === 'comboBank');
  ok(b1 && b1.finisher && b1.dna === e1 && finisherMult(3) === 1.25, 'a FINISHER banks at x1.25');
  ok(b2 && b2.finisher && b2.dna === e2 && finisherMult(4) === 1.5, 'and x1.5 with STYLE 4+');
  ok(plain.p.combo === 0 && plain.p.bank === 0 && !plain.input.cashOut, 'then the chain starts over and the input is consumed');
}

// ================================================================ onboarding and the meta curve
{ // rookie grace: the first three runs are gentler, worked out from the save
  const ts = [];
  for (let s = 1; s <= 10; s++) {
    const r = new Race(newMeta(), mulberry(900 + s));
    while (!r.over && r.t < 200) { r.step(1 / 30); if (r.pending) r.choose(r.pending[0]); r.events.length = 0; }
    ts.push(r.t);
  }
  ts.sort((a, b) => a - b);
  ok(ts[5] >= 55, 'an idle first run survives 55+ s (median ' + ts[5].toFixed(0) + ' s)');
  const vet = (runs) => { const m = newMeta(); m.runs = runs; return new Race(m, mulberry(1), { events: false }); };
  ok(vet(0).rookie === 0.55 && vet(1).rookie === 0.7 && vet(2).rookie === 0.85 && vet(3).rookie === 0 && vet(5).rookie === 0, 'drain and acid x0.55 / 0.7 / 0.85 for runs 0-2, then full');
  ok(new Race(newMeta(), mulberry(1), { seed: 99 }).rookie === 0, 'never in the daily');
  const drain = (runs, zi) => { const r = vet(runs); r.agents.forEach((a) => { a.alive = false; }); r.ents = []; r.genY = 1e9; r.zoneReached = zi; r.midDraft = true; r.p.y = ZSTART[zi] + 500; r.p.e = 100; for (let i = 0; i < 60; i++) r.step(1 / 60); return 100 - r.p.e; };
  ok(Math.abs(drain(0, 0) - 4.3 * 0.55) < 0.05 && Math.abs(drain(5, 0) - 4.3) < 0.05 && Math.abs(drain(0, 3) - 4.3 * 1.15) < 0.05, 'the rookie drain lasts until zone 3; a veteran gets the full drain');
  const bite = vet(0); bite.agents.forEach((a) => { a.alive = false; }); bite.ents = []; bite.genY = 1e9; bite.zoneReached = 3;
  bite.ents.push(wbcAt(bite.p.x, bite.p.y + 5)); bite.step(1 / 60);
  const first = !bite.over && types(bite).includes('shieldHit');
  bite.p.inv = 0; bite.ents.push(wbcAt(bite.p.x, bite.p.y + 5)); bite.step(1 / 60);
  ok(first && bite.over && bite.over.reason === 'wbc', 'a rookie survives the first Big Macro bite in a zone, not the second');
  const goo = vet(0); goo.agents.forEach((a) => { a.alive = false; }); goo.ents = []; goo.genY = 1e9; goo.p.y = 500; goo.p.x = centre(500) - 60;
  goo.ents.push(gateAt(520, centre(520) + 80)); goo.p.e = 100; for (let i = 0; i < 20 && !types(goo).includes('bonk'); i++) goo.step(1 / 60);
  ok(Math.abs(goo.p.stuck - 0.24) < 0.02, 'a rookie goo bonk sticks for 0.24 s instead of 0.4');
  const sugar = (runs) => { let n = 0; for (let d = 0; d < 6; d++) { const m = newMeta(); m.runs = runs; const r = new Race(m, mulberry(d), { seed: null, events: false }); r.p.y = 6500; r.spawnAhead(); n += r.ents.filter((e) => e.t === 'sugar').length; } return n; };
  ok(sugar(0) > sugar(5) * 1.15, 'the very first Launch Tube has more fruit (' + sugar(0) + ' vs ' + sugar(5) + ')');
}
{ // photo finish and the egg-loss comeback
  const m = veteran(); const r = new Race(m, mulberry(51), { events: false }); r.agents.forEach((a) => { a.alive = false; }); atEgg(r, 0); r.startDrill(); r.drill.me = r.drill.need * 0.5;
  const a = r.agents[2]; a.alive = true; a.arrived = true; a.y = RACE_LEN - 70; a.need = 4; a.drill = 3.999; r.step(1 / 60);
  ok(r.over.reason === 'late' && r.over.breakdown.photo === Math.round(90 * clamp01(r.drill.me / r.drill.need)) && r.over.breakdown.photo >= 44, 'a photo finish pays 90 x how far you drilled (' + r.over.breakdown.photo + ')');
  ok(m.eggLosses === 1, 'and counts an egg loss');
  m.eggLosses = 9; const r2 = new Race(m, mulberry(52), { events: false });
  ok(Math.abs(r2.eggBoost() - 1.24) < 1e-9 && Math.abs(new Race(veteran(), mulberry(1)).eggBoost() - 1) < 1e-9, 'each egg loss in a row drills 6% faster, capped at +24%');
  const w = new Race(m, mulberry(53), { events: false }); w.agents.forEach((q) => { q.alive = false; }); atEgg(w, 0); w.startDrill(); w.drill.me = w.drill.need; w.step(1 / 60);
  ok(w.won && m.eggLosses === 0, 'a win resets the egg-loss count');
}

// ================================================================ cards: new synergies, golden draft, pity
{
  ok(['afterburner', 'couchPotato', 'hazmat', 'bloodhound'].every((id) => SYNERGIES.some((x) => x.id === id)) && MUTATIONS.turbo.max === 3, 'four new synergies, and Turbo Tail stops at 3');
  // Afterburner: longer dashes, and a dash in FRENZY stretches it
  const ab = quiet(), pl = quiet(); give(ab, 'turbo', 'whip'); give(pl, 'whip');
  for (const r of [ab, pl]) { r.p.frenzyT = 2; r.p.tier = 1; r.p.e = 50; r.input.dash = true; r.step(1 / 60); }
  ok(ab.syn.afterburner && ab.p.dashT > pl.p.dashT * 1.35 && ab.p.frenzyT > pl.p.frenzyT + 0.25, 'Afterburner: dashes last 40% longer and add 0.3 s of FRENZY');
  // Couch Potato: drafting is free and pays links
  const mkDraft = (ids) => { const r = quiet(); give(r, ...ids); const a = r.agents[RIVALS.length]; a.alive = true; a.y = r.p.y + 40; a.lane = 0; a.kx = 0; a.sp = 445 * 1.2; r.p.x = r.agentX(a); return r; };
  const cp = mkDraft(['eco', 'draft']), dr = mkDraft(['draft']);
  for (let i = 0; i < 120; i++) for (const r of [cp, dr]) { const a = r.agents[RIVALS.length]; a.y = r.p.y + 40; r.p.x = r.agentX(a); r.input.tx = r.p.x; r.step(1 / 60); }
  ok(cp.syn.couchPotato && cp.p.e >= 100 - 1e-9 && cp.p.combo >= 1 && dr.p.combo === 0, 'Couch Potato: no drain while drafting and +1 combo per 1.5 s (' + cp.p.e.toFixed(1) + ', ' + cp.p.combo + ')');
  // Hazmat: a touch is a near miss
  const hz = quiet(), no = quiet(); give(hz, 'antacid', 'goo'); give(no, 'antacid');
  for (const r of [hz, no]) { r.ents.push({ t: 'acid', x: r.p.x, y: r.p.y + 10, r: 40, seed: 1 }); r.step(1 / 60); }
  ok(hz.syn.hazmat && hz.p.combo === 1 && no.p.combo === 0, 'Hazmat: touching acid counts as a near miss');
  // Bloodhound: the right tube lights FRENZY, and overtakes count double in the next zone
  const bh = quiet(); give(bh, 'nose', 'rush'); bh.zoneReached = 4; bh.p.y = FORK_Y0 - 2; bh.p.x = channel(FORK_Y0 + 400, bh.eggSide).c; bh.input.tx = bh.p.x; bh.step(1 / 60); bh.step(1 / 60);
  ok(bh.syn.bloodhound && bh.p.side === bh.eggSide && bh.p.frenzyT > 0, 'Bloodhound: the right tube at the Fork starts FRENZY');
  const ov = quiet(); give(ov, 'nose', 'rush'); ov.zoneReached = FORK_I() + 1; ov.p.side = ov.eggSide; ov.p.y = ZSTART[FORK_I() + 1] + 2000;
  const b = ov.agents[RIVALS.length + 1]; b.alive = true; b.side = ov.eggSide; b.lane2 = 0; b.kx = 0; b.sp = 0; b.y = ov.p.y + 5; ov.prevPY = ov.p.y; ov.p.x = ov.agentX(b); ov.p.y += 10; ov.stepAgents(1 / 60);
  ok(ov.p.combo === 2 && ov.p.overtakes === 2, 'and an overtake in the next zone counts double');
}
{ // the golden draft and legendary pity
  let bad = 0, legs = 0, n = 0;
  for (let s = 0; s < 300; s++) {
    const r = quiet(); r.orng = mulberry(5000 + s); r.p.y = MID_DRAFT_Y; r.draftN = 3; r.draft(true);
    const o = r.events.find((e) => e.type === 'offer');
    if (!o.golden || r.pending.length !== 4 || r.pending.some((id) => MUTATIONS[id].r < 2) || r.pending.filter((id) => MUTATIONS[id].r === 3).length > 1) bad++;
    if (r.pending.some((id) => MUTATIONS[id].r === 3)) legs++; n++;
  }
  ok(bad === 0, 'a golden draft is 4 cards, rare or better, at most one legendary');
  ok(legs / n >= 0.6, 'and usually has a legendary (' + Math.round(100 * legs / n) + '%)');
  const plain = quiet(); plain.draft(false); ok(!plain.events.find((e) => e.type === 'offer').golden && plain.pending.length === 3, 'a normal deal is 3 cards, not golden');
  let pityMiss = 0;
  for (let s = 0; s < 300; s++) { const r = quiet(); r.orng = mulberry(7000 + s); r.noLeg = 3; r.draftN = 1; r.offer(); if (!r.pending.some((id) => MUTATIONS[id].r === 3)) pityMiss++; if (r.noLeg !== 0) pityMiss++; }
  ok(pityMiss === 0, 'three deals without a legendary guarantee one in the next, and reset the count');
  const c = quiet(); c.orng = () => 0; c.draftN = 1; c.offer(); const k1 = c.noLeg; ok(c.pending.some((id) => MUTATIONS[id].r === 3) ? k1 === 0 : k1 === 1, 'the pity counter counts deals without a legendary');
}

// ================================================================ the next goal
{
  const m = veteran();
  const lost = nextGoal(m, { reason: 'late', by: 'Chad', zone: 6, combo: 10 });
  ok(lost.id === 'beatRival' && lost.k === 4 && lost.dna === 30 && m.goal === lost, 'losing the egg to Chad sets a beat-Chad goal worth 30');
  ok(nextGoal(m, { reason: 'energy', zone: 5, combo: 10 }).id === 'reachEgg' && m.goal.dna === 40, 'dying in zone 5+ sets reach the egg (40)');
  m.goal = null; const z = nextGoal(m, { reason: 'energy', zone: 1, combo: 10 });
  ok(z.id === 'reachZone' && z.target === 3 && z.dna === 20, 'an early death sets reach zone + 2 (20)');
  const c = nextGoal(m, { reason: 'win', zone: 6, combo: 33 });
  ok(c.id === 'combo' && c.target === 38 && c.dna === 15, 'a win sets a combo goal (+5, 15)');
  const g4 = veteran(); g4.gen = 4; ok(nextGoal(g4, { reason: 'energy', zone: 0, combo: 1 }).dna === Math.round(20 * genFactor(4)), 'goals scale with the generation');
  ok(goalMet({ id: 'reachZone', target: 3 }, { zone: 3 }) && !goalMet({ id: 'reachZone', target: 3 }, { zone: 2 }) && goalMet({ id: 'beatRival', k: 4 }, { beaten: ['Chad'] }), 'goalMet checks the run');
  // a run sets a goal; the next run that meets it gets paid
  const s = veteran(); const r1 = new Race(s, mulberry(61), { events: false }); r1.zoneReached = 1; r1.end('energy');
  ok(r1.over.nextGoal && r1.over.nextGoal.id === 'reachZone' && s.goal.target === 3, 'the result carries the next goal');
  const r2 = new Race(s, mulberry(62), { events: false }); r2.zoneReached = 2; r2.end('energy');
  ok(!r2.over.goalDone && r2.over.breakdown.goal === 0, 'a run that misses it pays nothing');
  s.goal = { id: 'reachZone', target: 3, dna: 20, k: -1 };
  const r3 = new Race(s, mulberry(63), { events: false }); r3.zoneReached = 3; const d0 = s.dna; r3.end('energy');
  ok(r3.over.goalDone && r3.over.goalDone.dna === 20 && r3.over.breakdown.goal === 20 && s.dna - d0 === r3.over.dna, 'the next run that meets it pays it as breakdown.goal');
  const bad = loadMeta({ goal: { id: 'hack', dna: 1e9 }, eggLosses: -3, bestStreak: 'x', ver: 'v' });
  ok(bad.goal === null && bad.eggLosses === 0 && bad.bestStreak === 0 && bad.ver === META_VER, 'a damaged goal and the new fields are cleaned up');
  const keep = loadMeta(JSON.parse(JSON.stringify(s)));
  ok(JSON.stringify(keep.goal) === JSON.stringify(s.goal) && loadMeta({ goal: { id: 'beatRival', k: 99, dna: 30 } }).goal === null, 'a good goal survives the save, a bad rival index does not');
  const st = newMeta(); for (let d = 300; d < 304; d++) { const q = new Race(st, mulberry(d), { seed: d }); q.rank = 9000; q.end('energy'); }
  ok(st.bestStreak === 4 && loadMeta(JSON.parse(JSON.stringify(st))).bestStreak === 4, 'bestStreak keeps the longest daily streak');
}

console.log(`million_to_one_core: ${passed} passed, ${failed} failed`);
if (failed) process.exitCode = 1;
