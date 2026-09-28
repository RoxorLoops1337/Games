// Clawspire -- I18N (round 13). English / Dutch localization.
//
// English is the source of truth: a key IS the English string the game
// already shows ("END TURN", "Deal {n} damage"), so an untranslated key falls
// back to readable English and never to a raw id. A language table
// (js/lang_nl.js) maps those English keys to its own words:
//
//   T(key, vars)            the key in the current language, {var} filled in;
//                           {n|one|many} picks a word by the number n
//   TP(n, one, many, vars)  T(one) when n is 1, else T(many), with {n}
//   TC(kind, id, field)     DATA content (an item's name, a status's text...)
//                           in the current language, the English DATA field
//                           as the fallback
//   I18N.tr(str)            an English string the game built at run time
//                           ("Deal 6 damage") back through the table: an
//                           exact key, a content name, then the {var}
//                           patterns ("Deal {n} damage" -> "Doe {n} schade")
//
// game.js runs its DOM helpers (h, btn, toast, hint, the banner) and render.js
// its canvas words through I18N.tr, and in a browser a MutationObserver
// (I18N.watch) catches the text the game sets by hand, so the old code keeps
// passing English around and only the display changes. English costs nothing:
// tr returns its input at once.
const I18N = (() => {
  'use strict';
  const LANGS = ['en', 'nl'];
  const NAMES = { en: 'English', nl: 'Nederlands' };
  const TAB = {};            // code -> { ui: {en: str}, content: {kind: {id: {field: str}}} }
  let lang = 'en';
  let comp = null;           // the compiled patterns and content index of the current language
  const cache = new Map();
  const CACHE_MAX = 6000;
  const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

  // Register (or extend) a language table. Later calls merge into earlier ones.
  function add(code, t) {
    if (!t || typeof t !== 'object') return;
    const cur = TAB[code] || (TAB[code] = { ui: {}, content: {} });
    Object.assign(cur.ui, t.ui || {});
    for (const kind in (t.content || {})) {
      const dst = cur.content[kind] || (cur.content[kind] = {});
      for (const id in t.content[kind]) dst[id] = Object.assign(dst[id] || {}, t.content[kind][id]);
    }
    if (code === lang) { comp = null; cache.clear(); }
  }

  // nl, nl-NL, nl-BE ... -> Dutch; anything else -> English.
  function detect(nav) {
    let l = '';
    try {
      const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
      l = (n && ((n.languages && n.languages[0]) || n.language || n.userLanguage)) || '';
    } catch (e) { l = ''; }
    return /^nl(\b|[-_])/i.test(String(l)) ? 'nl' : 'en';
  }
  // The language a settings object asks for: its saved override, else the browser's.
  function pick(settings, nav) {
    const o = settings && settings.lang;
    return LANGS.indexOf(o) >= 0 ? o : detect(nav);
  }

  function set(code) {
    const next = LANGS.indexOf(code) >= 0 ? code : 'en';
    if (next !== lang) { lang = next; comp = null; cache.clear(); }
    try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = lang; } catch (e) { /* headless */ }
    watch();
    return lang;
  }
  const get = () => lang;
  const table = (code) => TAB[code || lang] || null;

  // ---------------------------------------------------------------- filling
  // {name} from vars; {n|one|many} picks by the number in vars.n (any var).
  // A var the caller did not pass leaves nothing behind, never "{name}".
  function fill(s, vars) {
    if (typeof s !== 'string' || s.indexOf('{') < 0) return s;
    return s.replace(/\{(\w+)(?:\|([^|{}]*)\|([^|{}]*))?\}/g, (m, k, one, many) => {
      const v = vars ? vars[k] : undefined;
      if (one !== undefined) {
        const num = Number(String(v).replace(/[^\d.-]/g, ''));
        return num === 1 || num === -1 ? one : many;
      }
      return v == null ? '' : String(v);
    });
  }
  function T(key, vars) {
    const t = lang !== 'en' ? TAB[lang] : null;
    const s = t && has(t.ui, key) ? t.ui[key] : key;
    return fill(s, vars);
  }
  function TP(n, one, many, vars) {
    return T(Math.abs(n) === 1 ? one : many, Object.assign({ n }, vars || {}));
  }
  // DATA content: TC('item', 'rusty_sword', 'name'). The English comes from
  // the DATA table itself (DATA_KIND says where), so a missing translation
  // shows the game's own words.
  const DATA_KIND = { item: 'ITEMS', relic: 'RELICS', status: 'STATUS', enemy: 'ENEMIES', char: 'CHARACTERS',
    combo: 'COMBOS', kw: 'ARCHETYPES', claw: 'CLAWS', pet: 'PETS', set: 'SETS', boon: 'BOONS', act: 'ACTS', mut: 'MUTATORS', evo: 'EVOLVED' };
  // (round 14) two more kinds: 'lore' (a Codex page by id: name, text, hint)
  // and 'path', any other DATA words by their dotted path, the field last
  // (TC('path', 'STORIES.sto_crab.beats.start', 'text'), 'GARY_LINES.win' '0',
  // 'ENEMIES.rat.enrage' 'name'). Only strings count, so a story beat whose
  // text is a function goes through the ui patterns instead.
  const i18n14Kinds = {
    lore: (id) => (typeof DATA.loreBook === 'function' ? DATA.loreBook().byId[id] : null),
    path: (id) => { let o = DATA; for (const k of id.split('.')) { if (o == null || typeof o !== 'object') return null; o = o[k]; } return o && typeof o === 'object' ? o : null; },
  };
  function dataField(kind, id, field) {
    try {
      if (typeof DATA === 'undefined' || !DATA) return undefined;
      if (kind === 'move') {   // an enemy's move: id 'enemy.move'
        const [eid, mid] = String(id).split('.');
        const e = DATA.ENEMIES && DATA.ENEMIES[eid];
        const m = e && Array.isArray(e.moves) ? e.moves.find((x) => x && x.id === mid) : null;
        return m ? m[field] : undefined;
      }
      if (i18n14Kinds[kind]) { const o = i18n14Kinds[kind](String(id)); const v = o ? o[field] : undefined; return typeof v === 'string' ? v : undefined; }
      const tb = DATA[DATA_KIND[kind]];
      const def = tb && tb[id];
      if (def && field === 'plusName') return def.plus ? def.plus.name : undefined;
      return def ? def[field] : undefined;
    } catch (e) { return undefined; }
  }
  function TC(kind, id, field) {
    const t = lang !== 'en' ? TAB[lang] : null;
    const c = t && t.content[kind] && t.content[kind][id];
    if (c && has(c, field)) return c[field];
    const en = dataField(kind, id, field);
    return en == null ? '' : en;
  }

  // An item's rules text: its translated template filled by DATA.itemText
  // (fn), so the numbers stay the game's own; the English appended
  // " Exhaust." becomes the table's word. No translation: the English
  // through tr.
  function itemText(def, plus, fn) {
    const t = lang !== 'en' ? TAB[lang] : null;
    const c = t && def && t.content.item && t.content.item[def.id];
    if (!c || !has(c, 'text')) return tr(fn(def, plus));
    let s = String(fn(Object.assign({}, def, { text: c.text }), plus));
    const tail = ' Exhaust.';
    if (s.endsWith(tail)) s = s.slice(0, -tail.length) + (/exhaust/i.test(String(def.text || '')) ? '' : ' ' + T('Exhaust.'));
    return s;
  }

  // ---------------------------------------------------------------- reverse lookup
  // Placeholders named n, n2, n3 ... match a number (with a sign, a unit sign
  // or a percent); any other name matches some text, which is itself looked up.
  const NUM = '([-+−]?\\d[\\d.,]*%?|∞)';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function compile() {
    const t = TAB[lang];
    const out = { exact: new Map(), buckets: new Map(), loose: [], names: new Map() };
    if (!t) return out;
    for (const key in t.ui) {
      if (key.indexOf('{') < 0) { out.exact.set(key, t.ui[key]); continue; }
      const vars = [];
      let re = '', lit = 0, last = 0;
      const rx = /\{(\w+)\}/g;
      let m;
      while ((m = rx.exec(key))) {
        const part = key.slice(last, m.index);
        re += esc(part); lit += part.length;
        vars.push(m[1]);
        re += /^n\d*$/.test(m[1]) ? NUM : '(.+?)';
        last = m.index + m[0].length;
      }
      const tail = key.slice(last);
      re += esc(tail); lit += tail.length;
      if (!vars.length) { out.exact.set(key, t.ui[key]); continue; }
      const pre = key.slice(0, key.indexOf('{'));
      const p = { re: new RegExp('^' + re + '$'), vars, val: t.ui[key], lit, pre, key };
      if (pre.length >= 1) {
        const b = pre[0];
        if (!out.buckets.has(b)) out.buckets.set(b, []);
        out.buckets.get(b).push(p);
      } else out.loose.push(p);
    }
    const bySpec = (a, b) => b.lit - a.lit;
    for (const l of out.buckets.values()) l.sort(bySpec);
    out.loose.sort(bySpec);
    // DATA names in English -> their translation (item and relic names shown whole)
    for (const kind in t.content) {
      for (const id in t.content[kind]) {
        const c = t.content[kind][id];
        for (const f in c) {
          const en = dataField(kind, id, f);
          if (typeof en === 'string' && en && en.indexOf('{') < 0 && !out.exact.has(en)) out.names.set(en, c[f]);
        }
      }
    }
    return out;
  }
  function tryPat(p, s, depth) {
    const m = p.re.exec(s);
    if (!m) return null;
    const vars = {};
    for (let i = 0; i < p.vars.length; i++) {
      const v = m[i + 1];
      vars[p.vars[i]] = /^n\d*$/.test(p.vars[i]) ? v : core(v, depth + 1);
    }
    return fill(p.val, vars);
  }
  function core(s, depth) {
    if (!/[A-Za-z]/.test(s)) return s;
    const c = comp || (comp = compile());
    const e = c.exact.get(s);
    if (e !== undefined) return e;
    const nm = c.names.get(s);
    if (nm !== undefined) return nm;
    // SHOUTED words (a name on the versus card, a banner): the key in capitals
    if (s === s.toUpperCase()) {
      if (!c.caps) {
        c.caps = new Map();
        for (const [k, v] of c.names) c.caps.set(k.toUpperCase(), v.toUpperCase());
        for (const [k, v] of c.exact) c.caps.set(k.toUpperCase(), v.toUpperCase());
      }
      const cp = c.caps.get(s);
      if (cp !== undefined) return cp;
    }
    if (depth > 3) return s;
    const b = c.buckets.get(s[0]);
    if (b) for (const p of b) { if (s.startsWith(p.pre)) { const r = tryPat(p, s, depth); if (r != null) return r; } }
    for (const p of c.loose) { const r = tryPat(p, s, depth); if (r != null) return r; }
    // a lead/trail of spaces, an item's "+", a label's ":" or curly quotes (round 14) stay around the translated core
    const lm = /^(\s*“?)(.*?)(\+?:?”?)(\s*)$/s.exec(s);
    if (lm && (lm[1] || lm[3] || lm[4]) && lm[2] && lm[2] !== s) {
      const r = core(lm[2], depth + 1);
      if (r !== lm[2]) return lm[1] + r + lm[3] + lm[4];
    }
    // an icon in front ("⚙ Settings", "🔒 STICKER"): the words after it
    const im = /^([^A-Za-z0-9"'(<\s+\-\u2212.][^A-Za-z0-9"'(<]*)(.+)$/su.exec(s);
    if (im) {
      const r = core(im[2], depth + 1);
      if (r !== im[2]) return im[1] + r;
    }
    // a list ("Poison 3, Weak 1"): only when every piece is known
    const list = s.split(', ');
    if (list.length > 1) {
      let all = true;
      const out = list.map((p) => { const r = /[A-Za-z]/.test(p) ? core(p, depth + 1) : p; if (r === p && /[A-Za-z]/.test(p)) all = false; return r; });
      if (all) return out.join(', ');
    }
    // "Poison 3": a known word and a number
    const wn = /^(.*[A-Za-z].*?)(\s+[-+\u2212]?\d[\d.,]*%?)$/s.exec(s);
    if (wn) {
      const r = core(wn[1], depth + 1);
      if (r !== wn[1]) return r + wn[2];
    }
    // sentences glued together (a toast of several lines): each on its own
    const parts = s.split(/(?<=[.!?])\s+(?=[A-Z+\d])/);
    if (parts.length > 1) {
      let hit = false;
      const out = parts.map((p) => { const r = core(p, depth + 1); if (r !== p) hit = true; return r; });
      if (hit) return out.join(' ');
    }
    return s;
  }
  // An English string the game built -> the current language (as is when unknown).
  function tr(s) {
    if (lang === 'en' || typeof s !== 'string' || s.length < 2) return s;
    const hit = cache.get(s);
    if (hit !== undefined) return hit;
    let r = s;
    try { r = core(s, 0); } catch (e) { r = s; }
    if (cache.size >= CACHE_MAX) cache.clear();
    cache.set(s, r);
    return r;
  }
  // Is there a translation for this English string (exact, a name or a pattern)?
  function known(s) {
    if (lang === 'en' || tr(s) !== s) return true;
    const c = comp || (comp = compile());
    return c.exact.has(s) || c.names.has(s) || c.caps && c.caps.has(s) || c.exact.has(String(s).trim());
  }

  // ---------------------------------------------------------------- the DOM
  const ATTRS = ['title', 'aria-label', 'placeholder'];
  const SKIP = { SCRIPT: 1, STYLE: 1, CANVAS: 1, TEXTAREA: 1, INPUT: 1 };
  // Translate one text node in place, remembering its English so a switch
  // back (or to another language) can redo it.
  function textNode(n) {
    const v = n.nodeValue;
    if (!v || !/[A-Za-z]/.test(v)) return;
    let en = v;
    if (n.__i18nOut !== undefined && v === n.__i18nOut) en = n.__i18nEn;
    const out = tr(en);
    if (out !== v) { n.__i18nEn = en; n.__i18nOut = out; n.nodeValue = out; }
    else if (en !== v) { n.__i18nEn = en; n.__i18nOut = out; }
  }
  function attrs(el) {
    if (!el.getAttribute) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      if (!v || !/[A-Za-z]/.test(v)) continue;
      const mem = el.__i18nAttr || (el.__i18nAttr = {});
      let en = v;
      if (mem[a] && v === mem[a].out) en = mem[a].en;
      const out = tr(en);
      mem[a] = { en, out };
      if (out !== v) { el.__i18nBusy = true; el.setAttribute(a, out); el.__i18nBusy = false; }
    }
  }
  // Walk a subtree: text nodes and a few attributes. Elements made by
  // game.js's h() carry their English in __i18nSrc and are redone from it.
  function dom(root) {
    if (!root) return 0;
    let n = 0;
    const walk = (el) => {
      if (!el || n > 20000) return;
      if (el.nodeType === 3) { textNode(el); n++; return; }
      if (el.nodeType !== 1 && el.nodeType !== 9 && el.nodeType !== 11) return;
      if (SKIP[el.tagName]) return;
      if (el.nodeType === 1 && el.getAttribute && el.getAttribute('translate') === 'no') return;   // (round 14) a brand name, the HTML way
      if (el.nodeType === 1) {
        attrs(el);
        if (el.__i18nSrc !== undefined && el.childNodes && el.childNodes.length === 1 && el.childNodes[0].nodeType === 3 &&
          el.textContent === el.__i18nOut) {
          const out = tr(el.__i18nSrc);
          if (out !== el.__i18nOut) { el.__i18nOut = out; el.textContent = out; }
          n++;
          return;
        }
      }
      const kids = el.childNodes;
      if (kids) for (let i = 0; i < kids.length; i++) walk(kids[i]);
    };
    try { walk(root); } catch (e) { /* a stub DOM */ }
    return n;
  }
  // The text of a DOM element made by game.js: translated, the English kept.
  function el(e, text) {
    if (!e) return e;
    const out = tr(String(text));
    e.__i18nSrc = String(text); e.__i18nOut = out;
    e.textContent = out;
    return e;
  }
  // A MutationObserver on the document: text the game sets by hand while a
  // non-English language is on (innerHTML, textContent, index.html's own words).
  let obs = null, watching = false;
  function watch() {
    const want = lang !== 'en';
    if (typeof MutationObserver === 'undefined' || typeof document === 'undefined' || !document.body) return false;
    if (!obs) {
      obs = new MutationObserver((list) => {
        if (lang === 'en') return;
        for (const m of list) {
          if (m.type === 'characterData') textNode(m.target);
          else if (m.type === 'attributes') { if (!m.target.__i18nBusy) attrs(m.target); }
          else for (const a of m.addedNodes) dom(a);
        }
      });
    }
    if (want && !watching) {
      try { obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS }); watching = true; } catch (e) { watching = false; }
    } else if (!want && watching) { obs.disconnect(); watching = false; }
    if (want || document.body.__i18nDone) { dom(document.body); document.body.__i18nDone = true; }
    return watching;
  }

  // ---------------------------------------------------------------- checks (the tests)
  const EM = '\u2014';
  function lint(code) {
    const t = TAB[code];
    const bad = { em: [], vars: [], empty: [] };
    if (!t) return bad;
    const vs = (s) => (String(s).match(/\{(\w+)(?=[|}])/g) || []).map((x) => x.slice(1)).sort().join(',');
    for (const k in t.ui) {
      const v = t.ui[k];
      if (k.indexOf(EM) >= 0 || String(v).indexOf(EM) >= 0) bad.em.push(k);
      if (typeof v !== 'string' || !v.trim()) bad.empty.push(k);
      else {
        const a = vs(k).split(',').filter(Boolean), b = vs(v).split(',').filter(Boolean);
        if (b.some((x) => a.indexOf(x) < 0)) bad.vars.push(k);
      }
    }
    for (const kind in t.content) for (const id in t.content[kind]) for (const f in t.content[kind][id]) {
      const v = t.content[kind][id][f];
      if (String(v).indexOf(EM) >= 0) bad.em.push(kind + ':' + id + ':' + f);
      if (typeof v !== 'string' || !v.trim()) bad.empty.push(kind + ':' + id + ':' + f);
    }
    return bad;
  }

  return { LANGS, NAMES, TAB, add, detect, pick, set, get, table, T, TP, TC, fill, tr, known, dom, el, watch, lint, itemText, DATA_KIND };
})();
// The short names the rest of the game calls (English in, current language out).
const T = I18N.T;
const TP = I18N.TP;
const TC = I18N.TC;
