// Drop the Bass i18n tool. Scans drop_the_bass/js/*.js for t('key', 'English', ...) and tn('key', n, 'one', 'many', ...) calls
// with static string literals and writes drop_the_bass/js/lang/en.js. Also checks and stubs the translations.
//   node tools/dtb_i18n.mjs            extract: write js/lang/en.js, report problems (exit 1 on errors)
//   node tools/dtb_i18n.mjs --check    verify da, nl, de against en.js (missing keys, placeholders, plural bars, em dashes, untranslated)
//   node tools/dtb_i18n.mjs --stub     create or extend da, nl, de so every key exists (missing ones get the English text), keeps translations
//   options: --root <dir> (a folder that has js/, default drop_the_bass), --strict (with --check: untranslated English is an error), --quiet
// Reads the source with a small JS tokenizer (comments, strings with escapes, template literals, regex literals), so quotes inside
// strings and comments never confuse it. Only calls whose key and text are static literals (strings, templates without ${}, or
// literals joined with +) are extracted; anything else is listed as "dynamic" and has to be fixed by the author.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ROOT = path.resolve(HERE, '..', 'drop_the_bass');
export const OTHER_LANGS = ['da', 'nl', 'de'];
export const KEY_RE = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;
export const EM_DASH = '\u2014';

// ------------------------------------------------------------------------------------------------ tokenizer
// tokens: { t: 'id'|'str'|'tpl'|'num'|'p', v, line, dyn } ; 'tpl' with dyn=true has ${} inside; str/tpl values are decoded
function decode(raw, i, q) {   // raw escape handling from index i (after the backslash); returns [text, nextIndex]
  const c = raw[i];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (c === 'u') {
    if (raw[i + 1] === '{') { const e = raw.indexOf('}', i); return [String.fromCodePoint(parseInt(raw.slice(i + 2, e), 16)), e + 1]; }
    return [String.fromCharCode(parseInt(raw.slice(i + 1, i + 5), 16)), i + 5];
  }
  if (c === 'x') return [String.fromCharCode(parseInt(raw.slice(i + 1, i + 3), 16)), i + 3];
  if (c === '\r' && raw[i + 1] === '\n') return ['', i + 2];
  if (c === '\n' || c === '\r' || c === ' ' || c === ' ') return ['', i + 1];
  if (c in simple && !(c === '0' && /\d/.test(raw[i + 1] || ''))) return [simple[c], i + 1];
  return [c, i + 1];
}
export function tokenize(src) {
  const toks = []; let i = 0, line = 1; const n = src.length;
  const prevAllowsRegex = () => {
    const p = toks[toks.length - 1];
    if (!p) return true;
    if (p.t === 'num' || p.t === 'str' || p.t === 'tpl') return false;
    if (p.t === 'id') return /^(return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/.test(p.v);
    return !(p.v === ')' || p.v === ']' || p.v === '}');
  };
  const skipTemplate = (start) => {   // from just after the opening backtick; returns { text, dyn, end }
    let j = start, text = '', dyn = false;
    while (j < n && src[j] !== '`') {
      if (src[j] === '\\') { const [s, nx] = decode(src, j + 1); text += s; j = nx; continue; }
      if (src[j] === '$' && src[j + 1] === '{') {
        dyn = true; let depth = 1; j += 2;
        while (j < n && depth > 0) {
          const ch = src[j];
          if (ch === '{') depth++; else if (ch === '}') depth--;
          else if (ch === '"' || ch === "'") { const q = ch; j++; while (j < n && src[j] !== q) { if (src[j] === '\\') j++; j++; } }
          else if (ch === '`') { j = skipTemplate(j + 1).end; continue; }
          j++;
        }
        continue;
      }
      text += src[j]; j++;
    }
    return { text, dyn, end: j + 1 };
  };
  while (i < n) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; for (let k = i; k < end; k++) if (src[k] === '\n') line++; i = end; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = ''; const l0 = line;
      while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') { if (src[j + 1] === '\n') line++; const [t, nx] = decode(src, j + 1); s += t; j = nx; } else { s += src[j]; j++; } }
      toks.push({ t: 'str', v: s, line: l0 }); i = j + 1; continue;
    }
    if (c === '`') {
      const l0 = line, r = skipTemplate(i + 1);
      for (let k = i; k < r.end; k++) if (src[k] === '\n') line++;
      toks.push({ t: 'tpl', v: r.text, dyn: r.dyn, line: l0 }); i = r.end; continue;
    }
    if (c === '/' && prevAllowsRegex()) {   // regex literal
      let j = i + 1, cls = false;
      while (j < n && src[j] !== '\n') { if (src[j] === '\\') j++; else if (src[j] === '[') cls = true; else if (src[j] === ']') cls = false; else if (src[j] === '/' && !cls) break; j++; }
      j++; while (j < n && /[a-z]/i.test(src[j])) j++;
      toks.push({ t: 'num', v: 'regex', line }); i = j; continue;
    }
    if (/[A-Za-z_$]/.test(c)) { let j = i + 1; while (j < n && /[\w$]/.test(src[j])) j++; toks.push({ t: 'id', v: src.slice(i, j), line }); i = j; continue; }
    if (/[0-9]/.test(c)) { let j = i + 1; while (j < n && /[\w.]/.test(src[j])) j++; toks.push({ t: 'num', v: src.slice(i, j), line }); i = j; continue; }
    toks.push({ t: 'p', v: c, line }); i++;
  }
  return toks;
}

