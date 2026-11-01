// Drop the Bass: translations. English, Danish, Dutch, German.
// t(key, en, vars?) returns the string for the current language, falling back to the English default given in code.
//   t('hub.play', 'Play')   t('run.waves', 'Wave {n} of {total}', { n: 3, total: 20 })
// tn(key, n, one, many, vars?) picks the singular or plural form (en, da, nl and de all have one/other) and fills {n}.
// Dictionaries live in js/lang/<code>.js (UI strings, extracted from the t() calls by tools/dtb_i18n.mjs) and js/lang/<code>_data.js
// (names and descriptions of data tables, applied by js/i18n_data.js). English is always the in-code default.
export const LANGS = [{ code: 'en', name: 'English' }, { code: 'da', name: 'Dansk' }, { code: 'nl', name: 'Nederlands' }, { code: 'de', name: 'Deutsch' }];
let lang = 'en';
const dicts = { en: {}, da: {}, nl: {}, de: {} };
const listeners = new Set();
export const getLang = () => lang;
export function registerDict(code, dict) { if (dicts[code]) Object.assign(dicts[code], dict); }
export function setLang(code) {
  if (!dicts[code]) code = 'en';
  if (code === lang) return lang;
  lang = code; for (const f of listeners) { try { f(lang); } catch (e) { /* ignore */ } }
  return lang;
}
export const onLang = (f) => { listeners.add(f); return () => listeners.delete(f); };
export function detectLang(navLang) {
  const c = String(navLang || '').slice(0, 2).toLowerCase();
  return dicts[c] ? c : 'en';
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
