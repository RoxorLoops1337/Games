// Screen moments round 10: best time and best progress per stage (own localStorage keys, the save is untouched),
// the near-miss rule for the clear card, and a short chord sting per species for the milestone ribbons.
// Pure helpers plus one sfx registrar (called from audio.js, tones are midi notes).
const KEY_TIME = 'cell_serpent_best_time_b10', KEY_PROG = 'cell_serpent_best_prog_b10';
const mem = {};
const rd = k => { try { const r = JSON.parse(localStorage.getItem(k)); if (r && typeof r === 'object') return r; } catch (e) { /* private mode */ } return mem[k] || (mem[k] = {}); };
const wr = (k, o) => { mem[k] = o; try { localStorage.setItem(k, JSON.stringify(o)); } catch (e) { /* ignore */ } };
export const stageKey = (stage, hard) => (hard ? 'h' : 's') + (stage | 0);

// Clear time: returns { prev, best } where best is true only when a stored slower time was beaten (the first clear sets the mark quietly).
export function recordTime(stage, hard, secs) {
  const k = stageKey(stage, hard), o = rd(KEY_TIME), prev = +o[k] || 0;
  if (!(secs > 0)) return { prev, best: false };
  if (!prev || secs < prev) { o[k] = secs; wr(KEY_TIME, o); }
  return { prev, best: prev > 0 && secs < prev };
}
export const bestTime = (stage, hard) => +rd(KEY_TIME)[stageKey(stage, hard)] || 0;
// Best progress (percent of the serpent popped) on a stage, for the ghost mark on the game over bar.
export const bestProg = (stage, hard) => +rd(KEY_PROG)[stageKey(stage, hard)] || 0;
export function recordProg(stage, hard, pct) {
  const k = stageKey(stage, hard), o = rd(KEY_PROG), p = Math.max(0, Math.min(100, Math.round(pct)));
  if (p > (+o[k] || 0)) { o[k] = p; wr(KEY_PROG, o); }
}
export const fmtSecs = s => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
// The face got within a hair of the line and the player still won.
export const nearMiss = closePct => closePct >= 90 && closePct < 100;

// Milestone chord per species: midi notes (low to high), wave, gap between notes. The 25 / 50 / 75 ribbons play 2 / 3 / 4 of the notes.
export const MILE_CHORD = {
  love:   { n: [64, 71, 76, 83], w: 'sine', gap: 0.07 },
  rust:   { n: [57, 64, 69, 72], w: 'triangle', gap: 0.08 },
  sneezy: { n: [67, 72, 76, 84], w: 'sine', gap: 0.05 },
  grumpy: { n: [52, 59, 64, 71], w: 'sawtooth', gap: 0.09 },
  sleepy: { n: [62, 69, 74, 81], w: 'sine', gap: 0.11 },
  disco:  { n: [60, 64, 67, 72], w: 'square', gap: 0.05 },
  sour:   { n: [65, 69, 72, 77], w: 'triangle', gap: 0.06 },
  mighty: { n: [48, 55, 60, 67], w: 'triangle', gap: 0.1 },
  frosty: { n: [72, 76, 79, 88], w: 'sine', gap: 0.06 },
  piggy:  { n: [67, 71, 74, 79], w: 'triangle', gap: 0.05 },
  gloomy: { n: [58, 65, 70, 77], w: 'triangle', gap: 0.1 },
};
export const chordOf = (skin, pct) => { const c = MILE_CHORD[skin] || MILE_CHORD.love; return { ...c, n: c.n.slice(0, pct >= 75 ? 4 : pct >= 50 ? 3 : 2) }; };
export const mileSound = (skin, pct) => 'mile_' + (MILE_CHORD[skin] ? skin : 'love') + '_' + pct;

export function registerB10(sfx, tone, noise, gate) {
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  for (const sk of Object.keys(MILE_CHORD)) for (const pct of [25, 50, 75]) {
    sfx[mileSound(sk, pct)] = () => {
      if (!gate('milesting', 400)) return;
      const c = chordOf(sk, pct);
      c.n.forEach((m, i) => tone(hz(m), 0.34 + i * 0.04, c.w, 0.045 - i * 0.004, 0, i * c.gap));
      tone(hz(c.n[0] + 12), 0.5, 'sine', 0.02, 0, c.n.length * c.gap);
    };
  }
  // NEW BEST TIME stamp and the PHEW near-miss gasp
  sfx.besttime = () => { if (!gate('besttime', 500)) return; [79, 84, 88].forEach((m, i) => tone(hz(m), 0.12, 'triangle', 0.05, 0, i * 0.06)); tone(hz(96), 0.35, 'sine', 0.03, 0, 0.2); };
  sfx.phew = () => { if (!gate('phew', 500)) return; noise(0.35, 0.05, 1800, 300, 'lowpass'); tone(hz(60), 0.3, 'sine', 0.06, -60, 0.05); tone(hz(67), 0.4, 'sine', 0.05, 0, 0.18); };
}
