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
      wl.push({ re: new RegExp('^' + src + '$'), v, lit: k.replace(/\{\}|#/g, '').length, hasW: kinds.includes('w') });
    } else ex.set(k, v);
  }
  // the most specific patterns first: the one with the most fixed text, wildcards after plain numbers
  wl.sort((a, b) => a.hasW - b.hasW || b.lit - a.lit);
  return { ex, wl };
}

let cur = { ex: new Map(), wl: [] };
const fill = (v, caps) => v.replace(/\{(\d+)\}/g, (m, i) => { const c = caps[+i - 1]; return c == null ? m : /^-?\d/.test(c) ? c : tr(c); });

// translate one piece of text (null when the dictionary has nothing for it)
function lookup(t) {
  if (!t) return null;
  const hit = cur.ex.get(t);
  if (hit != null) return hit;
  for (const p of cur.wl) { const m = p.re.exec(t); if (m) return fill(p.v, m.slice(1)); }
  return null;
}
// a whole text: as it is, with its numbers, then sentence by sentence
export function tr(s) {
  if (lang === 'en' || !s || typeof s !== 'string') return s;
  const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
  if (!core) return s;
  let out = lookup(core);
  if (out == null) {
    const parts = core.split(/(?<=[.!?])\s+/);
    if (parts.length > 1) {
      let any = false;
      const tp = parts.map((p) => { const r = lookup(p); if (r != null) any = true; return r != null ? r : p; });
      if (any) out = tp.join(' ');
    }
  }
  return out == null ? s : lead + out + tail;
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
