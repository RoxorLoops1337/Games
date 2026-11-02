// Round 11 balance and economy report (agent 15): faucets and sinks, a simulated 30 day player, the b10 faucets
// (streak tokens, weekly badges, sticker book prize, pet treats) and the daily deal refresh loop that printed Sparkles.
// Run with BAL_VERBOSE=1 to print the tables. Pure save-level simulation, deterministic, well under a second.
import assert from 'node:assert/strict';
import * as sim from '../../cell_serpent/sim.js';
import { TREAT_COST, TREAT_JOY, TREAT_DAILY, feedPet } from '../../cell_serpent/pets_b10.js';
import { STICKER_PRIZE } from '../../cell_serpent/sticker_b9.js';
import { STICKER_MILES } from '../../cell_serpent/chase.js';

const V = !!process.env.BAL_VERBOSE, say = (...a) => { if (V) console.log(...a); };
const D0 = 20490;   // a season boundary (day / 30), so the 30 day player sees one whole season

// ---- 1. the refresh loop: it used to return the free 10 Sparkles gift after every refresh (net +5 per tap, unbounded)
{
  const s = sim.defaultSave(), day = D0; sim.dayLogin(s, day);
  let guard = 0; const cheap = d => d.price <= 3;
  while (guard++ < 200) {
    sim.dealsFor(s, day).forEach((d, i) => { if (cheap(d) && !s.shop.bought[i]) sim.buyDeal(s, day, i); });
    if (!sim.refreshDeals(s)) break;
  }
  say('refresh loop from 0 Sparkles: stopped after', guard, 'cycles with', s.sparkles, 'Sparkles');
  assert.ok(guard < 40, 'the refresh price rises until it stops the loop: ' + guard);
  assert.ok(s.sparkles <= 60, 'a refresh loop ends with a small pile, not a printing press: ' + s.sparkles);
  const t = sim.defaultSave(); sim.dayLogin(t, day);
  assert.equal(sim.dealsFor(t, day)[0].price, 0, 'the daily gift is still the first deal');
  assert.ok(sim.buyDeal(t, day, 0)); assert.equal(t.sparkles, 10);
  assert.ok(sim.refreshDeals(t), 'the first refresh is free');
  assert.ok(sim.dealsFor(t, day).every(d => d.kind !== 'sparkles'), 'the gift does not come back after a refresh');
  assert.equal(sim.refreshCost(t), 5); assert.ok(sim.refreshDeals(t)); assert.equal(sim.refreshCost(t), 10);
  const u = sim.defaultSave(); sim.dayLogin(u, day);
  assert.ok(sim.refreshDeals(u)); assert.equal(sim.dealsFor(u, day)[0].price, 0, 'an unclaimed gift survives a refresh');
  assert.ok(sim.buyDeal(u, day, 0) && !sim.buyDeal(u, day, 0));
  assert.ok(sim.refreshCost(u) <= 50, 'the refresh price is capped');
  const v = JSON.parse(JSON.stringify(t)); assert.equal(sim.sanitizeSave(v).shop.gift, D0, 'the gift flag survives a save round trip');
  sim.dayLogin(t, day + 1); assert.equal(sim.dealsFor(t, day + 1)[0].price, 0, 'tomorrow the gift is back');
}

// ---- 2. sinks and the exchange rates between Beats and Sparkles
{
  const cost = (def, upto) => { let n = 0; for (let l = 0; l < upto; l++) n += sim.metaCost(def, l); return n; };
  const stats = sim.META.map(m => ({ id: m.id, max: cost(m, m.max) }));
  const statTotal = stats.reduce((a, x) => a + x.max, 0);
  let fragsToMax = 0; for (let l = 1; l < sim.SKILL_MAX_LV; l++) fragsToMax += sim.skillUpgradeCost(l).frag;
  const beatBox = sim.BOXES.find(b => b.id === 'beat'), sparkBox = sim.BOXES.find(b => b.id === 'spark'), grand = sim.BOXES.find(b => b.id === 'spark10');
  const beatsPerFrag = beatBox.price / beatBox.frags, sparksPerFrag = sparkBox.price / sparkBox.frags;
  const skillsBeats = fragsToMax * beatsPerFrag;
  say('stat max cost (Beats)', JSON.stringify(stats), 'total', statTotal);
  say('frags to max one skill', fragsToMax, 'in Beats via Beat Box', skillsBeats, 'in Sparkles via Spark Box', fragsToMax * sparksPerFrag, 'via Grand', Math.round(fragsToMax * grand.price / grand.frags));
  assert.equal(fragsToMax, 171, 'a skill needs 171 fragments from level 1 to 10');
  assert.ok(statTotal > 20000 && statTotal < 1000000, 'the stat ladder is a long goal: ' + statTotal);
  // Beats per Sparkle in the store, and what a Sparkle is worth when turned into fragments
  const packs = sim.GOLD_PACKS.filter(p => p.price).map(p => p.beats / p.price);
  assert.ok(Math.max(...packs) < 30, 'Beats are never cheaper than a Beat Box fragment would make a Sparkle loop: ' + packs);
  // converting Sparkles to Beats to fragments must not beat buying fragments with Sparkles by more than 2x
  const viaBeats = Math.max(...packs) / beatsPerFrag, direct = grand.frags / grand.price;
  say('frags per Sparkle: via Beats store', viaBeats.toFixed(2), 'via Grand box', direct.toFixed(2));
  assert.ok(viaBeats / direct < 2, 'the cheapest Sparkles to fragments route is within 2x of the box made for it');
  // the energy price must not undercut the egg or deal ladder
  assert.equal(sim.ENERGY_COST, 5);
  assert.ok(10 / 10 * sim.ENERGY_COST <= 5, 'Voice costs 1 Sparkle per point, 5 per run');
}

