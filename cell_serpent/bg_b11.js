// Batch 11 world effects: weather that answers the beat (autumn leaves, disco confetti, diamond dust), twinkling stars that
// come out as the stages turn to night, and a golden finale look for the last ten stages. Everything is a baked sprite
// drawn with plain numbers: no colour strings are built per frame.
import { W, H, LINE_Y } from './sim.js';

const TAU = Math.PI * 2;
export const FINALE_FROM = 41;
export const isFinale = stage => (stage || 1) >= FINALE_FROM;
// second weather layer per world (the first layer, bg_world weatherFor, keeps petals, snow and fireflies)
export const LAYER2 = { rust: 'leaves', disco: 'confetti', frosty: 'dust', mighty: 'dust', gloomy: 'dust' };
export const weather11For = skin => LAYER2[skin] || '';
export const NP = 18;
const LEAF = ['#e0802c', '#c0452a', '#e8b53a', '#9a5a22'];
const CONF = ['#ff5aa5', '#5ad7ff', '#ffe24a', '#8cff7a', '#b48cff'];

function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
export function makeB11() {
  const r = rnd(1111), p = [];
  for (let i = 0; i < NP; i++) p.push({ x: r() * W, y: r() * H, z: [0.6, 1, 1.7][i % 3], ph: r() * TAU, v: 0.75 + r() * 0.5, k: i % 5 });
  const tw = [], r2 = rnd(2222);
  for (let i = 0; i < 16; i++) tw.push({ x: 30 + r2() * (W - 60), y: 24 + r2() * (LINE_Y - 330), ph: r2() * TAU, s: 0.7 + r2() * 0.8 });
  return { p, tw };
}

// ---- baked sprites (null when the kit cannot bake, e.g. in headless tests)
function leafSpr(kit, k) {
  return kit.bake('b11leaf|' + k, 22, 22, g => {
    g.fillStyle = LEAF[k % 4]; g.beginPath(); g.moveTo(-9, 0); g.quadraticCurveTo(0, -9, 9, 0); g.quadraticCurveTo(0, 8, -9, 0); g.fill();
    g.strokeStyle = 'rgba(60,20,0,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(-9, 0); g.lineTo(8, 0); g.stroke();
  }, 1.5);
}
function confSpr(kit, k) {
  return kit.bake('b11conf|' + k, 12, 12, g => { g.fillStyle = CONF[k % 5]; g.fillRect(-2.5, -4.5, 5, 9); g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(-2.5, -4.5, 5, 3); }, 1.5);
}
function dustSpr(kit) {
  return kit.bake('b11dust', 18, 18, g => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 8); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(200,235,255,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 8, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -8); g.lineTo(1.2, -1.2); g.lineTo(8, 0); g.lineTo(1.2, 1.2); g.lineTo(0, 8); g.lineTo(-1.2, 1.2); g.lineTo(-8, 0); g.lineTo(-1.2, -1.2); g.closePath(); g.fill();
  }, 1.5);
}
function sparkSpr(kit) {
  return kit.bake('b11spark', 16, 16, g => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 7); gr.addColorStop(0, 'rgba(255,248,200,1)'); gr.addColorStop(0.4, 'rgba(255,200,70,.6)'); gr.addColorStop(1, 'rgba(255,170,40,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 7, 0, TAU); g.fill();
  }, 1.5);
}
function raySpr(kit) {
  return kit.bake('b11rays', W, 520, g => {
    g.translate(-W / 2, -260);
    for (let i = 0; i < 9; i++) {
      const a = Math.PI * (0.12 + i * 0.095), x2 = W / 2 + Math.cos(a) * 700, y2 = -40 + Math.sin(a) * 700, wd = 0.07;
      const gr = g.createLinearGradient(W / 2, -40, x2, y2); gr.addColorStop(0, 'rgba(255,225,130,.8)'); gr.addColorStop(1, 'rgba(255,225,130,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(W / 2, -40); g.lineTo(W / 2 + Math.cos(a - wd) * 700, -40 + Math.sin(a - wd) * 700); g.lineTo(W / 2 + Math.cos(a + wd) * 700, -40 + Math.sin(a + wd) * 700); g.closePath(); g.fill();
    }
  }, 0.5);
}
function starSpr(kit) {
  return kit.bake('b11star', 14, 14, g => {
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -6); g.lineTo(1, -1); g.lineTo(6, 0); g.lineTo(1, 1); g.lineTo(0, 6); g.lineTo(-1, 1); g.lineTo(-6, 0); g.lineTo(-1, -1); g.closePath(); g.fill();
  }, 1.5);
}

