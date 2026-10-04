// Suite for the test infrastructure itself (tests/rogue_book_lib.mjs): every promise its header
// makes, checked against throwaway fixture games written to the OS temp folder. If this suite is
// green the other 24 people's suites are standing on something solid.
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  boot, harness, resolveScripts, scriptFiles, htmlAssets, BootError, tokenizeJs, stripJs, analyzeTopLevel, validCssColor,
} from './rogue_book_lib.mjs';

const t = harness('rogue_book lib');
const tmpRoot = fs.mkdtempSync(path.join(process.env.RB_TMP || os.tmpdir(), 'rb-lib-'));
process.on('exit', () => { try { fs.rmSync(tmpRoot, { recursive: true, force: true }); } catch (e) { /* best effort */ } });
let fxN = 0;
/* Write a fixture game: files {name: source} become js/<name>.js listed in that order. */
function fixture(files, { html, extraHead = '', body } = {}) {
  const dir = path.join(tmpRoot, 'fx' + (++fxN));
  fs.mkdirSync(path.join(dir, 'js'), { recursive: true });
  for (const [n, src] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'js', n + '.js'), src);
  const scripts = Object.keys(files).map((n) => `<script src="js/${n}.js"></script>`).join('\n');
  fs.writeFileSync(path.join(dir, 'index.html'), html || `<!doctype html><html><head><title>fx</title>${extraHead}</head><body>${body || '<div id="boot"></div><div id="stage"><canvas id="view" width="640" height="360"></canvas><div id="screens"></div></div>'}\n${scripts}</body></html>`);
  return dir;
}
const capture = (fn) => { const orig = process.stderr.write; let out = ''; process.stderr.write = (s) => { out += s; return true; }; try { fn(); } finally { process.stderr.write = orig; } return out; };
const HYGIENE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'rogue_book_hygiene.test.mjs');
const realJs = (n) => fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'rogue_book', 'js', n), 'utf8');
const UTIL = 'const U = { tag: "u" };';
const DATA = 'const DATA = { tag: "d", LISTS: {} };';

// ---------------------------------------------------------------- harness
t.test('harness assertions count and report', () => {
  const h = harness('inner');
  const log = console.log; let out = ''; console.log = (...a) => { out += a.join(' ') + '\n'; };
  try {
    h.ok(true, 'a'); h.ok(false, 'bad ok'); h.eq(1, 2, 'bad eq'); h.deep({ a: 1 }, { a: 1 }, 'deep'); h.near(1, 1.05, 0.1, 'near'); h.throws(() => { throw new Error('x'); }, 'throws');
    h.throws(() => {}, 'no throw'); h.has({ a: 1 }, 'a', 'has'); h.has({ a: 1 }, 'b', 'missing key');
  } finally { console.log = log; }
  t.deep(h.counts, { pass: 5, fail: 4 }, 'pass and fail counts');
  t.ok(/FAIL: bad ok/.test(out) && /FAIL: bad eq \[1 != 2\]/.test(out) && /missing key/.test(out), 'failures are printed with detail');
});
await t.test('harness async tests queue behind each other', async () => {
  const h = harness('inner2');
  const log = console.log; console.log = () => {};
  const order = [];
  try {
    const a = h.test('slow', async () => { await new Promise((r) => setTimeout(r, 15)); order.push('slow'); });
    const b = h.test('fast', () => { order.push('fast'); });
    const c = h.test('boom', async () => { throw new Error('boom'); });
    await Promise.all([a, b, c]);
  } finally { console.log = log; }
  t.deep(order, ['slow', 'fast'], 'a sync test after an async one waits for it');
  t.eq(h.counts.fail, 1, 'a rejected async test counts as a failure');
  let rejected = false; const log2 = console.log; console.log = () => {};
  try { await h.rejects(Promise.resolve(1), 'no reject'); } catch (e) { rejected = true; } finally { console.log = log2; }
  t.ok(!rejected && h.counts.fail === 2, 'rejects() reports instead of throwing');
});

// ---------------------------------------------------------------- script resolution
t.test('scriptFiles and htmlAssets read index.html', () => {
  const a = htmlAssets('<!-- <script src="js/no.js"></script> --><link rel="stylesheet" href="css/a.css"><link rel="icon" href="x.png"><script src="js/a.js"></script><script>var inline = 1;</script><script src=\'js/b.js\' defer></script><style>a{}</style>');
  t.deep(a.scripts, ['js/a.js', 'js/b.js'], 'commented and inline scripts are ignored');
  t.deep(a.styles, ['css/a.css'], 'only stylesheets');
  t.eq(a.inline.length, 1, 'one inline script'); t.eq(a.inlineStyles.length, 1, 'one style block');
  t.deep(scriptFiles(fixture({ util: UTIL, data: DATA })), ['js/util.js', 'js/data.js'], 'fixture order');
  t.ok(scriptFiles().includes('js/util.js'), 'the real index.html lists util.js');
});
t.test('resolveScripts pulls dependencies in load order and rejects typos', () => {
  const names = ['util', 'data', 'data_text', 'data_cards_a', 'data_enemies_1', 'art', 'art_heroes', 'art_fx', 'audio', 'combat', 'map', 'run', 'meta', 'ui', 'scene', 'screen_menu', 'tutorial', 'main'];
  const dir = fixture(Object.fromEntries(names.map((n) => [n, '/* ' + n + ' */'])));
  const R = (only, skip) => resolveScripts({ only, skip, dir }).files.map((f) => f.replace(/^js\/|\.js$/g, ''));
  t.deep(R(['util']), ['util', 'data'], 'util and data are always there');
  t.deep(R(['data']), ['util', 'data'], 'data pulls util');
  t.deep(R(['art_heroes']), ['util', 'data', 'art', 'art_heroes'], 'art files pull art, data and util');
  t.deep(R(['art*']), ['util', 'data', 'art', 'art_heroes', 'art_fx'], 'globs work and pull the base');
  t.deep(R(['data*']), ['util', 'data', 'data_text', 'data_cards_a', 'data_enemies_1'], 'data* is util plus data plus every data file');
  t.deep(R(['combat']), ['util', 'data', 'data_text', 'data_cards_a', 'data_enemies_1', 'combat'], 'logic pulls all data files');
  t.deep(R(['meta']).slice(-4), ['combat', 'map', 'run', 'meta'], 'meta pulls run, combat and map');
  t.ok(R(['screen*']).includes('ui') && R(['screen*']).includes('scene') && R(['screen*']).includes('art_fx'), 'screens pull ui, scene and art');
  t.eq(R(['main']).length, names.length, 'main pulls everything');
  t.deep(R(['combat'], ['data_enemies_1']).includes('data_enemies_1'), false, 'skip removes a pulled-in file');
  t.deep(R(['js/util.js', 'util.js']), ['util', 'data'], 'js/ prefix and .js suffix are accepted');
  t.deep(resolveScripts({ only: 'art_heroes', dir }).files, ['js/util.js', 'js/data.js', 'js/art.js', 'js/art_heroes.js'], 'a single string works for only');
  t.throws(() => R(['comabt']), 'unknown name throws', /no script matches "comabt"/);
  t.throws(() => R(['artt*']), 'a glob that matches nothing throws', /no script matches/);
  const missing = fixture({ util: UTIL }, { html: '<script src="js/util.js"></script><script src="js/gone.js"></script>' });
  t.throws(() => resolveScripts({ only: ['gone'], dir: missing }), 'listed but missing throws', /does not exist yet/);
  t.deep(resolveScripts({ only: ['g*'], dir: missing }).missing, ['js/gone.js'], 'a glob tolerates files that are not written yet');
});

// ---------------------------------------------------------------- boot: isolation of broken files
t.test('boot evaluates scripts one by one in a shared scope', () => {
  const dir = fixture({ util: UTIL, data: 'const DATA = { u: U.tag };', extra: '(function () { DATA.extra = U.tag + DATA.u; })();' });
  const g = boot({ dir });
  t.eq(g.DATA.extra, 'uu', 'later scripts see earlier top-level const');
  t.deep(g._loaded, ['js/util.js', 'js/data.js', 'js/extra.js'], 'loaded list in order');
  t.eq(g._errors.length, 0, 'no errors');
});
t.test('a syntax error names the file and line; continue keeps the rest', () => {
  const dir = fixture({ util: UTIL, data: DATA, broken: 'const A = 1;\nconst = ;\n', fine: '(function () { DATA.fine = true; })();' });
  let err = null;
  try { boot({ dir }); } catch (e) { err = e; }
  t.ok(err instanceof BootError, 'BootError thrown');
  t.eq(err && err.file, 'js/broken.js', 'names the failing file');
  t.ok(err && /js\/broken\.js:2 \(syntax\)/.test(err.message), 'message has file:line and kind: ' + (err && err.message.split('\n')[1]));
  t.eq(err.errors.length, 1, 'only the broken file is reported');
  const g = boot({ dir, continue: true });
  t.eq(g._errors[0].file, 'js/broken.js', 'continue records the error');
  t.eq(g.DATA.fine, true, 'files after the broken one still ran');
});
t.test('a top-level throw is attributed with its line', () => {
  const dir = fixture({ util: UTIL, data: DATA, boom: '"x";\n(function () {\n  throw new Error("kaboom");\n})();' });
  let err = null; try { boot({ dir }); } catch (e) { err = e; }
  t.ok(err && err.errors[0].kind === 'runtime' && err.errors[0].line === 3 && /kaboom/.test(err.message), 'runtime error with line 3: ' + (err && JSON.stringify(err.errors[0].line)));
});
t.test('a broken file that was only a dependency never fails the boot', () => {
  const dir = fixture({ util: UTIL, data: DATA, data_enemies_2: 'const = 1;', combat: '(function () { DATA.combatLoaded = Object.keys(DATA).length > 0; })();' });
  let g = null;
  const out = capture(() => { g = boot({ dir, only: ['combat'] }); });
  t.eq(g.DATA.combatLoaded, true, 'combat still loaded');
  t.eq(g._errors.length, 0, '_errors only lists files the suite asked for');
  t.ok(g._warnings.length === 1 && g._warnings[0].implicit === true && g._warnings[0].file === 'js/data_enemies_2.js', 'the dependency error is recorded in _warnings');
  t.ok(/skipped js\/data_enemies_2\.js/.test(out), 'and reported once on stderr');
  let err = null; try { boot({ dir, only: ['data_enemies_2'] }); } catch (e) { err = e; }
  t.ok(err instanceof BootError, 'asking for the broken file by its exact name does throw');
  const soft = boot({ dir, only: ['data*'] });
  t.ok(soft._errors.length === 0 && soft._warnings.length === 1 && soft._warnings[0].file === 'js/data_enemies_2.js', 'a glob is soft: data* tolerates a broken sibling and lists it in _warnings');
  const s = boot({ dir, only: ['combat'], skip: ['data_enemies_2'] });
  t.eq(s._warnings.length, 0, 'skip leaves it out entirely');
});
t.test('a broken util.js or data.js always fails the boot, whatever the suite asked for', () => {
  const dir = fixture({ util: 'const = 1;', data: DATA, combat: '(function () {})();' });
  let err = null; try { boot({ dir, only: ['combat'] }); } catch (e) { err = e; }
  t.ok(err instanceof BootError && err.file === 'js/util.js', 'names js/util.js: ' + (err && err.message.split('\n')[1]));
});
t.test('strict mode catches accidental globals; strict:false allows them', () => {
  const dir = fixture({ util: UTIL, oops: '(function () { leaked = 5; })();' });
  let err = null; try { boot({ dir }); } catch (e) { err = e; }
  t.ok(err && /leaked is not defined/.test(err.message), 'implicit global throws under strict');
  t.eq(boot({ dir, strict: false })._win.leaked, 5, 'sloppy mode creates the global');
});
t.test('a runaway top-level loop is stopped by loadTimeout', () => {
  const dir = fixture({ util: UTIL, spin: 'for (;;) {}' });
  let err = null; try { boot({ dir, loadTimeout: 100 }); } catch (e) { err = e; }
  t.ok(err && /timed out/i.test(err.message), 'timeout reported: ' + (err && err.message.split('\n')[1]));
});

