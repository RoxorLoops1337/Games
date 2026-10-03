// Inkwoven balance bot: aggregation and report. buildReport(records, G, opts) turns the run records of driver.mjs into one plain-JSON summary;
// renderText / renderMarkdown print it. Nothing here touches the game state except through G.DATA lookups (names, heroes, rarities).
//
// Definitions (the report repeats them, so a number is never ambiguous):
//   chapter N cleared (cumulative)   share of ALL runs whose party killed the chapter N boss. CONTENT_SPEC section 7 targets read this way:
//                                    chapter 1 in 85 to 97 percent, chapter 2 in 60 to 80, the whole game in 15 to 35 at Trial 0.
//   conditional clear                share of the runs that REACHED the chapter that cleared it (what a player who got there feels).
//   HP lost per fight                party HP lost in the fight, summed over both heroes, before the end-of-fight revive; a lost fight counts all HP.
//   lift (cards, relics, gems)       ridge regression on every fight of every run: party HP lost per fight as a share of party max HP, with fixed effects for
//                                    the encounter, the hero pair, the Trial and the deck size, upgrades and socketed gems; an item's coefficient is the share of party max HP
//                                    saved per fight when it is in the deck at that fight (positive is stronger). Fight-level, so a card picked late is not credited for
//                                    runs that were already winning. Shrunk by the ridge penalty, so rarely held items sit near zero.
//   pick win share                   share of winning runs of the hero whose final deck holds the card, divided by the mean of that share over the hero's cards
//                                    of the same rarity (relics: same rarity; gems: same colour tier). Spec flag: above 2.5.
import { deckArchetypes, ARCHETYPES } from './archetypes.mjs';
import { createValuer } from './cardval.mjs';

// ------------------------------------------------------------------ small stats
export const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
export const median = (a) => { if (!a.length) return 0; const b = a.slice().sort((x, y) => x - y); const m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; };
const sum = (a) => a.reduce((s, x) => s + x, 0);
const r1 = (x) => Math.round(x * 10) / 10;
const r2 = (x) => Math.round(x * 100) / 100;
const r3 = (x) => Math.round(x * 1000) / 1000;
const pct = (num, den) => (den ? (100 * num) / den : 0);
const r0p = (num, den) => r1(pct(num, den));
// Wilson interval half width in percentage points for a proportion
function wilson(k, n) {
  if (!n) return 0;
  const z = 1.96, p = k / n;
  const den = 1 + (z * z) / n;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / den;
  return r1(100 * half);
}
function groupBy(arr, fn) {
  const m = new Map();
  arr.forEach((x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); });
  return m;
}

// ------------------------------------------------------------------ ridge regression (sparse rows, dense normal equations)
function ridgeFit(rows, y, p, lambda) {
  // rows: array of [[col, val], ...]; lambda: array length p (penalty per column)
  const A = new Float64Array(p * p);
  const b = new Float64Array(p);
  rows.forEach((r, i) => {
    for (let a = 0; a < r.length; a++) {
      const ca = r[a][0], va = r[a][1];
      b[ca] += va * y[i];
      for (let c = 0; c < r.length; c++) A[ca * p + r[c][0]] += va * r[c][1];
    }
  });
  for (let j = 0; j < p; j++) A[j * p + j] += lambda[j];
  // Cholesky
  const L = new Float64Array(p * p);
  for (let i = 0; i < p; i++) {
    for (let j = 0; j <= i; j++) {
      let s = A[i * p + j];
      for (let k = 0; k < j; k++) s -= L[i * p + k] * L[j * p + k];
      if (i === j) L[i * p + j] = Math.sqrt(Math.max(s, 1e-12));
      else L[i * p + j] = s / L[j * p + j];
    }
  }
  const solve = (rhs) => {
    const z = new Float64Array(p);
    for (let i = 0; i < p; i++) { let s = rhs[i]; for (let k = 0; k < i; k++) s -= L[i * p + k] * z[k]; z[i] = s / L[i * p + i]; }
    const x = new Float64Array(p);
    for (let i = p - 1; i >= 0; i--) { let s = z[i]; for (let k = i + 1; k < p; k++) s -= L[k * p + i] * x[k]; x[i] = s / L[i * p + i]; }
    return x;
  };
  const beta = solve(b);
  return { beta, solve, p };
}

