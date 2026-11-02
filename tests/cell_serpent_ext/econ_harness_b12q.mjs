// Stat economy harness (batch 12, agent q): income per run by stage (measured with the bot), a human-like aimer for ring
// stages (copy of the b12d one so this file stands alone), and a greedy stat-buying player simulation.
import * as sim from '../../cell_serpent/sim.js';
import { playRun, smartBot, profileFor } from './balance_harness.mjs';

export function humanBot(seed = 1, o = {}) {
  const maxTurn = (o.turnDeg || 60) * Math.PI / 180, noise = (o.noiseDeg || 6) * Math.PI / 180, lag = o.lag || 0.25, R = sim.rng(seed * 104729 + 7);
  let aim = -Math.PI / 2, want = aim, nt = 0, wt = 0, off = 0, last = 0;
  const gauss = () => { let a = 0; for (let i = 0; i < 4; i++) a += R(); return (a - 2) * 1.73; };
  return g => {
    if (!g.ring) return smartBot(g);
    const dt = g.t - last; last = g.t; nt -= dt; wt -= dt;
    const b = smartBot(g);
    if (wt <= 0) { wt = lag; want = b.aim; }
    if (nt <= 0) { nt = 0.2; off = gauss() * noise; }
    let d = want + off - aim; d = Math.atan2(Math.sin(d), Math.cos(d));
    aim += Math.max(-maxTurn * dt, Math.min(maxTurn * dt, d));
    return { mx: 0, my: 0, aim, encore: b.encore };
  };
}
export function humanRuns(stage, opts, n = 6) {
  let w = 0, coins = 0, time = 0;
  for (let i = 0; i < n; i++) { const seed = 100 + i * 17 + stage, r = playRun(stage, seed, { ...opts, bot: humanBot(seed) }); if (r.won) w++; coins += r.coins; time += r.time; }
  return { win: w / n, coins: coins / n, time: time / n };
}
// Pinned income points: [stage, Beats per run, seconds per run]. Linear in between. Re-measure: node econ_harness_b12q.mjs measure
export const INCOME = [[1, 100, 80], [3, 260, 90], [8, 1100, 110], [15, 3000, 230], [25, 8600, 450], [40, 15600, 480], [50, 19000, 480]];
export function incomeAt(stage) {
  for (let i = 1; i < INCOME.length; i++) if (stage <= INCOME[i][0]) { const a = INCOME[i - 1], b = INCOME[i], t = (stage - a[0]) / (b[0] - a[0]); return { coins: a[1] + t * (b[1] - a[1]), sec: a[2] + t * (b[2] - a[2]) }; }
  const l = INCOME[INCOME.length - 1]; return { coins: l[1], sec: l[2] };
}
export const OVERHEAD_SEC = 20;   // hub, cards, result screen between runs
// Greedy player: plays runs, clears one stage per runsPerClear(stage) runs, spends ALL Beats on the cheapest affordable stat level
// the rules allow (capFn(cleared) or none). Returns the timeline.
export function simulate(META, metaCost, capFn, opts = {}) {
  const runsPerClear = opts.runsPerClear || (s => (s <= 10 ? 3 : s <= 25 ? 4 : 6));
  const meta = {}; for (const d of META) meta[d.id] = 0;
  let beats = 0, cleared = 0, tries = 0, runs = 0, sec = 0, total = 0, spent = 0;
  const levelAt = {}, byStage = {};
  const ladder = META.filter(d => d.id !== 'rev'), lim = opts.maxRuns || 400000;
  while (runs < lim) {
    const stage = Math.min(50, cleared + 1), inc = incomeAt(stage);
    runs++; sec += inc.sec + OVERHEAD_SEC; beats += inc.coins * (opts.share == null ? 0.5 : opts.share);
    if (cleared < 50 && ++tries >= runsPerClear(stage)) { tries = 0; cleared++; if (cleared === 10 || cleared === 25 || cleared === 50) byStage[cleared] = { runs, hours: sec / 3600, levels: total, meta: { ...meta } }; }
    for (;;) {
      let pick = null, pc = Infinity;
      for (const d of ladder) { const l = meta[d.id]; if (l >= d.max || (capFn && l >= capFn(cleared))) continue; const c = metaCost(d, l); if (c < pc) { pc = c; pick = d; } }
      if (!pick || pc > beats) break;
      beats -= pc; spent += pc; meta[pick.id]++; total++; levelAt[total] = { runs, hours: sec / 3600, cleared, meta: { ...meta } };
    }
    if (ladder.every(d => meta[d.id] >= d.max)) break;
  }
  return { runs, hours: sec / 3600, levelAt, byStage, total, spent, meta, cleared };
}
if (process.argv[2] === 'measure') {
  for (const st of [1, 3, 5, 8, 12, 15, 20, 25, 32, 40, 50]) {
    const b = profileFor(Math.max(1, st)).build, r = humanRuns(st, b, 4);
    console.log(st, 'win', r.win, 'coins', Math.round(r.coins), 'sec', Math.round(r.time));
  }
}
