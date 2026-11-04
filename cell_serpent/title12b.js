// Round 6 title and onboarding extras (agent 12):
//  - tutorial step 3: the shield cracks and the face pops with rings, stars and POP! (art from the run's own sprites)
//  - first-run goal line under PLAY, and a "welcome back" greeting for returning players
// Flags and the last-visit stamp live in their own localStorage keys so the save format never changes.
const KEY_VISIT = 'cell_serpent_visit12';
import { idleAmount } from './sim.js';
const num = v => (Number.isFinite(+v) ? +v : 0);

// ---- tutorial step 3 burst, placed inside .tface
export function faceBurstHTML(S) {
  if (!S || !S.spark) return '';
  const stars = [0, 1, 2, 3, 4, 5, 6, 7].map(i => `<img class="fspk f${i}" alt="" src="${S.spark}">`).join('');
  return `<i class="fring"></i><i class="fring r2"></i><i class="fring r3"></i>${stars}<b class="fpopt">POP!</b>`;
}

// ---- first-run goal chip (shown on the title until the first run starts)
export function firstGoalHTML(save) {
  if (!save || save.runs) return '';
  return '<b class="goal12" style="--d:.3s"><i>★</i> First goal: pop all the cells of stage 1</b>';
}

// ---- welcome back
export function hoursAway(now) {
  let last = 0; try { last = num(localStorage.getItem(KEY_VISIT)); } catch (e) { /* ignore */ }
  return last ? Math.max(0, (now - last) / 3600000) : 0;
}
export function stampVisit(now) { try { localStorage.setItem(KEY_VISIT, String(Math.round(now))); } catch (e) { /* ignore */ } }
export function awayText(h) {
  if (h < 3) return '';
  if (h < 24) return `${Math.floor(h)}h away`;
  const d = Math.floor(h / 24); return d === 1 ? '1 day away' : `${d} days away`;
}
// a short coach line for the first runs after a fall (tips use only rules the player has seen; no numbers)
export function coachLine(save) {
  if (!save || !save.runs || (save.cleared || 0) >= 2) return '';
  return ['Tip: the shielded face pops once it is alone', 'Tip: pop yellow cells for upgrades', 'Tip: slide early, the face is heading for the line'][Math.min(2, save.runs - 1)];
}
// the greeting: a title line, and a small second line about what waits. Returns null for a brand new player.
export function welcomeBack(save, now, hours) {
  if (!save || !save.runs) return null;
  const next = Math.min(50, (save.cleared || 0) + 1);
  const away = awayText(hours === undefined ? hoursAway(now) : hours);
  const bits = [];
  if (save.eggs > 0) bits.push(`\u{1F95A} ${save.eggs} to hatch`);
  if (save.streak && save.streak.n > 1) bits.push(`\u{1F525} ${save.streak.n} day streak`);
  const tip = away && save.idle ? idleAmount(save, now) : 0;
  if (tip >= 50) bits.unshift(`\u{1F9FA} +${tip} Beats`);
  if ((save.cleared || 0) === 2 && save.runs >= 3) bits.push('\u{1F4A1} Pop yellow cells to upgrade');   // a nudge for the harsh early stages, no numbers changed
  return { coach: coachLine(save), head: away ? 'Welcome back!' : 'Ready for more?', sub: `Stage ${next} is waiting` + (away ? ` · ${away}` : ''), bits };
}
export function welcomeHTML(w) {
  if (!w) return '';
  return `<div class="wb12-t">${w.head}</div><div class="wb12-s">${w.sub}</div>` + (w.coach ? `<div class="wb12-c">${w.coach}</div>` : '') + (w.bits.length ? `<div class="wb12-b">${w.bits.map(b => `<span>${b}</span>`).join('')}</div>` : '');
}
