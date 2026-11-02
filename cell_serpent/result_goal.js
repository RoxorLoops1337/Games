// Result screen helpers: the next-goal teaser (cheapest upgrade you can afford now, or the closest one) and the close-call lines.
import { META, metaCost, WEAPONS, skillUpgradeCost, SKILL_MAX_LV } from './sim.js';

// -> { ready, text, sub, tab } or null. Call AFTER the result was applied to the save.
export function nextGoal(save) {
  const opts = [];
  for (const d of META) {
    const lv = save.meta[d.id] || 0; if (lv >= d.max) continue;
    const c = metaCost(d, lv);
    opts.push({ cost: c, short: Math.max(0, c - save.beats), name: d.name + ' LV ' + (lv + 1), tab: 'Stats', cur: 'Beats' });
  }
  for (const w of WEAPONS) {
    const k = save.skills[w.id]; if (!k || k.lv < 1 || k.lv >= SKILL_MAX_LV) continue;
    const need = skillUpgradeCost(k.lv).frag;
    opts.push({ cost: need, short: Math.max(0, need - k.frag), name: w.name + ' LV ' + (k.lv + 1), tab: 'Skills', cur: 'fragments', frag: true });
  }
  if (!opts.length) return null;
  const ready = opts.filter(o => o.short === 0).sort((a, b) => a.cost - b.cost);
  if (ready.length) { const o = ready[0]; return { ready: true, tab: o.tab, text: `${o.name} is ready`, sub: o.frag ? 'Tap to level it up' : `${o.cost} Beats, tap to buy` }; }
  // nothing affordable: the closest Beats upgrade (fragments are random drops, so Beats make the clearer goal)
  const pick = opts.filter(o => !o.frag).sort((a, b) => a.short - b.short)[0] || opts.sort((a, b) => a.short - b.short)[0];
  return { ready: false, tab: pick.tab, text: `${pick.short} more ${pick.cur} for ${pick.name}`, sub: 'Tap to peek' };
}

// close-call copy for a lost run: how much of the snake was left
export function closeCall(r) {
  if (!r || r.won || r.mode || r.hard) return null;
  const pct = Math.floor((r.progress || 0) * 100), left = 100 - pct;
  if (pct >= 80) return { title: 'SO CLOSE!', sub: `Only ${left}% of the snake was left. One more go!` };
  if (pct >= 55) return { title: 'ALMOST!', sub: `${left}% to go. You popped ${r.kills} cells.` };
  return null;
}

export function renderGoal(host, goal, onGo) {
  if (!host) return;
  host.className = 'rgoal' + (goal ? ' on' + (goal.ready ? ' ready' : '') : '');
  if (!goal) { host.innerHTML = ''; host.onclick = null; return; }
  host.innerHTML = `<span class="gi">${goal.ready ? '⬆' : '🎯'}</span><span class="gt"><b>${goal.text}</b><small>${goal.sub}</small></span><span class="ga">›</span>`;
  host.onclick = onGo; host.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') onGo(); };
}