// ------------------------------------------------------------------ the report
export function buildReport(records, G, opts) {
  opts = opts || {};
  const { DATA } = G;
  const V = createValuer(G);
  const good = records.filter((r) => r && r.result !== 'error');
  const errors = records.filter((r) => r && r.result === 'error');
  const S = { meta: {}, cells: [], trials: [], deaths: {}, bosses: [], fights: [], economy: {}, deck: {}, cards: [], relics: [], gems: [], archetypes: [], enemies: [], encounters: [], heroes: [], flags: [] };
  const pairs = Array.from(new Set(good.map((r) => r.pair))).sort();
  const trials = Array.from(new Set(good.map((r) => r.trial))).sort((a, b) => a - b);
  S.meta = {
    runs: good.length, errors: errors.length, errorSamples: errors.slice(0, 3).map((e) => e.error), timeouts: good.filter((r) => r.death && r.death.timeout).length, stalls: good.filter((r) => r.result === 'stall').length, caps: good.filter((r) => r.result === 'cap').length,
    pairs, trials, combat: Array.from(new Set(good.map((r) => r.combat))).join(','), style: Array.from(new Set(good.map((r) => r.style))).join(','),
    effort: Array.from(new Set(good.map((r) => r.effort || 'normal'))).join(','), unlocked: Array.from(new Set(good.map((r) => r.unlocked || 'all'))).join(','), noise: Array.from(new Set(good.map((r) => r.draftNoise))).join(','), pickBias: Array.from(new Set(good.map((r) => r.pickBias === undefined ? 0 : r.pickBias))).join(','), clairvoyant: good.some((r) => r.clairvoyant),
    note: 'chapter clear rates are cumulative shares of all runs unless marked conditional',
  };

  // ---------------------------------------------------------------- cells: pair x trial
  const cellStats = (rs) => {
    const n = rs.length;
    const c1 = rs.filter((r) => r.chaptersCleared >= 1).length;
    const c2 = rs.filter((r) => r.chaptersCleared >= 2).length;
    const win = rs.filter((r) => r.result === 'win').length;
    const turns = rs.map((r) => r.stats.turns);
    const fights = rs.map((r) => r.fights.length);
    const winRuns = rs.filter((r) => r.result === 'win');
    return {
      runs: n, win: r0p(win, n), winCi: wilson(win, n), clear1: r0p(c1, n), clear2: r0p(c2, n), clear3: r0p(win, n),
      cond2: r0p(c2, c1), cond3: r0p(win, c2), reach2: r0p(c1, n), reach3: r0p(c2, n),
      turnsMean: r1(mean(turns)), turnsMedian: median(turns), fightsMean: r1(mean(fights)), fightsMedian: median(fights),
      fightsWinMedian: median(winRuns.map((r) => r.fights.length)), turnsWinMedian: median(winRuns.map((r) => r.stats.turns)),
      scoreMean: r1(mean(rs.map((r) => r.score))), deckMean: r1(mean(rs.map((r) => r.deckSize))),
      // where the lost runs ended (chapter of the fatal fight) and how each chapter's boss fared per attempt in this group of runs
      lost1: rs.filter((r) => r.death && r.death.ch === 1).length, lost2: rs.filter((r) => r.death && r.death.ch === 2).length, lost3: rs.filter((r) => r.death && r.death.ch === 3).length,
      boss: [1, 2, 3].map((ch) => { const bf = []; rs.forEach((r) => r.fights.forEach((f) => { if (f.tier === 'boss' && f.ch === ch) bf.push(f); })); return bf.length ? r0p(bf.filter((f) => f.result === 'win').length, bf.length) : null; }),
    };
  };
  const byCell = groupBy(good, (r) => r.pair + '|' + r.trial);
  Array.from(byCell.keys()).sort().forEach((k) => {
    const [pair, trial] = k.split('|');
    S.cells.push(Object.assign({ pair, trial: +trial }, cellStats(byCell.get(k))));
  });
  const byTrial = groupBy(good, (r) => r.trial);
  trials.forEach((t) => S.trials.push(Object.assign({ trial: t }, cellStats(byTrial.get(t)))));
  S.all = cellStats(good);

  // ---------------------------------------------------------------- deaths and bosses
  const lost = good.filter((r) => r.death);
  const deathBy = (fn) => { const m = new Map(); lost.forEach((r) => { const k = fn(r); m.set(k, (m.get(k) || 0) + 1); }); return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ key: k, n, pct: r0p(n, lost.length) })); };
  S.deaths = {
    total: lost.length, byEnemy: deathBy((r) => r.death.top || 'unknown'), byChapter: deathBy((r) => 'ch' + r.death.ch), byTier: deathBy((r) => r.death.ch + ':' + r.death.tier),
    byEncounter: deathBy((r) => r.death.enc || r.death.enemies.join('+')).slice(0, 25),
    byLastHit: deathBy((r) => r.death.last || 'unknown').slice(0, 15),
  };
  const fightsAll = [];
  good.forEach((r) => r.fights.forEach((f) => fightsAll.push(f)));
  ['boss_kuzunoha', 'boss_jorogumo', 'boss_editor'].forEach((id) => {
    const fs = fightsAll.filter((f) => f.tier === 'boss' && f.enemies[0] === id);
    if (!fs.length) return;
    const won = fs.filter((f) => f.result === 'win');
    S.bosses.push({ id, ch: DATA.enemies[id] ? DATA.enemies[id].chapter : 0, attempts: fs.length, wins: won.length, winRate: r0p(won.length, fs.length), ci: wilson(won.length, fs.length), turns: r1(mean(fs.map((f) => f.turns))), hpLostPct: r1(mean(fs.map((f) => pct(f.hpLost, sum(f.max0))))) });
  });

  // ---------------------------------------------------------------- fights by tier and chapter
  const byTC = groupBy(fightsAll, (f) => f.ch + ':' + f.tier);
  Array.from(byTC.keys()).sort().forEach((k) => {
    const fs = byTC.get(k);
    const [ch, tier] = k.split(':');
    S.fights.push({ ch: +ch, tier, n: fs.length, turns: r1(mean(fs.map((f) => f.turns))), hpLost: r1(mean(fs.map((f) => f.hpLost))), hpLostPct: r1(mean(fs.map((f) => pct(f.hpLost, sum(f.max0))))), loseRate: r0p(fs.filter((f) => f.result !== 'win').length, fs.length), cardsPerTurn: r1(sum(fs.map((f) => f.cards)) / Math.max(1, sum(fs.map((f) => f.turns)))), swapsPerFight: r1(mean(fs.map((f) => f.swaps))), blockPerTurn: r1(sum(fs.map((f) => f.blockGained)) / Math.max(1, sum(fs.map((f) => f.turns)))), dmgPerTurn: r1(sum(fs.map((f) => f.dmgDealt)) / Math.max(1, sum(fs.map((f) => f.turns)))) });
  });

  // ---------------------------------------------------------------- energy from relics (the +1 Energy boss relics stack: how often, and what it does to the bosses)
  {
    const eOf = (relics) => relics.reduce((a, id) => a + ((DATA.relics[id] && DATA.relics[id].mods && DATA.relics[id].mods.energy) || 0), 0);
    S.energy = [1, 2, 3].map((ch) => {
      const fs = fightsAll.filter((f) => f.ch === ch);
      const cnt = new Map();
      fs.forEach((f) => { const e = eOf(f.relics); cnt.set(e, (cnt.get(e) || 0) + 1); });
      const bossF = fs.filter((f) => f.tier === 'boss');
      const bossBy = Array.from(new Set(bossF.map((f) => eOf(f.relics)))).sort((a, b) => a - b).map((e) => { const x = bossF.filter((f) => eOf(f.relics) === e); return { extra: e, n: x.length, winRate: r0p(x.filter((f) => f.result === 'win').length, x.length) }; });
      return { ch, fights: fs.length, share: Array.from(cnt.keys()).sort((a, b) => a - b).map((e) => ({ extra: e, pct: r0p(cnt.get(e), fs.length) })), bossBy };
    });
  }

  // ---------------------------------------------------------------- economy
  const sumField = (rs, f) => mean(rs.map(f));
  const buys = [];
  good.forEach((r) => r.buys.forEach((b) => buys.push(b)));
  const spendBy = (kind) => r1(sum(buys.filter((b) => b.kind === kind).map((b) => b.price)) / Math.max(1, good.length));
  const chaptersRec = [];
  good.forEach((r) => r.chapters.forEach((c) => chaptersRec.push(c)));
  const perChapter = [1, 2, 3].map((ch) => {
    const cs = chaptersRec.filter((c) => c.ch === ch);
    return { ch, n: cs.length, painted: r1(mean(cs.map((c) => c.painted))), wells: r1(mean(cs.map((c) => c.wells))), brushes: r1(mean(cs.map((c) => c.brushesUsed))), fights: r1(mean(cs.map((c) => c.fights))), inkEnd: r1(mean(cs.map((c) => c.ink1))), mercyRuns: r0p(cs.filter((c) => c.mercy > 0).length, cs.length), goldEnd: r1(mean(cs.map((c) => c.gold1))), deckEnd: r1(mean(cs.map((c) => c.deckEnd))) };
  });
  S.economy = {
    goldEarned: r1(sumField(good, (r) => r.stats.goldEarned)), goldSpent: r1(sumField(good, (r) => r.stats.goldSpent)), goldFinal: r1(sumField(good, (r) => r.finalGold)),
    goldFinalWins: r1(sumField(good.filter((r) => r.result === 'win'), (r) => r.finalGold)),
    shopsVisited: r1(sumField(good, (r) => r.stats.shopsVisited)), purchases: r1(sumField(good, (r) => r.stats.purchases)),
    spend: { card: spendBy('card'), gem: spendBy('gem'), relic: spendBy('relic'), brush: spendBy('brush'), remove: spendBy('remove') },
    hexesPainted: r1(sumField(good, (r) => r.stats.hexesPainted)), wellsDrunk: r1(sumField(good, (r) => r.stats.wellsDrunk)), brushesUsed: r1(sumField(good, (r) => r.stats.brushesUsed)),
    mercyPerRun: r2(sumField(good, (r) => r.stats.mercy)), mercyRunsPct: r0p(good.filter((r) => r.stats.mercy > 0).length, good.length),
    starvePerRun: r2(sumField(good, (r) => r.starve)), forcedFightsPerRun: r2(sumField(good, (r) => r.forcedFights)),
    campRests: r1(sumField(good, (r) => r.stats.campRests)), upgrades: r1(sumField(good, (r) => r.stats.upgrades)), gemsSocketed: r1(sumField(good, (r) => r.stats.gemsSocketed)),
    chestsOpened: r1(sumField(good, (r) => r.stats.chestsOpened)), relicsFound: r1(sumField(good, (r) => r.stats.relicsFound)), eventsSeen: r1(sumField(good, (r) => r.stats.eventsSeen)),
    perChapter,
  };
  // camp, forge and shop behaviour: what the party does at each stop (the bot decides by value, so a lopsided table is a design finding)
  {
    const camps = [];
    good.forEach((r) => r.camps.forEach((c) => camps.push(c)));
    const campRows = camps.filter((c) => c.kind === 'camp');
    const used = { rest: 0, sharpen: 0, gems: 0, meditate: 0, none: 0 };
    campRows.forEach((c) => { if (!c.used || !c.used.length) used.none += 1; else c.used.forEach((a) => { used[a] = (used[a] || 0) + 1; }); });
    const forgeRows = camps.filter((c) => c.kind === 'forge');
    const shopRows = camps.filter((c) => c.kind === 'shop');
    const leftRatios = [];
    shopRows.forEach((c) => (c.left || []).forEach((x) => { const p = x.split(':'); leftRatios.push(+p[p.length - 1]); }));
    S.stops = {
      camps: campRows.length, campsPerRun: r2(campRows.length / Math.max(1, good.length)), campUse: used,
      campRestShare: r0p(used.rest, campRows.length), campSharpenShare: r0p(used.sharpen, campRows.length), campGemShare: r0p(used.gems, campRows.length), campMeditateShare: r0p(used.meditate, campRows.length),
      forges: forgeRows.length, forgeUpgradeShare: r0p(forgeRows.filter((c) => c.used === 'upgrade').length, forgeRows.length), forgeGemShare: r0p(forgeRows.filter((c) => c.used === 'gems').length, forgeRows.length),
      shops: shopRows.length, shopGoldIn: r1(mean(shopRows.map((c) => c.gold))), shopSpent: r1(mean(shopRows.map((c) => c.spent))), shopEmpty: r0p(shopRows.filter((c) => !c.buys).length, shopRows.length),
      shopGoldOut: r1(mean(shopRows.map((c) => (c.goldAfter === undefined ? c.gold - c.spent : c.goldAfter)))), shopUnaffordable: r1(mean(shopRows.map((c) => c.unaffordable || 0))),
      byChapter: [1, 2, 3].map((ch) => { const x = shopRows.filter((c) => c.ch === ch); return { ch, shops: x.length, perRun: r2(x.length / Math.max(1, good.length)), goldIn: r1(mean(x.map((c) => c.gold))), spent: r1(mean(x.map((c) => c.spent))), empty: r0p(x.filter((c) => !c.buys).length, x.length) }; }),
    };
  }
  S.deck = {
    size: r1(mean(good.map((r) => r.deckSize))), sizeWins: r1(mean(good.filter((r) => r.result === 'win').map((r) => r.deckSize))), upgraded: r1(mean(good.map((r) => r.upgraded))),
    gemsFilled: r1(mean(good.map((r) => r.gemsFilled))), curses: r2(mean(good.map((r) => r.curses))), relics: r1(mean(good.map((r) => r.finalRelics.length))),
  };

  // ---------------------------------------------------------------- hero level
  const heroIds = DATA.LISTS.heroIds;
  heroIds.forEach((h) => {
    const rs = good.filter((r) => r.pair.split(',').indexOf(h) >= 0);
    if (!rs.length) return;
    S.heroes.push(Object.assign({ hero: h }, cellStats(rs)));
  });

  // ---------------------------------------------------------------- items: fight-level ridge
  const cardIds = Object.keys(DATA.cards).filter((id) => { const d = DATA.cards[id]; return d && d.type !== 'curse' && d.type !== 'status' && d.rarity !== 'token'; });
  const relicIds = Object.keys(DATA.relics);
  const gemIds = Object.keys(DATA.gems);
  const col = new Map();
  let p = 0;
  const add = (name) => { col.set(name, p++); };
  cardIds.forEach((id) => add('c:' + id));
  relicIds.forEach((id) => add('r:' + id));
  gemIds.forEach((id) => add('g:' + id));
  const itemCols = p;
  pairs.forEach((x) => add('p:' + x));
  trials.forEach((x) => add('t:' + x));
  const encKeys = new Set();
  fightsAll.forEach((f) => encKeys.add((f.enc || f.enemies.join('+')) + '|' + f.ch));
  Array.from(encKeys).sort().forEach((k) => add('e:' + k));
  add('deckSize'); add('upgraded'); add('gemsOn'); add('curses');
  const rows = [], yv = [];
  const present = { card: new Map(), relic: new Map(), gem: new Map() };
  const playsTot = new Map();
  good.forEach((r) => {
    r.fights.forEach((f) => {
      const sumMax = sum(f.max0);
      if (!sumMax) return;
      const row = [];
      const cnt = new Map();
      let nUp = 0, nCurse = 0;
      f.deck.forEach((raw) => { const id = raw.replace(/\+$/, ''); if (raw.endsWith('+')) nUp += 1; if (cnt.has(id)) cnt.set(id, cnt.get(id) + 1); else cnt.set(id, 1); });
      cnt.forEach((n, id) => {
        const c = col.get('c:' + id);
        if (c === undefined) { nCurse += n; return; }
        row.push([c, Math.min(2, n)]);
        present.card.set(id, (present.card.get(id) || 0) + 1);
      });
      Object.keys(f.plays || {}).forEach((id) => playsTot.set(id, (playsTot.get(id) || 0) + f.plays[id]));
      f.relics.forEach((id) => { const c = col.get('r:' + id); if (c !== undefined) { row.push([c, 1]); present.relic.set(id, (present.relic.get(id) || 0) + 1); } });
      const gcnt = new Map();
      f.gemsOn.forEach((id) => gcnt.set(id, (gcnt.get(id) || 0) + 1));
      gcnt.forEach((n, id) => { const c = col.get('g:' + id); if (c !== undefined) { row.push([c, Math.min(2, n)]); present.gem.set(id, (present.gem.get(id) || 0) + 1); } });
      row.push([col.get('p:' + r.pair), 1]);
      row.push([col.get('t:' + r.trial), 1]);
      row.push([col.get('e:' + (f.enc || f.enemies.join('+')) + '|' + f.ch), 1]);
      row.push([col.get('deckSize'), (f.deck.length - 12) / 8]);
      row.push([col.get('upgraded'), nUp / 5]);
      row.push([col.get('gemsOn'), f.gemsOn.length / 3]);
      row.push([col.get('curses'), nCurse]);
      rows.push(row);
      const lostF = f.result !== 'win' ? 0.5 : 0;
      yv.push(Math.min(1, f.hpLost / sumMax) + lostF);
    });
  });
  let fit = null, sigma2 = 0.04;
  const liftOf = new Map();
  if (rows.length > 50) {
    const lam = new Float64Array(p).fill(0.5);
    for (let j = 0; j < itemCols; j++) lam[j] = opts.ridge || 12;
    fit = ridgeFit(rows, yv, p, lam);
    let ss = 0;
    rows.forEach((r, i) => { let pr = 0; r.forEach((c) => { pr += fit.beta[c[0]] * c[1]; }); ss += (yv[i] - pr) * (yv[i] - pr); });
    sigma2 = ss / Math.max(1, rows.length - 40);
    const seOf = (j) => { const e = new Float64Array(p); e[j] = 1; const x = fit.solve(e); return Math.sqrt(Math.max(0, x[j]) * sigma2); };
    const addLift = (kind, ids, prefix) => ids.forEach((id) => {
      const j = col.get(prefix + id);
      const n = present[kind].get(id) || 0;
      if (!n) { liftOf.set(prefix + id, { lift: 0, se: 0, n: 0 }); return; }
      liftOf.set(prefix + id, { lift: r2(-100 * fit.beta[j]), se: r2(100 * seOf(j)), n });
    });
    addLift('card', cardIds, 'c:'); addLift('relic', relicIds, 'r:'); addLift('gem', gemIds, 'g:');
    S.meta.regression = { fights: rows.length, columns: p, sigma: r3(Math.sqrt(sigma2)), unit: 'percent of party max HP saved per fight' };
  }

  // ---------------------------------------------------------------- items: pick stats, final-deck presence, win shares
  const winRuns = good.filter((r) => r.result === 'win');
  const offered = new Map(), picked = new Map();
  good.forEach((r) => r.picks.forEach((pk) => {
    pk.offered.forEach((id) => offered.set(id, (offered.get(id) || 0) + 1));
    if (pk.picked) picked.set(pk.picked, (picked.get(pk.picked) || 0) + 1);
  }));
  const bought = new Map();
  buys.forEach((b) => { if (b.kind === 'card') bought.set(b.id, (bought.get(b.id) || 0) + 1); });
  const heroRuns = (h) => good.filter((r) => r.pair.split(',').indexOf(h) >= 0);
  const finalHas = (r, id) => r.finalDeck.some((x) => x.replace(/\+$/, '') === id);
  const cardRows = [];
  const baseProfile = {};
  heroIds.forEach((h) => { baseProfile[h] = V.profile(DATA.heroes[h].starter.map((cid, i) => ({ uid: i + 1, id: cid, up: 0, gems: [] })), [h], []); });
  cardIds.forEach((id) => {
    const d = DATA.cards[id];
    const hr = heroRuns(d.hero);
    if (!hr.length) return;
    const withC = hr.filter((r) => finalHas(r, id));
    const wonWith = withC.filter((r) => r.result === 'win').length;
    const hw = hr.filter((r) => r.result === 'win');
    const winShare = hw.length ? withC.filter((r) => r.result === 'win').length / hw.length : 0;
    const lf = liftOf.get('c:' + id) || { lift: 0, se: 0, n: 0 };
    const progWith = withC.length ? mean(withC.map((r) => r.chaptersCleared)) : 0;
    const woC = hr.filter((r) => !finalHas(r, id));
    const progWithout = woC.length ? mean(woC.map((r) => r.chaptersCleared)) : 0;
    cardRows.push({
      id, name: d.name, hero: d.hero, rarity: d.rarity, type: d.type, cost: d.cost, offered: offered.get(id) || 0, picked: picked.get(id) || 0,
      pickRate: r0p(picked.get(id) || 0, offered.get(id) || 0), bought: bought.get(id) || 0, runsWith: withC.length, presence: r0p(withC.length, hr.length),
      winRateWith: r0p(wonWith, withC.length), winRateWithout: r0p(hw.length - wonWith, hr.length - withC.length), progLift: r2(progWith - progWithout),
      lift: lf.lift, se: lf.se, fights: lf.n, winShare: r3(winShare), wonWith,
      playsPerFight: lf.n ? r2((playsTot.get(id) || 0) / lf.n) : 0,
      botNet: r2(V.score({ uid: 0, id, up: 0, gems: (d.slots || []).map(() => null) }, baseProfile[d.hero]).net),
    });
  });
  // pick-win share relative to the mean of the same hero and rarity
  const grp = groupBy(cardRows, (c) => c.hero + ':' + c.rarity);
  grp.forEach((cs) => {
    const m = mean(cs.map((c) => c.winShare));
    cs.forEach((c) => { c.winShareRatio = m > 0 ? r2(c.winShare / m) : 0; });
  });
  S.cards = cardRows;
  {
    // how well does the bot's own static valuation predict the measured lift? (a diagnostic of the draft policy, not of the game)
    const xs = cardRows.filter((c) => c.fights >= 60);
    if (xs.length > 10) {
      const mx = mean(xs.map((c) => c.botNet)), my = mean(xs.map((c) => c.lift));
      let sxy = 0, sxx = 0, syy = 0;
      xs.forEach((c) => { sxy += (c.botNet - mx) * (c.lift - my); sxx += (c.botNet - mx) ** 2; syy += (c.lift - my) ** 2; });
      S.meta.botValuationCorrelation = r2(sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0);
    }
  }

  // relics
  const relicRows = [];
  const relicOffered = new Map(), relicTaken = new Map();
  good.forEach((r) => r.relics.forEach((x) => { x.offered.forEach((id) => relicOffered.set(id, (relicOffered.get(id) || 0) + 1)); if (x.picked && x.taken) relicTaken.set(x.picked, (relicTaken.get(x.picked) || 0) + 1); }));
  relicIds.forEach((id) => {
    const d = DATA.relics[id];
    const withR = good.filter((r) => r.finalRelics.indexOf(id) >= 0);
    const eligible = good.filter((r) => !d.hero || r.pair.split(',').indexOf(d.hero) >= 0);
    if (!eligible.length) return;
    const lf = liftOf.get('r:' + id) || { lift: 0, se: 0, n: 0 };
    const wonWith = withR.filter((r) => r.result === 'win').length;
    const ew = eligible.filter((r) => r.result === 'win');
    relicRows.push({ id, name: d.name, rarity: d.rarity, hero: d.hero || null, offered: relicOffered.get(id) || 0, taken: relicTaken.get(id) || 0, runsWith: withR.length, presence: r0p(withR.length, eligible.length), winRateWith: r0p(wonWith, withR.length), winRateWithout: r0p(ew.length - wonWith, eligible.length - withR.length), lift: lf.lift, se: lf.se, fights: lf.n, winShare: r3(ew.length ? wonWith / ew.length : 0) });
  });
  const rg = groupBy(relicRows, (x) => x.rarity);
  rg.forEach((cs) => { const m = mean(cs.map((c) => c.winShare)); cs.forEach((c) => { c.winShareRatio = m > 0 ? r2(c.winShare / m) : 0; }); });
  S.relics = relicRows;

  // gems
  const gemRows = [];
  const gemGot = new Map(), gemUsed = new Map();
  good.forEach((r) => { r.gems.forEach((g) => gemGot.set(g.id, (gemGot.get(g.id) || 0) + 1)); r.finalGems.forEach((g) => gemUsed.set(g, (gemUsed.get(g) || 0) + 1)); });
  gemIds.forEach((id) => {
    const d = DATA.gems[id];
    const withG = good.filter((r) => r.finalGems.indexOf(id) >= 0);
    const lf = liftOf.get('g:' + id) || { lift: 0, se: 0, n: 0 };
    const wonWith = withG.filter((r) => r.result === 'win').length;
    gemRows.push({ id, name: d.name, color: d.color, tier: d.tier, acquired: gemGot.get(id) || 0, socketed: gemUsed.get(id) || 0, runsWith: withG.length, presence: r0p(withG.length, good.length), winRateWith: r0p(wonWith, withG.length), lift: lf.lift, se: lf.se, fights: lf.n, winShare: r3(winRuns.length ? wonWith / winRuns.length : 0) });
  });
  const gg = groupBy(gemRows, (x) => x.color + x.tier);
  gg.forEach((cs) => { const m = mean(cs.map((c) => c.winShare)); cs.forEach((c) => { c.winShareRatio = m > 0 ? r2(c.winShare / m) : 0; }); });
  S.gems = gemRows;

  // ---------------------------------------------------------------- archetypes
  const archCache = new Map();
  const archRuns = [];
  good.forEach((r) => {
    const a = deckArchetypes(DATA, V, r.finalDeck, archCache);
    r.pair.split(',').forEach((h) => archRuns.push({ hero: h, arch: a.dom[h] || 'mixed', win: r.result === 'win', prog: r.chaptersCleared }));
  });
  heroIds.forEach((h) => {
    const rs = archRuns.filter((x) => x.hero === h);
    if (!rs.length) return;
    const names = (ARCHETYPES[h] || []).concat(['mixed']);
    names.forEach((a) => {
      const xs = rs.filter((x) => x.arch === a);
      S.archetypes.push({ hero: h, arch: a, runs: xs.length, share: r0p(xs.length, rs.length), winRate: r0p(xs.filter((x) => x.win).length, xs.length), prog: r2(mean(xs.map((x) => x.prog))) });
    });
  });

  // ---------------------------------------------------------------- enemies and encounters
  const enemyAgg = new Map();
  const encAgg = new Map();
  fightsAll.forEach((f) => {
    const defs = Array.from(new Set(f.enemies));
    defs.forEach((def) => {
      if (!enemyAgg.has(def)) enemyAgg.set(def, { n: 0, dmg: 0, turns: 0, fights: 0, lost: 0 });
      const e = enemyAgg.get(def);
      e.n += 1; e.dmg += f.byEnemy[def] || 0; e.turns += f.turns; e.fights += 1;
    });
    const k = f.enc || f.enemies.join('+');
    if (!encAgg.has(k)) encAgg.set(k, { enc: k, ch: f.ch, tier: f.tier, enemies: f.enemies, n: 0, hpLost: 0, turns: 0, lost: 0, pctLost: 0 });
    const g = encAgg.get(k);
    g.n += 1; g.hpLost += f.hpLost; g.turns += f.turns; g.pctLost += pct(f.hpLost, sum(f.max0)); if (f.result !== 'win') g.lost += 1;
  });
  lost.forEach((r) => { const def = r.death.top; if (def && enemyAgg.has(def)) enemyAgg.get(def).lost += 1; });
  const enemyRows = [];
  enemyAgg.forEach((e, def) => {
    const d = DATA.enemies[def];
    if (!d) return;
    const nIn = e.n;
    // damage to the party per appearance; for fights with several enemies a single enemy's share is its own damage
    enemyRows.push({ id: def, name: d.name, ch: d.chapter, tier: d.tier, appearances: nIn, dmgPer: r1(e.dmg / nIn), dmgPerTurn: r2(e.dmg / Math.max(1, e.turns)), turnsPer: r1(e.turns / nIn), deaths: e.lost, deathPer100: r1(100 * e.lost / nIn) });
  });
  const tierMean = new Map();
  groupBy(enemyRows.filter((e) => e.tier !== 'boss'), (e) => e.ch + ':' + e.tier).forEach((es, k) => {
    tierMean.set(k, { dmgPerTurn: mean(es.map((e) => e.dmgPerTurn)), deathPer100: mean(es.map((e) => e.deathPer100)) });
  });
  enemyRows.forEach((e) => {
    const tm = tierMean.get(e.ch + ':' + e.tier);
    e.dptRatio = tm && tm.dmgPerTurn ? r2(e.dmgPerTurn / tm.dmgPerTurn) : 1;
    e.deathRatio = tm && tm.deathPer100 ? r2(e.deathPer100 / tm.deathPer100) : 1;
    e.verdict = e.tier === 'boss' ? '' : (e.dptRatio >= 1.5 || (e.deathRatio >= 2.5 && e.deaths >= 3)) ? 'deadly' : (e.dptRatio <= 0.5 && e.appearances >= 10) ? 'easy' : '';
  });
  enemyRows.sort((a, b) => a.ch - b.ch || ['minion', 'normal', 'elite', 'boss'].indexOf(a.tier) - ['minion', 'normal', 'elite', 'boss'].indexOf(b.tier) || b.dmgPerTurn - a.dmgPerTurn);
  S.enemies = enemyRows;
  const encRows = Array.from(encAgg.values()).map((g) => ({ enc: g.enc, ch: g.ch, tier: g.tier, n: g.n, hpLost: r1(g.hpLost / g.n), hpLostPct: r1(g.pctLost / g.n), turns: r1(g.turns / g.n), loseRate: r0p(g.lost, g.n) }));
  groupBy(encRows, (x) => x.ch + ':' + x.tier).forEach((es) => {
    const m = mean(es.filter((x) => x.n >= 5).map((x) => x.hpLostPct)) || mean(es.map((x) => x.hpLostPct));
    const ml = mean(es.map((x) => x.loseRate));
    es.forEach((x) => {
      x.ratio = m ? r2(x.hpLostPct / m) : 1;
      x.verdict = x.tier === 'boss' ? '' : (x.n >= 8 && (x.ratio >= 1.7 || (x.loseRate >= 8 && x.loseRate >= 3 * ml))) ? 'deadly' : (x.n >= 8 && x.ratio <= 0.45) ? 'easy' : '';
    });
  });
  encRows.sort((a, b) => a.ch - b.ch || b.hpLostPct - a.hpLostPct);
  S.encounters = encRows;

  // ---------------------------------------------------------------- events
  const evById = new Map();
  good.forEach((r) => r.events.forEach((e) => {
    if (!evById.has(e.id)) evById.set(e.id, { id: e.id, n: 0, choices: {} });
    const x = evById.get(e.id);
    x.n += 1; x.choices[e.choice] = (x.choices[e.choice] || 0) + 1;
  }));
  S.events = Array.from(evById.values()).map((x) => {
    const def = DATA.events[x.id];
    const top = Object.keys(x.choices).sort((a, b) => x.choices[b] - x.choices[a])[0];
    return { id: x.id, n: x.n, topChoice: +top, topLabel: def && def.choices[top] ? def.choices[top].label : '', topShare: r0p(x.choices[top], x.n), choices: x.choices };
  }).sort((a, b) => b.n - a.n);
  // power curve by rarity (fight-weighted mean lift of the cards the bot held)
  S.rarityCurve = [];
  heroIds.forEach((h) => {
    ['starter', 'common', 'uncommon', 'rare'].forEach((rar) => {
      const cs = S.cards.filter((c) => c.hero === h && c.rarity === rar && c.fights > 0);
      if (!cs.length) return;
      const w = sum(cs.map((c) => c.fights));
      S.rarityCurve.push({ hero: h, rarity: rar, cards: cs.length, lift: r2(sum(cs.map((c) => c.lift * c.fights)) / w), pick: r1(mean(cs.filter((c) => c.offered > 0).map((c) => c.pickRate))), presence: r1(mean(cs.map((c) => c.presence))) });
    });
  });

  S.flags = flagsOf(S, DATA);
  return S;
}

