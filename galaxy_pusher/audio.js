// Galaxy Pusher audio: every sound is synthesised with Web Audio (no files).
// Voices are rate limited so a cascade of 80 coins sounds like a cascade, not a wall of noise.
// The music is a small beatbox groove (kick, "pf" snare, "ts" hats) with a bass line and a pad;
// DOUBLE TIME lifts the tempo and adds an arpeggio lead.

let ac = null, master = null, sfxBus = null, musBus = null, comp = null, noiseBuf = null;
const prefs = { sfx: true, music: true };
try { const p = JSON.parse(localStorage.getItem('galaxy_pusher_audio') || 'null'); if (p) Object.assign(prefs, p); } catch (e) { /* private mode */ }
const savePrefs = () => { try { localStorage.setItem('galaxy_pusher_audio', JSON.stringify(prefs)); } catch (e) { /* ignore */ } };

export const A = {
  prefs,
  unlock() {
    if (!ac) {
      const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
      ac = new C();
      comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
      master = ac.createGain(); master.gain.value = 0.8; master.connect(comp); comp.connect(ac.destination);
      sfxBus = ac.createGain(); sfxBus.gain.value = prefs.sfx ? 0.9 : 0; sfxBus.connect(master);
      musBus = ac.createGain(); musBus.gain.value = prefs.music ? 0.42 : 0; musBus.connect(master);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 1, ac.sampleRate);
      const d = noiseBuf.getChannelData(0); let s = 1; for (let i = 0; i < d.length; i++) { s = (s * 16807) % 2147483647; d[i] = (s / 2147483647) * 2 - 1; }
    }
    if (ac.state === 'suspended') ac.resume();
  },
  setSfx(on) { prefs.sfx = on; savePrefs(); if (sfxBus) sfxBus.gain.setTargetAtTime(on ? 0.9 : 0, ac.currentTime, 0.05); },
  setMusic(on) { prefs.music = on; savePrefs(); if (musBus) musBus.gain.setTargetAtTime(on ? 0.42 : 0, ac.currentTime, 0.1); },
  ready: () => !!ac && ac.state === 'running',
};

const now = () => ac.currentTime;
const limits = {};
function allow(key, perSec) { // simple voice limiter per sound family
  const t = now(); const L = limits[key] || (limits[key] = { t: 0, n: 0 });
  if (t - L.t > 0.1) { L.t = t; L.n = 0; }
  if (L.n >= perSec / 10) return false; L.n++; return true;
}
function env(g, t, a, peak, d) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d); }
function tone(type, f, t, a, peak, d, bus, f2) {
  const o = ac.createOscillator(), g = ac.createGain(); o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  env(g, t, a, peak, d); o.connect(g); g.connect(bus || sfxBus); o.start(t); o.stop(t + a + d + 0.05); return o;
}
function noise(t, dur, peak, type, freq, q, bus, f2) {
  const s = ac.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
  const f = ac.createBiquadFilter(); f.type = type || 'bandpass'; f.frequency.setValueAtTime(freq || 3000, t); if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur); f.Q.value = q || 1;
  const g = ac.createGain(); env(g, t, 0.003, peak, dur);
  s.connect(f); f.connect(g); g.connect(bus || sfxBus); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}
const ok = () => ac && ac.state === 'running';

