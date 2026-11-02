// Accessibility round 7 (agent 18): focus trap for full-screen dialogs (settings, pause, panels), a reduce-flashing
// preview in settings, screen reader names for the Collection filter, chest hold and loot results. DOM only, no game rules.
import { announce, wrapTab } from './access.js';
import { initClaimA11y } from './a11y9.js';

const DLG = 'section.scr.on:not(#hub):not(#title)';
export const trapList = root => [...root.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(b => b.getClientRects().length && b.getAttribute('tabindex') !== '-1');

// Tab and Shift+Tab wrap inside the open full-screen dialog; focus outside of it is pulled back in
export function initTrap() {
  if (typeof document === 'undefined') return;
  addEventListener('keydown', e => {
    if (e.key !== 'Tab' || e.defaultPrevented) return;
    if (document.querySelector('.dsheet-bg')) return;   // bottom sheets own their own trap
    const dlgs = document.querySelectorAll(DLG), dlg = dlgs[dlgs.length - 1]; if (!dlg) return;
    const list = trapList(dlg); if (!list.length) return;
    const cur = document.activeElement, i = list.indexOf(cur);
    if (i < 0) { list[e.shiftKey ? list.length - 1 : 0].focus(); e.preventDefault(); return; }
    if (e.shiftKey ? i === 0 : i === list.length - 1) { list[wrapTab(list, cur, e.shiftKey)].focus(); e.preventDefault(); }
  }, true);
  const seen = new WeakSet();
  new MutationObserver(() => { for (const s of document.querySelectorAll(DLG)) if (!seen.has(s)) { seen.add(s); s.setAttribute('aria-modal', 'true'); } for (const s of document.querySelectorAll('section.scr:not(.on)')) seen.delete(s); }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

// settings: a calm sample that blinks while Reduce flashing is OFF and holds still when it is ON (slow, one soft blink)
export function initFlashPreview() {
  const b = document.querySelector('#settings .tgl[data-k="reduceFlash"]'); if (!b || document.getElementById('rfPrev')) return;
  const d = document.createElement('div'); d.id = 'rfPrev'; d.className = 'rfprev'; d.setAttribute('role', 'img');
  d.innerHTML = '<i class="rfa"></i><i class="rfb"></i><span class="rft" aria-hidden="true"></span>';
  b.after(d);
  const sync = () => { const on = document.documentElement.classList.contains('rf'); d.setAttribute('aria-label', on ? 'Preview: screen flashes are off, the samples stay steady' : 'Preview: screen flashes are on, the samples blink softly'); };
  sync(); new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}

// Collection filter chips are a group of toggle buttons
export function syncFilters() {
  const f = document.getElementById('gearFilters'); if (!f) return;
  f.setAttribute('role', 'group'); f.setAttribute('aria-label', 'Collection filter');
  const set = () => { for (const b of f.querySelectorAll('button')) b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false'); };
  set(); new MutationObserver(set).observe(f, { subtree: true, attributes: true, attributeFilter: ['class'] });
}

// chests: say that a long press opens faster; loot results are named and read once as a list instead of "+0"
export const lootLine = it => {
  const rar = (/rar(\d)/.exec(it.className) || [])[1], words = ['', 'uncommon', 'rare', 'epic', 'legendary'];
  const n = (it.querySelector('.cnt') || {}).dataset ? it.querySelector('.cnt').dataset.n : '', nm = ((it.querySelector('small') || {}).textContent || 'Reward').trim();
  return (n ? n + ' ' : '') + nm + (+rar >= 1 && words[+rar] ? ', ' + words[+rar] : '') + (it.querySelector('.lnew') ? ', new' : '');
};
export function initChestSr() {
  const tabs = document.getElementById('hub') || document.body;
  const mark = () => { for (const t of document.querySelectorAll('.tile .chest3, .featban .chest3')) { const bt = t.closest('.tile, .featban').querySelector('button'); if (bt && !bt.getAttribute('aria-description')) bt.setAttribute('aria-description', 'Press to open. Press and hold to open faster.'); } };
  new MutationObserver(mark).observe(tabs, { childList: true, subtree: true }); mark();
  const loot = document.getElementById('bLoot'); if (!loot) return;
  new MutationObserver(() => {
    const its = [...loot.querySelectorAll('.it')]; if (!its.length || loot.dataset.said === String(its.length) + loot.firstChild) return;
    loot.dataset.said = String(its.length) + loot.firstChild;
    for (const it of its) { it.setAttribute('role', 'group'); const c = it.querySelector('.cnt'); if (c) c.setAttribute('aria-hidden', 'true'); it.setAttribute('aria-label', lootLine(it)); }
    const ttl = (document.getElementById('bTitle') || {}).textContent || 'Chest opened';
    announce(ttl.replace(/!/g, '') + ': ' + its.map(lootLine).join('; '));
  }).observe(loot, { childList: true });
}

// batch 8: while a bottom sheet is open the hub behind it is inert (no focus, no screen reader cursor), and a keyboard
// press that rebuilds the hub no longer drops focus on the page: it returns to the same control (by name, else same place)
export const inertWanted = () => !!document.querySelector('.dsheet-bg');
export function syncInert() {
  const want = inertWanted();
  for (const id of ['hub', 'title']) { const s = document.getElementById(id); if (s && !!s.inert !== want) s.inert = want; }
  return want;
}
const lab = el => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
const flist = root => [...root.querySelectorAll('button:not([disabled]),[tabindex="0"]')].filter(b => b.getClientRects().length);
let sig = null;
export function rememberFocus(el) {
  const tab = el && el.closest && el.closest('.tab'); if (!tab) { sig = null; return null; }
  sig = { tab: tab.id, i: flist(tab).indexOf(el), key: lab(el) }; return sig;
}
export function restoreFocus() {
  if (!sig || document.querySelector('.dsheet-bg')) return false;
  const a = document.activeElement; if (a && a !== document.body && a.isConnected) { sig = null; return false; }
  const tab = document.getElementById(sig.tab); if (!tab || !tab.getClientRects().length) return false;
  const l = flist(tab); const t = l.find(b => lab(b) === sig.key) || l[Math.max(0, Math.min(sig.i, l.length - 1))];
  sig = null; if (!t) return false; try { t.focus({ preventScroll: true }); } catch (e) { /* ignore */ } return true;
}
export function initInertFocus() {
  if (typeof document === 'undefined') return;
  let t = 0; const later = () => { clearTimeout(t); t = setTimeout(restoreFocus, 90); };
  new MutationObserver(() => { syncInert(); }).observe(document.body, { childList: true });
  addEventListener('click', e => { if (e.detail === 0 && e.target && e.target.closest) rememberFocus(e.target.closest('button,[tabindex="0"]')); }, true);
  const hub = document.getElementById('hub'); if (hub) new MutationObserver(() => { if (sig) later(); }).observe(hub, { childList: true, subtree: true });
  new MutationObserver(ms => { for (const m of ms) for (const n of m.removedNodes) if (n.nodeType === 1 && n.classList && n.classList.contains('dsheet-bg')) later(); }).observe(document.body, { childList: true });
}

export function initA11y7() { try { initTrap(); initFlashPreview(); syncFilters(); initChestSr(); initInertFocus(); initClaimA11y(); } catch (e) { /* never block the game */ } }
