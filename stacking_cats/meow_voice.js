// Pure helpers for the recorded meows (clips and pitches come from meow_bank.js, which is generated from the real recordings).
// Picks which clip a cat uses for a given mood, how far it is pitched, and which clip sings a given note of a song.
import { MEOW_CLIPS } from './meow_bank.js';

const hashStr = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const withTag = (tag) => MEOW_CLIPS.filter((c) => c.tags.includes(tag));
const melodic = withTag('tone');   // everything with a steady pitch can sing a melody note, the sung ones too
const tonal = melodic.filter((c) => !c.tags.includes('sing'));   // the everyday meow of a cat (the sung ones are kept for the worried mood)
const shortTonal = withTag('short').filter((c) => c.tags.includes('tone'));
const POOLS = { pick: tonal, happy: shortTonal, cheer: shortTonal, sad: withTag('long'), worried: withTag('sing') };

// how each mood plays: pitch factor on top of the cat's own pitch, loudness, and a pitch wobble (in cents, 0 = none)
export const MEOW_MOODS = {
  pick:    { rate: 1,    gain: 0.55, wobble: 0 },
  happy:   { rate: 1.14, gain: 0.5,  wobble: 0 },
  cheer:   { rate: 1.34, gain: 0.46, wobble: 0 },
  sad:     { rate: 0.74, gain: 0.5,  wobble: 0 },
  worried: { rate: 0.94, gain: 0.5,  wobble: 38 },
};

// every cat has its own pitch, from a little under a fifth below to a little over a fifth above the recording (0.73x to 1.37x)
export function catPitch(id) {
  const h = hashStr(String(id));
  return Math.pow(2, ((h % 1000) / 1000 - 0.5) * 0.9);
}

// which clip and playback rate a cat's meow uses. `salt` (0 to 1) only adds a tiny random wobble to the pitch so a repeated tap is never identical.
export function meowPlan(id, kind = 'pick', salt = 0.5) {
  const mood = MEOW_MOODS[kind] || MEOW_MOODS.pick;
  const pool = POOLS[kind] && POOLS[kind].length ? POOLS[kind] : tonal;
  const h = hashStr(String(id));
  const clip = pool[(h >>> 10) % pool.length];
  const rate = catPitch(id) * mood.rate * (1 + (salt - 0.5) * 0.05);
  return { clip, rate: Math.max(0.5, Math.min(2.2, rate)), gain: mood.gain, wobble: mood.wobble };
}

// the recorded clip that sings `freq` with the least pitch shifting, and the playback rate that gets it there.
// Returns null when no steady clip is within about an octave.
export function clipForNote(freq, avoid) {
  if (!(freq > 0)) return null;
  let best = null, bestErr = Infinity;
  for (const c of melodic) {
    if (c.id === avoid) continue;
    const err = Math.abs(Math.log2(freq / c.f0));
    if (err < bestErr) { bestErr = err; best = c; }
  }
  if (!best) return null;
  const rate = freq / best.f0;
  return rate >= 0.5 && rate <= 2.2 ? { clip: best, rate } : null;
}

// the drum kit made of meows: which clip, where in it, how it is pitched and filtered. `from` is a share of the clip length.
const lowest = tonal.reduce((a, b) => (b.f0 < a.f0 ? b : a));
const noisy = withTag('noisy')[0] || tonal[0];
export const MEW_KIT = {
  kick:  { clip: lowest, from: 0.04, dur: 0.17, rate: 0.52, rateTo: 0.27, gain: 3.2, lp: 900,  hp: 0,    thump: 0.9 },   // thump: a synth sine thump under the meow keeps the low end of a kick
  snare: { clip: noisy,  from: 0.2,  dur: 0.09, rate: 1.5,  rateTo: 1.5,  gain: 3.6, lp: 0,    hp: 1400, thump: 0 },
  hat:   { clip: noisy,  from: 0.3,  dur: 0.04, rate: 3,    rateTo: 3,    gain: 2.6, lp: 0,    hp: 5500, thump: 0 },
};