// ---------------------------------------------------------------- sandbox guards
t.test('the sandbox bans Math.random, eval, network and dialogs; Date is virtual', () => {
  const g = boot({ dir: fixture({ util: UTIL }), epoch: Date.UTC(2030, 5, 15, 12) });
  const err = (code) => { try { g._run(code); } catch (e) { return String(e.message); } return ''; };
  t.ok(/Math\.random is banned/.test(err('Math.random()')), 'Math.random');
  t.ok(/Code generation from strings/.test(err('eval("1")')) && /Code generation/.test(err('new Function("return 1")')), 'eval and Function');
  t.ok(/banned/.test(err('fetch("x")')) && /banned/.test(err('new XMLHttpRequest()')) && /banned/.test(err('new WebSocket("ws://x")')), 'network');
  t.ok(/banned/.test(err('alert(1)')) && /banned/.test(err('confirm(1)')) && /banned/.test(err('prompt(1)')), 'dialogs');
  t.eq(g._run('Date.now()'), Date.UTC(2030, 5, 15, 12), 'Date.now starts at the epoch');
  g._advance(1000);
  t.eq(g._run('new Date().getTime()'), Date.UTC(2030, 5, 15, 12) + 1000, 'new Date() follows the virtual clock');
  t.eq(g._run('new Date(2020, 0, 2).getDate()'), 2, 'dated constructors still work');
  t.eq(g._run('performance.now()'), 1000, 'performance.now is the virtual clock');
  t.eq(g._run('typeof Date()'), 'string', 'Date() as a function still returns a string');
  t.eq(g._run('window === globalThis && self === window && window.document === document'), true, 'window is the global');
  const g2 = boot({ dir: fixture({ util: UTIL }), allowRandom: true });
  t.eq(typeof g2._run('Math.random()'), 'number', 'allowRandom lifts the ban');
});
t.test('top-level DOM, storage and audio access is rejected while loading', () => {
  const tryFile = (src) => { let err = null; try { boot({ dir: fixture({ util: UTIL, bad: src }) }); } catch (e) { err = e; } return err ? err.message : ''; };
  t.ok(/top-level document\.getElementById\(\) while loading js\/bad\.js/.test(tryFile('document.getElementById("x");')), 'getElementById');
  t.ok(/top-level document\.createElement\(\)/.test(tryFile('document.createElement("div");')), 'createElement');
  t.ok(/top-level document\.body/.test(tryFile('document.body;')), 'document.body');
  t.ok(/top-level localStorage\.getItem\(\)/.test(tryFile('localStorage.getItem("a");')), 'localStorage');
  t.ok(/top-level AudioContext construction/.test(tryFile('new AudioContext();')), 'AudioContext');
  t.ok(/top-level matchMedia\(\)/.test(tryFile('matchMedia("(a)");')), 'matchMedia');
  t.eq(tryFile('window.addEventListener("x", function () {}); typeof document;'), '', 'listeners and typeof checks are fine');
  t.eq(tryFile('function later() { return document.body; }'), '', 'lazy access is fine');
  const g = boot({ dir: fixture({ util: UTIL, ok: 'globalThis.late = function () { return document.getElementById("stage") !== null; };' }) });
  t.eq(g._win.late(), true, 'the same call works once loading is over');
  t.eq(boot({ dir: fixture({ util: UTIL, bad: 'document.createElement("div");' }), allowTopLevelDom: true })._errors.length, 0, 'allowTopLevelDom lifts the guard');
});
t.test('window flags, location and seed options', () => {
  const dir = fixture({ util: UTIL });
  let g = boot({ dir });
  t.eq(g._win.__HEADLESS, true, '__HEADLESS by default'); t.eq(g._win.__NO_AUTOBOOT, true, '__NO_AUTOBOOT by default'); t.deep([g._win.__errors, g._win.__missing], [[], []], 'window.__errors and __missing exist like the watchdog makes them');
  g = boot({ dir, realtime: true, autoboot: true, search: '?goto=combat&enemies=kappa', seed: 42, hash: 'x' });
  t.eq(g._win.__HEADLESS, false, 'realtime clears __HEADLESS'); t.eq(g._win.__NO_AUTOBOOT, false, 'autoboot clears __NO_AUTOBOOT');
  t.eq(g._run('new URLSearchParams(window.location.search).get("enemies")'), 'kappa', 'search is readable through URLSearchParams');
  t.eq(g._run('new URLSearchParams(window.location.search).get("seed")'), '42', 'seed is appended like ?seed=N');
  t.eq(g._seed, 42, 'api._seed'); t.eq(g._run('location.hash'), '#x', 'hash');
  g = boot({ dir, search: { a: 1, b: 'x y' } });
  t.eq(g._run('location.search'), '?a=1&b=x+y', 'search accepts an object');
  g._run('location.reload()'); t.eq(g._reloads, 1, 'reload is counted');
  g._run('history.replaceState(null, "", "?z=9#h")'); t.eq(g._run('location.search + location.hash'), '?z=9#h', 'replaceState updates location');
});

