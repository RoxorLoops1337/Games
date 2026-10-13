// Procedural SVG glyphs (no assets): trophy icons and beast emblems for the Trophies screen, the trophy ceremony and the Bestiary.
//   glyph(name, {size, cls})       -> SVG string of a 32x32 line glyph (stroke = currentColor). Unknown names fall back to a star.
//   trophyIcon(trophy)             -> glyph name for a D.TROPHIES entry (its `ic`, or a table for the original ones)
//   emblem(kind, {size, color})    -> SVG string of a round beast emblem: coloured medallion, laurel ring and the animal's head in negative
//   glyphEl(name, size) / emblemEl(kind, size) -> DOM spans that hold the SVG
// No em dashes, no external files.
const NS = 'http://www.w3.org/2000/svg';
const P = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const C = (cx, cy, r, extra = '') => `<circle cx="${cx}" cy="${cy}" r="${r}" ${extra}/>`;
const petals = (cx, cy, r0, r1, n, w = 0.42) => { let d = ''; for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, b = a + w, c = a - w; d += `M${(cx + Math.cos(c) * r0).toFixed(1)} ${(cy + Math.sin(c) * r0).toFixed(1)}L${(cx + Math.cos(a) * r1).toFixed(1)} ${(cy + Math.sin(a) * r1).toFixed(1)}L${(cx + Math.cos(b) * r0).toFixed(1)} ${(cy + Math.sin(b) * r0).toFixed(1)}`; } return P(d); };
const LEAVES = (cx, cy, r, n, a0, a1) => { let s = ''; for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * (i / (n - 1)), x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, rot = (a * 180) / Math.PI + 90; s += `<ellipse cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" rx="1.4" ry="3" transform="rotate(${rot.toFixed(0)} ${x.toFixed(1)} ${y.toFixed(1)})"/>`; } return s; };