// ------------------------------------------------------------------ flags against the CONTENT_SPEC section 7 targets
function flagsOf(S, DATA) {
  const F = [];
  const T0 = S.cells.filter((c) => c.trial === 0);
  const t0all = S.trials.find((t) => t.trial === 0);
  const add = (sev, msg) => F.push({ sev, msg });
  if (t0all) {
    if (t0all.clear1 < 85 || t0all.clear1 > 97) add('target', `chapter 1 clear (cumulative, trial 0) is ${t0all.clear1}% (target 85 to 97)`);
    if (t0all.clear2 < 60 || t0all.clear2 > 80) add('target', `chapter 2 clear (cumulative, trial 0) is ${t0all.clear2}% (target 60 to 80)`);
    if (t0all.win < 15 || t0all.win > 35) add('target', `full clear (trial 0) is ${t0all.win}% (target 15 to 35)`);
    if (t0all.fightsWinMedian && (t0all.fightsWinMedian < 24 || t0all.fightsWinMedian > 30)) add('info', `median fights in a winning run is ${t0all.fightsWinMedian} (spec: about 24 to 30 fights, 45 to 90 minutes)`);
  }
  T0.forEach((c) => {
    if (c.runs >= 20 && c.win < 8) add('target', `pair ${c.pair} full clear ${c.win}% at trial 0 is below the 8% floor (n=${c.runs})`);
    if (c.runs >= 20 && c.win > 45) add('target', `pair ${c.pair} full clear ${c.win}% at trial 0 is above the 45% ceiling (n=${c.runs})`);
  });
  if (S.trials.length >= 2) {
    const first = S.trials[0], last = S.trials[S.trials.length - 1];
    const dt = last.trial - first.trial;
    if (dt > 0) {
      const slope = (last.win - first.win) / dt;
      add(slope > -1.5 || slope < -6 ? 'target' : 'info', `full clear changes ${r1(slope)} points per Trial level (target about -3), trial ${first.trial}: ${first.win}%, trial ${last.trial}: ${last.win}%`);
    }
  }
  const winsTotal = S.cards.length ? 1 : 0;
  void winsTotal;
  // The spec metric (2.5x the average pick-win share) mostly measures how often the bot PICKS a card, so each hit also says whether the card is measurably
  // strong (lift clearly above zero: a real power outlier) or merely popular with the bot (a value-model preference, not evidence of a broken card).
  S.cards.filter((c) => c.winShareRatio > 2.5 && c.wonWith >= 6).forEach((c) => {
    const strong = c.fights >= 100 && c.lift - 1.64 * c.se > 0.3;
    add(strong ? 'outlier' : 'popular', `card ${c.id} (${c.hero}, ${c.rarity}) pick-win share ${c.winShareRatio}x its rarity peers (wins with it: ${c.wonWith}, picked ${c.pickRate}% of ${c.offered} offers, in ${c.presence}% of final decks, lift ${c.lift} +/- ${c.se} over ${c.fights} fights)${strong ? ': measurably strong' : ': popular, lift not clearly above zero'}`);
  });
  S.relics.filter((c) => c.winShareRatio > 2.5 && c.runsWith >= 8).forEach((c) => add(c.fights >= 100 && c.lift - 1.64 * c.se > 0.3 ? 'outlier' : 'popular', `relic ${c.id} (${c.rarity}) pick-win share ${c.winShareRatio}x its rarity peers (runs ${c.runsWith}, taken ${c.taken} of ${c.offered} offers, lift ${c.lift} +/- ${c.se})`));
  S.gems.filter((c) => c.winShareRatio > 2.5 && c.runsWith >= 8).forEach((c) => add(c.fights >= 100 && c.lift - 1.64 * c.se > 0.3 ? 'outlier' : 'popular', `gem ${c.id} (${c.color} t${c.tier}) pick-win share ${c.winShareRatio}x its tier peers (runs ${c.runsWith}, lift ${c.lift} +/- ${c.se})`));
  S.cards.filter((c) => c.fights >= 150 && c.lift - 2.2 * c.se > 1.2).forEach((c) => add('outlier', `card ${c.id} (${c.hero}) saves ${c.lift}% party HP per fight (se ${c.se}, ${c.fights} fights): strongest tail`));
  S.cards.filter((c) => c.fights >= 150 && c.lift + 2.2 * c.se < -1.0).forEach((c) => add('weak', `card ${c.id} (${c.hero}) costs ${-c.lift}% party HP per fight when held (se ${c.se}, ${c.fights} fights)`));
  S.enemies.filter((e) => e.verdict === 'deadly').forEach((e) => add('enemy', `enemy ${e.id} (ch${e.ch} ${e.tier}) deals ${e.dptRatio}x the HP per turn of its tier peers and wipes ${e.deathPer100} per 100 appearances`));
  S.enemies.filter((e) => e.verdict === 'easy').forEach((e) => add('enemy', `enemy ${e.id} (ch${e.ch} ${e.tier}) deals only ${e.dptRatio}x the HP per turn of its tier peers (too easy?)`));
  S.encounters.filter((e) => e.verdict === 'deadly').forEach((e) => add('enemy', `encounter ${e.enc} (ch${e.ch} ${e.tier}) costs ${e.hpLostPct}% of party max HP, ${e.ratio}x its tier peers, and loses ${e.loseRate}% of its fights (n=${e.n})`));
  S.encounters.filter((e) => e.verdict === 'easy').forEach((e) => add('enemy', `encounter ${e.enc} (ch${e.ch} ${e.tier}) costs only ${e.hpLostPct}% of party max HP, ${e.ratio}x its tier peers (n=${e.n})`));
  S.events.filter((e) => e.n >= 15 && e.topShare >= 92).forEach((e) => add('event', `event ${e.id}: option ${e.topChoice} (${e.topLabel}) was chosen ${e.topShare}% of ${e.n} times by expected value, so its alternatives never pay`));
  S.bosses.forEach((b) => { if (b.attempts >= 15) { if (b.winRate < 55) add('target', `boss ${b.id} win rate ${b.winRate}% over ${b.attempts} attempts is low`); if (b.winRate > 97) add('target', `boss ${b.id} win rate ${b.winRate}% over ${b.attempts} attempts is trivial`); } });
  if (S.economy.mercyRunsPct > 10) add('info', `mercy rule fired in ${S.economy.mercyRunsPct}% of runs (Ink starvation)`);
  if (S.economy.goldFinal > 250) add('info', `runs end with ${S.economy.goldFinal} unspent gold on average (prices or shop frequency too generous?)`);
  return F;
}