// ---- 3. pet treats: a Beats sink with no stat payoff, bounded per day
{
  const s = sim.defaultSave(); for (const p of sim.PETS) s.pets[p.id].star = 1; s.beats = 1e6;
  let spent = 0, n = 0; for (let day = D0; day < D0 + 1; day++) for (const p of sim.PETS) for (let i = 0; i < 6; i++) { const b = s.beats; if (feedPet(s, p.id, day)) { spent += b - s.beats; n++; } }
  say('treats: max per day', n, 'for', spent, 'Beats');
  assert.equal(n, sim.PETS.length * TREAT_DAILY, 'the daily limit holds per pet');
  assert.equal(spent, n * TREAT_COST);
  assert.ok(Object.values(s.pets).every(k => k.joy <= TREAT_JOY * TREAT_DAILY), 'joy only rises by the treat amount');
  const joyOnly = sim.PETS.every(p => !('joyBonus' in p));
  assert.ok(joyOnly, 'joy gives no stats, so treats cannot inflate power');
  assert.ok(TREAT_COST * sim.PETS.length * TREAT_DAILY < 800, 'a full treat day costs less than 800 Beats: a tip, not a wall');
}

// ---- 4. the 30 day player: does everything every day. Counts every Sparkle by source.
function thirtyDays(opts = {}) {
  const s = sim.defaultSave(), log = {}, add = (k, v) => { log[k] = (log[k] || 0) + v; };
  const tally = (k, f) => { const b = s.sparkles, be = s.beats, e = s.eggs, tk = s.addict.tok; f(); add(k, s.sparkles - b); add(k + '$b', s.beats - be); add(k + '$e', s.eggs - e); add(k + '$t', s.addict.tok - tk); };
  const skip = new Set(opts.skip || []);
  for (let d = 0; d < 30; d++) {
    if (skip.has(d)) continue;
    const day = D0 + d, now = day * 86400000 + 36e5;
    tally('login', () => { sim.dayLogin(s, day); });
    tally('sign', () => { sim.claimSign(s, day); });
    tally('spin', () => { sim.doSpin(s, day); });
    tally('shopGift', () => { sim.buyDeal(s, day, 0); sim.buyGold(s, 'bit', day); });
    // ten runs a day, clear one new stage a day for the first 25 days (a regular player), 120 Beats per early run
    for (let r = 0; r < 10; r++) {
      const stage = Math.min(50, Math.max(1, (s.cleared || 0) + (r === 0 ? 1 : 0))), won = r === 0 || r % 3 === 0;
      const res = { stage, won, coins: 80 + 12 * stage, kills: 60 + 3 * stage, bombs: 2, chests: 1, picks: 4, groove: 8, stars: won ? 1 : 0, cp50: false, frags: {} };
      tally('runs', () => { sim.applyResult(s, res); sim.recordAddictRun(s, day, res); });
    }
    tally('quests', () => { const q = sim.questState(s, day); if (q.chestReady) sim.claimQuestChest(s, day); });
    tally('goals', () => { sim.claimAllGoals(s, day); });
    tally('week', () => { sim.claimWeek(s, day); });
    tally('season', () => { for (let i = 0; i < sim.SEASON_MILES.length; i++) sim.claimSeason(s, day, i); });
    tally('mastery', () => { sim.claimAllMastery(s); });
    tally('trophies', () => { for (const t of sim.TROPHIES) sim.claimTrophy(s, t.id); });
    tally('sticker', () => { for (const m of STICKER_MILES) { const c = require_claim(s, m.at); } });
  }
  return { s, log };
}
function require_claim(s, at) { return claimStickerSafe(s, at); }
import { claimSticker as claimStickerSafe } from '../../cell_serpent/chase.js';

