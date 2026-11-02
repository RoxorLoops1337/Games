// tests/beatbox_heroes_all.mjs (npm run test:heroes): the runner that replaced the 46-suite `&&` chain.
// It runs the real runner on a throwaway folder of tiny fake suites and checks the promises that matter:
//   a failure never hides the suites after it, a failed suite is retried once on its own, a green retry is reported as FLAKY (never silently green),
//   a crash / a missing summary line / a timeout are failures, browser and build suites are recognised, the exit code and the summary line are right.
import { ok, eq, done } from './beatbox_heroes_lib.mjs';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RUNNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'beatbox_heroes_all.mjs');
const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'heroes_runner_'));
const FLAKY_MARK = path.join(tmp, 'flaky.mark');
const suite = (name, body) => fs.writeFileSync(path.join(tmp, `beatbox_heroes_${name}.test.mjs`), body);
const summary = (name, p, f) => `console.log('beatbox_heroes_${name}: ${p} passed, ${f} failed');`;
const run = (...args) => { const r = spawnSync(process.execPath, [RUNNER, '--dir', tmp, ...args], { encoding: 'utf8', env: { ...process.env, FLAKY_MARK } }); return { code: r.status, out: r.stdout + r.stderr }; };
const lastLine = (o) => o.trim().split('\n').pop();

