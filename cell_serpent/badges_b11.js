// Cell Serpent: round 11 retention. The weekly badge shelf (baked medal icons, readable names at 360px) and friendly "something is ready" nudges.
import { nextReward } from './sim.js';

export const BADGE_INFO = {
  cells: { name: 'Popper', how: 'Pop lots of cells in a week', hue: '#4fd8f0' }, runs: { name: 'Encore', how: 'Play many runs in a week', hue: '#ff7eb6' },
  bombs: { name: 'Boom Pal', how: 'Pop lots of bombs in a week', hue: '#ff9a4d' }, chests: { name: 'Treasure', how: 'Open lots of chests in a week', hue: '#ffd24a' },
  picks: { name: 'Picky', how: 'Pick lots of upgrades in a week', hue: '#9dff6d' }, wins: { name: 'Headliner', how: 'Clear lots of stages in a week', hue: '#c79bff' },
};
export const BADGE_IDS = Object.keys(BADGE_INFO);
const bit = id => 1 << BADGE_IDS.indexOf(id);
export const gotBadge = (save, id) => (save.addict.wb && save.addict.wb[id] > 0) ? 1 : 0;
// badges earned but not yet looked at on the shelf (addict.bs is a 6 bit mask)
export function newBadges(save) { const m = save.addict.bs | 0; return BADGE_IDS.filter(id => gotBadge(save, id) && !(m & bit(id))); }
export function markBadgesSeen(save) { let m = 0; for (const id of BADGE_IDS) if (gotBadge(save, id)) m |= bit(id); save.addict.bs = m; }

// ---- baked medal icon (cached per badge and state)
const cache = new Map();
export function medalURL(id, got, px = 52) {
  const key = id + (got ? '1' : '0') + px;
  if (cache.has(key)) return cache.get(key);
  let url = '';
  try {
    if (typeof document === 'undefined') return '';
    const S = 2, cv = document.createElement('canvas'); cv.width = cv.height = px * S; const x = cv.getContext('2d'); if (!x) return '';
    x.scale(S * px / 52, S * px / 52);
    const hue = got ? BADGE_INFO[id].hue : '#7d86a8';
    x.fillStyle = got ? '#ff5c6c' : '#4a5073'; x.beginPath(); x.moveTo(15, 28); x.lineTo(11, 50); x.lineTo(19, 45); x.lineTo(23, 50); x.lineTo(26, 32); x.fill();
    x.fillStyle = got ? '#d93c52' : '#3d4263'; x.beginPath(); x.moveTo(37, 28); x.lineTo(41, 50); x.lineTo(33, 45); x.lineTo(29, 50); x.lineTo(26, 32); x.fill();
    const g = x.createRadialGradient(20, 14, 2, 26, 22, 22); g.addColorStop(0, got ? '#fff6c4' : '#9aa3c7'); g.addColorStop(1, got ? '#e0a21a' : '#565d80');
    x.fillStyle = g; x.beginPath(); x.arc(26, 22, 20, 0, 6.283); x.fill();
    x.lineWidth = 2.5; x.strokeStyle = got ? '#8a5a08' : '#2c3150'; x.stroke();
    x.fillStyle = got ? hue : '#3a4064'; x.beginPath(); x.arc(26, 22, 14.5, 0, 6.283); x.fill();
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(255,255,255,.55)'; x.stroke();
    x.fillStyle = got ? '#fff' : '#8d95b8'; x.strokeStyle = x.fillStyle; x.lineWidth = 2.4; x.lineCap = 'round';
    const dot = (a, b, r) => { x.beginPath(); x.arc(a, b, r, 0, 6.283); x.fill(); };
    if (!got) { x.font = '900 17px system-ui,sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 26, 23); }
    else if (id === 'cells') { dot(21, 24, 4.2); dot(31, 25, 3.4); dot(26, 16, 3.2); }
    else if (id === 'runs') { dot(22, 27, 4); x.beginPath(); x.moveTo(25.5, 26); x.lineTo(25.5, 13); x.lineTo(32, 16); x.stroke(); }
    else if (id === 'bombs') { dot(25, 25, 7); x.beginPath(); x.moveTo(29, 19); x.quadraticCurveTo(33, 14, 35, 15); x.stroke(); dot(35, 14, 1.6); }
    else if (id === 'chests') { x.fillRect(17, 20, 18, 11); x.fillStyle = hue; x.fillRect(17, 24, 18, 2.5); x.fillRect(24.8, 20, 2.4, 11); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(17, 20); x.quadraticCurveTo(26, 8, 35, 20); x.fill(); }
    else if (id === 'picks') { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 4.2 : 9.5, a = -1.5708 + i * 0.6283; x.lineTo(26 + Math.cos(a) * r, 22.5 + Math.sin(a) * r); } x.closePath(); x.fill(); }
    else { x.beginPath(); x.moveTo(18, 14); x.lineTo(34, 14); x.quadraticCurveTo(34, 26, 26, 27); x.quadraticCurveTo(18, 26, 18, 14); x.fill(); x.fillRect(24.8, 26, 2.4, 4); x.fillRect(20, 30, 12, 2.6); }
    url = cv.toDataURL();
  } catch (e) { url = ''; }
  cache.set(key, url); return url;
}
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
export function medalHTML(id, got, px = 52) { const u = medalURL(id, got, px); return u ? `<img class="medal" src="${u}" alt="" width="${px}" height="${px}">` : `<span class="medal fb">${got ? '🏅' : '?'}</span>`; }

