// Floor life under the duo (batch 6): a beat-lit tile floor with sweeping spotlights on the disco and love stages,
// puddle ripples in the rain, ice glints on the frozen floors, falling rain streaks, and the boss floor crack that
// spreads while phase 2 builds. Everything is a few batched paths or baked sprites; nothing allocates per frame.
import { W, H, LINE_Y } from './sim.js';

const TAU = Math.PI * 2;
const FY0 = LINE_Y + 34, FY1 = H - 78, FH = FY1 - FY0;   // the visible boards: between the footlight rail and the crowd
const ROWS = 4, COLS = 14;

export const FLOOR_KINDS = { disco: 'tiles', love: 'hearts', piggy: 'hearts', grumpy: 'puddles', frosty: 'ice', mighty: 'ice' };
export const floorKind = skin => FLOOR_KINDS[skin] || '';

// the same tempo family as bg_world.beatPulse, but the whole number of the beat so the tiles can roll their colours
export function beatIndex(t, stage, boss) {
  const bpm = boss ? 138 : 104 + (Math.floor(Math.max(0, stage - 1) / 5) % 6) * 3;
  return Math.floor(t * bpm / 60);
}
// tile corner x at a floor row (row edge 0..ROWS): the boards widen a little towards the front
function tx(i, e) { return W / 2 + (i - COLS / 2) * (50 + 14 * e / ROWS); }
function ty(e) { return FY0 + FH * Math.pow(e / ROWS, 1.25); }

const TILE = ['rgb(60,230,255)', 'rgb(255,90,200)', 'rgb(255,225,120)'];
const HEART = ['rgb(255,110,170)', 'rgb(255,190,215)', 'rgb(255,70,120)'];

function quadPath(c, r, i, ins) {
  const y0 = ty(r) + ins, y1 = ty(r + 1) - ins, a = tx(i, r) + ins, b = tx(i + 1, r) - ins, d = tx(i, r + 1) + ins, e = tx(i + 1, r + 1) - ins;
  c.moveTo(a, y0); c.lineTo(b, y0); c.lineTo(e, y1); c.lineTo(d, y1); c.closePath();
}
function heartPath(c, x, y, s) {
  c.moveTo(x, y + s * 0.9); c.bezierCurveTo(x - s * 1.5, y - s * 0.1, x - s * 0.7, y - s * 1.0, x, y - s * 0.35);
  c.bezierCurveTo(x + s * 0.7, y - s * 1.0, x + s * 1.5, y - s * 0.1, x, y + s * 0.9); c.closePath();
}

function spot(kit, key, rgb) {
  return kit && kit.bake('floorspot|' + key, 300, 120, b => {
    const g = b.createRadialGradient(0, 0, 4, 0, 0, 150); g.addColorStop(0, `rgba(${rgb},.9)`); g.addColorStop(0.45, `rgba(${rgb},.32)`); g.addColorStop(1, `rgba(${rgb},0)`);
    b.save(); b.scale(1, 0.4); b.fillStyle = g; b.beginPath(); b.arc(0, 0, 150, 0, TAU); b.fill(); b.restore();
  }, 1);
}
function glint(kit) {
  return kit && kit.bake('floorglint', 40, 40, b => {
    b.fillStyle = 'rgba(255,255,255,1)'; b.beginPath();
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8, r = i & 1 ? 3.2 : 18; b.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    b.closePath(); b.fill();
    const g = b.createRadialGradient(0, 0, 0, 0, 0, 12); g.addColorStop(0, 'rgba(190,240,255,.8)'); g.addColorStop(1, 'rgba(190,240,255,0)'); b.fillStyle = g; b.beginPath(); b.arc(0, 0, 12, 0, TAU); b.fill();
  }, 1);
}

// puddles and glints sit at fixed spots on the boards
const PUD = [[110, 0.30, 88], [300, 0.74, 70], [470, 0.22, 100], [610, 0.62, 76], [210, 0.9, 84]];
const GL = [[70, 0.2], [170, 0.7], [260, 0.35], [350, 0.85], [440, 0.15], [520, 0.6], [600, 0.9], [650, 0.3], [390, 0.5], [120, 0.55]];

