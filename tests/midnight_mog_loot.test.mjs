// Midnight Mog loot honesty. Monte Carlo against the EXACT per-pull odds (docs/LOOT.md section 9):
// pity moves the probabilities pull by pull, so every pull the test reads oddsTable(...).rarity[i].now
// and sums them. Observed rarity counts must sit within 3 sigma of sum(now) with variance sum(now * (1 - now)).
// Also: content mix, golden rate, pity bounds and mean gaps, hard pity, the x10 guarantee, duplicate
// conversion, purity (input never mutated), and "the odds the UI prints are the odds that are rolled".
// The five crates run in parallel worker threads (200k pulls each); the rest is cheap and runs in the main thread.
import assert from 'node:assert/strict';
import os from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { makeRng } from '../midnight_mog/js/rng.js';
import { CRATES, CRATE_BY_ID, RARITY_IDS, PITY_TIERS, LUCK_PER_LEVEL, GOLDEN_CHANCE, MULTI_COUNT, STAR_DUPES } from '../midnight_mog/js/data/crates.js';
import { openCrate, oddsTable, expectedPulls, expectedReturn, pityKey, poolSizes } from '../midnight_mog/js/sim/loot.js';
import { crateCost, DUPE_YARN, TARGETS } from '../midnight_mog/js/sim/economy.js';

const KINDS = ['cat', 'card', 'relic', 'yarn', 'gems'];
const TIER_IDX = { epic: 2, legend: 3, mythic: 4 };
const SEEDS = { alley_crate: 101, neon_crate: 202, rooftop_crate: 303, midnight_crate: 404, mythic_crate: 505 };
const N = Number(process.env.LOOT_N) || (os.availableParallelism() >= 3 ? 200000 : 60000);
const X10_SEEDS = 2000;
const HARD_SEEDS = 1000;
const SIGMA = 3;

function bare() { return { cur: { fish: 0, yarn: 0, gems: 0, tokens: 0 }, cats: {}, cards: {}, relics: {}, pity: {}, stats: {} }; }
function rich() { const p = bare(); p.cur = { fish: 1e13, yarn: 1e13, gems: 1e13, tokens: 0 }; return p; }