// ------------------------------------------------------------------ rendering
function table(headers, rows) {
  const w = headers.map((h, i) => Math.max(String(h).length, ...rows.map((r) => String(r[i] === undefined ? '' : r[i]).length)));
  const line = (r) => r.map((c, i) => String(c === undefined ? '' : c).padEnd(w[i])).join('  ').replace(/\s+$/, '');
  return [line(headers), line(w.map((x) => '-'.repeat(x))), ...rows.map(line)].join('\n');
}
function mdTable(headers, rows) {
  return ['| ' + headers.join(' | ') + ' |', '|' + headers.map(() => '---').join('|') + '|', ...rows.map((r) => '| ' + r.map((c) => (c === undefined ? '' : String(c))).join(' | ') + ' |')].join('\n');
}

export function sections(S, opts) {
  opts = opts || {};
  const out = [];
  const sec = (title, headers, rows, note) => out.push({ title, headers, rows, note });
  sec('Headline (all pairs)', ['trial', 'runs', 'ch1 clear %', 'ch2 clear %', 'full clear %', '+/- 95%', 'cond ch2', 'cond ch3', 'turns med', 'fights med', 'fights med (wins)', 'deck', 'score'],
    S.trials.map((t) => [t.trial, t.runs, t.clear1, t.clear2, t.win, t.winCi, t.cond2, t.cond3, t.turnsMedian, t.fightsMedian, t.fightsWinMedian, t.deckMean, t.scoreMean]),
    'ch1/ch2 clear are cumulative shares of all runs; cond = share of runs that reached the chapter and cleared it. Targets at trial 0: ch1 85-97, ch2 60-80, full 15-35.');
  sec('By hero pair and trial', ['pair', 'trial', 'runs', 'ch1 clear %', 'ch2 clear %', 'ch3 clear = full %', '+/- 95%', 'reach ch2 %', 'reach ch3 %', 'cond ch2 %', 'cond ch3 %', 'lost in ch1 / ch2 / ch3', 'boss win % ch1 / ch2 / ch3', 'turns avg', 'turns med', 'fights avg', 'fights med', 'deck'],
    S.cells.map((c) => [c.pair, c.trial, c.runs, c.clear1, c.clear2, c.win, c.winCi, c.reach2, c.reach3, c.cond2, c.cond3, `${c.lost1} / ${c.lost2} / ${c.lost3}`, c.boss.map((x) => (x === null ? '-' : x)).join(' / '), c.turnsMean, c.turnsMedian, c.fightsMean, c.fightsMedian, c.deckMean]),
    'reach chN = share of all runs that got to chapter N (reach ch2 = ch1 clear); cond chN = share of the runs that reached chapter N and cleared it; reach ch1 is 100.');
  sec('By hero (runs containing the hero)', ['hero', 'runs', 'ch1 %', 'ch2 %', 'full %'], S.heroes.map((h) => [h.hero, h.runs, h.clear1, h.clear2, h.win]));
  sec('Boss fights', ['boss', 'attempts', 'win %', '+/-', 'avg turns', 'HP lost % of max'], S.bosses.map((b) => [b.id, b.attempts, b.winRate, b.ci, b.turns, b.hpLostPct]));
  if (S.energy) {
    const rows = [];
    S.energy.forEach((c) => { rows.push([c.ch, c.fights, c.share.map((x) => `+${x.extra}: ${x.pct}%`).join('  '), c.bossBy.map((b) => `+${b.extra}: ${b.winRate}% of ${b.n}`).join('  ')]); });
    sec('Energy from relics: share of fights by extra Energy, and the chapter boss win rate by extra Energy', ['ch', 'fights', 'share of fights', 'boss win rate (extra Energy: win % of n)'], rows, 'Extra Energy is the sum of the Energy mods of the relics held in the fight (base 3).');
  }
  {
    const br = S.relics.filter((r) => r.rarity === 'boss');
    if (br.length) sec('Boss relics: offers, takes and measured lift', ['relic', 'offered', 'taken', 'take rate %', 'in final decks %', 'lift', 'se', 'fights held', 'win % with'], br.map((r) => [r.id, r.offered, r.taken, r.offered ? r0p(r.taken, r.offered) : 0, r.presence, r.lift, r.se, r.fights, r.winRateWith]),
      'A relic that is offered often and never taken is dominated by its alternatives (for the bot, at least).');
  }
  sec('Fights by chapter and tier', ['ch', 'tier', 'n', 'avg turns', 'HP lost', 'HP lost % of max', 'lose %', 'cards/turn', 'dmg/turn', 'block/turn', 'swaps/fight'], S.fights.map((f) => [f.ch, f.tier, f.n, f.turns, f.hpLost, f.hpLostPct, f.loseRate, f.cardsPerTurn, f.dmgPerTurn, f.blockPerTurn, f.swapsPerFight]));
  sec('Deaths by enemy (the enemy that dealt the most HP damage in the losing fight)', ['enemy', 'deaths', '% of deaths'], S.deaths.byEnemy.slice(0, 15).map((d) => [d.key, d.n, d.pct]));
  sec('Deaths by chapter and tier', ['where', 'deaths', '% of deaths'], S.deaths.byTier.map((d) => [d.key, d.n, d.pct]));
  sec('Deaths by encounter', ['encounter', 'deaths', '% of deaths'], S.deaths.byEncounter.slice(0, 15).map((d) => [d.key, d.n, d.pct]));
  const e = S.economy;
  sec('Economy (per run)', ['metric', 'value'], [
    ['gold earned', e.goldEarned], ['gold spent', e.goldSpent], ['gold unspent at the end', e.goldFinal], ['gold unspent at the end (winning runs)', e.goldFinalWins], ['shops visited', e.shopsVisited], ['purchases', e.purchases],
    ['spent on cards', e.spend.card], ['spent on gems', e.spend.gem], ['spent on relics', e.spend.relic], ['spent on brushes', e.spend.brush], ['spent on removals', e.spend.remove],
    ['hexes painted', e.hexesPainted], ['wells drunk', e.wellsDrunk], ['brushes used', e.brushesUsed], ['mercy grants', e.mercyPerRun], ['runs with a mercy grant %', e.mercyRunsPct],
    ['Ink starvation incidents', e.starvePerRun], ['fights forced by empty Ink', e.forcedFightsPerRun], ['camp rests', e.campRests], ['upgrades', e.upgrades], ['gems socketed', e.gemsSocketed], ['chests', e.chestsOpened], ['relics found', e.relicsFound], ['events seen', e.eventsSeen],
    ['final deck size', S.deck.size], ['final deck upgraded', S.deck.upgraded], ['final deck gems', S.deck.gemsFilled], ['final deck curses', S.deck.curses], ['relics owned', S.deck.relics],
  ]);
  sec('Economy per chapter (runs that finished the chapter)', ['ch', 'n', 'hexes painted', 'wells', 'brushes used', 'fights', 'Ink left', 'runs with mercy %', 'gold left', 'deck size'], e.perChapter.map((c) => [c.ch, c.n, c.painted, c.wells, c.brushes, c.fights, c.inkEnd, c.mercyRuns, c.goldEnd, c.deckEnd]));
  const st = S.stops;
  if (st) {
    sec('Stops: camps, forges and shops', ['metric', 'value'], [
      ['camps visited per run', st.campsPerRun], ['camp action: rest %', st.campRestShare], ['camp action: sharpen %', st.campSharpenShare], ['camp action: cut gems %', st.campGemShare], ['camp action: meditate %', st.campMeditateShare],
      ['forge: upgrade %', st.forgeUpgradeShare], ['forge: gems %', st.forgeGemShare],
      ['shop: gold on arrival', st.shopGoldIn], ['shop: gold spent per visit', st.shopSpent], ['shop: gold left after the visit', st.shopGoldOut], ['shop: visits that bought nothing %', st.shopEmpty], ['shop: items still too dear after the visit', st.shopUnaffordable],
    ].concat(st.byChapter.map((c) => [`shops in chapter ${c.ch}: per run / gold in / spent / bought nothing %`, `${c.perRun} / ${c.goldIn} / ${c.spent} / ${c.empty}`])));
  }
  sec('Archetype usage (dominant archetype of each hero in the final deck)', ['hero', 'archetype', 'runs', 'share %', 'win %', 'avg chapters cleared'], S.archetypes.map((a) => [a.hero, a.arch, a.runs, a.share, a.winRate, a.prog]));
  const withN = (cs, minF) => cs.filter((c) => c.fights >= minF);
  DATA_HEROES.forEach((h) => {
    const cs = withN(S.cards.filter((c) => c.hero === h), 40).slice().sort((a, b) => b.lift - a.lift);
    if (!cs.length) return;
    const mk = (c) => [c.id, c.rarity, c.cost, c.lift, c.se, c.fights, c.offered, c.pickRate, c.presence, c.winRateWith, c.winShareRatio, c.botNet, c.playsPerFight];
    sec(`${h}: ten strongest cards (HP saved per fight, % of party max HP)`, ['card', 'rarity', 'cost', 'lift', 'se', 'fights held', 'offered', 'pick %', 'in final deck %', 'win % with', 'win share x', 'bot net', 'plays/fight'], cs.slice(0, 10).map(mk));
    sec(`${h}: ten weakest cards`, ['card', 'rarity', 'cost', 'lift', 'se', 'fights held', 'offered', 'pick %', 'in final deck %', 'win % with', 'win share x', 'bot net', 'plays/fight'], cs.slice(-10).reverse().map(mk));
  });
  const rl = S.relics.filter((r) => r.fights >= 40).sort((a, b) => b.lift - a.lift);
  const rmk = (c) => [c.id, c.rarity, c.hero || '', c.lift, c.se, c.fights, c.offered, c.taken, c.presence, c.winRateWith, c.winShareRatio];
  sec('Relics: ten strongest', ['relic', 'rarity', 'hero', 'lift', 'se', 'fights held', 'offered', 'taken', 'in final %', 'win % with', 'win share x'], rl.slice(0, 10).map(rmk));
  sec('Relics: ten weakest', ['relic', 'rarity', 'hero', 'lift', 'se', 'fights held', 'offered', 'taken', 'in final %', 'win % with', 'win share x'], rl.slice(-10).reverse().map(rmk));
  const gl = S.gems.filter((r) => r.fights >= 30).sort((a, b) => b.lift - a.lift);
  const gmk = (c) => [c.id, c.color, c.tier, c.lift, c.se, c.fights, c.acquired, c.socketed, c.presence, c.winRateWith, c.winShareRatio];
  sec('Gems: all, by lift', ['gem', 'color', 'tier', 'lift', 'se', 'fights held', 'acquired', 'socketed', 'in final %', 'win % with', 'win share x'], gl.map(gmk));
  sec('Enemies (damage dealt to the party and wipes; ratios are against the enemy tier of the same chapter)', ['enemy', 'ch', 'tier', 'appearances', 'HP dealt per fight', 'HP per turn', 'ratio', 'wipes per 100', 'ratio', 'verdict'],
    S.enemies.map((x) => [x.id, x.ch, x.tier, x.appearances, x.dmgPer, x.dmgPerTurn, x.dptRatio, x.deathPer100, x.deathRatio, x.verdict]));
  sec('Encounters (hardest first within a chapter; ratio is against the same chapter and tier)', ['encounter', 'ch', 'tier', 'n', 'HP lost', '% of max', 'ratio', 'turns', 'lose %', 'verdict'], S.encounters.map((x) => [x.enc, x.ch, x.tier, x.n, x.hpLost, x.hpLostPct, x.ratio, x.turns, x.loseRate, x.verdict]));
  sec('Card power by rarity (fight-weighted mean lift of the held cards)', ['hero', 'rarity', 'cards', 'lift', 'pick % when offered', 'in final deck %'], S.rarityCurve.map((x) => [x.hero, x.rarity, x.cards, x.lift, x.pick, x.presence]));
  sec('Events: how often seen and the share of the most chosen option (the bot picks by expected value, so a share near 100 means the other options never pay)', ['event', 'seen', 'top choice', 'share %', 'label'], (S.events || []).slice(0, 30).map((x) => [x.id, x.n, x.topChoice, x.topShare, x.topLabel]));
  return out;
}
const DATA_HEROES = ['hanae', 'kuro', 'suzu', 'raiga'];

