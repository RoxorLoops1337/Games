// Hit juice round 8: sounds for the finishing blow (per weapon), the pitch-ladder rungs and the head death (per species),
// the per-species head death animation, muzzle flashes per weapon and the best-moment tracker for the result screen.
// Pure data and small draw helpers: render-only, never touches the sim. The audio side is registered from audio.js.
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- sound recipes
// [freq, dur, type, vol, slide, delay] is a tone; ['n', dur, vol, f0, f1, filter, delay] is a noise burst.
export const FIN_REC = {
  capsule: [[392, 0.16, 'triangle', 0.07, 0, 0], [587, 0.16, 'triangle', 0.06, 0, 0.07], [784, 0.3, 'sine', 0.06, 0, 0.14]],
  swab: [[220, 0.22, 'sine', 0.1, -60, 0], [330, 0.2, 'sine', 0.06, 0, 0.05], [440, 0.3, 'sine', 0.05, 0, 0.1], ['n', 0.18, 0.06, 900, 200, 'lowpass', 0]],
  daggers: [['n', 0.12, 0.08, 9000, 3000, 'highpass', 0], [2400, 0.1, 'sine', 0.05, -1400, 0.01], [3200, 0.24, 'sine', 0.035, 0, 0.06]],
  tower: [[98, 0.7, 'sine', 0.2, -20, 0], [196, 0.6, 'triangle', 0.07, 0, 0.01], [392, 0.5, 'sine', 0.04, 0, 0.02]],
  stick: [[90, 0.12, 'sine', 0.18, -40, 0], [180, 0.08, 'square', 0.05, -60, 0.04], ['n', 0.12, 0.08, 2400, 400, 'bandpass', 0.02], [660, 0.2, 'triangle', 0.05, 200, 0.1]],
  needles: [[1568, 0.05, 'square', 0.04, 0, 0], [1976, 0.05, 'square', 0.04, 0, 0.05], [2349, 0.05, 'square', 0.04, 0, 0.1], [2637, 0.22, 'sine', 0.05, 0, 0.15]],
  satellite: [[880, 0.5, 'sine', 0.06, 0, 0], [1318, 0.45, 'sine', 0.04, 0, 0.02], [1760, 0.4, 'sine', 0.03, 0, 0.04], [2217, 0.35, 'sine', 0.02, 0, 0.06]],
  maw: [['n', 0.3, 0.14, 300, 1800, 'bandpass', 0], [70, 0.4, 'sawtooth', 0.1, 90, 0.05], [140, 0.25, 'square', 0.05, -80, 0.2]],
  puppy: [[700, 0.07, 'square', 0.05, 500, 0], [960, 0.09, 'square', 0.05, -300, 0.08], [1200, 0.18, 'triangle', 0.04, 200, 0.18]],
  encore: [[523, 0.12, 'sawtooth', 0.05, 0, 0], [659, 0.12, 'sawtooth', 0.05, 0, 0.08], [784, 0.12, 'sawtooth', 0.05, 0, 0.16], [1047, 0.4, 'sawtooth', 0.06, 0, 0.24], [1568, 0.4, 'sine', 0.04, 0, 0.24]],
};
export const finRec = src => FIN_REC[src] || FIN_REC.capsule;

