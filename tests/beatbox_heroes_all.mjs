// Runs every tests/beatbox_heroes_*.test.mjs (npm run test:heroes), one process each, and prints a summary.
//
//   node tests/beatbox_heroes_all.mjs                 run everything
//   node tests/beatbox_heroes_all.mjs r3vig mic       only suites whose file name contains "r3vig" or "mic"
//   node tests/beatbox_heroes_all.mjs --list          print the suite names (and which ones need a browser) and exit
//   node tests/beatbox_heroes_all.mjs --jobs 2        at most 2 suites at a time (default 3)
//   node tests/beatbox_heroes_all.mjs --browser-jobs 1  at most 1 browser suite at a time (default 2: each starts its own Chromium)
//   node tests/beatbox_heroes_all.mjs --no-retry      do not re-run failed suites
//   node tests/beatbox_heroes_all.mjs --verbose       print the full output of every suite, not just failures
//   node tests/beatbox_heroes_all.mjs --bail          stop starting new suites after the first failure
//   node tests/beatbox_heroes_all.mjs --timeout 1500  per-suite timeout in seconds (default 1500)
//   node tests/beatbox_heroes_all.mjs --dir path      look for the suites in another folder (the runner's own test uses this)
//
// WHY A RUNNER. test:heroes used to be one `a && b && c ...` chain of 46 suites: an hour end to end, and the first failure hid everything after it
// (a flaky suite cost a whole run, then the rest had to be run by hand). Now every suite runs even when another fails, a few at a time, and the summary
// names every failure. A suite that fails is re-run once on its own, on a quiet machine (the repo rule: re-run a suite by itself before believing a red run):
// green on the retry counts as passed but is reported as FLAKY so it stays visible and gets fixed instead of hidden; red again is a real failure.
//
// A suite passes when it exits 0 AND its last output line is "<name>: N passed, 0 failed" (a suite that forgot done() is a failure, not silently green).
// Suites that start their own Chromium (r3env, playwright) are limited to --browser-jobs at a time. The two suites that run `node build.js` (they rewrite dist/
// and the build mirror) run alone, after everything else. Exit code 1 if anything failed (after the retry) or nothing matched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const valueFlags = new Set(['jobs', 'browser-jobs', 'timeout', 'dir']);
const filters = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && valueFlags.has(argv[i - 1].slice(2))));

const here = opt('dir', path.dirname(fileURLToPath(import.meta.url)));
const all = fs.readdirSync(here).filter((f) => /^beatbox_heroes_.*\.test\.mjs$/.test(f)).sort();
const suites = filters.length ? all.filter((f) => filters.some((x) => f.includes(x))) : all;
const isBrowser = (f) => /r3env|chromium|playwright/.test(fs.readFileSync(path.join(here, f), 'utf8'));
const isExclusive = (f) => /_(build|sync)\.test\.mjs$/.test(f);
const kind = new Map(suites.map((f) => [f, { browser: isBrowser(f), exclusive: isExclusive(f) }]));
if (flag('list')) { console.log(suites.map((f) => f + (kind.get(f).exclusive ? '  (runs alone: builds)' : kind.get(f).browser ? '  (browser)' : '')).join('\n')); process.exit(0); }
if (!suites.length) { console.log(`beatbox_heroes: no suite matches ${JSON.stringify(filters)} (have ${all.length})`); process.exit(1); }

const cpus = os.cpus().length || 1;
const jobs = Math.max(1, Math.min(+opt('jobs', Math.min(3, cpus)), suites.length));
const browserJobs = Math.max(1, Math.min(+opt('browser-jobs', 2), jobs));
const timeoutMs = 1000 * +opt('timeout', 1500);
const verbose = flag('verbose'), bail = flag('bail'), retry = !flag('no-retry');