// --------------------------------------------------------------- sound effects
export const S = {
  // metal on metal: two inharmonic partials, short
  clink(v = 1, pan = 0) {
    if (!ok() || !allow('clink', 40)) return;
    const t = now(), f = 2400 + Math.random() * 1800, p = Math.min(0.18, 0.04 + v * 0.012);
    tone('sine', f, t, 0.001, p, 0.07); tone('sine', f * 1.53, t, 0.001, p * 0.6, 0.05); tone('triangle', f * 0.5, t, 0.001, p * 0.3, 0.03);
  },
  land(v = 1) {
    if (!ok() || !allow('land', 30)) return;
    const t = now(), f = 1700 + Math.random() * 1300, p = Math.min(0.14, 0.02 + v * 0.006);
    tone('sine', f, t, 0.001, p, 0.06); tone('sine', f * 2.7, t, 0.001, p * 0.4, 0.03); noise(t, 0.025, p * 0.5, 'highpass', 5000);
  },
  fire() {
    if (!ok()) return; const t = now();
    noise(t, 0.06, 0.08, 'bandpass', 1800, 2, null, 600); tone('square', 320, t, 0.002, 0.03, 0.05, null, 160);
  },
  pay(combo = 0, gold = false) { // rising chime, combo raises the pitch
    if (!ok() || !allow('pay', 18)) return;
    const t = now(), steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24], st = steps[Math.min(steps.length - 1, combo)];
    const f = (gold ? 1046 : 880) * Math.pow(2, st / 12);
    tone('triangle', f, t, 0.002, 0.09, 0.16); tone('sine', f * 2, t, 0.002, 0.04, 0.1);
  },
  lost() { if (!ok() || !allow('lost', 6)) return; const t = now(); tone('sine', 300, t, 0.005, 0.05, 0.18, null, 120); },
  token(col) {
    if (!ok()) return; const t = now(), base = col === 'B' ? 659 : col === 'P' ? 784 : 587;
    [0, 4, 7, 12].forEach((s, i) => tone('triangle', base * Math.pow(2, s / 12), t + i * 0.045, 0.003, 0.09, 0.18));
    noise(t, 0.2, 0.04, 'highpass', 7000);
  },
  // the back-wall port pops a token out: an air puff and a rising blip
  port(col) {
    if (!ok() || !allow('port', 8)) return; const t = now(), base = col === 'B' ? 330 : col === 'P' ? 392 : 294;
    noise(t, 0.09, 0.12, 'bandpass', 1800, 1.5); tone('sine', base, t, 0.004, 0.06, 0.16, null, base * 2.2);
  },
  slot(i) { if (!ok()) return; const t = now(); tone('square', 520 + i * 90, t, 0.002, 0.05, 0.08); tone('sine', 1040 + i * 180, t + 0.03, 0.002, 0.05, 0.12); },
  triple(col) {
    if (!ok()) return; const t = now(), root = col === 'B' ? 392 : col === 'P' ? 440 : 349;
    [[0, 4, 7], [5, 9, 12], [7, 11, 14, 19]].forEach((ch, k) => ch.forEach((s) => tone('sawtooth', root * Math.pow(2, s / 12), t + k * 0.11, 0.005, 0.05, 0.22)));
    noise(t + 0.33, 0.4, 0.06, 'highpass', 6000);
  },
  // beatbox style hits: Rox throws kicks and snares, Jas sings, Mew scratches
  hit(col, big) {
    if (!ok() || !allow('hit', 20)) return; const t = now();
    if (col === 'B') { tone('sine', 150, t, 0.002, 0.5, 0.18, null, 45); noise(t, 0.05, 0.2, 'lowpass', 1200); }
    else if (col === 'P') { tone('triangle', 880 + Math.random() * 300, t, 0.01, 0.12, 0.2, null, 1320); tone('sine', 1760, t, 0.01, 0.05, 0.2); noise(t, 0.08, 0.1, 'bandpass', 3500, 3); }
    else if (col === 'Y') { noise(t, 0.12, 0.25, 'bandpass', 2500, 2, null, 600); tone('square', 220, t, 0.002, 0.08, 0.08, null, 110); }
    else { noise(t, 0.08, 0.15, 'bandpass', 2200, 1.5); tone('sine', 200, t, 0.002, 0.2, 0.1, null, 80); }
    if (big) { tone('sine', 80, t, 0.002, 0.5, 0.35, null, 35); noise(t, 0.3, 0.18, 'lowpass', 800, 1, null, 150); }
  },
  laser() { if (!ok() || !allow('laser', 10)) return; const t = now(); tone('square', 1800, t, 0.002, 0.025, 0.08, null, 500); },
  levelUp() {
    if (!ok()) return; const t = now();
    [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone('square', 523 * Math.pow(2, s / 12), t + i * 0.05, 0.003, 0.045, 0.14));
  },
  kill() {
    if (!ok()) return; const t = now();
    noise(t, 0.9, 0.35, 'lowpass', 2400, 0.8, null, 90); tone('sine', 120, t, 0.003, 0.6, 0.6, null, 30);
    [0, 7, 12, 19].forEach((s, i) => tone('triangle', 392 * Math.pow(2, s / 12), t + 0.25 + i * 0.09, 0.005, 0.08, 0.35));
  },
  wheelOpen() { if (!ok()) return; const t = now(); tone('sawtooth', 110, t, 0.05, 0.08, 0.6, null, 440); noise(t, 0.6, 0.06, 'bandpass', 800, 1, null, 5000); },
  tick(sp = 1) { if (!ok() || !allow('tick', 40)) return; const t = now(); tone('square', 2200, t, 0.001, 0.03 + 0.03 * Math.min(1, sp), 0.025); },
  ballDrop() { if (!ok()) return; const t = now(); tone('sine', 300, t, 0.002, 0.25, 0.12, null, 120); noise(t, 0.05, 0.1, 'lowpass', 1500); },
  ballHop() { if (!ok()) return; const t = now(); tone('sine', 900 + Math.random() * 400, t, 0.002, 0.08, 0.06); },
  prize(jp) {
    if (!ok()) return; const t = now(), seq = jp ? [0, 4, 7, 12, 16, 19, 24, 28, 31] : [0, 4, 7, 12, 16];
    seq.forEach((s, i) => { tone('square', 523 * Math.pow(2, s / 12), t + i * 0.07, 0.004, 0.05, 0.2); tone('triangle', 1046 * Math.pow(2, s / 12), t + i * 0.07, 0.004, 0.04, 0.25); });
    noise(t, 1.0, 0.05, 'highpass', 8000);
  },
  towerCoin(i, n) { if (!ok() || !allow('tcoin', 30)) return; const t = now(); const f = 600 * Math.pow(2, (i / Math.max(1, n)) * 2); tone('sine', f, t, 0.001, 0.06, 0.05); tone('sine', f * 1.5, t, 0.001, 0.03, 0.04); },
  towerDone() { if (!ok()) return; const t = now(); [0, 7, 12].forEach((s, i) => tone('triangle', 784 * Math.pow(2, s / 12), t + i * 0.06, 0.003, 0.08, 0.3)); },
  creak() { if (!ok() || !allow('creak', 3)) return; const t = now(); tone('sawtooth', 70 + Math.random() * 30, t, 0.05, 0.03, 0.25, null, 55); },
  // a tower smacking the cabinet glass: a deep thud, the pane ringing, then the coins
  smack(n = 300) {
    if (!ok()) return; const t = now();
    tone('sine', 62, t, 0.002, 0.8, 0.5, null, 32); noise(t, 0.22, 0.45, 'lowpass', 900, 0.8, null, 180);
    [1180, 1710, 2630].forEach((f, i) => tone('sine', f, t + 0.01, 0.002, 0.07 - i * 0.015, 1.1 - i * 0.25));
    for (let i = 0; i < Math.min(30, n / 30); i++) tone('sine', 2200 + Math.random() * 2400, t + 0.05 + Math.random() * 0.5, 0.001, 0.05, 0.05);
  },
  topple() { if (!ok()) return; const t = now(); tone('sawtooth', 90, t, 0.05, 0.08, 0.6, null, 40); noise(t, 0.6, 0.08, 'bandpass', 600, 1, null, 2000); },
  burst(n) {
    if (!ok()) return; const t = now();
    noise(t, 0.5, 0.3, 'highpass', 3000, 0.7); tone('sine', 70, t, 0.003, 0.5, 0.4, null, 35);
    for (let i = 0; i < Math.min(40, n); i++) { const d = Math.random() * 0.9, f = 2000 + Math.random() * 2500; tone('sine', f, t + d, 0.001, 0.05, 0.06); }
  },
  fever() {
    if (!ok()) return; const t = now();
    [0, 3, 7, 10, 12, 15, 19, 24].forEach((s, i) => tone('sawtooth', 220 * Math.pow(2, s / 12), t + i * 0.04, 0.005, 0.05, 0.25));
    noise(t, 0.8, 0.1, 'bandpass', 500, 1, null, 9000);
  },
  click() { if (!ok()) return; const t = now(); tone('square', 900, t, 0.001, 0.04, 0.03); },
  team() { if (!ok()) return; const t = now(); [0, 4, 7, 11, 14].forEach((s) => tone('sawtooth', 262 * Math.pow(2, s / 12), t, 0.01, 0.04, 0.5)); noise(t, 0.4, 0.12, 'lowpass', 3000, 1, null, 200); },
  regen() { if (!ok()) return; const t = now(); tone('sine', 1320, t, 0.002, 0.02, 0.06); },
};