// One short tail per species when its head falls (the existing head thump stays underneath).
export const DEATH_REC = {
  love: [[784, 0.3, 'sine', 0.06, 300, 0.04], [988, 0.3, 'sine', 0.05, 300, 0.12], [1319, 0.4, 'sine', 0.04, 0, 0.2]],
  rust: [['n', 0.2, 0.08, 3000, 900, 'bandpass', 0.02], [160, 0.12, 'square', 0.05, -80, 0.05], [90, 0.2, 'square', 0.05, -30, 0.18]],
  sneezy: [['n', 0.12, 0.1, 5000, 1500, 'highpass', 0], ['n', 0.3, 0.07, 1500, 400, 'bandpass', 0.1], [880, 0.1, 'sine', 0.04, -300, 0.05]],
  grumpy: [[110, 0.3, 'sawtooth', 0.08, -50, 0.03], [95, 0.35, 'sawtooth', 0.06, -45, 0.12], ['n', 0.25, 0.06, 500, 120, 'lowpass', 0.05]],
  sleepy: [[494, 0.5, 'sine', 0.05, -150, 0.02], [392, 0.6, 'sine', 0.04, -120, 0.2], [330, 0.7, 'sine', 0.03, -100, 0.4]],
  disco: [[1319, 0.07, 'square', 0.03, 0, 0.02], [1760, 0.07, 'square', 0.03, 0, 0.08], [2093, 0.07, 'square', 0.03, 0, 0.14], [2637, 0.25, 'triangle', 0.03, 0, 0.2]],
  sour: [[900, 0.18, 'sawtooth', 0.04, -600, 0.02], [500, 0.2, 'sine', 0.06, -250, 0.12], ['n', 0.1, 0.05, 6000, 2000, 'highpass', 0]],
  mighty: [[60, 0.45, 'sine', 0.2, -20, 0], ['n', 0.35, 0.12, 1200, 100, 'lowpass', 0], [200, 0.1, 'square', 0.05, -100, 0.08]],
  frosty: [[2637, 0.3, 'sine', 0.03, -400, 0.02], [3136, 0.28, 'sine', 0.025, -300, 0.07], [3951, 0.25, 'sine', 0.02, 0, 0.12], ['n', 0.2, 0.05, 9000, 5000, 'highpass', 0.02]],
  gloomy: [[247, 0.6, 'triangle', 0.06, -90, 0.02], [196, 0.7, 'triangle', 0.05, -80, 0.25], ['n', 0.5, 0.04, 2500, 500, 'bandpass', 0.1]],
  piggy: [[1319, 0.06, 'square', 0.05, 0, 0.02], [1976, 0.12, 'triangle', 0.07, 0, 0.07], [1319, 0.06, 'square', 0.05, 0, 0.14], [1976, 0.2, 'triangle', 0.07, 0, 0.19]],
};
export const deathRec = skin => DEATH_REC[skin] || DEATH_REC.love;

// Ladder rung n (1..8): a soft glass chime on the major scale, one step above the climbing kill pop; the top rung rings an octave.
const MAJ = [0, 2, 4, 5, 7, 9, 11, 12];
export const rungHz = n => 440 * Math.pow(2, (76 + MAJ[Math.max(0, Math.min(7, n - 1))] - 69) / 12);
export const rungOf = chain => ((Math.max(2, chain) - 1) % 8) + 1;

export const FIN_IDS = Object.keys(FIN_REC), DEATH_IDS = Object.keys(DEATH_REC);

// Registers the sounds on an sfx table (audio.js): fin_<weapon>, death_<species>, rung1..rung8.
export function registerHj8(sfx, tone, noise, duck, gate) {
  const play = (rec, k = 1) => { for (const r of rec) { if (r[0] === 'n') noise(r[1], r[2] * k, r[3], r[4], r[5], r[6]); else tone(r[0], r[1], r[2], r[3] * k, r[4], r[5]); } };
  for (const id of FIN_IDS) sfx['fin_' + id] = () => { if (!gate('fin', 200)) return; play(FIN_REC[id]); duck(0.3, 0.4); };
  for (const id of DEATH_IDS) sfx['death_' + id] = () => { if (!gate('death', 200)) return; play(DEATH_REC[id]); };
  for (let n = 1; n <= 8; n++) sfx['rung' + n] = () => {
    if (!gate('rung', 40)) return;
    const f = rungHz(n); tone(f, 0.22, 'sine', 0.03 + n * 0.002, 0); tone(f * 2, 0.12, 'sine', 0.012, 0, 0.01);
    if (n === 8) { tone(f * 1.5, 0.5, 'sine', 0.03, 0, 0.04); noise(0.3, 0.03, 9000, 4000, 'highpass', 0.02); }
  };
}

