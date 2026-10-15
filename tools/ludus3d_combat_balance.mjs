// Ludus Maximus 3D: does the deeper combat (stamina, weapon classes, armour weight) move style balance?
//   node tools/ludus3d_combat_balance.mjs [fights per pairing=60] [level=6]
// Paired design: every pairing uses the same gladiators and the same random seed with deep OFF and deep ON. Prints each style's win rate over all pairings
// (an ideal pentagon sits at 50%), the shift the deep rules cause, the average fight length and how often fighters get tired or winded.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const D = require('../ludus_maximus_3d/core/data.js'); const LM = require('../ludus_maximus_3d/core/sim.js'); require('../ludus_maximus_3d/core/ext.js'); require('../ludus_maximus_3d/core/arena.js');
if (process.argv[4]) Object.assign(LM.COMBAT_TUNE, JSON.parse(process.argv[4])); // e.g. '{"jav":0}' to isolate one rule
const SIZES = (process.argv[5] || '1,3').split(',').map(Number);
const N = +(process.argv[2] || 60), LVL = +(process.argv[3] || 6), ST = D.STYLE_IDS;
function one(sa, sb, i, deep, size) {
  const mk = (st, id, nm) => LM.makeGlad({ style: st, lvl: LVL + (i % 3), id, name: nm, r: LM.mulberry(id * 7 + i) });
  const A = Array.from({ length: size }, (_, k) => mk(k ? ST[(ST.indexOf(sa) + k) % 5] : sa, 100 + k, 'a' + k)), B = Array.from({ length: size }, (_, k) => mk(k ? ST[(ST.indexOf(sb) + k) % 5] : sb, 200 + k, 'b' + k));
  LM.setRandom(LM.mulberry(1000 + i));
  const F = LM.createFight(LM.mkUnits(A, 'A', LM.teamCtx(null, A, 'bal')), LM.mkUnits(B, 'B', LM.teamCtx(null, B, 'bal')), { autoA: true, quiet: false, deep: deep ? 1 : 0 });
  let n = 0, tired = 0, winded = 0; while (!F.done && n++ < 4000) { LM.step(F, 1 / 30); for (const e of F.ev) { if (e.k === 'tired') tired++; else if (e.k === 'winded') winded++; } F.ev.length = 0; }
  return { win: F.winner === 'A' ? 1 : 0, t: F.t, tired, winded };
}
for (const size of SIZES) {
  const rows = {}; for (const s of ST) rows[s] = { off: 0, on: 0, g: 0 }; let tOff = 0, tOn = 0, tired = 0, winded = 0, fights = 0;
  for (const a of ST) for (const b of ST) { if (a === b) continue; for (let i = 0; i < N; i++) { const o = one(a, b, i, false, size), p = one(a, b, i, true, size); rows[a].off += o.win; rows[a].on += p.win; rows[a].g++; rows[b].off += 1 - o.win; rows[b].on += 1 - p.win; rows[b].g++; tOff += o.t; tOn += p.t; tired += p.tired; winded += p.winded; fights++; } }
  console.log(`\n== ${size}v${size}, level ${LVL}-${LVL + 2}, ${fights} paired fights ==`);
  for (const s of ST) { const r = rows[s]; console.log(`${s.padEnd(12)} plain ${(r.off / r.g * 100).toFixed(1).padStart(5)}%   deep ${(r.on / r.g * 100).toFixed(1).padStart(5)}%   shift ${((r.on - r.off) / r.g * 100 >= 0 ? '+' : '') + ((r.on - r.off) / r.g * 100).toFixed(1)}`); }
  const sp = (k) => { const v = ST.map((s) => rows[s][k] / rows[s].g * 100); return (Math.max(...v) - Math.min(...v)).toFixed(1); };
  console.log(`spread (max - min win rate): plain ${sp('off')} points, deep ${sp('on')} points; fight length ${(tOff / fights).toFixed(1)} s -> ${(tOn / fights).toFixed(1)} s; tired ${(tired / fights).toFixed(2)} and winded ${(winded / fights).toFixed(2)} per fight (all fighters)`);
}
