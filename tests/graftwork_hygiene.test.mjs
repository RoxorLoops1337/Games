// Hygiene gate for the Graftwork cleanup (graftwork/design/CLEANUP_PLAN.md, phase 0; the audit is tools/graftwork_hygiene.mjs).
// Outright (must be empty): files nothing reaches, manifest entries without a file, em dashes, imports that do not resolve.
// Against tests/graftwork_hygiene_allow.json (today's known junk): unused exports, exports only tests keep alive, `export` on
// names used only in their own file, top level names nothing references, duplicate small helpers, orphan asset files, tools no
// doc names. A NEW finding fails, and so does a listed finding that is gone from the code: the list can only shrink
// (`node tools/graftwork_hygiene.mjs --prune-allow` drops what was cleaned up).
// The first half proves on a throwaway repo (in the system temp folder) that each check really fires.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { audit, againstAllow, lex, ALLOW_LISTS, STRICT_LISTS, ALLOW_FILE } from '../tools/graftwork_hygiene.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DASH = String.fromCharCode(0x2014);

// ---------------------------------------------------------------- the lexer
t('lexer: comments, strings, template text and regex bodies are blanked, the code inside ${} stays, offsets hold', () => {
  const src = "const a = 'clamp'; // clamp in a comment\n/* clamp */ const re = /cl\\/amp['\"]/g, t = `x ${clamp(1)} y`; const d = a / 2 / b;";
  const L = lex(src);
  assert.equal(L.bare.length, src.length); assert.equal(L.code.length, src.length);
  assert.equal((L.bare.match(/clamp/g) || []).length, 1, 'only the call inside ${} is left: ' + L.bare);
  assert.ok(/a\s*\/\s*2\s*\/\s*b/.test(L.bare), 'a division is not a regex');
  assert.ok(L.code.includes("'clamp'") && !L.code.includes('in a comment'), 'code keeps strings, drops comments');
  assert.deepEqual(L.strings.map((s) => s.value), ['clamp', 'x ${} y']);
  assert.equal(L.regexes.length, 1);
  assert.equal(src.slice(L.strings[0].start, L.strings[0].end), "'clamp'");
});

