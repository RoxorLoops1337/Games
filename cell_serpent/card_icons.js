// 07-cards round 3: distinct drawn icons for the four capsule upgrades (they all used the same music note),
// a kind label for the pick cards and short synergy hints. Pure display, no simulation state is changed.

const NOTE = 'M0 -13 L0 8 A6 4.6 0 1 1 -3 3.6 L-3 -9 L9 -12 L9 5 A6 4.6 0 1 1 6 0.6 L6 -9.6 Z';
const svgURL = body => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="-20 -20 40 40" width="64" height="64">${body}</svg>`);
const ART = {
  // faster tempo: metronome with speed lines
  aspd: `<path d="M-9 14 L-4 -13 L4 -13 L9 14 Z" fill="#ffd86b" stroke="#7a4b00" stroke-width="1.6" stroke-linejoin="round"/><path d="M0 8 L5 -9" stroke="#3a2200" stroke-width="2" stroke-linecap="round"/><circle cx="3" cy="-4" r="2.6" fill="#ff4d7a" stroke="#7a1030" stroke-width="1"/><path d="M-17 -3 h5 M-18 3 h6 M-16 9 h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round" opacity=".8"/>`,
  // harmony: two notes side by side
  notes: `<g transform="translate(-6 3) scale(.8)"><path d="${NOTE}" fill="#6fe3ff" stroke="#0b4a66" stroke-width="2" stroke-linejoin="round"/></g><g transform="translate(9 0) scale(.8)"><path d="${NOTE}" fill="#9dff6d" stroke="#1d5a10" stroke-width="2" stroke-linejoin="round"/></g>`,
  // echo: a note with fading copies behind it
  burst: `<g transform="translate(-10 2) scale(.7)" opacity=".35"><path d="${NOTE}" fill="#d29bff"/></g><g transform="translate(-4 1) scale(.78)" opacity=".6"><path d="${NOTE}" fill="#d29bff"/></g><g transform="translate(5 0) scale(.9)"><path d="${NOTE}" fill="#e7c2ff" stroke="#4a1a7a" stroke-width="1.8" stroke-linejoin="round"/></g>`,
  // volume up: speaker with sound waves
  cdmg: `<path d="M-14 -5 h6 l8 -7 v24 l-8 -7 h-6 Z" fill="#ffb04d" stroke="#6a3300" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 -6 q5 6 0 12 M9 -11 q9 11 0 22 M13 -16 q13 16 0 32" fill="none" stroke="#fff2b0" stroke-width="2.2" stroke-linecap="round"/>`,
  // fan club: a star with cheering arcs
  fan: `<path d="M0 -14 L4 -4 L15 -4 L6 3 L9 14 L0 7 L-9 14 L-6 3 L-15 -4 L-4 -4 Z" fill="#ff9ad6" stroke="#7a1f55" stroke-width="1.8" stroke-linejoin="round"/><path d="M-17 -12 q-4 6 0 12 M17 -12 q4 6 0 12" fill="none" stroke="#fff2b0" stroke-width="2" stroke-linecap="round"/>`,
  // bridge: a golden bell with ring lines
  brg: `<path d="M-11 9 Q-10 -9 0 -12 Q10 -9 11 9 Z" fill="#ffd04a" stroke="#7a4b00" stroke-width="1.8" stroke-linejoin="round"/><circle cx="0" cy="11" r="3.2" fill="#b8801c" stroke="#7a4b00" stroke-width="1.5"/><path d="M-16 -4 q-3 4 0 8 M16 -4 q3 4 0 8" fill="none" stroke="#fff2b0" stroke-width="2" stroke-linecap="round"/>`,
};
const cache = {};
export function capIconURL(id) { return ART[id] ? (cache[id] || (cache[id] = svgURL(ART[id]))) : ''; }

const KIND = { weapon: 'SKILL', capsule: 'SHOT', passive: 'BOOST' };
export const kindLabel = c => KIND[c.kind] || '';

// A short hint when this card works with what the player already has. Empty string when nothing special.
export function synergyHint(g, c) {
  const ups = g.ups || {}, nSk = Object.keys(g.weap || {}).length;
  if (c.lvl + 1 >= c.max && !c.isNew) return 'LAST LEVEL';
  if (c.kind === 'passive' && (c.id === 'power' || c.id === 'haste') && nSk >= 2) return 'Boosts all ' + nSk + ' skills';
  if (c.id === 'crit' && (ups.cdmg | 0) > 0) return 'Crits hit harder with Volume Up';
  if (c.id === 'cdmg' && (ups.crit | 0) > 0) return 'Pairs with Perfect Pitch';
  if (c.id === 'burst' && (ups.notes | 0) > 0) return 'Echoes your Harmony notes';
  if (c.id === 'notes' && (ups.burst | 0) > 0) return 'Echoed by your bursts';
  if (c.id === 'aspd' && (ups.notes | 0) + (ups.burst | 0) > 0) return 'More shots, faster';
  if (c.id === 'fan' && (ups.brg | 0) > 0) return 'Bell rings add Groove';
  if (c.id === 'brg' && (ups.fan | 0) > 0) return 'Bell rings add Groove';
  if (c.id === 'brg' && (ups.chk | 0) > 0) return 'Soundcheck loves bells';
  if (c.id === 'chk' && (ups.brg | 0) > 0) return 'Bells count too';
  if (c.kind === 'weapon' && !c.isNew && ((ups.power | 0) > 0 || (ups.haste | 0) > 0)) return (ups.power ? 'Loud Vocals' : 'Tempo Up') + ' helps it';
  if (c.kind === 'weapon' && c.isNew && (ups.haste | 0) > 0) return 'Tempo Up recharges it';
  return '';
}
