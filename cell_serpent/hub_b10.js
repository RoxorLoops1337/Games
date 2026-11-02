// Round 10 hub touches (agent 10): a personal records card for the Stats tab, a set bonus strip for Gear and a savings line
// for the Shop treats. Pure helpers (testable headless) plus tiny HTML builders; hub2.js only calls them.
import { levelInfo } from './sim.js';

// ---- personal records
export function recordsOf(s) {
  const stars = Object.values(s.stars || {});
  return [
    { id: 'best', label: 'Best stage', val: Math.max(s.best || 0, s.cleared || 0), col: '#ffd84d' },
    { id: 'runs', label: 'Gigs played', val: s.runs || 0, col: '#ff7ab8' },
    { id: 'pops', label: 'Cells popped', val: s.kills || 0, col: '#ff6a6a' },
    { id: 'gold', label: 'Triple stars', val: stars.filter(v => v >= 3).length, col: '#ffd84d' },
    { id: 'lv', label: 'Level', val: levelInfo(s.xp || 0).lv, col: '#b06cff' },
    { id: 'hot', label: 'Spicy clears', val: s.hardCleared || 0, col: '#ff6a3a' },
    { id: 'pet', label: 'Pets hatched', val: Object.values(s.pets || {}).filter(p => p.star > 0).length, col: '#9bd8ff' },
    { id: 'streak', label: 'Day streak', val: (s.streak && s.streak.n) || 0, col: '#7be0a0' },
  ];
}
export const shortNum = n => (n >= 100000 ? Math.round(n / 1000) + 'k' : n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));
export function recordsHTML(s) {
  const r = recordsOf(s);
  return `<div class="sec"><span style="background:#7a4be0">Personal Bests</span></div><div class="recgrid">` +
    r.map(x => `<div class="rec${x.val ? '' : ' zero'}" style="--rc:${x.col}"><b>${shortNum(x.val)}</b><small>${x.label}</small></div>`).join('') + '</div>';
}

// ---- set bonus strip: one chip per keepsake set, pips for the members, glows when the bonus is active
export function setStripState(KEEPSAKES, KEEP_SETS, lvOf) {
  return KEEP_SETS.map(set => { const mem = KEEPSAKES.filter(k => k.set === set.id), have = mem.filter(k => lvOf(k) > 0).length; return { id: set.id, name: set.name, have, total: mem.length, full: have === mem.length && mem.length > 0, stat: set.stat, val: set.val }; });
}
export function setStripHTML(states, STAT_TEXT) {
  return states.map(t => `<button type="button" class="sbchip${t.full ? ' on' : ''}" data-set="${t.id}" aria-label="${t.name}: ${t.have} of ${t.total}${t.full ? ', bonus active' : ''}"><span class="sbn">${t.name}</span><span class="sbp">${Array.from({ length: t.total }, (_, i) => `<i class="${i < t.have ? 'on' : ''}"></i>`).join('')}</span><span class="sbv">${t.full ? STAT_TEXT[t.stat](t.val) : t.have + '/' + t.total}</span></button>`).join('');
}

// ---- shop: what the open treats save you versus the full price
export function treatSavings(deals, bought) {
  let left = 0, save = 0;
  deals.forEach((d, i) => { if (bought && bought[i]) return; left++; if (d.base && d.base > d.price) save += d.base - d.price; });
  return { left, save };
}
export function treatLine(deals, bought) {
  const { left, save } = treatSavings(deals, bought);
  if (!left) return 'All treats eaten, see you tomorrow';
  return save > 0 ? `${left} treat${left > 1 ? 's' : ''} left, save ${save}` : `${left} treat${left > 1 ? 's' : ''} left`;
}
