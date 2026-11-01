// GRAFTWORK audio: 100% procedural WebAudio (no files). Safe to import in node: every export is a no-op without window/AudioContext.
// Chain: voices -> sfxBus / musBus(duck) -> master -> compressor -> destination, plus a generated-impulse reverb send.

const AC = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
const MAX_VOICES = 24, MIN_GAP_MS = 25;

let ctx = null, master, comp, sfxBus, musBus, duckG, verb, noiseBuf;
let muted = false, vols = { master: 0.8, sfx: 0.8, music: 0.35 };
let active = 0, cur = { p: 1, v: 1, pan: 0 };
const lastAt = {};
let drawAt = 0, drawN = 0;

const rnd = Math.random;
const hz = (root, semi) => root * Math.pow(2, semi / 12);

// ---------- engine ----------
export function initAudio() {
  if (!AC) return false;
  try {
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.knee.value = 24; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      duckG = ctx.createGain(); duckG.connect(master);
      musBus = ctx.createGain(); musBus.connect(duckG);
      verb = ctx.createConvolver(); verb.buffer = makeImpulse(1.8, 2.6);
      const vg = ctx.createGain(); vg.gain.value = 0.5; verb.connect(vg); vg.connect(master);
      const n = ctx.sampleRate; noiseBuf = ctx.createBuffer(1, n, n);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < n; i++) d[i] = rnd() * 2 - 1;
      applyVolumes();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  } catch (e) { ctx = null; return false; }
}
function makeImpulse(sec, decay) {
  const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (rnd() * 2 - 1) * Math.pow(1 - i / n, decay); }
  return b;
}
function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  master.gain.setTargetAtTime(muted ? 0 : vols.master, t, 0.03);
  sfxBus.gain.setTargetAtTime(vols.sfx, t, 0.03);
  musBus.gain.setTargetAtTime(vols.music, t, 0.03);
}
export function setVolumes(v = {}) {
  for (const k of ['master', 'sfx', 'music']) if (typeof v[k] === 'number' && isFinite(v[k])) vols[k] = Math.max(0, Math.min(1, v[k]));
  applyVolumes();
}
export function mute(b) { muted = !!b; applyVolumes(); }
export function duck(ms = 400) {
  if (!ctx) return;
  const t = ctx.currentTime;
  duckG.gain.cancelScheduledValues(t);
  duckG.gain.setTargetAtTime(0.25, t, 0.03);
  duckG.gain.setTargetAtTime(1, t + Math.max(0, ms) / 1000, 0.25);
}

