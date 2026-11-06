// Cell Serpent, batch 13 (agent b): juice for the three "I got something" moments: a hub tab unlocking, a stat purchase and a
// level-up. DOM bursts use the Web Animations API on one fixed, pointer-less layer (no CSS keyframes per particle, no timers
// per particle) and are skipped under reduced motion. Sounds are registered at the end of the sfx table (registerB13b).

const COLS = ['#ffd84d', '#ff9ad6', '#4fd8f0', '#9dff6d', '#ffffff'];
export const reduced = () => { try { if (typeof document === 'undefined') return true; return document.documentElement.classList.contains('rm') || matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };
let layer = null;
function getLayer() {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div'); layer.className = 'jb13-layer'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer); return layer;
}
const centre = el => { if (!el || !el.getBoundingClientRect) return null; const r = el.getBoundingClientRect(); if (r.width < 2 && r.height < 2) return null; return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; };
const anim = (node, frames, opt) => { try { return node.animate(frames, opt); } catch (e) { return null; } };

// A ring shockwave plus sparkles flying out of (x, y). power 1..3 scales count and reach.
export function burstAt(x, y, power = 1, color = '#ffd84d') {
  if (reduced()) return 0;
  const L = getLayer(), n = Math.min(26, 8 + power * 6), made = [];
  const ring = document.createElement('i'); ring.className = 'jb13-ring'; ring.style.cssText = `left:${x}px;top:${y}px;border-color:${color}`; L.appendChild(ring); made.push(ring);
  anim(ring, [{ transform: 'translate(-50%,-50%) scale(.2)', opacity: 0.95 }, { transform: 'translate(-50%,-50%) scale(' + (2.2 + power * 0.6) + ')', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
  for (let i = 0; i < n; i++) {
    const p = document.createElement('i'), a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = 34 + Math.random() * (30 + power * 22), s = 5 + Math.random() * 5;
    p.className = 'jb13-sp'; p.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;background:${i % 2 ? COLS[i % COLS.length] : color}`;
    L.appendChild(p); made.push(p);
    const dx = Math.cos(a) * d, dy = Math.sin(a) * d;
    anim(p, [{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx.toFixed(0)}px),calc(-50% + ${(dy + 16).toFixed(0)}px)) scale(.2)`, opacity: 0 }], { duration: 480 + Math.random() * 320, easing: 'cubic-bezier(.1,.7,.3,1)', delay: Math.random() * 60 });
  }
  setTimeout(() => { for (const m of made) m.remove(); }, 1100);
  return n + 1;
}
// A floating label ("+1", "LEVEL 4", "MAX!") that rises and fades.
export function floatText(x, y, text, color = '#ffd84d') {
  if (reduced()) return null;
  const t = document.createElement('b'); t.className = 'jb13-txt'; t.textContent = text; t.style.cssText = `left:${Math.max(60, Math.min(innerWidth - 60, x))}px;top:${y}px;color:${color}`;
  getLayer().appendChild(t);
  anim(t, [{ transform: 'translate(-50%,-30%) scale(.4)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%,-190%) scale(1)', opacity: 0 }], { duration: 950, easing: 'ease-out' });
  setTimeout(() => t.remove(), 1000); return t;
}
const pop = (el, ms = 420, s = 1.12) => { if (el && !reduced()) anim(el, [{ transform: 'scale(1)' }, { transform: 'scale(' + s + ')', offset: 0.35 }, { transform: 'scale(1)' }], { duration: ms, easing: 'cubic-bezier(.3,1.6,.5,1)' }); };

// ---- a tab opens: the button flashes gold, a banner names what arrived
export function tabUnlockJuice(btn, audio, label) {
  if (audio) audio.play('unlockfan');
  const c = centre(btn); if (!c) return;
  burstAt(c.x, c.y, 3, '#ffd84d'); setTimeout(() => burstAt(c.x, c.y - 6, 2, '#ff9ad6'), 170);
  if (btn && !reduced()) anim(btn, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 700, easing: 'ease-out' });
  if (label) floatText(c.x, c.y - 24, label + ' unlocked!', '#fff3a0');
}
// ---- a stat was bought: the card pops, the new pip flashes, a number floats up. Called after the hub re-rendered.
export function statBuyJuice(root, id, lvl, maxed, audio) {
  const card = root && root.querySelector ? root.querySelector(`.sc[data-id="${id}"]`) : null;
  if (audio) audio.play(maxed ? 'statmax' : 'statbuy', { n: lvl });
  const c = centre(card); if (!c) return;
  if (card && !reduced()) { card.classList.remove('jb13-bought'); void card.offsetWidth; card.classList.add('jb13-bought'); setTimeout(() => card.classList.remove('jb13-bought'), 900); }
  const pips = card ? card.querySelectorAll('.spips i.on') : [], last = pips[pips.length - 1]; if (last) pop(last, 520, 1.9);
  const ic = card && card.querySelector('.sci'), ci = centre(ic) || c;
  burstAt(ci.x, ci.y, maxed ? 3 : 1, maxed ? '#ffd84d' : '#9dff6d');
  floatText(c.x, c.y - c.h * 0.2, maxed ? 'MAX!' : '+1', maxed ? '#ffd84d' : '#b8ff8a');
}
// ---- a level-up on the result screen: the badge pops with a burst and a "LEVEL n" banner
export function levelUpJuice(badge, level, audio) {
  if (audio) audio.play('lvlfan', { n: level });
  const c = centre(badge); if (!c) return;
  pop(badge, 700, 1.5); burstAt(c.x, c.y, 3, '#ffd84d'); setTimeout(() => burstAt(c.x, c.y, 2, '#4fd8f0'), 200);
  floatText(c.x + 40, c.y - 8, 'LEVEL ' + level + '!', '#fff3a0');
}

