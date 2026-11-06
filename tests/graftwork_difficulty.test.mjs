// Difficulty gate: a player who plays randomly never wins, a sloppy one almost never does, and skill raises how far a run goes.
// Engine-only (no UI). Fixed seeds. Full tier tables: tools/graftwork_tiers.mjs, targets in graftwork/design/DIFFICULTY.md.
import { runTier } from '../tools/graftwork_tiers.mjs';
import { HEROES } from '../graftwork/data/index.js';

let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL ' + m); } else console.log('ok   ' + m); };
const heroes = Object.keys(HEROES);
const batch = (tier, n, tag) => { const rs = []; for (let i = 0; i < n; i++) rs.push(runTier(tier, heroes[i % heroes.length], `${tag}-${tier}-${i}`, 0)); return rs; };
const wins = (rs) => rs.filter((r) => r.outcome === 'won').length;
const mean = (rs) => rs.reduce((a, r) => a + r.floors, 0) / rs.length;

const rnd = batch('random', 200, 'dt');
ok(wins(rnd) === 0, `RANDOM wins 0 of 200 (got ${wins(rnd)})`);
const slo = batch('sloppy', 100, 'dt');
ok(wins(slo) / slo.length < 0.03, `SLOPPY wins under 3 percent of 100 (got ${wins(slo)})`);

const o = batch('random', 60, 'ord'), s = batch('sloppy', 60, 'ord'), c = batch('careful', 60, 'ord');
const [fo, fs, fc] = [mean(o), mean(s), mean(c)];
console.log(`mean floors: random ${fo.toFixed(1)}  sloppy ${fs.toFixed(1)}  careful ${fc.toFixed(1)}`);
ok(fo < fs, 'mean floors RANDOM < SLOPPY');
ok(fs < fc, 'mean floors SLOPPY < CAREFUL');
ok(fo < 8, 'RANDOM runs end early (mean floors under 8)');

if (fails) { console.log(`${fails} difficulty checks failed`); process.exit(1); }
console.log('difficulty ok');
