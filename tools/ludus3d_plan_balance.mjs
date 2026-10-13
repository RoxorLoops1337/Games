// Ludus Maximus 3D: balance table for the pre-fight battle plan (roles, formations, priority target, Showmanship).
//   node tools/ludus3d_plan_balance.mjs [fights=200] [size=3] [only: regex on the option names, e.g. 'baseline|suggested']
// Paired design: matchup i is the same two teams and the same random stream for every option, so only the option changes. The foe plays its own AI plan (LM.oppPlan).
// "role X" puts role X on ONE slot (rotating through the slots) and leaves the rest free, so it measures what the role does by itself.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
require('../ludus_maximus_3d/core/data.js'); const LM = require('../ludus_maximus_3d/core/sim.js'); require('../ludus_maximus_3d/core/ext.js'); require('../ludus_maximus_3d/core/arena.js');
const N = +(process.argv[2] || 200), SIZE = +(process.argv[3] || 3), ONLY = process.argv[4] ? new RegExp(process.argv[4]) : null, D = globalThis.LM_D || require('../ludus_maximus_3d/core/data.js');
const STY = ['murmillo', 'retiarius', 'thraex', 'hoplomachus', 'dimachaerus'];
const teams = (i) => {
  const r = LM.mulberry(7000 + i), pick = () => STY[Math.floor(r() * 5)], lvl = 5 + Math.floor(r() * 4);
  const mk = (id, side) => LM.makeGlad({ style: pick(), lvl, id, name: side + id, r: LM.mulberry(id * 17 + i), trait: Math.floor(r() * 4) === 0 ? 'hothead' : undefined });
  return { A: Array.from({ length: SIZE }, (_, k) => mk(100 + k, 'a')), B: Array.from({ length: SIZE }, (_, k) => mk(200 + k, 'b')) };
};
function fight(i, plan, foe) {
  const { A, B } = teams(i); LM.setRandom(LM.mulberry(31 + i));
  const pl = plan(A, B, i), { pa, pb } = LM.fightPlans(null, A, B, pl);
  const ca = LM.teamCtx(null, A, pa || 'bal'), cb = LM.teamCtx(null, B, 'bal'), pbb = foe === 'ai' ? pb : LM.normPlan({ form: 'line', roles: {}, prio: LM.suggestFoc(A) }, B); if (pbb) cb.plan = LM.normPlan(pbb, B);
  const F = LM.createFight(LM.mkUnits(A, 'A', ca), LM.mkUnits(B, 'B', cb), { autoA: true, quiet: true });
  LM.planFight(F, pa, pbb);
  let n = 0; while (!F.done && n++ < 4000) LM.step(F, 1 / 30);
  return { win: F.winner === 'A' ? 1 : 0, t: F.t, hp: F.units.filter((u) => u.side === 'A').reduce((a, u) => a + u.hp, 0) / F.units.filter((u) => u.side === 'A').reduce((a, u) => a + u.maxhp, 0) };
}
const free = (A) => Object.fromEntries(A.map((g) => [g.id, 'free']));
const weak = (B) => LM.suggestFoc(B), strong = (B) => { const at = B.map((g) => LM.derive(g, { noperf: true }).atk); return at.indexOf(Math.max(...at)); };
// every option below carries the suggested priority target (the sheet pre-fills it), so the table compares roles and formations on equal terms
const opts = [['baseline (line, all free, priority: softest)', (A, B) => ({ form: 'line', roles: {}, prio: weak(B) })]];
for (const r of LM.ROLE_IDS.filter((x) => x !== 'free')) opts.push([`role ${r} (one slot)`, (A, B, i) => { const ro = free(A); ro[A[i % A.length].id] = r; return { form: 'line', roles: ro, prio: weak(B) }; }]);
for (const f of LM.FORM_IDS) opts.push([`formation ${f}`, (A, B) => ({ form: f, roles: {}, prio: weak(B) })]);
opts.push(['suggested plan (formation by style, its roles)', (A, B) => LM.defaultPlan(null, A, B)]);
const prioRows = [['priority: none', (A, B) => ({ form: 'line', roles: {}, prio: null })], ['priority: strongest hitter', (A, B) => ({ form: 'line', roles: {}, prio: strong(B) })], ['priority: strongest + hunter slot 0', (A, B) => { const ro = free(A); ro[A[0].id] = 'hunter'; return { form: 'line', roles: ro, prio: strong(B) }; }]];
const rows = [];
for (const foe of ['ai', 'base']) {
  console.log(`\n== ${SIZE}v${SIZE}, ${N} paired fights, foe ${foe === 'ai' ? 'plays its AI plan' : 'plays line, all free, priority on your softest'} ==`);
  const res = [], extra = [];
  for (const [name, f] of ONLY ? [] : prioRows) { let w = 0; for (let i = 0; i < N; i++) w += fight(i, f, foe).win; extra.push([name, w / N]); }
  for (const [name, f] of opts.filter(([n]) => !ONLY || /baseline/.test(n) || ONLY.test(n))) { let w = 0, t = 0, hp = 0; for (let i = 0; i < N; i++) { const r = fight(i, f, foe); w += r.win; t += r.t; hp += r.hp; } res.push({ name, wr: w / N, t: t / N, hp: hp / N }); }
  const b0 = res[0].wr; for (const r of res) console.log(`${r.name.padEnd(40)} win ${(r.wr * 100).toFixed(1).padStart(5)}%  (${((r.wr - b0) * 100 >= 0 ? '+' : '') + ((r.wr - b0) * 100).toFixed(1)})  fight ${r.t.toFixed(1)}s  hp left ${(r.hp * 100).toFixed(0)}%`);
  for (const [name, wr] of extra) console.log(`${name.padEnd(40)} win ${(wr * 100).toFixed(1).padStart(5)}%  (${((wr - b0) * 100 >= 0 ? '+' : '') + ((wr - b0) * 100).toFixed(1)})`);
  const sensible = res.filter((r) => !/baseline/.test(r.name)); const mx = Math.max(...sensible.map((r) => r.wr)), mn = Math.min(...sensible.map((r) => r.wr));
  console.log(`spread among the options: ${((mx - mn) * 100).toFixed(1)} points (max ${(mx * 100).toFixed(1)}, min ${(mn * 100).toFixed(1)})`);
}
// solo: Showmanship dial, mirror matches of equal level (the dial costs the win chance; the fame bonus is shown next to it)
console.log(`\n== 1v1 Showmanship, ${Math.max(N * 5, 1000)} paired duels against an equal foe (efficient) ==`);
const duel = (i, lv) => { const r = LM.mulberry(9000 + i), a = LM.makeGlad({ style: STY[Math.floor(r() * 5)], lvl: 6, id: 1, name: 'a', r: LM.mulberry(i * 3 + 1) }), b = LM.makeGlad({ style: STY[Math.floor(r() * 5)], lvl: 6, id: 2, name: 'b', r: LM.mulberry(i * 3 + 2) });
  LM.setRandom(LM.mulberry(77 + i)); const pl = LM.normPlan({ show: lv }, [a]), ca = LM.teamCtx(null, [a], pl), F = LM.createFight(LM.mkUnits([a], 'A', ca), LM.mkUnits([b], 'B', LM.teamCtx(null, [b], 'bal')), { autoA: true, quiet: true });
  let n = 0; while (!F.done && n++ < 6000) LM.step(F, 1 / 30); return { win: F.winner === 'A' ? 1 : 0, t: F.t, hype: Math.max(F.peak, F.hype), hpf: F.units[0].hp / F.units[0].maxhp }; };
for (const lv of ONLY ? [] : [0, 1, 2, 3]) { let w = 0, t = 0, hy = 0, hp = 0; const M = Math.max(N * 5, 1000); for (let i = 0; i < M; i++) { const r = duel(i, lv); w += r.win; t += r.t; hy += Math.min(100, r.hype); hp += r.hpf; } const S0 = LM.SHOW[lv]; console.log(`${S0.n.padEnd(14)} win ${(w / M * 100).toFixed(1).padStart(5)}%  fight ${(t / M).toFixed(1)}s  hype ${(hy / M).toFixed(0)}  hp left ${(hp / M * 100).toFixed(0)}%  | fame x${(1 + S0.fame).toFixed(2)} (x${((0.85 + hy / M / 300) * (1 + S0.fame)).toFixed(2)} with hype)`); }