// --------------------------------------------------------------- music: a tiny step sequencer
const M = { on: false, step: 0, next: 0, fever: false, timer: null };
const BASS = [0, 0, 12, 0, 3, 0, 10, 0, 0, 0, 12, 0, 7, 0, 5, 3];
const CHORDS = [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]];
const LEAD = [12, 15, 19, 15, 22, 19, 15, 12, 10, 12, 15, 17, 19, 17, 15, 10];
function kick(t) { tone('sine', 140, t, 0.002, 0.55, 0.22, musBus, 40); }
function snare(t) { noise(t, 0.12, 0.25, 'bandpass', 1700, 0.9, musBus); tone('triangle', 230, t, 0.002, 0.12, 0.06, musBus, 150); } // a "pf" snare
function hat(t, open) { noise(t, open ? 0.12 : 0.03, open ? 0.08 : 0.06, 'highpass', 8000, 1, musBus); }       // a "ts" hat
function schedule() {
  if (!M.on || !ok()) return;
  const bpm = M.fever ? 136 : 108, sp = 60 / bpm / 4;
  while (M.next < now() + 0.12) {
    const s = M.step % 16, bar = Math.floor(M.step / 16) % 4, t = M.next, root = 55 * Math.pow(2, [0, -4, -2, -5][bar] / 12);
    if (s === 0 || s === 8 || (s === 10 && bar % 2) || (M.fever && s === 6)) kick(t);
    if (s === 4 || s === 12) snare(t);
    if (s % 2 === 0) hat(t, s === 14); else if (M.fever) hat(t, false);
    if (BASS[s] !== undefined && s % 2 === 0) tone('sawtooth', root * 2 * Math.pow(2, BASS[s] / 12), t, 0.005, 0.07, sp * 1.6, musBus);
    if (s === 0) CHORDS[bar].forEach((c) => tone('triangle', root * 8 * Math.pow(2, c / 12), t, 0.08, 0.018, sp * 14, musBus));
    if (M.fever) tone('square', root * 8 * Math.pow(2, LEAD[s] / 12), t, 0.004, 0.022, sp * 0.9, musBus);
    M.step++; M.next += sp;
  }
}
export const Music = {
  start() { if (M.on || !ac) return; M.on = true; M.next = now() + 0.1; M.timer = setInterval(schedule, 40); },
  stop() { M.on = false; clearInterval(M.timer); },
  fever(on) { M.fever = on; },
};
