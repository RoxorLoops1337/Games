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
  // Soundcheck: a mic on a stand with a green check badge (popping ward, lullaby and drummer cells charges the Encore)
  chk: `<path d="M-2 14 H8 M3 14 V6" stroke="#3a2a14" stroke-width="2.4" stroke-linecap="round"/><rect x="-5" y="-15" width="16" height="19" rx="8" fill="#d9e2f2" stroke="#33406a" stroke-width="1.8"/><path d="M-5 -6 H11 M-5 -1 H11" stroke="#7f8fb8" stroke-width="1.4"/><path d="M-9 -2 q0 12 12 12 q12 0 12 -12" fill="none" stroke="#ffd86b" stroke-width="2" stroke-linecap="round" transform="translate(0 0) scale(.78) translate(1 0)"/><circle cx="11" cy="9" r="8" fill="#5ee08a" stroke="#0e5a2a" stroke-width="1.6"/><path d="M6.8 9.2 l3 3 l5 -6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  // Crescendo: three rising bars with a swelling note on top (every Quartet in a row hits harder)
  cres: `<rect x="-16" y="6" width="7" height="8" rx="2" fill="#ffd86b" stroke="#7a4b00" stroke-width="1.4"/><rect x="-6" y="-1" width="7" height="15" rx="2" fill="#ffb04d" stroke="#7a3a00" stroke-width="1.4"/><rect x="4" y="-9" width="7" height="23" rx="2" fill="#ff7a4d" stroke="#7a1d00" stroke-width="1.4"/><g transform="translate(7 -8) scale(.55)"><path d="${NOTE}" fill="#fff2b0" stroke="#6a3300" stroke-width="2.4" stroke-linejoin="round"/></g><path d="M-16 -4 L-4 -12 M-4 -12 l-1 5 M-4 -12 l5 2" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/>`,
  // fan club: a star with cheering arcs
  fan: `<path d="M0 -14 L4 -4 L15 -4 L6 3 L9 14 L0 7 L-9 14 L-6 3 L-15 -4 L-4 -4 Z" fill="#ff9ad6" stroke="#7a1f55" stroke-width="1.8" stroke-linejoin="round"/><path d="M-17 -12 q-4 6 0 12 M17 -12 q4 6 0 12" fill="none" stroke="#fff2b0" stroke-width="2" stroke-linecap="round"/>`,
  // bridge: a golden bell with ring lines
  brg: `<path d="M-11 9 Q-10 -9 0 -12 Q10 -9 11 9 Z" fill="#ffd04a" stroke="#7a4b00" stroke-width="1.8" stroke-linejoin="round"/><circle cx="0" cy="11" r="3.2" fill="#b8801c" stroke="#7a4b00" stroke-width="1.5"/><path d="M-16 -4 q-3 4 0 8 M16 -4 q3 4 0 8" fill="none" stroke="#fff2b0" stroke-width="2" stroke-linecap="round"/>`,
  // Ice Breaker: a snowflake with a crack through it
  brk: `<path d="M-4 -15 L9 -11 L14 2 L6 14 L-8 13 L-15 1 L-12 -9 Z" fill="#9fe3ff" stroke="#2a6c99" stroke-width="2" stroke-linejoin="round"/><path d="M-4 -15 L-2 -3 L9 -11 M-2 -3 L-15 1 M-2 -3 L6 14" fill="none" stroke="#e8fbff" stroke-width="1.5" stroke-linejoin="round" opacity=".85"/><path d="M-1 -14 L2 -6 L-3 -1 L4 5 L0 15" fill="none" stroke="#17405f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 -15 l3 3 l-4 1 Z M-17 9 l4 -2 l1 4 Z" fill="#dff6ff" stroke="#2a6c99" stroke-width="1.1" stroke-linejoin="round"/>`,
  // Heart Mender: a heart with a plaster across it
  hbk: `<path d="M0 14 C-19 1 -14 -14 -5 -13 C-2 -12.5 0 -9 0 -9 C0 -9 2 -12.5 5 -13 C14 -14 19 1 0 14 Z" fill="#ff7fae" stroke="#7a1f45" stroke-width="2" stroke-linejoin="round"/><path d="M-9 -8 q-4 3 -3 8" fill="none" stroke="#ffd0e2" stroke-width="2.2" stroke-linecap="round"/><path d="M-17 2 H-8 L-5 -3 L-1 8 L2 2 H17" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/><rect x="-10" y="-2" width="20" height="6.5" rx="3" fill="#ffe9c9" stroke="#7a4b00" stroke-width="1.4" transform="rotate(-38 0 1)"/><circle cx="-3" cy="1" r=".9" fill="#c79a5a"/><circle cx="3" cy="1" r=".9" fill="#c79a5a"/>`,
  // Oil Can: a little oil can with a drop (rust creaks gentler)
  oil: `<path d="M-12 12 V0 Q-12 -4 -8 -4 H6 Q10 -4 10 0 V12 Z" fill="#e0a060" stroke="#6a3a10" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 -1 L17 -9 H20" fill="none" stroke="#6a3a10" stroke-width="2.4" stroke-linecap="round"/><path d="M-6 -4 V-9 H2 V-4" fill="none" stroke="#6a3a10" stroke-width="2.2"/><path d="M19 -4 q3 5 0 7 q-3 -2 0 -7 Z" fill="#ffd04a" stroke="#7a4b00" stroke-width="1.2"/>`,
  // Sweet Tooth: a wrapped candy (sour rush weaker)
  swt: `<circle r="8.5" fill="#d8ff6a" stroke="#4a6a10" stroke-width="1.8"/><path d="M-8 -3 L-17 -9 V9 L-8 3 M8 -3 L17 -9 V9 L8 3" fill="#ffb0d8" stroke="#7a1f55" stroke-width="1.6" stroke-linejoin="round"/><path d="M-4 -3 Q0 -6 4 -3" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  // Tissue Box: a tissue box with a tissue sticking out (sneeze jolts shorter)
  tis: `<rect x="-14" y="-2" width="28" height="15" rx="3" fill="#9dd7ff" stroke="#2a5a8a" stroke-width="1.8"/><path d="M-6 -2 Q-8 -10 -2 -14 Q2 -8 0 -2 M2 -2 Q4 -12 10 -13 Q10 -6 7 -2" fill="#fff" stroke="#2a5a8a" stroke-width="1.5" stroke-linejoin="round"/><circle cx="0" cy="7" r="2.4" fill="#fff"/>`,
};
const cache = {};
export function capIconURL(id) { return ART[id] ? (cache[id] || (cache[id] = svgURL(ART[id]))) : ''; }

const KIND = { weapon: 'SKILL', capsule: 'SHOT', passive: 'BOOST' };
// batch 9: the two counter cards (Ice Breaker, Heart Mender) answer one snake trait, so they say so on the icon
export const COUNTERS = { brk: { skin: 'frosty', what: 'Frosty', shield: 'Frost shield' }, hbk: { skin: 'love', what: 'Love-Struck', shield: 'Heart heal' }, oil: { skin: 'rust', what: 'Rusty', shield: 'Creak lurch' }, swt: { skin: 'sour', what: 'Sour', shield: 'Pop rush' }, tis: { skin: 'sneezy', what: 'Sneezy', shield: 'Sneeze jolt' } };
export const kindLabel = c => (COUNTERS[c.id] ? 'COUNTER' : KIND[c.kind] || '');

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
  if (COUNTERS[c.id]) return 'Beats the ' + COUNTERS[c.id].what + ' snake here';
  if (c.id === 'chk' && (ups.brg | 0) > 0) return 'Bells count too';
  if (c.kind === 'weapon' && !c.isNew && ((ups.power | 0) > 0 || (ups.haste | 0) > 0)) return (ups.power ? 'Loud Vocals' : 'Tempo Up') + ' helps it';
  if (c.kind === 'weapon' && c.isNew && (ups.haste | 0) > 0) return 'Tempo Up recharges it';
  return '';
}