// ---------- voice helpers ----------
// output node for one sfx voice: gain -> (pan) -> sfxBus, with reverb send
function route(send) {
  const g = ctx.createGain();
  let tail = g;
  if (cur.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, cur.pan)); g.connect(p); tail = p; }
  tail.connect(sfxBus);
  if (send > 0) { const s = ctx.createGain(); s.gain.value = send; tail.connect(s); s.connect(verb); }
  return g;
}
function finish(src, node) { active++; src.onended = () => { active--; try { node.disconnect(); } catch (e) { /* gone */ } }; }
// tone: o {type,v,to,at,t,a,fm:[ratio,depth],out,send}
function T(f, d, o = {}) {
  if (!ctx) return;
  const music = !!o.out;
  if (!music && active >= MAX_VOICES) return;
  const t0 = o.t != null ? o.t : ctx.currentTime + (o.at || 0), p = music ? 1 : cur.p, v = (o.v == null ? 0.2 : o.v) * (music ? 1 : cur.v);
  const osc = ctx.createOscillator(), g = route(0);
  const out = o.out || null;
  if (out) { g.disconnect(); g.connect(out); if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(verb); } }
  else if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(verb); }
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(f * p, t0);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to * p), t0 + d);
  if (o.fm) { const m = ctx.createOscillator(), mg = ctx.createGain(); m.frequency.value = f * p * o.fm[0]; mg.gain.setValueAtTime(f * p * o.fm[1], t0); mg.gain.exponentialRampToValueAtTime(1, t0 + d); m.connect(mg); mg.connect(osc.frequency); m.start(t0); m.stop(t0 + d + 0.05); }
  const a = o.a || 0.006;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
  osc.connect(g); osc.start(t0); osc.stop(t0 + d + 0.05);
  if (!music) finish(osc, g);
}
// noise: o {v,f,to,q,ft,at,t,a,rise,crush,out,send}
function N(d, o = {}) {
  if (!ctx) return;
  const music = !!o.out;
  if (!music && active >= MAX_VOICES) return;
  const t0 = o.t != null ? o.t : ctx.currentTime + (o.at || 0), v = (o.v == null ? 0.2 : o.v) * (music ? 1 : cur.v);
  const src = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = route(0);
  if (o.out) { g.disconnect(); g.connect(o.out); }
  if (o.send) { const s = ctx.createGain(); s.gain.value = o.send; g.connect(s); s.connect(verb); }
  if (o.crush) { // sample-and-hold, 3 bit
    const n = Math.floor(ctx.sampleRate * Math.min(1, d + 0.05)), b = ctx.createBuffer(1, n, ctx.sampleRate), x = b.getChannelData(0);
    let h = 0; for (let i = 0; i < n; i++) { if (i % 9 === 0) h = Math.round((rnd() * 2 - 1) * 4) / 4; x[i] = h; }
    src.buffer = b;
  } else { src.buffer = noiseBuf; src.loop = true; }
  fl.type = o.ft || 'lowpass'; fl.Q.value = o.q || 0.7;
  fl.frequency.setValueAtTime(o.f || 2000, t0);
  if (o.to) fl.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + d);
  g.gain.setValueAtTime(0.0001, t0);
  if (o.rise) { g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + d * 0.95); g.gain.linearRampToValueAtTime(0.0001, t0 + d); }
  else { g.gain.exponentialRampToValueAtTime(Math.max(0.0002, v), t0 + (o.a || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); }
  src.connect(fl); fl.connect(g);
  src.start(t0, rnd() * 0.5); src.stop(t0 + d + 0.05);
  if (!music) finish(src, g);
}
const notes = (fs, step, d, o = {}) => fs.forEach((f, i) => T(f, d, { ...o, at: (o.at || 0) + i * step }));