// ---------------------------------------------------------------- DOM
t.test('the document mirrors index.html and elements behave', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc;
  for (const id of ['boot', 'wrap', 'stage', 'view', 'screens', 'overlays', 'over', 'tips', 'toasts']) t.ok(d.getElementById(id), '#' + id + ' exists (index.html declares it)');
  t.ok(d.getElementById('nope') === null, 'unknown id is null, not a throwaway element');
  t.eq(d.getElementById('view').width, 1280, 'canvas size comes from the attribute');
  t.ok(d.getElementById('view') instanceof g._win.HTMLCanvasElement, 'instanceof HTMLCanvasElement');
  t.ok(d.getElementById('stage') instanceof g._win.HTMLElement && d.getElementById('stage') instanceof g._win.Node, 'instanceof HTMLElement and Node');
  t.eq(d.title, 'ECHOWAKE: a rogue ballad', 'document.title');
  t.eq(d.getElementById('stage').parentNode.id, 'wrap', 'tree structure');
});
t.test('selectors: compound, descendant, child, sibling, attribute, pseudo', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc;
  d.body.innerHTML = '<div id="a" class="box big" data-k="1"><span class="x">1</span><span class="x y" title="Hello World">2</span><p>3</p><span class="z">4</span></div><div id="b" class="box"><span class="x">5</span></div><ul><li>a</li><li class="on">b</li><li>c</li></ul><input type="checkbox" checked><button disabled>d</button>';
  const q = (s) => d.querySelectorAll(s).map((e) => e.id || e.textContent || e.tagName).join(',');
  const cases = [
    ['div.box', 'a,b'], ['div#a.big', 'a'], ['.box .x', '1,2,5'], ['.box > span', '1,2,4,5'], ['#a > .x.y', '2'], ['span + p', '3'], ['p ~ span', '4'], ['span ~ span', '2,4'],
    ['[data-k]', 'a'], ['[data-k="1"]', 'a'], ['[title^="Hello"]', '2'], ['[title$="World"]', '2'], ['[title*="lo Wo"]', '2'], ['[title~="World"]', '2'], ['[TITLE="hello world" i]', '2'],
    ['span:not(.y):not(.z)', '1,5'], ['span:not(.y, .z)', '1,5'], ['#a span:first-child', '1'], ['#a > :last-child', '4'], ['li:nth-child(2)', 'b'], ['li:nth-child(odd)', 'a,c'], ['li:nth-child(2n+1)', 'a,c'],
    ['li:nth-last-child(1)', 'c'], ['span:first-of-type', '1,5'], ['p:only-of-type', '3'], ['li.on', 'b'], ['li:is(.on, :first-child)', 'a,b'], ['div:has(> p)', 'a'],
    ['input:checked', 'INPUT'], ['button:disabled', 'd'], ['input:enabled', 'INPUT'], ['*.x', '1,2,5'], ['#a, #b', 'a,b'], ['ul > li:not(.on):last-child', 'c'],
  ];
  for (const [sel, want] of cases) t.eq(q(sel), want, `selector ${sel}`);
  t.eq(d.querySelectorAll('div, ul').length, 3, 'comma lists');
  t.eq(d.querySelector('.x').closest('.box').id, 'a', 'closest'); t.ok(d.querySelector('.x').matches('div > .x'), 'matches');
  t.eq(d.getElementById('a').querySelectorAll(':scope > span').length, 3, ':scope');
  t.ok(d.querySelector('li:nth-child(3)').previousElementSibling.classList.contains('on'), 'previousElementSibling');
  t.eq(d.querySelectorAll('::before').length, 0, 'pseudo elements never match');
  for (const bad of ['', 'div >', '[', ':bogus', '..a', 'a b >']) t.throws(() => d.querySelector(bad), `invalid selector "${bad}" throws`);
});
t.test('textContent and innerHTML aggregate, parse and serialise', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc, U = g.U;
  const e = U.el('div', null, U.el('span', null, 'A'), 'B', 3);
  t.eq(e.textContent, 'AB3', 'parent textContent aggregates children');
  e.append('tail', d.createElement('i')); t.eq(e.textContent, 'AB3tail', 'append(string) keeps its text');
  e.innerHTML = '<p class="x">Hi <b>there</b> &amp; &lt;you&gt; &#65; &quot;q&quot;</p><br><img src="a.png" alt=x><input value="7" disabled>';
  t.eq(e.querySelector('p').textContent, 'Hi there & <you> A "q"', 'entities decode');
  t.eq(e.children.length, 4, 'children counts elements only'); t.ok(e.childNodes.length >= 4, 'childNodes counts nodes');
  t.eq(e.querySelector('input').value, '7', 'value from attribute'); t.eq(e.querySelector('input').disabled, true, 'boolean attribute'); t.eq(e.querySelector('img').alt, 'x', 'unquoted attribute');
  t.eq(e.innerHTML, '<p class="x">Hi <b>there</b> &amp; &lt;you&gt; A "q"</p><br><img src="a.png" alt="x"><input value="7" disabled="">', 'serialises back');
  e.innerHTML = ''; t.eq(e.childNodes.length, 0, 'innerHTML = "" clears children'); t.eq(e.textContent, '', 'and text');
  e.textContent = 'plain <b>'; t.eq(e.innerHTML, 'plain &lt;b&gt;', 'textContent is escaped in innerHTML');
  e.innerHTML = '<svg viewBox="0 0 1 1"><path d="M0 0"/></svg>'; t.eq(e.firstChild.namespaceURI, 'http://www.w3.org/2000/svg', 'svg namespace');
  e.innerHTML = '<ul><li>a<li>b</ul>'; t.ok(e.querySelector('ul') !== null, 'tolerates sloppy markup');
  e.insertAdjacentHTML('beforeend', '<em>z</em>'); t.eq(e.lastChild.tagName, 'EM', 'insertAdjacentHTML');
  const tpl = d.createElement('template'); tpl.innerHTML = '<b>t</b>'; t.eq(tpl.content.firstChild.tagName, 'B', 'template content');
  const frag = d.createDocumentFragment(); frag.append(d.createElement('a'), d.createElement('b')); const host = d.createElement('div'); host.appendChild(frag);
  t.eq(host.children.length, 2, 'fragments move their children'); t.eq(frag.childNodes.length, 0, 'and empty');
});
t.test('cloneNode, dataset, style, classList, attributes', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc;
  const e = d.createElement('div');
  e.className = 'a  b'; t.eq(e.classList.length, 2, 'class tokens split');
  e.classList.add('c', 'a'); e.classList.remove('b'); t.eq(e.className, 'a c', 'add and remove'); t.eq(e.classList.toggle('c'), false, 'toggle off'); t.eq(e.classList.toggle('d', true), true, 'toggle force');
  t.ok(e.classList.replace('a', 'z') && e.classList.contains('z'), 'replace'); t.eq([...e.classList].join(), 'z,d', 'iterates'); t.eq(e.getAttribute('class'), 'z d', 'reflects the class attribute');
  t.throws(() => e.classList.add(''), 'empty token throws', /must not be empty/); t.throws(() => e.classList.add('a b'), 'space token throws', /contains HTML space/);
  e.dataset.fooBar = 'x'; e.dataset.n = 3; t.eq(e.getAttribute('data-foo-bar'), 'x', 'dataset writes attributes'); t.eq(e.dataset.n, '3', 'and stringifies'); t.eq(Object.keys(e.dataset).join(), 'fooBar,n', 'and enumerates');
  delete e.dataset.n; t.eq(e.hasAttribute('data-n'), false, 'delete removes the attribute'); t.ok('fooBar' in e.dataset, 'in operator');
  e.style.left = '4px'; e.style.backgroundColor = 'red'; e.style.setProperty('--ts', '1.2');
  t.eq(e.style.cssText, 'left: 4px; background-color: red; --ts: 1.2;', 'cssText serialises'); t.eq(e.style.getPropertyValue('--ts'), '1.2', 'custom properties'); t.eq(e.getAttribute('style'), e.style.cssText, 'style attribute');
  e.setAttribute('style', 'top: 1px; color: blue'); t.eq(e.style.top, '1px', 'setAttribute style parses'); t.eq(e.style.left, '', 'and replaces'); Object.assign(e.style, { width: '9px' }); t.eq(e.style.width, '9px', 'Object.assign onto style');
  e.style.top = ''; t.eq(e.style.top, '', 'empty string removes');
  e.appendChild(d.createElement('span')); e.firstChild.textContent = 'kid';
  const c = e.cloneNode(true);
  t.ok(c !== e && c.className === e.className && c.style.width === '9px' && c.dataset.fooBar === 'x' && c.textContent === 'kid' && c.parentNode === null, 'deep clone copies attributes, style, dataset and children');
  let hit = 0; e.addEventListener('x', () => hit++); c.dispatchEvent(new g._win.Event('x')); t.eq(hit, 0, 'clones do not inherit listeners');
  t.eq(e.cloneNode(false).childNodes.length, 0, 'shallow clone has no children');
  t.eq(d.createElement('DIV').tagName, 'DIV', 'tagName upper case'); t.throws(() => d.createElement('a b'), 'bad tag name throws');
  t.throws(() => e.appendChild(null), 'appendChild(null) throws'); t.throws(() => e.removeChild(d.createElement('p')), 'removeChild of a stranger throws', /not a child/);
  const p = d.createElement('p'); e.appendChild(p); t.throws(() => p.appendChild(e), 'cycles throw', /contains the parent/);
});
t.test('events: capture, target, bubble, once, removal, prevention, propagation', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc, w = g._win;
  const outer = d.createElement('div'), inner = d.createElement('button');
  outer.appendChild(inner); d.body.appendChild(outer);
  const log = [];
  outer.addEventListener('click', (e) => log.push('outer-cap'), true);
  outer.addEventListener('click', (e) => log.push('outer:' + (e.target === inner) + ':' + (e.currentTarget === outer) + ':' + e.eventPhase));
  inner.addEventListener('click', (e) => log.push('inner:' + e.eventPhase));
  inner.onclick = () => log.push('prop');
  d.addEventListener('click', () => log.push('doc')); w.addEventListener('click', (e) => log.push('win:' + (e.currentTarget === w)));
  inner.click();
  t.eq(log.join(' > '), 'outer-cap > inner:2 > prop > outer:true:true:3 > doc > win:true', 'order and phases (on<type> handlers run after listeners)');
  const once = []; inner.addEventListener('ping', () => once.push(1), { once: true }); inner.dispatchEvent(new w.Event('ping')); inner.dispatchEvent(new w.Event('ping')); t.eq(once.length, 1, 'once');
  const fn = () => once.push('x'); inner.addEventListener('ping', fn); inner.addEventListener('ping', fn); inner.dispatchEvent(new w.Event('ping')); t.eq(once.filter((x) => x === 'x').length, 1, 'duplicate listeners are ignored');
  inner.removeEventListener('ping', fn); inner.dispatchEvent(new w.Event('ping')); t.eq(once.filter((x) => x === 'x').length, 1, 'removeEventListener');
  const doc = []; const dl = () => doc.push('d'); d.addEventListener('zap', dl); w.addEventListener('zap', dl); t.eq(g._listeners('zap'), 2, '_listeners counts window and document'); d.removeEventListener('zap', dl); w.removeEventListener('zap', dl); t.eq(g._listeners('zap'), 0, 'window and document removal really removes');
  g._fire('zap'); t.eq(doc.length, 0, 'a removed handler no longer fires');
  const stop = []; inner.addEventListener('s', (e) => { e.stopPropagation(); stop.push('inner'); }); outer.addEventListener('s', () => stop.push('outer')); inner.dispatchEvent(new w.Event('s', { bubbles: true })); t.deep(stop, ['inner'], 'stopPropagation');
  const im = []; inner.addEventListener('i', (e) => { e.stopImmediatePropagation(); im.push(1); }); inner.addEventListener('i', () => im.push(2)); inner.dispatchEvent(new w.Event('i')); t.deep(im, [1], 'stopImmediatePropagation');
  const ev = new w.Event('c', { bubbles: true, cancelable: true }); inner.addEventListener('c', (e) => e.preventDefault()); t.eq(inner.dispatchEvent(ev), false, 'dispatchEvent returns false when prevented'); t.eq(ev.defaultPrevented, true, 'defaultPrevented');
  const nb = new w.Event('nb', { cancelable: false }); inner.addEventListener('nb', (e) => e.preventDefault()); t.eq(inner.dispatchEvent(nb), true, 'non-cancelable events cannot be prevented');
  const bub = []; outer.addEventListener('nobubble', () => bub.push(1)); inner.dispatchEvent(new w.Event('nobubble')); t.eq(bub.length, 0, 'non-bubbling events stay put');
  t.throws(() => { inner.addEventListener('boom', () => { throw new Error('handler failed'); }); inner.dispatchEvent(new w.Event('boom')); }, 'a throwing handler surfaces to the test', /handler failed/);
  t.throws(() => inner.dispatchEvent({}), 'dispatchEvent needs an Event');
  const kd = []; d.addEventListener('keydown', (e) => kd.push(e.key + ':' + e.code + ':' + e.ctrlKey)); g._key('e', { ctrl: true }); g._key('Escape'); g._key('7'); t.deep(kd, ['e:KeyE:true', 'Escape:Escape:false', '7:Digit7:false'], '_key builds real KeyboardEvents');
  const fired = []; d.addEventListener('keyup', (e) => fired.push(e.key)); g._key('a', { type: 'down' }); t.eq(fired.length, 0, '_key type down does not send keyup');
  const ee = g._fire('keydown', { key: 'Enter' }); t.ok(ee instanceof w.KeyboardEvent && ee.key === 'Enter', '_fire builds the right event class');
});
t.test('focus, tabbing, activation keys and disabled controls', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc;
  d.body.innerHTML = '<button id="b1">1</button><button id="b2" disabled>2</button><a id="a1" href="#">a</a><div id="d1" tabindex="0">d</div><div id="d2" tabindex="-1">x</div><input id="i1"><div id="hid" hidden><button id="b3">3</button></div><div id="plain">p</div>';
  const seen = [];
  d.body.addEventListener('focusin', (e) => seen.push('in:' + e.target.id)); d.body.addEventListener('focusout', (e) => seen.push('out:' + e.target.id));
  const $ = (id) => d.getElementById(id);
  t.eq(d.activeElement, d.body, 'body is active by default');
  $('plain').focus(); t.eq(d.activeElement, d.body, 'plain divs are not focusable'); $('b2').focus(); t.eq(d.activeElement, d.body, 'disabled buttons are not focusable'); $('b3').focus(); t.eq(d.activeElement, d.body, 'hidden subtrees are not focusable');
  $('d2').focus(); t.eq(d.activeElement.id, 'd2', 'tabindex -1 is focusable by script');
  $('b1').focus(); t.deep(seen, ['in:d2', 'out:d2', 'in:b1'], 'focusin and focusout bubble in order');
  const order = []; for (let i = 0; i < 5; i++) { g._tab(); order.push(d.activeElement.id); } t.deep(order, ['a1', 'd1', 'i1', 'b1', 'a1'], 'Tab cycles focusable elements in DOM order, skipping disabled, hidden and tabindex -1');
  g._key('Tab', { shift: true }); t.eq(d.activeElement.id, 'b1', 'Shift+Tab goes back');
  let clicks = 0; $('b1').addEventListener('click', () => clicks++); $('b1').focus(); g._key('Enter'); t.eq(clicks, 1, 'Enter activates a focused button'); g._key(' '); t.eq(clicks, 2, 'Space activates on keyup');
  $('b2').addEventListener('click', () => clicks++); $('b2').click(); t.eq(clicks, 2, 'a disabled button swallows clicks'); t.eq(g._click('#b2'), false, '_click on a disabled button does nothing');
  const rm = $('i1'); rm.focus(); rm.remove(); t.eq(d.activeElement, d.body, 'removing the focused element resets focus to body');
  const bl = []; $('b1').addEventListener('blur', () => bl.push('b')); $('b1').focus(); $('b1').blur(); t.deep(bl, ['b'], 'blur fires'); t.eq(d.activeElement, d.body, 'after blur');
});
t.test('_click, _pointer, _drag and pointer capture behave like a user', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc, w = g._win;
  d.body.innerHTML = '<div id="card" style="left: 100px; top: 50px; width: 40px; height: 60px"></div><input id="cb" type="checkbox"><input id="txt">';
  const log = [];
  for (const type of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) d.getElementById('card').addEventListener(type, (e) => log.push(type + (type === 'click' ? `@${e.clientX},${e.clientY}` : '')));
  g._click('#card');
  t.deep(log, ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click@120,80'], 'a click is the whole pointer sequence at the element centre');
  g._click('#cb'); t.eq(d.getElementById('cb').checked, true, '_click toggles a checkbox'); g._click('#txt'); t.eq(d.activeElement.id, 'txt', 'mousedown focuses a focusable target');
  const moves = []; const card = d.getElementById('card'); const other = d.getElementById('txt');
  card.addEventListener('pointerdown', (e) => card.setPointerCapture(e.pointerId));
  card.addEventListener('pointermove', (e) => moves.push([Math.round(e.clientX), Math.round(e.clientY), e.buttons]));
  card.addEventListener('pointerup', () => moves.push('up'));
  g._drag(other, [10, 10], [50, 90], 4);
  t.eq(moves.length, 0, 'without capture the events go to the element under the pointer');
  g._drag(card, [10, 10], [50, 90], 4);
  t.deep(moves, [[20, 30, 1], [30, 50, 1], [40, 70, 1], [50, 90, 1], 'up'], 'drag sends interpolated pointermoves and a final pointerup');
  t.ok(!card.hasPointerCapture(1), 'capture is released on pointerup');
  const e = g._pointer('pointermove', card, { x: 1, y: 2, pointerType: 'touch', id: 7 }); t.ok(e instanceof w.PointerEvent && e.pointerType === 'touch' && e.pointerId === 7, '_pointer builds PointerEvents');
  const inp = d.getElementById('txt'); const ch = []; inp.addEventListener('input', (ev) => ch.push('input:' + ev.data)); inp.addEventListener('change', () => ch.push('change')); g._input('#txt', 'hey'); t.deep(ch, ['input:hey', 'change'], '_input'); t.eq(inp.value, 'hey', 'value set');
  t.throws(() => g._click('#nothing'), '_click on a missing selector throws', /no element matches/);
});
t.test('geometry, computed style and observers', () => {
  const g = boot({ only: ['util'], viewport: { w: 800, h: 600 }, dpr: 2 });
  const d = g._doc, w = g._win;
  t.deep([w.innerWidth, w.innerHeight, w.devicePixelRatio], [800, 600, 2], 'viewport options');
  t.eq(d.getElementById('view').getBoundingClientRect().width, 1280, 'canvas rect follows its attribute size');
  const e = d.createElement('div'); e.style.width = '120px'; e.style.height = '30px'; e.style.left = '5px'; d.body.appendChild(e);
  t.deep([e.offsetWidth, e.clientHeight, e.getBoundingClientRect().left, e.getBoundingClientRect().right], [120, 30, 5, 125], 'inline px sizes are honoured');
  e.style.setProperty('--scale', '0.5'); const kid = d.createElement('span'); e.appendChild(kid);
  t.eq(w.getComputedStyle(kid).getPropertyValue('--scale'), '0.5', 'custom properties inherit'); t.eq(w.getComputedStyle(e).display, 'block', 'default display'); t.eq(w.getComputedStyle(kid).display, 'inline', 'inline tags'); e.hidden = true; t.eq(w.getComputedStyle(e).display, 'none', 'hidden is display none');
  e.style.pointerEvents = 'none'; t.eq(w.getComputedStyle(kid).pointerEvents, 'none', 'pointer-events inherits');
  const sizes = []; const ro = new w.ResizeObserver((entries) => sizes.push(entries[0].contentRect.width)); ro.observe(e); g._triggerResize(e, { width: 33, height: 4 }); ro.disconnect(); g._triggerResize(e, { width: 44, height: 4 }); t.deep(sizes, [33], 'ResizeObserver fires on demand and stops after disconnect');
  const hits = []; const io = new w.IntersectionObserver((en) => hits.push(en[0].isIntersecting + ':' + en[0].intersectionRatio)); io.observe(e); g._triggerIntersect(e, 0.5); g._triggerIntersect(e, 0); t.deep(hits, ['true:0.5', 'false:0'], 'IntersectionObserver');
  const rz = []; w.addEventListener('resize', () => rz.push([w.innerWidth, w.innerHeight])); w.visualViewport.addEventListener('resize', () => rz.push('vv')); g._resize(390, 844); t.deep(rz, [[390, 844], 'vv'], '_resize updates the window and fires window and visualViewport');
  t.deep([w.visualViewport.width, w.screen.orientation.type], [390, 'portrait-primary'], 'visualViewport and orientation follow the size');
});
t.test('matchMedia answers and change events', () => {
  const g = boot({ only: ['util'], media: { '(prefers-reduced-motion: reduce)': true } });
  const w = g._win;
  t.eq(w.matchMedia('(prefers-reduced-motion: reduce)').matches, true, 'configured');
  t.eq(w.matchMedia('(prefers-color-scheme: dark)').matches, false, 'defaults');
  t.eq(w.matchMedia('(max-width: 1300px)').matches, true, 'width queries use the viewport'); t.eq(w.matchMedia('(min-width: 900px) and (orientation: landscape)').matches, true, 'and-combinations');
  t.eq(w.matchMedia('(pointer: fine)').matches, true, 'mouse by default');
  const mq = w.matchMedia('(prefers-reduced-motion: reduce)'); const ch = []; mq.addEventListener('change', (e) => ch.push(e.matches)); mq.onchange = (e) => ch.push('on' + e.matches);
  g._media('(prefers-reduced-motion: reduce)', false); t.deep(ch, [false, 'onfalse'], '_media fires change listeners and onchange'); g._media('(prefers-reduced-motion: reduce)', false); t.eq(ch.length, 2, 'no event when nothing changed');
  mq.removeEventListener('change', () => {}); t.ok(typeof mq.addListener === 'function', 'legacy addListener');
  const wm = w.matchMedia('(max-width: 500px)'); const wc = []; wm.addEventListener('change', (e) => wc.push(e.matches)); g._resize(400, 300); t.deep(wc, [true], 'resize flips width queries');
  const touch = boot({ only: ['util'], touch: true }); t.ok(touch._win.matchMedia('(pointer: coarse)').matches && touch._win.navigator.maxTouchPoints === 5 && 'ontouchstart' in touch._win, 'touch option');
});
t.test('visibility, rAF pausing, clipboard, fonts, vibration', async () => {
  const g = boot({ only: ['util'] });
  const d = g._doc, w = g._win;
  const vis = []; d.addEventListener('visibilitychange', () => vis.push(d.visibilityState)); let f = 0; w.requestAnimationFrame(function loop() { f++; w.requestAnimationFrame(loop); });
  g._frames(3); g._hide(); g._frames(3); t.eq(f, 3, 'rAF callbacks are paused while hidden'); g._show(); g._frames(2); t.eq(f, 5, 'and resume when visible again'); t.deep(vis, ['hidden', 'visible'], 'visibilitychange events');
  await w.navigator.clipboard.writeText('copied'); t.eq(g._clipboard, 'copied', 'clipboard'); t.eq(await w.navigator.clipboard.readText(), 'copied', 'clipboard readText');
  await w.document.fonts.ready; t.eq(w.document.fonts.check('12px x'), true, 'fonts');
  w.navigator.vibrate(30); t.deep(g._vibrations, [30], 'vibrate is recorded'); t.eq(w.screen.orientation.lock('landscape') instanceof Promise, true, 'orientation.lock returns a promise');
  const anim = d.createElement('div').animate([], 100); let done = 0; anim.onfinish = () => done++; await anim.finished; await Promise.resolve(); t.eq(done, 1, 'animate() finishes on a microtask');
  const img = new w.Image(); let loaded = 0; img.onload = () => loaded++; img.src = 'data:image/png;base64,AAAA'; await Promise.resolve(); t.eq(loaded, 1, 'Image.src fires onload on a microtask'); t.eq(img.complete, true, 'complete');
  const bad = boot({ only: ['util'], imageLoad: 'error' })._win.Image; const bi = new bad(); let err = 0; bi.onerror = () => err++; bi.src = 'x.png'; await Promise.resolve(); t.eq(err, 1, 'imageLoad:error fires onerror');
});

