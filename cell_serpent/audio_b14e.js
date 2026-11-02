// Batch 14 (agent e): audio and moments. (1) a real breakdown bar: every 8th section drops the drums, the bass and the
// arp for three bars and keeps only the pad, then the last bar builds and the next section lands with a crash.
// (2) a short win/lose motif per world on the result screen. (3) haptic patterns for unlock, stat buy and level-up.
// Pure helpers (checked offline) plus one registrar and one binder.
import { SKINS } from './sim.js';

// ---- breakdown. Sections are 4 bars; sec 7, 15, 23 ... are breakdowns. Bars 0 to 2 are bare, bar 3 builds (fills still play).
// Never in boss fights, and never while a head is close (danger keeps the drums so the tension is not lost).
export const BREAK_EVERY = 8;
export const isBreakdown = (sec, bar, boss, danger = 0) => !boss && danger < 0.5 && sec > 0 && sec % BREAK_EVERY === BREAK_EVERY - 1 && bar < 3;
// the first beat after a breakdown: a bigger kick and a crash
export const isDrop = (sec, bar, s, boss) => !boss && sec > 0 && sec % BREAK_EVERY === 0 && bar === 0 && s === 0;

// ---- world motifs. Root (MIDI) and wave per skin; the win phrase climbs a pentatonic, the lose phrase sinks in the minor.
const ROOT = { love: 72, rust: 67, sneezy: 74, grumpy: 65, sleepy: 69, disco: 76, sour: 71, mighty: 64, frosty: 79, gloomy: 62 };
const WAVE = { love: 'sine', rust: 'triangle', sneezy: 'triangle', grumpy: 'square', sleepy: 'sine', disco: 'triangle', sour: 'square', mighty: 'sawtooth', frosty: 'sine', gloomy: 'triangle' };
const WIN_DEG = { love: [0, 4, 7, 12], rust: [0, 2, 7, 9], sneezy: [0, 4, 9, 12], grumpy: [0, 7, 4, 12], sleepy: [0, 4, 7, 9], disco: [0, 4, 7, 14], sour: [0, 2, 4, 9], mighty: [0, 7, 12, 16], frosty: [4, 7, 12, 16], gloomy: [0, 3, 7, 12] };
const LOSE_DEG = { love: [7, 3, 0, -5], rust: [5, 3, 0, -2], sneezy: [9, 5, 2, 0], grumpy: [3, 0, -2, -7], sleepy: [7, 5, 3, 0], disco: [7, 4, 2, -1], sour: [3, 2, 0, -3], mighty: [5, 3, 0, -4], frosty: [7, 3, 2, -2], gloomy: [3, 0, -3, -7] };
const hzOf = m => 440 * Math.pow(2, (m - 69) / 12);
// pure: [{ hz, at, dur, vol, wave }] for one world. Four notes, never longer than about 1.4 s in all.
export function worldMotif(skin, won) {
  const k = SKINS.includes(skin) ? skin : 'love', deg = (won ? WIN_DEG : LOSE_DEG)[k], root = ROOT[k] + (won ? 0 : -5);
  return deg.map((d, i) => ({ hz: hzOf(root + d), at: i * (won ? 0.11 : 0.2), dur: won ? (i === 3 ? 0.7 : 0.18) : (i === 3 ? 0.8 : 0.28), vol: won ? 0.055 : 0.045, wave: i === 3 && !won ? 'sine' : WAVE[k] }));
}

// ---- haptics. Same guard as haptics_b12l (Vibration setting and reduce motion) but with its own patterns.
// statbuy grows with the new level: one more pulse every few levels, capped at four.
export const HAP = {
  unlock: [12, 30, 12, 30, 16, 34, 56],
  statmax: [14, 24, 14, 24, 18, 24, 60],
  lvlfan: [14, 22, 16, 22, 22, 26, 70],
  winmotif: [12, 26, 12, 26, 40],
  losemotif: [50, 50, 36],
};
export function hapticPattern(name, e) {
  if (name === 'statbuy') { const n = Math.max(1, (e && e.n) | 0), pulses = Math.min(4, 1 + Math.floor((n - 1) / 3)); const p = []; for (let i = 0; i < pulses; i++) { if (i) p.push(18); p.push(10 + i * 3); } return p; }
  if (name === 'worldmotif') return (e && e.won ? HAP.winmotif : HAP.losemotif).slice();
  return HAP[name] ? HAP[name].slice() : [];
}
export function buzzFor(name, e, settings, nav) {
  try {
    const n = nav || (typeof navigator !== 'undefined' ? navigator : null);
    if (!n || typeof n.vibrate !== 'function' || !settings || !settings.vibrate || settings.reduceMotion) return false;
    const p = hapticPattern(name, e); if (!p.length) return false;
    return n.vibrate(p) !== false;
  } catch (err) { return false; }
}
// wrap audio.play so each of these moments also buzzes (once per call), without touching the call sites
export function bindMomentHaptics(audio, getSettings) {
  if (!audio || audio.__hapB14e) return audio;
  const play = audio.play.bind(audio), names = new Set(['unlockfan', 'statbuy', 'statmax', 'lvlfan', 'worldmotif']);
  audio.play = (name, e) => { const r = play(name, e); if (names.has(name)) buzzFor(name === 'unlockfan' ? 'unlock' : name, e, getSettings()); return r; };
  audio.__hapB14e = true; return audio;
}

export function registerB14e(sfx, tone, noise, duck, gate) {
  // result screen motif, e = { skin, won }
  sfx.worldmotif = e => {
    if (!gate('worldmotif', 1200)) return;
    const won = !!(e && e.won);
    for (const n of worldMotif(e && e.skin, won)) tone(n.hz, n.dur, n.wave, n.vol, 0, 0.02 + n.at);
    if (won) { tone(hzOf((ROOT[e && e.skin] || 72) + 24), 0.5, 'sine', 0.02, 0, 0.5); duck(0.3, 0.6); } else noise(0.5, 0.012, 700, 120, 'lowpass', 0.5);
  };
}
