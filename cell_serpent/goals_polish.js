// Cell Serpent: round 7 retention polish for the Goals panel and the welcome-back card. Gentle by design: a "today" rhythm strip
// (small things, no pressure), reward chips that fly to the top pills when claimed, and the Backstage tips chip on the welcome card.
import { spinReady, dailyGoals, seasonStatus, idleAmount } from './sim.js';

// pure: today's four small habits and how many are done. Nothing here ever takes anything away.
export function todayRhythm(save, day, hour) {
  const gigsDone = save.daily && save.daily.day === day ? dailyGoals(day).filter(g => save.daily.claimed && save.daily.claimed[g.id]).length : 0;
  const items = [
    { id: 'sign', icon: '📅', label: 'Sign in', done: !!(save.sign && save.sign.day === day) },
    { id: 'spin', icon: '🎡', label: 'Spin', done: !spinReady(save, day) },
    { id: 'gigs', icon: '🎤', label: 'Gigs', done: gigsDone >= 3, note: gigsDone + '/3' },
    { id: 'stamp', icon: '⭐', label: 'Stamp', done: seasonStatus(save, day).stampedToday },
  ];
  const done = items.filter(i => i.done).length;
  const line = done === items.length ? 'All done for today. See you tomorrow!' : done === 0 ? (hour >= 5 && hour < 12 ? 'Good morning! ' : hour >= 12 && hour < 18 ? 'Hello again! ' : hour >= 18 || hour < 3 ? 'Nice to see you tonight! ' : '') + 'Four small things, whenever you like' : done + ' of ' + items.length + ' done. No rush!';
  return { items, done, line };
}
// round 8: the "ready to collect" bits live in the Today header now (one row instead of a separate 60px banner); each is a tap-to-scroll chip
export function todayHTML(save, day, ready) {
  const t = todayRhythm(save, day, new Date().getHours()), rd = ready && ready.length ? ready : null;
  const mid = rd ? `<span class="tdrd">${rd.map(r => `<button type="button" class="tdgo" data-go="${r.go}">${r.text}</button>`).join('')}</span>` : `<span>${t.line}</span>`;
  return `<div class="tdy${t.done === t.items.length ? ' all' : ''}${rd ? ' hasrd' : ''}"><div class="tdh"><b>${rd ? 'Ready' : 'Today'}</b>${mid}</div><div class="tdr">` +
    t.items.map(i => `<i class="${i.done ? 'ok' : ''}"><u>${i.icon}</u><small>${i.label}${!i.done && i.note ? ' ' + i.note : ''}</small>${i.done ? '<s>&#10003;</s>' : ''}</i>`).join('') + '</div></div>';
}

// reward chips (the green pills under the weekly card) hop up to the Beats / Sparkles pills or the top of the screen
const PILL = { '✨': 'hSpark', '🪙': 'hBeats', '⚡': 'hEnergy' };
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

// round 8: a reward object (beats, sparkles, energy, eggs) hops from any element up to the pills, like the weekly chips do
export function flyReward(from, rw, reduce) {
  try {
    if (reduce || !from || !rw) return 0;
    const a = from.getBoundingClientRect(); if (!a.width) return 0;
    const bits = [rw.beats ? '🪙 ' + rw.beats : '', rw.sparkles ? '✨ ' + rw.sparkles : '', rw.energy ? '⚡ ' + rw.energy : '', rw.eggs ? '🥚 ' + rw.eggs : ''].filter(Boolean);
    const tmp = bits.map((t, i) => { const e = document.createElement('i'); e.className = 'gp-chip'; e.style.cssText = `visibility:hidden;left:${a.left + a.width / 2 - 34 + i * 6}px;top:${a.top + a.height / 2 - 10}px`; e.textContent = t; document.body.appendChild(e); return e; });
    const n = flyChips(tmp, false);
    tmp.forEach(e => e.remove());
    return n;
  } catch (e) { return 0; }
}

// round 8: the trophy shelf. A header with the count and one mini medal per trophy, a medal tier per trophy, ready ones first, finished last.
export const trophyTier = r => (r && r.sparkles >= 60 ? 'gold' : r && (r.sparkles >= 25 || r.eggs) ? 'silver' : 'bronze');
export function trophyOrder(save, list) {
  const rank = t => save.trophies[t.id] ? 3 : t.get(save) >= t.at ? 0 : 1 + (1 - Math.min(1, t.get(save) / t.at)) * 0.99;
  return list.map((t, i) => ({ t, i, r: rank(t) })).sort((a, b) => a.r - b.r || a.i - b.i).map(x => x.t);
}
export function shelfHeadHTML(save, list, ready) {
  const got = list.filter(t => save.trophies[t.id]).length, pct = Math.round(got / list.length * 100);
  const dots = list.map(t => `<i class="${save.trophies[t.id] ? 'got ' + trophyTier(t.reward) : ready(t) ? 'rdy' : ''}"></i>`).join('');
  return `<div class="shelfhead"><div class="shl"><b>${got}<small> of ${list.length}</small></b><span>${got === list.length ? 'Every trophy is yours!' : got === 0 ? 'Your shelf is waiting' : 'on the shelf, nicely done'}</span></div><div class="shd">${dots}</div><div class="shb"><i style="width:${pct}%"></i></div></div>`;
}
