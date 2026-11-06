// Batch 10 (agent 11): tap a build chip in the pause menu for that weapon's stats, a sticker unlock popup on the result that
// flies to the Stats tab, and a shine over the stars when a run upgrades them. DOM and pure helpers, nothing per frame.
import { WEAPONS } from './sim.js';
import { skillPreview } from './skill_sheet.js';
import { STICKERS } from './sticker_b9.js';
import { hasSticker } from './title_b8.js';

// ---- pause: the stats line of a tapped chip. lv is the in-run level, permLv the permanent skill level (it scales the damage)
export function chipStatsText(id, lv, permLv) {
  const w = WEAPONS.find(x => x.id === id); if (!w) return null;
  const pv = skillPreview(id, permLv || 1), dmg = pv && pv.rows.find(r => r.k === 'Damage'), cd = pv && pv.rows.find(r => r.k === 'Cooldown');
  const bits = [lv > 0 ? 'LV ' + lv + ' of ' + w.max : 'Not picked yet'];
  if (dmg) bits.push('damage ' + dmg.a);
  if (cd) bits.push('every ' + cd.a);
  return { name: w.name, note: (pv && pv.note) || w.desc, line: bits.join(', ') };
}
export function chipStatsHTML(s) { return s ? `<b>${s.name}</b> ${s.line}. ${s.note}.` : ''; }
// event delegation on the chip row: one tap shows the stats, a second tap on the same chip hides them again
export function bindBuildChips(host, getInfo, click) {
  if (!host || host.__b10) return; host.__b10 = 1;
  let cur = '';
  const act = e => {
    const chip = e.target.closest && e.target.closest('span.pb9'); if (!chip || !chip.dataset.w) return;
    const cap = host.querySelector('.pb9n'); if (!cap) return;
    for (const c of host.querySelectorAll('.pb9.sel')) c.classList.remove('sel');
    if (cur === chip.dataset.w) { cur = ''; cap.classList.remove('cap10'); cap.innerHTML = cap.dataset.def || ''; return; }
    cur = chip.dataset.w; if (click) click();
    if (!cap.dataset.def) cap.dataset.def = cap.innerHTML;
    chip.classList.add('sel'); cap.classList.add('cap10'); cap.innerHTML = chipStatsHTML(getInfo(cur));
  };
  host.addEventListener('click', act);
  host.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
  host.__reset10 = () => { cur = ''; };
}

// ---- stickers that this run unlocked
export const stickerIds = save => STICKERS.filter(t => { try { return !!t.ok(save, { tune: hasSticker() }); } catch (e) { return false; } }).map(t => t.id);
export function newStickers(before, after) { const had = new Set(before); return after.filter(id => !had.has(id)).map(id => STICKERS.find(t => t.id === id)).filter(Boolean); }
export function stickerPopHTML(list) {
  if (!list.length) return '';
  const t = list[0], more = list.length > 1 ? ` <em>+${list.length - 1} more</em>` : '';
  return `<i class="sp10i" style="--sc:${t.col}">${t.icon}</i><span class="sp10t"><small>NEW STICKER</small><b>${t.name}</b>${more}</span>`;
}
// where the Stats tab sits in the hub nav: the real button when it is laid out, else the 2nd of 6 slots
export function statsTabPoint(w, h, doc = globalThis.document) {
  try { const b = doc.querySelector('[data-tab="Stats"]'), r = b && b.getBoundingClientRect(); if (r && r.width > 0) return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; } catch (e) { /* fall through */ }
  return { x: w * 0.25, y: h - 34 };
}
let popTimer = 0, popEl = null;
export function clearStickerPop() { clearTimeout(popTimer); if (popEl) { popEl.remove(); popEl = null; } }
// shows the card, then it shrinks into the Stats tab; valid() says whether the result screen is still up
export function showStickerPop(list, { reduce = false, valid = () => true, onLand, delay = 1100, hold = 2200, doc = globalThis.document } = {}) {
  clearStickerPop(); if (!list.length || !doc) return 0;
  popTimer = setTimeout(() => {
    if (!valid()) return;
    const el = doc.createElement('div'); el.className = 'sp10'; el.setAttribute('role', 'status'); el.innerHTML = stickerPopHTML(list); doc.body.appendChild(el); popEl = el;
    requestAnimationFrame(() => el.classList.add('in'));
    popTimer = setTimeout(() => {
      if (reduce || typeof el.animate !== 'function') { el.remove(); popEl = null; if (onLand) onLand(); return; }
      const a = el.getBoundingClientRect(), to = statsTabPoint(innerWidth, innerHeight, doc);
      const dx = to.x - (a.left + a.width / 2), dy = to.y - (a.top + a.height / 2);
      const an = el.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.3}px,${dy * 0.15 - 16}px) scale(.8)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx}px,${dy}px) scale(.12)`, opacity: 0.2 }], { duration: 620, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' });
      an.onfinish = () => { el.remove(); if (popEl === el) popEl = null; if (onLand) onLand(); };
    }, hold);
  }, delay);
  return list.length;
}
// the Stats tab gives a little hop when the sticker lands
export function bumpStatsTab(doc = globalThis.document) { try { const b = doc.querySelector('[data-tab="Stats"]'); if (b) { b.classList.remove('lnewhit'); void b.offsetWidth; b.classList.add('lnewhit'); } } catch (e) { /* cosmetic */ } }

// ---- a gold shine sweeps over the star row when a run raised the stars
export function shineStars(el, gained, reduce) { if (!el) return false; el.classList.remove('shine10'); if (!(gained > 0) || reduce) return false; void el.offsetWidth; el.classList.add('shine10'); return true; }