// ---------------------------------------------------------------- best moment of the run
export function createMoments() {
  const m = { chain: 0, crit: 0, finish: '', finishAt: 0, heads: 0 };
  return {
    m,
    reset() { m.chain = 0; m.crit = 0; m.finish = ''; m.finishAt = 0; m.heads = 0; },
    chain(n) { if (n > m.chain) m.chain = n; },
    crit(tier) { if (tier > m.crit) m.crit = tier; },
    finished(src, t) { m.finish = src || 'capsule'; m.finishAt = t; m.heads++; },
  };
}
const NAMES = { capsule: 'note', swab: 'swab', daggers: 'dagger', tower: 'tower', stick: 'stick', needles: 'needle', satellite: 'orbit', maw: 'maw', puppy: 'puppy', encore: 'encore' };
// The line for the result chip: the biggest thing that happened this run, or '' when nothing stood out.
export function momentLine(m) {
  if (!m) return '';
  if (m.chain >= 6) return m.chain + '-cell chain' + (m.finish ? ', finished by ' + (NAMES[m.finish] || 'note') : '');
  if (m.crit >= 2) return 'Crit streak x' + (m.crit + 1);
  if (m.finish) return 'Finishing ' + (NAMES[m.finish] || 'note');
  return '';
}

// ---------------------------------------------------------------- head death per species (drawn in a mark, origin at the head)
const heart = (c, s) => { c.beginPath(); c.moveTo(0, s * 0.9); c.bezierCurveTo(-s * 1.5, -s * 0.1, -s * 0.6, -s * 1.1, 0, -s * 0.35); c.bezierCurveTo(s * 0.6, -s * 1.1, s * 1.5, -s * 0.1, 0, s * 0.9); c.fill(); };
const star4 = (c, s) => { c.beginPath(); c.moveTo(0, -s); c.lineTo(s * 0.25, -s * 0.25); c.lineTo(s, 0); c.lineTo(s * 0.25, s * 0.25); c.lineTo(0, s); c.lineTo(-s * 0.25, s * 0.25); c.lineTo(-s, 0); c.lineTo(-s * 0.25, -s * 0.25); c.closePath(); c.fill(); };
const hexNut = (c, s) => { c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; c.lineTo(Math.cos(a) * s, Math.sin(a) * s); } c.closePath(); c.moveTo(s * 0.38, 0); c.arc(0, 0, s * 0.38, 0, TAU); c.fill('evenodd'); };
const blob = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
export const DEATH_DUR = 1.05;