// ---------- SFX table: name -> [recipe summary, synth] ----------
const PENT = [523, 587, 659, 784, 880, 1047];
const S = {
  cardDraw: ['bandpass noise whoosh sweep up; pitch rises per consecutive call within 400 ms', () => { N(0.14, { v: 0.12, ft: 'bandpass', f: 600, to: 3000, q: 1.2 }); T(300, 0.08, { to: 520, type: 'triangle', v: 0.04 }); }],
  shuffle: ['12 rapid highpassed noise clicks over 300 ms', () => { for (let i = 0; i < 12; i++) N(0.025, { v: 0.1, ft: 'highpass', f: 2500 + rnd() * 2500, at: i * 0.024 + rnd() * 0.006 }); }],
  cardPlay: ['paper slap noise plus soft triangle thock', () => { N(0.07, { v: 0.14, ft: 'bandpass', f: 1800, q: 0.8 }); T(220, 0.09, { to: 140, type: 'triangle', v: 0.14 }); }],
  hitSmall: ['short noise tick plus 180 to 90 Hz square', () => { N(0.06, { v: 0.16, f: 3000 }); T(180, 0.09, { to: 90, type: 'square', v: 0.1 }); }],
  hitBig: ['lowpass noise burst plus 60 Hz sine drop', () => { N(0.22, { v: 0.3, f: 1800, to: 300 }); T(120, 0.35, { to: 45, v: 0.4 }); T(60, 0.3, { to: 38, v: 0.3 }); }],
  block: ['two-note square/saw brass clank, 330 then 440 Hz', () => { T(330, 0.12, { type: 'sawtooth', v: 0.1, fm: [1.41, 2] }); T(440, 0.2, { type: 'square', v: 0.09, at: 0.07, fm: [2.76, 1.5] }); N(0.05, { v: 0.1, ft: 'highpass', f: 3000 }); }],
  blockBreak: ['rivet pops (short sine bursts) plus tin ping', () => { for (let i = 0; i < 4; i++) T(900 + rnd() * 700, 0.04, { to: 300, v: 0.12, at: i * 0.03 }); T(2400, 0.3, { v: 0.08, at: 0.1, send: 0.2 }); N(0.12, { v: 0.14, ft: 'highpass', f: 2000 }); }],
  heal: ['rising sine third with soft shimmer', () => { notes([523, 659, 784], 0.07, 0.3, { v: 0.1, send: 0.3 }); T(1568, 0.4, { v: 0.03, at: 0.12 }); }],
  loseHp: ['dull low thump with muffled noise', () => { T(95, 0.22, { to: 50, v: 0.35 }); N(0.12, { v: 0.1, f: 400 }); }],
  heartbeat: ['two-sine lub-dub at 55 and 48 Hz', () => { T(58, 0.16, { to: 42, v: 0.4 }); T(50, 0.2, { to: 38, v: 0.32, at: 0.2 }); }],
  burnApply: ['rising bandpass crackle plus random sparks', () => { N(0.35, { v: 0.12, ft: 'bandpass', f: 800, to: 4500, q: 2 }); for (let i = 0; i < 7; i++) T(1500 + rnd() * 2500, 0.025, { type: 'square', v: 0.04, at: 0.03 + i * 0.04 + rnd() * 0.02 }); }],
  bleedApply: ['wet low squelch: falling sine with lowpassed noise drip', () => { T(260, 0.18, { to: 90, v: 0.18, fm: [0.5, 1] }); T(700, 0.06, { to: 300, v: 0.1, at: 0.15 }); N(0.12, { v: 0.08, f: 700 }); }],
  poison: ['sour detuned saw pair sliding down with bubbles', () => { T(330, 0.4, { to: 220, type: 'sawtooth', v: 0.06 }); T(340, 0.4, { to: 230, type: 'sawtooth', v: 0.06 }); for (let i = 0; i < 3; i++) T(500 + rnd() * 300, 0.06, { to: 900, v: 0.07, at: 0.08 + i * 0.09 }); }],
  buff: ['rising triangle fifth', () => { notes([392, 587], 0.08, 0.25, { type: 'triangle', v: 0.12 }); T(784, 0.3, { at: 0.16, v: 0.07, send: 0.2 }); }],
  debuff: ['falling triangle minor third', () => { notes([415, 330, 262], 0.08, 0.25, { type: 'triangle', v: 0.12 }); }],
  vulnerable: ['cracking glassy ping over falling tone', () => { T(1200, 0.25, { to: 500, type: 'triangle', v: 0.1 }); N(0.04, { v: 0.14, ft: 'highpass', f: 5000 }); T(2200, 0.2, { v: 0.05, at: 0.05 }); }],
  weak: ['limp sagging sine with wobble', () => { T(400, 0.35, { to: 180, v: 0.13, fm: [0.25, 0.4] }); }],
  kill: ['descending sawtooth gliss with thump', () => { T(900, 0.4, { to: 120, type: 'sawtooth', v: 0.1 }); T(90, 0.25, { to: 45, v: 0.3 }); }],
  enemyDeath: ['bandpass noise unstitching rip, then falling pieces', () => { N(0.3, { v: 0.2, ft: 'bandpass', f: 1500, to: 6000, q: 3 }); for (let i = 0; i < 5; i++) T(700 - i * 90 + rnd() * 50, 0.08, { to: 150, type: 'triangle', v: 0.08, at: 0.25 + i * 0.07 }); T(70, 0.4, { to: 40, v: 0.3, at: 0.3 }); }],
  intentReveal: ['quill scratch: bandpassed noise scribbles', () => { for (let i = 0; i < 4; i++) N(0.05, { v: 0.1, ft: 'bandpass', f: 4000 + rnd() * 2000, q: 3, at: i * 0.055 }); }],
  graftAttach: ['6 zigzag needle ticks alternating pitch, then a staple clunk', () => { for (let i = 0; i < 6; i++) T(i % 2 ? 2600 : 1900, 0.025, { type: 'square', v: 0.06, at: i * 0.05 }); T(160, 0.14, { to: 80, type: 'square', v: 0.22, at: 0.34 }); N(0.06, { v: 0.2, f: 3500, at: 0.34 }); }],
  graftScar: ['dry highpass snap then low thud', () => { N(0.04, { v: 0.25, ft: 'highpass', f: 3500 }); T(80, 0.3, { to: 45, v: 0.38, at: 0.05 }); }],
  tithe: ['dry snap, low thud, and a falling coin-like tone', () => { N(0.04, { v: 0.22, ft: 'highpass', f: 3000 }); T(70, 0.32, { to: 42, v: 0.38, at: 0.05 }); T(600, 0.2, { to: 260, type: 'triangle', v: 0.07, at: 0.08 }); }],
  overload: ['rising dread (saw swell + noise rise) then slam', () => { T(80, 0.5, { to: 320, type: 'sawtooth', v: 0.1 }); T(85, 0.5, { to: 340, type: 'sawtooth', v: 0.1 }); N(0.5, { v: 0.18, ft: 'bandpass', f: 300, to: 5000, q: 1, rise: true }); N(0.3, { v: 0.35, f: 1500, to: 200, at: 0.5 }); T(110, 0.5, { to: 35, v: 0.5, at: 0.5 }); }],
  shatter: ['glass tinkles plus reversed cymbal swell', () => { N(0.35, { v: 0.14, ft: 'highpass', f: 6000, rise: true }); for (let i = 0; i < 8; i++) T(2500 + rnd() * 3500, 0.12, { v: 0.05, at: 0.3 + i * 0.03 + rnd() * 0.03, send: 0.2 }); N(0.1, { v: 0.2, ft: 'highpass', f: 4000, at: 0.33 }); }],
  jam: ['grinding stutter: gated low saw with noise', () => { for (let i = 0; i < 6; i++) { T(70 + (i % 2) * 12, 0.05, { type: 'sawtooth', v: 0.14, at: i * 0.06 }); N(0.04, { v: 0.08, f: 900, at: i * 0.06 }); } }],
  junkAdd: ['muffled low thump', () => { T(110, 0.14, { to: 70, type: 'triangle', v: 0.25 }); N(0.08, { v: 0.08, f: 350 }); }],
  gold: ['rising pentatonic plinks', () => { notes(PENT.slice(0, 5), 0.055, 0.18, { type: 'triangle', v: 0.09, send: 0.2 }); }],
  coin: ['two-note high sine ching', () => { T(1318, 0.1, { type: 'triangle', v: 0.08 }); T(1760, 0.22, { v: 0.07, at: 0.05, send: 0.15 }); }],
  potion: ['bubbling rising sine blips plus glug', () => { for (let i = 0; i < 4; i++) T(350 + i * 90 + rnd() * 60, 0.07, { to: 700 + i * 100, v: 0.09, at: i * 0.06 }); T(200, 0.15, { to: 120, v: 0.12, at: 0.25 }); }],
  relic: ['FM bell with long reverb tail', () => { T(660, 0.7, { v: 0.14, fm: [3.5, 2.5], send: 0.5 }); T(990, 0.6, { v: 0.07, at: 0.04, fm: [2.1, 1.5], send: 0.5 }); }],
  upgrade: ['rising triangle arpeggio with sparkle', () => { notes([392, 494, 587, 784, 988], 0.06, 0.25, { type: 'triangle', v: 0.1, send: 0.2 }); T(1976, 0.4, { v: 0.04, at: 0.3 }); }],
  uiClick: ['tiny triangle tick', () => { T(700, 0.04, { type: 'triangle', v: 0.08 }); }],
  uiHover: ['very quiet high sine tick', () => { T(1200, 0.025, { v: 0.025 }); }],
  uiBack: ['falling triangle blip', () => { T(600, 0.07, { to: 380, type: 'triangle', v: 0.09 }); }],
  error: ['two low buzzy square pulses', () => { T(150, 0.09, { type: 'square', v: 0.1 }); T(130, 0.14, { type: 'square', v: 0.1, at: 0.11 }); }],
  turnEnd: ['low two-note falling wood knock', () => { T(260, 0.1, { to: 200, type: 'triangle', v: 0.16 }); T(190, 0.14, { to: 140, type: 'triangle', v: 0.14, at: 0.1 }); }],
  turnStart: ['soft gong: inharmonic FM sine cluster with reverb', () => { T(196, 0.9, { v: 0.14, fm: [1.5, 1.2], send: 0.5 }); T(293, 0.7, { v: 0.06, at: 0.01, send: 0.4 }); }],
  win: ['major arpeggio stinger with held chord', () => { notes([392, 494, 587, 784], 0.11, 0.35, { type: 'triangle', v: 0.13, send: 0.3 }); [392, 494, 587].forEach(f => T(f, 0.6, { v: 0.07, at: 0.45, send: 0.4 })); }],
  lose: ['descending minor stinger with low sawtooth drone', () => { notes([392, 349, 311, 262], 0.2, 0.45, { type: 'triangle', v: 0.14, send: 0.3 }); T(65, 0.9, { to: 55, type: 'sawtooth', v: 0.1, at: 0.4 }); }],
  bossIntro: ['low detuned saw swell, brass fifth, noise slam', () => { T(55, 0.9, { to: 60, type: 'sawtooth', v: 0.14 }); T(82, 0.9, { type: 'sawtooth', v: 0.1, a: 0.3 }); N(0.6, { v: 0.15, f: 200, to: 1200, rise: true }); T(40, 0.6, { v: 0.4, at: 0.6 }); N(0.2, { v: 0.25, f: 1000, at: 0.6 }); }],
  echo: ['pluck played through a feedback delay line with ghost repeats', () => {
    const d = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), out = route(0.2);
    d.delayTime.value = 0.13; fb.gain.value = 0.45; lp.type = 'lowpass'; lp.frequency.value = 2200;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(out);
    const osc = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime;
    osc.type = 'triangle'; osc.frequency.value = 520 * cur.p; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14 * cur.v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g); g.connect(out); g.connect(d); osc.start(t); osc.stop(t + 0.15);
    active++; osc.onended = () => setTimeout(() => { active--; try { out.disconnect(); d.disconnect(); } catch (e) { /* gone */ } }, 900);
  }],
  static: ['bitcrushed noise zap with falling square', () => { N(0.18, { v: 0.16, crush: true, f: 9000 }); T(1400, 0.15, { to: 150, type: 'square', v: 0.07 }); }],
  rustGrind: ['rasping bandpassed noise with low saw scrape', () => { N(0.4, { v: 0.14, ft: 'bandpass', f: 500, to: 250, q: 4 }); T(90, 0.4, { to: 70, type: 'sawtooth', v: 0.08, fm: [7, 3] }); }],
  gilded: ['detuned 3-saw choir chord through lowpass', () => { [392, 494, 587].forEach(f => [-7, 0, 7].forEach(c => T(f * Math.pow(2, c / 1200), 0.7, { type: 'sawtooth', v: 0.025, a: 0.12, send: 0.4 }))); }],
  mapStep: ['soft low footstep tick', () => { T(150, 0.07, { to: 100, type: 'triangle', v: 0.12 }); N(0.04, { v: 0.05, f: 1200 }); }],
  restHeal: ['slow warm sine chord swell', () => { [262, 330, 392].forEach((f, i) => T(f, 0.9, { v: 0.07, a: 0.2, at: i * 0.1, send: 0.4 })); }],
  shopBuy: ['coin ching plus till clunk', () => { T(1568, 0.12, { type: 'triangle', v: 0.08 }); T(2093, 0.25, { v: 0.06, at: 0.06, send: 0.2 }); T(120, 0.1, { to: 80, type: 'square', v: 0.1, at: 0.12 }); }],
  eventChime: ['three-note mysterious bell phrase', () => { notes([587, 698, 880], 0.14, 0.5, { v: 0.1, fm: [2, 1.2], send: 0.45 }); }],
};
export const SFX_NAMES = Object.keys(S);
export function describeSfx(name) { return S[name] ? name + ': ' + S[name][0] : ''; }
export function analyze() { return SFX_NAMES.map(describeSfx); }

