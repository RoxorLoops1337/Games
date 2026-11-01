// Drop the Bass: translations. English, Danish, Dutch, German.
// t(key, en, vars?) returns the string for the current language, falling back to the English default given in code.
//   t('hub.play', 'Play')   t('run.waves', 'Wave {n} of {total}', { n: 3, total: 20 })
// tn(key, n, one, many, vars?) picks the singular or plural form (en, da, nl and de all have one/other) and fills {n}.
// Dictionaries live in js/lang/<code>.js (UI strings, extracted from the t() calls by tools/dtb_i18n.mjs) and js/lang/<code>_data.js
// (optional: names and descriptions of data tables, read through getData(code)). English is always the in-code default.
// The files are imported on demand when a language is set, so English players never download them. See I18N.md.
//
// Language state: the preference is 'auto' (follow the browser, fall back to English) or one of the codes. It lives in
// profile.settings.lang and, for the first paint before the profile loads, in localStorage under LANG_KEY (explicit choices only).
export const LANGS = [{ code: 'en', name: 'English' }, { code: 'da', name: 'Dansk' }, { code: 'nl', name: 'Nederlands' }, { code: 'de', name: 'Deutsch' }];
export const LANG_KEY = 'drop_the_bass_lang';
const CODES = LANGS.map((l) => l.code);
let lang = 'en';
let pref = 'auto';
const dicts = { en: {}, da: {}, nl: {}, de: {} };
const datas = { en: {}, da: {}, nl: {}, de: {} };
const loads = {};          // code -> Promise, set once a language file has been requested
const done = { en: true };  // code -> true once its files settled (loaded or failed)
const listeners = new Set();
export const getLang = () => lang;
export const getLangPref = () => pref;
export const langName = (code) => { const l = LANGS.find((x) => x.code === code); return l ? l.name : code; };
export function registerDict(code, dict) { if (dicts[code]) Object.assign(dicts[code], dict); }
export function registerData(code, dict) { if (datas[code]) Object.assign(datas[code], dict); }
export const getData = (code) => datas[code || lang] || {};
export const onLang = (f) => { listeners.add(f); return () => listeners.delete(f); };
const notify = () => { for (const f of listeners) { try { f(lang); } catch (e) { /* ignore */ } } };

// import js/lang/<code>.js (required) and js/lang/<code>_data.js (optional, failure is fine). Never rejects.
export function loadLang(code) {
  if (!dicts[code] || code === 'en') return Promise.resolve(code);
  if (loads[code]) return loads[code];
  const one = (file, apply) => import(file).then((m) => { if (m && m.default) apply(m.default); }).catch(() => { /* missing or broken file: English fallback */ });
  loads[code] = Promise.all([
    one('./lang/' + code + '.js', (d) => registerDict(code, d)),
    one('./lang/' + code + '_data.js', (d) => registerData(code, d)),
  ]).then(() => { done[code] = true; return code; });
  return loads[code];
}
// resolves once the current language's files have loaded (immediately for English)
export const langReady = () => loadLang(lang);

export function setLang(code) {
  if (!dicts[code]) code = 'en';
  const changed = code !== lang;
  lang = code;
  try { if (typeof document !== 'undefined' && document.documentElement) document.documentElement.lang = code; } catch (e) { /* ignore */ }
  const p = loadLang(code);   // a language that is not loaded yet notifies when it arrives, so the screen redraws once with the real words
  if (!changed) return lang;
  if (done[code]) notify(); else p.then(() => { if (lang === code) notify(); });
  return lang;
}
// 'da-DK' -> 'da'; a list (navigator.languages) is walked in order; Norwegian reads as Danish; anything else is English
export function detectLang(navLang) {
  const list = Array.isArray(navLang) ? navLang : [navLang];
  for (const n of list) {
    let c = String(n || '').slice(0, 2).toLowerCase();
    if (c === 'nb' || c === 'nn' || c === 'no') c = 'da';
    if (dicts[c]) return c;
  }
  return 'en';
}
export const resolveLang = (p, navLang) => (CODES.includes(p) ? p : detectLang(navLang));
const normPref = (p) => (CODES.includes(p) ? p : 'auto');
function storeKey(storage, p) {
  try { if (!storage) return; if (p === 'auto') storage.removeItem(LANG_KEY); else storage.setItem(LANG_KEY, p); } catch (e) { /* private mode */ }
}
function readKey(storage) { try { return storage ? normPref(storage.getItem(LANG_KEY)) : 'auto'; } catch (e) { return 'auto'; } }
const defStorage = () => { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } };
let navOverride = null;
const defNav = () => (navOverride != null ? navOverride : (typeof navigator !== 'undefined' ? (navigator.languages && navigator.languages.length ? navigator.languages : navigator.language) : 'en'));

// Boot: pick the language before the first paint. opts: { profile: profile.settings.lang, storage, nav }. An explicit profile choice wins,
// else the explicit choice stored on this device, else 'auto'. Returns a promise that resolves to the language once its files loaded.
export function initLang(opts = {}) {
  const storage = opts.storage !== undefined ? opts.storage : defStorage();
  if (opts.nav !== undefined) navOverride = opts.nav;
  const fromProfile = normPref(opts.profile);
  pref = fromProfile !== 'auto' ? fromProfile : readKey(storage);
  storeKey(storage, pref);
  setLang(resolveLang(pref, defNav()));
  return langReady().then(() => lang);
}
// The user picked a language ('auto' or a code): remember it (device key; the caller also stores it in the profile) and switch.
export function setLangPref(p, opts = {}) {
  pref = normPref(p);
  storeKey(opts.storage !== undefined ? opts.storage : defStorage(), pref);
  setLang(resolveLang(pref, defNav()));
  return langReady().then(() => lang);
}

function fill(s, vars) { return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : String(s); }
export function t(key, en, vars) {
  const d = lang === 'en' ? null : dicts[lang];
  const s = d && d[key] != null ? d[key] : en;
  return fill(s, vars);
}
export function tn(key, n, one, many, vars) {
  const d = lang === 'en' ? null : dicts[lang];
  const pair = d && d[key] != null ? d[key] : null;   // translations of plurals are 'one|many'
  let s;
  if (pair) { const p = String(pair).split('|'); s = n === 1 ? p[0] : (p[1] != null ? p[1] : p[0]); } else s = n === 1 ? one : many;
  return fill(s, Object.assign({ n }, vars));
}
