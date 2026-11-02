// Cell Serpent: round 7 retention polish for the Goals panel and the welcome-back card. Gentle by design: a "today" rhythm strip
// (small things, no pressure), reward chips that fly to the top pills when claimed, and the Backstage tips chip on the welcome card.
import { spinReady, dailyGoals, seasonStatus, idleAmount } from './sim.js';

// pure: today's four small habits and how many are done. Nothing here ever takes anything away.
export function todayRhythm(save, day) {
  const gigsDone = save.daily && save.daily.day === day ? dailyGoals(day).filter(g => save.daily.claimed && save.daily.claimed[g.id]).length : 0;
  const items = [
    { id: 'sign', icon: '📅', label: 'Sign in', done: !!(save.sign && save.sign.day === day) },
    { id: 'spin', icon: '🎡', label: 'Spin', done: !spinReady(save, day) },
    { id: 'gigs', icon: '🎤', label: 'Gigs', done: gigsDone >= 3, note: gigsDone + '/3' },
    { id: 'stamp', icon: '⭐', label: 'Stamp', done: seasonStatus(save, day).stampedToday },
  ];
  const done = items.filter(i => i.done).length;
  const line = done === items.length ? 'All done for today. See you tomorrow!' : done === 0 ? 'Four small things, whenever you feel like it' : done + ' of ' + items.length + ' done. No rush!';
  return { items, done, line };
}
export function todayHTML(save, day) {
  const t = todayRhythm(save, day);
  return `<div class="tdy${t.done === t.items.length ? ' all' : ''}"><div class="tdh"><b>Today</b><span>${t.line}</span></div><div class="tdr">` +
    t.items.map(i => `<i class="${i.done ? 'ok' : ''}"><u>${i.icon}</u><small>${i.label}${!i.done && i.note ? ' ' + i.note : ''}</small>${i.done ? '<s>&#10003;</s>' : ''}</i>`).join('') + '</div></div>';
}

// reward chips (the green pills under the weekly card) hop up to the Beats / Sparkles pills or the top of the screen
const PILL = { '✨': 'hSpark', '🪙': 'hBeats' };
export function flyChips(chips, reduce) {
  try {
    if (reduce || !chips || !chips.length || typeof Element.prototype.animate !== 'function') return 0;
    const host = document.createElement('div'); host.className = 'gfx-host'; document.body.appendChild(host);
    let n = 0;
    chips.forEach((ch, i) => {
      const a = ch.getBoundingClientRect(); if (!a.width) return;
      const pill = document.getElementById(PILL[(ch.textContent || '').trim().slice(0, 2)] || 'hSpark'), cur = pill && pill.closest('.cur'), b = cur && cur.getBoundingClientRect();
      const tx = b && b.width ? b.left + b.width / 2 : innerWidth / 2, ty = b && b.width ? b.top + b.height / 2 : 26;
      const f = document.createElement('i'); f.className = 'gfx-fly gp-chip'; f.textContent = ch.textContent.trim();
      f.style.left = a.left + 'px'; f.style.top = a.top + 'px'; host.appendChild(f);
      const dx = tx - a.left - a.width / 2, dy = ty - a.top - a.height / 2;
      const an = f.animate([
        { transform: 'translate(0,0) scale(.7)', opacity: 0 },
        { transform: `translate(${dx * 0.08}px,${-38 - i * 6}px) scale(1.25)`, opacity: 1, offset: 0.28 },
        { transform: `translate(${dx}px,${dy}px) scale(.55)`, opacity: 0.95 },
      ], { duration: 760 + i * 90, delay: i * 120, easing: 'cubic-bezier(.4,.1,.5,1)', fill: 'both' });
      an.onfinish = () => { f.remove(); if (cur) { cur.classList.remove('gfx-bump'); void cur.offsetWidth; cur.classList.add('gfx-bump'); } if (!host.children.length) host.remove(); };
      n++;
    });
    setTimeout(() => host.remove(), 2400);
    return n;
  } catch (e) { return 0; }
}

// welcome back: the Backstage tips waiting while the player was away, with its own tap-to-collect (separate from the gift)
export const idleChipAmount = (save, now) => idleAmount(save, now);