// layer two of the weather: three depths (small and faint far away, big and soft up close) that slide with the wind at
// different speeds and kick on the beat. pulse 0..1, wx wind offset, wv wind velocity
export function drawLayer2(c, kit, kind, b, t, pulse, wx, wv, low) {
  if (!kind || !kit || !b) return 0;
  const n = low ? 9 : NP, dust = kind === 'dust'; let drawn = 0;
  const one = dust ? dustSpr(kit) : null;
  for (let i = 0; i < n; i++) {
    const m = b.p[i], z = m.z, spr = dust ? one : kind === 'leaves' ? leafSpr(kit, m.k) : confSpr(kit, m.k);
    if (!spr) continue;
    const fall = dust ? 7 : kind === 'leaves' ? 34 : 52, span = H + 90;
    let y = ((m.y + t * fall * z * m.v) % span) - 45;
    const sway = Math.sin(t * 0.9 * m.v + m.ph) * (dust ? 12 : 30) * z;
    const x = (((m.x + sway + wx * z * 1.3 + t * (kind === 'leaves' ? 10 : 0) * z) % (W + 80)) + W + 80) % (W + 80) - 40;
    if (dust) y = y * 0.62 + 20;   // diamond dust hangs in the upper sky
    const kick = pulse * (dust ? 0 : 9) * z;
    c.save(); c.translate(x, y - kick);
    if (dust) {
      const tw = 0.5 + 0.5 * Math.sin(t * 2.6 * m.v + m.ph), s = (0.45 + 0.45 * tw + pulse * 0.5) * z;
      c.globalAlpha = (0.22 + 0.4 * tw) * Math.min(1, 0.45 + z * 0.4); c.globalCompositeOperation = 'lighter'; c.rotate(m.ph + t * 0.2); c.scale(s, s);
    } else if (kind === 'leaves') {
      c.rotate(Math.sin(t * 1.3 * m.v + m.ph) * 1.1 + m.ph + wv * 0.004); const f = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.7 * m.v + m.ph)); c.scale(z * (1 + pulse * 0.2), z * f); c.globalAlpha = z > 1.5 ? 0.45 : 0.78;
    } else {
      c.rotate(t * 2 * m.v + m.ph); c.scale(z * (1.2 + pulse * 0.6), z * 1.3 * Math.abs(Math.cos(t * 5 * m.v + m.ph)) + 0.1); c.globalAlpha = Math.min(1, (z > 1.5 ? 0.4 : 0.6) + pulse * 0.35);
    }
    c.drawImage(spr.c, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    c.restore(); drawn++;
  }
  return drawn;
}

// stars that twinkle once the sky has gone dark (k = skyGrade k, so only the late stages), brighter on the beat
export function drawTwinkle(c, kit, b, k, t, pulse, low) {
  if (!kit || !b || k < 0.42) return 0;
  const spr = starSpr(kit); if (!spr) return 0;
  const amt = Math.min(1, (k - 0.42) * 3), n = low ? 6 : b.tw.length, beatI = Math.floor(t * 2) % 3;
  c.save(); c.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const m = b.tw[i], tw = 0.5 + 0.5 * Math.sin(t * 1.9 * m.s + m.ph), s = m.s * (0.5 + tw * 0.7 + (i % 3 === beatI ? pulse * 0.5 : 0));
    c.globalAlpha = amt * (0.2 + 0.7 * tw); c.drawImage(spr.c, m.x - 7 * s, m.y - 7 * s, 14 * s, 14 * s);
  }
  c.restore(); return n;
}

// the last ten stages: slow golden light fans from above and gold sparks rise on every kick
export function finaleLevel(stage, boss) { return !isFinale(stage) ? 0 : Math.min(1, 0.55 + (stage - FINALE_FROM) / 9 * 0.45) * (boss ? 0.8 : 1); }
export function drawFinale(c, kit, b, stage, boss, t, pulse, low) {
  const lv = finaleLevel(stage, boss); if (lv <= 0 || !kit || !b) return 0;
  const rays = raySpr(kit), spark = sparkSpr(kit); let n = 0;
  c.save(); c.globalCompositeOperation = 'lighter';
  if (rays) { c.save(); c.translate(W / 2, -40); c.rotate(Math.sin(t * 0.18) * 0.12); c.globalAlpha = lv * (0.5 + pulse * 0.25); c.drawImage(rays.c, -W / 2, 40, W, 520); c.rotate(-Math.sin(t * 0.18) * 0.24 + 0.05); c.globalAlpha = lv * (0.3 + pulse * 0.15); c.drawImage(rays.c, -W / 2, 40, W, 520); c.restore(); n++; }
  if (spark) {
    const cnt = low ? 6 : 14;
    for (let i = 0; i < cnt; i++) {
      const m = b.p[i], u = ((t * 0.07 * m.v + m.ph / TAU) % 1 + 1) % 1, y = LINE_Y - 20 - u * (LINE_Y - 40), x = m.x + Math.sin(t * 0.8 + m.ph) * 18, s = (0.9 + m.v * 0.6) * (1 + pulse * 0.6);
      c.globalAlpha = Math.min(1, lv * Math.sin(u * Math.PI) * 1.3); c.drawImage(spark.c, x - 8 * s, y - 8 * s, 16 * s, 16 * s); n++;
    }
  }
  c.globalAlpha = lv * (0.28 + pulse * 0.3); c.lineWidth = 3; c.strokeStyle = 'rgb(255,214,102)'; c.strokeRect(7, 7, W - 14, H - 14);
  c.restore(); return n;
}
