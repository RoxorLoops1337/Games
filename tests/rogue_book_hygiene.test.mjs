// House rules for everything under rogue_book/, tests/rogue_book_* and tools/rogue_book/, enforced
// statically (a tiny JS tokenizer strips comments, strings and regex literals first, so a rule never
// fires on prose) plus a few runtime checks against DATA. DESIGN.md section 2 is the source of every rule.
//
//   node tests/rogue_book_hygiene.test.mjs              lenient: content files that are not written yet are skipped
//   RB_STRICT=1 node tests/rogue_book_hygiene.test.mjs  integration gate: every script, stylesheet and fixed id must exist,
//                                                       DATA.validate(undefined, {strict:true}) and DATA.audit() must be clean
//   ROGUE_BOOK_DIR=/some/copy/rogue_book node ...       run against another folder (the lib suite uses this on fixtures)
//
// Rules (each one is its own test so the failure says which):
//   text       no em or en dashes anywhere; no tab indentation; no Math.random in game code, tests or tools
//   scripts    every script index.html lists parses as a classic script; every js file is listed exactly once; index.html,
//              DESIGN.md section 3 and gallery.html agree (gallery scripts are the prefix of index.html's that ends at the last art file)
//   names      namespace files declare exactly their one const namespace; extension files (data_*, art_*, screen_*, tutorial)
//              are exactly one IIFE; inline scripts are one IIFE; no import/export; no var or function leaking out of a block
//   layers     a file may only reference namespaces loaded before it (plus GAME.nodeDone/toTitle/enterNode from screens);
//              logic files never touch the DOM, timers or the presentation namespaces; audio.js never references META
//   apis       no eval or Function, no network, no alert/confirm/prompt, no document.write, no console but error and warn,
//              no debugger, only window.location (never a bare location), ES2020 syntax only, storage keys start with rb_,
//              pointer events only (no mouse or touch event names), requestAnimationFrame only in main.js
//   time       Date.now, new Date() and Date() only in main.js; performance.now only in presentation files
//   ids        every string literal handed to AUDIO.sfx, AUDIO.music, UI.go, UI.overlay.open, UI.bus.emit/on, ART.icon.draw,
//              ART.map.hex, ART.scene.draw, ART.fx.* and data-tut exists in its DATA.LISTS list; the closed lists have no
//              duplicates; heroes, tiles, statuses, roster and fixed ids are consistent; every populated registry validates
//   web        viewport meta does not block zoom, #boot-css precedes the stylesheets, no external URLs, no will-change on #stage,
//              css/base.css (once it exists) has the pointer-events, touch-action and --hit rules of DESIGN 5.8
//   wiring     package.json runs this game's tests in `check`, build.js copies the folder, every suite ends in done()
//
// Escape hatch for a genuine false positive: put `hygiene-allow(RULE): why` in a comment on the same or the previous line
// (RULE is one of eval network dialogs console debugger location es2020 storage time layers pointer raf). A pragma without a reason fails.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { boot, harness, DIR, ROOT, scriptFiles, htmlAssets, stripJs, stripCss, analyzeTopLevel, tokenizeJs, lineOf } from './rogue_book_lib.mjs';

const t = harness('rogue_book hygiene');
const STRICT = !!process.env.RB_STRICT;
const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const read = (f) => fs.readFileSync(f, 'utf8');
const exists = (f) => fs.existsSync(f);
const list = (dir, re) => (exists(dir) ? fs.readdirSync(dir).filter((n) => re.test(n)).map((n) => path.join(dir, n)).sort() : []);
const walk = (d, out = []) => { if (!exists(d)) return out; for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p, out); else out.push(p); } return out; };
const DASHES = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
const MATH_RANDOM = new RegExp('Math\\s*\\.\\s*' + 'random');
const fail = (bad, header) => `${header}${bad.length > 25 ? ` (${bad.length} found, first 25)` : ''}:\n    ${bad.slice(0, 25).join('\n    ')}`;

// ---------------------------------------------------------------- what exists
const TESTS = path.join(ROOT, 'tests'), TOOLS = path.join(ROOT, 'tools', 'rogue_book');
const jsDir = path.join(DIR, 'js');
const jsFiles = list(jsDir, /\.js$/);
const cssFiles = list(path.join(DIR, 'css'), /\.css$/);
const pages = list(DIR, /\.html$/);
const mdFiles = list(DIR, /\.md$/);
const testFiles = list(TESTS, /^rogue_book_.*\.mjs$/);
const toolFiles = walk(TOOLS).filter((f) => /\.(mjs|js|json|md)$/.test(f));
const textFiles = walk(DIR).filter((f) => /\.(js|html|css|md|json|svg|txt)$/.test(f)).concat(testFiles, toolFiles);
const indexHtml = exists(path.join(DIR, 'index.html')) ? read(path.join(DIR, 'index.html')) : '';
const listed = scriptFiles(DIR);
const src = new Map();                                                // file -> {text, code, codeStr, lines}
const info = (f) => {
  if (!src.has(f)) { const text = read(f); src.set(f, { text, code: stripJs(text), codeStr: stripJs(text, { keepStrings: true }), lines: text.split('\n') }); }
  return src.get(f);
};
const base = (f) => path.basename(f);
const allowed = (f, offset, rule) => {
  const { text, lines } = info(f);
  const ln = lineOf(text, offset);
  const re = new RegExp('hygiene-allow\\(' + rule + '\\)');
  return re.test(lines[ln - 1] || '') || re.test(lines[ln - 2] || '');
};
const at = (f, offset) => `${rel(f)}:${lineOf(info(f).text, offset)}`;
const snippet = (s, i, n = 40) => s.slice(Math.max(0, i - 10), i + n).replace(/\s+/g, ' ').trim();

