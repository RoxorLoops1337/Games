// Hit juice round 10: per-weapon crit and finish feel (a tiny slow-mo plus a zoom punch), separate budgets per mark class so a
// chain burst cannot starve the kill pops, sparks in the colour of the snake that was hit, and a screen-wide cascade when a
// whole chain is cleared. Render-only helpers, no allocations per call, never touches the sim.
import { SPECIES } from './art_draw.js';

// zoom amplitude, sim speed at the deepest point, slow-mo length in seconds: light weapons tick, heavy ones thud
export const CRIT_FEEL = {
  capsule: [0.018, 0.72, 0.1], swab: [0.02, 0.75, 0.1], daggers: [0.014, 0.6, 0.08], tower: [0.036, 0.5, 0.15], dragon: [0.024, 0.7, 0.12],
  needles: [0.012, 0.8, 0.07], stick: [0.02, 0.65, 0.1], bubble: [0.02, 0.8, 0.12], satellite: [0.03, 0.6, 0.12], maw: [0.042, 0.5, 0.17],
  puppy: [0.03, 0.65, 0.12], bell: [0.03, 0.6, 0.14], encore: [0.036, 0.6, 0.14],
};
// the finishing blow: stronger, and longer than a crit
export const FINISH_FEEL = {
  capsule: [0.06, 0.4, 0.34], swab: [0.062, 0.38, 0.36], daggers: [0.056, 0.3, 0.3], tower: [0.095, 0.24, 0.5], dragon: [0.07, 0.36, 0.4],
  needles: [0.05, 0.42, 0.3], stick: [0.065, 0.34, 0.36], bubble: [0.06, 0.44, 0.4], satellite: [0.075, 0.3, 0.4], maw: [0.105, 0.22, 0.55],
  puppy: [0.075, 0.34, 0.42], bell: [0.08, 0.3, 0.46], encore: [0.09, 0.28, 0.5],
};
export const CRIT_GAP = 0.7;   // seconds between two crit punches so a crit storm does not turn into constant slow motion

// mark budgets per class (before the low quality halving); the total stays under 44 so nothing here can exceed the old hard cap
export const CLASS_CAP = { hit: 12, pop: 12, chain: 8, chip: 12, fx: 8 };
const FIXED = { chip: 'chip', shock: 'chain', link: 'chain', note: 'chain', finish: 'chain', sdeath: 'chain', sigh: 'chain', muz: 'fx', beam: 'fx', cascade: 'chain' };
export const classOf = (k, cur) => FIXED[k] || cur || 'fx';

// the sparks a hit throws in the colour of the snake that owns the cell (the lite and base colours of its species)
export const SKIN_SPARK = Object.keys(SPECIES).reduce((o, k) => { o[k] = [SPECIES[k].lite, SPECIES[k].base]; return o; }, {});
export const sparkCol = (skin, i) => { const s = SKIN_SPARK[skin]; return s ? s[i & 1] : '#ffd23a'; };

function star4(c, r) { c.beginPath(); c.moveTo(0, -r); c.quadraticCurveTo(r * 0.14, -r * 0.14, r, 0); c.quadraticCurveTo(r * 0.14, r * 0.14, 0, r); c.quadraticCurveTo(-r * 0.14, r * 0.14, -r, 0); c.quadraticCurveTo(-r * 0.14, -r * 0.14, 0, -r); c.closePath(); }

// The full chain clear: a bright band sweeps down the whole screen and every row it passes throws a ripple of stars, so the
// clear reads as one big wave. Drawn in world space (x 0..W, y 0..H). k 0..1 age.
export const CASCADE_DUR = 1.5, CASCADE_ROWS = 9;
const ROW_COL = ['#ffffff', '#ffd84d', '#9dff6d', '#6fe3ff', '#ff9ad6'];
export function drawCascade(c, W, H, k, col, seed) {
  const front = Math.min(1, k / 0.55) * (H + 120) - 60, fade = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
  c.save(); c.globalCompositeOperation = 'lighter';
  c.globalAlpha = 0.5 * fade; c.fillStyle = col; c.fillRect(0, front - 9, W, 18);
  c.globalAlpha = 0.9 * fade; c.fillStyle = '#fff'; c.fillRect(0, front - 3, W, 6);
  c.restore();
  for (let r = 0; r < CASCADE_ROWS; r++) {
    const y0 = (r + 0.5) / CASCADE_ROWS * H, d = front - y0;
    if (d < 0) continue;
    const age = d / (H * 0.5), a = Math.max(0, 1 - age) * fade; if (a <= 0.02) continue;
    const dir = r & 1 ? 1 : -1;
    for (let i = 0; i < 6; i++) {
      const x = ((i + 0.5 + ((seed * 7 + r * 3 + i * 5) % 10) / 40) / 6 * W + dir * age * 40 + W) % W, y = y0 + age * 90 + Math.sin(i * 2.1 + r) * 8;
      c.save(); c.translate(x, y); c.rotate(age * 3 * dir + i); c.globalAlpha = a;
      c.fillStyle = ROW_COL[(r + i) % 5]; star4(c, 15 * (0.6 + 0.4 * a)); c.fill();
      c.fillStyle = '#fff'; star4(c, 6 * a); c.fill();
      c.restore();
    }
  }
}