// ---------------------------------------------------------------- virtual clock
t.test('timers: ordering, chaining, intervals, cancellation and flush', () => {
  const g = boot({ only: ['util'] });
  const w = g._win, log = [];
  w.setTimeout(() => log.push('b100'), 100); w.setTimeout(() => log.push('a100'), 100); w.setTimeout(() => log.push('c50'), 50);
  w.setTimeout((x, y) => log.push('args' + x + y), 10, 'A', 'B');
  const cancel = w.setTimeout(() => log.push('never'), 20); w.clearTimeout(cancel);
  g._flush(60); t.deep(log, ['args' + 'AB', 'c50'], 'timeouts fire in due order and take arguments'); g._flush(1e6); t.deep(log.slice(2), ['b100', 'a100'], 'equal times fire in creation order');
  const chain = []; w.setTimeout(() => { chain.push(1); w.setTimeout(() => { chain.push(2); w.setTimeout(() => chain.push(3), 30); }, 20); }, 10); g._flush(); t.deep(chain, [1, 2, 3], '_flush() with no argument drains chained timeouts');
  let n = 0; const iv = w.setInterval(() => n++, 25); g._flush(100); t.eq(n, 4, 'setInterval fires every period'); w.clearInterval(iv); g._flush(100); t.eq(n, 4, 'clearInterval stops it');
  const at = []; w.setTimeout(() => at.push(w.performance.now()), 75); g._flush(200); t.deep(at, [g._now() - 200 + 75 + 0], 'performance.now inside a callback is that timer\'s due time');
  t.throws(() => w.setTimeout('x = 1', 1), 'string callbacks are rejected', /callback must be a function/);
  w.setTimeout(() => { throw new Error('late'); }, 5); t.throws(() => g._flush(10), 'a throwing timer surfaces', /late/);
  let ticks = 0; w.setInterval(() => ticks++, 0); t.throws(() => g._flush(1e6), 'a zero-delay interval is detected as runaway', /runaway/);
});
t.test('rAF: ids, cancel, frame stepping, interleaving with timers', () => {
  const g = boot({ only: ['util'] });
  const w = g._win, log = [];
  const a = w.requestAnimationFrame((ts) => log.push('a@' + ts)), b = w.requestAnimationFrame((ts) => log.push('b@' + ts));
  t.ok(b > a && a >= 1, 'ids are unique and increasing'); w.cancelAnimationFrame(a);
  w.setTimeout(() => log.push('timer@' + g._now()), 8);
  t.eq(g._raf(16), 1, '_raf returns the number of callbacks run'); t.deep(log, ['timer@8', 'b@16'], 'due timers run before the frame callbacks, at their own times');
  t.eq(g._raf(16), 0, 'callbacks queued before the frame run once');
  const c = w.requestAnimationFrame(() => { log.push('c'); w.requestAnimationFrame(() => log.push('c2')); }); g._raf(); t.deep(log.slice(-1), ['c'], 'callbacks scheduled during a frame wait for the next'); g._raf(); t.deep(log.slice(-1), ['c2'], 'and run then');
  let frames = 0; w.requestAnimationFrame(function loop() { frames++; w.requestAnimationFrame(loop); }); g._advance(160); t.eq(frames, 10, '_advance(160) is ten 16ms frames'); g._advance(20); t.eq(frames, 12, 'the partial step still renders a frame'); g._advance(100, 50); t.eq(frames, 14, 'custom step');
  const start = g._now(); g._frames(3, 10); t.eq(g._now() - start, 30, '_frames(n, dt)');
  t.throws(() => w.requestAnimationFrame(1), 'rAF needs a function');
});
await t.test('_tick and _until drain promise continuations between frames', async () => {
  const g = boot({ only: ['util'] });
  const w = g._win;
  const log = [];
  const sleep = (ms) => new w.Promise((r) => w.setTimeout(r, ms));
  (async () => { log.push('start'); await sleep(50); log.push('50'); await sleep(50); log.push('100'); })();
  await g._tick(60); t.deep(log, ['start', '50'], '_tick(60) lets the first await finish');
  await g._tick(100); t.deep(log, ['start', '50', '100'], 'and the chained one');
  let flag = false; w.setTimeout(() => { flag = true; }, 400);
  t.eq(await g._until(() => flag), true, '_until ticks until the predicate holds');
  let err = null; try { await g._until(() => false, { ms: 64 }); } catch (e) { err = e; } t.ok(err && /still false after 64/.test(err.message), '_until gives up with a message');
  await g._settle(); t.ok(true, '_settle resolves');
});