// ------------------------------------------------------------------ the worker: one crate, N pulls
function simulate(crateId, n, seed) {
  const def = CRATE_BY_ID[crateId];
  const rng = makeRng(seed);
  let p = bare();
  const out = {
    crateId, n,
    expected: [0, 0, 0, 0, 0], variance: [0, 0, 0, 0, 0], observed: [0, 0, 0, 0, 0],
    kinds: Object.fromEntries(RARITY_IDS.map((r) => [r, Object.fromEntries(KINDS.map((k) => [k, 0]))])),
    golden: 0, hardSeen: 0, yarnAmounts: {}, gemAmounts: {},
    dry: { epic: 0, legend: 0, mythic: 0 }, gaps: { epic: [], legend: [], mythic: [] },
    maxCounter: { epic: 0, legend: 0, mythic: 0 }, forcedMisses: 0,
    dupeBad: 0, dupeChecked: 0, catDupeBad: 0, catDupeChecked: 0, mutated: 0, stored: 0,
    newCount: 0, sampleChecks: 0,
  };
  const run = { epic: 0, legend: 0, mythic: 0 };
  for (let i = 0; i < n; i++) {
    const snap = (i % 4001 === 0) ? structuredClone(p) : null;
    const odds = oddsTable(crateId, p);
    for (let r = 0; r < 5; r++) { const q = odds.rarity[r].now; out.expected[r] += q; out.variance[r] += q * (1 - q); }
    const sum = odds.rarity.reduce((a, x) => a + x.now, 0);
    if (Math.abs(sum - 1) > 1e-9) out.stored++;
    const before = p;
    const res = openCrate(p, crateId, rng, { free: true });
    if (snap) { out.sampleChecks++; try { assert.deepStrictEqual(before, snap); } catch { out.mutated++; } }
    p = res.profile;
    const d = res.drops[0];
    const ri = RARITY_IDS.indexOf(d.rarity);
    out.observed[ri]++;
    out.kinds[d.rarity][d.kind]++;
    if (d.golden) out.golden++;
    if (d.pity === 'hard') out.hardSeen++;
    if (d.kind === 'yarn') out.yarnAmounts[d.rarity + ':' + d.amount] = 1;
    if (d.kind === 'gems') out.gemAmounts[d.rarity + ':' + d.amount] = 1;
    for (const t of PITY_TIERS) {
      if (!def.pity[t]) { if (ri >= TIER_IDX[t]) { /* tier without pity: nothing to track */ } continue; }
      if (ri >= TIER_IDX[t]) { out.gaps[t].push(run[t] + 1); run[t] = 0; } else run[t]++;
      if (run[t] > out.dry[t]) out.dry[t] = run[t];
      const stored = p.pity[pityKey(crateId, t)] | 0;
      if (stored > out.maxCounter[t]) out.maxCounter[t] = stored;
    }
    // forced pulls: when a counter was at hard - 1 the drop must have been that tier or better
    for (const t of PITY_TIERS) {
      const cfg = def.pity[t];
      if (cfg && ((before.pity[pityKey(crateId, t)] | 0) + 1) >= cfg.hard && ri < TIER_IDX[t]) out.forcedMisses++;
    }
    // duplicate conversion
    if (d.kind === 'cat' || d.kind === 'card' || d.kind === 'relic') {
      if (!d.isNew) {
        out.dupeChecked++;
        if (!(d.dupeValue > 0)) out.dupeBad++;
        if (d.kind === 'cat') {
          out.catDupeChecked++;
          const was = before.cats[d.id].dupes | 0, now = p.cats[d.id].dupes | 0;
          if (now - was !== (d.golden ? 2 : 1)) out.catDupeBad++;
        }
      } else out.newCount++;
    }
  }
  // hard pity: counter at hard - 1, the next pull is always that tier or better
  out.hardPity = {};
  for (const t of PITY_TIERS) {
    const cfg = def.pity[t];
    if (!cfg) continue;
    let bad = 0;
    for (let s = 0; s < HARD_SEEDS; s++) {
      const q = rich();
      q.pity[pityKey(crateId, t)] = cfg.hard - 1;
      const r = openCrate(q, crateId, makeRng(seed * 7 + s), { free: true });
      if (RARITY_IDS.indexOf(r.drops[0].rarity) < TIER_IDX[t]) bad++;
      else if (RARITY_IDS.indexOf(r.drops[0].rarity) === TIER_IDX[t] && (!r.pityHit || r.pityHit.hard !== true)) bad++;
    }
    out.hardPity[t] = bad;
  }
  // the x10 button never misses its guarantee and charges the ten sequential prices
  const gIdx = RARITY_IDS.indexOf(def.multi.guarantee);
  let miss = 0, wrongLen = 0, wrongCost = 0, slotUsed = 0;
  for (let s = 0; s < X10_SEEDS; s++) {
    const q = rich();
    const res = openCrate(q, crateId, makeRng(seed * 13 + s), { count: 10 });
    if (res.drops.length !== 10) wrongLen++;
    if (!res.drops.some((x) => RARITY_IDS.indexOf(x.rarity) >= gIdx)) miss++;
    let total = 0; for (let i = 0; i < 10; i++) total += crateCost(crateId, i).price;
    if (res.spent.amount !== total || res.profile.stats.crateOpens !== 10) wrongCost++;
    if (res.drops[9].guarantee) slotUsed++;
  }
  out.x10 = { miss, wrongLen, wrongCost, slotUsed, seeds: X10_SEEDS };
  return out;
}

if (!isMainThread) {
  parentPort.postMessage(simulate(workerData.crateId, workerData.n, workerData.seed));
} else {
  await main();
}