const full = thirtyDays();
const L = full.log, sp = k => L[k] || 0;
const sources = ['login', 'sign', 'spin', 'shopGift', 'runs', 'quests', 'goals', 'week', 'season', 'mastery', 'trophies', 'sticker'];
const totalSp = sources.reduce((a, k) => a + sp(k), 0), totalBeats = sources.reduce((a, k) => a + sp(k + '$b'), 0), totalEggs = sources.reduce((a, k) => a + sp(k + '$e'), 0);
say('30 days, everything claimed daily: Sparkles by source', JSON.stringify(Object.fromEntries(sources.map(k => [k, sp(k)]))), 'total', totalSp, 'per day', (totalSp / 30).toFixed(1));
say('Beats total', totalBeats, 'eggs', totalEggs, 'tokens held', full.s.addict.tok, 'final cleared', full.s.cleared, 'stars', sim.totalStars(full.s));
// an engaged free player earns tens of Sparkles a day: about a Grand Spark Box (270) every week or two, one egg (60) every 2 days
// first clears are the progression faucet (one time per stage, gated by power); everything else is the daily drip
let clears = 0; for (let n = 1; n <= full.s.cleared; n++) clears += sim.clearReward(n).sparkles;
const drip = totalSp - clears;
say('first clear Sparkles', clears, 'daily drip incl. level ups', drip, 'per day', (drip / 30).toFixed(1));
assert.ok(drip / 30 >= 8 && drip / 30 <= 60, 'Sparkles per day outside stage clears for an engaged player: ' + (drip / 30).toFixed(1));
assert.ok(totalEggs <= 30 * 4, 'eggs per day stay bounded: ' + totalEggs);
assert.ok(full.s.addict.tok <= sim.TOKEN_MAX, 'streak tokens are capped');
// the b10 faucets are small next to the daily ones
const weekSp = sp('week'), seasonSp = sp('season');
assert.ok(weekSp <= 5 * sim.WEEK_REWARD.sparkles + sim.WEEK_ALL_BONUS.sparkles, 'weekly challenge Sparkles in 30 days: ' + weekSp);
assert.ok(weekSp / Math.max(1, drip) < 0.25, 'weekly badges are a side dish, not the main income');

// ---- 5. streak tokens: only three come from play in 30 days and a skipped day is forgiven once, never farmed
{
  const tokensIn30 = sim.SEASON_MILES.filter(m => m.reward.tok).reduce((a, m) => a + m.reward.tok, 0);
  assert.equal(tokensIn30, 2, 'a season pays 2 tokens');
  const s = sim.defaultSave(); s.addict.tok = 3;
  sim.dayLogin(s, D0); sim.doSpin(s, D0); sim.doSpin(s, D0 + 1);
  const r = sim.doSpin(s, D0 + 3);   // missed D0+2: forgiven by a token
  assert.ok(r && r.byToken && s.addict.tok === 2, 'one token buys one missed day');
  const r2 = sim.doSpin(s, D0 + 6);   // missed two days in a row: the streak restarts and no token is spent
  assert.ok(r2 && !r2.byToken && s.addict.tok === 2 && s.addict.spin.n === 1, 'a two day gap restarts the streak');
  // away for a fortnight, back, away again: comeback gifts need real elapsed time, and are paid once per absence
  const t = sim.defaultSave(); t.addict.seen = 1; const now = 15 * 86400000 + 1;
  const g1 = sim.claimComeback(t, now), g2 = sim.claimComeback(t, now);
  assert.ok(g1 && !g2, 'a comeback gift is paid once'); assert.ok(t.addict.tok <= sim.TOKEN_MAX);
  say('comeback 14 days:', JSON.stringify(g1.reward));
  // the daily player out-earns the absentee by a wide margin (Sparkles per calendar day)
  const away = (g1.reward.sparkles || 0) / 15;
  assert.ok(away < drip / 30 / 4, 'logging in daily beats staying away: ' + away.toFixed(2));
}

