// Batch 9 background life: species coloured stage lamps that sweep the sky when a stage starts, and a per-world
// creature that crosses the sky now and then (butterflies, bees, a bat, birds, sleepy Zs). Baked beams, filled paths,
// no gradients per frame, no allocation per frame.
import { W, LINE_Y } from './sim.js';

const TAU = Math.PI * 2;
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

export const INTRO_T = 2.6;   // seconds of run time the lamps sweep for
export const FLYER = { love: 'butterfly', piggy: 'butterfly', sneezy: 'butterfly', sour: 'bee', gloomy: 'bat', rust: 'bird', mighty: 'bird', sleepy: 'zzz', disco: 'moth', grumpy: 'duck', frosty: 'penguin' };   // batch 10: moth, duck, penguin
export const flyerFor = skin => FLYER[skin] || '';

export function makeB9() {
  const r = rnd(909), fl = [];
  for (let i = 0; i < 2; i++) fl.push({ x: -99, y: 400, vx: 100, t0: -99, next: 1.5 + i * 3.5 + r() * 2, p: r() * TAU, dir: 1, dur: 6, big: 1 });
  return { r, fl, skin: '', lamps: null, lampSkin: '' };
}

// 0..1 strength of the lamp sweep at run time gt (a swell in, a swell out); 0 outside the intro
export function introLevel(gt) { return gt === undefined || gt < 0 || gt >= INTRO_T ? 0 : Math.sin(gt / INTRO_T * Math.PI); }
// where a lamp points: angle in radians (up is -PI/2). Both lamps lean outward, swing across and meet over the duo.
export function lampAngle(side, gt) {
  const u = Math.min(1, Math.max(0, gt / INTRO_T)), e = u * u * (3 - 2 * u), dir = side ? -1 : 1;   // side 0 = left lamp
  return -Math.PI / 2 + dir * (-0.55 + 1.1 * e) + dir * Math.sin(u * TAU) * 0.12;
}

function lampPaint(b, col) {
  const g = b.createLinearGradient(0, -400, 0, 400); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,.1)');
  b.fillStyle = g; b.beginPath(); b.moveTo(-8, -400); b.lineTo(8, -400); b.lineTo(58, 400); b.lineTo(-58, 400); b.closePath(); b.fill();
  b.globalCompositeOperation = 'source-atop'; b.fillStyle = col; b.fillRect(-70, -400, 140, 800);
}
function glowPaint(b, col) {
  const g = b.createRadialGradient(0, 0, 2, 0, 0, 60); g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  b.fillStyle = g; b.beginPath(); b.arc(0, 0, 60, 0, TAU); b.fill();
  b.globalCompositeOperation = 'source-atop'; b.fillStyle = col; b.fillRect(-60, -60, 120, 120);
}

export function drawLamps(c, kit, b9, skin, th, gt, low) {
  const lv = introLevel(gt); if (lv <= 0.01 || !kit) return;
  let sp = b9.lamps;
  if (!sp || b9.lampSkin !== skin) {
    sp = [kit.bake(`b9lamp|${skin}|0`, 140, 800, bb => lampPaint(bb, th.lite), 1), kit.bake(`b9lamp|${skin}|1`, 140, 800, bb => lampPaint(bb, th.base), 1), kit.bake(`b9lampglow|${skin}`, 120, 120, bb => glowPaint(bb, th.lite), 1)];
    if (!sp[0] || !sp[1] || !sp[2]) return;
    b9.lamps = sp; b9.lampSkin = skin;
  }
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 2; i++) {
    const ax = i ? W - 40 : 40, ay = LINE_Y - 10, ang = lampAngle(i, gt) - Math.PI / 2;
    c.save(); c.translate(ax, ay); c.rotate(ang); c.globalAlpha = 0.34 * lv; c.drawImage(sp[i].c, -80, 0, 160, 1000); c.restore();
    if (!low) { c.globalAlpha = 0.6 * lv; c.drawImage(sp[2].c, ax - 34, ay - 34, 68, 68); }
  }
  c.restore();
}

