// Battle Call: the juice. Synthesised sounds (no audio files), floating reactions, levels and badges.
// Levels and badges are derived from the counters the server already keeps, so they can never drift from the Loops.
import { S } from './state.js';
import { callStats } from './share.js';

/* ------------------------------------------------------------ sound */
let ctx = null, on = false;
try { on = localStorage.getItem('bc.sound') === '1'; } catch (_) { /* */ }
export const soundOn = () => on;
export function setSound(v) {
  on = !!v;
  try { localStorage.setItem('bc.sound', on ? '1' : '0'); } catch (_) { /* */ }
  if (on) { audio(); sound('pop'); }
}
function audio() {
  if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; ctx = new AC(); }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
/** One note: frequency, start offset, length, wave, volume. */
function note(c, f, at, len, type = 'sine', vol = 0.18, to = 0) {
  const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + len);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + len + 0.05);
}
const SOUNDS = {
  tick: (c) => note(c, 880, 0, 0.09, 'square', 0.07),
  pop: (c) => note(c, 520, 0, 0.12, 'sine', 0.2, 900),
  go: (c) => { note(c, 392, 0, 0.14, 'triangle'); note(c, 523, 0.12, 0.14, 'triangle'); note(c, 784, 0.24, 0.3, 'triangle'); },
  hands: (c) => { note(c, 110, 0, 0.35, 'sawtooth', 0.2, 55); note(c, 220, 0, 0.2, 'square', 0.08); },
  win: (c) => [523, 659, 784, 1047].forEach((f, i) => note(c, f, i * 0.09, 0.22, 'triangle', 0.2)),
  lose: (c) => { note(c, 330, 0, 0.18, 'triangle', 0.14); note(c, 247, 0.16, 0.3, 'triangle', 0.14); },
  level: (c) => [392, 523, 659, 784, 1047].forEach((f, i) => note(c, f, i * 0.07, 0.25, 'square', 0.1)),
  fanfare: (c) => { [523, 523, 523, 659, 784].forEach((f, i) => note(c, f, i * 0.16, 0.3, 'sawtooth', 0.12)); note(c, 1047, 0.9, 0.7, 'square', 0.1); },
  rx: (c) => note(c, 700 + Math.random() * 300, 0, 0.07, 'sine', 0.06, 1200),
};
export function sound(kind) {
  if (!on) return;
  const c = audio();
  if (c && SOUNDS[kind]) { try { SOUNDS[kind](c); } catch (_) { /* */ } }
}

/* ------------------------------------------------------------ reactions */
export const REACTIONS = [['fire', '\u{1F525}'], ['clap', '\u{1F44F}'], ['hands', '\u{1F64C}'], ['mind', '\u{1F92F}'], ['bass', '\u{1F50A}']];
const EMO = Object.fromEntries(REACTIONS);

/** Float a burst of reaction emojis up the screen. `c` is {kind: count}. */
export function floatReactions(c, big = false) {
  let layer = document.getElementById('rxlayer');
  if (!layer) { layer = document.createElement('div'); layer.id = 'rxlayer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); }
  let made = 0;
  for (const [k, n] of Object.entries(c || {})) {
    for (let i = 0; i < Math.min(n, 10) && made < 40; i++, made++) {
      const el = document.createElement('i');
      el.textContent = EMO[k] || '✨';
      el.style.left = (6 + Math.random() * 88) + '%';
      el.style.fontSize = (big ? 44 + Math.random() * 36 : 26 + Math.random() * 18) + 'px';
      el.style.animationDuration = (2.2 + Math.random() * 1.6) + 's';
      el.style.animationDelay = (Math.random() * 0.4) + 's';
      el.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
      layer.appendChild(el);
      setTimeout(() => el.remove(), 4500);
    }
  }
  if (made) sound('rx');
}

/* ------------------------------------------------------------ levels and badges */
const LEVELS = ['Rookie', 'Regular', 'Crowd favourite', 'Hype man', 'Scout', 'Judge', 'Legend'];
export function levelOf(me) {
  const st = me.st || {};
  const xp = (st.votes || 0) * 10 + (st.sync || 0) * 15 + (st.hits || 0) * 30 + (st.won || 0) * 40 + (st.bets || 0) * 5 + (st.streakBonus || 0) * 2 + (me.top && me.top.length ? 20 : 0);
  const lvl = Math.floor(Math.sqrt(xp / 40)) + 1;
  const base = 40 * (lvl - 1) ** 2, next = 40 * lvl ** 2;
  return { xp, lvl, title: LEVELS[Math.min(LEVELS.length - 1, lvl - 1)], pct: Math.round(((xp - base) / (next - base)) * 100), toNext: next - xp };
}

export function badgesOf(me) {
  const st = me.st || {}, { hit } = callStats();
  return [
    ['first', 'First vote', '\u{1F5F3}️', (st.votes || 0) >= 1],
    ['ear', "Crowd's ear", '\u{1F442}', (st.sync || 0) >= 3],
    ['hot', 'Hot streak', '\u{1F525}', (st.streakBonus || 0) > 0 || (me.streak || 0) >= 3],
    ['oracle', 'Oracle', '\u{1F52E}', hit >= 3],
    ['winner', 'Bet winner', '\u{1F4B0}', (st.won || 0) >= 1],
    ['roller', 'High roller', '\u{1F3B2}', (st.bets || 0) >= 5],
    ['regular', 'Never misses', '\u{1F3AF}', (st.votes || 0) >= 6],
  ].map(([id, name, icon, got]) => ({ id, name, icon, got }));
}