// ---------------------------------------------------------------- every check fires on a small fake repo
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'graftwork-hygiene-'));
const put = (rel, text) => { const f = path.join(tmp, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
try {
  put('graftwork/index.html', '<script type="module" src="main.js"></script>');
  put('graftwork/lab/lab.html', '<script type="module" src="lab.js"></script>');
  put('graftwork/main.js', [
    "import { used, renamed as r2, viaStar } from './lib.js';",
    "import * as NS from './ns.js';",
    "import screen from './screen.js';",
    "import { again } from './barrel.js';",
    "import * as HAND from './handed.js';",
    'globalThis.flow = { HAND }; // the namespace is handed on: other files reach it through this object',
    "const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), TAU = Math.PI * 2;",
    "const deadConst = 5;",
    'function deadFn() { return 1; }',
    "function liveFn() { return used() + r2 + viaStar + again + clamp(TAU, 0, 1) + NS.dotted() + NS['draw' + screen.kind](); }",
    "liveFn(); navigator.serviceWorker.register('sw.js'); import('./lazy.js').then((m) => m.lazyOne());",
    "const img = 'assets/ward/rooms/named_in_code@2x.webp'; void img;",
  ].join('\n'));
  put('graftwork/lib.js', [
    "export function used() { return helper() + globalThis.flow.HAND.reached(); }",
    'function helper() { return 1; }',
    'const b = 2; export { b as renamed };',
    "export * from './star.js';",
    'export const neverImported = 1;', // unused export
    'export const onlyHere = 2; export const usesIt = () => onlyHere;', // onlyHere: export keyword only; usesIt: unused
    'export function testOnly() { return 3; }', // only the test imports it
    'export function testOnlyButUsed() { return 4; } const keep = testOnlyButUsed(); void keep;',
    `// a comment with testOnly and an em dash ${DASH}`,
  ].join('\n'));
  put('graftwork/star.js', "export const viaStar = 1; export const starUnused = 2;");
  put('graftwork/barrel.js', "export { again, never } from './deep.js';");
  put('graftwork/deep.js', 'export const again = 1; export const never = 2;');
  put('graftwork/ns.js', "export const dotted = () => 1; export const drawA = () => 2; export const drawB = () => 3; export const other = () => 4;");
  put('graftwork/screen.js', "export default { kind: 'A' };");
  put('graftwork/handed.js', 'export const reached = () => 1; export const unreached = () => 2;');
  put('graftwork/lazy.js', "export const lazyOne = () => 1; export const lazyTwo = () => 2;");
  put('graftwork/sw.js', "importScripts('sw-logic.js');");
  put('graftwork/sw-logic.js', 'self.x = 1;');
  put('graftwork/orphan.js', "export const lost = 1;"); // nothing reaches it
  put('graftwork/lab/lab.js', "import { labThing } from '../labonly.js'; const clamp = (v, a, b) => Math.max(a, Math.min(b, v)); const TAU = 6.283; console.log(labThing, clamp, TAU);");
  put('graftwork/labonly.js', 'export const labThing = 1;');
  put('graftwork/assets/ward/manifest.json', JSON.stringify({ rooms: { a: { file1x: 'rooms/a@1x.webp', file2x: 'rooms/a@2x.webp' } }, actors: { m: { file1x: 'actors/m@1x.webp', frames: { walk: ['m_walk1'], atk: ['m_atk2'], hi3x: true } } } }));
  for (const f of ['rooms/a@1x.webp', 'actors/m@1x.webp', 'actors/m_walk1@1x.webp', 'actors/m_walk1@2x.webp', 'actors/m_atk2@1x.webp', 'actors/m_atk2@2x.webp', 'rooms/named_in_code@2x.webp', 'rooms/stray@1x.webp']) put('graftwork/assets/ward/' + f, 'x');
  put('graftwork/design/NOTES.md', 'See tools/graftwork_known.mjs.');
  put('tests/graftwork_a.test.mjs', "import { testOnly, testOnlyButUsed, gone } from '../graftwork/lib.js';\nimport './graftwork_missing.mjs';\nconst ok = !/" + DASH + "/.test('x') && !'y'.includes('" + DASH + "'); // looks for the character\nconsole.log(testOnly, testOnlyButUsed, gone, ok);");
  // a tool that loads modules by path under an alias; it also has an identifier and a foreign property with the names of two exports it does NOT take
  put('tools/graftwork_known.mjs', "const load = (p) => import(new URL('../' + p, import.meta.url)); const m = await load('graftwork/lazy.js'), L = await load('graftwork/lib.js');\nconst usesIt = 3, other = { neverImported: 1 }; console.log(m.lazyTwo, L.testOnly, usesIt, other.neverImported);");
  put('tools/graftwork_forgotten.mjs', 'console.log(1);');
  const f = audit(tmp);
  const has = (list, x) => assert.ok(f[list].some((e) => e.includes(x)), `${list} should hold ${x}: ${JSON.stringify(f[list])}`);
  const hasNot = (list, x) => assert.ok(!f[list].some((e) => e.includes(x)), `${list} should not hold ${x}: ${JSON.stringify(f[list])}`);

  t('reachability: index.html, sw.js (importScripts, register) and lab pages are the roots', () => {
    assert.deepEqual(f.unreachable, ['graftwork/orphan.js']);
    assert.deepEqual(f.labOnly, ['graftwork/labonly.js']);
  });
  t('exports: named, renamed, star, barrel, namespace (dotted and computed), default, dynamic and path-named uses all count', () => {
    for (const x of ['lib.js:used', 'lib.js:renamed', 'star.js:viaStar', 'deep.js:again', 'ns.js:dotted', 'ns.js:drawA', 'ns.js:drawB', 'screen.js:default', 'lazy.js:lazyOne']) for (const l of ['unusedExports', 'testOnlyDead', 'exportOnlyOwnFile']) hasNot(l, x);
    for (const x of ['lib.js:neverImported', 'lib.js:usesIt', 'star.js:starUnused', 'deep.js:never', 'ns.js:other', 'orphan.js:lost']) has('unusedExports', x);
    has('unusedExports', 'barrel.js:never (re-export)');
    has('exportOnlyOwnFile', 'lib.js:onlyHere');
    has('testOnlyDead', 'lib.js:testOnly'); hasNot('testOnlyDead', 'testOnlyButUsed'); has('testOnlyExports', 'lib.js:testOnlyButUsed');
    has('testOnlyDead', 'lazy.js:lazyTwo'); // only the tool that loads the file by path takes it (alias.name); its own `usesIt` and `other.neverImported` are not uses
    hasNot('unusedExports', 'handed.js:reached'); has('unusedExports', 'handed.js:unreached'); // a namespace handed on as a value is reached by property name
  });
  t('locals: a top level name nothing references is listed, a referenced one is not', () => {
    has('unreferencedLocals', 'main.js:deadConst'); has('unreferencedLocals', 'main.js:deadFn');
    for (const x of ['main.js:liveFn', 'main.js:clamp', 'lib.js:helper', 'lib.js:b']) hasNot('unreferencedLocals', x);
  });
  t('assets: a manifest entry without a file, frame stems, a file named in code, an orphan', () => {
    assert.ok(f.missingAssets.some((e) => e.includes('rooms/a@2x.webp')), JSON.stringify(f.missingAssets));
    assert.ok(f.missingAssets.some((e) => e.includes('m_atk2@3x.webp')), 'hi3x battle frames need @3x');
    assert.equal(f.missingAssets.length, 2);
    assert.deepEqual(f.orphanAssets, ['graftwork/assets/ward/actors/m_walk1@1x.webp', 'graftwork/assets/ward/actors/m_walk1@2x.webp', 'graftwork/assets/ward/rooms/stray@1x.webp'], 'a stray file, and the files of a walk list: only battle frames (atk, hit, die) are frames');
  });
  t('duplicate helpers: same name in two files, identical or not', () => {
    const c = f.duplicateDetail.find((d) => d.name === 'clamp'), tau = f.duplicateDetail.find((d) => d.name === 'TAU');
    assert.ok(c && c.identical && c.files.length === 2, JSON.stringify(c));
    assert.ok(tau && !tau.identical && tau.variants === 2, JSON.stringify(tau));
    has('duplicateHelpers', 'clamp@graftwork/main.js'); has('duplicateHelpers', 'TAU@graftwork/lab/lab.js');
  });
  t('em dashes: prose is a finding, a test naming the character in a regex or a string of dashes is not', () => {
    assert.deepEqual(f.emDashes, ['graftwork/lib.js:9']);
    assert.equal(f.emDashDetectors, 2);
  });
  t('imports that do not resolve, and tools nobody names', () => {
    assert.ok(f.brokenImports.some((e) => e.includes('{ gone }')), JSON.stringify(f.brokenImports));
    assert.ok(f.brokenImports.some((e) => e.includes('graftwork_missing.mjs')));
    assert.equal(f.brokenImports.length, 2);
    assert.deepEqual(f.unmentionedTools, ['tools/graftwork_forgotten.mjs']);
  });
  t('allowlist: a new finding and a stale entry both show', () => {
    const cmp = againstAllow(f, { unusedExports: ['graftwork/lib.js:neverImported', 'graftwork/lib.js:cleanedUpLongAgo'] });
    assert.deepEqual(cmp.unusedExports.stale, ['graftwork/lib.js:cleanedUpLongAgo']);
    assert.ok(cmp.unusedExports.fresh.includes('graftwork/lib.js:usesIt') && !cmp.unusedExports.fresh.includes('graftwork/lib.js:neverImported'));
  });
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ---------------------------------------------------------------- the real code base
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const found = audit(root);
const allow = JSON.parse(fs.readFileSync(path.join(root, ALLOW_FILE), 'utf8'));
const show = (list, k = 15) => list.slice(0, k).map((x) => '\n    ' + x).join('') + (list.length > k ? `\n    ... ${list.length - k} more` : '');

t('the lexer kept every file balanced', () => assert.deepEqual(found.lexWarnings, []));
for (const k of STRICT_LISTS) t(`strict: ${k} is empty`, () => assert.equal(found[k].length, 0, `${k}:${show(found[k])}`));
const cmp = againstAllow(found, allow);
for (const k of ALLOW_LISTS) {
  t(`allowlist: ${k} has no new finding (${cmp[k].n} known)`, () => assert.equal(cmp[k].fresh.length, 0, `new ${k} (fix them; the allowlist only shrinks):${show(cmp[k].fresh)}`));
  t(`allowlist: ${k} lists nothing that is gone`, () => assert.equal(cmp[k].stale.length, 0, `${k} entries that no longer exist (run: node tools/graftwork_hygiene.mjs --prune-allow):${show(cmp[k].stale)}`));
}
const c = found.counts;
console.log(`counts: ${c.sourceFiles} source files, ${c.assetFiles} asset files; ` + STRICT_LISTS.map((k) => `${k} ${found[k].length}`).join(', ') + '; ' + ALLOW_LISTS.map((k) => `${k} ${found[k].length}`).join(', ')
  + `; duplicate helper names ${found.duplicateDetail.length}; exports only tests import but their file uses ${found.testOnlyExports.length}; files reached only from a lab page ${found.labOnly.length}; em dash detectors in tests ${found.emDashDetectors}`);
console.log(`graftwork hygiene: ${n} checks passed`);
