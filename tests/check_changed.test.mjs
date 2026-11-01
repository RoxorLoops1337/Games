// tools/check-changed.mjs: which suites a change runs. The rule being protected: a change that is not tied to one game must not run EVERY game's tests
// when it can be tied to the suites it can actually affect (a new test script, build.js, the home page), while anything that can affect every game
// (a dependency, an existing script, the lockfile, an unknown root file, an unmapped folder) still runs the full check.
// Each case runs the real tool in a throwaway git repo with a tiny package.json.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0, failed = 0;
const ok = (c, m) => { if (c) passed++; else { failed++; console.error('  FAIL: ' + m); } };

const PKG = {
  name: 'x', version: '1.0.0', dependencies: { esbuild: '^1' },
  scripts: { build: 'node build.js', check: 'node build.js && npm run test:site && npm run test:aaa', 'test:site': 'node tests/site.test.mjs', 'test:aaa': 'node tests/aaa.test.mjs' },
};
const FILES = {
  'build.js': '// build\n', 'index.html': '<html></html>\n', '_headers': '/*\n', 'README.md': '# x\n', 'ic.png': 'png',
  'tests/site.test.mjs': '// site\n', 'tests/aaa.test.mjs': "// reads dist/ after build.js\nconsole.log('dist/');\n",
  'tools/check-changed.mjs': fs.readFileSync(path.join(REPO, 'tools', 'check-changed.mjs'), 'utf8'),
};

function setup() {
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'ccheck_'));
  const run = (...a) => execFileSync('git', a, { cwd: dir, stdio: 'pipe', encoding: 'utf8' });
  run('init', '-q'); run('config', 'user.email', 't@t'); run('config', 'user.name', 't'); run('config', 'commit.gpgsign', 'false');
  for (const [f, t] of Object.entries(FILES)) { fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true }); fs.writeFileSync(path.join(dir, f), t); }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(PKG, null, 2));
  run('add', '-A'); run('commit', '-q', '-m', 'base');
  return dir;
}
const plan = (dir) => { try { return execFileSync(process.execPath, ['tools/check-changed.mjs', '--dry', '--base', 'HEAD'], { cwd: dir, encoding: 'utf8', stdio: 'pipe' }); } catch (e) { return String(e.stdout) + String(e.stderr); } };
const edit = (dir, f, fn) => { const p = path.join(dir, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, fn(fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '')); };
const pkgEdit = (dir, fn) => edit(dir, 'package.json', (t) => { const o = JSON.parse(t); fn(o); return JSON.stringify(o, null, 2); });
const reset = (dir) => { execFileSync('git', ['checkout', '-q', '--', '.'], { cwd: dir }); execFileSync('git', ['clean', '-fdq'], { cwd: dir }); };
const FULL = (o) => /runs the FULL check/.test(o), suitesOf = (o) => { const t = (/-> (.*)$/m.exec(o) || [])[1] || ''; return /^no suites/.test(t) ? [] : t.split(', ').filter(Boolean); };

const dir = setup();
try {
  /* package.json: a new test script runs that suite only */
  pkgEdit(dir, (o) => { o.scripts['test:bbb'] = 'node tests/bbb.test.mjs'; o.scripts.check += ' && npm run test:bbb'; }); edit(dir, 'tests/bbb.test.mjs', () => '// b\n');
  let o = plan(dir); ok(!FULL(o) && suitesOf(o).join() === 'test:bbb', 'a new test script (and its check entry) runs only that suite: ' + o.trim().split('\n').pop()); reset(dir);

  pkgEdit(dir, (o) => { o.scripts['test:aaa'] = 'node tests/aaa.test.mjs && node tests/aaa2.test.mjs'; });
  o = plan(dir); ok(!FULL(o) && suitesOf(o).join() === 'test:aaa', 'a changed test script runs that suite only'); reset(dir);

  pkgEdit(dir, (o) => { o.scripts.check = o.scripts.check.replace(' && npm run test:aaa', ''); });
  o = plan(dir); ok(!FULL(o), 'dropping a suite from check does not run everything'); reset(dir);

  pkgEdit(dir, (o) => { o.scripts['heroes:sync'] = 'node tools/x.mjs'; });
  o = plan(dir); ok(!FULL(o) && suitesOf(o).length === 0, 'a brand new non-test script runs nothing extra'); reset(dir);

  /* package.json: anything that can affect every game is still FULL */
  pkgEdit(dir, (o) => { o.dependencies.esbuild = '^2'; }); o = plan(dir); ok(FULL(o), 'a changed dependency runs the FULL check'); reset(dir);
  pkgEdit(dir, (o) => { o.scripts.build = 'node build.js --x'; }); o = plan(dir); ok(FULL(o), 'a changed existing non-test script runs the FULL check'); reset(dir);
  pkgEdit(dir, (o) => { o.scripts.check = 'node build.js --y && npm run test:site && npm run test:aaa'; }); o = plan(dir); ok(FULL(o), 'a changed check script (beyond its npm run test: list) runs the FULL check'); reset(dir);
  pkgEdit(dir, (o) => { o.engines = { node: '22' }; }); o = plan(dir); ok(FULL(o), 'any other package.json field changing runs the FULL check'); reset(dir);

  /* the other shared files */
  edit(dir, 'build.js', (t) => t + '// changed\n'); o = plan(dir);
  ok(!FULL(o) && suitesOf(o).join() === 'test:aaa', 'build.js runs the suites whose tests mention build.js or dist/ (and nothing else): ' + o.trim().split('\n').pop()); reset(dir);
  edit(dir, 'index.html', (t) => t + '<!-- x -->\n'); o = plan(dir); ok(!FULL(o) && suitesOf(o).join() === 'test:site', 'the home page runs test:site only'); reset(dir);
  edit(dir, '_headers', (t) => t + '/x\n'); o = plan(dir); ok(!FULL(o), '_headers does not run everything'); reset(dir);
  edit(dir, 'README.md', (t) => t + 'x\n'); o = plan(dir); ok(!FULL(o) && suitesOf(o).length === 0, 'a root note runs nothing'); reset(dir);
  edit(dir, 'tools/check-changed.mjs', (t) => t + '// x\n'); o = plan(dir); ok(!FULL(o), 'the tool itself does not run everything'); reset(dir);

  /* unknown still means everything */
  edit(dir, 'ic.png', () => 'other'); o = plan(dir); ok(FULL(o) && /ic\.png/.test(o), 'an unknown root file still runs the FULL check, and says which file'); reset(dir);
  edit(dir, 'newgame/index.html', () => 'x'); o = plan(dir); ok(FULL(o) && /newgame/.test(o), 'an unmapped folder still runs the FULL check'); reset(dir);
  edit(dir, 'package-lock.json', () => '{}'); o = plan(dir); ok(FULL(o), 'the lockfile still runs the FULL check'); reset(dir);

  /* the combination that used to cost a full run: a new test + its script */
  pkgEdit(dir, (o) => { o.scripts['test:bbb'] = 'node tests/bbb.test.mjs'; o.scripts.check += ' && npm run test:bbb'; }); edit(dir, 'tests/bbb.test.mjs', () => '// b\n'); edit(dir, 'tests/aaa.test.mjs', (t) => t + '// edit\n');
  o = plan(dir); ok(!FULL(o) && suitesOf(o).join(', ') === 'test:aaa, test:bbb', 'a game change plus its new test script runs exactly those two suites: ' + o.trim().split('\n').pop());
} finally { fs.rmSync(dir, { recursive: true, force: true }); }

console.log(`check_changed: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