// k 0..1 (age), a = 1 - k, sd = a seed, text(str, x, y, size, fill, stroke): the renderer's outlined text. Only primitives, no allocations.
export function drawSpeciesDeath(c, skin, k, sd, text) {
  const a = 1 - k, e = 1 - a * a;
  switch (skin) {
    case 'rust':   // bolts and nuts fly out and fall
      for (let i = 0; i < 7; i++) { const an = i / 7 * TAU + sd, v = 150 + (i % 3) * 50, x = Math.cos(an) * v * k, y = Math.sin(an) * v * k - 110 * k + 320 * k * k;
        c.save(); c.translate(x, y); c.rotate(k * (6 + i) * (i & 1 ? 1 : -1)); c.fillStyle = i % 3 === 0 ? '#c98a4a' : '#8a95a8'; c.globalAlpha = Math.min(1, a * 2);
        if (i & 1) hexNut(c, 11); else c.fillRect(-9, -3, 18, 6); c.restore(); }
      break;
    case 'sneezy':   // a green sneeze cloud and fluttering tissues
      for (let i = 0; i < 5; i++) { c.globalAlpha = a * 0.55; c.fillStyle = i & 1 ? '#c4f5dc' : '#6fe0a8'; blob(c, (i - 2) * 26 * (0.4 + e), -e * 40 - (i & 1) * 10, 18 + e * 22); }
      for (let i = 0; i < 4; i++) { c.save(); c.globalAlpha = Math.min(1, a * 2); c.translate((i - 1.5) * 44 * e + Math.sin(k * 9 + i) * 10, -30 + k * 110 + i * 6); c.rotate(Math.sin(k * 8 + i * 2) * 0.8); c.fillStyle = '#fff'; c.fillRect(-9, -9, 18, 18); c.fillStyle = '#c4f5dc'; c.fillRect(-9, -2, 18, 4); c.restore(); }
      break;
    case 'grumpy':   // a storm cloud rolls up and flashes
      c.globalAlpha = Math.min(1, a * 1.6); c.fillStyle = '#4a5878'; blob(c, -22, -44 - 20 * e, 24); blob(c, 6, -52 - 20 * e, 30); blob(c, 34, -42 - 20 * e, 22);
      c.strokeStyle = '#ffd84d'; c.lineWidth = 5; c.lineJoin = 'round'; if (((k * 14) | 0) % 2 === 0) { c.beginPath(); c.moveTo(0, -30 - 20 * e); c.lineTo(-10, -4); c.lineTo(6, -4); c.lineTo(-6, 34); c.stroke(); }
      break;
    case 'sleepy':   // three Zs drift up
      for (let i = 0; i < 3; i++) { const u = k * 1.2 - i * 0.2; if (u <= 0) continue; c.globalAlpha = Math.max(0, 1 - u) * 0.95; text('Z', 14 * i + Math.sin(u * 6 + i) * 10, -u * 90 - 8, 22 + i * 8, '#dccfff', '#3a2a8a'); }
      break;
    case 'disco':   // mirror glints and a rainbow ring
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 9; i++) { const an = i / 9 * TAU + sd, d = 30 + e * (60 + (i % 3) * 18); c.save(); c.translate(Math.cos(an) * d, Math.sin(an) * d * 0.8); c.rotate(k * 3 + i); c.globalAlpha = a; c.fillStyle = ['#ff7eb6', '#9ff0ff', '#ffe14a', '#fff'][i & 3]; star4(c, 10 + (i % 2) * 5); c.restore(); }
      c.globalAlpha = a * 0.7; c.lineWidth = 6; c.strokeStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 20 + e * 90, 0, TAU); c.stroke();
      break;
    case 'sour':   // lemon-green droplets squirt in arcs
      for (let i = 0; i < 9; i++) { const an = -Math.PI / 2 + (i - 4) * 0.36, v = 190 + (i % 3) * 40, x = Math.cos(an) * v * k, y = Math.sin(an) * v * k + 380 * k * k; c.globalAlpha = Math.min(1, a * 2); c.fillStyle = i & 1 ? '#b7f0a8' : '#8fe05a'; c.beginPath(); c.ellipse(x, y, 6, 9, Math.atan2(Math.sin(an) * v + 760 * k, Math.cos(an) * v) + 1.57, 0, TAU); c.fill(); }
      break;
    case 'mighty':   // a heavy shockwave, flying pebbles and dizzy stars
      c.strokeStyle = '#d3def2'; c.globalAlpha = a; c.lineWidth = 10 * a + 2; c.beginPath(); c.arc(0, 0, 24 + e * 130, 0, TAU); c.stroke();
      for (let i = 0; i < 6; i++) { const an = i / 6 * TAU + sd, v = 130 + (i & 1) * 50; c.globalAlpha = Math.min(1, a * 2); c.fillStyle = '#8fa3c7'; blob(c, Math.cos(an) * v * k, Math.sin(an) * v * k + 260 * k * k - 40 * k, 8 - 2 * (i & 1)); }
      for (let i = 0; i < 3; i++) { const an = k * 6 + i * 2.1; c.save(); c.translate(Math.cos(an) * 34, -46 + Math.sin(an) * 10); c.globalAlpha = a; c.fillStyle = '#ffe14a'; star4(c, 9); c.restore(); }
      break;
    case 'frosty':   // ice shards fan out
      c.fillStyle = '#e8f8ff'; for (let i = 0; i < 9; i++) { const an = i / 9 * TAU + sd, d = 20 + e * (70 + (i % 3) * 20); c.save(); c.translate(Math.cos(an) * d, Math.sin(an) * d + 40 * k * k); c.rotate(an + 1.57); c.globalAlpha = Math.min(1, a * 2); c.beginPath(); c.moveTo(0, -13); c.lineTo(4, 0); c.lineTo(0, 13); c.lineTo(-4, 0); c.closePath(); c.fill(); c.restore(); }
      c.globalAlpha = a * 0.6; c.strokeStyle = '#bfe9ff'; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 14 + e * 100, 0, TAU); c.stroke();
      break;
    case 'gloomy':   // a tiny grey cloud rains and a pale wisp rises
      c.globalAlpha = Math.min(1, a * 1.8); c.fillStyle = '#7a7494'; blob(c, -14, -60, 16); blob(c, 8, -66, 20); blob(c, 28, -58, 14);
      c.strokeStyle = '#9fd0ff'; c.lineWidth = 3; c.lineCap = 'round'; for (let i = 0; i < 6; i++) { const y = -48 + ((k * 260 + i * 37) % 110); c.globalAlpha = a; c.beginPath(); c.moveTo(-12 + i * 9, y); c.lineTo(-14 + i * 9, y + 12); c.stroke(); }
      c.globalAlpha = a * 0.35; c.fillStyle = '#e8dcff'; c.beginPath(); c.ellipse(0, -k * 80, 16, 22, 0, 0, TAU); c.fill();
      break;
    case 'piggy':   // coins rain out
      for (let i = 0; i < 8; i++) { const an = -Math.PI / 2 + (i - 3.5) * 0.4, v = 220 + (i % 3) * 40, x = Math.cos(an) * v * k, y = Math.sin(an) * v * k + 520 * k * k; c.globalAlpha = Math.min(1, a * 2); c.fillStyle = '#ffd84d'; c.strokeStyle = '#8a5a00'; c.lineWidth = 2; c.beginPath(); c.ellipse(x, y, 8 * (0.4 + 0.6 * Math.abs(Math.cos(k * 18 + i))), 8, 0, 0, TAU); c.fill(); c.stroke(); }
      break;
    default:   // love: hearts spiral up
      for (let i = 0; i < 7; i++) { const u = k * 1.15 - i * 0.07; if (u <= 0 || u >= 1) continue; c.save(); c.translate(Math.sin(u * 7 + i * 1.7 + sd) * (26 + i * 5), -u * (80 + i * 10)); c.globalAlpha = Math.min(1, (1 - u) * 2); c.fillStyle = i & 1 ? '#ff7eb6' : '#ffc2dc'; heart(c, 9 + (i % 3) * 3); c.restore(); }
  }
}

