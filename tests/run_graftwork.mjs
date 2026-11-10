// Runs every tests/graftwork_*.test.mjs on a pool of up to 4 workers; fails if any fails. New suites are picked up automatically.
// Slowest files start first so the pool stays busy. FAIL lines and the final "N/N graftwork suites passed" line are kept.
// Options: --serial (one at a time), --jobs=N (pool size, default 4), --times (print the per-suite time table).
import { readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
const dir = new URL('.', import.meta.url);
const files = readdirSync(dir).filter((f) => /^graftwork_.*\.test\.mjs$/.test(f)).sort();
const argv = process.argv.slice(2);
const jobsArg = argv.find((a) => a.startsWith('--jobs='));
const JOBS = argv.includes('--serial') ? 1 : Math.max(1, Math.min(8, jobsArg ? +jobsArg.slice(7) || 4 : 4));
// files known to be slow start first (longest-processing-time-first scheduling)
const HEAVY = ['ui_combat', 'ui_layout', 'monkey', 'ui_juice', 'audio_mix', 'ui_ward', 'ui_combat_layout', 'post'].map((n) => `graftwork_${n}.test.mjs`);
const order = [...files].sort((a, b) => {
  const ia = HEAVY.indexOf(a), ib = HEAVY.indexOf(b);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || (a < b ? -1 : 1);
});
const t0 = Date.now();
const results = new Map();
let next = 0, bad = 0;

function runOne(f) {
  return new Promise((resolve) => {
    const t = Date.now();
    const p = spawn(process.execPath, [new URL(f, dir).pathname], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { err += String(e); });
    p.on('close', (code) => {
      const ms = Date.now() - t;
      results.set(f, ms);
      const ok = code === 0;
      console.log(`${ok ? 'PASS' : 'FAIL'} ${f}`);
      if (!ok) { bad++; console.log(out.split('\n').slice(-12).join('\n')); console.log(err); }
      resolve();
    });
  });
}
async function worker() {
  while (next < order.length) await runOne(order[next++]);
}
await Promise.all(Array.from({ length: Math.min(JOBS, order.length) }, worker));
if (argv.includes('--times')) {
  for (const [f, ms] of [...results].sort((a, b) => b[1] - a[1])) console.log(`${String(ms).padStart(7)} ms  ${f}`);
}
console.log(`${files.length - bad}/${files.length} graftwork suites passed (${((Date.now() - t0) / 1000).toFixed(1)}s, ${JOBS} workers)`);
process.exit(bad ? 1 : 0);