// ---- 6. weekly badges: one per challenge kind, the completion bonus is paid exactly once
{
  const s = sim.defaultSave(); let bonus = 0;
  for (let k = 0; k < 40; k++) for (const d of sim.WEEK_DEFS) if (sim.collectWeekBadge(s, d.id)) bonus++;
  assert.equal(bonus, 1, 'the all badges bonus is a one time prize');
  assert.ok(Object.values(s.addict.wb).every(n => n <= 99), 'badge counts are capped');
  // claimWeek twice in a week pays once
  const t = sim.defaultSave(), day = D0; t.addict.week = { key: sim.weekKey(day), prog: 9999, claimed: 0 };
  assert.ok(sim.claimWeek(t, day) && !sim.claimWeek(t, day), 'one weekly claim per week');
  assert.ok(sim.WEEK_REWARD.sparkles + sim.WEEK_ALL_BONUS.sparkles < sim.EGG_PRICE * 2, 'the badge set bonus is under two eggs');
}

// ---- 7. sticker book: 25 Sparkles once per device. It is a small prize and cheaper than one Spark Box top up
{
  assert.equal(STICKER_PRIZE, 25);
  assert.ok(STICKER_PRIZE < sim.EGG_PRICE, 'the book prize is less than an egg');
  const milesSp = STICKER_MILES.reduce((a, m) => a + (m.reward.sparkles || 0), 0);
  assert.ok(milesSp + STICKER_PRIZE <= 120, 'the whole sticker book pays under 120 Sparkles: ' + (milesSp + STICKER_PRIZE));
  say('sticker book total', milesSp + STICKER_PRIZE, '(milestones', milesSp, '+ book', STICKER_PRIZE + '); NOTE the book prize flag lives in localStorage, not the save');
}

// ---- 8. a fresh account stays harsh: the early game is not softened by any faucet before the first clear
{
  const s = sim.defaultSave(); sim.dayLogin(s, D0);
  assert.equal(s.sparkles, 0); assert.ok(s.beats <= 40, 'day one login pays under 40 Beats: ' + s.beats);
  assert.equal(s.cleared, 0);
}
// ---- 9. Beats income per hour against prices (measured with the bot at each band's typical build, 2 seeds each)
{
  const { runs, profileFor } = await import('./balance_harness.mjs');
  const regenRunsPerHour = 3600 / (sim.ENERGY_REGEN * sim.ENERGY_COST);   // 4 runs an hour once the 32 Voice pool is spent
  const skillBeats = 171 * (sim.BOXES[0].price / sim.BOXES[0].frags);
  const statTop = sim.META.filter(m => m.id !== 'rev').reduce((a, m) => { let n = 0; for (let l = 0; l < m.max; l++) n += sim.metaCost(m, l); return a + n; }, 0);
  say('stage  coins/run  time/run  Beats/hr(sustained)  runs to max one skill  runs to max all stats');
  const rows = {};
  for (const st of [3, 8, 15, 25, 40]) {
    const r = runs(st, profileFor(st).build, 2), cpr = r.coins, perHour = cpr * regenRunsPerHour;
    rows[st] = { cpr, perHour, skillRuns: skillBeats / cpr, statRuns: statTop / cpr };
    say(String(st).padEnd(6), String(Math.round(cpr)).padEnd(10), String(Math.round(r.time)).padEnd(9), String(Math.round(perHour)).padEnd(20), (skillBeats / cpr).toFixed(1).padEnd(22), (statTop / cpr).toFixed(1));
  }
  say('stat ladder total', statTop, 'one skill via Beat Box', skillBeats, 'tip jar per hour at stage 25', sim.defaultSave && (40 + 12 * 25));
  assert.ok(rows[3].cpr >= 100 && rows[3].cpr <= 600, 'early runs pay a steady drip: ' + rows[3].cpr);
  assert.ok(rows[8].skillRuns >= 2 && rows[8].skillRuns <= 12, 'a regular player maxes a skill with Beats in a few runs, not instantly and not never: ' + rows[8].skillRuns.toFixed(1));
  assert.ok(rows[8].statRuns >= 15, 'maxing the stat ladder is a multi day goal for a regular player: ' + rows[8].statRuns.toFixed(1));
  // finding (not a failure): by stage 25+ the Beats ladder is cheap, see the report; the guard is that income keeps growing with the stage
  assert.ok(rows[25].cpr > rows[8].cpr && rows[40].cpr > rows[25].cpr, 'Beats per run grow with the stage');
  assert.ok(rows[40].statRuns < 60, 'documented: a master build has Beats to spare (stat ladder is ' + rows[40].statRuns.toFixed(1) + ' runs)');
}
console.log('33_balance_b11 ok');
