'use strict';
// Encore Island — effect spawners (floating numbers, sparks, rings, flying loot). Purely visual; they only use the visual RNG stream.
const sfx = (k, imp, pitch) => { if (typeof AUDIO !== 'undefined' && AUDIO.sfx) AUDIO.sfx(k, pitch || 1); };
function buzz(ms) { try { if (S.settings.haptics !== false && navigator.vibrate) navigator.vibrate(ms); } catch (e) { /* no vibration API */ } }
function float(x, y, txt, color, big, crit) {
  S.floats.push({ x, y, txt: String(txt), color, t: 0, big, crit });
  if (S.floats.length > 60) S.floats.shift();
}
function puff(x, y, color, n, up) {
  for (let i = 0; i < n; i++) S.parts.push({ x, y, vx: (vrnd() - 0.5) * 200, vy: (vrnd() - (up ? 0.85 : 0.5)) * 220, t: 0, dur: 0.45 + vrnd() * 0.2, r: 2 + vrnd() * 3, color, g: up ? 1 : 0 });
  if (S.parts.length > 500) S.parts.splice(0, S.parts.length - 500);
}
function ringFx(x, y, r, col, dur) { S.fx.push({ kind: 'ring', x, y, r, t: 0, dur: dur || 0.35, col: col || '#fff4c0' }); }
function starBurst(x, y, n, cols, spd) {
  for (let i = 0; i < n; i++) { const a = vrnd() * TAU, v = (0.4 + vrnd() * 0.6) * (spd || 220); S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, dur: 0.5 + vrnd() * 0.35, r: 4 + vrnd() * 4, color: cols[i % cols.length], g: 1, star: true }); }
}
function flyTo(kind, x0, y0, x1, y1, o) {
  if (S.fly.length > 150) return;
  S.fly.push(Object.assign({ kind, x0, y0, x1, y1, t: 0, delay: 0, dur: 0.4, arc: 36 + vrnd() * 44, spin: (vrnd() - 0.5) * 16 }, o || {}));
}
const PENTA = [1, 1.125, 1.25, 1.5, 1.667, 2, 2.25, 2.5];
const JUICE = { w: null, pulse: 0, flash: 0, t: 0, chain: 0, chainT: -9, prevWallet: 0, shake: 0, hitStop: 0 };
function chainPitch() { // rising pentatonic scale while you keep collecting or selling
  if (S.t - JUICE.chainT > 0.6) JUICE.chain = 0; else JUICE.chain++;
  JUICE.chainT = S.t; return PENTA[JUICE.chain % PENTA.length] * (1 + Math.floor(JUICE.chain / PENTA.length) * 0.5);
}
function shake(n) { JUICE.shake = Math.max(JUICE.shake, n); }