try {
  suite('a_pass', summary('a_pass', 3, 0));
  suite('b_fail', `console.log('  FAIL: something broke'); ${summary('b_fail', 1, 1)} process.exit(1);`);
  suite('c_flaky', `import fs from 'node:fs'; const m = process.env.FLAKY_MARK; if (!fs.existsSync(m)) { fs.writeFileSync(m, '1'); console.log('  FAIL: only the first time'); ${summary('c_flaky', 1, 1)} process.exit(1); } ${summary('c_flaky', 2, 0)}`);
  suite('d_crash', `throw new Error('boom');`);
  suite('e_nosummary', `console.log('hello');`);
  suite('f_browser', `// uses r3env\n${summary('f_browser', 4, 0)}`);
  suite('g_build', summary('g_build', 5, 0));
  suite('z_last', summary('z_last', 6, 0));          // sorts after the failures: it must still run

  /* ---------------------------------------------------------------- the default run */
  let r = run('--jobs', '1');
  ok(r.code === 1, 'a run with failures exits 1');
  ok(/ok   beatbox_heroes_z_last/.test(r.out), 'a failing suite does not stop the ones after it (z_last ran)');
  ok(/ok   beatbox_heroes_a_pass/.test(r.out) && /ok   beatbox_heroes_f_browser/.test(r.out) && /ok   beatbox_heroes_g_build/.test(r.out), 'passing suites are reported ok');
  ok(/FAIL beatbox_heroes_b_fail/.test(r.out) && /something broke/.test(r.out), 'a failing suite is reported with its output');
  ok(/re-running 4 failed suites on their own/.test(r.out), 'the four failed suites (fail, flaky, crash, no summary) are retried');
  ok(/FLAKY \(passed on the retry\) beatbox_heroes_c_flaky/.test(r.out), 'a suite that passes on the retry is reported as FLAKY');
  ok(/FAIL \(again\) beatbox_heroes_b_fail/.test(r.out) && /FAIL \(again\) beatbox_heroes_d_crash/.test(r.out) && /FAIL \(again\) beatbox_heroes_e_nosummary/.test(r.out), 'a suite that fails again is a real failure');
  ok(/exit code 1 before a summary line/.test(r.out), 'a crash is explained');
  ok(/no "N passed, M failed" summary line/.test(r.out), 'a suite without a summary line is not silently green');
  const sum = lastLine(r.out.split('flaky suites passed')[0]);
  ok(/^beatbox_heroes: 5\/8 suites green, 1 flaky \(c_flaky\), FAILED: b_fail, d_crash, e_nosummary, /.test(sum), 'the summary line names the flaky suite and every failure: ' + sum);
  ok(/flaky suites passed on the retry: they are still a defect/.test(r.out), 'flaky suites carry a reminder that they must be fixed');

  /* ---------------------------------------------------------------- the exclusive (build) suite runs after the rest */
  const order = [...r.out.matchAll(/^(?:ok  |FAIL) (beatbox_heroes_\w+)/gm)].map((m) => m[1]);
  ok(order.indexOf('beatbox_heroes_g_build') > order.indexOf('beatbox_heroes_z_last'), 'a build suite runs alone, after the others');

  /* ---------------------------------------------------------------- --no-retry, --list, filters, timeouts */
  fs.rmSync(FLAKY_MARK, { force: true });
  r = run('--jobs', '1', '--no-retry');
  ok(!/re-running/.test(r.out) && /FAILED: .*c_flaky/.test(lastLine(r.out)), '--no-retry: no second chance, the flaky suite counts as failed');
  r = run('--list');
  ok(r.code === 0 && /f_browser\.test\.mjs  \(browser\)/.test(r.out) && /g_build\.test\.mjs  \(runs alone: builds\)/.test(r.out) && /a_pass\.test\.mjs\n/.test(r.out), '--list tells browser and build suites apart');
  r = run('nothing_like_this'); ok(r.code === 1 && /no suite matches/.test(r.out), 'a filter that matches nothing is an error, not a green run');
  r = run('a_pass', 'z_last'); ok(r.code === 0 && /beatbox_heroes: 2\/2 suites green, \d+ assertions/.test(lastLine(r.out)), 'filters pick suites by name, all green exits 0: ' + lastLine(r.out));
  suite('h_slow', `setTimeout(() => {}, 60000);`);
  r = run('h_slow', '--timeout', '1', '--no-retry'); ok(r.code === 1 && /timed out after 1s/.test(r.out), 'a suite that hangs is killed and reported');
  fs.rmSync(path.join(tmp, 'beatbox_heroes_h_slow.test.mjs'));

  /* ---------------------------------------------------------------- parallel: more suites than jobs all run, results identical */
  fs.rmSync(FLAKY_MARK, { force: true });
  r = run('--jobs', '3'); ok(r.code === 1 && /5\/8 suites green, 1 flaky/.test(r.out.split('flaky suites passed')[0].trim().split('\n').pop()), 'running three at a time gives the same verdict');
  eq(fs.readdirSync(tmp).filter((f) => /\.test\.mjs$/.test(f)).length, 8, 'the fake suites are untouched');

  /* ---------------------------------------------------------------- browser suites one at a time by default, light suites alongside */
  const tmp2 = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'heroes_runner2_')), TRACE = path.join(tmp2, 'trace.txt');
  try {
    const timed = (name, browser) => fs.writeFileSync(path.join(tmp2, `beatbox_heroes_${name}.test.mjs`), `${browser ? '// uses r3env\n' : ''}import fs from 'node:fs'; const t0 = Date.now(); await new Promise((r) => setTimeout(r, 1500)); fs.appendFileSync(process.env.TRACE, '${name} ' + t0 + ' ' + Date.now() + '\\n'); console.log('beatbox_heroes_${name}: 1 passed, 0 failed');`);
    timed('p_browser_a', true); timed('q_browser_b', true); timed('r_plain', false);
    const spans = () => Object.fromEntries(fs.readFileSync(TRACE, 'utf8').trim().split('\n').map((l) => { const [n, a, b] = l.split(' '); return [n, [+a, +b]]; }));
    const overlap = (x, y) => x[0] < y[1] && y[0] < x[1];
    const go = (...a) => { fs.rmSync(TRACE, { force: true }); const r = spawnSync(process.execPath, [RUNNER, '--dir', tmp2, ...a], { encoding: 'utf8', env: { ...process.env, TRACE } }); return { code: r.status, out: r.stdout, sp: spans() }; };
    let g = go('--jobs', '3');
    ok(g.code === 0 && !overlap(g.sp.p_browser_a, g.sp.q_browser_b), 'by default two browser suites never run at the same time');
    ok(overlap(g.sp.p_browser_a, g.sp.r_plain) || overlap(g.sp.q_browser_b, g.sp.r_plain), 'a light suite runs alongside a browser suite');
    g = go('--jobs', '3', '--browser-jobs', '2');
    ok(g.code === 0 && overlap(g.sp.p_browser_a, g.sp.q_browser_b), '--browser-jobs 2 lets two browser suites overlap');
  } finally { fs.rmSync(tmp2, { recursive: true, force: true }); }
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
done();
