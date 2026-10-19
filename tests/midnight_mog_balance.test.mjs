// Midnight Mog balance bands. Encodes the pacing and economy targets (economy.TARGETS plus the early game rules) as
// assertions so a future edit to a curve, a reward or a policy cannot silently break the pacing.
// Fast mode: the bots run in worker threads (24 simulated hours of strong and greedy play, short runs for more seeds).
// Full methodology and the tables are in midnight_mog/docs/BALANCE_REPORT.md. Run `node tests/midnight_mog_balance.test.mjs`.
import assert from 'node:assert/strict';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { makeRng } from '../midnight_mog/js/rng.js';
import * as BATTLE from '../midnight_mog/js/sim/battle.js';
import * as E from '../midnight_mog/js/sim/economy.js';
import * as P from '../midnight_mog/js/sim/progression.js';
import { newProfile, START, serialize, deserialize } from '../midnight_mog/js/sim/profile.js';
import { offlineLimits } from '../midnight_mog/js/sim/offline.js';
import { tierChance, baseProbs, expectedPulls } from '../midnight_mog/js/sim/loot.js';
import { CRATES, PITY_TIERS } from '../midnight_mog/js/data/crates.js';
import { BUILDING_BY_ID, statValue } from '../midnight_mog/js/data/buildings.js';
import { RELICS } from '../midnight_mog/js/data/relics.js';
import { achievementReward, starGalleryAt } from '../midnight_mog/js/data/quests.js';
import { CATS } from '../midnight_mog/js/data/cats.js';
import { deckSlots } from '../midnight_mog/js/sim/deck.js';
import { runBot, compareToTargets, compareOther, stageAt, BOT_POLICIES } from '../midnight_mog/js/bots/bots.js';

const T = E.TARGETS;

// ------------------------------------------------------------------ worker side
function relicArena(seeds) {
  const level = 18, gs = 22;
  const core = ['call_tin_can_tom', 'call_tin_can_tom', 'call_scrap_tabby', 'call_whisker_scout', 'call_whisker_scout', 'call_spark_kit', 'call_nurse_purrnell', 'call_calico_dart'];
  const make = () => {
    const p = newProfile(7, 0);
    for (const c of CATS) { p.cats[c.id] = { level, dupes: 0, stars: 0 }; if (!p.cards['call_' + c.id]) p.cards['call_' + c.id] = { level: 1, count: 1 }; }
    const d = core.concat(['pounce', 'zoomies', 'tuna_tripwire', 'curious_cat']);
    for (const id of new Set(d)) { p.cards[id] = p.cards[id] || { level: 1, count: 3 }; p.cards[id].count = Math.max(3, p.cards[id].count); }
    p.deck = d.slice(0, deckSlots(p));
    return p;
  };
  const score = (p) => {
    let prog = 0;
    for (let s = 1; s <= seeds; s++) {
      const b = BATTLE.createBattle({ seed: 1000 + s, district: null, stage: gs, profile: p, noAdvance: true });
      const S = { rng: makeRng(1000 + s) };
      for (let g = 0; !b.over && g < 4000; g++) { BOT_POLICIES.strong.act(b, S); BATTLE.step(b, 1); b.events.length = 0; }
      const r = BATTLE.battleResult(b);
      prog += r.won ? 1 : r.wave / r.waves;
    }
    return prog / seeds;
  };
  const base = score(make());
  const rows = RELICS.map((r) => { const p = make(); p.relics = { [r.id]: true }; return { id: r.id, rarity: r.rarity, delta: score(p) - base }; });
  return { base, rows };
}

function summarize(id, kind, opts) {
  const r = runBot(kind, opts);
  return {
    id, kind, opts, timeline: r.timeline, walls: r.walls, stats: r.stats, other: kind === 'strong' ? compareOther(r) : null,
    cur: r.profile.cur, catsOwned: Object.keys(r.profile.cats).length,
  };
}

if (!isMainThread) {
  const out = [];
  for (const j of workerData.jobs) {
    if (j.arena) out.push({ id: j.id, arena: relicArena(j.seeds) });
    else out.push(summarize(j.id, j.kind, j.opts));
  }
  parentPort.postMessage(out);
} else {
  await main();
}