/* Scan one view of each file with a regex. view: 'code' (strings blanked) or 'codeStr' (strings kept). */
function scan(files, view, re, rule, message, extraFilter) {
  const bad = [];
  for (const f of files) {
    const inf = info(f);
    for (const m of inf[view].matchAll(re)) {
      const i = m.index + (m.groups && m.groups.pre ? m.groups.pre.length : 0);
      if (extraFilter && !extraFilter(f, m, i)) continue;
      if (rule && allowed(f, i, rule)) continue;
      bad.push(`${at(f, i)}: ${message} near "${snippet(inf.text, i)}"`);
    }
  }
  return bad;
}
/* Calls of a global function, not method calls and not definitions: alert(1), window.confirm(x). */
function globalCalls(files, names, rule, message) {
  const bad = [];
  for (const f of files) {
    const { code, text } = info(f);
    for (const name of names) {
      const re = new RegExp('(^|[^\\w$.])(?:window\\s*\\.\\s*)?' + name + '\\s*\\(', 'g');
      let m;
      while ((m = re.exec(code))) {
        const i = m.index + m[1].length;
        const before = code.slice(Math.max(0, i - 24), i);
        if (/(function\s*\*?|get|set|async|static)\s+$/.test(before)) continue;                    // a definition
        let depth = 0, j = code.indexOf('(', i);
        for (; j < code.length; j++) { if (code[j] === '(') depth++; else if (code[j] === ')' && --depth === 0) break; }
        if (/^\s*\{/.test(code.slice(j + 1, j + 8)) && !/\bwindow\s*\.\s*$/.test(before)) continue;   // method shorthand: name(args) {
        if (allowed(f, i, rule)) continue;
        bad.push(`${at(f, i)}: ${message} near "${snippet(text, i)}"`);
      }
    }
  }
  return bad;
}

// ---------------------------------------------------------------- text
t.test('no em or en dashes anywhere', () => {
  const bad = [];
  for (const f of textFiles) { const s = read(f); const i = s.search(DASHES); if (i >= 0) bad.push(`${rel(f)}:${lineOf(s, i)} near "${snippet(s, i)}"`); }
  t.eq(bad.length, 0, fail(bad, 'dashes (write -- , a comma or a colon; build a dash in a test with String.fromCharCode)'));
});
t.test('no tab indentation in game files', () => {
  const bad = [];
  for (const f of jsFiles.concat(cssFiles, pages)) { const s = read(f); const m = /^\t/m.exec(s); if (m) bad.push(`${rel(f)}:${lineOf(s, m.index)}`); }
  t.eq(bad.length, 0, fail(bad, 'tab indentation (2 spaces, DESIGN section 2)'));
});
t.test('no Math.random in game code, tests or tools', () => {
  const bad = scan(jsFiles.concat(testFiles, toolFiles.filter((f) => /\.m?js$/.test(f))), 'code', new RegExp(MATH_RANDOM.source, 'g'), null, 'Math.random (use U.rng)');
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) if (MATH_RANDOM.test(stripJs(s.code))) bad.push(`${rel(p)}: inline script uses Math.random`);
  t.eq(bad.length, 0, fail(bad, 'Math.random'));
});
t.test('every header comment is there', () => {
  const bad = [];
  for (const f of jsFiles) {
    const s = read(f).replace(/^\ufeff/, '');
    const m = /^\s*(\/\/[^\n]*(?:\n\/\/[^\n]*){1,}|\/\*[\s\S]*?\*\/)/.exec(s);
    if (!m || m[1].split('\n').length < 2) bad.push(rel(f));
  }
  t.eq(bad.length, 0, fail(bad, 'files without a header comment of at least 2 lines (the contract of record, DESIGN section 2)'));
});