export function sfx(name, opts = {}) {
  if (!ctx || muted || !S[name]) return;
  const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  if (now - (lastAt[name] || -1e9) < MIN_GAP_MS) return;
  lastAt[name] = now;
  let p = typeof opts.pitch === 'number' ? opts.pitch : 1;
  if (name === 'cardDraw') { drawN = now - drawAt < 400 ? Math.min(drawN + 1, 8) : 0; drawAt = now; p *= 1 + drawN * 0.06; }
  cur = { p, v: typeof opts.vol === 'number' ? opts.vol : 1, pan: opts.pan || 0 };
  try { S[name][1](); } catch (e) { /* audio is optional */ }
  cur = { p: 1, v: 1, pan: 0 };
}

// ---------- music ----------
const MINOR = [0, 2, 3, 5, 7, 8, 10], PHRYG = [0, 1, 3, 5, 7, 8, 10], MAJOR = [0, 2, 4, 5, 7, 9, 11], HARM = [0, 2, 3, 5, 7, 8, 11];
const MM = {
  title: { root: 110, scale: MINOR, bpm: 56, beats: 4, pad: { v: 0.05, cut: 700 }, mel: { p: 0.4, inst: 'box', v: 0.09 } },
  ward: { root: 98, scale: PHRYG, bpm: 70, beats: 4, pad: { v: 0.035, cut: 500 }, hum: 100, perc: { kind: 'tick', steps: [0, 2, 4, 6] }, mel: { p: 0.1, inst: 'ring', v: 0.06 } },
  market: { root: 130.8, scale: HARM, bpm: 132, beats: 3, pad: { v: 0.03, cut: 900 }, bass: { steps: [0], v: 0.12 }, stab: { steps: [2, 4], v: 0.05 }, perc: { kind: 'clink', steps: [2, 4] }, mel: { p: 0.35, inst: 'box', v: 0.08 } },
  theatre: { root: 87.3, scale: MINOR, bpm: 90, beats: 4, pad: { v: 0.06, cut: 1100 }, bass: { steps: [0, 4], v: 0.13 }, perc: { kind: 'kick', steps: [0, 4] }, mel: { p: 0.7, inst: 'gold', v: 0.08, arp: [0, 2, 4, 7] } },
  boss: { root: 73.4, scale: PHRYG, bpm: 110, beats: 4, pad: { v: 0.05, cut: 600 }, bass: { steps: [0, 1, 2, 3, 4, 5, 6, 7], v: 0.1, saw: true }, perc: { kind: 'drive', steps: [0, 4] }, mel: { p: 0.18, inst: 'gold', v: 0.07 } },
  grafting: { root: 55, scale: [0, 3, 5, 7, 10], bpm: 48, beats: 4, pad: { v: 0.07, cut: 300, drone: true }, mel: { p: 0.07, inst: 'ring', v: 0.07 } },
  victory: { root: 130.8, scale: MAJOR, bpm: 100, beats: 4, pad: { v: 0.05, cut: 1400 }, bass: { steps: [0, 4], v: 0.1 }, mel: { p: 0.75, inst: 'gold', v: 0.08, arp: [0, 2, 4, 7, 9] } },
  defeat: { root: 98, scale: MINOR, bpm: 50, beats: 4, pad: { v: 0.05, cut: 400 }, mel: { p: 0.35, inst: 'box', v: 0.08, down: true } },
  shop: { root: 146.8, scale: [0, 2, 4, 7, 9], bpm: 76, beats: 4, pad: { v: 0.03, cut: 1000 }, bass: { steps: [0], v: 0.07 }, mel: { p: 0.3, inst: 'box', v: 0.08 } },
  forge: { root: 65.4, scale: [0, 3, 5, 7, 10], bpm: 64, beats: 4, pad: { v: 0.06, cut: 500 }, perc: { kind: 'anvil', steps: [0, 3] }, mel: { p: 0.08, inst: 'ring', v: 0.06 } },
};
export const MUSIC_MODES = Object.keys(MM);