// Search bot (S, recsA) versus COMBAT.greedyPolicy (S2, recsB) on the same seeds: only the combat player differs. Sections in the same shape as `sections`.
export function versusSections(S, S2, recsA, recsB) {
  const out = [];
  const sec = (title, headers, rows, note) => out.push({ title, headers, rows, note });
  const d = (a, b) => (a - b > 0 ? '+' : '') + r1(a - b);
  sec('Search bot versus COMBAT.greedyPolicy: headline by trial', ['trial', 'runs', 'full % (search)', 'full % (greedy)', 'difference', 'ch1 % s/g', 'ch2 % s/g', 'turns med s/g', 'score s/g'],
    S.trials.map((t) => { const g = S2.trials.find((x) => x.trial === t.trial); return g ? [t.trial, t.runs + '/' + g.runs, t.win, g.win, d(t.win, g.win), t.clear1 + '/' + g.clear1, t.clear2 + '/' + g.clear2, t.turnsMedian + '/' + g.turnsMedian, t.scoreMean + '/' + g.scoreMean] : [t.trial, t.runs + '/0', t.win, '', '', '', '', '', '']; }),
    'Same pairs, trials and seeds, same map, draft, shop and camp policies: only the combat player differs.');
  sec('Search bot versus COMBAT.greedyPolicy: by hero pair', ['pair', 'trial', 'runs s/g', 'full % (search)', 'full % (greedy)', 'difference', 'ch2 % s/g'],
    S.cells.map((c) => { const g = S2.cells.find((x) => x.pair === c.pair && x.trial === c.trial); return g ? [c.pair, c.trial, c.runs + '/' + g.runs, c.win, g.win, d(c.win, g.win), c.clear2 + '/' + g.clear2] : [c.pair, c.trial, c.runs + '/0', c.win, '', '', '']; }));
  if (recsA && recsB) {
    const key = (r) => r.pair + '|' + r.trial + '|' + r.seed;
    const mb = new Map(recsB.filter((r) => r && r.result !== 'error').map((r) => [key(r), r]));
    let n = 0, both = 0, onlyA = 0, onlyB = 0, neither = 0;
    recsA.filter((r) => r && r.result !== 'error').forEach((r) => { const g = mb.get(key(r)); if (!g) return; n += 1; const a = r.result === 'win', b = g.result === 'win'; if (a && b) both += 1; else if (a) onlyA += 1; else if (b) onlyB += 1; else neither += 1; });
    sec('Paired outcomes (the same seed played by both)', ['pairs', 'both win', 'only search wins', 'only greedy wins', 'neither wins'], [[n, both, onlyA, onlyB, neither]],
      'Seeds share the map, the shops and the fight seeds, but the runs diverge once the fights differ, so this is a paired comparison and not a replay.');
  }
  const gf = new Map(S2.fights.map((f) => [f.ch + ':' + f.tier, f]));
  sec('Search bot versus COMBAT.greedyPolicy: fights by chapter and tier', ['ch', 'tier', 'n s/g', 'HP lost % of max (search)', 'HP lost % of max (greedy)', 'change %', 'turns s/g', 'lose % s/g'],
    S.fights.map((f) => { const g = gf.get(f.ch + ':' + f.tier); if (!g) return [f.ch, f.tier, f.n + '/0', f.hpLostPct, '', '', '', '']; return [f.ch, f.tier, f.n + '/' + g.n, f.hpLostPct, g.hpLostPct, g.hpLostPct ? Math.round(100 * (f.hpLostPct - g.hpLostPct) / g.hpLostPct) : '', f.turns + '/' + g.turns, f.loseRate + '/' + g.loseRate]; }));
  return out;
}