// ---- the creature
function launch(b9, f, skin) {
  const r = b9.r, kind = FLYER[skin];
  f.dir = r() < 0.5 ? -1 : 1; f.p = r() * TAU;
  f.big = kind === 'zzz' ? 1 : 0.8 + r() * 0.5;
  f.vx = kind === 'penguin' ? 60 + r() * 25 : kind === 'duck' ? 110 + r() * 40 : kind === 'bat' ? 150 + r() * 60 : kind === 'bird' ? 120 + r() * 60 : kind === 'zzz' ? 0 : 70 + r() * 40;
  f.x = kind === 'zzz' ? 90 + r() * (W - 180) : f.dir > 0 ? -50 : W + 50;
  f.y = kind === 'zzz' ? 560 + r() * 160 : kind === 'penguin' ? LINE_Y + 40 + r() * 50 : 330 + r() * 330;
  f.dur = kind === 'zzz' ? 4.2 : (W + 100) / f.vx;
}
export function stepFlyers(b9, t, skin) {
  const kind = FLYER[skin]; if (!kind) { b9.skin = skin; return; }
  for (let i = 0; i < b9.fl.length; i++) {
    const f = b9.fl[i];
    if (b9.skin !== skin) { f.t0 = -99; f.next = t + 1.5 + i * 3 + b9.r() * 2; }
    if (f.t0 < 0 && t >= f.next && (i === 0 || kind === 'butterfly')) { launch(b9, f, skin); f.t0 = t; }
    else if (f.t0 >= 0 && t - f.t0 > f.dur) { f.t0 = -99; f.next = t + (kind === 'zzz' ? 2 : 5) + b9.r() * 7; }
  }
  b9.skin = skin;
}

export function drawFlyers(c, b9, skin, th, t) {
  const kind = FLYER[skin]; if (!kind) return;
  c.save();
  for (let i = 0; i < b9.fl.length; i++) {
    const f = b9.fl[i]; if (f.t0 < 0) continue;
    const u = t - f.t0, k = u / f.dur, fade = Math.min(1, k * 8, (1 - k) * 8); if (fade <= 0) continue;
    if (kind === 'zzz') {   // three Zs rise from a dreamer and grow
      c.fillStyle = th.lite; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let j = 0; j < 3; j++) {
        const q = ((u * 0.55 + j / 3) % 1), sz = 16 + q * 26;
        c.globalAlpha = Math.min(1, q * 5, (1 - q) * 1.6) * 0.8 * fade; c.font = `bold ${sz | 0}px system-ui,sans-serif`;
        c.fillText('z', f.x + Math.sin(q * 5 + f.p) * 14 + q * 40, f.y - q * 150);
      }
      continue;
    }
    const x = f.x + f.dir * f.vx * u, bob = Math.sin(u * (kind === 'bee' ? 5 : 2.2) + f.p), y = f.y + (kind === 'penguin' ? Math.abs(Math.sin(u * 3 + f.p)) * -5 : bob * (kind === 'bee' ? 26 : 38)) + (kind === 'bee' ? Math.sin(u * 13 + f.p) * 5 : 0);
    const flap = Math.sin(u * (kind === 'bat' ? 16 : kind === 'bird' ? 9 : kind === 'bee' ? 60 : kind === 'moth' ? 13 : kind === 'duck' ? 8 : kind === 'penguin' ? 7 : 10) + f.p), s = f.big;
    c.globalAlpha = 0.92 * fade; c.save(); c.translate(x, y); c.scale(f.dir * s, s);
    drawKind(c, kind, flap, i, skin, th);
    c.restore();
  }
  c.restore();
}