// ------------------------------------------------------------------------------------------------ extraction
const isLit = (k) => k && (k.t === 'str' || (k.t === 'tpl' && !k.dyn));
// parse a static string expression starting at index i: literal ( + literal )*, only if followed by , or ). returns [text, next] or null
function parseStatic(toks, i) {
  if (!isLit(toks[i])) return null;
  let s = toks[i].v; i++;
  while (toks[i] && toks[i].t === 'p' && toks[i].v === '+' && isLit(toks[i + 1])) { s += toks[i + 1].v; i += 2; }
  const f = toks[i]; if (!f || f.t !== 'p' || (f.v !== ',' && f.v !== ')')) return null;
  return [s, i];
}
function skipExpr(toks, i) {   // to the next top-level ',' or ')' ; returns its index
  let d = 0;
  for (; i < toks.length; i++) {
    const v = toks[i].t === 'p' ? toks[i].v : '';
    if (v === '(' || v === '[' || v === '{') d++;
    else if (v === ')' || v === ']' || v === '}') { if (d === 0) return i; d--; }
    else if (v === ',' && d === 0) return i;
  }
  return i;
}
// returns { entries: [{ kind: 't'|'tn', key, en, line }], dynamic: [{ fn, line, why }] } ; for tn, en is 'one|many'
export function extract(src, file = '') {
  const toks = tokenize(src), entries = [], dynamic = [];
  for (let i = 0; i < toks.length; i++) {
    const k = toks[i];
    if (k.t !== 'id' || (k.v !== 't' && k.v !== 'tn')) continue;
    const prev = toks[i - 1];
    if (prev && prev.t === 'p' && (prev.v === '.' )) continue;                       // obj.t(...)
    if (prev && prev.t === 'id' && /^(function|const|let|var|class|import|export|async)$/.test(prev.v)) continue;   // a definition
    const open = toks[i + 1]; if (!open || open.t !== 'p' || open.v !== '(') continue;
    const fn = k.v, line = k.line;
    const keyTok = toks[i + 2];
    if (!isLit(keyTok)) { dynamic.push({ file, fn, line, why: 'key is not a string literal' }); continue; }
    const key = keyTok.v;
    if (toks[i + 3] && toks[i + 3].t === 'p' && toks[i + 3].v !== ',') { dynamic.push({ file, fn, line, why: 'unexpected call shape', key }); continue; }
    if (fn === 't') {
      const r = parseStatic(toks, i + 4);
      if (!r) { dynamic.push({ file, fn, line, why: 'English text is not a static string literal', key }); continue; }
      entries.push({ kind: 't', key, en: r[0], line, file });
    } else {
      let j = skipExpr(toks, i + 4);                       // the n argument
      if (!toks[j] || toks[j].v !== ',') { dynamic.push({ file, fn, line, why: 'tn needs n, one and many', key }); continue; }
      const a = parseStatic(toks, j + 1);
      if (!a || toks[a[1]].v !== ',') { dynamic.push({ file, fn, line, why: 'singular is not a static string literal', key }); continue; }
      const b = parseStatic(toks, a[1] + 1);
      if (!b) { dynamic.push({ file, fn, line, why: 'plural is not a static string literal', key }); continue; }
      entries.push({ kind: 'tn', key, en: a[0] + '|' + b[0], one: a[0], many: b[0], line, file });
    }
  }
  return { entries, dynamic };
}
export const placeholders = (s) => [...new Set([...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
export const barCount = (s) => (String(s).match(/\|/g) || []).length;

export function listSources(jsDir) {
  return fs.readdirSync(jsDir, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.js') && !/^i18n/.test(e.name)).map((e) => e.name).sort();
}
// scan a js folder; returns { en: {key: text}, problems: [{ level, msg }], dynamic, count }
export function scan(jsDir) {
  const en = {}, first = {}, kinds = {}, problems = [], dynamic = [];
  const err = (msg) => problems.push({ level: 'error', msg });
  for (const f of listSources(jsDir)) {
    const r = extract(fs.readFileSync(path.join(jsDir, f), 'utf8'), f);
    dynamic.push(...r.dynamic);
    for (const e of r.entries) {
      const where = f + ':' + e.line;
      if (!KEY_RE.test(e.key)) err('malformed key "' + e.key + '" (' + where + '): use lowercase_words.with_dots');
      if (e.en.includes(EM_DASH)) err('em dash in "' + e.key + '" (' + where + ')');
      if (e.kind === 'tn') {
        if (e.one.includes('|') || e.many.includes('|')) err('"|" inside a plural text of "' + e.key + '" (' + where + ')');
        const a = placeholders(e.one).filter((x) => x !== 'n').join(','), b = placeholders(e.many).filter((x) => x !== 'n').join(',');
        if (a !== b) err('placeholder mismatch between singular and plural of "' + e.key + '" (' + where + '): {' + a + '} vs {' + b + '}');
      }
      if (e.key in en) {
        if (en[e.key] !== e.en || kinds[e.key] !== e.kind) err('duplicate key "' + e.key + '" with different English: ' + first[e.key] + ' vs ' + where + '\n      ' + JSON.stringify(en[e.key]) + '\n      ' + JSON.stringify(e.en));
        continue;
      }
      en[e.key] = e.en; first[e.key] = where; kinds[e.key] = e.kind;
    }
  }
  for (const d of dynamic) problems.push({ level: 'warn', msg: 'dynamic ' + d.fn + '() at ' + d.file + ':' + d.line + ': ' + d.why + (d.key ? ' (' + d.key + ')' : '') });
  const sorted = Object.fromEntries(Object.keys(en).sort().map((k) => [k, en[k]]));
  return { en: sorted, problems, dynamic, kinds, count: Object.keys(en).length };
}

// ------------------------------------------------------------------------------------------------ files
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029') + "'";
export function dictSource(dict, header) {
  return (header ? '// ' + header + '\n' : '') + 'export default {\n' + Object.keys(dict).sort().map((k) => '  ' + q(k) + ': ' + q(dict[k]) + ',').join('\n') + '\n};\n';
}
export async function loadDict(file) {
  if (!fs.existsSync(file)) return null;
  const m = await import(pathToFileURL(file).href + '?v=' + fs.statSync(file).mtimeMs + '_' + Math.random());
  return m.default && typeof m.default === 'object' ? m.default : null;
}
export function writeIfChanged(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) return false;
  fs.writeFileSync(file, text); return true;
}

// check one translation dictionary against en. returns { errors: [], warns: [], missing: [], extra: [], same: [] }
export function checkDict(en, kinds, dict, code) {
  const r = { errors: [], warns: [], missing: [], extra: [], same: [] };
  if (!dict) { r.errors.push(code + '.js is missing or has no default export'); r.missing = Object.keys(en); return r; }
  for (const k of Object.keys(en)) {
    if (!(k in dict)) { r.missing.push(k); continue; }
    const v = dict[k], e = en[k];
    if (typeof v !== 'string') { r.errors.push(k + ': value is not a string'); continue; }
    if (v.includes(EM_DASH)) r.errors.push(k + ': em dash');
    const ph = (s) => placeholders(s).join(',');
    if (ph(v) !== ph(e)) r.errors.push(k + ': placeholders {' + ph(v) + '} differ from English {' + ph(e) + '}');
    if (kinds[k] === 'tn' || e.includes('|')) { if (barCount(v) !== barCount(e)) r.errors.push(k + ': plural needs "one|many" (' + barCount(e) + ' bar), found ' + barCount(v)); }
    else if (v.includes('|') && !e.includes('|')) r.warns.push(k + ': contains "|" but is not a plural');
    if (v === e && e.length > 12) r.same.push(k);
  }
  for (const k of Object.keys(dict)) if (!(k in en)) r.extra.push(k);
  return r;
}

// ------------------------------------------------------------------------------------------------ main
async function main(argv) {
  const has = (f) => argv.includes(f);
  const ri = argv.indexOf('--root');
  const root = ri >= 0 ? path.resolve(argv[ri + 1]) : DEFAULT_ROOT;
  const jsDir = path.join(root, 'js'), langDir = path.join(jsDir, 'lang');
  const quiet = has('--quiet'), log = (...a) => { if (!quiet) console.log(...a); };
  const s = scan(jsDir);
  const bad = s.problems.filter((p) => p.level === 'error');
  for (const p of s.problems) console.log((p.level === 'error' ? 'ERROR ' : 'warn  ') + p.msg);
  if (has('--check') || has('--stub')) {
    const enFile = path.join(langDir, 'en.js');
    const enOld = await loadDict(enFile);
    if (!enOld) { console.log('ERROR js/lang/en.js is missing: run without options first'); return 1; }
    const stale = Object.keys(s.en).filter((k) => enOld[k] !== s.en[k]).length + Object.keys(enOld).filter((k) => !(k in s.en)).length;
    if (stale) console.log('warn  en.js is out of date with the source (' + stale + ' differences): run node tools/dtb_i18n.mjs');
    let fail = bad.length > 0;
    for (const code of OTHER_LANGS) {
      const file = path.join(langDir, code + '.js');
      let dict = await loadDict(file);
      if (has('--stub')) {
        const merged = Object.assign({}, dict || {});
        let added = 0;
        for (const k of Object.keys(enOld)) if (!(k in merged)) { merged[k] = enOld[k]; added++; }
        const removed = Object.keys(merged).filter((k) => !(k in enOld));
        for (const k of removed) delete merged[k];
        const ch = writeIfChanged(file, dictSource(merged, code + ': translations. Keys come from en.js (tools/dtb_i18n.mjs --stub keeps them in sync); an entry equal to the English text is not translated yet.'));
        log(code + ': ' + (ch ? 'wrote' : 'unchanged') + ' ' + file.replace(root + path.sep, '') + ' (' + added + ' stubbed, ' + removed.length + ' removed)');
        dict = merged;
      }
      if (has('--check')) {
        const r = checkDict(enOld, s.kinds, dict, code);
        log(code + ': ' + Object.keys(dict || {}).length + '/' + Object.keys(enOld).length + ' keys, ' + r.missing.length + ' missing, ' + r.extra.length + ' extra, ' + r.same.length + ' untranslated (identical English), ' + r.errors.length + ' errors');
        for (const m of r.missing.slice(0, 40)) console.log('  missing ' + m);
        if (r.missing.length > 40) console.log('  ... ' + (r.missing.length - 40) + ' more missing');
        for (const m of r.extra) console.log('  extra   ' + m);
        for (const m of r.errors) console.log('  ERROR   ' + m);
        for (const m of r.warns) console.log('  warn    ' + m);
        for (const m of r.same.slice(0, 20)) console.log('  suspicious (same as English) ' + m);
        if (r.same.length > 20) console.log('  ... ' + (r.same.length - 20) + ' more suspicious');
        if (r.errors.length || r.missing.length || (has('--strict') && r.same.length)) fail = true;
      }
    }
    return fail ? 1 : 0;
  }
  const changed = writeIfChanged(path.join(langDir, 'en.js'), dictSource(s.en, 'en: the English source texts, GENERATED by tools/dtb_i18n.mjs from the t() and tn() calls in js/*.js. Do not edit by hand. Plurals are "one|many".'));
  log('en.js: ' + s.count + ' keys (' + Object.keys(s.kinds).filter((k) => s.kinds[k] === 'tn').length + ' plurals), ' + (changed ? 'written' : 'unchanged') + ', ' + s.dynamic.length + ' dynamic calls, ' + bad.length + ' errors');
  return bad.length ? 1 : 0;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv.slice(2)).then((c) => { process.exitCode = c; });
