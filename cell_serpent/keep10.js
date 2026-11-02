// Cell Serpent: round 10 retention. Streak Tokens (earned from Season gifts), weekly badges to collect, the in-run "next goal" teaser
// and friendlier comeback copy. Pure helpers plus tiny HTML/DOM builders. Everything is a gift: nothing here ever takes anything away.
import { WEEK_DEFS, WEEK_ALL_BONUS, TOKEN_MAX, questState, weekChallenge, ensureWeek, seasonStatus, SEASON_DAYS, rewardText, hasShield } from './sim.js';

const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// ---- Streak Tokens
export function tokenInfo(save) {
  const n = save.addict.tok || 0;
  return { n, max: TOKEN_MAX, full: n >= TOKEN_MAX, line: n ? `${n} Streak Token${n > 1 ? 's' : ''} saved: each forgives one missed day` : 'Season gifts at 12 and 24 stamps bring a Streak Token' };
}
export function tokenRowHTML(save) {
  const t = tokenInfo(save), pips = Array.from({ length: t.max }, (_, i) => `<u class="${i < t.n ? 'on' : ''}"></u>`).join('');
  return `<span class="tokrow${t.n ? ' on' : ''}" role="img" aria-label="${esc(t.line)}"><i class="tkc">${pips}</i><em>${esc(t.line)}</em></span>`;
}
// the one shield/token line used by the spin card: the shield wins, then tokens
export function protectLine(save) {
  if (hasShield(save)) return null;
  return save.addict.tok > 0 ? `Streak Token ready: it forgives one missed day (${save.addict.tok} saved)` : null;
}

// ---- weekly badges: one collectible per weekly challenge kind
export const WEEK_BADGES = {
  cells: { icon: '🫧', name: 'Popper' }, runs: { icon: '🎵', name: 'Encore' }, bombs: { icon: '💣', name: 'Boom Pal' },
  chests: { icon: '🎁', name: 'Treasure' }, picks: { icon: '🟡', name: 'Picky' }, wins: { icon: '🏆', name: 'Headliner' },
};
export function weekBadges(save) {
  const wb = save.addict.wb || {}, list = WEEK_DEFS.map(d => ({ id: d.id, ...WEEK_BADGES[d.id], n: wb[d.id] || 0, got: (wb[d.id] || 0) > 0 }));
  const got = list.filter(b => b.got).length;
  return { list, got, total: list.length, all: got === list.length, bonusTaken: !!save.addict.claimed['wb:all'], bonusText: rewardText(WEEK_ALL_BONUS) };
}
export function weekBadgesHTML(save, thisWeekId) {
  const b = weekBadges(save);
  const cells = b.list.map(x => `<i class="wbd${x.got ? ' got' : ''}${x.id === thisWeekId ? ' now' : ''}" title="${esc(x.name)}"><b>${x.icon}</b>${x.n > 1 ? `<s>${x.n}</s>` : ''}<small>${x.got ? esc(x.name) : x.id === thisWeekId ? 'This week' : '???'}</small></i>`).join('');
  return `<div class="wbrow"><div class="wbh"><b>Weekly badges ${b.got}/${b.total}</b><span>${b.all ? 'Every badge is yours!' : 'All six: ' + esc(b.bonusText)}</span></div><div class="wbg">${cells}</div></div>`;
}

// ---- in-run teaser: one small, kind line about the closest goal. Never blocks anything, fades by itself.
export function nextGoalTeaser(save, day) {
  const st = questState(save, day);
  let near = null;
  for (const q of st.quests) { if (q.done) continue; const f = q.prog / q.target; if (!near || f > near.f) near = { f, q }; }
  if (near && near.f >= 0.5) return { kind: 'quest', icon: near.q.icon, text: `${near.q.target - near.q.prog} more: ${near.q.text}`, f: near.f };
  const se = seasonStatus(save, day);
  if (!se.stampedToday && se.stamps < SEASON_DAYS) { const nx = se.miles.find(m => !m.got), left = nx ? nx.at - se.stamps : 0; return { kind: 'stamp', icon: '⭐', text: nx ? `Finish a run for today's Season stamp` : 'Finish this run for a Season stamp', f: 0.4 }; }
  const wk = ensureWeek(save, day), wc = weekChallenge(day);
  if (!wk.claimed && wk.prog < wc.target && wk.prog / wc.target >= 0.3) return { kind: 'week', icon: '🏅', text: `${wc.target - wk.prog} to go: ${wc.text}`, f: wk.prog / wc.target };
  if (near) return { kind: 'quest', icon: near.q.icon, text: `Quest: ${near.q.text}`, f: near.f };
  return null;
}
let teaseEl = null, teaseT = 0;
export function teaseGoal(save, day, reduce) {
  try {
    clearTimeout(teaseT); if (teaseEl) teaseEl.classList.remove('on');
    const t = nextGoalTeaser(save, day); if (!t) return null;
    if (!teaseEl) { teaseEl = document.createElement('div'); teaseEl.id = 'goalTease'; teaseEl.setAttribute('role', 'status'); document.body.appendChild(teaseEl); }
    teaseEl.className = 'tz-' + t.kind + (reduce ? ' calm' : '');
    teaseEl.innerHTML = `<i>${t.icon}</i><span>${esc(t.text)}</span>`;
    teaseEl.classList.remove('on'); void teaseEl.offsetWidth;
    teaseT = setTimeout(() => { if (!teaseEl) return; teaseEl.classList.add('on'); teaseT = setTimeout(() => { if (teaseEl) teaseEl.classList.remove('on'); }, 4600); }, 2600);   // after the stage banner has passed
    return t;
  } catch (e) { return null; }
}
export function hideTease() { clearTimeout(teaseT); if (teaseEl) teaseEl.classList.remove('on'); }

// ---- comeback polish
export function awayText(days) { return days >= 14 ? 'a couple of weeks' : days >= 7 ? 'about a week' : days + ' days'; }
export function comebackExtra(save, g) {
  const out = [];
  if (g.reward.tok) out.push(g.reward.tok + ' Streak Token');
  const sp = save.addict.spin; if (sp.n >= 2) out.push('Your spin streak is kept safe');
  return out;
}
