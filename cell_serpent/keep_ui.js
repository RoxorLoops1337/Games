// Cell Serpent: round 4 retention touches. Kind, never pushy: a gentle "your streak is waiting" line on the Next Reward bar,
// the Season stamp that flies from the result screen to the hub pill, "new in your book" and "see you tomorrow" chips,
// and the collection book art helpers. Nothing here takes anything away, a missed day only means a fresh start.
import { spinReady, spinStreak, seasonStatus, bookEntries, SEASON_DAYS, SKINS } from './sim.js';

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// One friendly line for the Next Reward bar, or null. The spin streak comes first, then today's Season stamp.
export function streakRisk(save, day) {
  const n = spinStreak(save, day);
  if (spinReady(save, day) && save.addict.spin.day === day - 1 && n >= 2) return { icon: '🔥', text: `${n} day spin streak: one spin keeps it going` };
  const se = seasonStatus(save, day);
  if (!se.stampedToday && se.stamps > 0 && se.stamps < SEASON_DAYS) return { icon: '🌟', text: `Today's Season stamp is waiting: any run earns it` };
  if (save.streak && save.streak.n >= 2 && save.streak.last === day) return { icon: '🔥', text: `${save.streak.n} days in a row. See you tomorrow!` };
  return null;
}
export function riskHTML(save, day) {
  const r = streakRisk(save, day); return r ? `<span class="nrrisk"><i>${r.icon}</i>${esc(r.text)}</span>` : '';
}

// ---- result screen: snapshot before the run is recorded, then compare
export function keepSnap(save, day) {
  const e = bookEntries(save), got = new Set();
  for (const k of Object.keys(e)) for (const x of e[k]) if (x.got) got.add(k + ':' + x.id);
  return { stamped: seasonStatus(save, day).stampedToday, got };
}
let pendingStamp = 0;
// Fills #rKeep with the little chips: stamp earned, new book page, and a soft hook for tomorrow.
export function keepResult(snap, save, day, r, host, reduce) {
  if (!host) return;
  const se = seasonStatus(save, day), chips = [], fresh = [];
  const e = bookEntries(save);
  for (const k of Object.keys(e)) for (const x of e[k]) if (x.got && !snap.got.has(k + ':' + x.id)) fresh.push(x);
  if (!snap.stamped && se.stampedToday) {
    const nxt = se.miles.find(m => !m.got), left = nxt ? nxt.at - se.stamps : 0;
    chips.push(`<span class="kchip stamp"><i class="kst">⭐</i><b>Season stamp ${se.stamps}/${SEASON_DAYS}</b><small>${nxt ? left + (left === 1 ? ' stamp' : ' stamps') + ' to the next gift' : 'every gift unlocked'}</small></span>`);
    pendingStamp = se.stamps;
  }
  if (fresh.length) chips.push(`<span class="kchip book"><i class="kst">📖</i><b>New in your book</b><small>${esc(fresh.slice(0, 2).map(x => x.name).join(', '))}${fresh.length > 2 ? ' +' + (fresh.length - 2) : ''}</small></span>`);
  const tom = tomorrowLine(save, day, r);
  if (tom) chips.push(`<span class="kchip soon"><i class="kst">${tom.icon}</i><b>${esc(tom.text)}</b></span>`);
  host.innerHTML = chips.join('');
  host.classList.toggle('calm', !!reduce);
}
// A warm reason to come back, never a threat. Tomorrow's stamp is the main one.
export function tomorrowLine(save, day, r) {
  if (r && (r.mode === 'pig' || r.mode === 'inv')) return null;
  const se = seasonStatus(save, day), sp = spinStreak(save, day);
  if (se.stampedToday && se.stamps < SEASON_DAYS) {
    const nx = se.miles.find(m => m.at === se.stamps + 1);
    if (nx) return { icon: '🎁', text: 'Tomorrow your stamp unlocks a Season gift' };
    return { icon: '🌙', text: `Tomorrow: stamp ${se.stamps + 1} and a fresh spin` };
  }
  return sp > 0 ? { icon: '🎡', text: 'A fresh spin is waiting tomorrow' } : null;
}

// ---- the hub: when the pill appears after a run that earned a stamp, a star flies in and the counter ticks up
export function landStamp(pill, reduce, tries = 0) {
  if (!pendingStamp || !pill) return;
  const r = pill.getBoundingClientRect();
  if (r.width < 8) { if (tries < 20) setTimeout(() => landStamp(document.getElementById('qSeason'), reduce, tries + 1), 150); return; }   // hub not showing yet: look again soon
  const n = pendingStamp; pendingStamp = 0;
  const b = pill.querySelector('b'); if (!b) return;
  if (reduce) { pill.classList.add('landed'); setTimeout(() => pill.classList.remove('landed'), 900); return; }
  b.textContent = Math.max(0, n - 1) + '/' + SEASON_DAYS;
  const star = document.createElement('i'); star.className = 'kfly'; star.textContent = '⭐';
  const sx = innerWidth / 2, sy = innerHeight - 90, tx = r.left + r.width * 0.3, ty = r.top + r.height / 2;
  star.style.cssText = `left:${sx}px;top:${sy}px;--dx:${tx - sx}px;--dy:${ty - sy}px`;
  document.body.appendChild(star);
  setTimeout(() => { star.remove(); b.textContent = n + '/' + SEASON_DAYS; pill.classList.add('landed'); setTimeout(() => pill.classList.remove('landed'), 900); }, 820);
}

// ---- collection book art: species body sprites, pet icons, silhouettes for the ones not met yet
export function bookCell(x, cat, c, s, nextId) {
  let art = `<b>${x.icon}</b>`;
  if (cat === 'species') { const u = c.bodyURL && c.bodyURL(x.id); if (u) art = `<img class="bkart" src="${u}" alt="">`; }
  else if (cat === 'pets') art = `<span class="bkart">${c.icon(x.id)}</span>`;
  const next = !x.got && x.id === nextId;
  const hint = next ? (cat === 'species' ? 'Stage ' + (SKINS.indexOf(x.id) + 1) : cat === 'pets' ? 'Hatch an egg' : '') : '';
  return `<span class="bk ${x.got ? 'got' : 'lock'}${next ? ' next' : ''}" title="${esc(x.got ? x.name : hint || '???')}">${art}<small>${x.got ? esc(x.name) : hint || '???'}</small></span>`;
}
export function nextUnmet(list) { const x = list.find(q => !q.got); return x ? x.id : ''; }
