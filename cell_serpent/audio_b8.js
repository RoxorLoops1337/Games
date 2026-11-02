// Audio round 8 tables (pure data and tiny helpers so the offline tests can check them without ears): the stage card
// sting per species, the head death voice per species, the finishing blow per weapon, the face panic squeal and the hub bed per world.
// Midi notes everywhere; the sfx in audio.js turn them into tones.

// Stage card sting: notes that land with the card slam. w = waveform, n = midi notes, gap = seconds between notes,
// dur = note length, v = volume, tail = optional noise colour (a breath of ice).
export const CARD = {
  love:   { w: 'sine',     n: [72, 76, 79],     gap: 0.07, dur: 0.22, v: 0.07 },
  rust:   { w: 'triangle', n: [57, 60, 64],     gap: 0.09, dur: 0.24, v: 0.075 },
  sneezy: { w: 'sine',     n: [81, 76, 84],     gap: 0.06, dur: 0.16, v: 0.06 },
  grumpy: { w: 'sawtooth', n: [48, 48, 51],     gap: 0.12, dur: 0.26, v: 0.045 },
  sleepy: { w: 'sine',     n: [67, 71, 74],     gap: 0.13, dur: 0.38, v: 0.07 },
  disco:  { w: 'square',   n: [72, 79, 84, 79], gap: 0.05, dur: 0.1,  v: 0.04 },
  sour:   { w: 'triangle', n: [66, 72, 65],     gap: 0.08, dur: 0.18, v: 0.07 },
  mighty: { w: 'sawtooth', n: [43, 50, 55],     gap: 0.1,  dur: 0.3,  v: 0.05 },
  frosty: { w: 'sine',     n: [88, 91, 95],     gap: 0.09, dur: 0.3,  v: 0.045, tail: 'ice' },
  gloomy: { w: 'triangle', n: [57, 56, 53],     gap: 0.14, dur: 0.34, v: 0.075 },
};
export const cardOf = skin => CARD[skin] || CARD.love;

// Head death voice per species: a sweep from f to f2 Hz over dur seconds, plus a colour name the sfx knows.
export const DEATH = {
  love:   { w: 'sine',     f: 880,  f2: 330,  dur: 0.5,  v: 0.1,  x: 'heart' },
  rust:   { w: 'sawtooth', f: 240,  f2: 70,   dur: 0.5,  v: 0.1,  x: 'clank' },
  sneezy: { w: 'triangle', f: 700,  f2: 1500, dur: 0.3,  v: 0.09, x: 'sneeze' },
  grumpy: { w: 'sawtooth', f: 160,  f2: 55,   dur: 0.6,  v: 0.12, x: 'grumble' },
  sleepy: { w: 'sine',     f: 440,  f2: 180,  dur: 0.8,  v: 0.1,  x: 'yawn' },
  disco:  { w: 'square',   f: 1200, f2: 300,  dur: 0.4,  v: 0.06, x: 'scratch' },
  sour:   { w: 'triangle', f: 600,  f2: 150,  dur: 0.35, v: 0.1,  x: 'pucker' },
  mighty: { w: 'sawtooth', f: 120,  f2: 40,   dur: 0.7,  v: 0.14, x: 'crash' },
  frosty: { w: 'sine',     f: 2200, f2: 900,  dur: 0.5,  v: 0.06, x: 'shatter' },
  gloomy: { w: 'triangle', f: 330,  f2: 110,  dur: 0.9,  v: 0.1,  x: 'sigh' },
};
export const deathOf = skin => DEATH[skin] || DEATH.love;

// Finishing blow: the weapon that landed it adds its own chime (midi notes) on top of the head death.
export const FINISH = {
  capsule:   { c: [84, 88, 91],     w: 'triangle' },
  swab:      { c: [79, 83, 86],     w: 'sine' },
  daggers:   { c: [91, 95, 98],     w: 'square' },
  tower:     { c: [60, 67, 72, 76], w: 'triangle' },
  dragon:    { c: [64, 67, 72],     w: 'sawtooth' },
  needles:   { c: [96, 98, 101],    w: 'sine' },
  stick:     { c: [88, 84, 91],     w: 'square' },
  bubble:    { c: [72, 79, 84],     w: 'sine' },
  satellite: { c: [86, 91, 98],     w: 'sine' },
  maw:       { c: [48, 55, 52],     w: 'sawtooth' },
};
export const finishOf = src => FINISH[src] || FINISH.capsule;

// Ladder rung accent: the kill chain climbs a pentatonic ladder (see chainPitch). Every 5th step is an octave jump and
// gets a sparkle that grows with the octave (0 for steps that are not octave rungs).
export const rungSparkle = c => (c > 0 && c % 5 === 0 ? Math.min(3, c / 5) : 0);

// Face panic squeal: the screaming head's voice per species (midi) and how it rises with danger.
export const PANIC = {
  love: 84, rust: 72, sneezy: 88, grumpy: 66, sleepy: 76, disco: 86, sour: 80, mighty: 62, frosty: 91, gloomy: 70,
};
export const panicHz = (skin, d) => 440 * Math.pow(2, ((PANIC[skin] || PANIC.love) - 69) / 12) * (1 + 0.35 * Math.max(0, Math.min(1, d)));

// Hub bed per world: chord (hz), twinkle ladder (midi), filter, waveform. The bed follows the selected stage's world.
const C = (root, iv) => iv.map(i => 440 * Math.pow(2, (root + i - 69) / 12));
export const BED = {
  love:   { chord: C(48, [0, 7, 11, 16]), tw: [76, 79, 83, 88],  lp: 900,  wave: 'sine' },
  rust:   { chord: C(45, [0, 7, 12, 15]), tw: [69, 72, 76, 81],  lp: 700,  wave: 'triangle' },
  sneezy: { chord: C(50, [0, 7, 9, 14]),  tw: [81, 83, 86, 90],  lp: 1300, wave: 'sine' },
  grumpy: { chord: C(41, [0, 7, 10, 15]), tw: [65, 68, 72, 77],  lp: 520,  wave: 'triangle' },
  sleepy: { chord: C(43, [0, 7, 12, 14]), tw: [74, 79, 81, 86],  lp: 600,  wave: 'sine' },
  disco:  { chord: C(52, [0, 4, 9, 14]),  tw: [79, 81, 84, 88],  lp: 1500, wave: 'triangle' },
  sour:   { chord: C(46, [0, 6, 10, 15]), tw: [70, 73, 76, 82],  lp: 1000, wave: 'triangle' },
  mighty: { chord: C(36, [0, 7, 12, 19]), tw: [60, 67, 72, 79],  lp: 480,  wave: 'triangle' },
  frosty: { chord: C(53, [0, 7, 11, 16]), tw: [88, 91, 95, 100], lp: 1800, wave: 'sine' },
  gloomy: { chord: C(40, [0, 3, 8, 14]),  tw: [67, 70, 75, 79],  lp: 560,  wave: 'sine' },
};
export const bedOf = skin => BED[skin] || BED.love;