// one creature at the origin facing +x (the caller translates and scales). alt picks the second colour of a pair.
export function drawKind(c, kind, flap, alt, skin, th) {
  if (kind === 'butterfly') {
    const w = 0.35 + 0.65 * Math.abs(flap);
    c.fillStyle = alt ? th.base : th.lite;
    c.beginPath(); c.ellipse(-8 * w, -5, 10 * w, 8, -0.4, 0, TAU); c.ellipse(8 * w, -5, 10 * w, 8, 0.4, 0, TAU); c.fill();
    c.fillStyle = '#ffe9f2'; c.beginPath(); c.ellipse(-6 * w, 5, 7 * w, 6, 0.4, 0, TAU); c.ellipse(6 * w, 5, 7 * w, 6, -0.4, 0, TAU); c.fill();
    c.fillStyle = '#2a1030'; c.fillRect(-1.6, -9, 3.2, 20);
  } else if (kind === 'bee') {
    c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(-3, -8 - Math.abs(flap) * 3, 6, 4, -0.5, 0, TAU); c.ellipse(4, -8 - Math.abs(flap) * 3, 6, 4, 0.5, 0, TAU); c.fill();
    c.fillStyle = '#ffd23a'; c.beginPath(); c.ellipse(0, 0, 12, 8, 0, 0, TAU); c.fill();
    c.fillStyle = '#2a1a10'; c.fillRect(-4, -7.5, 3, 15); c.fillRect(3, -6.5, 3, 13);
    c.beginPath(); c.arc(11, 0, 4.5, 0, TAU); c.fill();
  } else if (kind === 'bat') {
    const w = flap * 14;
    c.fillStyle = '#1a0f33'; c.beginPath(); c.ellipse(0, 0, 6, 8, 0, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(4, -2); c.quadraticCurveTo(16, -18 - w, 34, -6 - w * 1.4); c.quadraticCurveTo(24, -4, 22, 4); c.quadraticCurveTo(14, 0, 4, 6); c.closePath();
    c.moveTo(-4, -2); c.quadraticCurveTo(-16, -18 - w, -34, -6 - w * 1.4); c.quadraticCurveTo(-24, -4, -22, 4); c.quadraticCurveTo(-14, 0, -4, 6); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(-5, -6); c.lineTo(-3, -13); c.lineTo(0, -7); c.lineTo(3, -13); c.lineTo(5, -6); c.closePath(); c.fill();
    c.fillStyle = '#9dff9d'; c.fillRect(-3.5, -3, 2, 2); c.fillRect(1.5, -3, 2, 2);
  } else if (kind === 'moth') {   // a neon moth: soft glowing wings
    const w = 0.4 + 0.6 * Math.abs(flap);
    c.fillStyle = alt ? '#ff8fe0' : '#7dfcff'; c.beginPath(); c.ellipse(-9 * w, -4, 11 * w, 9, -0.5, 0, TAU); c.ellipse(9 * w, -4, 11 * w, 9, 0.5, 0, TAU); c.fill();
    c.fillStyle = '#fff6ff'; c.beginPath(); c.ellipse(-6 * w, 5, 7 * w, 5, 0.5, 0, TAU); c.ellipse(6 * w, 5, 7 * w, 5, -0.5, 0, TAU); c.fill();
    c.fillStyle = '#26143c'; c.beginPath(); c.ellipse(0, 1, 2.6, 9, 0, 0, TAU); c.fill();
    c.strokeStyle = '#26143c'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-1, -8); c.lineTo(-5, -15); c.moveTo(1, -8); c.lineTo(5, -15); c.stroke();
  } else if (kind === 'duck') {   // a little duck, flapping, bill forward
    const w = flap * 9;
    c.fillStyle = '#fff4b8'; c.beginPath(); c.ellipse(0, 0, 14, 8.5, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(12, -6, 6.5, 0, TAU); c.fill();
    c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(17, -7); c.lineTo(25, -5); c.lineTo(17, -3); c.closePath(); c.fill();
    c.fillStyle = '#e8d27a'; c.beginPath(); c.moveTo(-4, -2); c.quadraticCurveTo(-12, -16 - w, -22, -10 - w); c.quadraticCurveTo(-14, -3, -4, 3); c.closePath(); c.fill();
    c.fillStyle = '#2a1a10'; c.fillRect(13, -9, 2.4, 2.4);
  } else if (kind === 'penguin') {   // slides along the ground on its belly, flippers out
    const w = flap * 3;
    c.fillStyle = '#1b2438'; c.beginPath(); c.ellipse(0, 0, 18, 8, 0, 0, TAU); c.arc(14, -4, 6.5, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-6, 2); c.lineTo(-10 - w, 14); c.lineTo(0, 6); c.closePath(); c.fill();
    c.fillStyle = '#f4fbff'; c.beginPath(); c.ellipse(1, 3.5, 14, 4.6, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(16, -3, 3.6, 0, TAU); c.fill();
    c.fillStyle = '#ff9a3a'; c.beginPath(); c.moveTo(19, -5); c.lineTo(26, -3); c.lineTo(19, -1.5); c.closePath(); c.fill(); c.fillRect(-19 - w, 4, 5, 3);
    c.fillStyle = '#111'; c.fillRect(15, -8, 2.2, 2.2);
  } else {   // bird: two curved strokes that flap, a dot for the body
    const w = flap * 11;
    c.strokeStyle = skin === 'mighty' ? '#1e2438' : '#3a1a24'; c.lineWidth = 3.4; c.lineCap = 'round'; c.beginPath();
    c.moveTo(-22, -w * 0.4 + 2); c.quadraticCurveTo(-11, -12 - w, 0, 0); c.quadraticCurveTo(11, -12 - w, 22, -w * 0.4 + 2); c.stroke();
    c.fillStyle = c.strokeStyle; c.beginPath(); c.ellipse(0, 1, 4.5, 3.4, 0, 0, TAU); c.fill();
  }
}