// ---- sounds
export function registerB13b(sfx, tone, noise, duck, gate) {
  // a tab opens: sub thump, a bright rising arpeggio with a shimmer tail
  sfx.unlockfan = () => {
    if (!gate('unlockfan', 400)) return;
    tone(90, 0.22, 'sine', 0.12, -40); noise(0.18, 0.04, 600, 4000, 'bandpass');
    [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, 'triangle', 0.07, 0, 0.06 + i * 0.06));
    tone(2093, 0.5, 'sine', 0.035, 0, 0.36); tone(2637, 0.45, 'sine', 0.025, 0, 0.42); duck(0.3, 0.45);
  };
  // a stat bought: a coin ding whose pitch climbs a pentatonic ladder with the new level, plus a soft thud
  const LADDER = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  sfx.statbuy = e => {
    if (!gate('statbuy', 90)) return;
    const k = LADDER[Math.max(0, Math.min(LADDER.length - 1, ((e && e.n) | 0) - 1))] || 0, f = 587 * Math.pow(2, k / 12);
    tone(110, 0.09, 'sine', 0.08, -30); tone(f, 0.14, 'square', 0.05); tone(f * 2, 0.22, 'sine', 0.05, 0, 0.07); tone(f * 3, 0.16, 'sine', 0.02, 0, 0.1);
  };
  // the last level of a stat: a short fanfare
  sfx.statmax = () => {
    if (!gate('statmax', 300)) return;
    tone(98, 0.3, 'sine', 0.12, -40); [659, 880, 1109, 1318, 1760].forEach((f, i) => tone(f, 0.2, 'square', 0.06, 0, i * 0.065)); tone(2217, 0.5, 'sine', 0.04, 0, 0.34); duck(0.3, 0.4);
  };
  // a level-up: a four-note lift that rises a little with the level
  sfx.lvlfan = e => {
    if (!gate('lvlfan', 500)) return;
    const up = Math.min(7, Math.max(0, (((e && e.n) | 0) - 1) % 8)), m = Math.pow(2, up / 12);
    tone(131 * m, 0.4, 'sawtooth', 0.05, 0); [392, 494, 587, 784].forEach((f, i) => tone(f * m, 0.22, 'square', 0.07, 0, i * 0.08));
    tone(1568 * m, 0.5, 'sine', 0.05, 0, 0.34); noise(0.3, 0.03, 3000, 8000, 'highpass', 0.3); duck(0.35, 0.5);
  };
}