// ---------------------------------------------------------------- scripts and page wiring
t.test('every listed script that exists parses as a classic script', () => {
  const bad = [];
  for (const f of listed) {
    const p = path.join(DIR, f);
    if (!exists(p)) continue;
    try { new vm.Script(read(p), { filename: rel(p) }); } catch (e) { bad.push(`${f}: ${e.message}`); }
  }
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) { try { new vm.Script(s.code, { filename: rel(p) + ' inline' }); } catch (e) { bad.push(`${rel(p)} inline script: ${e.message}`); } }
  t.eq(bad.length, 0, fail(bad, 'scripts that do not parse'));
});
t.test('index.html lists every js file exactly once, and in strict mode every listed file exists', () => {
  const bad = [];
  const seen = new Set();
  for (const f of listed) { if (seen.has(f)) bad.push(`${f} is listed twice`); seen.add(f); }
  for (const f of jsFiles) if (!seen.has('js/' + base(f))) bad.push(`js/${base(f)} exists but index.html does not load it`);
  if (STRICT) {
    for (const f of listed) if (!exists(path.join(DIR, f))) bad.push(`${f} is listed but missing`);
    for (const c of htmlAssets(indexHtml).styles) if (!exists(path.join(DIR, c))) bad.push(`${c} is linked but missing`);
  }
  for (const f of listed) if (!/^js\/[a-z0-9_]+\.js$/.test(f)) bad.push(`${f}: script names are js/snake_case.js`);
  t.eq(bad.length, 0, fail(bad, 'index.html script list'));
});
t.test('DESIGN.md section 3 names the same files as index.html', () => {
  const dp = path.join(DIR, 'DESIGN.md');
  if (!exists(dp)) return;
  const m = /## 3\. Files[^\n]*\n\s*```[^\n]*\n([\s\S]*?)```/.exec(read(dp));
  t.ok(!!m, 'DESIGN.md has a "## 3. Files" code block');
  if (!m) return;
  const inDoc = new Set([...m[1].matchAll(/\b([a-z][a-z0-9_]*)\.js\b/g)].map((x) => x[1]));
  const inHtml = new Set(listed.map((f) => f.replace(/^js\/|\.js$/g, '')));
  const missingDoc = [...inHtml].filter((n) => !inDoc.has(n)), missingHtml = [...inDoc].filter((n) => !inHtml.has(n));
  t.deep(missingDoc, [], 'scripts in index.html that DESIGN.md section 3 does not name');
  t.deep(missingHtml, [], 'scripts DESIGN.md section 3 names that index.html does not load');
  const docCss = new Set([...m[1].matchAll(/\b([a-z]+)\.css\b/g)].map((x) => x[1])), htmlCss = new Set(htmlAssets(indexHtml).styles.map((c) => c.replace(/^css\/|\.css$/g, '')));
  t.deep([...htmlCss].filter((n) => !docCss.has(n)), [], 'stylesheets index.html links that DESIGN.md section 3 does not name');
});
t.test('gallery.html loads the prefix of index.html that ends at the last art file', () => {
  const gp = path.join(DIR, 'gallery.html');
  if (!exists(gp)) return;
  const g = htmlAssets(read(gp)).scripts;
  const lastArt = listed.map((f, i) => (/^js\/art(_|\.)/.test(f) ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  t.deep(g, listed.slice(0, lastArt + 1), 'gallery scripts must equal index.html scripts up to and including the last art file');
});
t.test('index.html is well formed for the game', () => {
  const bad = [];
  const vp = /<meta[^>]*name=["']viewport["'][^>]*content=["']([^"']*)["']/i.exec(indexHtml);
  if (!vp) bad.push('no viewport meta'); else { if (!/width=device-width/.test(vp[1])) bad.push('viewport must say width=device-width'); if (/user-scalable\s*=\s*(no|0)|maximum-scale\s*=\s*1(\.0)?\b/.test(vp[1])) bad.push('viewport must not disable page zoom (user-scalable=no, maximum-scale=1)'); }
  const bootCss = indexHtml.indexOf('id="boot-css"'), firstLink = indexHtml.search(/<link[^>]*rel=["']stylesheet["']/i);
  if (bootCss >= 0 && firstLink >= 0 && bootCss > firstLink) bad.push('<style id="boot-css"> must come BEFORE the stylesheet links so base.css can override it');
  if (!/<title>[^<]{3,}<\/title>/.test(indexHtml)) bad.push('missing <title>');
  for (const id of ['boot', 'stage', 'view', 'screens', 'overlays', 'over', 'tips', 'toasts', 'sr']) if (!new RegExp('id=["\']' + id + '["\']').test(indexHtml)) bad.push(`index.html has no #${id}`);
  t.eq(bad.length, 0, fail(bad, 'index.html'));
});

// ---------------------------------------------------------------- top-level names
const NS = { 'util.js': 'U', 'data.js': 'DATA', 'art.js': 'ART', 'audio.js': 'AUDIO', 'combat.js': 'COMBAT', 'map.js': 'MAP', 'run.js': 'RUN', 'meta.js': 'META', 'ui.js': 'UI', 'scene.js': 'SCENE', 'main.js': 'GAME' };
const isExtension = (f) => /^(data_[a-z0-9_]+|art_[a-z0-9_]+|screen_[a-z0-9_]+|tutorial)\.js$/.test(base(f));
t.test('one namespace per file, extension files are one IIFE', () => {
  const bad = [];
  for (const f of jsFiles) {
    const a = analyzeTopLevel(info(f).text), b = base(f);
    if (NS[b]) {
      const names = a.names.map((n) => n.name + ':' + n.kind);
      if (names.join() !== NS[b] + ':const') bad.push(`${rel(f)} must declare exactly "const ${NS[b]}" at top level, found [${names.join(', ') || 'nothing'}]`);
    } else if (isExtension(f)) {
      if (a.names.length) bad.push(`${rel(f)} declares top-level name(s) ${a.names.map((n) => `${n.name}@${n.line}`).join(', ')}: extension files are one IIFE`);
      else if (a.statements.length !== 1 || a.statements[0].kind !== 'iife') bad.push(`${rel(f)} must be exactly one IIFE, found statements [${a.statements.map((s) => s.kind + '@' + s.line).join(', ') || 'none'}]`);
    } else bad.push(`${rel(f)}: unknown module kind (add it to NS or to the extension prefixes in the hygiene suite and DESIGN section 3)`);
  }
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) {
    const a = analyzeTopLevel(s.code);
    if (a.names.length || a.statements.length !== 1 || a.statements[0].kind !== 'iife') bad.push(`${rel(p)} inline script at line ${s.line} must be exactly one IIFE`);
  }
  t.eq(bad.length, 0, fail(bad, 'top-level declarations'));
});

// ---------------------------------------------------------------- layering
const ORDER = ['U', 'DATA', 'ART', 'AUDIO', 'COMBAT', 'MAP', 'RUN', 'META', 'UI', 'SCENE', 'GAME'];
const ownRank = (f) => { const b = base(f); if (NS[b]) return ORDER.indexOf(NS[b]); if (/^data_/.test(b)) return 1; if (/^art_/.test(b)) return 2; if (/^(screen_|tutorial)/.test(b)) return 9; return -1; };
const isLogic = (f) => /^(data(_[a-z0-9_]+)?|combat|map|run|meta)\.js$/.test(base(f));
t.test('files only reference namespaces loaded before them', () => {
  const bad = [];
  for (const f of jsFiles) {
    const rank = ownRank(f);
    if (rank < 0) continue;
    const { code, text } = info(f);
    const re = new RegExp('(?<![\\w$.])(' + ORDER.join('|') + ')\\b(?!\\s*:)(\\s*\\.\\s*([A-Za-z_$][\\w$]*))?', 'g');
    let m;
    while ((m = re.exec(code))) {
      const ns = m[1], r = ORDER.indexOf(ns);
      const backward = r > rank;
      const presentationInLogic = isLogic(f) && (ns === 'ART' || ns === 'AUDIO' || ns === 'UI' || ns === 'SCENE' || ns === 'GAME');
      if (!backward && !presentationInLogic) continue;
      if (ns === 'GAME' && /^(screen_|tutorial)/.test(base(f)) && ['nodeDone', 'toTitle', 'enterNode'].includes(m[3])) continue;
      if (allowed(f, m.index, 'layers')) continue;
      bad.push(`${at(f, m.index)}: ${base(f)} references ${ns}${m[3] ? '.' + m[3] : ''}, which ${presentationInLogic ? 'logic never calls (ART and AUDIO are leaf helpers the UI calls)' : 'loads after it'}${ns === 'GAME' ? ' (screens may only call GAME.nodeDone, toTitle and enterNode; use UI.bus for the rest)' : ''}`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'namespace direction (DESIGN sections 2 and 3)'));
});
t.test('logic files never touch the DOM, storage, timers or the audio and art layers', () => {
  const BAN = ['document', 'window(?=\\s*\\.)', 'typeof\\s+window', 'localStorage', 'sessionStorage', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'requestIdleCallback', 'AudioContext', 'webkitAudioContext', 'OffscreenCanvas', 'getComputedStyle', 'matchMedia', 'MutationObserver', 'ResizeObserver'];
  const bad = [];
  for (const f of jsFiles.filter(isLogic)) {
    const meta = base(f) === 'meta.js';
    const names = BAN.filter((n) => !(meta && (n === 'localStorage' || n.startsWith('window') || n.startsWith('typeof'))));
    const { code } = info(f);
    const re = new RegExp('(?<![\\w$.])(' + names.join('|') + ')(?![\\w$])(?!\\s*:)', 'g');
    let m;
    while ((m = re.exec(code))) { if (!allowed(f, m.index, 'layers')) bad.push(`${at(f, m.index)}: ${base(f)} is logic and must not use ${m[1].replace(/\s+/g, ' ')}${meta ? ' (META may use window.localStorage only)' : ''}`); }
  }
  t.eq(bad.length, 0, fail(bad, 'logic purity (DESIGN sections 2 and 3)'));
});

// ---------------------------------------------------------------- forbidden APIs
t.test('no eval, Function, string timers or document.write', () => {
  const bad = [];
  const js = jsFiles;
  bad.push(...globalCalls(js, ['eval', 'Function'], 'eval', 'eval or Function() needs code generation'));
  bad.push(...scan(js, 'code', /\bnew\s+Function\b|\bFunction\s*\.\s*(prototype\s*\.\s*)?constructor|\bdocument\s*\.\s*write(ln)?\s*\(/g, 'eval', 'code generation or document.write'));
  bad.push(...scan(js, 'codeStr', /(?<pre>^|[^\w$.])(?:window\s*\.\s*)?set(?:Timeout|Interval)\s*\(\s*['"`]/g, 'eval', 'string timer callback'));
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) { const c = stripJs(s.code); if (/\beval\s*\(|\bnew\s+Function\b/.test(c)) bad.push(`${rel(p)}: inline script uses eval or Function`); }
  t.eq(bad.length, 0, fail(bad, 'code generation'));
});
t.test('no network, workers, modules or dynamic import', () => {
  const bad = [];
  bad.push(...scan(jsFiles, 'code', /(?<![\w$.])(?:window\s*\.\s*)?(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|SharedWorker|importScripts|new\s+Worker\b)|\bnavigator\s*\.\s*(sendBeacon|serviceWorker)\b|\bimport\s*\(|\bimport\s*\.\s*meta/g, 'network', 'network, worker or dynamic import (DESIGN section 2: no fetch, no network)'));
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) { const c = stripJs(s.code); if (/\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(c)) bad.push(`${rel(p)}: inline script uses the network`); }
  t.eq(bad.length, 0, fail(bad, 'network'));
});
t.test('no alert, confirm, prompt or debugger', () => {
  const bad = globalCalls(jsFiles, ['alert', 'confirm', 'prompt'], 'dialogs', 'browser dialog (use UI.modal and overlay confirm)');
  bad.push(...scan(jsFiles, 'code', /(?<![\w$.])debugger\b/g, 'debugger', 'debugger statement'));
  t.eq(bad.length, 0, fail(bad, 'dialogs'));
});
t.test('no console output except console.error and console.warn', () => {
  const bad = scan(jsFiles, 'code', /(?<![\w$])console\s*\.\s*(?!error\b|warn\b)([A-Za-z_$][\w$]*)/g, 'console', 'console output left in shipped game code');
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) { const m = /(?<![\w$])console\s*\.\s*(?!error\b|warn\b)(\w+)/.exec(stripJs(s.code)); if (m) bad.push(`${rel(p)}: inline script calls console.${m[1]}`); }
  t.eq(bad.length, 0, fail(bad, 'console'));
});
t.test('browser globals go through window: never a bare location', () => {
  const LOC = /(?<![\w$.])location\s*\.\s*(search|href|hash|reload|assign|replace|pathname|origin)\b/g;
  const bad = scan(jsFiles, 'code', LOC, 'location', 'bare location (write window.location.x, DESIGN section 2)');
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) { const m = new RegExp(LOC.source).exec(stripJs(s.code)); if (m) bad.push(`${rel(p)}: inline script uses a bare location.${m[1]}`); }
  t.eq(bad.length, 0, fail(bad, 'bare location'));
});
t.test('pointer events only, and one rAF loop', () => {
  const bad = scan(jsFiles, 'codeStr', /(?<![\w$])(?:addEventListener\s*\(\s*|\bon|\.on\s*\(\s*)(['"]?)(mousedown|mouseup|mousemove|touchstart|touchmove|touchend|touchcancel)\1/g, 'pointer', 'legacy mouse or touch event (DESIGN section 2: pointer events, one code path)');
  bad.push(...scan(jsFiles, 'code', /(?<![\w$.])(?:window\s*\.\s*)?requestAnimationFrame\s*\(/g, 'raf', 'requestAnimationFrame outside main.js (DESIGN 5.8: one rAF loop in GAME drives UI.frame)', (f) => base(f) !== 'main.js'));
  t.eq(bad.length, 0, fail(bad, 'input and frame loop'));
});
t.test('game code is ES2020: no logical assignment, private fields, numeric separators or static blocks', () => {
  const bad = [];
  for (const f of jsFiles) {
    const { text } = info(f);
    for (const tk of tokenizeJs(text)) {
      let why = '';
      if (tk.t === 'punct' && ['??=', '||=', '&&='].includes(tk.v)) why = `${tk.v} is ES2021`;
      else if (tk.t === 'private') why = 'private class fields are ES2022';
      else if (tk.t === 'num' && /\d_\d/.test(tk.v)) why = 'numeric separators are ES2021';
      else if (tk.t === 'regex' && /\/[a-z]*[dv][a-z]*$/.test(tk.v)) why = 'regex d and v flags are newer than ES2020';
      if (why && !allowed(f, tk.s, 'es2020')) bad.push(`${at(f, tk.s)}: ${why}`);
    }
    for (const m of info(f).code.matchAll(/\bstatic\s*\{/g)) if (!allowed(f, m.index, 'es2020')) bad.push(`${at(f, m.index)}: class static blocks are ES2022`);
  }
  t.eq(bad.length, 0, fail(bad, 'syntax newer than ES2020 (phones, DESIGN section 2)'));
});
t.test('localStorage keys keep the rb_ prefix', () => {
  const bad = [];
  for (const f of jsFiles) {
    for (const m of info(f).codeStr.matchAll(/\b(?:local|session)Storage\s*\.\s*(?:getItem|setItem|removeItem)\s*\(\s*(['"`])([^'"`]*)\1/g)) {
      if (!/^rb_[a-z0-9_]+$/.test(m[2]) && !allowed(f, m.index, 'storage')) bad.push(`${at(f, m.index)}: storage key "${m[2]}" (keys are rb_*; never rename rb_profile_v1, rb_run_v1)`);
    }
  }
  t.eq(bad.length, 0, fail(bad, 'storage keys'));
});

// ---------------------------------------------------------------- the clock
t.test('the clock: Date and new Date() only in main.js, performance.now only in presentation files', () => {
  const bad = [];
  const dateRe = /(?<![\w$.])Date\s*\.\s*now\s*\(|\bnew\s+Date\s*\(\s*\)|(?<![\w$.])(?<!new\s)Date\s*\(\s*\)/g;
  bad.push(...scan(jsFiles, 'code', dateRe, 'time', 'reads the clock (only GAME in main.js may; logic gets now or date from its caller)', (f) => base(f) !== 'main.js'));
  const presentation = (f) => /^(art(_[a-z0-9_]+)?|audio|ui|scene|screen_[a-z0-9_]+|tutorial|main)\.js$/.test(base(f));
  bad.push(...scan(jsFiles, 'code', /\bperformance\s*\.\s*now\s*\(/g, 'time', 'performance.now in a logic file (logic never reads a clock, DESIGN section 2)', (f) => !presentation(f)));
  for (const p of pages) for (const s of htmlAssets(read(p)).inline) if (/(?<![\w$.])Date\s*\.\s*now\s*\(/.test(stripJs(s.code))) bad.push(`${rel(p)}: inline script reads Date.now`);
  t.eq(bad.length, 0, fail(bad, 'clock reads'));
});
t.test('hygiene-allow pragmas always say why', () => {
  const bad = [];
  for (const f of jsFiles.concat(pages)) for (const m of read(f).matchAll(/hygiene-allow\(([\w-]*)\)([^\n]*)/g)) if (!/^:\s*\S{4,}/.test(m[2])) bad.push(`${at(f, m.index)}: pragma "${m[0].trim()}" needs ": reason"`);
  t.eq(bad.length, 0, fail(bad, 'pragmas'));
});

// ---------------------------------------------------------------- css and html
t.test('css: no imports, no external urls, no will-change on the stage', () => {
  const bad = [];
  const sheets = cssFiles.map((f) => [rel(f), stripCss(read(f))]);
  for (const p of pages) { const a = htmlAssets(read(p)); a.inlineStyles.forEach((s, i) => sheets.push([`${rel(p)} <style> #${i + 1}`, stripCss(s)])); }
  for (const [name, css] of sheets) {
    if (/@import\b/.test(css)) bad.push(`${name}: @import`);
    for (const m of css.matchAll(/url\(\s*(['"]?)([^)'"]*)\1\s*\)/g)) if (!/^(data:|#)/.test(m[2])) bad.push(`${name}: url(${m[2]}) (no external assets; data: URIs and #fragments only)`);
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) if (/(^|[\s,>+~])#stage(?![\w-])/.test(m[1]) && /will-change/.test(m[2])) bad.push(`${name}: will-change on #stage blurs text (DESIGN 5.8)`);
  }
  t.eq(bad.length, 0, fail(bad, 'css'));
});
t.test('css/base.css follows the input and layering rules of DESIGN 5.8', () => {
  const bp = path.join(DIR, 'css', 'base.css');
  if (!exists(bp)) { if (STRICT) t.ok(false, 'css/base.css is missing'); return; }
  const css = stripCss(read(bp));
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1], body: m[2] }));
  const decl = (b, k, v) => new RegExp('(^|;|\\s)' + k + '\\s*:\\s*' + v + '(\\s|;|$)').test(b);
  const bad = [];
  if (!rules.some((r) => /#screens/.test(r.sel) && /#overlays/.test(r.sel) && decl(r.body, 'pointer-events', 'none'))) bad.push('#screens and #overlays (with #tips, #toasts, #over) need pointer-events:none so #view receives pointer events');
  if (!rules.some((r) => /\bbutton\b/.test(r.sel) && /\.card/.test(r.sel) && decl(r.body, 'pointer-events', 'auto'))) bad.push('button, .card, .hit, [role=button], input, .panel need pointer-events:auto');
  if (!rules.some((r) => /(^|[\s,>+~])#stage(?![\w-])/.test(r.sel) && decl(r.body, 'touch-action', 'none'))) bad.push('#stage needs touch-action:none');
  if (!/--hit\s*:[^;}]*44px/.test(css)) bad.push('--hit (44px minimum, divided by --scale) is not defined');
  t.eq(bad.length, 0, fail(bad, 'css/base.css'));
});
t.test('no external URLs in game files', () => {
  const bad = [];
  const ok = /^https?:\/\/(www\.w3\.org\/(1999\/xhtml|2000\/svg|1999\/xlink|XML\/1998\/namespace)|localhost)\b/;
  for (const f of jsFiles) {
    for (const m of info(f).codeStr.matchAll(/(?:https?:\/\/|(?<![\w:/.-])\/\/(?=[\w-]+\.[a-z]{2,}))[^\s'"`)<>]+/gi)) {      // http(s)://... or a protocol-relative //host.tld
      const s = m[0];
      if (ok.test(s) || allowed(f, m.index, 'network')) continue;
      bad.push(`${at(f, m.index)}: external URL ${s}`);
    }
  }
  for (const p of pages) {
    const html = read(p).replace(/<!--[\s\S]*?-->/g, '');
    for (const m of html.matchAll(/\b(?:src|href|action|poster)\s*=\s*["']\s*((?:https?:)?\/\/[^"']+)["']/gi)) bad.push(`${rel(p)}: external ${m[1]}`);
  }
  t.eq(bad.length, 0, fail(bad, 'external URLs (no external assets, no network)'));
});

// ---------------------------------------------------------------- tests, tools, wiring
t.test('every suite ends in done() and imports the shared loader', () => {
  const bad = [];
  for (const f of testFiles.filter((x) => /\.test\.mjs$/.test(x))) {
    const s = stripJs(read(f), { keepStrings: true });
    if (!/\.done\s*\(\s*\)/.test(s)) bad.push(`${rel(f)} never calls done() (the runner cannot see its result)`);
    if (!/rogue_book_lib\.mjs/.test(s)) bad.push(`${rel(f)} does not import tests/rogue_book_lib.mjs`);
  }
  t.eq(bad.length, 0, fail(bad, 'suites'));
});
t.test('package.json and build.js run and ship this game', () => {
  const pj = path.join(ROOT, 'package.json'), bj = path.join(ROOT, 'build.js');
  if (exists(pj)) {
    const p = JSON.parse(read(pj));
    t.eq(p.scripts && p.scripts['test:rogue_book'], 'node tests/rogue_book_all.mjs', 'npm run test:rogue_book runs every suite through the runner');
    t.ok(p.scripts && /(^|&&\s*)npm run test:rogue_book(\s|$)/.test(p.scripts.check || ''), 'npm run check includes test:rogue_book');
  }
  if (exists(bj)) t.ok(/['"]rogue_book['"]/.test(read(bj)), "build.js STATIC_PATHS lists 'rogue_book'");
});

// ---------------------------------------------------------------- ids and lists (runtime + literals)
const g = boot({ only: ['data*'], continue: true });
const DATA = g.DATA || null;
const noData = !DATA || !DATA.LISTS;
t.test('js/data.js defines DATA', () => { t.ok(!noData, 'DATA is not defined: js/data.js is missing or failed to load, so the id and registry checks below are skipped'); });
t.test('data files load without errors', () => { const broken = g._errors.concat(g._warnings); t.eq(broken.length, 0, 'load errors: ' + broken.map((e) => `${e.file}:${e.line} ${e.message}`).join(' | ')); });
const L = noData ? {} : DATA.LISTS;
const literalUses = (re, listName, what, view = 'codeStr', extra) => {
  const bad = [];
  const files = jsFiles.concat(pages);
  for (const f of files) {
    const inf = info(f);
    const text = f.endsWith('.html') ? inf.text : inf[view];
    for (const m of text.matchAll(re)) {
      const id = m[1] || m[2];
      const listRef = typeof listName === 'function' ? listName(m) : L[listName];
      if (!listRef) continue;
      if (extra && extra.includes(id)) continue;
      if (listRef.indexOf(id) < 0) bad.push(`${at(f, m.index)}: ${what} "${id}" is not in the closed list`);
    }
  }
  return bad;
};
t.test('string ids handed to AUDIO, UI, ART and the bus exist in their closed lists', () => {
  if (noData) return;
  const bad = [];
  bad.push(...literalUses(/\bAUDIO\s*\.\s*sfx\s*\(\s*['"]([\w-]+)['"]/g, 'sfx', 'AUDIO.sfx id'));
  bad.push(...literalUses(/\bsfx\s*:\s*['"]([\w-]+)['"]/g, 'sfx', 'sfx option'));
  bad.push(...literalUses(/\bAUDIO\s*\.\s*music\s*\(\s*['"]([\w-]+)['"]/g, 'music', 'AUDIO.music id'));
  bad.push(...literalUses(/\bmusic\s*:\s*['"]([\w-]+)['"]/g, 'music', 'music option'));
  bad.push(...literalUses(/\bUI\s*\.\s*go\s*\(\s*['"]([\w-]+)['"]/g, 'screens', 'UI.go screen'));
  bad.push(...literalUses(/\bUI\s*\.\s*overlay\s*\.\s*open\s*\(\s*['"]([\w-]+)['"]/g, 'overlays', 'UI.overlay.open name'));
  bad.push(...literalUses(/\bUI\s*\.\s*bus\s*\.\s*(?:emit|on)\s*\(\s*['"]([\w:*-]+)['"]/g, 'busEvents', 'UI.bus event', 'codeStr', ['*']));
  bad.push(...literalUses(/\bART\s*\.\s*icon\s*\.\s*draw\s*\(\s*[\w$.]+\s*,\s*['"]([\w-]+)['"]/g, 'iconKinds', 'ART.icon.draw kind'));
  bad.push(...literalUses(/\bART\s*\.\s*map\s*\.\s*hex\s*\(\s*[\w$.]+\s*,\s*['"]([\w-]+)['"]/g, 'mapKinds', 'ART.map.hex kind'));
  bad.push(...literalUses(/\bART\s*\.\s*scene\s*\.\s*draw\s*\(\s*[\w$.]+\s*,\s*['"]([\w-]+)['"]/g, 'scenes', 'ART.scene.draw scene'));
  bad.push(...literalUses(/\bART\s*\.\s*hero\s*\.\s*draw\s*\(\s*[\w$.]+\s*,\s*['"]([\w-]+)['"]/g, 'heroIds', 'ART.hero.draw hero'));
  bad.push(...literalUses(/\bART\s*\.\s*fx\s*\.\s*([A-Za-z_$][\w$]*)\s*\(/g, 'fx', 'ART.fx effect', 'code', ['names', 'ms']));
  bad.push(...literalUses(/\bdata-tut\s*=\s*["']([\w-]+)["']|\bdataset\s*\.\s*tut\s*=\s*['"]([\w-]+)['"]/g, 'tutAnchors', 'data-tut anchor'));
  t.eq(bad.length, 0, fail(bad, 'ids used in code'));
});
t.test('closed lists are lists: non-empty, no duplicates, plain values', () => {
  if (noData) return;
  const bad = [];
  for (const [k, v] of Object.entries(L)) {
    if (!Array.isArray(v)) continue;
    if (!v.length) bad.push(`LISTS.${k} is empty`);
    const seen = new Set();
    for (const x of v) { if (typeof x !== 'string' && typeof x !== 'number') bad.push(`LISTS.${k} holds a ${typeof x}`); if (seen.has(x)) bad.push(`LISTS.${k} repeats "${x}"`); seen.add(x); }
  }
  t.eq(bad.length, 0, fail(bad, 'lists'));
});
t.test('heroes, statuses, tiles, brushes and keywords agree with the closed lists', () => {
  if (noData) return;
  const bad = [];
  const has = (list, x, what) => { if (L[list].indexOf(x) < 0) bad.push(`${what} "${x}" is not in LISTS.${list}`); };
  t.deep(Object.keys(DATA.heroes).sort(), L.heroIds.slice().sort(), 'DATA.heroes keys equal LISTS.heroIds');
  for (const id of L.heroIds) {
    const h = DATA.heroes[id]; if (!h) continue;
    const st = DATA.statuses[h.res];
    if (!st || st.kind !== 'resource' || st.hero !== id) bad.push(`hero ${id}: res "${h.res}" must be a resource status owned by ${id}`);
    Object.keys(h.rows).forEach((r) => { if (['front', 'back'].indexOf(r) < 0) bad.push(`hero ${id}: row "${r}"`); Object.keys(h.rows[r]).forEach((f) => has('rowFields', f, `hero ${id} rows.${r} field`)); });
    (h.passives || []).forEach((p) => has('combatHooks', p.on, `hero ${id} passive ${p.id} hook`));
    if (!Array.isArray(h.starter) || h.starter.length !== 5) bad.push(`hero ${id}: starter needs 5 ids`);
    (h.starter || []).forEach((cid) => { if (cid.indexOf(id + '_') !== 0) bad.push(`hero ${id}: starter "${cid}" must be prefixed ${id}_`); });
    if (h.unlock && h.unlock.ach && !/^[a-z0-9_]+$/.test(h.unlock.ach)) bad.push(`hero ${id}: unlock ach id`);
  }
  for (const [id, s] of Object.entries(DATA.statuses)) {
    if (['buff', 'debuff', 'resource'].indexOf(s.kind) < 0) bad.push(`status ${id}: kind`);
    if (['int', 'dur'].indexOf(s.stack) < 0) bad.push(`status ${id}: stack`);
    if (s.kind === 'resource') has('heroIds', s.hero, `status ${id} hero`);
    if (s.id !== id || typeof s.text !== 'string' || !s.text) bad.push(`status ${id}: id or text`);
  }
  t.deep(Object.keys(DATA.tiles).sort(), L.tiles.slice().sort(), 'DATA.tiles keys equal LISTS.tiles');
  L.landmarks.forEach((x) => has('tiles', x, 'landmark'));
  for (const table of ['dist', 'countMin', 'countMax']) if (DATA.ECONOMY[table]) Object.keys(DATA.ECONOMY[table]).forEach((k) => has('tiles', k, `ECONOMY.${table} key`));
  for (const [id, b] of Object.entries(DATA.brushes)) { has('brushKinds', b.kind, `brush ${id} kind`); if (b.kind === 'line' && !(b.len > 0)) bad.push(`brush ${id}: line needs len`); }
  L.cardKw.forEach((k) => { if (!DATA.keywords[k]) bad.push(`LISTS.cardKw "${k}" has no DATA.keywords entry (tooltips)`); });
  L.statMax.forEach((k) => has('statKeys', k, 'statMax key'));
  const ec = DATA.ECONOMY;
  if (ec.map && ec.map.solve) { if (!(ec.map.solve.min <= ec.map.solve.max)) bad.push('ECONOMY.map.solve min above max'); if (ec.startInk + ec.map.wells.count * ec.wellInk < ec.map.solve.max) bad.push('startInk + 3 wells does not cover ECONOMY.map.solve.max (DESIGN 4.8 budget check)'); if (ec.map.bossCol - ec.map.startCol - ec.map.startRing !== ec.map.solve.min) bad.push('map.solve.min must equal bossCol - startCol - startRing'); }
  t.eq(bad.length, 0, fail(bad, 'consistency'));
});
t.test('the fixed roster and fixed ids are consistent and content matches them', () => {
  if (noData) return;
  const bad = [];
  const R = DATA.ROSTER, F = DATA.FIXED;
  const seen = new Set();
  for (const ch of [1, 2, 3]) {
    const rows = R[ch] || [];
    const count = (tier) => rows.filter((r) => r.tier === tier).length;
    if (count('normal') !== 10 || count('elite') !== 3 || count('minion') !== 3 || count('boss') !== 1) bad.push(`roster ch${ch}: needs 10 normal, 3 elite, 3 minion and 1 boss, has ${count('normal')}/${count('elite')}/${count('minion')}/${count('boss')}`);
    for (const r of rows) {
      if (seen.has(r.id)) bad.push(`roster: duplicate id ${r.id}`); seen.add(r.id);
      if (!/^[a-z][a-z0-9_]*$/.test(r.id)) bad.push(`roster: id "${r.id}" is not snake_case`);
      if (L.tiers.indexOf(r.tier) < 0 || L.sizes.indexOf(r.size) < 0) bad.push(`roster: ${r.id} tier or size`);
      const want = r.tier === 'boss' ? ['xl'] : r.tier === 'elite' ? ['l'] : r.tier === 'minion' ? ['s'] : ['s', 'm', 'l'];
      if (want.indexOf(r.size) < 0) bad.push(`roster: ${r.id} (${r.tier}) must be size ${want.join(' or ')}, is ${r.size}`);
      if (!r.name || !r.role) bad.push(`roster: ${r.id} needs a name and a role`);
    }
    const boss = rows.find((r) => r.tier === 'boss');
    if (boss && boss.id !== F.bosses[ch]) bad.push(`roster ch${ch}: boss must be ${F.bosses[ch]}`);
  }
  for (const e of Object.values(DATA.enemies)) {
    const r = DATA.rosterById[e.id];
    if (!r) { bad.push(`enemy ${e.id} is not in the fixed roster (ids are law; ask the lead to add it to CONTENT_SPEC 4 and DATA.ROSTER)`); continue; }
    if (e.chapter !== r.chapter || e.tier !== r.tier || e.size !== r.size) bad.push(`enemy ${e.id}: chapter/tier/size must be ${r.chapter}/${r.tier}/${r.size}, is ${e.chapter}/${e.tier}/${e.size}`);
    if (!e.art || e.art.id !== e.id) bad.push(`enemy ${e.id}: art.id must equal the id`);
  }
  const gid = new Set();
  for (const ch of [1, 2, 3]) for (const kind of ['normal', 'elite']) for (const grp of DATA.encounters[ch][kind]) {
    if (gid.has(grp.id)) bad.push(`encounter group id ${grp.id} is used twice`); gid.add(grp.id);
    if (grp.id.indexOf('ch' + ch + '_') !== 0) bad.push(`encounter group ${grp.id} must be prefixed ch${ch}_`);
    grp.enemies.forEach((id) => { const r = DATA.rosterById[id]; if (!r) bad.push(`group ${grp.id}: "${id}" is not in the roster`); else if (r.chapter !== ch) bad.push(`group ${grp.id}: ${id} belongs to chapter ${r.chapter}`); });
  }
  for (const id of F.curses) if (!/^curse_[a-z_]+$/.test(id)) bad.push(`FIXED.curses "${id}"`);
  for (const id of F.statusCards) if (!/^status_[a-z_]+$/.test(id)) bad.push(`FIXED.statusCards "${id}"`);
  for (const [id, rar] of Object.entries(F.relics)) if (L.relicRarities.indexOf(rar) < 0) bad.push(`FIXED.relics ${id}: rarity ${rar}`);
  for (const id of F.lore) if (!/^(intro|victory|defeat|ch\d_(intro|clear)|hero_[a-z]+|barks_[a-z]+)$/.test(id)) bad.push(`FIXED.lore "${id}"`);
  for (const h of L.heroIds) if (F.lore.indexOf('hero_' + h) < 0 || F.lore.indexOf('barks_' + h) < 0) bad.push(`FIXED.lore lacks hero_${h} or barks_${h}`);
  t.eq(bad.length, 0, fail(bad, 'roster and fixed ids'));
});
t.test('every populated registry validates, per hero and per chapter', () => {
  if (noData) return;
  const bad = [];
  const run = (label, kind, opt) => { const v = DATA.validate(kind, opt); v.errors.forEach((e) => bad.push(`${label}: ${e}`)); };
  run('heroes', 'heroes');
  const n = (k) => Object.keys(DATA[k] || {}).length;
  for (const k of ['gems', 'relics', 'events', 'achievements', 'trials', 'lore']) if (n(k)) run(k, k);
  if (DATA.tips.length) run('tips', 'tips');
  for (const h of L.heroIds.concat(['shared'])) if (DATA.cardsBy && Object.values(DATA.cards).some((c) => (h === 'shared' ? c.hero === 'curse' || c.hero === 'status' : c.hero === h))) run('cards ' + h, 'cards', { hero: h });
  for (const ch of L.chapters) if (Object.values(DATA.enemies).some((e) => e.chapter === ch)) run('enemies ch' + ch, 'enemies', { chapter: ch });
  if (STRICT) {
    run('strict', undefined, { strict: true });
    DATA.audit().filter((l) => /^audit /.test(l)).forEach((l) => bad.push(l));
    for (const k of ['cards', 'gems', 'relics', 'enemies', 'events', 'achievements', 'trials', 'lore']) if (!n(k)) bad.push(`strict: registry ${k} is empty`);
    if (DATA.tips.length < DATA.QUOTA.tips) bad.push(`strict: ${DATA.tips.length} tips, need ${DATA.QUOTA.tips}`);
  }
  t.eq(bad.length, 0, fail(bad, 'content validation'));
});
t.test('U basics', () => {
  const { U } = boot({ only: ['util'] });
  const a = U.rng(7), b = U.rng(7);
  t.eq(a(), b(), 'rng deterministic');
  const r = U.rng(99); r(); r();
  const r2 = U.rng(r.seed());
  t.eq(r(), r2(), 'rng resumable from seed()');
  t.ok(U.rng(0)() !== U.rng(1)(), 'rng(0) and rng(1) are different streams');
  t.eq(U.roman(3), 'III', 'roman');
  t.eq(U.color.hex(255, 0, 128), '#ff0080', 'colour hex');
  t.eq(U.rng(1).shuffle([1, 2, 3, 4, 5]).length, 5, 'shuffle keeps length');
  t.ok(U.hash('a', 'b') === U.hash('a', 'b') && U.hash('a', 'b') !== U.hash('b', 'a'), 'hash is stable and order sensitive');
});

t.done();
