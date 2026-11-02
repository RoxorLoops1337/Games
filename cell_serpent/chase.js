// Cell Serpent: round 9 collection chase and streak feel. Pure helpers (no DOM) plus small HTML builders.
// Quest chest streak, tomorrow's spin peek, quest near-miss line and the Stage Sticker album. Everything here is a gift:
// a missed day or an empty sticker never takes anything away.
import { SPIN_PRIZES, spinPrize, QS_BONUS, questState, grantReward, rewardText, MAX_STAGE } from './sim.js';

// Chest streak as the player should see it: alive when the last chest was today or yesterday.
export function questStreak(save, day) {
  const q = save.addict.qs || { last: 0, n: 0, b: 0 };
  const alive = q.n > 0 && (q.last === day || q.last === day - 1 || (q.last === day - 2 && save.addict.tok > 0)), n = alive ? q.n : 0, openedToday = q.last === day;
  const nx = QS_BONUS.find(m => m.at > n) || null;
  return { n, openedToday, atRisk: alive && !openedToday && n >= 2, next: nx ? { at: nx.at, left: nx.at - n - (openedToday ? 0 : 1), reward: nx.reward } : null, bonus: openedToday && q.b ? QS_BONUS[q.b - 1] : null };
}
// One short line for the quests strip / panel, or ''.
export function questStreakLine(save, day) {
  const s = questStreak(save, day);
  if (s.bonus) return `Chest streak ${s.n}! Bonus: ${rewardText(s.bonus.reward)}`;
  if (s.atRisk) return `Open today's chest to keep your ${s.n} day streak`;
  if (s.n >= 2) return `${s.n} day chest streak` + (s.next && s.next.left > 0 ? `, bonus in ${s.next.left}` : '');
  return s.next && !s.openedToday ? `Chest streak: ${s.next.at} days brings a bonus` : '';
}
// Tomorrow's lucky spin prize is fixed by the date, so we can show the truth.
export function tomorrowPeek(day) {
  const p = SPIN_PRIZES[spinPrize(day + 1)];
  return { icon: p.icon, text: rewardText(p.reward), line: `Tomorrow's spin: ${p.icon} ${rewardText(p.reward)}` };
}
// Near miss: the closest unfinished quest that is at least 60% there.
export function questNear(save, day) {
  const st = questState(save, day);
  let best = null;
  for (const x of st.quests) {
    if (x.done) continue;
    const f = x.prog / x.target;
    if (f >= 0.6 && (!best || f > best.f)) best = { f, left: x.target - x.prog, x };
  }
  if (!best) return null;
  return { icon: best.x.icon, left: best.left, text: `${best.left} more for "${best.x.text}"`, id: best.x.id };
}

// ---- Stage Stickers: one sticker per stage, shinier with every star. Gold stickers unlock small prizes.
export const STICKER_MILES = [
  { at: 5, reward: { beats: 200 } }, { at: 15, reward: { sparkles: 8 } }, { at: 30, reward: { eggs: 1 } }, { at: 50, reward: { sparkles: 60, eggs: 2 } },
];
export function stickerAlbum(save) {
  const cells = [];
  let gold = 0, any = 0;
  for (let st = 1; st <= MAX_STAGE; st++) { const stars = Math.min(3, (save.stars && save.stars[st]) || 0); cells.push({ stage: st, stars }); if (stars === 3) gold++; if (stars) any++; }
  // the sticker to chase: a started sticker that can still shine, else the next stage to try
  const shine = cells.find(c => c.stars > 0 && c.stars < 3), fresh = cells.find(c => c.stars === 0 && c.stage <= (save.cleared || 0) + 1);
  const target = shine || fresh || null;
  const done = id => !!save.addict.claimed[id];
  const miles = STICKER_MILES.map((m, i) => ({ ...m, i, got: gold >= m.at, claimed: done('stk:' + m.at), ready: gold >= m.at && !done('stk:' + m.at) }));
  return { cells, gold, any, target, miles, nextMile: miles.find(m => !m.got) || null };
}
export function claimSticker(save, at) {
  const m = stickerAlbum(save).miles.find(x => x.at === at);
  if (!m || !m.ready) return false;
  save.addict.claimed['stk:' + at] = 1; grantReward(save, m.reward); return true;
}
export function stickerHint(a) {
  if (!a.target) return 'Every sticker shines!';
  const t = a.target;
  return t.stars ? `Stage ${t.stage} can still shine: ${3 - t.stars} more star${3 - t.stars > 1 ? 's' : ''}` : `Stage ${t.stage} is waiting for its first sticker`;
}
export function stickerGridHTML(a) {
  const tgt = a.target ? a.target.stage : 0;
  return `<div class="stkg" role="img" aria-label="Stage stickers, ${a.gold} gold of ${a.cells.length}">` + a.cells.map(c =>
    `<i class="stk s${c.stars}${c.stage === tgt ? ' nx' : ''}" title="Stage ${c.stage}">${c.stars ? (c.stars === 3 ? '★' : c.stars) : c.stage === tgt ? '?' : ''}</i>`).join('') + '</div>';
}