// bodies of the line glyphs (32x32, drawn with stroke="currentColor" fill="none")
const G = {
  lion: () => petals(16, 16, 8, 13.5, 14) + C(16, 16, 8) + P('M12.5 14.5h.01M19.5 14.5h.01M16 17v2.4m-2-.4 2 1.4 2-1.4', 'stroke-linecap="round"'),
  nemean: () => G.lion() + P('M16 1.5v3M6.4 5.3l2 2M25.6 5.3l-2 2', 'stroke-linecap="round"'),
  wolf: () => P('M5 4l5.5 5.5h11L27 4l-.8 11.5-5.2 10h-10l-5.2-10z') + P('M11 15l3 1.5M21 15l-3 1.5M16 18v4.5m-2.4 1.5L16 22l2.4 2', 'stroke-linecap="round"'),
  bear: () => C(8.5, 8, 3.4) + C(23.5, 8, 3.4) + C(16, 17, 10.5) + C(16, 21, 4.2) + P('M12 14.5h.01M20 14.5h.01M16 19v1.6', 'stroke-linecap="round"'),
  boar: () => P('M4 14l4-6h16l4 6v6l-3 5h-18l-3-5z') + P('M9 18l-4.5 5M23 18l4.5 5', 'stroke-linecap="round"') + C(12, 14, 1) + C(20, 14, 1) + P('M13 20.5h6', 'stroke-linecap="round"'),
  elephant: () => P('M16 4c-5 0-8 3-8 7v5c-3 0-5 2-5 5.5S5 27 8.5 27c1 0 1.6-.6 2-1.5C11 28 12 29 14 29c1.5 0 2-1 2-2 0 1 .5 2 2 2 2 0 3-1 3.5-3.5.4.9 1 1.5 2 1.5 3.5 0 5.5-2 5.5-5.5S27 16 24 16v-5c0-4-3-7-8-7z') + P('M16 13v14', 'stroke-linecap="round"') + C(12.5, 13, 0.9) + C(19.5, 13, 0.9),
  cage: () => P('M5 8h22v18H5zM5 8c0-3 22-3 22 0M10 8v18M16 8v18M22 8v18M5 26h22', 'stroke-linejoin="round"'),
  pelt: () => P('M11 4l-6 5 3 4-2 5 3 2-1 6 5-2 3 2 3-2 5 2-1-6 3-2-2-5 3-4-6-5-3 2z', 'stroke-linejoin="round"'),
  flame: () => P('M16 3c1 5 7 8 7 15a7 7 0 0 1-14 0c0-3 1.5-5 3-6.5.3 2 1 3 2 3.5C13.500 11 14 7 16 3z', 'stroke-linejoin="round"'),
  laurel: () => P('M16 28V10') + `<g fill="currentColor" stroke="none">${LEAVES(16, 17, 8, 5, Math.PI * 0.62, Math.PI * 0.12)}${LEAVES(16, 17, 8, 5, Math.PI * 0.38, Math.PI * 0.88)}</g>` + C(16, 8, 3),
  sword: () => P('M24 4l4 4-14 14-4-4zM10 18l-4 4 3 3 4-4M6 22l-2 4 2 2 4-2', 'stroke-linejoin="round" stroke-linecap="round"'),
  scroll: () => P('M8 5h15a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V8M8 5a3 3 0 0 0-3 3v2h4M12 12h10M12 17h10M12 22h7', 'stroke-linecap="round" stroke-linejoin="round"'),
  skull: () => P('M16 4c-6 0-10 4-10 9.500 0 3.500 1.500 5.500 3.500 7V25h13v-4.500c2-1.500 3.500-3.500 3.500-7C26 8 22 4 16 4z', 'stroke-linejoin="round"') + C(11.500, 14, 2.4) + C(20.500, 14, 2.4) + P('M16 17.500l-1.500 3h3zM13 25v3M16 25v3M19 25v3', 'stroke-linejoin="round"'),
  bandage: () => P('M5 10l17-6 5 4-17 6zM10 23l17-6-5-4-17 6zM6 15l-1 8 5 2M27 8l1 8-5 2', 'stroke-linejoin="round" stroke-linecap="round"') + P('M12 8l2 3M17 6l2 3M12 22l2-3M17 20l2-3', 'stroke-linecap="round"'),
  shield: () => P('M16 3l11 4v8c0 7-5 11-11 14C10 26 5 22 5 15V7z', 'stroke-linejoin="round"') + P('M16 8v16M10 13h12', 'stroke-linecap="round"'),
  cap: () => P('M5 22c0-9 4-16 12-16 3 0 5 1 6 3-2 0-3 1-3 2.500 4 0 7 5 7 10.500z M4 22h24v4H4z', 'stroke-linejoin="round"'),
  scar: () => P('M8 5l16 22', 'stroke-width="3.2" stroke-linecap="round"') + P('M11 8l-3 3M15 13l-3.500 2.500M19 19l-3.500 2.500M23 25l-3 2', 'stroke-width="1.6" stroke-linecap="round"'),
  wreath: () => `<g fill="currentColor" stroke="none">${LEAVES(16, 16, 11, 7, Math.PI * 0.55, Math.PI * 1.45)}${LEAVES(16, 16, 11, 7, Math.PI * 0.45, Math.PI * -0.45)}</g>` + P('M16 8v3m0 10v3', 'stroke-linecap="round"') + C(16, 16, 3),
  star: () => P('M16 3l3.700 8 8.600 1-6.400 5.800 1.800 8.700L16 22.200 8.300 26.500l1.800-8.700L3.700 12l8.600-1z', 'stroke-linejoin="round"'),
  coin: () => C(16, 16, 12) + C(16, 16, 8) + P('M16 11v10M13 13.500c0-1.500 6-1.500 6 0s-6 3-6 4.500 6 1.500 6 0', 'stroke-linecap="round"'),
  fame: () => P('M4 10l6 5 6-9 6 9 6-5-3 15H7z', 'stroke-linejoin="round"') + P('M7 28h18', 'stroke-linecap="round"'),
  calendar: () => P('M5 7h22v20H5zM5 13h22M11 4v6M21 4v6', 'stroke-linejoin="round" stroke-linecap="round"') + P('M10 18h3M15 18h3M20 18h3M10 22h3M15 22h3', 'stroke-linecap="round"'),
  cup: () => P('M9 4h14v8a7 7 0 0 1-14 0zM9 7H4c0 5 2 8 6 8M23 7h5c0 5-2 8-6 8M16 19v5M10 28h12M12 24h8', 'stroke-linejoin="round" stroke-linecap="round"'),
  crown: () => P('M4 24l-1-14 8 6 5-10 5 10 8-6-1 14z M4 28h24', 'stroke-linejoin="round" stroke-linecap="round"'),
  hand: () => P('M9 16V8a2 2 0 0 1 4 0v6V5a2 2 0 0 1 4 0v9V6a2 2 0 0 1 4 0v9V9a2 2 0 0 1 4 0v10c0 6-3 9-8 9-4 0-6-2-8-6z', 'stroke-linejoin="round"'),
  drop: () => P('M16 4c4 6 8 10 8 15a8 8 0 0 1-16 0c0-5 4-9 8-15z', 'stroke-linejoin="round"'),
  swords: () => P('M5 5l14 14M27 5L13 19M4 23l5 5M28 23l-5 5M16 16l-6 8M16 16l6 8', 'stroke-linecap="round"'),
  anvil: () => P('M4 8h20c0 3-2 5-5 5h-3v4h6v5H9v-5h6v-4c-5 0-11-1-11-5zM24 8h4', 'stroke-linejoin="round"'),
  lock: () => P('M8 14h16v13H8zM11 14V9a5 5 0 0 1 10 0v5', 'stroke-linejoin="round"') + C(16, 20.500, 1.600),
  gem: () => P('M8 6h16l5 7-13 15L3 13z M3 13h26M12 6l-2 7 6 15 6-15-2-7', 'stroke-linejoin="round"'),
  rune: () => P('M16 3l10 6v14l-10 6-10-6V9z M12 10l8 6-8 6', 'stroke-linejoin="round" stroke-linecap="round"'),
  heart: () => P('M16 27C6 20 4 15 4 11a6 6 0 0 1 12-1 6 6 0 0 1 12 1c0 4-2 9-12 16z', 'stroke-linejoin="round"'),
  wing: () => P('M3 24c4 0 9-1 13-4 3-2 5-6 6-12 3 3 5 7 5 11-2 0-4 .5-5 2 2 0 3 1 3 2-3 1-6 1-9 1z', 'stroke-linejoin="round"'),
  trident: () => P('M16 6v22M9 6v7a7 7 0 0 0 14 0V6M9 6l-2 3M23 6l2 3M16 3l-2.500 4h5z', 'stroke-linecap="round" stroke-linejoin="round"'),
};
// the original 25 trophies have no `ic`: id -> glyph
const OLD = { first: 'drop', wins10: 'laurel', wins50: 'laurel', champ: 'cup', champ5: 'cup', imperial: 'crown', mercy5: 'hand', upset: 'sword', upset5: 'swords', team: 'shield', pit5: 'skull', pit10: 'skull', daily5: 'calendar', legendary: 'gem', fullset: 'shield',
  forge5: 'anvil', rich: 'coin', lvl20: 'star', legend1: 'laurel', runes: 'rune', relics6: 'gem', bouts: 'swords', faction: 'scroll', festwin: 'wreath', ascended: 'wing', all: 'crown' };