export function renderText(S, opts) {
  const parts = [];
  parts.push(`INKWOVEN balance bot: ${S.meta.runs} runs (${S.meta.pairs.join(' ')}; trials ${S.meta.trials.join(',')}; combat ${S.meta.combat}${S.meta.combat === 'greedy' ? '' : ' effort ' + S.meta.effort + (S.meta.clairvoyant ? ' clairvoyant' : ' fair')}; style ${S.meta.style}; unlocked ${S.meta.unlocked}; draft noise ${S.meta.noise}; pick bias ${S.meta.pickBias})`);
  if (S.meta.errors) parts.push(`ERRORS: ${S.meta.errors}\n${S.meta.errorSamples.join('\n')}`);
  if (S.meta.stalls || S.meta.caps || S.meta.timeouts) parts.push(`stalled runs ${S.meta.stalls}, capped runs ${S.meta.caps}, fights that hit the 60 turn cap ${S.meta.timeouts}`);
  const all = sections(S, opts).concat(opts && opts.versus ? versusSections(S, opts.versus, opts.versusRecsA, opts.versusRecsB) : []);
  all.forEach((s) => { parts.push(`\n== ${s.title}\n${s.note ? s.note + '\n' : ''}${table(s.headers, s.rows)}`); });
  parts.push('\n== Flags\n' + (S.flags.length ? S.flags.map((f) => `[${f.sev}] ${f.msg}`).join('\n') : 'none'));
  return parts.join('\n');
}

