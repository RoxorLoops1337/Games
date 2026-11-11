// Hygiene gate for the Graftwork cleanup (graftwork/design/CLEANUP_PLAN.md, phase 0; the audit is tools/graftwork_hygiene.mjs).
// Outright (must be empty): files nothing reaches, manifest entries without a file, em dashes, imports that do not resolve.
// Against tests/graftwork_hygiene_allow.json (today's known junk): unused exports, exports only tests keep alive, `export` on
// names used only in their own file, top level names nothing references, duplicate small helpers, orphan asset files, tools no
// doc names. A NEW finding fails, and so does a listed finding that is gone from the code: the list can only shrink
// (`node tools/graftwork_hygiene.mjs --prune-allow` drops what was cleaned up). An entry kept on purpose carries a written reason in the
// file's `reasons` map; a reason whose entry is gone fails too.
// The first half proves on a throwaway repo (in the system temp folder) that each check really fires.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { audit, againstAllow, lex, staleReasons, unexplained, ALLOW_LISTS, STRICT_LISTS, ALLOW_FILE } from '../tools/graftwork_hygiene.mjs';

let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };
const DASH = String.fromCharCode(0x2014), EN = String.fromCharCode(0x2013);

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
  // line 2: an en dash written out; line 3: a dash as an escape (u2014); line 4: built at run time (fromCharCode): none can be seen as the character
  put('graftwork/star.js', ["export const viaStar = 1; export const starUnused = 2;", `// an en dash ${EN} in a comment`, 'const e1 = "a\\u2014b";', 'const e2 = String.fromCharCode(0x2014); const e3 = "&mdash;";'].join('\n'));
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
  put('tools/graftwork_known.mjs', `// a tool whose prose has an en dash ${EN} too\nconst load = (p) => import(new URL('../' + p, import.meta.url)); const m = await load('graftwork/lazy.js'), L = await load('graftwork/lib.js');\nconst usesIt = 3, other = { neverImported: 1 }; console.log(m.lazyTwo, L.testOnly, usesIt, other.neverImported);`);
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
  t('em and en dashes: prose is a finding, so is an escape in the game; a test naming the character in a regex or a string of dashes is not', () => {
    assert.deepEqual(f.emDashes, ['graftwork/lib.js:9', 'graftwork/star.js:2', 'graftwork/star.js:3', 'graftwork/star.js:4', 'tools/graftwork_known.mjs:1']);
    assert.equal(f.emDashDetectors, 2);
  });
  t('imports that do not resolve, and tools nobody names', () => {
    assert.ok(f.brokenImports.some((e) => e.includes('{ gone }')), JSON.stringify(f.brokenImports));
    assert.ok(f.brokenImports.some((e) => e.includes('graftwork_missing.mjs')));
    assert.equal(f.brokenImports.length, 2);
    assert.deepEqual(f.unmentionedTools, ['tools/graftwork_forgotten.mjs']);
  });
  t('allowlist reasons: a reason must name a listed entry; an entry without one is counted', () => {
    const allow = { unusedExports: ['a.js:x', 'a.js:y'], reasons: { 'a.js:x': 'kept on purpose', 'a.js:gone': 'left over' } };
    assert.deepEqual(staleReasons(allow), ['a.js:gone']); assert.deepEqual(unexplained(allow), ['a.js:y']);
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

// ---------------------------------------------------------------- the tools that write committed files
// Art builds, the icons, the offline manifest and a profile run all write files that are committed. None of them may start work for an argument it does
// not know: --help prints a page and touches nothing, an option that does not exist stops with a message (it once started a full art build that rewrote
// the committed manifest), and a build with no raw folder to read stops too. Each tool is run that way and everything it could rewrite is compared before
// and after: size and modification time of every file under its output folders, and `git status` when git is here.
{
  const run = (cmd, args, o = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', timeout: 60000, ...o });
  const python = run('python3', ['--version']).status === 0, pillow = python && run('python3', ['-c', 'import PIL']).status === 0;
  const snapshot = (rels) => {
    const out = [], walk = (f) => { const st = fs.statSync(f); if (st.isDirectory()) { for (const name of fs.readdirSync(f).sort()) walk(path.join(f, name)); } else out.push(`${path.relative(root, f)}:${st.size}:${st.mtimeMs}`); };
    for (const r of rels) if (fs.existsSync(path.join(root, r))) walk(path.join(root, r));
    return out.join('\n');
  };
  const gitStatus = () => { const r = run('git', ['status', '--porcelain', '--', 'graftwork', 'tools']); return r.status === 0 ? r.stdout : null; };
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'graftwork-noraw-'));
  const TOOLS = [
    { name: 'tools/graftwork_art_build.py', run: ['python3', ['tools/graftwork_art_build.py']], needs: python, out: ['graftwork/assets/ward'], more: [['--dry'], ['--combat', empty], [empty]] },
    { name: 'tools/graftwork_kit_build.py', run: ['python3', ['tools/graftwork_kit_build.py']], needs: python, out: ['graftwork/assets/ward_kit'], more: [[empty], ['one', 'two']] },
    { name: 'tools/graftwork_icons.py', run: ['python3', ['tools/graftwork_icons.py']], needs: python, out: ['graftwork/icons'], more: [['anything']] },
    { name: 'tools/graftwork_rig_build.py', run: ['python3', ['-I', 'tools/graftwork_rig_build.py']], needs: pillow, out: ['graftwork/assets/rigs'], more: [] },
    { name: 'tools/graftwork_sw_build.mjs', run: [process.execPath, ['tools/graftwork_sw_build.mjs']], needs: true, out: ['graftwork/sw-manifest.json'], more: [] },
    { name: 'tools/graftwork_profile.mjs', run: [process.execPath, ['tools/graftwork_profile.mjs']], needs: true, out: ['graftwork/design'], more: [] },
  ];
  try {
    for (const tool of TOOLS) {
      t(`tools: ${tool.name} prints a page for --help and -h, refuses an unknown option, and writes nothing either way` + (tool.needs ? '' : ' (skipped: Python or Pillow is missing)'), () => {
        if (!tool.needs) return;
        const [cmd, base] = tool.run, before = snapshot(tool.out), gitBefore = gitStatus();
        for (const flag of ['--help', '-h']) {
          const r = run(cmd, [...base, flag]);
          assert.equal(r.status, 0, `${tool.name} ${flag}: ${r.stderr}`); assert.match(r.stdout, /usage|Run:|Run\b|node tools|python3 tools/i, `${tool.name} ${flag} prints how to use it`);
        }
        const bad = run(cmd, [...base, '--no-such-option']);
        assert.ok(bad.status !== 0 && bad.status !== null, `${tool.name} --no-such-option must fail (status ${bad.status})`); assert.match(bad.stdout + bad.stderr, /no-such-option/, `${tool.name} names the option it refuses`);
        for (const args of tool.more) { const r = run(cmd, [...base, ...args]); assert.ok(r.status !== 0 && r.status !== null, `${tool.name} ${args.join(' ')} must stop before it writes (status ${r.status}): ${r.stdout}`); }
        assert.equal(snapshot(tool.out), before, `${tool.name} touched ${tool.out.join(', ')}`); if (gitBefore !== null) assert.equal(gitStatus(), gitBefore, `${tool.name} changed git status`);
      });
    }
  } finally { fs.rmSync(empty, { recursive: true, force: true }); }
}

t('the lexer kept every file balanced', () => assert.deepEqual(found.lexWarnings, []));
for (const k of STRICT_LISTS) t(`strict: ${k} is empty`, () => assert.equal(found[k].length, 0, `${k}:${show(found[k])}`));
const cmp = againstAllow(found, allow);
for (const k of ALLOW_LISTS) {
  t(`allowlist: ${k} has no new finding (${cmp[k].n} known)`, () => assert.equal(cmp[k].fresh.length, 0, `new ${k} (fix them; the allowlist only shrinks):${show(cmp[k].fresh)}`));
  t(`allowlist: ${k} lists nothing that is gone`, () => assert.equal(cmp[k].stale.length, 0, `${k} entries that no longer exist (run: node tools/graftwork_hygiene.mjs --prune-allow):${show(cmp[k].stale)}`));
}
t('allowlist: every written reason names a listed entry', () => assert.deepEqual(staleReasons(allow), [], 'reasons for entries that are gone (node tools/graftwork_hygiene.mjs --prune-allow drops them)'));
const c = found.counts;
console.log(`counts: ${c.sourceFiles} source files, ${c.assetFiles} asset files; ` + STRICT_LISTS.map((k) => `${k} ${found[k].length}`).join(', ') + '; ' + ALLOW_LISTS.map((k) => `${k} ${found[k].length}`).join(', ')
  + `; allowlist entries without a written reason ${unexplained(allow).length}; duplicate helper names ${found.duplicateDetail.length}; exports only tests import but their file uses ${found.testOnlyExports.length}; files reached only from a lab page ${found.labOnly.length}; em dash detectors in tests ${found.emDashDetectors}`);
console.log(`graftwork hygiene: ${n} checks passed`);