function runOne(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(here, name)], { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const lines = out.trim().split('\n');
      const last = lines[lines.length - 1] || '';
      const m = /^(.*): (\d+) passed, (\d+) failed$/.exec(last);
      let ok = code === 0 && !!m && m[3] === '0', why = '';
      if (killed) { ok = false; why = `timed out after ${timeoutMs / 1000}s`; }
      else if (code === 0 && !m) why = 'exit 0 but no "N passed, M failed" summary line (does the suite end with done()?)';
      else if (code !== 0 && !m) why = signal ? `killed by ${signal}` : `exit code ${code} before a summary line (crash or uncaught error)`;
      resolve({ name, ok, why, out, last, seconds: (Date.now() - started) / 1000, pass: m ? +m[2] : 0, fail: m ? +m[3] : 0 });
    });
  });
}

const results = new Map();     // name -> final result
const flaky = [];              // names that failed once and passed on the retry
const failures = [];           // names still failing after the retry
const firstFailures = [];      // results of the first failed attempt
let stop = false;
const t0 = Date.now();

const line = (r, tag) => console.log(`${tag} ${r.name} (${r.seconds.toFixed(1)}s) ${r.last}${r.why ? ' -- ' + r.why : ''}`);
function show(r) { console.log(r.out.trim().split('\n').slice(-40).join('\n') || '(no output)'); }

function report(r) {
  results.set(r.name, r);
  if (verbose && r.ok) console.log(r.out.trim());
  if (!r.ok) { if (!verbose) show(r); firstFailures.push(r); if (bail) stop = true; }
  line(r, r.ok ? 'ok  ' : 'FAIL');
}

// main pass: up to `jobs` at a time, at most `browserJobs` of them browser suites; exclusive suites wait for the end
const pending = suites.filter((f) => !kind.get(f).exclusive), exclusive = suites.filter((f) => kind.get(f).exclusive);
let running = 0, runningBrowser = 0;
await new Promise((done) => {
  const pump = () => {
    while (!stop && running < jobs) {
      const i = pending.findIndex((f) => !kind.get(f).browser || runningBrowser < browserJobs);
      if (i < 0) break;
      const f = pending.splice(i, 1)[0], b = kind.get(f).browser;
      running++; if (b) runningBrowser++;
      runOne(f).then((r) => { running--; if (b) runningBrowser--; report(r); pump(); });
    }
    if (running === 0 && (stop || pending.length === 0)) done();
  };
  pump();
});
for (const f of exclusive) { if (stop) break; report(await runOne(f)); }

// retry every failure once, alone
if (retry && firstFailures.length) {
  console.log(`\nre-running ${firstFailures.length} failed suite${firstFailures.length === 1 ? '' : 's'} on their own (a red run next to other suites proves little) ...`);
  for (const first of firstFailures) {
    const r = await runOne(first.name);
    if (r.ok) { results.set(r.name, r); flaky.push(r.name); line(r, 'FLAKY (passed on the retry)'); }
    else { results.set(r.name, r); failures.push(r.name); if (!verbose) show(r); line(r, 'FAIL (again)'); }
  }
} else for (const f of firstFailures) failures.push(f.name);

const done = [...results.values()];
const assertions = done.reduce((s, r) => s + r.pass + r.fail, 0), notRun = suites.length - done.length;
const green = done.length - failures.length;
const short = (names) => names.map((n) => n.replace(/^beatbox_heroes_/, '').replace(/\.test\.mjs$/, '')).join(', ');
console.log(`\nbeatbox_heroes: ${green}/${suites.length} suites green${flaky.length ? `, ${flaky.length} flaky (${short(flaky)})` : ''}${failures.length ? `, FAILED: ${short(failures)}` : ''}${notRun ? `, ${notRun} not run` : ''}, ${assertions} assertions, ${((Date.now() - t0) / 60000).toFixed(1)} min (${jobs} parallel, ${browserJobs} browser)`);
if (flaky.length) console.log('flaky suites passed on the retry: they are still a defect, fix them (see tests/beatbox_heroes_lib.mjs and r3gamelib.mjs for the wait helpers).');
process.exit(failures.length || notRun ? 1 : 0);