// the shelf body: big medals, full names, how to earn, and how many times
export function shelfHTML(save, thisWeekId) {
  const fresh = new Set(newBadges(save));
  const cells = BADGE_IDS.map(id => {
    const n = (save.addict.wb && save.addict.wb[id]) || 0, got = n > 0, nfo = BADGE_INFO[id];
    return `<div class="bsh${got ? ' got' : ''}${id === thisWeekId ? ' now' : ''}${fresh.has(id) ? ' fresh' : ''}">${fresh.has(id) ? '<em>NEW</em>' : ''}${medalHTML(id, got, 56)}<b>${esc(got ? nfo.name : id === thisWeekId ? 'This week' : 'Not yet')}</b><small>${esc(got ? 'Earned ' + n + (n === 1 ? ' time' : ' times') : nfo.how)}</small></div>`;
  }).join('');
  const got = BADGE_IDS.filter(id => gotBadge(save, id)).length;
  return `<div class="bshh"><b>${got} of ${BADGE_IDS.length} badges</b><span>${got === BADGE_IDS.length ? 'The whole shelf is shining!' : 'One new badge each time you finish a weekly challenge.'}</span></div><div class="bshg">${cells}</div>`;
}
// the compact row inside the weekly card: three columns so every name fits at 360px
export function rowHTML(save, thisWeekId) {
  const fresh = newBadges(save).length, got = BADGE_IDS.filter(id => gotBadge(save, id)).length;
  const cells = BADGE_IDS.map(id => {
    const n = (save.addict.wb && save.addict.wb[id]) || 0, g = n > 0;
    return `<i class="wbd${g ? ' got' : ''}${id === thisWeekId ? ' now' : ''}">${medalHTML(id, g, 34)}${n > 1 ? `<s>${n}</s>` : ''}<small>${esc(g ? BADGE_INFO[id].name : id === thisWeekId ? 'This week' : 'Not yet')}</small></i>`;
  }).join('');
  return `<button type="button" class="wbrow wbopen" aria-label="Open the badge shelf"><span class="wbh"><b>Weekly badges ${got}/${BADGE_IDS.length}${fresh ? ' <u>NEW</u>' : ''}</b><span>See all &rsaquo;</span></span><span class="wbg">${cells}</span></button>`;
}

// ---- friendly hub nudge: one kind line when something is ready, once per visit per thing
export function readyNudge(save, day, now, said) {
  const n = nextReward(save, day, now); if (!n.ready) return null;
  const key = n.label; if (said && said.has(key)) return null;
  return { key, icon: n.icon, text: n.more ? `${n.label}, plus ${n.more} more waiting` : n.label };
}
