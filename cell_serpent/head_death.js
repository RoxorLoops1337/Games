// 01-enemy-art r9: per-species head death. The dazed face that pops out of a killed head leaves in its species style
// (love spirals up, rust clanks down, sneezy is blown sideways, grumpy cartwheels off, ...).
// Pure maths, no allocations: deathMotion() fills a reused object. u is 0..1 over the prop's life.
const STYLE = {
  love: 'spiral', rust: 'clank', sneezy: 'blow', grumpy: 'cartwheel', sleepy: 'drift', disco: 'pirouette',
  sour: 'pucker', mighty: 'thud', frosty: 'float', piggy: 'hop', gloomy: 'sink',
};
export const DEATH_STYLES = Object.keys(STYLE).map(k => STYLE[k]);
export const deathStyle = skin => STYLE[skin] || 'spiral';
const OUT = { dx: 0, dy: 0, rot: 0, sc: 1, a: 1 };
// size = the prop's on-screen size; side = -1 or 1 (which way it spins off). Returns OUT (reused, read it at once).
export function deathMotion(skin, u, size, side) {
  const s = deathStyle(skin), o = OUT, k = u < 0 ? 0 : u > 1 ? 1 : u, e = k * k;
  o.dx = 0; o.dy = 0; o.rot = Math.sin(k * 7) * 0.22; o.sc = 1; o.a = 1;
  switch (s) {
    case 'spiral': o.dx = Math.sin(k * 11) * size * 0.28 * k; o.dy = -size * 0.5 * k; o.rot = k * 9 * side; o.sc = 1 - k * 0.35; break;
    case 'clank': o.dy = size * 1.3 * e - size * 0.3 * Math.sin(Math.min(1, k * 2.2) * Math.PI); o.dx = side * size * 0.3 * k; o.rot = k * 5 * side; break;
    case 'blow': o.dx = side * size * 2 * k; o.dy = -size * 0.4 * Math.sin(k * Math.PI) + size * 0.3 * e; o.rot = k * 7 * side; o.sc = 1 - k * 0.5; break;
    case 'cartwheel': o.dx = side * size * 1.4 * k; o.dy = -size * 0.7 * Math.sin(k * 2.6) + size * 0.5 * e; o.rot = k * 14 * side; o.sc = 1 - k * 0.3; break;
    case 'drift': o.dy = -size * 0.4 * k; o.dx = Math.sin(k * 4) * size * 0.16; o.rot = Math.sin(k * 4) * 0.5; o.sc = 1 + k * 0.1; break;
    case 'pirouette': o.dy = -size * 0.4 * Math.sin(Math.min(1, k * 1.4) * Math.PI * 0.5); o.rot = k * 18 * side; o.sc = 1 + 0.18 * Math.sin(k * 12); break;
    case 'pucker': o.dy = -size * 0.2 * k; o.rot = k * 6 * side; o.sc = Math.max(0.05, 1 - e * 1.1); break;
    case 'thud': o.dy = size * 0.6 * Math.min(1, k * 3) - (k > 0.3 ? Math.abs(Math.sin((k - 0.3) * 12)) * size * 0.12 * (1 - k) : 0); o.rot = 0.5 * side * Math.min(1, k * 3); o.sc = 1 + 0.1 * Math.min(1, k * 4); break;
    case 'float': o.dy = -size * 0.7 * k; o.rot = k * 3 * side; o.sc = 1 + k * 0.15; break;
    case 'hop': o.dy = -Math.abs(Math.sin(k * 9)) * size * 0.5 * (1 - k * 0.6); o.dx = side * size * 0.9 * k; o.rot = Math.sin(k * 18) * 0.3; break;
    default: o.dy = size * 0.8 * e; o.rot = side * 0.6 * k; o.sc = 1 - k * 0.25; break;   // sink
  }
  o.a = k < 0.65 ? 1 : Math.max(0, 1 - (k - 0.65) / 0.35);
  return o;
}

// 01-enemy-art r10: a killed boss loses its crown. It is tossed off the head, bounces twice on the floor and rolls away, slowing
// to a wobble, then fades. Same contract as deathMotion: one reused object, u 0..1, size = on-screen crown size, side = -1 or 1.
const COUT = { dx: 0, dy: 0, rot: 0, sc: 1, a: 1, hit: 0 };
const G = 0.9, B1 = 0.4, B2 = 0.58, B3 = 0.68;   // floor depth (x size) and the end of each bounce (u)
export function crownMotion(u, size, side) {
  const o = COUT, k = u < 0 ? 0 : u > 1 ? 1 : u;
  let y;
  o.hit = 0;
  if (k < B1) y = -7 * k + 23.1 * k * k;
  else if (k < B2) { const f = (k - B1) / (B2 - B1); y = G - 0.28 * 4 * f * (1 - f); }
  else if (k < B3) { const f = (k - B2) / (B3 - B2); y = G - 0.09 * 4 * f * (1 - f); }
  else y = G;
  const roll = 1 - Math.pow(1 - k, 1.7);   // fast at first, slowing to a stop
  o.dx = side * size * 4.6 * roll;
  o.dy = y * size * 1.15;
  o.rot = side * (roll * 11 * 2.1 + (k > B3 ? Math.sin((k - B3) * 38) * 0.35 * (1 - k) * (1 - k) * 4 : 0));
  o.sc = 1 - Math.max(0, k - 0.9) * 2;
  o.a = k < 0.8 ? 1 : Math.max(0, 1 - (k - 0.8) / 0.2);
  // flag the frame of each landing so the renderer can flash a sparkle
  o.hit = (Math.abs(k - B1) < 0.03 || Math.abs(k - B2) < 0.03) ? 1 : 0;
  return o;
}
