// Procedural cozy sound: a soft pentatonic pluck loop, day birds and night crickets. No audio files.
let ac = null, master = null, on = false, timer = null, night = 0, rain = 0;
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];            // major pentatonic over two octaves
const BASE = 220;
export const audioOn = () => on;
function ensure() {
  if (ac) return true;
  try { ac = new (window.AudioContext || window.webkitAudioContext)(); master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination); return true; } catch { return false; }
}
function pluck(freq, vol = 0.05, dur = 1.6, type = 'sine') {
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
  o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function chirp() {
  const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine';
  const f = 2400 + Math.random() * 1400; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 1.35, t + 0.07); o.frequency.exponentialRampToValueAtTime(f * 0.9, t + 0.14);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.025, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16); o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
}
function cricket() { const t = ac.currentTime; for (let i = 0; i < 3; i++) { const o = ac.createOscillator(), g = ac.createGain(); o.type = 'square'; o.frequency.value = 4300; g.gain.setValueAtTime(0.0001, t + i * 0.08); g.gain.exponentialRampToValueAtTime(0.006, t + i * 0.08 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.05); o.connect(g).connect(master); o.start(t + i * 0.08); o.stop(t + i * 0.08 + 0.07); } }
let step = 0, last = 0;
function beat() {
  if (!on || !ac) return; step++;
  if (step % 2 === 0 && Math.random() < 0.55) { const n = SCALE[Math.floor(Math.random() * SCALE.length)]; pluck(BASE * Math.pow(2, n / 12), 0.045, 2.2); if (Math.random() < 0.3) setTimeout(() => on && pluck(BASE * Math.pow(2, (n + 7) / 12), 0.025, 2.5), 350); }
  if (step % 8 === 0) { const root = [0, 5, 7, 4][Math.floor(step / 8) % 4]; pluck(BASE / 2 * Math.pow(2, root / 12), 0.05, 3.5, 'triangle'); }
  if (night < 0.5 && Math.random() < 0.12 && rain < 0.5) chirp(); if (night > 0.5 && Math.random() < 0.2) cricket();
}
export function setAmbient(nightAmt, rainAmt) { night = nightAmt; rain = rainAmt; }
export function toggleAudio(force) {
  const want = force === undefined ? !on : force;
  if (want) { if (!ensure()) return false; if (ac.state === 'suspended') ac.resume(); on = true; if (!timer) timer = setInterval(beat, 700); }
  else { on = false; }
  try { localStorage.setItem('hearthvale.music', on ? '1' : '0'); } catch {}
  return on;
}
export function wantsMusic() { try { return localStorage.getItem('hearthvale.music') !== '0'; } catch { return true; } }
