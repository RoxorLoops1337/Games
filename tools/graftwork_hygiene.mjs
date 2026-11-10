#!/usr/bin/env node
// Hygiene audit of the Graftwork code base (graftwork/design/CLEANUP_PLAN.md, phase 0). Read only.
//
//   node tools/graftwork_hygiene.mjs              the report
//   node tools/graftwork_hygiene.mjs --json       every finding as JSON
//   node tools/graftwork_hygiene.mjs --list unusedExports     one list, one finding per line (the names are the keys of the JSON)
//   node tools/graftwork_hygiene.mjs --prune-allow            drop entries of tests/graftwork_hygiene_allow.json that no longer exist
//   node tools/graftwork_hygiene.mjs --init-allow             write the allowlist from today's findings (only when the file is missing)
//   node tools/graftwork_hygiene.mjs --root <repo dir>        audit another checkout
//
// Comments, strings, template text and regex literals are removed before any name is matched (lex below). Imports are resolved for
// real: named imports, `export { a as b }`, re-exports and `export *` chains, default exports, namespace imports (`NS.name`, and
// computed `NS['draw' + kind]` by prefix or suffix), dynamic import() with a literal or a template path, importScripts and
// serviceWorker.register. A file that names a module only by path (a tool that loads `graftwork/engine/run.js` through a helper)
// takes what it reads under that alias (`RUN.newRun`) or destructures; a namespace handed on as a value (`flow = { RUN }`) is
// reached by any property access of that name in any file. A bare identifier with the name of an export is never a use.
//
// Checks (tests/graftwork_hygiene.test.mjs enforces 1, 6 "entries exist", 8 and 9 "imports exist" outright; the lists marked * are
// held against tests/graftwork_hygiene_allow.json, which may only shrink):
//   1 unreachable        every .js / .mjs under graftwork/ is reachable from index.html, sw.js or a lab page
//   2 unusedExports*     exported, imported by nothing (game, lab, tests, tools), not used in its own file: dead
//   3 testOnlyDead*      imported only by tests or tools and not used in its own file: code that only tests keep alive
//   4 exportOnlyOwnFile* exported, imported by nothing, used in its own file: the `export` keyword is the only junk
//   5 unreferencedLocals* top level function / class / const / destructured name that nothing references
//   6 missingAssets      a manifest entry whose file does not exist;  orphanAssets*: a file under graftwork/assets nobody refers to
//   7 duplicateHelpers*  the same small helper (a function or a numeric constant) defined at the top level of several files
//   8 emDashes           an em dash anywhere in graftwork/, tests/graftwork*, tools/graftwork* (a test may name the character to look
//                        for it, in a regex literal or a string of dashes: counted apart as emDashDetectors)
//   9 brokenImports      an import whose file or exported name does not exist;  unmentionedTools*: a tool no doc or script names
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ALLOW_FILE = 'tests/graftwork_hygiene_allow.json';
// the lists the allowlist covers (the test fails on a new entry and on a stale one)
export const ALLOW_LISTS = ['unusedExports', 'testOnlyDead', 'exportOnlyOwnFile', 'unreferencedLocals', 'duplicateHelpers', 'orphanAssets', 'unmentionedTools'];
// the lists that must be empty
export const STRICT_LISTS = ['unreachable', 'missingAssets', 'emDashes', 'brokenImports'];
const EM_DASH = '\u2014';

