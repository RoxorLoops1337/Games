// Audio round 9: music that grows with the kill combo and the boss phases, a colour per world on top of the groove,
// voice pile-up control (low priority sounds yield when many voices are live) and the hub UI sounds for the claim row,
// the reward ribbon flight and the title tune sticker. Pure tables and helpers (checked offline) plus one registrar
// that adds the new sfx at the end of the table. Midi notes everywhere.

// Combo tier 0..3 from the live kill combo (the sim's own g.combo, already zero when the chain went stale).
export const comboTier = c => (c >= 40 ? 3 : c >= 20 ? 2 : c >= 8 ? 1 : 0);
// What each tier adds to the groove: sh = shimmer arp on 16ths (octave up), oh = open hats on the offbeats, sp = bar line sparkle.
export const COMBO_LAYER = [
  { sh: 0, oh: 0, sp: 0 },
  { sh: 0, oh: 1, sp: 0 },
  { sh: 1, oh: 1, sp: 1 },
  { sh: 2, oh: 1, sp: 2 },
];
export const comboLayer = c => COMBO_LAYER[comboTier(c)];
// Shimmer volume for a step: only on the 16ths that are not on the beat, louder at tier 3, never above a whisper.
export const shimmerVol = (tier, s) => (tier >= 2 && (s & 1) ? (tier >= 3 ? 0.014 : 0.009) : 0);

// Boss phases: phase 1 adds off-grid kicks (already in the groove), phase 2 adds double-time hats and a tom roll.
// Returns the extra drum hits for a boss step as [kind, volume] or null.
export function bossExtra(bp, bar, s) {
  if (bp >= 2 && s % 2 === 1 && !(bar === 3 && s >= 12)) return ['hat', 0.016 + (s % 4 === 3 ? 0.008 : 0)];
  if (bp >= 1 && bar === 3 && (s === 13 || s === 15)) return ['tom', 0.1 + bp * 0.02];
  return null;
}

// Music colour per world: a soft bell voice that rides the groove so every world sounds like itself even on the same
// chord progression. at = steps in the bar, off = scale degree offset above the chord root, w = wave, v = volume.
export const COLOUR = {
  love:   { w: 'sine',     at: [2, 10],     off: 4, oct: 48, v: 0.018 },
  rust:   { w: 'triangle', at: [6, 14],     off: 0, oct: 36, v: 0.02 },
  sneezy: { w: 'sine',     at: [3, 7, 11],  off: 2, oct: 60, v: 0.014 },
  grumpy: { w: 'sawtooth', at: [8],         off: 0, oct: 24, v: 0.016 },
  sleepy: { w: 'sine',     at: [0],         off: 4, oct: 36, v: 0.02 },
  disco:  { w: 'square',   at: [2, 6, 10, 14], off: 2, oct: 48, v: 0.01 },
  sour:   { w: 'triangle', at: [5, 13],     off: 1, oct: 48, v: 0.018 },
  mighty: { w: 'triangle', at: [0, 8],      off: 0, oct: 24, v: 0.022 },
  frosty: { w: 'sine',     at: [4, 9, 12],  off: 4, oct: 60, v: 0.012 },
  gloomy: { w: 'triangle', at: [6],         off: 2, oct: 36, v: 0.02 },
};
export const colourOf = skin => COLOUR[skin] || COLOUR.love;

// Voice control: sounds that may be dropped when the engine is crowded. Higher number = dropped earlier.
export const LOW = { shoot: 3, gem: 2, coin: 2, squeak: 3, spit: 3, cellsq: 2, click: 1, beatshot: 1, kill: 1 };
export const SOFT_CAP = 26, HARD_CAP = 40;   // tone() itself refuses new voices past HARD_CAP
// Should a sound named `name` start with `live` voices ringing? Low priority sounds yield first, big moments always play.
export const admit = (name, live) => {
  const p = LOW[name] || 0;
  if (!p) return live <= HARD_CAP;
  return live < SOFT_CAP - (p - 1) * 5;   // 3 yields at 16, 2 at 21, 1 at 26
};

// Hub UI sounds: [freq, dur, wave, vol, slide, delay] or ['n', dur, vol, f0, f1, filter, delay].
export const UI9 = {
  // claim row: a warm two note "ka-ching" with a soft sweep, quieter than the level up jingle
  claimrow: [[784, 0.1, 'triangle', 0.07, 0, 0], [1175, 0.2, 'sine', 0.07, 0, 0.07], [1568, 0.28, 'sine', 0.04, 0, 0.13], ['n', 0.18, 0.025, 2500, 7000, 'bandpass', 0.05]],
  // ribbon flight takeoff: a tiny rising whoosh
  ribbonfly: [['n', 0.22, 0.04, 800, 4500, 'bandpass', 0], [880, 0.2, 'sine', 0.035, 700, 0]],
  // ribbon landing in the pill: a bright tick
  ribbonland: [[1760, 0.07, 'sine', 0.05, 0, 0], [2349, 0.12, 'sine', 0.035, 0, 0.04]],
  // tune sticker: peel (soft pop) when you tap the sticker to replay, and a glittering get when it is first earned
  tunestick: [[500, 0.05, 'triangle', 0.06, 400, 0], ['n', 0.06, 0.025, 4000, 1200, 'highpass', 0]],
  stickerget: [[659, 0.1, 'triangle', 0.07, 0, 0], [880, 0.1, 'triangle', 0.07, 0, 0.08], [1319, 0.1, 'triangle', 0.07, 0, 0.16], [1760, 0.4, 'sine', 0.06, 0, 0.24], [3520, 0.3, 'sine', 0.02, 0, 0.28]],
};
// Rising pitch for the nth ribbon in a flight (pentatonic, wraps), so a handful of ribbons plays a little run.
export const flyPitch = i => [0, 2, 4, 7, 9][Math.max(0, i | 0) % 5] + 12 * Math.floor(Math.max(0, i | 0) / 5 % 2);

export function registerB9(sfx, tone, noise, gate) {
  const play = rec => { for (const r of rec) { if (r[0] === 'n') noise(r[1], r[2], r[3], r[4], r[5], r[6]); else tone(r[0], r[1], r[2], r[3], r[4], r[5]); } };
  sfx.claimrow = () => gate('claimrow', 80) && play(UI9.claimrow);
  sfx.ribbonfly = e => {
    if (!gate('ribbonfly', 60)) return;
    play(UI9.ribbonfly);
    if (e && e.i) tone(880 * Math.pow(2, flyPitch(e.i) / 12), 0.1, 'sine', 0.03, 0, 0.05);
  };
  sfx.ribbonland = e => { if (!gate('ribbonland', 50)) return; const m = Math.pow(2, flyPitch(e && e.i) / 12); tone(1760 * m, 0.07, 'sine', 0.05); tone(2349 * m, 0.12, 'sine', 0.035, 0, 0.04); };
  sfx.tunestick = () => gate('tunestick', 120) && play(UI9.tunestick);
  sfx.stickerget = () => gate('stickerget', 400) && play(UI9.stickerget);
}
