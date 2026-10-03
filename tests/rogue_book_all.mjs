// Runs every tests/rogue_book_*.test.mjs, one process each (in parallel), and prints a summary.
//
//   node tests/rogue_book_all.mjs                 run everything
//   node tests/rogue_book_all.mjs combat map      only suites whose file name contains "combat" or "map"
//   node tests/rogue_book_all.mjs --list          print the suite names and exit
//   node tests/rogue_book_all.mjs --jobs 1        run one suite at a time (default: min(4, cpus))
//   node tests/rogue_book_all.mjs --verbose       print the full output of every suite, not just failures
//   node tests/rogue_book_all.mjs --bail          stop starting new suites after the first failure
//   node tests/rogue_book_all.mjs --strict        integration gate: sets RB_STRICT=1 (hygiene demands every file and every fixed
//                                                 id, DATA.validate(undefined, {strict:true}) and DATA.audit() must be clean)
//   node tests/rogue_book_all.mjs --timeout 600   per-suite timeout in seconds (default 1200)
//
// A suite passes when it exits 0 AND its last output line is "<name>: N passed, 0 failed" (a suite that forgot
// harness().done() is reported as a failure, not silently green). Exit code 1 if anything failed or nothing matched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (k) => argv.includes('--' + k);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const valueFlags = new Set(['jobs', 'timeout']);
const filters = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && valueFlags.has(argv[i - 1].slice(2))));

const all = fs.readdirSync(here).filter((f) => /^rogue_book_.*\.test\.mjs$/.test(f)).sort();
const suites = filters.length ? all.filter((f) => filters.some((x) => f.includes(x))) : all;
if (flag('list')) { console.log(suites.join('\n')); process.exit(0); }
if (!suites.length) { console.log(`rogue_book: no suite matches ${JSON.stringify(filters)} (have: ${all.join(', ')})`); process.exit(1); }

const jobs = Math.max(1, Math.min(+opt('jobs', Math.min(4, os.cpus().length || 1)), suites.length));
const timeoutMs = 1000 * +opt('timeout', 1200);
const verbose = flag('verbose'), bail = flag('bail');
const env = { ...process.env };
if (flag('strict')) env.RB_STRICT = '1';

const results = [];
let next = 0, failed = 0, stop = false;
const t0 = Date.now();

function runOne(name) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [path.join(here, name)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
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

function report(r) {
  results.push(r);
  if (!r.ok) failed++;
  if (!r.ok || verbose) console.log((verbose || !r.ok ? r.out.trim().split('\n').slice(verbose ? 0 : -40).join('\n') : '') || '(no output)');
  console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name} (${r.seconds.toFixed(1)}s) ${r.last}${r.why ? ' -- ' + r.why : ''}`);
  if (!r.ok && bail) stop = true;
}

async function worker() {
  while (!stop && next < suites.length) report(await runOne(suites[next++]));
}

await Promise.all(Array.from({ length: jobs }, worker));
const assertions = results.reduce((s, r) => s + r.pass + r.fail, 0);
const skipped = suites.length - results.length;
console.log(`rogue_book: ${results.length - failed}/${results.length} suites green, ${assertions} assertions, ${((Date.now() - t0) / 1000).toFixed(1)}s (${jobs} parallel)${skipped ? `, ${skipped} not started after --bail` : ''}${flag('strict') ? ' [strict]' : ''}`);
process.exit(failed || skipped ? 1 : 0);
