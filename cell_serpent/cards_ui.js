// 07-cards round 2: odds hint, refresh pips and the build summary strip for the pick screen.
// Pure display helpers: nothing here touches the simulation or its random numbers.
import { rarityWeights, RARITIES, WEAPONS, LUCK_MAX, CAPSULE_UPS, PASSIVES, uv } from './sim.js';

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
  return out.length ? `<span class="bl">YOUR BAND</span>${out.join('')}<span class="bmore">i</span>` : '';
}

// ---- round 4: stat-delta text for passive cards, band totals sheet with synergy chain
const PNAME = { power: 'Skill damage', haste: 'Skill recharge', crit: 'Crit chance', vital: 'Snake speed', enc: 'Encore charge', dbeat: 'On-beat damage', speed: 'Pierce' };
function totalText(id, v) {
  if (id === 'notes' || id === 'burst') return String(1 + v);
  if (id === 'speed') return v === 0 ? 'none' : '+' + v + ' cell' + (v === 1 ? '' : 's');
  if (id === 'vital') return v < 2 ? '0%' : '-' + Math.round(v / 4) + '%';
  return '+' + v + '%';
}
// "Skill damage: +9% → +17%" for a passive card (same shape the capsule cards already use)
export function passiveStat(g, c) {
  if (c.kind !== 'passive' || !(c.gain > 0)) return '';
  if (c.id === 'guard') return 'Push back: ' + c.gain * 6 + ' px now';
  const cur = uv(g, c.id), nm = PNAME[c.id] || c.name;
  return `${nm}: ${totalText(c.id, cur)} → ${totalText(c.id, cur + c.gain)}`;
}
const NAMES = Object.fromEntries([...CAPSULE_UPS, ...PASSIVES].map(u => [u.id, u.name]));
const CHAINS = [['notes', 'burst', 'Every note gets an echo'], ['crit', 'cdmg', 'Crits hit much harder'], ['aspd', 'notes', 'More notes, faster'], ['aspd', 'burst', 'Echoes come quicker'], ['power', 'haste', 'Hit harder, recharge faster'], ['dbeat', 'aspd', 'Land more notes on the beat']];
export function bandSheetHTML(g, iconFn) {
  const rows = [], ups = g.ups || {};
  for (const id of ['aspd', 'notes', 'burst', 'cdmg', 'power', 'haste', 'crit', 'vital', 'enc', 'dbeat', 'speed']) {
    if (!(ups[id] > 0) || !NAMES[id]) continue;
    rows.push(`<div class="bsr"><span class="bsn">${CAP_GLYPH[id] || '🎶'} ${NAMES[id]}</span><i>x${ups[id]}</i><b>${totalText(id, uv(g, id))}</b></div>`);
  }
  for (const w of WEAPONS) { const l = g.weap && g.weap[w.id] ? g.weap[w.id].lv : 0; if (l > 0) rows.push(`<div class="bsr sk"><span class="bsn"><span class="bsg">${iconFn(w.id)}</span> ${w.name}</span><i>Lv</i><b>${l}</b></div>`); }
  const chain = CHAINS.map(([a, b, t]) => {
    const A = ups[a] > 0, B = ups[b] > 0;
    if (!A && !B) return '';
    return `<div class="bch ${A && B ? 'on' : ''}"><span>${NAMES[a]}</span><em>${A && B ? '+' : '?'}</em><span>${NAMES[b]}</span><u>${A && B ? t : 'Find ' + (A ? NAMES[b] : NAMES[a])}</u></div>`;
  }).filter(Boolean).sort((x, y) => (y.includes('bch on') ? 1 : 0) - (x.includes('bch on') ? 1 : 0)).slice(0, 4).join('');
  return `<div class="bsh"><div class="bst">YOUR BAND</div>${rows.join('') || '<div class="bsr"><span class="bsn">Nothing yet</span></div>'}${chain ? `<div class="bst">SYNERGY CHAIN</div>${chain}` : ''}<div class="bsx">tap to close</div></div>`;
}

// Reveal drama: a colour burst and a stamped rarity word when the best card on offer is Epic or better.
const STAMP = ['', '', 'EPIC!', 'LEGENDARY!', 'MYTHIC!!', 'GODLIKE!!!'];
export function revealHTML(top) {
  if (top < 2) return '';
  return `<div class="rvl t${top}" style="--rc:${RARITIES[top].color}" aria-hidden="true"><span class="rvb"></span><span class="rvw">${STAMP[top]}</span></div>`;
}
