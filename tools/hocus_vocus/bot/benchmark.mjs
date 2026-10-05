// Hocus Vocus balance bot: head to head benchmark of the combat players. Takes the fights that real bot runs fought (their decks, relics,
// hero pair and enemy line-up, from the run records), puts the party at FULL HP and fights each one twice from the same seed: once with
// COMBAT.greedyPolicy and once with the search bot. Same deck, same relics, same enemies, same RNG: only the player differs, so the
// difference is the value of playing well, in HP and in fights lost.
//
//   benchmark(G, records, { perCell: 40, effort: 'normal' }) -> { rows, total }
import { createValuer } from './cardval.mjs';
import { createCombatAI } from './combat_ai.mjs';

const EFFORT = {
  fast: { normal: { 1: [1, 40], 2: [1, 40], 3: [1, 50] }, elite: [1, 50], boss: [1, 60] },
  normal: { normal: { 1: [1, 50], 2: [2, 80], 3: [2, 90] }, elite: [2, 100], boss: [3, 130] },
  deep: { normal: { 1: [3, 120], 2: [3, 120], 3: [3, 120] }, elite: [4, 180], boss: [4, 180] },
};

export function benchmark(G, records, opts) {
  opts = opts || {};
  const { DATA, RUN, COMBAT } = G;
  const V = createValuer(G);
  const E = EFFORT[opts.effort || 'normal'];
  const mkWith = (clair) => (t) => createCombatAI(G, V, { beam: t[0], maxReplays: t[1], clairvoyant: clair });
  const build = (clair) => { const mk = mkWith(clair); return { normal: { 1: mk(E.normal[1]), 2: mk(E.normal[2]), 3: mk(E.normal[3]) }, elite: mk(E.elite), boss: mk(E.boss) }; };
  const ais = build(false);
  const aisClair = opts.clairvoyant ? build(true) : null;
  const cells = new Map();
  records.forEach((r) => {
    if (!r || !r.fights) return;
    r.fights.forEach((f, i) => {
      if (f.source !== 'combat' || f.max0.length !== 2) return;
      const key = f.ch + ':' + f.tier;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push({ r, f, i });
    });
  });
  const rows = [];
  const total = { n: 0, lossG: 0, lossA: 0, winG: 0, winA: 0, lossC: 0, winC: 0 };
  Array.from(cells.keys()).sort().forEach((key) => {
    const all = cells.get(key);
    const per = opts.perCell || 40;
    const step = Math.max(1, Math.floor(all.length / per));
    const picks = [];
    for (let k = 0; k < all.length && picks.length < per; k += step) picks.push(all[k]);
    const [ch, tier] = key.split(':');
    let n = 0, lossG = 0, lossA = 0, winG = 0, winA = 0, turnsG = 0, turnsA = 0, lossC = 0, winC = 0;
    picks.forEach(({ r, f, i }) => {
      const R = RUN.newRun({ heroes: r.pair.split(','), trial: r.trial, seed: r.seed });
      R.chapter = f.ch;
      R.relics = f.relics.slice();
      R.deck = f.deck.map((raw, j) => { const id = raw.replace(/\+$/, ''); const d = DATA.cards[id]; return { uid: j + 1, id, up: raw.endsWith('+') && d && d.up ? 1 : 0, gems: ((d && d.slots) || []).map(() => null) }; });
      const node = { enemies: f.enemies.slice(), tier: f.tier, seed: (r.seed * 31 + i * 7 + 1) >>> 0 };
      const o = RUN.combatInit(R, node);
      o.heroes = R.heroes.map((h, j) => ({ id: h.id, hp: f.max0[j], maxHp: f.max0[j] }));
      o.maxTurns = 60;
      const maxSum = f.max0.reduce((a, b) => a + b, 0);
      const sg = COMBAT.simulate(Object.assign({}, o));
      const pickAi = (set) => (tier === 'boss' ? set.boss : tier === 'elite' ? set.elite : set.normal[ch] || set.normal[3]);
      const fa = pickAi(ais).fight(o);
      const sa = fa.summary;
      if (aisClair) { const sc = pickAi(aisClair).fight(Object.assign({}, o)).summary; lossC += sc.result === 'win' ? sc.heroes.reduce((x, h) => x + (h.down ? h.maxHp : h.maxHp - h.hp), 0) : maxSum; winC += sc.result === 'win' ? 1 : 0; }
      const loss = (s) => (s.result === 'win' ? s.heroes.reduce((x, h) => x + (h.down ? h.maxHp : h.maxHp - h.hp), 0) : maxSum);
      n += 1; lossG += loss(sg); lossA += loss(sa);
      winG += sg.result === 'win' ? 1 : 0; winA += sa.result === 'win' ? 1 : 0; turnsG += sg.turns; turnsA += fa.turns || 0;
    });
    if (!n) return;
    const row = { ch: +ch, tier, n, lossG: Math.round(lossG / n * 10) / 10, lossA: Math.round(lossA / n * 10) / 10, winG: Math.round(1000 * winG / n) / 10, winA: Math.round(1000 * winA / n) / 10, turnsG: Math.round(turnsG / n * 10) / 10, turnsA: Math.round(turnsA / n * 10) / 10 };
    if (aisClair) { row.lossC = Math.round(lossC / n * 10) / 10; row.winC = Math.round(1000 * winC / n) / 10; }
    row.change = row.lossG ? Math.round(1000 * (row.lossA - row.lossG) / row.lossG) / 10 : 0;
    rows.push(row);
    total.n += n; total.lossG += lossG; total.lossA += lossA; total.winG += winG; total.winA += winA; total.lossC += lossC; total.winC += winC;
  });
  return { rows, total: { n: total.n, lossG: Math.round(total.lossG / Math.max(1, total.n) * 10) / 10, lossA: Math.round(total.lossA / Math.max(1, total.n) * 10) / 10, winG: Math.round(1000 * total.winG / Math.max(1, total.n)) / 10, winA: Math.round(1000 * total.winA / Math.max(1, total.n)) / 10, lossC: Math.round(total.lossC / Math.max(1, total.n) * 10) / 10, winC: Math.round(1000 * total.winC / Math.max(1, total.n)) / 10 } };
}
