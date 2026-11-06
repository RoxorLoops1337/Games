// diag.js: a tiny error ring buffer and the "Report a problem" text. Round 6.
// window 'error' and 'unhandledrejection' handlers keep the LAST 20 errors in localStorage under `drop_the_bass_diag` (a new key; the save is never touched).
// Each entry: { t (ms), msg (max 200 chars), src (file name only, no path or query), line, lang, screen, n (how many times in a row) }.
// Nothing here ever throws, nothing is sent anywhere. The report text lists only: game version, language, screen, viewport, pixel ratio, user agent,
// online state, save size in bytes, Fame and hero levels, and the stored errors. No name, no friends, no save contents.
export const DIAG_KEY = 'drop_the_bass_diag';
export const DIAG_MAX = 20, DIAG_MSG = 200, DIAG_BYTES = 8000;

const short = (v, n) => String(v == null ? '' : v).replace(/[\r\n\t]+/g, ' ').slice(0, n);
// 'https://x.test/drop_the_bass/js/battle.js?v=3' -> 'battle.js'
export function fileOf(src) {
  const s = short(src, 300).split('?')[0].split('#')[0];
  const i = s.lastIndexOf('/');
  return s.slice(i + 1).slice(0, 60);
}
// first "file.js:line" of a stack trace
function frameOf(stack) {
  const m = /([^\s()@\/]+\.m?js):(\d+)(?::\d+)?/.exec(String(stack || ''));
  return m ? { src: m[1], line: +m[2] } : { src: '', line: 0 };
}
export function readDiag(store) {
  try {
    const raw = store.getItem(DIAG_KEY);
    const a = raw ? JSON.parse(raw) : [];
    return Array.isArray(a) ? a.filter((e) => e && typeof e === 'object').slice(-DIAG_MAX) : [];
  } catch (e) { return []; }
}
function writeDiag(store, list) {
  try {
    let a = list.slice(-DIAG_MAX), s = JSON.stringify(a);
    while (s.length > DIAG_BYTES && a.length > 1) { a = a.slice(1); s = JSON.stringify(a); }
    store.setItem(DIAG_KEY, s);
    return true;
  } catch (e) { return false; }
}
export function clearDiag(store) { try { store.removeItem(DIAG_KEY); return true; } catch (e) { return false; } }
// info: { message, source, line }; ctx: { lang, screen }. The same error twice in a row only counts up (a draw loop must not flood the ring).
export function recordError(store, info, ctx, now) {
  try {
    const c = ctx || {}, i = info || {};
    const e = { t: typeof now === 'number' ? now : Date.now(), msg: short(i.message, DIAG_MSG) || 'Error', src: fileOf(i.source), line: Math.max(0, Math.floor(+i.line) || 0), lang: short(c.lang, 8), screen: short(c.screen, 16), n: 1 };
    const list = readDiag(store), last = list[list.length - 1];
    if (last && last.msg === e.msg && last.src === e.src && last.line === e.line) { last.n = (last.n || 1) + 1; last.t = e.t; }
    else list.push(e);
    return writeDiag(store, list);
  } catch (err) { return false; }
}
// listen for page errors. ctxFn() -> { lang, screen }. Returns an uninstall function.
export function installDiag(win, store, ctxFn) {
  try {
    const ctx = () => { try { return ctxFn ? ctxFn() : {}; } catch (e) { return {}; } };
    const onError = (ev) => {
      try {
        if (!ev) return;
        if (ev.target && ev.target !== win && !ev.message) return;   // a failed <img> or <script> load, not a script error
        const fr = frameOf(ev.error && ev.error.stack);
        recordError(store, { message: ev.message || (ev.error && ev.error.message), source: ev.filename || fr.src, line: ev.lineno || fr.line }, ctx());
      } catch (e) { /* never throw from a handler */ }
    };
    const onRej = (ev) => {
      try {
        const r = ev && ev.reason, fr = frameOf(r && r.stack);
        recordError(store, { message: 'Unhandled rejection: ' + (r && r.message ? r.message : r), source: fr.src, line: fr.line }, ctx());
      } catch (e) { /* ignore */ }
    };
    win.addEventListener('error', onError);
    win.addEventListener('unhandledrejection', onRej);
    return () => { win.removeEventListener('error', onError); win.removeEventListener('unhandledrejection', onRej); };
  } catch (e) { return () => {}; }
}
const clock = (ms) => { const d = new Date(ms); const p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()); };
// env: { version, lang, langPref, screen, width, height, dpr, ua, online, saveBytes, fame, fameTitle, heroLv: {roxor, jasmin}, errors }
export function diagReport(env) {
  const e = env || {}, errs = Array.isArray(e.errors) ? e.errors : [];
  const lines = [
    'Drop the Bass, game version ' + short(e.version, 12),
    'Language: ' + short(e.lang, 8) + (e.langPref && e.langPref !== e.lang ? ' (setting: ' + short(e.langPref, 8) + ')' : ''),
    'Screen: ' + short(e.screen, 16),
    'Viewport: ' + short(e.width, 6) + 'x' + short(e.height, 6) + ' at ' + short(e.dpr, 6) + 'x pixel ratio',
    'Online: ' + (e.online ? 'yes' : 'no'),
    'Save size: ' + short(e.saveBytes, 12) + ' bytes',
    'Fame: ' + short(e.fame, 4) + (e.fameTitle ? ' (' + short(e.fameTitle, 40) + ')' : '') + ', hero levels: ' + short(e.heroLv && e.heroLv.roxor, 3) + ' / ' + short(e.heroLv && e.heroLv.jasmin, 3),
    'Browser: ' + short(e.ua, 240),
    'Last errors (' + errs.length + '):',
  ];
  if (!errs.length) lines.push('  none');
  errs.slice(-DIAG_MAX).forEach((x, i) => lines.push('  ' + (i + 1) + '. ' + clock(x.t || 0) + ' ' + short(x.msg, DIAG_MSG) + (x.src ? ' (' + short(x.src, 60) + ':' + (x.line || 0) + ')' : '') + ' [' + short(x.lang, 8) + ', ' + short(x.screen, 16) + ']' + (x.n > 1 ? ' x' + x.n : '')));
  return lines.join('\n');
}