// o: { kit, skin, stage, boss, t, pulse, reduce, low }
export function drawFloorFx(c, o) {
  const kind = floorKind(o.skin);
  if (!kind || o.reduce) return;
  const { t, pulse, kit, low } = o;
  c.save();
  c.beginPath(); c.rect(0, FY0 - 4, W, FH + 4); c.clip();
  if (kind === 'tiles' || kind === 'hearts') {
    const bi = beatIndex(t, o.stage, o.boss), cols = kind === 'tiles' ? TILE : HEART;
    c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 3; k++) {   // one path and one alpha per colour; the colours roll one step on every beat
      c.fillStyle = cols[k]; c.globalAlpha = k === bi % 3 ? 0.1 + pulse * 0.3 : 0.035 + pulse * 0.06;
      c.beginPath();
      for (let r = 0; r < ROWS; r++) for (let i = 0; i < COLS; i++) if (((r * 2 + i + bi) % 3 + 3) % 3 === k) { if (kind === 'tiles') quadPath(c, r, i, 2); else { const e = r + 0.5; heartPath(c, (tx(i, e) + tx(i + 1, e)) / 2, (ty(r) + ty(r + 1)) / 2, 9 + r * 2.4); } }
      c.fill();
    }
    if (kind === 'tiles') { c.globalAlpha = 0.07 + pulse * 0.07; c.strokeStyle = 'rgb(200,245,255)'; c.lineWidth = 1.5; c.beginPath(); for (let r = 0; r < ROWS; r++) for (let i = 0; i < COLS; i += 1) if ((r + i) % 2 === 0) quadPath(c, r, i, 1); c.stroke(); }
    // two spotlights sweep across the boards in opposite directions, flaring on the kick
    const a = spot(kit, kind === 'tiles' ? 'cyan' : 'rose', kind === 'tiles' ? '120,235,255' : '255,130,190'), b = spot(kit, kind === 'tiles' ? 'pink' : 'gold', kind === 'tiles' ? '255,110,210' : '255,220,150');
    const sw = t * 0.8, n = low ? 1 : 2;
    for (let s = 0; s < n; s++) {
      const spr = s ? b : a; if (!spr) continue;
      const x = W / 2 + Math.sin(sw * (s ? -1.13 : 1) + s * 2) * 290, y = FY0 + FH * (0.45 + 0.2 * Math.sin(sw * 1.7 + s)), k = 1 + pulse * 0.18;
      c.globalAlpha = 0.5 + pulse * 0.4; c.drawImage(spr.c, x - 150 * k, y - 60 * k, 300 * k, 120 * k);
    }
  } else if (kind === 'puddles') {
    c.fillStyle = 'rgb(150,200,255)'; c.strokeStyle = 'rgb(225,240,255)'; c.lineWidth = 2.6;
    const n = low ? 3 : PUD.length;
    for (let p = 0; p < n; p++) {
      const [x, u, w] = PUD[p], y = FY0 + 10 + (FH - 30) * u, h = w * 0.2;
      c.globalAlpha = 0.26; c.beginPath(); c.ellipse(x, y, w / 2, h / 2, 0, 0, TAU); c.fill();
      c.globalAlpha = 0.3; c.beginPath(); c.ellipse(x - w * 0.12, y - h * 0.1, w * 0.28, h * 0.2, 0, 0, TAU); c.fill();
      for (let k = 0; k < 2; k++) {   // a drop lands about every second: two rings expand and fade
        const q = (t * 0.9 + p * 0.37 + k * 0.5) % 1, rr = w * 0.45 * q;
        c.globalAlpha = 0.95 * (1 - q) * (1 - q); c.beginPath(); c.ellipse(x + Math.sin(p * 5 + Math.floor(t * 0.9 + p * 0.37 + k * 0.5) * 2.1) * w * 0.12, y, rr, rr * 0.24, 0, 0, TAU); c.stroke();
      }
    }
  } else if (kind === 'ice') {
    const gl = glint(kit), n = low ? 5 : GL.length;
    if (gl) {
      c.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {   // each glint blinks on its own clock: a sharp quick flash, then dark
        const [x, u] = GL[i], ph = (t * 0.55 + i * 0.173) % 1, f = ph < 0.22 ? Math.sin(ph / 0.22 * Math.PI) : 0;
        if (f < 0.02) continue;
        const s = 10 + f * 22; c.globalAlpha = f * (0.85 + pulse * 0.15); c.drawImage(gl.c, x - s / 2, FY0 + (FH - 12) * u - s / 2, s, s);
      }
    }
    // a slow sheen band slides over the ice
    const sx = ((t * 55) % (W + 400)) - 200; c.globalAlpha = 0.07 + pulse * 0.04; c.fillStyle = 'rgb(220,245,255)';
    c.beginPath(); c.moveTo(sx, FY0); c.lineTo(sx + 46, FY0); c.lineTo(sx - 30, FY1); c.lineTo(sx - 76, FY1); c.closePath(); c.fill();
  }
  c.restore();
}