// ---------------------------------------------------------------- canvas
t.test('canvas 2d: strict like a browser, records what a browser hides', () => {
  const g = boot({ only: ['util'] });
  const d = g._doc, w = g._win;
  const cv = d.createElement('canvas'); t.deep([cv.width, cv.height], [300, 150], 'default canvas size');
  const ctx = cv.getContext('2d'); t.ok(ctx === cv.getContext('2d') && ctx.canvas === cv, 'one context per canvas that points back at it'); t.eq(cv.getContext('webgl'), null, 'no WebGL');
  t.throws(() => ctx.fillRectt(0, 0, 1, 1), 'typos in method names throw', /not a function/);
  t.throws(() => ctx.arc(0, 0, -1, 0, 1), 'arc with a negative radius throws', /negative/); t.throws(() => ctx.ellipse(0, 0, 1, -1, 0, 0, 1), 'ellipse with a negative radius throws'); t.throws(() => ctx.roundRect(0, 0, 4, 4, -2), 'roundRect with a negative radius throws');
  t.throws(() => ctx.fillRect(1, 2), 'missing arguments throw', /4 arguments required/);
  t.throws(() => ctx.createLinearGradient(NaN, 0, 1, 1), 'gradient with NaN throws'); t.throws(() => ctx.createRadialGradient(0, 0, -1, 0, 0, 5), 'radial gradient with negative radius throws');
  const gr = ctx.createLinearGradient(0, 0, 1, 1); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(0,0,0,.5)'); t.eq(gr._stops.length, 2, 'stops are recorded'); t.throws(() => gr.addColorStop(1.5, '#fff'), 'stop offset out of range throws'); t.throws(() => gr.addColorStop(0, 'purplish'), 'stop colour must parse');
  ctx.fillStyle = gr; t.eq(ctx.fillStyle, gr, 'gradients are accepted as fill styles');
  ctx.fillStyle = '#ff7eb6'; ctx.fillStyle = '#ff7eb'; t.eq(ctx.fillStyle, '#ff7eb6', 'an invalid colour is ignored like a browser'); ctx.fillStyle = undefined; ctx.font = 'huge'; ctx.globalAlpha = 2; ctx.lineWidth = -3; ctx.globalCompositeOperation = 'nope'; ctx.textAlign = 'middle';
  t.deep([ctx.font, ctx.globalAlpha, ctx.lineWidth, ctx.globalCompositeOperation, ctx.textAlign], ['10px sans-serif', 1, 1, 'source-over', 'start'], 'invalid font, alpha, width, composite and align are all ignored');
  ctx.fillStyle = 'rgb(255 0 0 / 50%)'; ctx.strokeStyle = 'hsl(200, 50%, 40%)'; ctx.shadowColor = 'transparent'; ctx.font = 'italic bold 20px "Hiragino Mincho ProN", serif'; ctx.letterSpacing = '1px';
  t.deep([ctx.fillStyle, ctx.font], ['rgb(255 0 0 / 50%)', 'italic bold 20px "Hiragino Mincho ProN", serif'], 'modern colour syntax and quoted font families are accepted');
  ctx.fillRect(NaN, 0, 1, 1); ctx.translate(Infinity, 0); ctx.restore();
  const kinds = g._issues.map((i) => i.kind + ':' + i.detail.split(' ')[0]); t.ok(kinds.filter((k) => k.startsWith('ignoredValue')).length === 7 && kinds.some((k) => k.startsWith('nonFinite:fillRect')) && kinds.some((k) => k.startsWith('nonFinite:translate')) && kinds.some((k) => k.startsWith('unbalanced')), 'issues recorded: ' + kinds.join(' | '));
  t.ok(g._issues.every((i) => typeof i.at === 'string'), 'each issue carries a call site'); const before = g._issues.length; g._resetCounts(); t.eq([g._issues.length, before > 0].join(), '0,true', '_resetCounts clears issues too');
  ctx.save(); ctx.translate(10, 20); ctx.scale(2, 3); ctx.rotate(0); const m = ctx.getTransform(); t.deep([m.a, m.d, m.e, m.f], [2, 3, 10, 20], 'the transform is tracked'); t.eq(ctx._depth, 1, 'save depth is tracked'); ctx.restore(); t.deep([ctx.getTransform().a, ctx._depth], [1, 0], 'restore pops transform and depth');
  ctx.setTransform(2, 0, 0, 2, 0, 0); ctx.transform(1, 0, 0, 1, 5, 0); t.eq(ctx.getTransform().e, 10, 'transform composes'); ctx.setTransform(new w.DOMMatrix([3, 0, 0, 3, 1, 1])); t.eq(ctx.getTransform().a, 3, 'setTransform(DOMMatrix)'); ctx.resetTransform(); t.eq(ctx.getTransform().isIdentity, true, 'resetTransform');
  ctx.globalAlpha = 0.5; ctx.save(); ctx.globalAlpha = 0.1; ctx.restore(); t.eq(ctx.globalAlpha, 0.5, 'save and restore keep the drawing state'); ctx.setLineDash([2, 3, 4]); t.deep(ctx.getLineDash(), [2, 3, 4, 2, 3, 4], 'odd dash lists double');
  ctx.save(); cv.width = 300; t.eq(ctx._depth, 0, 'assigning width resets the context, even to the same value');
  t.eq(ctx.measureText('abcd').width, 4 * 10 * 0.55, 'measureText scales with the font size');
  t.throws(() => ctx.drawImage(undefined, 0, 0), 'drawImage(undefined) throws', /not of type/); t.throws(() => ctx.drawImage({}, 0, 0), 'drawImage of a plain object throws');
  const z = d.createElement('canvas'); z.width = 0; t.throws(() => ctx.drawImage(z, 0, 0), 'a zero-size canvas source throws', /width or height of 0/);
  const ok = d.createElement('canvas'); ok.width = 4; ok.height = 4; ctx.drawImage(ok, 0, 0); ctx.drawImage(ok, 0, 0, 2, 2); ctx.drawImage(ok, 0, 0, 1, 1, 0, 0, 2, 2); t.throws(() => ctx.drawImage(ok, 0, 0, 1), 'four arguments is not a valid arity', /Valid arities/);
  t.throws(() => ctx.getImageData(0, 0, 0, 4), 'getImageData of width 0 throws'); const idata = ctx.getImageData(1, 1, 3, 2); t.deep([idata.width, idata.height, idata.data.length, idata instanceof w.ImageData], [3, 2, 24, true], 'ImageData shape'); t.throws(() => ctx.putImageData({}, 0, 0), 'putImageData needs ImageData'); ctx.putImageData(idata, 0, 0);
  t.throws(() => new w.ImageData(0, 4), 'ImageData with a zero side throws'); t.eq(ctx.createImageData(2, 2).data.length, 16, 'createImageData');
  const p = new w.Path2D(); p.moveTo(0, 0); p.arc(1, 1, 2, 0, 3); p.closePath(); const q = new w.Path2D(p); p.addPath(q); ctx.fill(p); ctx.fill(p, 'evenodd'); ctx.stroke(p); ctx.clip('evenodd'); t.throws(() => ctx.fill('bogus'), 'bad fill rule throws'); t.throws(() => ctx.stroke('x'), 'stroke wants a Path2D'); t.throws(() => p.arc(0, 0, -1, 0, 1), 'Path2D validates arcs too');
  t.throws(() => ctx.createPattern(cv, 'weird'), 'bad pattern repetition throws'); t.ok(ctx.createPattern(cv, 'repeat') instanceof w.CanvasPattern, 'createPattern');
  t.ok(g._counts.drawImage >= 3 && g._counts.fill === 3 && g._counts.stroke === 2 && g._counts.getImageData >= 2, 'call counters on _counts: ' + JSON.stringify(g._counts));
  t.eq(boot({ only: ['util'], offscreen: true })._win.OffscreenCanvas !== undefined, true, 'offscreen option adds OffscreenCanvas'); t.eq(typeof w.OffscreenCanvas, 'undefined', 'and it is absent otherwise');
  const off = new (boot({ only: ['util'], offscreen: true })._win.OffscreenCanvas)(8, 4); t.deep([off.width, off.height, off.getContext('2d').canvas === off], [8, 4, true], 'OffscreenCanvas works');
  t.eq(cv.toDataURL().slice(0, 22), 'data:image/png;base64,', 'toDataURL'); z.width = 0; t.eq(z.toDataURL(), 'data:,', 'toDataURL of an empty canvas');
  t.eq(g._ctx.canvas.id, 'view', 'api._ctx is the #view context');
  t.throws(() => boot({ only: ['util'], strictCtx: true })._doc.createElement('canvas').getContext('2d').fillRect(NaN, 0, 1, 1), 'strictCtx turns recorded issues into throws', /nonFinite/);
  t.ok(validCssColor('#abc') && validCssColor('#aabbccdd') && validCssColor('rebeccapurple') && validCssColor('rgba(1,2,3,.5)') && !validCssColor('#ab') && !validCssColor('var(--x)') && !validCssColor('') && !validCssColor(null), 'validCssColor');
});

