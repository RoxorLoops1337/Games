// 05-screen-feel (round 8): every serpent species announces its stage with its own little sound, and its boss gets its own
// sting on top of the shared boss drone. Pure data so the offline tests can check it without ears.
// A voice is a list of notes [hz, seconds, wave, volume, slide, delay] and optional noise puffs [seconds, volume, f0, f1, filter, delay].
// Normal stages play the riser, then the species voice. Boss stages play the boss drone, then the species sting.
export const STAGE_VOICE = {
  love:   { n: [[523, 0.12, 'sine', 0.08, 0, 0.45], [659, 0.12, 'sine', 0.08, 0, 0.55], [784, 0.3, 'sine', 0.07, 0, 0.65], [1568, 0.25, 'sine', 0.025, 0, 0.7]] },   // warm heart chime
  rust:   { n: [[185, 0.1, 'square', 0.06, -40, 0.45], [147, 0.18, 'square', 0.06, -30, 0.55]], z: [[0.12, 0.05, 2400, 900, 'bandpass', 0.45]] },   // creaky hinge
  sneezy: { n: [[880, 0.06, 'triangle', 0.06, 200, 0.5], [1175, 0.05, 'triangle', 0.05, 0, 0.58], [440, 0.14, 'sine', 0.07, -250, 0.7]], z: [[0.18, 0.08, 3000, 500, 'bandpass', 0.68]] },   // ah, ah, choo
  grumpy: { n: [[98, 0.2, 'sawtooth', 0.09, -20, 0.45], [92, 0.3, 'sawtooth', 0.08, -18, 0.62]] },   // two low grumbles
  sleepy: { n: [[392, 0.5, 'sine', 0.06, -90, 0.45], [330, 0.7, 'sine', 0.05, -80, 0.8]] },   // a slow yawn
  disco:  { n: [[659, 0.07, 'square', 0.05, 0, 0.45], [784, 0.07, 'square', 0.05, 0, 0.53], [988, 0.07, 'square', 0.05, 0, 0.61], [1319, 0.2, 'triangle', 0.07, 0, 0.69]] },   // quick arpeggio up
  sour:   { n: [[740, 0.1, 'triangle', 0.07, -420, 0.45], [622, 0.14, 'square', 0.04, -300, 0.58]] },   // a pucker squeak
  mighty: { n: [[65, 0.4, 'sawtooth', 0.12, -10, 0.45], [98, 0.3, 'square', 0.05, 0, 0.5]], z: [[0.3, 0.1, 500, 70, 'lowpass', 0.45]] },   // heavy thump
  frosty: { n: [[1760, 0.35, 'sine', 0.04, 0, 0.45], [2349, 0.4, 'sine', 0.035, 0, 0.55], [2637, 0.5, 'sine', 0.03, 0, 0.66]], z: [[0.4, 0.03, 7000, 3000, 'highpass', 0.45]] },   // glassy ice bells
  gloomy: { n: [[220, 0.5, 'triangle', 0.07, -35, 0.45], [175, 0.7, 'triangle', 0.07, -30, 0.75]] },   // a minor sigh
  piggy:  { n: [[330, 0.08, 'square', 0.06, -80, 0.45], [294, 0.08, 'square', 0.06, -80, 0.55], [392, 0.14, 'triangle', 0.06, 0, 0.65]] },   // oink oink
};
// boss stings: laid over the shared boss drone, a short signature per species
export const BOSS_VOICE = {
  love:   { n: [[392, 0.7, 'sine', 0.07, 0, 0.35], [494, 0.7, 'sine', 0.06, 0, 0.35], [587, 0.7, 'sine', 0.06, 0, 0.35]] },   // a heavy major swell
  rust:   { n: [[110, 0.5, 'square', 0.06, -30, 0.3]], z: [[0.5, 0.07, 3000, 300, 'bandpass', 0.3]] },
  sneezy: { n: [[1319, 0.08, 'triangle', 0.06, 0, 0.3], [1760, 0.08, 'triangle', 0.06, 0, 0.38], [220, 0.4, 'sine', 0.1, -120, 0.5]], z: [[0.4, 0.1, 3400, 400, 'bandpass', 0.5]] },
  grumpy: { n: [[55, 0.9, 'sawtooth', 0.14, -8, 0.3], [82, 0.8, 'sawtooth', 0.07, 0, 0.35]] },
  sleepy: { n: [[262, 1.0, 'sine', 0.08, -60, 0.3], [196, 1.1, 'sine', 0.07, -40, 0.5]] },
  disco:  { n: [[523, 0.1, 'square', 0.05, 0, 0.3], [659, 0.1, 'square', 0.05, 0, 0.4], [784, 0.1, 'square', 0.05, 0, 0.5], [1047, 0.1, 'square', 0.05, 0, 0.6], [1568, 0.4, 'triangle', 0.06, 0, 0.7]] },
  sour:   { n: [[880, 0.3, 'triangle', 0.07, -600, 0.3], [466, 0.5, 'sawtooth', 0.06, -150, 0.5]] },
  mighty: { n: [[49, 0.9, 'sawtooth', 0.16, -6, 0.3], [73, 0.5, 'square', 0.07, 0, 0.3]], z: [[0.6, 0.14, 400, 50, 'lowpass', 0.3]] },
  frosty: { n: [[2093, 0.6, 'sine', 0.045, 0, 0.3], [2794, 0.6, 'sine', 0.04, 0, 0.42], [3136, 0.8, 'sine', 0.035, 0, 0.54]], z: [[0.8, 0.05, 8000, 2500, 'highpass', 0.3]] },
  gloomy: { n: [[147, 1.0, 'triangle', 0.1, -25, 0.3], [123, 1.1, 'triangle', 0.09, -20, 0.55]] },
};
export const stageVoice = (skin, boss) => (boss ? BOSS_VOICE : STAGE_VOICE)[skin] || null;