// rain in front of the world on grumpy stages: slanted streaks at three depths, one stroke per depth
export function drawRain(c, t, o) {
  if (o.skin !== 'grumpy' || o.reduce) return;
  c.save(); c.lineCap = 'round'; c.strokeStyle = 'rgb(200,228,255)';
  const per = o.low ? 8 : 16;
  for (let z = 0; z < 3; z++) {
    const sp = 520 + z * 260, len = 18 + z * 12, wd = 1.2 + z * 0.7, sl = 0.22;
    c.globalAlpha = 0.18 + z * 0.1; c.lineWidth = wd; c.beginPath();
    for (let i = 0; i < per; i++) {
      const sd = i * 97 + z * 31, span = LINE_Y + 80, y = ((sd * 53 % 1000) / 1000 * span + t * sp) % span - 40, x = (((sd * 131) % 1000) / 1000 * (W + 120) - y * sl + (W + 120) * 4) % (W + 120) - 30;
      c.moveTo(x, y); c.lineTo(x - len * sl, y + len);
    }
    c.stroke();
  }
  c.restore();
}

// boss floor crack: forks baked once, then revealed downwards from the rail as phase 2 builds (ph 0..1)
export function drawBossCracks(c, kit, t, ph, pulse) {
  if (!kit || ph <= 0.01) return;
  const fh = H - LINE_Y;
  const cr = kit.bake('bosscracks2', W, fh, b => {
    let s = 41; const r = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    b.translate(-W / 2, -fh / 2); b.lineCap = 'round'; b.lineJoin = 'round';
    const lines = [];
    for (let i = 0; i < 10; i++) {
      let x = 36 + i * 72 + r() * 30, y = 18; const pts = [[x, y]];
      while (y < fh - 6) { y += 12 + r() * 16; x += (r() - 0.5) * 40; pts.push([x, y]); if (r() < 0.3 && y < fh - 40) { const f = [[x, y]]; let fx = x, fy = y; for (let k = 0; k < 3; k++) { fy += 8 + r() * 10; fx += (r() < 0.5 ? -1 : 1) * (10 + r() * 14); f.push([fx, fy]); } lines.push(f); } }
      lines.push(pts);
    }
    for (const [lw, col] of [[10, 'rgba(255,60,30,.22)'], [3.4, 'rgba(255,160,60,.95)'], [1.2, 'rgba(255,248,210,1)']]) {
      b.lineWidth = lw; b.strokeStyle = col;
      for (const pts of lines) { b.beginPath(); pts.forEach(([px, py], j) => j ? b.lineTo(px, py) : b.moveTo(px, py)); b.stroke(); }
    }
  }, 1);
  if (!cr) return;
  // the crack runs down from the rail: only the top part of the sprite shows, a hot tip leads it
  const e = 1 - Math.pow(1 - Math.min(1, ph), 2), vis = Math.max(4, fh * e);
  c.save(); c.globalCompositeOperation = 'lighter';
  c.globalAlpha = Math.min(1, ph * 1.4) * (0.35 + pulse * 0.55);
  c.drawImage(cr.c, 0, 0, W, vis, 0, LINE_Y, W, vis);
  if (e < 0.98) { c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 20); c.fillStyle = 'rgb(255,200,120)'; c.fillRect(0, LINE_Y + vis - 2, W, 3); }
  // heat glow from under the boards on the kick
  c.globalAlpha = ph * (0.05 + pulse * 0.1); c.fillStyle = 'rgb(255,90,40)'; c.fillRect(0, LINE_Y, W, fh);
  c.restore();
}
