// a11y.js: the two accessibility settings the canvas and the DOM both read. main.js calls applyA11y(profile.settings) whenever the settings
// change (and once at boot), the HUD asks textScale() when it sizes text, any art that needs a non-colour cue asks colorblind().
// Defaults (nothing applied yet) are 1 and false, so headless tests and the lab pages need no setup.
import { detectLang, t } from './i18n.js';
let big = false, cb = false;
export const BIGTEXT_SCALE = 1.12;     // canvas text multiplier; the DOM uses CSS zoom 1.15 (see ui_doodle.css body.bigtext)
export function applyA11y(s) {
  big = !!(s && s.bigtext); cb = !!(s && s.colorblind);
  if (typeof document !== 'undefined' && document.body) {
    document.body.classList.toggle('bigtext', big);
    document.body.classList.toggle('colorblind', cb);
  }
}
export const textScale = () => (big ? BIGTEXT_SCALE : 1);
export const colorblind = () => cb;

// One-time language offer: the device speaks da, nl or de but the game is showing something else (an explicit English pick, for example).
// Returns the language code to offer, or null (already offered, device is English, or the game already uses it).
export function langOffer(profile, navLangs, curLang) {
  if (!profile || (profile.tutorial && profile.tutorial.hints && profile.tutorial.hints.lang_offer)) return null;
  const target = detectLang(navLangs);
  return target !== 'en' && target !== curLang ? target : null;
}

// ---- dialogs and focus helpers (shared with ui_core.js)
const FOCUSABLE = 'button:not([disabled]),[href],input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
const isShown = (el) => !!(el.offsetWidth || el.offsetHeight || (el.getClientRects && el.getClientRects().length));
export function focusables(box) { return [...box.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && isShown(el)); }
let uid = 0;
// label a dialog from its first heading (re-run whenever the content was replaced, e.g. Settings redraws)
export function labelDialog(box) {
  if (!box) return;
  const gen = box.hasAttribute('data-dlg-gen');
  if (box.getAttribute('aria-label') && !gen) return;
  const cur = box.getAttribute('aria-labelledby');
  if (cur && box.querySelector('#' + cur)) return;
  const hd = box.querySelector('h2,h3,h1');
  if (hd) { if (!hd.id) hd.id = 'dtb-dlg-' + (++uid); box.setAttribute('aria-labelledby', hd.id); box.removeAttribute('aria-label'); box.removeAttribute('data-dlg-gen'); }
  else if (!gen && (box.textContent || '').trim()) { box.setAttribute('aria-label', t('a11y.dialog', 'Dialog')); box.setAttribute('data-dlg-gen', ''); }
}

// ---- DOM menu accessibility pass (round 6). The menus are built with plain element helpers; this pass adds what they cannot know:
// progress bars become role=progressbar with their value, canvas icons are hidden from screen readers, ON/OFF buttons and the segmented
// pickers (language, difficulty ...) report aria-pressed, and a button with no text and no label gets a fallback name. It is idempotent and
// cheap, so a MutationObserver reruns it (debounced) whenever a screen or a modal changes.
const txt = (el) => (el && el.textContent ? el.textContent.replace(/\s+/g, ' ').trim() : '');
export function a11yScan(root) {
  if (!root || !root.querySelectorAll) return 0;
  let n = 0;
  // dialogs that were filled after they opened (Settings draws itself right after modal()): name them and move focus from the bare dialog to its first control
  for (const box of root.querySelectorAll('.modal[role=dialog]')) {
    labelDialog(box);
    if (typeof document !== 'undefined' && document.activeElement === box) { const f = focusables(box)[0]; if (f) { try { f.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } }
  }
  for (const c of root.querySelectorAll('canvas:not([aria-hidden])')) { c.setAttribute('aria-hidden', 'true'); n++; }
  for (const bar of root.querySelectorAll('.pbar')) {
    const fill = bar.firstElementChild, w = fill && fill.style ? parseFloat(fill.style.width) : NaN;
    const pct = Number.isFinite(w) ? Math.max(0, Math.min(100, Math.round(w))) : 0;
    if (bar.getAttribute('role') !== 'progressbar') { bar.setAttribute('role', 'progressbar'); bar.setAttribute('aria-valuemin', '0'); bar.setAttribute('aria-valuemax', '100'); n++; }
    bar.setAttribute('aria-valuenow', String(pct));
    // value text: the "3 / 10" line next to the bar (inside it for the fame bar), the label: the line before it
    let vt = '', label = bar.getAttribute('aria-label') || '';
    const inner = bar.querySelector('span');
    if (inner) vt = txt(inner);
    else { const nx = bar.nextElementSibling; if (nx && /\d/.test(txt(nx)) && txt(nx).length < 24) vt = txt(nx); }
    if (vt) bar.setAttribute('aria-valuetext', vt);
    if (!label) {
      const pv = bar.previousElementSibling;
      const host = pv && txt(pv) ? txt(pv) : txt(bar.parentElement && bar.parentElement.querySelector('.nm,b')) || '';
      label = host.slice(0, 60) || t('a11y.progress', 'Progress');
      bar.setAttribute('aria-label', label);
    }
  }
  for (const row of root.querySelectorAll('.toggle')) {
    const b = row.querySelector(':scope > button');
    if (!b || b.hasAttribute('aria-pressed')) continue;
    const label = [...row.childNodes].filter((x) => x.nodeType === 3).map((x) => x.textContent).join(' ').replace(/\s+/g, ' ').trim();
    if (label) b.setAttribute('aria-label', label);
    b.setAttribute('aria-pressed', b.classList.contains('green') ? 'true' : 'false'); n++;
  }
  for (const b of root.querySelectorAll('.seg button, .enc button, .codex-seg button')) {
    const on = b.classList.contains('on') ? 'true' : 'false';
    if (b.getAttribute('aria-pressed') !== on) { b.setAttribute('aria-pressed', on); n++; }
  }
  for (const b of root.querySelectorAll('button:not([aria-label]):not([title])')) {
    if (txt(b)) continue;
    const cls = b.className || '';
    const name = /mute/.test(cls) ? t('audio.mute', 'Mute sound') : /close|x\b/.test(cls) ? t('common.close', 'Close') : /gear|settings/.test(cls) ? t('hub.settings', 'Settings') : /pause/.test(cls) ? t('run.pause.title', 'Paused') : t('a11y.button', 'Button');
    b.setAttribute('aria-label', name); n++;
  }
  return n;
}
let scanObs = null;
export function initDomA11y(root) {
  if (typeof MutationObserver === 'undefined' || !root) return null;
  let queued = false;
  const run = () => { queued = false; try { a11yScan(root); } catch (e) { /* never break the menus */ } };
  scanObs = new MutationObserver(() => { if (queued) return; queued = true; (typeof requestAnimationFrame === 'function' ? requestAnimationFrame : setTimeout)(run); });
  scanObs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  run();
  return scanObs;
}