// ---------------------------------------------------------------- muzzle flashes (drawn in a mark at the duo)
// kind: needles, dragon, bubble, swab. k 0..1.
export function drawMuzzle(c, kind, k, sd) {
  const a = 1 - k, e = 1 - a * a;
  switch (kind) {
    case 'needles':   // a fan of thin white streaks
      c.strokeStyle = '#f2fcff'; c.lineCap = 'round'; for (let i = -3; i <= 3; i++) { const an = -Math.PI / 2 + i * 0.12, r0 = 14 + e * 20, r1 = r0 + 40 * a + 12; c.globalAlpha = a; c.lineWidth = 3 * a + 1; c.beginPath(); c.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); c.lineTo(Math.cos(an) * r1, Math.sin(an) * r1); c.stroke(); }
      c.globalAlpha = a * 0.7; c.fillStyle = '#a8f0ff'; blob(c, 0, 0, 12 * a + 3);
      break;
    case 'dragon':   // a green puff with an ember core
      c.fillStyle = '#9dff6d'; for (let i = 0; i < 4; i++) { c.globalAlpha = a * 0.7; blob(c, (i - 1.5) * 12 * (0.5 + e), -e * 30 - (i & 1) * 8, 9 + 10 * e); }
      c.globalAlpha = a; c.fillStyle = '#ffe27a'; blob(c, 0, -8 - e * 10, 9 * a + 2);
      break;
    case 'bubble':   // two soap rings pop out with a glint
      c.strokeStyle = '#d6f2ff'; c.lineWidth = 3; for (let i = 0; i < 3; i++) { c.globalAlpha = a * 0.9; c.beginPath(); c.arc((i - 1) * 16, -e * (26 + i * 8), 5 + i * 3 + e * 4, 0, TAU); c.stroke(); }
      c.globalAlpha = a; c.fillStyle = '#fff'; blob(c, -4, -e * 26 - 3, 2.4);
      break;
    case 'swab':   // pink cotton puffs
      for (let i = 0; i < 5; i++) { c.globalAlpha = a * 0.8; c.fillStyle = i & 1 ? '#fff' : '#ffc4e4'; blob(c, (i - 2) * 14 * (0.4 + e), -e * (24 + (i % 2) * 14), 7 + 6 * e); }
      break;
  }
}
