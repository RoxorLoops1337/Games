// Stacking Cats: languages. The game is written in English. A second language is applied on the screen: every text node and label is looked up
// in a dictionary (lang/da.js), so a string the dictionary does not know simply stays English.
//
// Dictionary keys are the English text as it appears on the screen:
//   '#'   in a key matches a number            'Wave #'            -> 'Bolge {1}'
//   '{}'  in a key matches any text            'Best on {}: #'     -> 'Bedst paa {1}: {2}'
//   '{n}' in a value is the nth match of the key, counting numbers and wildcards in order of appearance (matched text is translated too)
// A text that is not found as a whole is tried sentence by sentence.
export const LANGS = [['auto', 'Auto'], ['en', 'English'], ['da', 'Dansk']];
export const SHOWN = ['en', 'da'];   // the languages with their own button
const NUM = '-?\\d+(?:[.,]\\d+)*';
const NUM_RE = new RegExp(NUM, 'g');

let lang = 'en', loaded = new Set();
export const missing = new Set();   // texts shown in another language that the dictionary did not know (for the coverage tool)
export const getLang = () => lang;

// 'auto' follows the browser: any Danish setting picks Danish, everything else English
export function resolveLang(pref, navLangs) {
  if (pref === 'en' || pref === 'da') return pref;
  const list = navLangs || (typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en']) : ['en']);
  for (const l of list) { const c = String(l || '').toLowerCase(); if (c.startsWith('da')) return 'da'; if (c.startsWith('en')) return 'en'; }
  return 'en';
}

// build the lookup tables from a flat dictionary
export function compile(dict) {
  const ex = new Map(), wl = [];
  for (const k of Object.keys(dict)) {
    const v = dict[k];
    if (k.includes('{}') || k.includes('#')) {
      const parts = k.split(/(\{\}|#)/), kinds = [];
      let src = '';
      for (const p of parts) {
        if (p === '{}') { src += '(.+?)'; kinds.push('w'); } else if (p === '#') { src += '(' + NUM + ')'; kinds.push('n'); } else src += p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      let v2 = v;
      if (v2.includes('#')) { const nums = kinds.map((x, i) => (x === 'n' ? i + 1 : 0)).filter(Boolean); let q = 0; v2 = v2.replace(/#/g, () => '{' + (nums[q++] || nums[nums.length - 1] || 1) + '}'); }   // a bare # in a value stands for the next number of the key
      wl.push({ re: new RegExp('^' + src + '$'), v: v2, lit: k.replace(/\{\}|#/g, '').length, hasW: kinds.includes('w'), sep: k.includes(' \u00B7 ') });
    } else ex.set(k, v);
  }
  // the most specific patterns first: the one with the most fixed text, wildcards after plain numbers
  wl.sort((a, b) => a.hasW - b.hasW || b.lit - a.lit);
  return { ex, wl };
}

let cur = { ex: new Map(), wl: [] };
const fill = (v, caps) => v.replace(/\{(\d+)\}/g, (m, i) => { const c = caps[+i - 1]; return c == null ? m : /^-?\d+(?:[.,]\d+)*$/.test(c) ? c : tr(c); });

// translate one piece of text (null when the dictionary has nothing for it)
function lookup(t) {
  if (!t) return null;
  const hit = cur.ex.get(t);
  if (hit != null) return hit;
  for (const p of cur.wl) {
    const m = p.re.exec(t);
    if (!m) continue;
    // a wildcard that swallowed English prose it could not translate is no answer (a name like 'Lucky Shell' is fine)
    if (p.hasW && !p.sep && m.slice(1).some((c) => c.includes(' \u00B7 ') || (c.split(/\s+/).length >= 3 && /\b[a-z]{3,}\b/.test(c) && tr(c) === c))) continue;
    const r = fill(p.v, m.slice(1));
    if (r !== t) return r;   // a pattern that changes nothing is no answer
  }
  return null;
}
// a whole text: as it is, with its numbers, then sentence by sentence
export function tr(s) {
  if (lang === 'en' || !s || typeof s !== 'string') return s;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
  if (!core) return s;
  let out = lookup(core);
  if (out == null) out = bySentence(core);
  if (out == null) out = pieces(core);
  return out == null ? s : lead + out + tail;
}
// texts built from known parts: a symbol in front, 'Name: text', 'Name, rarity', 'Name (key 3): text' (each part is looked up on its own)
function parens(core) {
  if (!core.includes('(')) return null;
  let any = false;
  const out = core.split(/(\((?:[^()]|\([^()]*\))+\))/).map((part) => {
    if (!part) return part;
    if (part[0] === '(' && part[part.length - 1] === ')') { const inner = part.slice(1, -1), r = lookupAny(inner); if (r != null) { any = true; return '(' + r + ')'; } return part; }
    const m = /^(\s*[.,;:!?]*\s*)([\s\S]*?)(\s*)$/.exec(part);
    if (!m[2]) return part;
    const r = lookup(m[2]) != null ? lookup(m[2]) : bySentence(m[2]);
    if (r != null) { any = true; return m[1] + r + m[3]; }
    return part;
  }).join('');
  return any ? out : null;
}
function pieces(core) {
  const pr = parens(core);
  if (pr != null) return pr;
  let m = /^([^\p{L}\p{N}]+?)\s+(\p{L}.*)$/u.exec(core);
  if (m) { const r = lookupAny(m[2]); if (r != null) return m[1] + ' ' + r; }
  m = /^(.+?) \(key (\d+)\): (.+)$/.exec(core);
  if (m) { const a = lookupAny(m[1]), b = lookupAny(m[3]); if (a != null || b != null) return (a != null ? a : m[1]) + ' (tast ' + m[2] + '): ' + (b != null ? b : m[3]); }
  for (const [sep, outSep] of [[': ', ': '], [', ', ', '], [' \u00B7 ', ' \u00B7 '], [' and ', ' og ']]) {
    const i = core.indexOf(sep);
    if (i > 0) { const a = lookupAny(core.slice(0, i)), b = lookupAny(core.slice(i + sep.length)); if (a != null || b != null) return (a != null ? a : core.slice(0, i)) + outSep + (b != null ? b : core.slice(i + sep.length)); }
  }
  return null;
}
// a text of several sentences: the longest run of sentences the dictionary knows is taken first, then shorter ones, then single sentences
function bySentence(core) {
  const parts = core.split(/(?<=[.!?])\s+/);
  if (parts.length < 2) return null;
  const out = []; let any = false;
  for (let i = 0; i < parts.length;) {
    let done = false;
    for (let j = parts.length; j > i; j--) {
      const r = lookup(parts.slice(i, j).join(' '));
      if (r != null) { out.push(r); i = j; any = true; done = true; break; }
    }
    if (!done) { const r = pieces(parts[i]); if (r != null) any = true; out.push(r != null ? r : parts[i]); i++; }
  }
  return any ? out.join(' ') : null;
}
// a part: as a whole, or by its own sentences
function lookupAny(t) {
  const r = lookup(t);
  if (r != null) return r;
  const bs = bySentence(t);
  if (bs != null) return bs;
  return pieces(t);
}

// ---- the dictionary
export async function setLang(pref) {
  const next = resolveLang(pref);
  if (next !== 'en' && !loaded.has(next)) {
    try {
      const mod = await import(`./lang/${next}.js`);
      cur = compile(mod.default || mod.DICT); loaded.add(next);
    } catch (e) { lang = 'en'; return 'en'; }
  }
  lang = next;
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  return lang;
}
// for tests and tools: use a dictionary object directly
export function useDict(code, dict) { cur = compile(dict); lang = code; }

// ---- the screen: translate text nodes and labels, and keep doing it as the game changes them
const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];
const SKIP = new Set(['SCRIPT', 'STYLE', 'CANVAS', 'TEXTAREA', 'INPUT', 'NOSCRIPT']);
const nodeSrc = new WeakMap();   // text node -> { en, out }
const attrSrc = new WeakMap();   // element -> { attr: { en, out } }
let obs = null, root = null;

function doText(n) {
  const rec = nodeSrc.get(n), cv = n.nodeValue;
  let en;
  if (rec && cv === rec.out) en = rec.en;           // still what we wrote
  else en = cv;                                      // new text from the game
  const out = lang === 'en' ? en : tr(en);
  if (lang !== 'en' && out === en && /[A-Za-z]{3}/.test(en)) missing.add(en.trim());
  if (out !== cv) n.nodeValue = out;
  if (out !== en || rec) nodeSrc.set(n, { en, out });
}
function doAttr(el, a) {
  const cv = el.getAttribute(a);
  if (cv == null) return;
  let m = attrSrc.get(el); if (!m) { m = {}; attrSrc.set(el, m); }
  const rec = m[a];
  const en = rec && cv === rec.out ? rec.en : cv;
  const out = lang === 'en' ? en : tr(en);
  if (lang !== 'en' && out === en && /[A-Za-z]{3}/.test(en)) missing.add(en.trim());
  if (out !== cv) el.setAttribute(a, out);
  m[a] = { en, out };
}
function skipped(el) { for (let e = el; e && e.nodeType === 1; e = e.parentNode) { if (SKIP.has(e.tagName) || e.hasAttribute('data-no-tr')) return true; } return false; }
export function translateTree(node) {
  if (!node) return;
  if (node.nodeType === 3) { if (!skipped(node.parentNode)) doText(node); return; }
  if (node.nodeType !== 1 || skipped(node)) return;
  const w = document.createTreeWalker(node, 1 | 4, { acceptNode: (n) => (n.nodeType === 1 && (SKIP.has(n.tagName) || n.hasAttribute('data-no-tr')) ? 2 : 1) });
  for (let n = w.currentNode; n; n = w.nextNode()) {
    if (n.nodeType === 3) doText(n);
    else if (n.nodeType === 1) for (const a of ATTRS) if (n.hasAttribute(a)) doAttr(n, a);
  }
}
// start translating (and keep translating what the game adds or changes)
export function startDom(rootEl = document.body) {
  root = rootEl;
  if (obs) return;
  obs = new MutationObserver((recs) => {
    if (lang === 'en' && !nodeSrc.size) return;
    for (const r of recs) {
      if (r.type === 'childList') r.addedNodes.forEach((n) => translateTree(n));
      else if (r.type === 'characterData') { if (!skipped(r.target.parentNode)) doText(r.target); }
      else if (r.type === 'attributes' && !skipped(r.target)) doAttr(r.target, r.attributeName);
    }
    obs.takeRecords();   // our own writes are not news
  });
  obs.observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  retranslate();
}
// after a language change: everything already on the screen is redone (the English source of each text is remembered)
export function retranslate() {
  if (!root) return;
  translateTree(root);
  if (typeof document !== 'undefined' && lang !== 'en') { const t = document.title; if (!document.documentElement.dataset.enTitle) document.documentElement.dataset.enTitle = t; document.title = tr(document.documentElement.dataset.enTitle); }
  else if (typeof document !== 'undefined' && document.documentElement.dataset.enTitle) document.title = document.documentElement.dataset.enTitle;
  if (obs) obs.takeRecords();
}