// ---------------------------------------------------------------- audio
t.test('AudioContext is constructible with a usable, checked node graph', async () => {
  const g = boot({ only: ['util'] });
  const w = g._win;
  const AC = w.AudioContext || w.webkitAudioContext; t.ok(w.webkitAudioContext === w.AudioContext, 'webkit alias');
  const ac = new AC(); t.eq(ac.state, 'suspended', 'starts suspended like a browser without a gesture'); t.eq(ac.sampleRate, 44100, 'sample rate'); t.eq(Math.floor(ac.sampleRate * 0.5), 22050, 'sampleRate is a plain number');
  t.eq(new AC({ sampleRate: 22050 }).sampleRate, 22050, 'sampleRate option'); t.throws(() => new AC({ sampleRate: 100 }), 'bad sample rate throws');
  const osc = ac.createOscillator(), gain = ac.createGain(), filt = ac.createBiquadFilter(), pan = ac.createStereoPanner(), comp = ac.createDynamicsCompressor();
  t.ok(osc.connect(filt) === filt && filt.connect(gain) === gain && gain.connect(pan) === pan && pan.connect(comp) === comp && comp.connect(ac.destination) === ac.destination, 'connect returns its destination so chains work');
  t.eq(osc.connect(gain.gain), undefined, 'connecting to an AudioParam is allowed'); t.throws(() => osc.connect({}), 'connecting to a non-node throws', /not of type 'AudioNode'/); t.throws(() => osc.connect(new AC().destination), 'cross-context connect throws');
  gain.gain.setValueAtTime(0.0001, ac.currentTime); gain.gain.exponentialRampToValueAtTime(1, ac.currentTime + 0.1); gain.gain.linearRampToValueAtTime(0, ac.currentTime + 0.2); gain.gain.setTargetAtTime(0.5, 0, 0.1); gain.gain.cancelScheduledValues(0);
  t.eq(gain.gain.setValueAtTime(1, 0), gain.gain, 'param methods chain');
  t.throws(() => gain.gain.exponentialRampToValueAtTime(0, 1), 'exponential ramp to 0 throws (the classic WebAudio bug)', /should not be in the range/); t.throws(() => { gain.gain.value = NaN; }, 'non-finite param values throw'); t.throws(() => gain.gain.setValueAtTime(1, -1), 'negative times throw', /negative/); t.throws(() => gain.gain.setValueAtTime(Infinity, 0), 'non-finite values throw');
  osc.type = 'square'; osc.type = 'bogus'; t.eq(osc.type, 'square', 'invalid oscillator type is ignored'); osc.frequency.value = 220; t.eq(osc.frequency.value, 220, 'frequency param');
  t.throws(() => osc.stop(), 'stop before start throws', /without calling start/); osc.start(); t.throws(() => osc.start(), 'start twice throws', /more than once/); t.throws(() => ac.createOscillator().start(-1), 'negative start throws');
  let ended = 0; osc.onended = () => ended++; osc.stop(ac.currentTime + 0.25); g._flush(100); t.eq(ended, 0, 'not ended yet'); await ac.resume(); t.eq(ac.state, 'running', 'resume'); g._flush(300); t.eq(ended, 1, 'onended fires on the virtual clock after stop'); t.eq(g._audio.started, 1, 'started counter'); t.eq(g._audio.stopped, 1, 'stopped counter');
  const t0 = ac.currentTime; g._flush(500); t.near(ac.currentTime - t0, 0.5, 1e-9, 'currentTime follows the virtual clock while running'); await ac.suspend(); const t1 = ac.currentTime; g._flush(500); t.eq(ac.currentTime, t1, 'and freezes while suspended');
  const buf = ac.createBuffer(2, ac.sampleRate * 0.1, ac.sampleRate); const ch0 = buf.getChannelData(0); for (let i = 0; i < ch0.length; i++) ch0[i] = Math.sin(i); t.deep([buf.numberOfChannels, buf.length, buf.duration.toFixed(2)], [2, 4410, '0.10'], 'buffer shape'); t.ok(buf.getChannelData(0) === ch0, 'channel data is stable'); t.throws(() => buf.getChannelData(2), 'bad channel throws');
  t.throws(() => ac.createBuffer(1, 0, 44100), 'zero-length buffer throws', /frames/); t.throws(() => ac.createBuffer(0, 10, 44100), 'zero channels throws'); t.throws(() => ac.createBuffer(1, 10, 100), 'bad rate throws');
  const src = ac.createBufferSource(); src.buffer = buf; src.connect(ac.destination); let sEnd = 0; src.onended = () => sEnd++; await ac.resume(); src.start(); g._flush(50); t.eq(sEnd, 0, 'a buffer source is still playing'); g._flush(100); t.eq(sEnd, 1, 'and ends by itself after its duration');
  const loop = ac.createBufferSource(); loop.buffer = buf; loop.loop = true; loop.start(); g._flush(5000); t.eq(loop._stopped, false, 'looping sources never end by themselves');
  t.ok(ac.createDelay(2) && ac.createConvolver() && ac.createWaveShaper() && ac.createAnalyser() && ac.createConstantSource() && ac.createChannelSplitter(2) && ac.createChannelMerger(2) && ac.createPanner(), 'the rest of the factory methods exist'); t.throws(() => ac.createDelay(0), 'createDelay(0) throws');
  const an = ac.createAnalyser(); const arr = new Uint8Array(an.frequencyBinCount); an.getByteFrequencyData(arr); t.eq(arr.length, 1024, 'analyser arrays');
  t.ok((await ac.decodeAudioData(new ArrayBuffer(8))).length > 0, 'decodeAudioData resolves a buffer'); const off = new w.OfflineAudioContext(1, 4410, 44100); t.eq((await off.startRendering()).length, 4410, 'OfflineAudioContext renders');
  await ac.close(); t.eq(ac.state, 'closed', 'close'); t.eq(await ac.resume().then(() => 'ok', () => 'rejected'), 'rejected', 'a closed context cannot resume');
  t.ok(g._audio.contexts.length >= 3 && g._audio.created.oscillator >= 2 && g._audio.log.length > 0, 'the recorder counts contexts, nodes and events');
});

