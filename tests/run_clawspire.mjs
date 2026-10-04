// Runs the Clawspire suites, two node processes at a time, and prints each
// suite's output in the canonical order (physics data combat map audio render
// art game intro balance i18n net), then a summary table. Exit code is nonzero
// when any suite fails, crashes, or is killed.
//
//   node tests/run_clawspire.mjs                 all 12 suites (npm run test:clawspire)
//   node tests/run_clawspire.mjs --full          CLAWSPIRE_FULL=1: any sampled loop runs its full sweep
//   node tests/run_clawspire.mjs game map        only the named suites
//   node tests/run_clawspire.mjs --jobs 1        one at a time (default and maximum: 2)
//   node tests/run_clawspire.mjs --times         CLAWSPIRE_TEST_TIMES=1: the slowest 15 tests of each suite
//
// The suites are independent files (no shared state, no ports), so they can
// share the machine. Longest first (a greedy two-lane schedule): game runs in
// one lane while the others run back to back in the other. Each child gets a
// 1536 MB old-space cap so a leak fails that suite instead of taking the
// container down. Peak RSS is sampled from /proc (Linux only; blank elsewhere).
// The one-at-a-time chain stays available as `npm run test:clawspire:seq`.
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['physics', 'data', 'combat', 'map', 'audio', 'render', 'art', 'game', 'intro', 'balance', 'i18n', 'net'];
// Rough cost, seconds, only used to start the long ones first.
const COST = { game: 150, map: 45, balance: 35, physics: 25, audio: 6, i18n: 5, net: 4, render: 4, intro: 2, data: 1, combat: 1, art: 1 };
const MAX_JOBS = 2;
// V8 flags for every child. A 64 MB young generation (default 16) cuts the scavenges of the allocation-heavy
// simulations by about 5 percent of their CPU for roughly +150 MB peak RSS. CLAWSPIRE_NODE_FLAGS="" turns it off.
const NODE_FLAGS = (process.env.CLAWSPIRE_NODE_FLAGS != null ? process.env.CLAWSPIRE_NODE_FLAGS : '--max-semi-space-size=64').split(/\s+/).filter(Boolean);

const args = process.argv.slice(2);
let jobs = MAX_JOBS, full = false, times = false;
const picked = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--full') full = true;
  else if (a === '--times') times = true;
  else if (a === '--jobs') jobs = parseInt(args[++i], 10) || 1;
  else if (ORDER.includes(a)) picked.push(a);
  else { console.error(`run_clawspire: unknown argument "${a}" (suites: ${ORDER.join(' ')})`); process.exit(2); }
}
jobs = Math.max(1, Math.min(MAX_JOBS, jobs));
const suites = picked.length ? ORDER.filter(s => picked.includes(s)) : ORDER;
const env = Object.assign({}, process.env);
if (full) env.CLAWSPIRE_FULL = '1';
if (times) env.CLAWSPIRE_TEST_TIMES = '1';

const result = {};   // suite -> { code, signal, out, secs, rssMB }

function rssOf(pid) {
  try {
    const m = /VmHWM:\s+(\d+) kB/.exec(fs.readFileSync(`/proc/${pid}/status`, 'utf8'));
    return m ? Math.round(+m[1] / 1024) : 0;
  } catch (e) { return 0; }
}

function runOne(name) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, ['--max-old-space-size=1536', ...NODE_FLAGS, path.join(here, `clawspire_${name}.test.mjs`)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', peak = 0;
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    const poll = setInterval(() => { peak = Math.max(peak, rssOf(child.pid)); }, 250);
    const finish = (code, signal, extra) => {
      clearInterval(poll);
      result[name] = { code, signal, out: out + (extra || ''), secs: (Date.now() - t0) / 1000, rssMB: peak };
      resolve();
    };
    child.on('error', (e) => finish(1, null, `\nrun_clawspire: could not start ${name}: ${e.message}\n`));
    child.on('close', (code, signal) => finish(code, signal));
  });
}

// Print in canonical order as soon as a suite and all before it have finished.
let nextPrint = 0;
function flush() {
  while (nextPrint < suites.length && result[suites[nextPrint]]) {
    const n = suites[nextPrint++], r = result[n];
    process.stdout.write(r.out.endsWith('\n') || !r.out ? r.out : r.out + '\n');
    if (r.code !== 0) console.log(`run_clawspire: ${n} FAILED (${r.signal ? 'signal ' + r.signal : 'exit ' + r.code})`);
  }
}

const queue = suites.slice().sort((a, b) => (COST[b] || 1) - (COST[a] || 1));
const T0 = Date.now();
async function lane() {
  while (queue.length) { await runOne(queue.shift()); flush(); }
}
await Promise.all(Array.from({ length: Math.min(jobs, queue.length) }, lane));
flush();

const wall = (Date.now() - T0) / 1000;
const sum = suites.reduce((s, n) => s + result[n].secs, 0);
console.log(`\nclawspire suites (${jobs} lane${jobs > 1 ? 's' : ''}${full ? ', CLAWSPIRE_FULL=1' : ''}):`);
for (const n of suites) {
  const r = result[n];
  const m = /clawspire \w+: (\d+) passed, (\d+) failed/.exec(r.out);
  console.log(`  ${n.padEnd(8)} ${r.code === 0 ? 'ok  ' : 'FAIL'} ${m ? `${m[1]} passed, ${m[2]} failed`.padEnd(26) : 'no summary line'.padEnd(26)} ${r.secs.toFixed(1).padStart(6)} s${r.rssMB ? `  peak ${r.rssMB} MB` : ''}`);
}
const bad = suites.filter(n => result[n].code !== 0);
console.log(`  wall ${wall.toFixed(1)} s (suites added up: ${sum.toFixed(1)} s)${bad.length ? `, ${bad.length} FAILED: ${bad.join(' ')}` : ', all green'}`);
process.exit(bad.length ? 1 : 0);