let mus = null, timer = 0, seedN = 1;
const rng32 = s => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const degHz = (m, d) => { const n = m.scale.length; return hz(m.root, m.scale[((d % n) + n) % n] + 12 * Math.floor(d / n)); };

function startVoice(name) {
  const m = MM[name], bus = ctx.createGain(), t = ctx.currentTime;
  bus.gain.setValueAtTime(0.0001, t); bus.gain.linearRampToValueAtTime(1, t + 2);
  bus.connect(musBus);
  const v = { name, m, bus, step: 0, next: t + 0.1, pos: 3, r: rng32(name.length * 7919 + seedN++), nodes: [] };
  if (m.hum) { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = m.hum; g.gain.value = 0.012; o.connect(g); g.connect(bus); o.start(); v.nodes.push(o); }
  return v;
}
function endVoice(v) {
  const t = ctx.currentTime;
  v.bus.gain.cancelScheduledValues(t); v.bus.gain.setValueAtTime(v.bus.gain.value, t); v.bus.gain.linearRampToValueAtTime(0, t + 2);
  v.dead = true;
  setTimeout(() => { try { v.nodes.forEach(n => n.stop()); v.bus.disconnect(); } catch (e) { /* gone */ } }, 2300);
}
function pluck(kind, f, t, vol, out) {
  if (kind === 'box') { T(f * 2, 0.9, { t, v: vol, out, send: 0.4 }); T(f * 4, 0.3, { t, v: vol * 0.3, type: 'triangle', out }); }
  else if (kind === 'ring') { T(f * 4, 1.6, { t, v: vol, out, send: 0.7, fm: [2.76, 1.2] }); }
  else { T(f * 2, 0.5, { t, v: vol, type: 'triangle', out, send: 0.3 }); T(f * 2.003, 0.35, { t, v: vol * 0.5, type: 'sawtooth', out }); }
}
function sched(v, t) {
  const m = v.m, out = v.bus, per = m.beats * 2, s = v.step % per, sec = 60 / m.bpm / 2, chordBase = [0, 2, 4][Math.floor(v.step / per) % 3] * (m.pad.drone ? 0 : 1);
  if (s === 0) { // pad: root + fifth, slow swell
    const d = per * sec, f = degHz(m, chordBase - (chordBase ? 7 : 0) + (chordBase ? 0 : 0));
    const f0 = chordBase ? degHz(m, [0, 3, 4][Math.floor(v.step / per) % 3]) : m.root;
    for (const [mul, ty] of m.pad.drone ? [[1, 'sine'], [2.003, 'sine']] : [[1, 'sawtooth'], [1.4983, 'sawtooth'], [1.0045, 'sawtooth']]) {
      const o = ctx.createOscillator(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = ty; o.frequency.value = f0 * mul; fl.type = 'lowpass'; fl.frequency.value = m.pad.cut;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(m.pad.v / 2, t + d * 0.4); g.gain.linearRampToValueAtTime(0.0001, t + d + 0.3);
      o.connect(fl); fl.connect(g); g.connect(out); o.start(t); o.stop(t + d + 0.4); void f;
    }
  }
  const b = m.bass;
  if (b && b.steps.includes(s)) T(m.root * (m.beats === 3 ? 1 : 1) * (s % 2 && b.saw ? 1 : 1), sec * 1.6, { t, v: b.v, type: b.saw ? 'sawtooth' : 'triangle', out });
  if (m.stab && m.stab.steps.includes(s)) { T(degHz(m, 2) * 2, 0.12, { t, v: m.stab.v, type: 'triangle', out }); T(degHz(m, 4) * 2, 0.12, { t, v: m.stab.v, type: 'triangle', out }); }
  const p = m.perc;
  if (p && p.steps.includes(s)) {
    if (p.kind === 'tick') N(0.02, { t, v: 0.05, ft: 'highpass', f: 5000, out });
    else if (p.kind === 'clink') { T(2200 + v.r() * 400, 0.12, { t, v: 0.03, out }); T(3300, 0.08, { t, v: 0.02, out }); }
    else if (p.kind === 'kick') T(90, 0.2, { t, to: 45, v: 0.14, out });
    else if (p.kind === 'drive') { T(100, 0.15, { t, to: 40, v: 0.2, out }); }
    else if (p.kind === 'anvil') { T(1100, 0.5, { t, v: 0.04, out, send: 0.4, fm: [2.4, 1] }); N(0.03, { t, v: 0.06, ft: 'bandpass', f: 3000, out }); }
  }
  if (p && p.kind === 'drive' && (s === 2 || s === 6)) N(0.1, { t, v: 0.07, ft: 'bandpass', f: 1800, out });
  if (p && p.kind === 'drive' && s % 2 === 1) N(0.02, { t, v: 0.03, ft: 'highpass', f: 7000, out });
  const ml = m.mel;
  if (ml.arp) { if (v.r() < ml.p) pluck(ml.inst, degHz(m, ml.arp[v.step % ml.arp.length]), t, ml.v, out); }
  else if (v.r() < ml.p) {
    const mv = [-2, -1, -1, 0, 1, 1, 2][Math.floor(v.r() * 7)];
    v.pos = ml.down ? v.pos - Math.abs(mv || 1) : v.pos + mv;
    if (ml.down && v.pos < 0) v.pos = 9; else v.pos = Math.max(0, Math.min(9, v.pos));
    pluck(ml.inst, degHz(m, v.pos), t, ml.v, out);
  }
}
function tick() {
  if (!ctx || !mus || mus.dead) return;
  const lim = ctx.currentTime + 0.2, sec = 60 / mus.m.bpm / 2;
  while (mus.next < lim) { sched(mus, mus.next); mus.step++; mus.next += sec; }
}
export function music(mode) {
  if (!ctx || !MM[mode]) return;
  if (mus && mus.name === mode && !mus.dead) return;
  if (mus) endVoice(mus);
  mus = startVoice(mode);
  if (!timer) timer = setInterval(tick, 25);
}
export function stopMusic() {
  if (mus) { if (ctx) endVoice(mus); mus = null; }
  if (timer) { clearInterval(timer); timer = 0; }
}
