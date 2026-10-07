// Park3D palette (preliminary, the lighting artist refines it from the research notes).
// Golden hour: warm key light, cool violet shadows, neon accents. Hue-shift shadows, never go to pure black.
export const PAL = {
  sky: { top: '#2b2a6e', mid: '#c2548f', low: '#ffb067', glow: '#ffd9a0' },
  sun: '#ffc28a', hemiSky: '#8e86d6', hemiGround: '#5a3a5c', ambientShadow: '#3a2a66',
  grass: ['#4f9a4a', '#5cae52', '#438a45', '#6bb85a'], grassDark: '#2f6b3f',
  path: ['#d8b98c', '#caa77a', '#e4c9a0'], plaza: ['#b8aec7', '#a79cba', '#c8bfd6'],
  brick: ['#9a4a3f', '#8a3f38', '#b0584a'], mortar: '#cdb9a6', wood: ['#a8693b', '#8e5530', '#c07f48'],
  iron: '#3a3550', stone: '#a9a3b5', stoneDark: '#7d7690', water: '#5ec6e8',
  leaf: ['#3f9b5a', '#58b667', '#2f7d4e', '#7ac96c', '#e0a43a'], trunk: ['#7a4e34', '#6a4230'],
  neon: { pink: '#ff3ea5', cyan: '#2ee6ff', lime: '#9dff4a', yellow: '#ffe14d', violet: '#a86bff' },
  lamp: '#ffd27a', ink: '#17102b', white: '#fff6e8',
  skin: ['#f1c9a5', '#d9a46e', '#b87f4e', '#8d5a36', '#5e3823'],
};
export const toHex = (s) => parseInt(s.slice(1), 16);