export function renderMarkdown(S, opts) {
  const parts = [];
  parts.push(`# INKWOVEN balance bot report\n\n${S.meta.runs} runs. Pairs: ${S.meta.pairs.join(', ')}. Trials: ${S.meta.trials.join(', ')}. Combat: ${S.meta.combat}${S.meta.combat === 'greedy' ? '' : ' (effort ' + S.meta.effort + (S.meta.clairvoyant ? ', clairvoyant' : ', fair') + ')'}. Style: ${S.meta.style}. Unlocked: ${S.meta.unlocked}. Draft noise: ${S.meta.noise}. Pick bias: ${S.meta.pickBias}.`);
  if (S.meta.errors) parts.push(`**Errors: ${S.meta.errors}**\n\n\`\`\`\n${S.meta.errorSamples.join('\n')}\n\`\`\``);
  const all = sections(S, opts).concat(opts && opts.versus ? versusSections(S, opts.versus, opts.versusRecsA, opts.versusRecsB) : []);
  all.forEach((s) => { parts.push(`## ${s.title}\n\n${s.note ? s.note + '\n\n' : ''}${mdTable(s.headers, s.rows)}`); });
  parts.push('## Flags\n\n' + (S.flags.length ? S.flags.map((f) => `- [${f.sev}] ${f.msg}`).join('\n') : 'none'));
  return parts.join('\n\n');
}