// ------------------------------------------------------------------ main thread
async function main() {
  const t0 = Date.now();
  const lap = (s) => console.log('  ' + s + ' ' + (Date.now() - t0) + 'ms');
  const run = (jobs) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { jobs } });
    w.once('message', resolve); w.once('error', reject);
  });
  const C = (extra) => ({ seed: 1, continuous: true, ...extra });
  // longest first so the wall clock is the longest single worker
  const pending = [
    run([{ id: 'strong24', kind: 'strong', opts: C({ hours: 24 }) }]),
    run([{ id: 'greedy24', kind: 'greedy', opts: C({ hours: 24 }) }]),
    run([{ id: 'strong24_noclaims', kind: 'strong', opts: C({ hours: 24, claims: false }) }]),
    run([
      { id: 'strong1h_s2', kind: 'strong', opts: C({ seed: 2, hours: 1 }) },
      { id: 'strong1h_s3', kind: 'strong', opts: C({ seed: 3, hours: 1 }) },
      { id: 'greedy1h_s2', kind: 'greedy', opts: C({ seed: 2, hours: 1 }) },
      { id: 'random1h', kind: 'random', opts: C({ hours: 1 }) },
      { id: 'casual72', kind: 'strong', opts: { seed: 1, hours: 72 } },
      { id: 'tiny', kind: 'strong', opts: C({ hours: 0.0001 }) },
      { id: 'arena', arena: true, seeds: 8 },
    ]),
  ];

  // ---- A. the first minutes (cheap, main thread, runs while the workers work)
  {
    const alley = E.crateCost('alley_crate', 0);
    assert.ok(START.cur.fish >= alley.price, 'the starting purse buys the first crate on the spot');
    assert.ok(START.cur.fish >= 3 * alley.price, 'three crates are affordable inside the first minutes (docs: three open before minute 5)');
    assert.ok(START.cur.yarn >= E.cost('cat_level', 1, { rarity: 'common' }), 'the first cat level up is affordable at second 0');
    assert.ok(START.cur.yarn >= E.cost('card_level', 1, { rarity: 'common' }), 'the first card level up is affordable at second 0');
    // dead time: on a fresh profile, stages 1 to 6 are winnable and the player is never locked out of playing a card for long
    const p = newProfile(3, 0);
    let worstDead = 0, worstGap = 0, longest = 0;
    for (let gs = 1; gs <= 6; gs++) {
      const b = BATTLE.createBattle({ seed: 10 + gs, district: null, stage: gs, profile: p, noAdvance: true });
      const S = { rng: makeRng(gs) };
      let dead = 0, last = 0, prev = 0;
      for (let g = 0; !b.over && g < 4000; g++) {
        const canAny = b.hand.some((_, i) => BATTLE.canPlay(b, i));
        BOT_POLICIES.strong.act(b, S);
        const played = (b.stats && b.stats.cardsPlayed) || 0;
        if (played > prev) { worstGap = Math.max(worstGap, b.t - last); last = b.t; prev = played; }
        if (!canAny && b.enemies.some((e) => !e.dead)) { dead++; worstDead = Math.max(worstDead, dead); } else dead = 0;
        BATTLE.step(b, 1); b.events.length = 0;
      }
      assert.equal(BATTLE.battleResult(b).won, true, 'a fresh profile wins stage ' + gs);
      longest = Math.max(longest, b.t);
    }
    assert.ok(worstDead <= 20, 'longest span with no playable card ' + worstDead + 's');
    assert.ok(worstGap <= 20, 'longest gap between two card plays ' + worstGap + 's');
    assert.ok(longest <= 150, 'early battles stay under 150s (' + longest.toFixed(0) + 's)');
    console.log('  early game: first crate and level up affordable at 0s, longest no-playable span ' + worstDead + 's, longest gap between plays ' + worstGap.toFixed(0) + 's');
  }

  // ---- B. loot economy guards (cheap)
  {
    // the Crate Workshop pity credit must stay a nudge: with the largest credit the building can ever give, no crate's
    // epic or better rate may rise above 1.5x its plain pity rate (it was 17x with a credit of 30).
    const spec = BUILDING_BY_ID.crate_workshop.effects.find((e) => e.stat === 'pityCredit');
    let maxCredit = 0;
    for (let lvl = 1; lvl <= 200; lvl++) for (const pot of [1, 1.3, 2]) maxCredit = Math.max(maxCredit, statValue(spec, lvl, pot));
    assert.ok(maxCredit <= 3, 'pity credit is capped at 3 pulls, got ' + maxCredit);
    const rate = (def, tier, credit) => {
      const base = baseProbs(def, 0), cfg = def.pity[tier];
      if (!cfg) return null;
      let surv = 1, gap = 0;
      for (let k = 0; k < cfg.hard; k++) {
        const cred = credit > 0 ? Math.max(k, Math.min(k + credit, cfg.hard - 2)) : k;
        gap += surv; surv *= 1 - tierChance(def, tier, cred, base);
      }
      return 1 / gap;
    };
    for (const def of CRATES) {
      const plain = rate(def, 'epic', 0), boosted = rate(def, 'epic', maxCredit);
      assert.ok(Math.abs(1 / plain - expectedPulls(def.id, 'epic')) < 1e-6, def.id + ' renewal check matches expectedPulls');
      assert.ok(boosted <= plain * 1.5, `${def.id} epic rate with max credit ${(boosted * 100).toFixed(1)}% vs ${(plain * 100).toFixed(1)}%`);
      assert.ok(boosted >= plain);
    }
    // gem income from buildings: the mine is capped
    const mine = BUILDING_BY_ID.gem_mine.effects[0];
    assert.ok(statValue(mine, 500, 3) <= 2, 'a gem mine never makes more than 2 gems per hour');
    // the endless ladders do not mint gems: past the named tiers an achievement or gallery tier pays a flat 2
    for (let n = 5; n < 400; n++) { assert.ok(achievementReward(n).gems <= 2); assert.ok(starGalleryAt(n).reward.gems <= 2); }
  }

  // ---- C. overflow: numbers stay finite and endless mode keeps growing
  {
    let prevHp = 0;
    for (const gs of [1, 50, 100, 500, 1000, 5000, 10000, 12000, 50000, 1e6, 1e9]) {
      const sc = P.stageScaling(null, gs), r = E.stageReward(gs, { firstClear: true });
      for (const v of [sc.hp, sc.dmg, sc.power, sc.reward, sc.speed, r.fish, r.yarn, E.enemyPower(gs)]) assert.ok(Number.isFinite(v) && v >= 0, 'finite at stage ' + gs);
      assert.ok(sc.hp >= prevHp, 'enemy hp never drops with the stage (' + gs + ')');
      prevHp = sc.hp;
      assert.ok(E.money(r.fish) > 0, 'a reward never rounds to zero by overflow at stage ' + gs);
      assert.ok(E.money(r.fish) <= E.MAX_CUR);
    }
    assert.equal(E.money(Infinity), E.MAX_CUR);
    assert.equal(E.money(NaN), 0);
    assert.equal(E.money(-5), 0);
    for (const best of [30, 120, 1000, 1e5, 1e7]) {
      const sh = E.nineLivesShards(best), m = E.nineLivesMult(sh * 1000);
      assert.ok(Number.isFinite(sh) && Number.isFinite(m.income) && Number.isFinite(m.damage), 'prestige finite at ' + best);
    }
    // a huge late profile: income, offline and save round trip stay finite
    const p = newProfile(5, 0);
    p.progress = { district: 400, stage: 30, best: { 400: 30 } };
    p.nineLives = { count: 500, shards: 5e7 };
    p.cur = { fish: E.MAX_CUR, yarn: E.MAX_CUR, gems: 1e6, tokens: 1e6 };
    const inc = E.income(p);
    for (const v of [inc.passive.fish, inc.passive.yarn, inc.battle.fish, inc.battle.yarn, inc.active.fish, inc.active.yarn, inc.perHour.fish, inc.perHour.yarn]) assert.ok(Number.isFinite(v), 'income finite at stage 12000');
    const rt = deserialize(serialize(p));
    for (const k of ['fish', 'yarn', 'gems', 'tokens']) assert.ok(Number.isFinite(rt.cur[k]) && rt.cur[k] <= E.MAX_CUR);
    // a battle at stage 20000 simulates without NaN
    const b = BATTLE.createBattle({ seed: 1, district: null, stage: 20000, profile: newProfile(2, 0), noAdvance: true });
    for (let i = 0; i < 300; i++) BATTLE.step(b, 1 / 30);
    assert.ok(![...b.units, ...b.enemies].some((u) => !Number.isFinite(u.hp)), 'no NaN hp at stage 20000');
    // the economy model keeps growing with shards, forever, by decades (about +15 to +25 stages per x10)
    let prev = 0;
    for (const shards of [0, 10, 100, 1e3, 1e4, 1e5, 1e6, 1e8]) {
      const run = E.modelRun(86400, { shards });
      assert.ok(Number.isFinite(run.stage) && run.stage > prev, 'model stage grows with shards ' + shards + ': ' + run.stage + ' > ' + prev);
      prev = run.stage;
    }
    const camp = E.modelCampaign(30 * 86400);
    assert.ok(Number.isFinite(camp.stage) && camp.best >= 120 && camp.best <= 400, 'a simulated month of the economy model ends at a finite stage: ' + camp.best);
    // offline limits: meta perks alone stay inside the TARGETS bands, the Nap Dome extends them to 40h and 0.8
    const maxed = newProfile(1, 0);
    maxed.meta = { offline_cap: E.META.offline_cap.maxLevel, offline_eff: E.META.offline_eff.maxLevel, start_fish: 0, crate_luck: 0, extra_slot: 0 };
    assert.ok(E.offlineCapSeconds(maxed) / 3600 <= T.offlineMetaCapHours[1] && E.offlineCapSeconds(maxed) / 3600 >= T.offlineMetaCapHours[0]);
    assert.ok(E.offlineEfficiency(maxed) <= T.offlineMetaEfficiency[1] + 1e-9 && E.offlineEfficiency(newProfile(1, 0)) >= T.offlineMetaEfficiency[0] - 1e-9);
    const lim = offlineLimits(maxed);
    assert.ok(lim.capSeconds / 3600 <= T.offlineCapHours[1] && lim.efficiency <= T.offlineEfficiency[1]);
  }
  lap('static checks');

  // ---- D. the bots
  const res = {};
  for (const batch of await Promise.all(pending)) for (const r of batch) res[r.id] = r;
  lap('bots');
  const rowsOf = (r) => compareToTargets({ [r.kind]: { hours: r.opts.hours, timeline: r.timeline, kind: r.kind } });
  const verdict = (r, id) => rowsOf(r).find((x) => x.id === id);
  const bandOk = (r, id) => { const row = verdict(r, id); assert.equal(row.verdict[r.kind], 'ok', `${r.id} at ${id}: stage ${row.got[r.kind]} outside ${row.band.join('-')}`); return row.got[r.kind]; };
  const table = [];

  // sessions: 2 min, 10 min, 1 hour for several seeds, 1 day for the long runs
  for (const id of ['strong24', 'strong1h_s2', 'strong1h_s3']) for (const s of ['2min', '10min', '1hour']) table.push([id, s, bandOk(res[id], s)]);
  bandOk(res.strong24, '1day'); table.push(['strong24', '1day', stageAt({ timeline: res.strong24.timeline }, 86400)]);
  for (const s of ['2min', '10min', '1hour']) table.push(['greedy24', s, bandOk(res.greedy24, s)]);
  // greedy lands on 119 or, when it slips past the Bathtub Kraken wall into the easy Rooftop loop, on 149 to 157 (3 of 6 seeds), so its
  // day band is the wide one: it must neither stall below the band nor run away above 160
  const g1d = stageAt({ timeline: res.greedy24.timeline }, 86400);
  assert.ok(g1d >= T.sessions[3].stage[0] && g1d <= 160, 'greedy 1 day stage ' + g1d);
  table.push(['greedy24', '1day', g1d]);
  bandOk(res.greedy1h_s2, '1hour');
  bandOk(res.random1h, '2min'); bandOk(res.random1h, '10min');
  const s1h = stageAt(res.strong24, 3600), g1h = stageAt(res.greedy24, 3600), r1h = stageAt(res.random1h, 3600);
  assert.ok(r1h < g1h && r1h < s1h, `random (${r1h}) trails greedy (${g1h}) and strong (${s1h}) at 1 hour`);
  assert.ok(r1h >= 8, 'even the random player is not stuck in the first hour');

  // the other targets, on the strong 24h run
  const others = Object.fromEntries(res.strong24.other.map((o) => [o.id, o]));
  for (const id of ['runWallStage', 'firstResetActiveHours', 'nineLivesSpeedup', 'offlineCapHours', 'offlineEfficiency', 'crateReturn']) {
    assert.equal(others[id].verdict, 'ok', `${id}: ${others[id].got} outside ${others[id].band.join('-')}`);
  }
  // gems: the claim free rate is the slow trickle (bosses, mines); with every quest and ladder claimed the day-1 and week-1 fixed
  // rewards inflate a 24h average, so that rate is only bounded
  const gNo = res.strong24_noclaims.stats.gemsPerActiveHourOngoing, gYes = res.strong24.stats.gemsPerActiveHourOngoing;
  assert.ok(gNo >= T.gemsPerActiveHour[0] && gNo <= T.gemsPerActiveHour[1], `gems per hour without claims ${gNo}`);
  assert.ok(gYes <= 25, `gems per hour with claims ${gYes} (24h average, includes the first day and week quests)`);
  assert.ok(res.strong24.stats.gemsOneTime <= 900, 'the one-time gem ladders pay at most 900 gems in total ' + res.strong24.stats.gemsOneTime);

  // first Nine Lives and prestige loop
  const st = res.strong24.stats;
  assert.ok(st.resets >= 2 && st.shardsGained > 100, 'the strong bot prestiges repeatedly in a day: ' + st.resets);
  assert.ok(st.stage30Seconds[0] > 1800 && st.stage30Seconds[0] < 7200, 'first stage 30 takes 30 to 120 minutes: ' + st.stage30Seconds[0] + 's');
  for (const s of st.stage30Seconds.slice(1)) assert.ok(s < st.stage30Seconds[0] / 2, 'a prestiged run reaches stage 30 at least twice as fast: ' + s);

  // walls and dead zones: no wall in the first hours, and no wall longer than 6 active hours inside the 24h window
  for (const id of ['strong24', 'greedy24']) {
    for (const w of res[id].walls) {
      assert.ok(w.gs >= 85, `${id} wall at stage ${w.gs} is too early`);
      assert.ok(w.atHour >= 4, `${id} first wall at hour ${w.atHour}`);
      assert.ok(w.stalledMinutes <= 360, `${id} stalls ${w.stalledMinutes} minutes at stage ${w.gs}`);
    }
  }
  // no dominant crate or loot inflation: fish and yarn crates give epics at roughly their table rate, not on every pull
  const pulls = res.strong24.stats.pulls, total = Object.values(pulls).reduce((a, b) => a + b, 0);
  assert.ok(total > 1000);
  assert.ok(pulls.epic / total < 0.25, `epic share of all pulls ${(pulls.epic / total).toFixed(2)} (a pity credit exploit made it 0.80)`);
  assert.ok(pulls.common / total > 0.4, 'commons are still the bulk of cheap crate pulls');
  assert.ok((pulls.legend + pulls.mythic) / total < 0.05);

  // inflation: all currencies finite and clamped, bots never produce NaN
  for (const id of ['strong24', 'greedy24']) for (const k of ['fish', 'yarn', 'gems', 'tokens']) assert.ok(Number.isFinite(res[id].cur[k]) && res[id].cur[k] >= 0 && res[id].cur[k] <= E.MAX_CUR);

  // casual rhythm (3 sessions a day of 10 minutes): a slow but real climb
  const c1 = stageAt(res.casual72, 86400), c3 = stageAt(res.casual72, 3 * 86400);
  assert.ok(c1 >= 8 && c1 <= 40, 'casual day 1 stage ' + c1);
  assert.ok(c3 >= 25 && c3 <= 90, 'casual day 3 stage ' + c3);
  assert.ok(c3 > c1);

  // the first seconds as the bot plays them: it opens a crate and buys a level before the first battle even ends
  const tiny = res.tiny.stats;
  assert.ok(tiny.crates >= 1 && tiny.catLevelBuys >= 1, 'first crate and first cat level up happen at the start');
  assert.ok(tiny.activeSeconds <= 60, 'both within the first minute: ' + tiny.activeSeconds + 's');

  // relics: none breaks the game, none is a trap (energy and survival relics lead, as designed)
  const arena = res.arena.arena;
  assert.ok(arena.base > 0.2 && arena.base < 0.95, 'the arena is sensitive (baseline ' + arena.base.toFixed(2) + ')');
  const top = arena.rows.slice().sort((a, b) => b.delta - a.delta)[0];
  const bottom = arena.rows.slice().sort((a, b) => a.delta - b.delta)[0];
  assert.ok(top.delta <= 0.32, `relic ${top.id} adds ${top.delta.toFixed(2)} progress (limit 0.32)`);
  assert.ok(bottom.delta >= -0.15, `relic ${bottom.id} costs ${bottom.delta.toFixed(2)} progress`);

  console.log('  stage bands: ' + table.map((r) => r.join(' ')).join(' | '));
  console.log('  strong 24h: resets ' + st.resets + ', first reset ' + st.firstResetActiveHours + 'h, speedup ' + st.nineLivesSpeedup + 'x, gems/h ' + gNo + ' (no claims) ' + gYes + ' (claims), pulls epic share ' + (pulls.epic / total).toFixed(3));
  console.log('  relic arena: baseline ' + arena.base.toFixed(2) + ', best ' + top.id + ' +' + top.delta.toFixed(2) + ', worst ' + bottom.id + ' ' + bottom.delta.toFixed(2));
  const secs = (Date.now() - t0) / 1000;
  assert.ok(secs < 40, 'balance suite must stay under 40s, took ' + secs.toFixed(1));
  console.log('midnight_mog balance: all passed in ' + secs.toFixed(1) + 's');
}