// ---------------------------------------------------------------- storage
t.test('localStorage: seeded, live, and able to fail like private mode', () => {
  const g = boot({ only: ['util'], store: { rb_a: '1' } });
  const w = g._win, ls = w.localStorage;
  t.eq(ls.getItem('rb_a'), '1', 'seeded'); t.eq(ls.getItem('nope'), null, 'missing key is null'); ls.setItem('rb_b', 2); t.eq(g._store.rb_b, '2', 'setItem stringifies into the backing object'); t.eq(ls.length, 2, 'length'); t.eq(ls.key(1), 'rb_b', 'key(i)'); t.eq(ls.rb_a, '1', 'named property access');
  ls.removeItem('rb_a'); t.eq(ls.getItem('rb_a'), null, 'removeItem'); g._store.rb_z = 'direct'; t.eq(ls.getItem('rb_z'), 'direct', 'the backing object is live'); ls.clear(); t.eq(ls.length, 0, 'clear');
  w.sessionStorage.setItem('s', 'x'); t.eq(w.sessionStorage.getItem('s'), 'x', 'sessionStorage'); t.eq(ls.getItem('s'), null, 'is separate');
  const set = boot({ only: ['util'], failStorage: true })._win.localStorage; t.throws(() => set.setItem('a', 'b'), 'failStorage: setItem throws QuotaExceededError', /quota/); t.eq(set.getItem('a'), null, 'reads still work');
  let name = ''; try { set.setItem('a', 'b'); } catch (e) { name = e.name; } t.eq(name, 'QuotaExceededError', 'error name');
  const all = boot({ only: ['util'], failStorage: 'all' })._win.localStorage; t.throws(() => all.getItem('a'), 'failStorage all: getItem throws'); t.throws(() => all.removeItem('a'), 'removeItem throws');
  const acc = boot({ only: ['util'], failStorage: 'access' })._win; t.throws(() => acc.localStorage, 'failStorage access: reading window.localStorage throws SecurityError', /Access is denied/);
});

// ---------------------------------------------------------------- real repo: the loader on the actual game
t.test('the real game boots the modules that exist', () => {
  const g = boot({ only: ['util', 'data'] });
  t.eq(g._errors.length, 0, 'util and data load clean: ' + JSON.stringify(g._errors.map((e) => e.message)));
  t.ok(g.U && g.DATA && g.DATA.LISTS, 'namespaces exposed');
  t.eq(g._console.error.length, 0, 'no console.error while loading');
});

