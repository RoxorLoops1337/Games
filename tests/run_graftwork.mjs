// Runs every tests/graftwork_*.test.mjs on a pool of up to 4 workers; fails if any fails. New suites are picked up automatically.
// Slowest files start first so the pool stays busy (longest processing time first): the order is the time each suite took in the last
// run of this checkout, kept in a small file under the system temp folder (never in the repo). Without that file the order is HEAVY
// below; a suite with no time on record starts first. FAIL lines and the final "N/N graftwork suites passed" line are kept.
// Options: --serial (one at a time), --jobs=N (pool size, default 4), --times (print the per-suite time table).
import { readdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir = new URL('.', import.meta.url);
const files = readdirSync(dir).filter((f) => /^graftwork_.*\.test\.mjs$/.test(f)).sort();
const argv = process.argv.slice(2);
const jobsArg = argv.find((a) => a.startsWith('--jobs='));
const JOBS = argv.includes('--serial') ? 1 : Math.max(1, Math.min(8, jobsArg ? +jobsArg.slice(7) || 4 : 4));
// The fallback order (no times on record yet): the suites that take longest, slowest first, as measured by `--times`. Measure again
// when a suite joins or leaves this group.
const HEAVY = ['ui_layout', 'ui_combat', 'tip_layout', 'ui_ward', 'monkey', 'ui_juice', 'ui_combat_layout', 'audio_mix', 'difficulty', 'glossary', 'ward_big', 'tip_lifecycle', 'e2e', 'ui_ward_kit'].map((n) => `graftwork_${n}.test.mjs`);
const TIMES_FILE = join(tmpdir(), `graftwork_suite_times_${createHash('sha1').update(dir.pathname).digest('hex').slice(0, 10)}.json`);
let known = {};
try { const j = JSON.parse(readFileSync(TIMES_FILE, 'utf8')); if (j && typeof j === 'object') known = j; } catch { /* first run of this checkout, or an unreadable file: the fixed list */ }
const haveTimes = files.some((f) => known[f] > 0);
const rank = (f) => (haveTimes ? (known[f] > 0 ? known[f] : Infinity) : HEAVY.includes(f) ? HEAVY.length - HEAVY.indexOf(f) : 0);
const order = [...files].sort((a, b) => { const ra = rank(a), rb = rank(b); return ra === rb ? (a < b ? -1 : 1) : rb - ra; });
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
      if (ok) known[f] = ms; // a failed suite may have stopped early: its old time stays
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
// remember the times for the next run's order (written beside the file, then renamed, so no runner ever reads half a file); suites that are gone drop out
try {
  const keep = Object.fromEntries(files.filter((f) => known[f] > 0).map((f) => [f, known[f]]));
  const tmp = `${TIMES_FILE}.${process.pid}`; writeFileSync(tmp, JSON.stringify(keep)); renameSync(tmp, TIMES_FILE);
} catch { /* a read-only temp folder: the next run uses what it finds */ }
if (argv.includes('--times')) {
  for (const [f, ms] of [...results].sort((a, b) => b[1] - a[1])) console.log(`${String(ms).padStart(7)} ms  ${f}`);
}
// CPU seconds of the suites (Linux only: user + system time of the finished children, /proc/self/stat fields 16 and 17, in 1/100 s). On a
// shared machine this is the number to compare between two runs: the wall time mostly says how busy the machine was.
let cpu = '';
try { const s = readFileSync('/proc/self/stat', 'utf8'), f = s.slice(s.lastIndexOf(')') + 2).split(' '); cpu = `, cpu ${Math.round((+f[13] + +f[14]) / 100)}s`; } catch { /* not Linux */ }
console.log(`${files.length - bad}/${files.length} graftwork suites passed (${((Date.now() - t0) / 1000).toFixed(1)}s${cpu}, ${JOBS} workers)`);
process.exit(bad ? 1 : 0);