export function trophyIcon(t) { return (t && (t.ic || OLD[t.id])) || 'star'; }
export function glyph(name, { size = 28, cls = '', sw = 2 } = {}) {
  const f = G[name] || G.star;
  return `<svg class="lx-gl ${cls}" viewBox="0 0 32 32" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${f()}</svg>`;
}
export function glyphEl(name, size = 28, cls = '') { const s = document.createElement('span'); s.className = 'lx-gl-wrap ' + cls; s.style.cssText = `display:inline-grid;place-items:center;width:${size}px;height:${size}px`; s.innerHTML = glyph(name, { size }); return s; }
export const GLYPHS = Object.keys(G);

// ---------------------------------------------------------------- beast emblems
const EMB = { lion: 'lion', wolf: 'wolf', bear: 'bear', boar: 'boar', nemean: 'nemean', elephant: 'elephant' };
/** round emblem: radial medallion in the beast's colour, an engraved ring with laurel leaves, the head in cream. Gold rays for bosses. */
export function emblem(kind, { size = 56, color = '#b8803a', boss = false, locked = false } = {}) {
  const id = 'e' + Math.abs([...(kind + color)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 7)), rim = boss ? '#f2c14e' : '#d8a35c', body = EMB[kind] || 'lion';
  const rays = boss ? Array.from({ length: 12 }, (_, i) => `<path d="M32 2l1.600 6h-3.200z" transform="rotate(${i * 30} 32 32)" fill="#f2c14e" stroke="none"/>`).join('') : '';
  const ring = Array.from({ length: 24 }, (_, i) => `<circle cx="${(32 + Math.cos((i / 24) * 6.2832) * 26).toFixed(1)}" cy="${(32 + Math.sin((i / 24) * 6.2832) * 26).toFixed(1)}" r="1.100" fill="${rim}" stroke="none"/>`).join('');
  const head = locked ? `<g transform="translate(14 14) scale(1.130)" fill="none" stroke="#cfc4a8" stroke-width="2.100" stroke-linecap="round" stroke-linejoin="round">${P('M16 6c4 0 7 3 7 7 0 3-2 4-3 6l-1 3h-6l-1-3c-1-2-3-3-3-6 0-4 3-7 7-7z')}${P('M16 24v4M13 28h6')}</g><text x="32" y="38" text-anchor="middle" font-size="22" font-weight="700" fill="#cfc4a8" font-family="Georgia,serif">?</text>` : `<g transform="translate(13 13) scale(1.190)" fill="none" stroke="#fff3d6" stroke-width="1.900" stroke-linecap="round" stroke-linejoin="round">${G[body]()}</g>`;
  return `<svg class="lx-emb" viewBox="0 0 64 64" width="${size}" height="${size}" role="img" aria-label="${locked ? 'Unknown beast' : kind + ' emblem'}"><defs><radialGradient id="${id}" cx="40%" cy="32%" r="80%"><stop offset="0" stop-color="${locked ? '#6a6478' : color}" stop-opacity="1"/><stop offset="1" stop-color="#14101f"/></radialGradient></defs>${rays}<circle cx="32" cy="32" r="29" fill="url(#${id})" stroke="${rim}" stroke-width="2.200"/>${ring}<circle cx="32" cy="32" r="22" fill="none" stroke="rgba(255,243,214,.28)" stroke-width="1"/>${head}</svg>`;
}
export function emblemEl(kind, opts = {}) { const s = document.createElement('span'); s.className = 'lx-emb-wrap'; s.style.cssText = `display:inline-block;line-height:0;flex:none`; s.innerHTML = emblem(kind, opts); return s; }
