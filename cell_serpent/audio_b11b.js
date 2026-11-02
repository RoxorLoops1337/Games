// Audio round 11: sticker book completion sting, pet glance and kitten pounce, tab badge ping, stage curtain swish,
// a counter line that changes per world section, and a slow breath for the ambient bed. Pure helpers plus one register().
import { SKINS } from './sim.js';

// Pet glance: fires once when a pet starts to look at a head (hysteresis, so a wobbling lean never ticks twice).
export function glanceEdge(st, gl) {
  const a = Math.abs(gl);
  if (!st.gOn && a > 0.09) { st.gOn = true; return true; }
  if (st.gOn && a < 0.04) st.gOn = false;
  return false;
}
// Ambient breath: a slow LFO rate (Hz) and depth (share of the bed level) per world, every bed breathes at its own pace.
export const breathOf = skin => { const i = Math.max(0, SKINS.indexOf(skin)); return { hz: 0.06 + (i % 5) * 0.025, depth: 0.32 }; };
// Section twist: from the second section on, a quiet counter line answers on the off beats. sec 0 stays plain.
// Each world gets its own interval pattern, so the same song never loops identically.
const TWIST_OFF = [[2, 4, 3, 5], [4, 2, 5, 3], [1, 3, 4, 2], [3, 5, 2, 4], [2, 5, 4, 1], [5, 3, 1, 4]];
const TWIST_WAVE = ['triangle', 'sine', 'square', 'triangle', 'sine', 'sawtooth'];
export function twistOf(skin, sec, bar, s) {
  if (sec < 1 || s % 4 !== 3 || (s === 15 && bar === 3)) return null;
  const i = Math.max(0, SKINS.indexOf(skin)), k = (sec + i) % TWIST_OFF.length;
  if ((sec & 1) === 0 && (bar & 1) === 0) return null;   // even sections only answer in odd bars: breathing room
  return { off: TWIST_OFF[k][(bar + (s >> 2)) % 4], w: TWIST_WAVE[k], v: 0.016 + Math.min(3, sec) * 0.003 };
}

export function registerA11(sfx, tone, noise, duck, gate) {
  // BOOK COMPLETE: the page flip, a rising major arpeggio over two octaves, then a held sparkle chord
  sfx.bookdone = () => {
    if (!gate('bookdone', 800)) return;
    noise(0.25, 0.03, 1500, 5200, 'bandpass');
    [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => { tone(f, 0.2, 'triangle', 0.05, 0, 0.1 + i * 0.075); tone(f * 2, 0.12, 'sine', 0.012, 0, 0.11 + i * 0.075); });
    [1047, 1319, 1568].forEach(f => tone(f, 0.9, 'sine', 0.035, 0, 0.62));
    tone(3136, 0.5, 'sine', 0.012, 0, 0.7); duck(0.3, 0.9);
  };
  // pet glance: a tiny rising chirp, quiet enough to never nag
  sfx.petglance = () => { if (!gate('petglance', 700)) return; tone(1500, 0.05, 'sine', 0.014, 500); };
  // kitten pounce: a soft whoosh up, a pad of paws on the landing
  sfx.pounce = () => {
    if (!gate('pounce', 300)) return;
    noise(0.14, 0.022, 500, 2600, 'bandpass'); tone(420, 0.1, 'sine', 0.03, 360);
    tone(140, 0.07, 'sine', 0.05, -40, 0.32); noise(0.04, 0.012, 700, 300, 'lowpass', 0.32);
  };
  // a tab badge gained a number: two little bubbles
  sfx.tabping = () => { if (!gate('tabping', 250)) return; tone(1175, 0.06, 'sine', 0.03, 120); tone(1568, 0.08, 'sine', 0.025, 0, 0.06); };
  // the stage curtain opens: a cloth swish with a low sweep underneath
  sfx.curtain = () => { if (!gate('curtain', 500)) return; noise(0.5, 0.035, 500, 3000, 'bandpass'); tone(180, 0.45, 'sine', 0.035, 120); };
}