// ---------------------------------------------------------------- static analysis
t.test('tokenizer and stripJs blank strings, comments, templates and regexes only', () => {
  const src = "const a = 'Math.random'; // Date.now\n/* eval( */ const b = `x${Math.random()}y${ {k: 1}.k + `z${2}` }`; const r = /eval\\(['\"]/g; const d = 4 / 2 / 1;\nconst e = a ? .5 : b?.c;";
  const out = stripJs(src);
  t.eq(out.length, src.length, 'same length'); t.eq(out.split('\n').length, src.split('\n').length, 'same line breaks');
  t.ok(!/Date\.now|eval|'Math/.test(out.replace(/Math\.random\(\)/, '')), 'comment, string and regex contents are blanked');
  t.ok(/Math\.random\(\)/.test(out), 'code inside ${} is kept');
  t.ok(/4 \/ 2 \/ 1/.test(out), 'division is not a regex');
  t.ok(/b \?\. c/.test(tokenizeJs(src).map((x) => x.v).join(' ')) || /\?\./.test(src), 'optional chaining tokenises');
  t.ok(stripJs(src, { keepStrings: true }).includes("'Math.random'"), 'keepStrings keeps them');
  t.eq(tokenizeJs('a ? .5 : b').map((x) => x.v).join(' '), 'a ? .5 : b', 'ternary with .5 is not optional chaining');
});
t.test('analyzeTopLevel finds every kind of global declaration', () => {
  const names = (s) => analyzeTopLevel(s).names.map((n) => n.name).join();
  const stm = (s) => analyzeTopLevel(s).statements.map((x) => x.kind).join();
  t.eq(names('// header\nconst U = (() => { var x = 1; function f() {} return {}; })();'), 'U', 'one namespace, inner declarations ignored');
  t.eq(names('(function () { const a = 1; var b; function c() {} })();'), '', 'an IIFE declares nothing at top level'); t.eq(stm('(function () {})();'), 'iife', 'IIFE form A'); t.eq(stm('(() => { x(); })();'), 'iife', 'arrow IIFE'); t.eq(stm('(function () {}());'), 'iife', 'IIFE form B'); t.eq(stm('(async () => { await 1; })();'), 'iife', 'async IIFE');
  t.eq(names('const A = 1, B = 2;\nlet C;\nvar D = (1, 2);\nfunction f() {}\nclass K {}\nasync function g() {}'), 'A,B,C,D,f,K,g', 'every declaration form');
  t.eq(names('const { p, q } = obj;\nconst [r] = arr;'), '<pattern>,<pattern>', 'destructuring is flagged');
  t.eq(names('if (x) { var inBlock = 1; function hoisted() {} }\nfor (var i = 0; i < 2; i++) {}\nlet ok = 1;'), 'ok,inBlock,hoisted,i', 'var and function leak out of blocks, let does not');
  t.eq(names('function f() { if (x) { var inner = 1; } }\nconst g = () => { for (var i = 0;;) {} };'), 'f,g', 'var inside functions is fine');
  t.eq(names("const T = `a ${ {x: 1}.x + `b${1}` } c`;\nconst re = /[/]\\/\"'/g;\nconst d = 4 / 2;"), 'T,re,d', 'templates, regexes and division do not confuse it');
  t.eq(names('export const A = 1;\nimport x from "y";'), '<export>,<import>', 'module syntax is flagged');
  t.eq(stm("'use strict';\n(function () {})();"), 'expr,iife', 'a directive counts as a statement');
  t.eq(stm('if (a) { b(); } else { c(); }\ntry { x(); } catch (e) { y(); } finally { z(); }'), 'expr,expr', 'if/else and try/catch/finally stay one statement each');
  t.eq(stm('const a = 1\nconst b = 2\nfoo()'), 'decl,decl,expr', 'statements split on line breaks when no semicolon');
  t.eq(stm('const a = {\n  x: 1,\n  y: [1, 2],\n};\nDATA.add(1);'), 'decl,expr', 'multi-line initialisers stay together');
  t.eq(stm(';;;'), '', 'empty statements are ignored');
  t.eq(analyzeTopLevel('\n\nconst X = 1;').names[0].line, 3, 'line numbers');
  const real = analyzeTopLevel(realJs('util.js'));
  t.deep(real.names.map((n) => n.name), ['U'], 'util.js declares exactly U');
});

// ---------------------------------------------------------------- the hygiene suite fires on real violations
function repoFixture(files, { html, gallery, design, css, tests, pkg, build } = {}) {
  const root = path.join(tmpRoot, 'repo' + (++fxN));
  const game = path.join(root, 'rogue_book');
  fs.mkdirSync(path.join(game, 'js'), { recursive: true }); fs.mkdirSync(path.join(game, 'css')); fs.mkdirSync(path.join(root, 'tests'));
  for (const [n, src] of Object.entries(files)) fs.writeFileSync(path.join(game, 'js', n + '.js'), src);
  const list = Object.keys(files).map((n) => `<script src="js/${n}.js"></script>`).join('\n');
  fs.writeFileSync(path.join(game, 'index.html'), html || `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>fixture game</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E"><link rel="stylesheet" href="css/base.css"></head><body><div id="boot"></div><div id="stage"><canvas id="view"></canvas><div id="screens"></div><div id="overlays"></div><canvas id="over"></canvas><div id="tips"></div><div id="toasts"></div></div><div id="sr"></div>\n${list}</body></html>`);
  fs.writeFileSync(path.join(game, 'css', 'base.css'), css || '#screens,#overlays,#tips,#toasts,#over{position:absolute;inset:0;pointer-events:none}\nbutton,.card,.hit,[role=button],input,.panel{pointer-events:auto}\n#stage{touch-action:none}\nhtml,body,#wrap{touch-action:none}\n@media (pointer: coarse), (hover: none){.btn-key{display:none}}\n:root{--hit:max(44px,calc(44px / var(--scale)))}\n.x { background: url(data:image/png;base64,AAAA); }\n');
  if (gallery !== false) fs.writeFileSync(path.join(game, 'gallery.html'), gallery || `<!doctype html><html><head><title>g</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27/%3E"></head><body>${Object.keys(files).filter((n) => /^(util|data|data_.*|art|art_.*)$/.test(n)).map((n) => `<script src="js/${n}.js"></script>`).join('')}</body></html>`);
  fs.writeFileSync(path.join(game, 'DESIGN.md'), design || `# d\n## 3. Files, namespaces and load order\n\`\`\`\n${Object.keys(files).map((n) => 'js/' + n + '.js').join(' ')}\ncss/base.css\n\`\`\`\n`);
  for (const [n, src] of Object.entries(tests || { 'rogue_book_ok.test.mjs': '// suite\n// two\nimport { harness } from "./rogue_book_lib.mjs";\nconst t = harness("x");\nt.done();\n' })) fs.writeFileSync(path.join(root, 'tests', n), src);
  fs.writeFileSync(path.join(root, 'package.json'), pkg || JSON.stringify({ scripts: { 'test:rogue_book': 'node tests/rogue_book_all.mjs', check: 'node build.js && npm run test:rogue_book' } }));
  fs.writeFileSync(path.join(root, 'build.js'), build || "const STATIC_PATHS = ['rogue_book'];\n");
  return game;
}
// RB_STRICT is dropped from the child's environment: `rogue_book_all.mjs --strict` sets it for every suite, and a tiny fixture game must not be held to the real game's strict gate
const runHygiene = (game) => { const env = { ...process.env, ROGUE_BOOK_DIR: game }; delete env.RB_STRICT; return spawnSync(process.execPath, [HYGIENE], { env, encoding: 'utf8', timeout: 60000 }); };
t.test('the hygiene suite passes a small well-formed game', () => {
  const game = repoFixture({
    util: realJs('util.js'), data: realJs('data.js'),
    data_ok: '// content file\n// registers tips\n(function () {\n  DATA.add("tips", ["A tip."]);\n})();\n',
    art: '// art namespace\n// second line\nconst ART = { res: 1 };\n',
    art_x: '// art extension\n// second line\n(function () {\n  ART.thing = function () { return U.clamp(1, 0, 2); };\n})();\n',
    audio: '// audio\n// second line\nconst AUDIO = { sfx(id) { return id; } };\n',
    combat: '// combat\n// second line\nconst COMBAT = { create() { return DATA.LISTS.heroIds.length; } };\n',
    meta: '// meta\n// second line\nconst META = { load() { try { return window.localStorage.getItem("rb_profile_v1"); } catch (e) { return null; } } };\n',
    ui: '// ui\n// second line\nconst UI = { go(name) { AUDIO.sfx("ui_click"); return ART.res + name.length + META.load(); } };\n',
    screen_a: '// screen\n// second line\n(function () {\n  UI.go("title"); GAME.nodeDone();\n  console.error("x");\n})();\n',
    main: '// main\n// second line\nconst GAME = { t: 0 };\nGAME.t = Date.now();\nif (!window.__NO_AUTOBOOT) GAME.t = performance.now();\n',
  });
  const r = runHygiene(game);
  t.ok(r.status === 0 && /hygiene: \d+ passed, 0 failed/.test(r.stdout), 'clean fixture passes: ' + (r.stdout + r.stderr).split('\n').filter((l) => /FAIL|^\s{4}/.test(l)).slice(0, 8).join(' | '));
});
t.test('the hygiene suite fires on planted violations', () => {
  const D = String.fromCharCode(0x2014), R = 'Math.' + 'random';
  const game = repoFixture({
    util: realJs('util.js'), data: realJs('data.js'),
    data_x: '// header\n// two\nDATA.add("tips", "x");\nconst leak = 1;\n',
    art: '// art\n// two\nconst ART = { res: 1 };\nlet extra = 2;\n',
    art_y: `// header\n// two\n(function () {\n  const a = COMBAT.x;\n  var v = ${R}();\n  eval("1");\n  fetch("x");\n  alert(1);\n  console.log("hi");\n  const u = "https://evil.example.com/y.js";\n  localStorage.setItem("foo", "1");\n})();\nfunction stray() {}\n`,
    audio: '// audio\n// two\nconst AUDIO = { go() { return META.get("x"); } };\n',
    combat: '// combat\n// two\nconst COMBAT = { go() { document.body; ART.icon.draw(ctx, "nope", "x"); AUDIO.sfx("not_a_sound"); return performance.now() + Date.now(); } };\n',
    ui: '// ui\n// two\nconst UI = { a() { location.reload(); x ??= 1; return new Date(); } };\n',
    screen_z: '// screen\n// two\n(function () {\n  GAME.enterNode(1); GAME.other(); UI.go("nowhere"); UI.bus.emit("bad:event");\n  window.confirm("sure?");\n  el.dataset.tut = "nothing";\n  el.addEventListener("touchstart", f); requestAnimationFrame(f);\n})();\n',
    main: `// main\n// header\nconst GAME = {};\nconst second = 1;\nGAME.t = Date.now();\n\t// tab ${D} dash\n`,
  }, {
    html: '<!doctype html><html><head><meta name="viewport" content="width=device-width,user-scalable=no"><title>fx</title><link rel="stylesheet" href="css/base.css"><style id="boot-css">html{margin:0}</style></head><body><div id="stage"><canvas id="view"></canvas><div id="screens"></div><div id="overlays"></div><div id="toasts"></div></div><script>var leakedGlobal = 1; location.reload();</script>' +
      ['util', 'data', 'data_x', 'art', 'art_y', 'audio', 'combat', 'ui', 'screen_z', 'main', 'main'].map((n) => `<script src="js/${n}.js"></script>`).join('') + '</body></html>',
    gallery: '<!doctype html><html><head><title>g</title></head><body><script src="js/util.js"></script><script src="js/art.js"></script></body></html>',
    design: '# d\n## 3. Files, namespaces and load order\n```\njs/util.js js/data.js js/missing.js\ncss/base.css\n```\n',
    css: '@import url("https://fonts.example.com/x.css");\n#stage { will-change: transform; background: url(https://cdn.example.com/a.png); }\n',
    tests: { 'rogue_book_bad.test.mjs': '// no done here\n// two\nboot();\n' }, pkg: '{"scripts":{"check":"node build.js"}}', build: 'const STATIC_PATHS = ["other"];\n',
  });
  const r = runHygiene(game);
  const out = r.stdout + r.stderr;
  t.ok(r.status === 1, 'exit code 1');
  const want = ['dashes (', 'tab indentation', 'Math.random (use U.rng)', 'js/main.js is listed twice', 'scripts in index.html that DESIGN.md section 3 does not name', 'gallery scripts must equal', 'viewport must not disable page zoom', 'boot-css',
    'must declare exactly "const ART"', 'declares top-level name(s) stray', 'declares top-level name(s) leak', 'inline script at line', 'art_y.js references COMBAT.x, which loads after it', 'audio.js references META.get', 'logic never calls', 'combat.js is logic and must not use document',
    'eval or Function() needs code generation', 'network, worker or dynamic import', 'browser dialog', 'console output left in shipped game code', 'bare location', '??= is ES2021', 'storage key "foo"', 'reads the clock', 'performance.now in a logic file',
    'inline script uses a bare location.reload', '@import', 'will-change on #stage', 'need pointer-events:none so #view receives pointer events', 'external URL https://evil.example.com', 'never calls done()', 'AUDIO.sfx id "not_a_sound"', 'UI.go screen "nowhere"', 'UI.bus event "bad:event"', 'ART.icon.draw kind "nope"', 'data-tut anchor "nothing"',
    'legacy mouse or touch event', 'requestAnimationFrame outside main.js', 'runs every suite through the runner', 'build.js STATIC_PATHS', 'GAME.other, which loads after it'];
  for (const w of want) t.ok(out.includes(w), `hygiene reports "${w}"`);
  t.ok(!/GAME\.enterNode, which/.test(out), 'the allowed backward calls from screens are not reported');
  t.ok(!/main\.js:\d+: reads the clock/.test(out), 'main.js may read the clock');
});

// ---------------------------------------------------------------- the loader survives 40 files
t.test('a full-size fixture boots fast and keeps namespaces separate', () => {
  const files = {};
  const list = ['util', 'data', 'data_text', 'data_cards_a', 'data_enemies_1', 'art', 'art_heroes', 'audio', 'combat', 'map', 'run', 'meta', 'ui', 'scene', 'screen_menu', 'tutorial', 'main'];
  files.util = 'const U = { n: 1 };'; files.data = 'const DATA = { reg: [] };';
  for (const n of list.slice(2)) files[n] = /^(art|audio|combat|map|run|meta|ui|scene|main)$/.test(n) ? `const ${{ art: 'ART', audio: 'AUDIO', combat: 'COMBAT', map: 'MAP', run: 'RUN', meta: 'META', ui: 'UI', scene: 'SCENE', main: 'GAME' }[n]} = { id: "${n}" }; DATA.reg.push("${n}");` : `(function () { DATA.reg.push("${n}"); })();`;
  const t0 = Date.now();
  const g = boot({ dir: fixture(files) });
  t.eq(g.DATA.reg.length, list.length - 2, 'every module ran'); t.deep([g.ART.id, g.GAME.id, g.COMBAT.id], ['art', 'main', 'combat'], 'namespaces are exposed');
  t.ok(Date.now() - t0 < 2000, 'booting 17 files takes well under two seconds');
  const only = boot({ dir: fixture(files), only: ['art_heroes'] });
  t.deep(only.DATA.reg, ['data_text', 'data_cards_a', 'data_enemies_1'].slice(0, 0).concat(['art', 'art_heroes']), 'an art-only boot loads util, data, art and the art file and nothing else');
});

t.done();