// ------------------------------------------------------------------ the main thread
async function main() {
  const t0 = Date.now();
  const lap = (s) => console.log('  ' + s + ' ' + (Date.now() - t0) + 'ms');
  const jobs = CRATES.map((c) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { crateId: c.id, n: N, seed: SEEDS[c.id] } });
    w.once('message', resolve); w.once('error', reject);
  }));

  // ---- 1. the odds the UI prints are the odds that are rolled (independent re-derivation from the data table)
  function independentOdds(def, counters, luck) {
    const k = 1 + LUCK_PER_LEVEL * luck;
    const w = RARITY_IDS.map((r, i) => def.weights[r] * (i === 0 ? 1 : k));
    const tot = w.reduce((a, b) => a + b, 0);
    const base = w.map((x) => x / tot);
    const tail = (i) => base.slice(i).reduce((a, b) => a + b, 0);
    const q = {};
    for (const t of PITY_TIERS) {
      const cfg = def.pity[t], b = tail(TIER_IDX[t]);
      const c = counters[t] || 0;
      if (!cfg) { q[t] = b; continue; }
      const nth = c + 1;
      q[t] = nth >= cfg.hard ? 1 : nth <= cfg.soft ? b : b + (1 - b) * (nth - cfg.soft) / (cfg.hard - cfg.soft);
    }
    const ql = Math.max(q.legend, q.mythic), qe = Math.max(q.epic, ql);
    const rest = 1 - qe;
    return [rest * base[0] / (base[0] + base[1]), rest * base[1] / (base[0] + base[1]), qe - ql, ql - q.mythic, q.mythic];
  }
  let printedChecks = 0;
  for (const def of CRATES) {
    for (const luck of [0, 1, 3, 5]) {
      for (let trial = 0; trial < 60; trial++) {
        const r = makeRng(900 + trial + luck * 100);
        const counters = {};
        const p = bare();
        p.meta = { crate_luck: luck };
        for (const t of PITY_TIERS) {
          const cfg = def.pity[t];
          const c = cfg ? (trial === 0 ? 0 : trial === 1 ? cfg.hard - 1 : trial === 2 ? cfg.soft : r.int(0, cfg.hard - 1)) : 0;
          counters[t] = c;
          if (cfg) p.pity[pityKey(def.id, t)] = c;
        }
        const t = oddsTable(def.id, p);
        const want = independentOdds(def, counters, luck);
        assert.equal(t.luck.level, luck);
        for (let i = 0; i < 5; i++) {
          assert.ok(Math.abs(t.rarity[i].now - want[i]) < 1e-9, `${def.id} luck ${luck} counters ${JSON.stringify(counters)} ${RARITY_IDS[i]}: printed ${t.rarity[i].now} vs ${want[i]}`);
          assert.ok(t.rarity[i].now >= 0);
        }
        assert.ok(Math.abs(t.rarity.reduce((a, x) => a + x.now, 0) - 1) < 1e-9);
        for (const tier of PITY_TIERS) {
          if (!def.pity[tier]) { assert.equal(t.pity[tier], null); continue; }
          assert.equal(t.pity[tier].hard, def.pity[tier].hard);
          assert.equal(t.pity[tier].soft, def.pity[tier].soft);
          assert.equal(t.pity[tier].counter, counters[tier]);
        }
        printedChecks++;
      }
    }
    // base row printed = weights / 100 (no luck), and content rows sum to 1 and follow the data table
    const t0r = oddsTable(def.id, bare());
    RARITY_IDS.forEach((r, i) => assert.ok(Math.abs(t0r.rarity[i].base - def.weights[r] / 100) < 1e-9, def.id + ' base ' + r));
    const sizes = poolSizes();
    for (const r of RARITY_IDS) {
      const c = t0r.content[r];
      assert.ok(Math.abs(KINDS.reduce((a, k) => a + c[k], 0) - 1) < 1e-9, def.id + ' content ' + r);
      if (!def.gems[r]) assert.equal(c.gems, 0, def.id + ' ' + r + ' no gems without a gem amount');
      if (def.id === 'alley_crate' || def.id === 'neon_crate' || def.id === 'rooftop_crate') assert.equal(c.gems, 0, 'fish and yarn crates never drop gems');
      for (const k of ['cat', 'card', 'relic']) {
        if (!sizes[r][k]) assert.equal(c[k], 0, def.id + ' ' + r + ' empty pool ' + k);
        assert.equal(t0r.pools[r][k], sizes[r][k]);
        assert.ok(Math.abs(t0r.item[r][k] - (sizes[r][k] ? c[k] / sizes[r][k] : 0)) < 1e-12);
      }
    }
    assert.equal(t0r.golden, GOLDEN_CHANCE);
    assert.equal(t0r.multi.guarantee, def.multi.guarantee);
    const gIdx = RARITY_IDS.indexOf(def.multi.guarantee);
    for (let i = 0; i < gIdx; i++) assert.equal(t0r.multi.slotProbs[i], 0, 'x10 slot never below the guarantee');
    assert.ok(Math.abs(t0r.multi.slotProbs.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  console.log('  printed odds equal independently derived odds in ' + printedChecks + ' states');
  lap('odds table');

  // ---- 2. static rules on the data table
  for (const def of CRATES) {
    const sum = RARITY_IDS.reduce((a, r) => a + def.weights[r], 0);
    assert.ok(Math.abs(sum - 100) < 1e-9, def.id + ' weights sum to 100');
    for (const t of PITY_TIERS) {
      const cfg = def.pity[t];
      if (cfg) assert.ok(cfg.soft < cfg.hard && cfg.soft >= 1, def.id + ' pity ' + t);
    }
    const er = expectedReturn(def.id);
    const price = crateCost(def.id, 0).price;
    const cur = crateCost(def.id, 0).cur;
    if (cur === 'gems') assert.ok(er.gems < TARGETS.crateReturnMax * price, def.id + ' worst case gems back under 90% of the price');
    else assert.ok(er.yarn < TARGETS.crateReturnMax * price, def.id + ' worst case dupe yarn under 90% of the price');
    assert.ok(Math.abs(DUPE_YARN.common) > 0 && DUPE_YARN.rare > 0 && DUPE_YARN.epic > 0 && DUPE_YARN.legend > 0 && DUPE_YARN.mythic > 0, 'duplicate conversion pays at every rarity');
  }

  // ---- 3. purity, affordability, determinism (cheap, main thread)
  {
    const p = bare(); p.cur = { fish: 1e6, yarn: 1e6, gems: 1e6, tokens: 3 };
    p.cats.ember_mog = { level: 4, dupes: 2, stars: 1 };
    p.pity.alley_crate = 7;
    const snap = structuredClone(p);
    for (const c of CRATES) {
      for (const count of [1, 10]) {
        const r = openCrate(p, c.id, makeRng(5), { count });
        assert.deepStrictEqual(p, snap, 'openCrate must not mutate its input (' + c.id + ' x' + count + ')');
        assert.notStrictEqual(r.profile, p);
        assert.notStrictEqual(r.profile.cur, p.cur);
        const again = openCrate(p, c.id, makeRng(5), { count });
        assert.deepStrictEqual(again.drops.map((d) => [d.kind, d.id, d.rarity, d.golden]), r.drops.map((d) => [d.kind, d.id, d.rarity, d.golden]), 'same seed, same drops');
        assert.deepStrictEqual(again.profile, r.profile);
      }
    }
    // cannot afford: unchanged currencies, no drops, no pity movement
    const poor = bare(); poor.cur = { fish: 1, yarn: 1, gems: 1, tokens: 0 };
    for (const c of CRATES) {
      for (const count of [1, 10]) {
        const ps = structuredClone(poor);
        const r = openCrate(poor, c.id, makeRng(1), { count });
        assert.equal(r.error, 'cant_afford');
        assert.deepEqual(r.drops, []);
        assert.deepStrictEqual(r.profile.cur, ps.cur);
        assert.deepStrictEqual(r.profile.pity, ps.pity);
        assert.deepStrictEqual(poor, ps);
      }
    }
    // paying: exactly the printed price comes out of the right currency
    for (const c of CRATES) {
      const cost = crateCost(c.id, 0);
      const q = bare(); q.cur = { fish: 1e9, yarn: 1e9, gems: 1e9, tokens: 0 };
      const r = openCrate(q, c.id, makeRng(8), { count: 1 });
      const t = oddsTable(c.id, q);
      assert.equal(t.price.price, cost.price);
      assert.equal(r.spent.cur, cost.cur);
      assert.equal(r.spent.amount, cost.price);
      const gained = r.drops.reduce((a, d) => a + ((d.kind === cost.cur ? d.amount : 0) || 0) + (cost.cur === 'yarn' ? d.dupeValue : 0), 0);
      assert.equal(r.profile.cur[cost.cur], 1e9 - cost.price + gained, c.id + ' currency arithmetic');
    }
  }

  // ---- 4. duplicates on a fully owned profile: every dupe pays something, stars follow the dupe thresholds
  {
    const rng = makeRng(77);
    for (const c of CRATES) {
      let p = rich();
      let paid = 0, seen = 0;
      for (let i = 0; i < 3000; i++) {
        const before = p;
        const r = openCrate(p, c.id, rng, { free: true });
        p = r.profile;
        const d = r.drops[0];
        if (d.kind === 'cat' || d.kind === 'card' || d.kind === 'relic') {
          if (!d.isNew) {
            seen++;
            assert.ok(d.dupeValue > 0, c.id + ' dupe of ' + d.kind + ' pays yarn');
            assert.ok(Number.isInteger(d.dupeValue));
            if (d.kind === 'cat') {
              const e = p.cats[d.id];
              assert.equal(e.dupes - before.cats[d.id].dupes, d.golden ? 2 : 1);
              let want = 0; STAR_DUPES.forEach((x, k) => { if (e.dupes >= x) want = k + 1; });
              assert.equal(e.stars, want, 'stars follow dupes');
              assert.ok(e.stars >= before.cats[d.id].stars, 'stars never drop');
            } else if (d.kind === 'card') {
              assert.equal(p.cards[d.id].count - before.cards[d.id].count, d.golden ? 2 : 1);
            }
            paid += d.dupeValue;
          } else if (d.kind === 'cat') assert.ok(p.cards['call_' + d.id], 'a new cat brings its summon card');
        }
      }
      assert.ok(seen > 200 && paid > 0, c.id + ' saw dupes');
    }
  }
  lap('purity and dupes');

  // ---- 5. the Monte Carlo results
  const results = await Promise.all(jobs);
  lap('monte carlo (' + N + ' pulls per crate)');
  const zs = [];
  for (const r of results) {
    const def = CRATE_BY_ID[r.crateId];
    assert.equal(r.stored, 0, r.crateId + ' printed row always sums to 1');
    assert.equal(r.mutated, 0, r.crateId + ' openCrate mutated its input (' + r.sampleChecks + ' snapshots)');
    // rarity rates vs exact per-pull sums
    RARITY_IDS.forEach((id, i) => {
      const e = r.expected[i], v = r.variance[i], o = r.observed[i];
      if (e === 0) { assert.equal(o, 0, r.crateId + ' ' + id + ' can never drop'); return; }
      const z = (o - e) / Math.sqrt(v);
      zs.push(`${r.crateId}/${id} z=${z.toFixed(2)}`);
      assert.ok(Math.abs(z) <= SIGMA, `${r.crateId} ${id}: observed ${o} expected ${e.toFixed(1)} z=${z.toFixed(2)}`);
    });
    // content mix given the rarity
    const odds = oddsTable(r.crateId, bare());
    for (const id of RARITY_IDS) {
      const m = RARITY_IDS.indexOf(id);
      const total = r.observed[m];
      for (const k of KINDS) {
        const p = odds.content[id][k];
        const o = r.kinds[id][k];
        if (p === 0) { assert.equal(o, 0, `${r.crateId} ${id} ${k} must never drop`); continue; }
        const sd = Math.sqrt(total * p * (1 - p));
        assert.ok(Math.abs(o - total * p) <= SIGMA * sd + 1, `${r.crateId} ${id} ${k}: ${o} vs ${(total * p).toFixed(1)} (sd ${sd.toFixed(1)})`);
      }
    }
    // golden
    const gsd = Math.sqrt(r.n * GOLDEN_CHANCE * (1 - GOLDEN_CHANCE));
    assert.ok(Math.abs(r.golden - r.n * GOLDEN_CHANCE) <= SIGMA * gsd, `${r.crateId} golden ${r.golden} vs ${r.n * GOLDEN_CHANCE}`);
    // fixed currency amounts come from the data table (golden doubles)
    for (const key of Object.keys(r.yarnAmounts)) { const [ra, a] = key.split(':'); assert.ok([def.yarn[ra], def.yarn[ra] * 2].includes(Number(a)), r.crateId + ' yarn amount ' + key); }
    for (const key of Object.keys(r.gemAmounts)) { const [ra, a] = key.split(':'); assert.ok([def.gems[ra], def.gems[ra] * 2].includes(Number(a)), r.crateId + ' gem amount ' + key); }
    // pity bounds
    for (const t of PITY_TIERS) {
      const cfg = def.pity[t];
      if (!cfg) continue;
      assert.ok(r.dry[t] <= cfg.hard - 1, `${r.crateId} ${t} dry streak ${r.dry[t]} exceeds hard pity ${cfg.hard}`);
      assert.ok(r.maxCounter[t] <= cfg.hard - 1, `${r.crateId} ${t} stored counter ${r.maxCounter[t]}`);
      const g = r.gaps[t];
      if (g.length >= 30) {
        const mean = g.reduce((a, b) => a + b, 0) / g.length;
        const sd = Math.sqrt(g.reduce((a, b) => a + (b - mean) ** 2, 0) / (g.length - 1));
        const want = expectedPulls(r.crateId, t);
        assert.ok(Math.abs(mean - want) <= 4 * sd / Math.sqrt(g.length) + 0.02 * want, `${r.crateId} ${t} mean gap ${mean.toFixed(2)} vs expected ${want.toFixed(2)}`);
      }
      assert.equal(r.hardPity[t], 0, `${r.crateId} ${t} hard pity failed`);
    }
    assert.equal(r.forcedMisses, 0, r.crateId + ' a forced pull missed');
    // x10
    assert.equal(r.x10.miss, 0, r.crateId + ' x10 missed its guarantee');
    assert.equal(r.x10.wrongLen, 0);
    assert.equal(r.x10.wrongCost, 0, r.crateId + ' x10 charges ten sequential prices');
    // the slot only matters when pity cannot already force the guarantee inside nine pulls (Velvet Vault epic hard 8 makes it redundant)
    const gt = def.multi.guarantee, gp = def.pity[gt];
    if (!gp || gp.hard > 9) assert.ok(r.x10.slotUsed > 0, r.crateId + ' the guarantee slot is actually used');
    else assert.equal(r.x10.slotUsed, 0, r.crateId + ' guarantee slot is redundant behind hard pity');
    // duplicates over the stream
    assert.equal(r.dupeBad, 0, r.crateId + ' a duplicate paid nothing');
    assert.equal(r.catDupeBad, 0, r.crateId + ' a cat dupe did not raise dupes by 1 (2 golden)');
    assert.ok(r.dupeChecked > 1000, r.crateId + ' duplicates were exercised');
  }
  for (const r of results) {
    const pct = r.observed.map((o) => (100 * o / r.n).toFixed(2)).join(' / ');
    const gaps = PITY_TIERS.filter((t) => CRATE_BY_ID[r.crateId].pity[t] && r.gaps[t].length).map((t) => `${t} mean gap ${(r.gaps[t].reduce((a, b) => a + b, 0) / r.gaps[t].length).toFixed(1)} (analytic ${expectedPulls(r.crateId, t).toFixed(1)}, longest dry ${r.dry[t]})`);
    console.log('  ' + r.crateId.padEnd(15) + 'c/r/e/l/m % ' + pct + ' | ' + gaps.join(', '));
  }
  if (process.env.LOOT_VERBOSE) console.log(zs.join('\n'));
  const worst = Math.max(...zs.map((s) => Math.abs(Number(s.split('z=')[1]))));
  console.log('  worst rarity |z| over ' + zs.length + ' cells: ' + worst.toFixed(2) + ' (limit ' + SIGMA + ')');
  console.log('midnight_mog loot: all passed in ' + (Date.now() - t0) + 'ms');
}