// ---------------------------------------------------------------- lexer
// Returns { bare, code, strings, regexes }. `bare` and `code` have the length of `src`, so offsets agree:
//   code: comments blanked.   bare: comments, string contents, template text and regex bodies blanked (the quotes stay).
//   strings: { start, end, value, tpl } for every string and template literal (a template's `${...}` parts read as `${}`).
//   regexes: { start, end } of every regex literal.
const KW_BEFORE_REGEX = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
const isIdStart = (c) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$';
const isIdChar = (c) => isIdStart(c) || (c >= '0' && c <= '9');
export function lex(src) {
  const n = src.length, bare = src.split(''), code = src.split(''), strings = [], regexes = [];
  const blank = (arr, a, b) => { for (let i = a; i < b; i++) if (arr[i] !== '\n') arr[i] = ' '; };
  let prev = 'op'; // what came before: 'op' (a regex may start here) or 'value' (a slash is a division)
  function template(start) { // start: the character after the opening backtick; returns the index after the closing one
    let j = start, seg = start, raw = '';
    while (j < n) {
      const c = src[j];
      if (c === '\\') { j += 2; continue; }
      if (c === '`') { blank(bare, seg, j); raw += src.slice(seg, j); strings.push({ start: start - 1, end: j + 1, value: raw, tpl: true }); return j + 1; }
      if (c === '$' && src[j + 1] === '{') { blank(bare, seg, j); raw += src.slice(seg, j) + '${}'; j = run(j + 2, true); seg = j; continue; }
      j++;
    }
    return n;
  }
  function run(start, inTemplate) { // lexes code; inside `${ }` it returns the index after the closing brace
    let j = start, depth = 0;
    while (j < n) {
      const c = src[j];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { j++; continue; }
      if (c === '/' && src[j + 1] === '/') { let e = src.indexOf('\n', j); if (e < 0) e = n; blank(bare, j, e); blank(code, j, e); j = e; continue; }
      if (c === '/' && src[j + 1] === '*') { let e = src.indexOf('*/', j + 2); e = e < 0 ? n : e + 2; blank(bare, j, e); blank(code, j, e); j = e; continue; }
      if (c === '"' || c === '\'') {
        let k = j + 1;
        while (k < n && src[k] !== c && src[k] !== '\n') { if (src[k] === '\\') k++; k++; }
        strings.push({ start: j, end: k + 1, value: src.slice(j + 1, k), tpl: false }); blank(bare, j + 1, k); j = k + 1; prev = 'value'; continue;
      }
      if (c === '`') { j = template(j + 1); prev = 'value'; continue; }
      if (c === '/') {
        if (prev === 'op') { // a regex literal: to the closing slash on this line, character classes may hold a slash
          let k = j + 1, cls = false;
          while (k < n && src[k] !== '\n') { const d = src[k]; if (d === '\\') { k += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; k++; }
          let e = Math.min(n, k + 1); while (e < n && isIdChar(src[e])) e++;
          blank(bare, j + 1, k); regexes.push({ start: j, end: e }); j = e; prev = 'value'; continue;
        }
        j++; prev = 'op'; continue;
      }
      if (isIdStart(c)) { let k = j + 1; while (k < n && isIdChar(src[k])) k++; prev = KW_BEFORE_REGEX.has(src.slice(j, k)) ? 'op' : 'value'; j = k; continue; }
      if (c >= '0' && c <= '9') { let k = j + 1; while (k < n && (isIdChar(src[k]) || src[k] === '.')) k++; prev = 'value'; j = k; continue; }
      if (c === '{') { depth++; prev = 'op'; j++; continue; }
      if (c === '}') { if (inTemplate && depth === 0) return j + 1; depth--; prev = 'op'; j++; continue; }
      prev = c === ')' || c === ']' ? 'value' : 'op'; j++;
    }
    return n;
  }
  run(0, false);
  return { bare: bare.join(''), code: code.join(''), strings, regexes };
}

// ---------------------------------------------------------------- one file: tokens, top level declarations, imports, exports
const squash = (s) => s.replace(/\s+/g, '');
function matchClose(text, open, from) { // index of the bracket that closes text[open]
  const o = text[open], c = o === '(' ? ')' : o === '[' ? ']' : '}';
  let d = 0;
  for (let i = open; i < text.length; i++) { const ch = text[i]; if (ch === o) d++; else if (ch === c) { d--; if (d === 0) return i; } }
  return from === undefined ? text.length - 1 : from;
}
const STMT_START = /^(?:const|let|var|function|class|export|import|if|for|while|switch|return|try|async)\b/;
function parseFile(rel, src) {
  const { bare, code, strings, regexes } = lex(src), n = bare.length;
  const F = { rel, src, bare, code, strings, regexes, tokens: new Map(), decls: [], exports: new Map(), stars: [], imports: [], holds: new Map(), nested: [], lexOk: true };
  for (const m of bare.matchAll(/[A-Za-z_$][\w$]*/g)) F.tokens.set(m[0], (F.tokens.get(m[0]) || 0) + 1);
  // bracket depth before each character (all three kinds)
  const depth = new Int32Array(n + 1); let d = 0;
  for (let i = 0; i < n; i++) { depth[i] = d; const c = bare[i]; if (c === '{' || c === '(' || c === '[') d++; else if (c === '}' || c === ')' || c === ']') d--; }
  depth[n] = d; if (d !== 0) F.lexOk = false;
  const prevSig = (i) => { let k = i - 1; while (k >= 0 && /\s/.test(bare[k])) k--; return k < 0 ? '' : bare[k]; };
  const specs = new Set(); F.specs = specs; // strings that are import / export specifiers (not "a module named by path")
  const strAt = (pos) => { const s = strings.find((q) => q.start === pos) || null; if (s) specs.add(s.start); return s; };
  const nextNonSpace = (i) => { while (i < n && /\s/.test(bare[i])) i++; return i; };
  // ---- declarations: the top level ones (F.decls), and nested function-like ones (F.nested, only for the duplicate helper check)
  const declRe = /\b(export\s+)?(default\s+)?(async\s+)?(function\s*\*?|class|const|let|var)(?=[\s({[*])/g;
  for (const m of bare.matchAll(declRe)) {
    const at = m.index, nested = depth[at] !== 0;
    if (nested && (m[1] || bare[at - 1] === '.')) continue;
    const p = prevSig(at); if (p && !';})'.includes(p) && !/[\w$'"`\]]/.test(p)) continue; // `x = function () {}` is an expression
    if (p && /[\w$'"`\]]/.test(p) && !/\n\s*$/.test(bare.slice(Math.max(0, at - 200), at))) continue;
    if (nested && p === ')') continue; // `for (...) const` does not exist; `if (x) function` is not worth the risk
    const exported = !!m[1], isDefault = !!m[2], kw = m[4].replace(/\s+/g, '');
    let i = nextNonSpace(at + m[0].length);
    if (kw.startsWith('function') || kw === 'class') {
      const nm = /^[A-Za-z_$][\w$]*/.exec(bare.slice(i, i + 80)), name = nm ? nm[0] : null;
      const brace = bare.indexOf('{', kw === 'class' ? i : matchClose(bare, bare.indexOf('(', i)) + 1), end = brace < 0 ? i : matchClose(bare, brace) + 1;
      if (name && nested) { if (kw !== 'class') F.nested.push({ name, kind: 'function', at, end }); continue; }
      if (name) F.decls.push({ name, kind: kw === 'class' ? 'class' : 'function', exported, at, end, fnLike: kw !== 'class', small: kw !== 'class' });
      if (exported) { if (isDefault) F.exports.set('default', { local: name, at }); else if (name) F.exports.set(name, { local: name, at }); }
      continue;
    }
    // const / let / var: one or more declarators
    for (let guard = 0; guard < 200; guard++) {
      i = nextNonSpace(i);
      let names = [], nameEnd = i;
      if (bare[i] === '{' || bare[i] === '[') { // a destructuring pattern: the binding names are the identifiers not followed by a colon
        nameEnd = matchClose(bare, i) + 1;
        for (const q of bare.slice(i, nameEnd).matchAll(/[A-Za-z_$][\w$]*/g)) { const after = bare.slice(i + q.index + q[0].length, nameEnd).trimStart()[0]; if (after !== ':') names.push(q[0]); }
      } else { const nm = /^[A-Za-z_$][\w$]*/.exec(bare.slice(i, i + 80)); if (!nm) break; names = [nm[0]]; nameEnd = i + nm[0].length; }
      let j = nextNonSpace(nameEnd), initAt = -1, more = false;
      if (bare[j] === '=' && bare[j + 1] !== '=') { j++; initAt = j; }
      // to the comma or the end of the statement at this level
      for (; j < n; j++) {
        const c = bare[j];
        if (c === '(' || c === '[' || c === '{') { j = matchClose(bare, j); continue; }
        if (c === ';' || c === ')' || c === ']' || c === '}') break; // a closing bracket: the end of the enclosing block (nested declarations)
        if (c === ',') { more = true; break; }
        if (c === '\n') { const k = nextNonSpace(j); if (k >= n || (STMT_START.test(bare.slice(k, k + 12)) && !/[=+\-*/%&|^?:,.(<>]$/.test(bare.slice(0, j).trimEnd()))) break; }
      }
      const init = initAt >= 0 ? bare.slice(initAt, j) : '';
      const fnLike = /^\s*(?:async\s*)?(?:\([^()]*\)|\([^)]*\([^)]*\)[^)]*\)|[A-Za-z_$][\w$]*)\s*=>/.test(init) || /^\s*(?:async\s+)?function\b/.test(init);
      const numeric = initAt >= 0 && /^[\s\d.eE+\-*/()]*(?:Math\.(?:PI|SQRT2|E|LN2)[\s\d.eE+\-*/()]*)*$/.test(init) && /\d|Math/.test(init);
      for (const name of names) {
        if (nested) { if (fnLike && names.length === 1) F.nested.push({ name, kind: kw, at, initAt, end: j }); continue; }
        F.decls.push({ name, kind: kw, exported, at, initAt, end: j, fnLike, small: names.length === 1 && (fnLike || numeric) });
        if (exported) F.exports.set(name, { local: name, at });
      }
      if (!more) break;
      i = j + 1;
    }
  }
  // ---- export lists, re-exports, default expressions
  for (const m of bare.matchAll(/\bexport\s*\{([^}]*)\}\s*(from\s*)?/g)) {
    if (depth[m.index] !== 0) continue;
    const from = m[2] ? strAt(nextNonSpace(m.index + m[0].length)) : null;
    for (const part of m[1].split(',')) {
      const t = part.trim(); if (!t) continue;
      const [local, as] = t.split(/\s+as\s+/).map((x) => x.trim()), name = as || local;
      F.exports.set(name, from ? { from: from.value, imported: local, at: m.index } : { local, at: m.index, listed: true });
    }
  }
  for (const m of bare.matchAll(/\bexport\s*\*\s*(?:as\s+([\w$]+)\s+)?from\s*/g)) {
    const s = strAt(nextNonSpace(m.index + m[0].length)); if (!s) continue;
    if (m[1]) F.exports.set(m[1], { from: s.value, imported: '*', at: m.index }); else F.stars.push(s.value);
  }
  for (const m of bare.matchAll(/\bexport\s+default\b/g)) { if (depth[m.index] === 0 && !F.exports.has('default')) F.exports.set('default', { local: null, at: m.index }); }
  // ---- imports
  for (const m of bare.matchAll(/\bimport\b\s*([^'"`;()]*?)\s*(?:from\s*)?(?=['"])/g)) {
    if (depth[m.index] !== 0) continue;
    const s = strAt(nextNonSpace(m.index + m[0].length)); if (!s) continue;
    const clause = m[1].trim(), imp = { spec: s.value, named: [], ns: null, def: null, at: m.index };
    if (clause) {
      const braces = /\{([^}]*)\}/.exec(clause), rest = clause.replace(/\{[^}]*\}/, '');
      if (braces) for (const part of braces[1].split(',')) { const t = part.trim(); if (!t) continue; const [a, b] = t.split(/\s+as\s+/).map((x) => x.trim()); imp.named.push({ imported: a, local: b || a }); }
      const ns = /\*\s*as\s+([\w$]+)/.exec(rest); if (ns) imp.ns = ns[1];
      const def = /^\s*([A-Za-z_$][\w$]*)/.exec(rest.replace(/\*\s*as\s+[\w$]+/, '')); if (def && def[1] !== 'from') imp.def = def[1];
    }
    F.imports.push(imp);
  }
  // dynamic import(...), importScripts(...), serviceWorker.register(...), new Worker(...): a literal or a template path
  for (const m of bare.matchAll(/\b(import|importScripts|register|Worker)\s*\(\s*/g)) {
    let i = m.index + m[0].length;
    for (let guard = 0; guard < 8; guard++) {
      const s = strAt(i); if (!s) break;
      if (m[1] !== 'register' || /\.m?js$/.test(s.value)) F.imports.push({ spec: s.value, tpl: s.tpl, named: [], ns: null, def: null, dynamic: m[1], at: m.index, strAt: s.start });
      i = nextNonSpace(s.end); if (m[1] !== 'importScripts' || bare[i] !== ',') break; i = nextNonSpace(i + 1);
    }
  }
  return F;
}

// ---------------------------------------------------------------- the audit
const walk = (dir, out = []) => { if (!fs.existsSync(dir)) return out; for (const n of fs.readdirSync(dir).sort()) { const p = path.join(dir, n), st = fs.statSync(p); if (st.isDirectory()) { if (n !== 'node_modules' && n !== '.git') walk(p, out); } else out.push(p); } return out; };
const posix = (p) => p.split(path.sep).join('/');
export function audit(root = REPO, opts = {}) { // opts.ignore: repo-relative files to leave out (what would the lists be without that tool?)
  const rel = (p) => posix(path.relative(root, p)), abs = (r) => path.join(root, r);
  const G = abs('graftwork');
  const gameFiles = walk(G).filter((f) => /\.m?js$/.test(f) && !rel(f).startsWith('graftwork/assets/')).map(rel);
  const named = (dir) => (fs.existsSync(abs(dir)) ? fs.readdirSync(abs(dir)).filter((n) => /^(run_)?graftwork/.test(n)).sort().map((n) => dir + '/' + n) : []);
  const skip = new Set(opts.ignore || []);
  const testFiles = named('tests').filter((f) => /\.m?js$/.test(f) && !skip.has(f)), toolFiles = named('tools').filter((f) => !skip.has(f));
  const files = new Map();
  for (const r of [...gameFiles, ...testFiles, ...toolFiles.filter((f) => /\.m?js$/.test(f))]) files.set(r, parseFile(r, fs.readFileSync(abs(r), 'utf8')));
  const cls = (r) => (r.startsWith('graftwork/lab/') ? 'lab' : r.startsWith('graftwork/') ? 'game' : r.startsWith('tests/') ? 'test' : 'tool');
  const isGame = (r) => r.startsWith('graftwork/');

  // ---- resolve specifiers
  const brokenImports = [];
  const resolveSpec = (from, spec0, bareIsRelative) => { // -> rel path of a file in the repo, or null (a node builtin, a package)
    const spec = spec0.replace(/[?#].*$/, ''); // `audio.js?v=3` is audio.js
    if (bareIsRelative && !spec.startsWith('.') && !spec.startsWith('/') && !/^[a-z]+:/.test(spec)) return posix(path.normalize(path.join(path.dirname(from), spec))); // importScripts('x.js'), register('sw.js'): relative to the file
    if (spec.startsWith('.')) return posix(path.normalize(path.join(path.dirname(from), spec)));
    if (spec.startsWith('/')) return posix(path.normalize(spec.slice(1)));
    return null;
  };
  const tplMatches = (from, pattern) => { // a template path: every known file it can name
    const esc = pattern.split('${}').map((s) => s.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('[^/]+'), out = [];
    const re = new RegExp('^' + esc + '$');
    for (const r of files.keys()) { const local = posix(path.relative(path.dirname(from), r)); if (re.test(local) || re.test('./' + local) || re.test('/' + r) || re.test(r)) out.push(r); }
    return out;
  };
  for (const F of files.values()) {
    for (const imp of F.imports) {
      if (imp.tpl && imp.spec.includes('${}')) { imp.targets = tplMatches(F.rel, imp.spec); continue; }
      const r = resolveSpec(F.rel, imp.spec, !!imp.dynamic && imp.dynamic !== 'import');
      if (!r) { imp.targets = []; continue; }
      imp.targets = [r];
      if (!fs.existsSync(abs(r))) { imp.targets = []; if (!imp.dynamic || imp.dynamic === 'import') brokenImports.push(`${F.rel}: imports ${imp.spec}, which does not exist`); }
    }
    for (const e of F.exports.values()) if (e.from) e.target = resolveSpec(F.rel, e.from);
    F.starTargets = F.stars.map((s) => resolveSpec(F.rel, s)).filter(Boolean);
    // a module named only by path in a string (a loader helper, a fetch of the source): the file "holds" it
    for (const s of F.strings) {
      if (s.tpl || F.specs.has(s.start) || !/\.m?js$/.test(s.value) || s.value.length > 200) continue;
      for (const cand of [resolveSpec(F.rel, s.value.startsWith('.') || s.value.startsWith('/') ? s.value : './' + s.value), posix(path.normalize(s.value)), 'graftwork/' + s.value]) if (cand && files.has(cand) && cand !== F.rel) { if (!F.holds.has(cand)) F.holds.set(cand, s.start); break; }
    }
  }
  const starClosure = (r, seen = new Set()) => { if (seen.has(r) || !files.has(r)) return seen; seen.add(r); for (const t of files.get(r).starTargets) starClosure(t, seen); return seen; };
  // where an exported name really lives: follows `export { a as b } from` and `export *`
  const origin = (r, name, seen = new Set()) => {
    const key = r + ':' + name; if (seen.has(key) || !files.has(r)) return null; seen.add(key);
    const F = files.get(r), e = F.exports.get(name);
    if (e) { if (e.from && e.target && e.imported !== '*') return origin(e.target, e.imported, seen) || { file: r, name }; return { file: r, name }; }
    for (const t of F.starTargets) { const o = origin(t, name, seen); if (o) return o; }
    return null;
  };
  const allExports = (r) => { const out = new Set(); for (const m of starClosure(r)) for (const k of files.get(m).exports.keys()) out.add(k); return out; };

  // ---- who uses which export
  const users = new Map(); // 'file:name' -> Set of consumer files
  const use = (o, by) => { if (!o || o.file === by) return; const k = o.file + ':' + o.name; if (!users.has(k)) users.set(k, new Set()); users.get(k).add(by); };
  const useAllNamed = (F, target, test) => { for (const m of starClosure(target)) for (const name of files.get(m).exports.keys()) if (test(name)) { use(origin(m, name), F.rel); use({ file: m, name }, F.rel); } };
  const escapes = []; // namespaces handed on as a value: [module]
  // A file may hold a module loosely: by a dynamic import, by a path in a string (a loader helper), or through a namespace another
  // file handed on (`flow = { RUN, META }`, `app.chrome = CH`: then any file may reach it, under any property name, so every file is
  // judged by the careful fallback below). Which exports does it take?
  //   - destructured on the spot: `const { boot } = await import('../graftwork/main.js')` -> exactly those names;
  //   - under an alias: `const RUN = await import(...)`, `{ RUN: 'graftwork/engine/run.js' }`, `M.ASSETS = await imp(...)` -> every
  //     `RUN.name` in the file (also `E.RUN.name`), and names destructured from an expression that mentions the alias;
  //   - neither: any property access `.name` or destructured key in the file (the careful fallback).
  // A bare identifier of the same name never counts: it is the file's own.
  const idRe = (name) => name.replace(/[$]/g, '\\$');
  const keysOf = (pattern) => pattern.split(',').map((part) => (/^\s*(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)/.exec(part) || [])[1]).filter(Boolean);
  const looseCache = new Map(), aliasCache = new Map();
  const loose = (F) => {
    let set = looseCache.get(F.rel);
    if (!set) {
      set = new Set(); looseCache.set(F.rel, set);
      for (const m of F.bare.matchAll(/\.\s*([A-Za-z_$][\w$]*)/g)) set.add(m[1]);
      for (const m of F.bare.matchAll(/\{([^{}]*)\}\s*(?:=(?![=>])|\)\s*=>)/g)) for (const k of keysOf(m[1])) set.add(k);
    }
    return set;
  };
  const viaAlias = (F, alias) => {
    const key = F.rel + '|' + alias; let set = aliasCache.get(key);
    if (!set) {
      set = new Set(); aliasCache.set(key, set);
      for (const m of F.bare.matchAll(new RegExp('(?<![\\w$])' + idRe(alias) + '\\s*\\.\\s*([A-Za-z_$][\\w$]*)', 'g'))) set.add(m[1]);
      const word = new RegExp('(?<![\\w$])' + idRe(alias) + '(?![\\w$])');
      for (const m of F.bare.matchAll(/\{([^{}]*)\}\s*=(?![=>])([^;\n]{0,160})/g)) if (word.test(m[2])) for (const k of keysOf(m[1])) set.add(k);
    }
    return set;
  };
  // the names file F takes from the module it names at string offset `at` (see above)
  const takes = (F, at) => {
    const before = F.bare.slice(Math.max(0, at - 400), at);
    const d = /\{([^{}]*)\}\s*=\s*(?:await\s+)?(?:[\w$.]+\s*\(\s*)?$/.exec(before);
    if (d) return new Set(keysOf(d[1]));
    const a = /([A-Za-z_$][\w$]*)\s*[:=]\s*(?:await\s+)?(?:[\w$.]+\s*\(\s*)?$/.exec(before);
    return a ? viaAlias(F, a[1]) : loose(F);
  };
  for (const F of files.values()) {
    for (const imp of F.imports) {
      for (const t of imp.targets || []) {
        if (!files.has(t)) continue;
        for (const nm of imp.named) {
          const o = origin(t, nm.imported);
          if (!o) brokenImports.push(`${F.rel}: imports { ${nm.imported} } from ${imp.spec}, which does not export it`);
          else { use(o, F.rel); use({ file: t, name: nm.imported }, F.rel); }
        }
        if (imp.def) { if (!origin(t, 'default')) brokenImports.push(`${F.rel}: imports the default export of ${imp.spec}, which has none`); use({ file: t, name: 'default' }, F.rel); }
        if (imp.ns) {
          const NS = imp.ns.replace(/[$]/g, '\\$'), props = new Set(); let computedAll = false, escaped = false;
          const pre = [], suf = [];
          for (const m of F.bare.matchAll(new RegExp('(?<![\\w$.])' + NS + '(?![\\w$])\\s*(.)?', 'g'))) {
            const after = m[1] || '';
            if (after === '.') { const q = /^[A-Za-z_$][\w$]*/.exec(F.bare.slice(m.index + m[0].length).trimStart()); if (q) props.add(q[0]); }
            else if (after === '[') { // NS[...]: an exact string, a prefix + something, something + a suffix, or anything
              const open = m.index + m[0].length - 1, close = matchClose(F.bare, open), inner = F.strings.filter((s) => s.start > open && s.end <= close);
              const expr = F.bare.slice(open + 1, close).trim();
              if (inner.length === 1 && /^['"`]\s*['"`]$/.test(expr.replace(/\s+/g, ' ').replace(/(['"`]) +(['"`])/, '$1$2')) && !inner[0].value.includes('${}')) props.add(inner[0].value);
              else if (inner.length && inner[0].start === F.bare.indexOf(F.bare.slice(open + 1).trimStart()[0], open + 1) && inner[0].value) pre.push(inner[0].value.split('${}')[0]);
              else if (inner.length && inner[inner.length - 1].end === close - (F.bare.slice(0, close).length - F.bare.slice(0, close).trimEnd().length) && inner[inner.length - 1].value) suf.push(inner[inner.length - 1].value.split('${}').pop());
              else computedAll = true;
            } else if (!/^\s*\*\s*as\s+$/.test(F.bare.slice(Math.max(0, m.index - 12), m.index).replace(/^.*import/, '')) && !F.bare.slice(Math.max(0, m.index - 8), m.index).includes('as ')) escaped = true;
          }
          useAllNamed(F, t, (name) => computedAll || props.has(name) || pre.some((p) => p && name.startsWith(p)) || suf.some((p) => p && name.endsWith(p)));
          if (escaped) escapes.push(t);
        }
        if (imp.dynamic === 'import') { const names = takes(F, imp.strAt); useAllNamed(F, t, (name) => names.has(name)); } // const { a } = await import(...), const M = await import(...), (await import(...)).default
      }
    }
    for (const [t, at] of F.holds) { const names = takes(F, at); useAllNamed(F, t, (name) => names.has(name)); }
    // a re-export is not a use by itself (whoever imports the re-exported name reaches the origin above); `export * as ns from` hands on everything
    for (const e of F.exports.values()) if (e.from && e.target && files.has(e.target)) { if (e.imported === '*') useAllNamed(F, e.target, () => true); else if (!origin(e.target, e.imported)) brokenImports.push(`${F.rel}: re-exports ${e.imported} from ${e.from}, which does not export it`); }
  }
  // a namespace handed on (flow = { RUN, META }): every file may reach its exports through that object
  for (const t of new Set(escapes)) for (const F of files.values()) if (F.rel !== t) useAllNamed(F, t, (name) => loose(F).has(name));

  // ---- 1: reachability
  const edges = (r) => { const F = files.get(r), out = new Set(); if (!F) return out; for (const imp of F.imports) for (const t of imp.targets || []) out.add(t); for (const e of F.exports.values()) if (e.target) out.add(e.target); for (const t of F.starTargets) out.add(t); return out; };
  const reach = (roots) => { const seen = new Set(), st = [...roots]; while (st.length) { const r = st.pop(); if (seen.has(r) || !files.has(r)) continue; seen.add(r); for (const t of edges(r)) st.push(t); } return seen; };
  const htmlRoots = { game: [], lab: [] };
  for (const h of walk(G).filter((f) => f.endsWith('.html'))) {
    const text = fs.readFileSync(h, 'utf8'), kind = rel(h).startsWith('graftwork/lab/') ? 'lab' : 'game';
    for (const m of text.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/g)) htmlRoots[kind].push(posix(path.normalize(path.join(path.dirname(rel(h)), m[1]))));
    for (const m of text.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)) for (const q of m[1].matchAll(/\bfrom\s*['"]([^'"]+)['"]|\bimport\s*\(?\s*['"]([^'"]+)['"]/g)) { const s = q[1] || q[2]; if (s.startsWith('.')) htmlRoots[kind].push(posix(path.normalize(path.join(path.dirname(rel(h)), s)))); }
  }
  const fromGame = reach(htmlRoots.game), fromSw = reach(['graftwork/sw.js']), fromLab = reach(htmlRoots.lab);
  const unreachable = gameFiles.filter((f) => !fromGame.has(f) && !fromSw.has(f) && !fromLab.has(f));
  const labOnly = gameFiles.filter((f) => !fromGame.has(f) && !fromSw.has(f) && fromLab.has(f) && !f.startsWith('graftwork/lab/'));

  // ---- 2, 3, 4: exports
  const unusedExports = [], testOnlyDead = [], exportOnlyOwnFile = [], testOnlyExports = [], labOnlyExports = [];
  const ownUses = (F, e) => { // references to the local binding in its own file, beyond its declaration and an `export { }` mention
    if (!e.local) return 0;
    const declared = F.decls.some((d) => d.name === e.local) ? 1 : 0;
    return Math.max(0, (F.tokens.get(e.local) || 0) - declared - (e.listed ? 1 : 0));
  };
  for (const r of gameFiles) {
    const F = files.get(r);
    for (const [name, e] of F.exports) {
      if (e.from) continue; // a re-export is judged at its origin... and as a name of this file below
      const by = users.get(r + ':' + name) || new Set(), kinds = new Set([...by].map(cls));
      const key = `${r}:${name}`, own = name === 'default' ? 0 : ownUses(F, e);
      if (!by.size) { if (name === 'default') unusedExports.push(key); else (own ? exportOnlyOwnFile : unusedExports).push(key); }
      else if (!kinds.has('game') && !kinds.has('lab')) { (own ? testOnlyExports : testOnlyDead).push(key); }
      else if (!kinds.has('game') && !r.startsWith('graftwork/lab/')) labOnlyExports.push(key);
    }
    for (const [name, e] of F.exports) if (e.from && !(users.get(r + ':' + name) || new Set()).size) unusedExports.push(`${r}:${name} (re-export)`);
  }

  // ---- 5: top level names nothing references
  const unreferencedLocals = [];
  for (const r of gameFiles) {
    const F = files.get(r), listed = new Set([...F.exports.values()].filter((e) => e.local).map((e) => e.local));
    const seen = new Set();
    for (const d of F.decls) {
      if (d.exported || listed.has(d.name) || seen.has(d.name)) continue; seen.add(d.name);
      if ((F.tokens.get(d.name) || 0) <= F.decls.filter((x) => x.name === d.name).length) unreferencedLocals.push(`${r}:${d.name}`);
    }
  }

  // ---- 7: the same small helper in several files. Top level definitions count by name (identical or not); a helper defined inside
  // a function (a closure) counts only when the very same text stands under the same name in another file: a copy.
  const bodyOf = (F, d) => squash(F.code.slice(d.kind === 'function' ? d.at : d.initAt, d.end)).replace(/^export/, '').replace(/^(async)?function\*?[\w$]*/, 'function').replace(/;$/, '');
  const defs = new Map(); // name -> [{ file, body, nested }]
  const addDef = (name, x) => { if (!defs.has(name)) defs.set(name, []); defs.get(name).push(x); };
  for (const r of gameFiles) {
    const F = files.get(r), seen = new Set();
    for (const d of F.decls) {
      if (!d.small || d.name.length < 2 || seen.has(d.name)) continue;
      const body = bodyOf(F, d); if (body.length > 260) continue;
      seen.add(d.name); addDef(d.name, { file: r, body, nested: false });
    }
    for (const d of F.nested) {
      if (d.name.length < 2 || seen.has(d.name)) continue;
      const body = bodyOf(F, d); if (body.length > 260 || body.length < 24) continue;
      seen.add(d.name); addDef(d.name, { file: r, body, nested: true });
    }
  }
  const duplicateHelpers = [], duplicateDetail = [];
  for (const [name, all] of [...defs].sort((a, b) => b[1].length - a[1].length || (a[0] < b[0] ? -1 : 1))) {
    const copies = new Map(); for (const x of all) copies.set(x.body, (copies.get(x.body) || 0) + 1);
    const list = all.filter((x) => !x.nested || copies.get(x.body) > 1); // a closure only when it is a copy
    if (list.length < 2 || list.every((x) => x.nested) && new Set(list.map((x) => x.body)).size === list.length) continue;
    const groups = new Map(); for (const x of list) { if (!groups.has(x.body)) groups.set(x.body, []); groups.get(x.body).push(x.file); }
    duplicateDetail.push({ name, files: list.map((x) => x.file), identical: groups.size === 1, variants: groups.size, groups: [...groups.values()], nested: list.filter((x) => x.nested).map((x) => x.file) });
    for (const x of list) duplicateHelpers.push(`${name}@${x.file}`);
  }

  // ---- 6: assets
  const assetDir = abs('graftwork/assets'), assetFiles = walk(assetDir).map(rel).filter((f) => !f.endsWith('/manifest.json'));
  const referenced = new Set(), missingAssets = [];
  const manifests = walk(assetDir).map(rel).filter((f) => f.endsWith('/manifest.json'));
  const IMG = /\.(?:webp|png|jpe?g|svg|gif|avif)$/i;
  for (const mf of manifests) {
    const base = path.dirname(mf), need = (file, why) => { const r = posix(path.normalize(path.join(base, file))); referenced.add(r); if (!fs.existsSync(abs(r))) missingAssets.push(`${mf}: ${why} -> ${r} is missing`); };
    const data = JSON.parse(fs.readFileSync(abs(mf), 'utf8'));
    const visit = (v, where) => { // every string that names an image file, wherever it sits in the manifest
      if (typeof v === 'string') { if (IMG.test(v)) need(v, where); return; }
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) visit(v[k], where + '.' + k);
    };
    visit(data, '');
    // animation frames: stems without a size tag; every frame has @1x and @2x, the battle frames (atk, hit, die) also @3x when hi3x is set
    for (const [id, a] of Object.entries(data.actors || {})) {
      const f = a && a.frames; if (!f || typeof f !== 'object') continue;
      const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter((x) => typeof x === 'string');
      for (const st of list(f.walk)) for (const tag of ['@1x', '@2x']) need(`actors/${st}${tag}.webp`, `.actors.${id}.frames.walk`);
      for (const st of [...list(f.atk), ...list(f.hit), ...list(f.die)]) for (const tag of f.hi3x ? ['@1x', '@2x', '@3x'] : ['@1x', '@2x']) need(`actors/${st}${tag}.webp`, `.actors.${id}.frames`);
    }
  }
  // files named by a string in the code (a literal path, or a template whose fixed parts fit)
  for (const r of gameFiles) for (const s of files.get(r).strings) {
    if (!IMG.test(s.value) || s.value.length > 200) continue;
    const re = new RegExp('(?:^|/)' + s.value.split('${}').map((x) => x.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('[^/]*') + '$');
    for (const f of assetFiles) if (re.test(f)) referenced.add(f);
  }
  const orphanAssets = assetFiles.filter((f) => !referenced.has(f));

  // ---- 8: em dashes. A test or a tool may NAME the character to look for it: inside a regex literal, or as a string that is nothing but
  // dashes. Those are counted apart (emDashDetectors); anything else, and anything at all under graftwork/, is a finding.
  const emDashes = []; let emDashDetectors = 0;
  const detectorAt = (F, pos) => F.regexes.some((r) => pos > r.start && pos < r.end) || F.strings.some((q) => pos > q.start && pos < q.end && /^[\u2014\u2013-]+$/.test(q.value));
  const textFiles = [...walk(G).map(rel).filter((f) => /\.(?:m?js|md|html|json|webmanifest|css|txt|py|svg)$/.test(f)), ...named('tests'), ...toolFiles, ...walk(abs('tests/fixtures')).map(rel).filter((f) => /graftwork/.test(f))];
  for (const f of new Set(textFiles)) {
    if (/\.(?:png|webp|jpe?g)$/.test(f) || !fs.existsSync(abs(f)) || fs.statSync(abs(f)).isDirectory()) continue;
    const text = fs.readFileSync(abs(f), 'utf8'); if (!text.includes(EM_DASH)) continue;
    const F = !isGame(f) && files.get(f); let line = 1;
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (c === '\n') line++; else if (c === EM_DASH) { if (F && detectorAt(F, i)) emDashDetectors++; else emDashes.push(`${f}:${line}`); } }
  }

  // ---- 9: tools nobody names
  const docs = [...walk(G).filter((f) => f.endsWith('.md')), abs('CLAUDE.md'), abs('README.md'), abs('package.json'), ...walk(abs('.claude')).filter((f) => /\.(md|json)$/.test(f))].filter((f) => fs.existsSync(f));
  const docText = docs.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  const sourceText = (except) => [...files.values()].filter((F) => F.rel !== except).map((F) => F.src).join('\n') + toolFiles.filter((f) => f.endsWith('.py') && f !== except).map((f) => fs.readFileSync(abs(f), 'utf8')).join('\n');
  const unmentionedTools = [], toolNotes = {};
  for (const t of toolFiles) {
    const base = path.basename(t), inDocs = docText.includes(base);
    if (inDocs) continue;
    const inCode = sourceText(t).includes(base);
    if (inCode) toolNotes[t] = 'named by code only (no doc, no npm script)'; else unmentionedTools.push(t);
  }
  const lexWarnings = [...files.values()].filter((F) => !F.lexOk).map((F) => F.rel);
  const sort = (a) => [...new Set(a)].sort();
  return {
    counts: { sourceFiles: gameFiles.length, tests: testFiles.length, tools: toolFiles.length, assetFiles: assetFiles.length, manifests: manifests.length },
    unreachable: sort(unreachable), labOnly: sort(labOnly),
    unusedExports: sort(unusedExports), testOnlyDead: sort(testOnlyDead), exportOnlyOwnFile: sort(exportOnlyOwnFile), testOnlyExports: sort(testOnlyExports), labOnlyExports: sort(labOnlyExports),
    unreferencedLocals: sort(unreferencedLocals),
    missingAssets: sort(missingAssets), orphanAssets: sort(orphanAssets),
    duplicateHelpers: sort(duplicateHelpers), duplicateDetail,
    emDashes: sort(emDashes), emDashDetectors, brokenImports: sort(brokenImports), unmentionedTools: sort(unmentionedTools), toolNotes, lexWarnings,
  };
}
// findings against the allowlist: what is new, what is stale
export function againstAllow(found, allow) {
  const out = {};
  for (const k of ALLOW_LISTS) {
    const have = new Set(found[k] || []), ok = new Set((allow && allow[k]) || []);
    out[k] = { fresh: [...have].filter((x) => !ok.has(x)).sort(), stale: [...ok].filter((x) => !have.has(x)).sort(), n: have.size };
  }
  return out;
}
export const allowOf = (found) => Object.fromEntries(ALLOW_LISTS.map((k) => [k, found[k] || []]));

// ---------------------------------------------------------------- command line
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
  const root = path.resolve(val('--root') || REPO), found = audit(root), allowPath = path.join(root, ALLOW_FILE);
  const allow = fs.existsSync(allowPath) ? JSON.parse(fs.readFileSync(allowPath, 'utf8')) : null;
  if (args.includes('--init-allow')) {
    if (allow) { console.error(`${ALLOW_FILE} exists: it may only shrink (use --prune-allow)`); process.exit(1); }
    fs.writeFileSync(allowPath, JSON.stringify(allowOf(found), null, 1) + '\n'); console.log(`wrote ${ALLOW_FILE}: ${ALLOW_LISTS.map((k) => `${k} ${found[k].length}`).join(', ')}`); process.exit(0);
  }
  if (args.includes('--prune-allow')) {
    if (!allow) { console.error(`no ${ALLOW_FILE}`); process.exit(1); }
    const cmp = againstAllow(found, allow); let n = 0;
    for (const k of ALLOW_LISTS) { n += cmp[k].stale.length; allow[k] = (allow[k] || []).filter((x) => !cmp[k].stale.includes(x)); }
    fs.writeFileSync(allowPath, JSON.stringify(allow, null, 1) + '\n'); console.log(`pruned ${n} entries from ${ALLOW_FILE}`); process.exit(0);
  }
  if (args.includes('--json')) { console.log(JSON.stringify(found, null, 1)); process.exit(0); }
  if (val('--list')) { for (const x of found[val('--list')] || []) console.log(typeof x === 'string' ? x : JSON.stringify(x)); process.exit(0); }
  const c = found.counts, head = (t) => console.log('\n' + t), few = (list, n = 12) => { for (const x of list.slice(0, n)) console.log('  ' + x); if (list.length > n) console.log(`  ... ${list.length - n} more (--list <name> or --json)`); };
  console.log(`Graftwork hygiene: ${c.sourceFiles} source files, ${c.tests} test files, ${c.tools} tools, ${c.assetFiles} asset files in ${c.manifests} manifests (${root})`);
  head(`1  unreachable files: ${found.unreachable.length}` + (found.labOnly.length ? `   (reached only from a lab page: ${found.labOnly.join(', ')})` : '')); few(found.unreachable);
  head(`2  exports nothing imports and nothing uses: ${found.unusedExports.length}`); few(found.unusedExports);
  head(`3  exports only tests or tools import, unused in their own file: ${found.testOnlyDead.length}   (plus ${found.testOnlyExports.length} that only tests import but their own file uses)`); few(found.testOnlyDead);
  head(`4  \`export\` on names used only in their own file: ${found.exportOnlyOwnFile.length}`); few(found.exportOnlyOwnFile);
  head(`5  top level names nothing references: ${found.unreferencedLocals.length}`); few(found.unreferencedLocals, 30);
  head(`6  assets: ${found.missingAssets.length} manifest entries without a file, ${found.orphanAssets.length} files nobody refers to`); few(found.missingAssets); few(found.orphanAssets);
  head(`7  small helpers defined in several files: ${found.duplicateDetail.length} names, ${found.duplicateHelpers.length} definitions`);
  for (const d of found.duplicateDetail.slice(0, 40)) console.log(`  ${d.name.padEnd(14)} x${String(d.files.length).padEnd(3)} ${(d.identical ? 'identical' : d.variants + ' variants').padEnd(11)} ${d.files.map((f) => f.replace('graftwork/', '') + (d.nested.includes(f) ? '(inner)' : '')).join(' ')}`);
  if (found.duplicateDetail.length > 40) console.log(`  ... ${found.duplicateDetail.length - 40} more`);
  head(`8  em dashes: ${found.emDashes.length}   (${found.emDashDetectors} more are tests naming the character to look for it, in a regex or a string of dashes)`); few(found.emDashes);
  head(`9  broken imports: ${found.brokenImports.length}; tools no doc or script names: ${found.unmentionedTools.length}`); few(found.brokenImports); few(found.unmentionedTools);
  for (const [t, note] of Object.entries(found.toolNotes)) console.log(`  (${t}: ${note})`);
  if (found.lexWarnings.length) { head(`lexer warnings (unbalanced brackets after stripping, findings in these files may be off): ${found.lexWarnings.length}`); few(found.lexWarnings); }
  if (allow) {
    const cmp = againstAllow(found, allow); let bad = 0;
    head(`against ${ALLOW_FILE}:`);
    for (const k of ALLOW_LISTS) { const x = cmp[k]; bad += x.fresh.length + x.stale.length; console.log(`  ${k.padEnd(20)} ${String(x.n).padStart(4)} found, ${x.fresh.length} new, ${x.stale.length} gone from the code but still listed`); few(x.fresh.map((s) => 'NEW  ' + s), 8); few(x.stale.map((s) => 'GONE ' + s), 8); }
    const strict = STRICT_LISTS.reduce((a, k) => a + found[k].length, 0);
    console.log(strict || bad ? `\nNOT CLEAN: ${strict} strict findings, ${bad} allowlist mismatches` : '\nclean: the strict checks pass and the allowlist matches');
    process.exit(strict || bad ? 1 : 0);
  } else console.log(`\n(no ${ALLOW_FILE} yet: --init-allow writes it)`);
}
