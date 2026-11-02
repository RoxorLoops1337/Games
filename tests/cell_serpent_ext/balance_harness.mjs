// Headless balance harness: botInput + random card picks, deterministic seeds.
import * as sim from '../../cell_serpent/sim.js';
export function playRun(stage, seed, opts = {}) {
  const g = sim.createGame({ seed, stage, meta: opts.meta, skills: opts.skills });
  const pr = sim.rng(seed * 7919 + 13);
  const dt = 1 / 30, cap = 900;
  while (g.t < cap && g.phase !== 'dead' && g.phase !== 'won') {
    sim.step(g, dt, sim.botInput(g));
    if (g.phase === 'levelup') sim.choose(g, Math.min(g.choices.length - 1, Math.floor(pr() * g.choices.length)));
    g.events.length = 0;
  }
  const r = g.result || { coins: Math.floor(g.coins) };
  return { won: g.phase === 'won', coins: r.coins, progress: g.progress, time: g.t };
}
export function winRate(stage, meta, n = 8, skills) {
  let w = 0, coins = 0, prog = 0;
  for (let i = 0; i < n; i++) { const r = playRun(stage, 100 + i * 17 + stage, { meta, skills }); if (r.won) w++; coins += r.coins; prog += r.progress; }
  return { win: w / n, coins: coins / n, prog: prog / n };
}
