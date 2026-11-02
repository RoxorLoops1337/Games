// 07-cards round 2: odds hint, refresh pips and the build summary strip for the pick screen.
// Pure display helpers: nothing here touches the simulation or its random numbers.
import { rarityWeights, RARITIES, WEAPONS, LUCK_MAX } from './sim.js';

const CAP_GLYPH = { aspd: '⚡', notes: '🎵', burst: '🔁', cdmg: '🔊', power: '🎤', haste: '⏱️', crit: '🎯', vital: '❤️', guard: '🎧', speed: '👟' };
const lk = g => Math.min(1, Math.max(0.1, (g.stage || 1) / 10));

// Same luck the dealer uses for the next roll (read only copy of the formula in sim.js rollChoices).
export function luckNow(g) { return (g.level - 1) * lk(g); }

// Chance that a non-guaranteed card is at least tier t (1 rare, 2 epic, 3 legendary).
export function oddsAtLeast(luck) {
  const w = rarityWeights(luck), tot = w.reduce((a, b) => a + b, 0);
  return [1, 2, 3].map(t => w.slice(t).reduce((a, b) => a + b, 0) / tot);
}
const pct = p => (p >= 0.995 ? '99' : p < 0.01 ? '<1' : String(Math.round(p * 100))) + '%';

export function luckHTML(g) {
  const luck = luckNow(g), o = oddsAtLeast(luck), nx = oddsAtLeast(luck + lk(g));
  const fill = Math.round(Math.min(1, luck / LUCK_MAX) * 100), up = Math.round((nx[0] - o[0]) * 100);
  const chip = (i, t) => `<span class="lk" style="--rc:${RARITIES[i + 1].color}"><i></i>${t}<b>${pct(o[i])}</b></span>`;
  return `<div class="lkbar"><span class="lkl">LUCK</span><span class="lkt"><span style="width:${fill}%"></span></span>${up > 0 ? `<em>+${up}% next</em>` : ''}</div><div class="lkrow">${chip(0, 'Rare+')}${chip(1, 'Epic+')}${chip(2, 'Legend+')}</div>`;
}

export function refreshPips(g, total = 4) {
  return Array.from({ length: total }, (_, k) => `<i class="${k < g.rerolls ? 'on' : ''}"></i>`).join('');
}

// Build strip: capsule and passive upgrades with their pick counts, then skills with their level.
export function buildHTML(g, iconFn) {
  const out = [];
  for (const id of Object.keys(g.ups || {})) { const n = g.ups[id]; if (n > 0 && CAP_GLYPH[id]) out.push(`<span class="bi"><span class="g">${CAP_GLYPH[id]}</span><b>${n}</b></span>`); }
  for (const w of WEAPONS) { const l = g.weap && g.weap[w.id] ? g.weap[w.id].lv : 0; if (l > 0) out.push(`<span class="bi sk"><span class="g">${iconFn(w.id)}</span><b>${l}</b></span>`); }
  return out.length ? `<span class="bl">YOUR BAND</span>${out.join('')}` : '';
}
