// In-run backdrops: one themed world per species (baked once per stage), a concert floor under the duo,
// a few cheap animated pieces (swinging spotlights, drifting motes, pulsing ring circle).
import { W, H, LINE_Y } from './sim.js';
import { mix } from './art_draw.js';

const TAU = Math.PI * 2;
// per species: sky top, sky bottom, far and near silhouette colours, scenery kind, mote kind
export const WORLDS = {
  love:   { top: '#5a1f5c', bot: '#c2417f', far: '#7a2a6e', near: '#3d1346', scene: 'hills', mote: 'heart' },
  rust:   { top: '#2a1630', bot: '#c0603c', far: '#6b2f3a', near: '#2e1424', scene: 'barn', mote: 'ember' },
  sneezy: { top: '#123a3a', bot: '#4fb58a', far: '#2b7a62', near: '#14443c', scene: 'meadow', mote: 'pollen' },
  grumpy: { top: '#0f2146', bot: '#3d78b8', far: '#274f87', near: '#13294f', scene: 'rain', mote: 'drop' },
  sleepy: { top: '#0b0a2e', bot: '#4b3a9a', far: '#33287a', near: '#1b1550', scene: 'night', mote: 'star' },
  disco:  { top: '#0a2a3a', bot: '#2a9aa2', far: '#176474', near: '#0c3444', scene: 'disco', mote: 'note' },
  sour:   { top: '#10301a', bot: '#6fae3c', far: '#3e7a2c', near: '#1b4220', scene: 'orchard', mote: 'bubble' },
  mighty: { top: '#1c2236', bot: '#6b7da3', far: '#4a5878', near: '#262d48', scene: 'peaks', mote: 'dust' },
  frosty: { top: '#17315a', bot: '#9fd6f2', far: '#6fa4d0', near: '#31598a', scene: 'ice', mote: 'snow' },
  gloomy: { top: '#08051c', bot: '#40246e', far: '#2a1a56', near: '#150c32', scene: 'graves', mote: 'wisp' },
  piggy:  { top: '#4a1f4a', bot: '#e58aa0', far: '#9a3f6a', near: '#4a1b44', scene: 'hills', mote: 'heart' },
};
const worldOf = skin => WORLDS[skin] || WORLDS.love;

function ridge(c, y, amp, freq, ph, col, bottom = LINE_Y) {
  c.fillStyle = col; c.beginPath(); c.moveTo(0, bottom);
  for (let x = 0; x <= W; x += 24) c.lineTo(x, y + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 2.3 + ph * 1.7) * amp * 0.4);
  c.lineTo(W, bottom); c.closePath(); c.fill();
}
function rnd(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

// a moon: disc A minus disc B, so the sky shows through the bite
function crescent(c, ax, ay, ar, bx, by, br, col) {
  c.save(); c.beginPath(); c.arc(ax, ay, ar, 0, TAU); c.clip();
  c.fillStyle = col; c.beginPath(); c.rect(ax - ar - 2, ay - ar - 2, ar * 2 + 4, ar * 2 + 4); c.arc(bx, by, br, 0, TAU); c.fill('evenodd'); c.restore();
}

function scenery(c, w, boss) {
  const r = rnd(7), far = w.far, near = w.near, y0 = LINE_Y - 330;
  const f = col => mix(col, '#05030f', boss ? 0.35 : 0);
  switch (w.scene) {
    case 'barn': {
      ridge(c, y0 + 90, 26, 0.012, 1, f(far)); c.fillStyle = f(near);
      for (const [x, s] of [[120, 1], [560, 0.8]]) { c.fillRect(x - 60 * s, y0 + 40, 120 * s, 100 * s); c.beginPath(); c.moveTo(x - 70 * s, y0 + 42); c.lineTo(x, y0 - 30 * s); c.lineTo(x + 70 * s, y0 + 42); c.fill(); }
      ridge(c, y0 + 210, 18, 0.02, 3, f(near)); break;
    }
    case 'meadow': case 'hills': {
      ridge(c, y0 + 60, 40, 0.008, 2, f(far)); ridge(c, y0 + 170, 30, 0.012, 5, f(mix(far, near, 0.5))); ridge(c, y0 + 250, 20, 0.018, 0, f(near));
      c.fillStyle = f(near); for (let i = 0; i < 14; i++) { const x = r() * W, y = y0 + 230 + r() * 70, s = 6 + r() * 8; c.beginPath(); c.arc(x, y, s, Math.PI, 0); c.fill(); }
      break;
    }
    case 'rain': {
      ridge(c, y0 + 80, 36, 0.01, 4, f(far)); ridge(c, y0 + 200, 24, 0.016, 1, f(near));
      c.strokeStyle = 'rgba(190,225,255,.10)'; c.lineWidth = 2;
      for (let i = 0; i < 40; i++) { const x = r() * W, y = r() * (LINE_Y - 80); c.beginPath(); c.moveTo(x, y); c.lineTo(x - 8, y + 36); c.stroke(); }
      break;
    }
    case 'night': {
      c.fillStyle = 'rgba(255,255,255,.8)'; for (let i = 0; i < 46; i++) { c.globalAlpha = 0.25 + r() * 0.6; c.beginPath(); c.arc(r() * W, r() * (LINE_Y - 300), 0.8 + r() * 1.6, 0, TAU); c.fill(); } c.globalAlpha = 1;
      const mg = c.createRadialGradient(560, 210, 10, 560, 210, 120); mg.addColorStop(0, 'rgba(230,220,255,.55)'); mg.addColorStop(1, 'rgba(230,220,255,0)'); c.fillStyle = mg; c.fillRect(420, 70, 280, 280);
      crescent(c, 560, 210, 46, 580, 198, 42, '#efe9ff');
      ridge(c, y0 + 150, 34, 0.01, 2, f(far)); ridge(c, y0 + 240, 22, 0.015, 6, f(near)); break;
    }
    case 'disco': {
      c.fillStyle = 'rgba(160,255,245,.07)';
      for (let i = 0; i < 9; i++) { const x = i * 90 - 20; c.beginPath(); c.moveTo(W / 2, -40); c.lineTo(x, LINE_Y); c.lineTo(x + 46, LINE_Y); c.closePath(); c.fill(); }
      c.fillStyle = f(far); for (let i = 0; i < 10; i++) { const x = i * 76, h = 70 + r() * 170; c.fillRect(x, LINE_Y - 40 - h, 60, h + 40); }
      c.fillStyle = 'rgba(255,230,140,.35)'; for (let i = 0; i < 70; i++) c.fillRect(8 + r() * (W - 16), LINE_Y - 230 + r() * 190, 5, 7);
      const x = W / 2, y = 150, s = 44;
      c.strokeStyle = 'rgba(255,255,255,.4)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, -10); c.lineTo(x, y - s); c.stroke();
      c.fillStyle = '#d9fbff'; c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
      c.fillStyle = 'rgba(90,150,170,.55)'; for (let a = 0; a < 22; a++) c.fillRect(x - s + r() * s * 1.6, y - s + r() * s * 1.6, s * 0.3, s * 0.3);
      break;
    }
    case 'orchard': {
      ridge(c, y0 + 90, 30, 0.01, 1, f(far));
      for (let i = 0; i < 7; i++) {
        const x = 40 + i * 105 + r() * 20, y = y0 + 180 + (i % 2) * 24, s = 38 + r() * 14;
        c.fillStyle = f(near); c.fillRect(x - 5, y, 10, 70); c.fillStyle = f(mix(far, '#9be04a', 0.3)); c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill();
        c.fillStyle = 'rgba(190,255,90,.55)'; for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(x + (r() - 0.5) * s, y + (r() - 0.5) * s, 4, 0, TAU); c.fill(); }
      }
      break;
    }
    case 'peaks': {
      const peak = (x, h, wd, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(x - wd, LINE_Y); c.lineTo(x, LINE_Y - h); c.lineTo(x + wd, LINE_Y); c.fill(); };
      peak(150, 430, 260, f(far)); peak(520, 520, 300, f(mix(far, near, 0.4))); peak(330, 300, 240, f(near));
      c.fillStyle = 'rgba(255,255,255,.28)'; c.beginPath(); c.moveTo(520, LINE_Y - 520); c.lineTo(470, LINE_Y - 440); c.lineTo(520, LINE_Y - 460); c.lineTo(560, LINE_Y - 430); c.closePath(); c.fill(); break;
    }
    case 'ice': {
      ridge(c, y0 + 100, 30, 0.01, 2, f(far));
      for (let i = 0; i < 8; i++) {
        const x = 30 + i * 92 + r() * 30, h = 90 + r() * 140; c.fillStyle = f(i % 2 ? near : far);
        c.beginPath(); c.moveTo(x - 30, LINE_Y); c.lineTo(x - 6, LINE_Y - h); c.lineTo(x + 8, LINE_Y - h * 0.8); c.lineTo(x + 34, LINE_Y); c.fill();
        c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.moveTo(x - 6, LINE_Y - h); c.lineTo(x + 8, LINE_Y - h * 0.8); c.lineTo(x, LINE_Y - h * 0.4); c.closePath(); c.fill();
      }
      break;
    }
    case 'graves': {
      crescent(c, 150, 170, 40, 168, 160, 36, 'rgba(190,170,255,.6)');
      ridge(c, y0 + 130, 30, 0.01, 4, f(far)); ridge(c, y0 + 230, 18, 0.02, 2, f(near));
      c.fillStyle = f(mix(near, '#000000', 0.3)); for (let i = 0; i < 9; i++) { const x = 30 + i * 80 + r() * 30, y = y0 + 240 + r() * 40; c.beginPath(); c.arc(x, y, 14, Math.PI, 0); c.fill(); c.fillRect(x - 14, y, 28, 30); }
      c.fillStyle = f(near); c.fillRect(600, y0 + 40, 10, 240); c.beginPath(); c.moveTo(585, y0 + 60); c.lineTo(660, y0 + 40); c.lineTo(640, y0 + 80); c.fill(); break;
    }
  }
}

function speaker(c, x, y, w, h) {
  c.save(); c.translate(x, y);
  c.fillStyle = '#1b1530'; c.strokeStyle = '#0a0716'; c.lineWidth = 4;
  c.beginPath(); c.roundRect(0, 0, w, h, 8); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.07)'; c.fillRect(6, 6, w - 12, 5);
  for (let i = 0; i < 2; i++) { const cy = h * (0.3 + i * 0.4), rr = w * (i ? 0.3 : 0.2); c.fillStyle = '#0a0716'; c.beginPath(); c.arc(w / 2, cy, rr, 0, TAU); c.fill(); c.strokeStyle = '#4a3f78'; c.lineWidth = 3; c.stroke(); c.fillStyle = '#2c2350'; c.beginPath(); c.arc(w / 2, cy, rr * 0.4, 0, TAU); c.fill(); }
  c.restore();
}

// a crowd of cute animal silhouettes (kitten, puppy, chick, bunny) with raised paws
function crowd(c, th, boss) {
  const r = rnd(99), y = H - 4, col = boss ? '#0a0618' : '#140c2e';
  c.lineCap = 'round';
  for (let row = 0; row < 2; row++) {
    c.fillStyle = row ? col : mix(col, th.base, 0.1);
    for (let x = -10 + row * 28; x < W + 20; x += 56 + r() * 18) {
      const s = 17 + r() * 8 - row * 2, yy = y + row * 8 - r() * 8, k = Math.floor(r() * 4);
      c.beginPath(); c.arc(x, yy, s, 0, TAU); c.fill();
      if (k === 0) { for (const d of [-1, 1]) { c.beginPath(); c.moveTo(x + d * s * 0.9, yy - s * 0.3); c.lineTo(x + d * s * 0.55, yy - s * 1.45); c.lineTo(x + d * s * 0.1, yy - s * 0.85); c.fill(); } }
      else if (k === 1) { for (const d of [-1, 1]) { c.beginPath(); c.ellipse(x + d * s * 0.95, yy - s * 0.3, s * 0.3, s * 0.65, d * 0.2, 0, TAU); c.fill(); } }
      else if (k === 2) { c.beginPath(); c.moveTo(x - s * 0.2, yy - s * 0.9); c.lineTo(x, yy - s * 1.6); c.lineTo(x + s * 0.3, yy - s * 0.9); c.fill(); }
      else { for (const d of [-1, 1]) { c.beginPath(); c.ellipse(x + d * s * 0.4, yy - s * 1.3, s * 0.2, s * 0.7, d * 0.1, 0, TAU); c.fill(); } }
      if (r() < 0.45) { c.lineWidth = 5; c.strokeStyle = c.fillStyle; c.beginPath(); c.moveTo(x + s * 0.5, yy - s * 0.4); c.lineTo(x + s * 0.9, yy - s * 1.5); c.stroke(); }
    }
  }
}

// everything static for a stage; c is a context already scaled to the W x H space
export function bakeWorld(c, skin, boss, ring, th) {
  const w = worldOf(skin), dim = boss ? 0.45 : 0;
  const sky = c.createLinearGradient(0, 0, 0, LINE_Y);
  sky.addColorStop(0, mix(w.top, '#05030f', dim)); sky.addColorStop(1, mix(w.bot, '#1a0820', dim * 1.2));
  c.fillStyle = sky; c.fillRect(0, 0, W, H);
  if (boss) { const rg = c.createRadialGradient(W / 2, 260, 20, W / 2, 260, 520); rg.addColorStop(0, 'rgba(255,60,90,.22)'); rg.addColorStop(1, 'rgba(255,60,90,0)'); c.fillStyle = rg; c.fillRect(0, 0, W, LINE_Y); }
  scenery(c, w, boss);
  const v = c.createLinearGradient(0, 0, 0, H); v.addColorStop(0, 'rgba(0,0,0,.4)'); v.addColorStop(0.22, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.3)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  // the concert stage under the duo
  const fl = c.createLinearGradient(0, LINE_Y, 0, H);
  fl.addColorStop(0, mix(w.near, th.base, 0.22)); fl.addColorStop(0.5, '#1a1038'); fl.addColorStop(1, '#07040f');
  c.fillStyle = fl; c.fillRect(0, LINE_Y, W, H - LINE_Y);
  c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 2;
  for (let i = 1; i < 9; i++) { c.beginPath(); c.moveTo(W / 2 + (i - 4.5) * 14, LINE_Y); c.lineTo(W / 2 + (i - 4.5) * 120, H); c.stroke(); }
  const pool = c.createRadialGradient(W / 2, H - 100, 10, W / 2, H - 100, 340); pool.addColorStop(0, 'rgba(255,225,170,.28)'); pool.addColorStop(1, 'rgba(255,225,170,0)');
  c.fillStyle = pool; c.fillRect(0, LINE_Y, W, H - LINE_Y);
  speaker(c, 6, LINE_Y - 8, 74, 120); speaker(c, 12, LINE_Y - 108, 62, 100);
  speaker(c, W - 80, LINE_Y - 8, 74, 120); speaker(c, W - 74, LINE_Y - 108, 62, 100);
  crowd(c, th, boss);
  c.lineWidth = 8; c.strokeStyle = mix(th.base, '#ffffff', 0.15) + '8c'; c.strokeRect(4, 4, W - 8, H - 8);
  c.lineWidth = 2; c.strokeStyle = 'rgba(111,227,255,.6)'; c.strokeRect(10, 10, W - 20, H - 20);
}

// ---- animated pieces (cheap: a baked beam sprite, ~18 motes)
export function makeMotes() {
  const a = [], r = rnd(3);
  for (let i = 0; i < 18; i++) a.push({ x: r() * W, y: r() * H, s: 0.6 + r() * 0.8, v: 0.6 + r() * 0.8, p: r() * TAU, k: i % 3 === 0 });
  return a;
}
function mote(c, kind, th, x, y, s, t, p, alt) {
  switch (kind) {
    case 'heart': c.fillStyle = alt ? th.lite : th.base; c.save(); c.translate(x, y); c.rotate(Math.sin(t + p) * 0.5); c.scale(s * 9, s * 9); c.beginPath(); c.moveTo(0, 0.7); c.bezierCurveTo(-1.2, -0.1, -0.7, -0.9, 0, -0.35); c.bezierCurveTo(0.7, -0.9, 1.2, -0.1, 0, 0.7); c.fill(); c.restore(); break;
    case 'ember': c.fillStyle = alt ? '#ffd27a' : '#ff8a4a'; c.beginPath(); c.arc(x, y, s * 3.2, 0, TAU); c.fill(); break;
    case 'pollen': c.fillStyle = alt ? '#f6ffb0' : th.lite; c.beginPath(); c.arc(x, y, s * 4, 0, TAU); c.fill(); break;
    case 'drop': c.fillStyle = alt ? '#bfe9ff' : '#8fc8f5'; c.beginPath(); c.ellipse(x, y, s * 2, s * 7, 0.15, 0, TAU); c.fill(); break;
    case 'star': { c.fillStyle = '#fff'; const a = c.globalAlpha; c.save(); c.translate(x, y); c.rotate(t * 0.5 + p); c.globalAlpha = a * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.4 + p))); c.fillRect(-s * 1.2, -s * 5, s * 2.4, s * 10); c.fillRect(-s * 5, -s * 1.2, s * 10, s * 2.4); c.restore(); break; }
    case 'note': c.fillStyle = alt ? '#ff9ad6' : '#a8fff4'; c.save(); c.translate(x, y); c.rotate(Math.sin(t + p) * 0.3); c.scale(s, s); c.beginPath(); c.ellipse(0, 0, 6, 4.4, -0.4, 0, TAU); c.fill(); c.fillRect(4, -18, 2.6, 18); c.fillRect(4, -18, 10, 4); c.restore(); break;
    case 'bubble': c.strokeStyle = 'rgba(220,255,200,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, s * 8, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.arc(x - s * 3, y - s * 3, s * 1.8, 0, TAU); c.fill(); break;
    case 'dust': c.fillStyle = alt ? '#d3def2' : '#8fa3c7'; c.save(); c.translate(x, y); c.rotate(t * 0.4 + p); c.fillRect(-s * 3, -s * 2, s * 6, s * 4); c.restore(); break;
    case 'snow': c.fillStyle = '#fff'; c.beginPath(); c.arc(x, y, s * (alt ? 3.6 : 2.4), 0, TAU); c.fill(); break;
    case 'wisp': c.fillStyle = alt ? '#9dff6d' : '#c9b6ff'; c.beginPath(); c.arc(x, y, s * 4.5, 0, TAU); c.fill(); c.globalAlpha *= 0.5; c.beginPath(); c.ellipse(x, y + s * 9, s * 2.4, s * 8, 0, 0, TAU); c.fill(); break;
  }
}
// rising kinds go up, the rest fall (stars stay put and twinkle)
const RISE = { ember: 1, bubble: 1, wisp: 1, note: 1, pollen: 1 };
export function drawMotes(c, skin, th, motes, t) {
  const kind = worldOf(skin).mote, dir = RISE[kind] ? -1 : 1, speed = kind === 'star' ? 0 : kind === 'drop' ? 150 : 28, span = H + 120;
  c.save(); c.globalAlpha = kind === 'star' ? 0.9 : 0.7;
  for (const m of motes) {
    const y = (((m.y + dir * t * speed * m.v) % span) + span) % span - 60, x = m.x + Math.sin(t * 0.8 * m.v + m.p) * (kind === 'drop' ? 3 : 26);
    c.globalAlpha = kind === 'star' ? 0.9 : 0.7; mote(c, kind, th, x, kind === 'star' ? m.y * 0.75 : y, m.s, t, m.p, m.k);
  }
  c.restore();
}
export function drawBeams(c, t, boss, th, kit) {
  const spr = kit && kit.bake('beam', 120, 700, b => {
    const gr = b.createLinearGradient(0, -350, 0, 350); gr.addColorStop(0, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    b.fillStyle = gr; b.beginPath(); b.moveTo(-6, -350); b.lineTo(6, -350); b.lineTo(55, 350); b.lineTo(-55, 350); b.closePath(); b.fill();
  }, 1);
  if (!spr) return;
  c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = boss ? 0.2 : 0.18;
  for (let i = 0; i < 4; i++) {
    const x = i < 2 ? 70 + i * 40 : W - 70 - (i - 2) * 40, sw = Math.sin(t * (0.7 + i * 0.13) + i * 1.9) * 0.45 + (i < 2 ? 0.3 : -0.3);
    c.save(); c.translate(x, LINE_Y - 40); c.rotate(Math.PI + sw); c.drawImage(spr.c, -60, 0, 120, 700); c.restore();
  }
  c.restore();
}
export function drawRing(c, ring, t, boss, kit) {
  const { cx, cy, R } = ring, beat = 0.5 + 0.5 * Math.sin(t * 4.2), hue = boss ? '255,50,90' : '255,90,140';
  // the floor disc is baked once (at the middle of the pulse); the pulse is a light alpha swing
  const disc = kit && kit.bake ? kit.bake('ringfloor|' + boss + '|' + R, R * 2, R * 2, b => {
    const fl = b.createRadialGradient(0, 0, 20, 0, 0, R); fl.addColorStop(0, 'rgba(255,225,170,.2)'); fl.addColorStop(0.6, `rgba(${hue},.14)`); fl.addColorStop(1, `rgba(${hue},.36)`);
    b.fillStyle = fl; b.beginPath(); b.arc(0, 0, R, 0, TAU); b.fill();
  }, 1) : null;
  if (disc) { c.save(); c.globalAlpha = 0.8 + beat * 0.4; c.drawImage(disc.c, cx - R, cy - R); c.restore(); }
  else {
    const fl = c.createRadialGradient(cx, cy, 20, cx, cy, R); fl.addColorStop(0, `rgba(255,225,170,${0.16 + beat * 0.08})`); fl.addColorStop(0.6, `rgba(${hue},.14)`); fl.addColorStop(1, `rgba(${hue},${0.3 + beat * 0.12})`);
    c.fillStyle = fl; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
  }
  for (let i = 1; i <= 2; i++) { const ph = (t * 0.7 + i * 0.5) % 1; c.strokeStyle = `rgba(255,200,230,${0.25 * (1 - ph)})`; c.lineWidth = 3; c.beginPath(); c.arc(cx, cy, R * (0.3 + ph * 0.7), 0, TAU); c.stroke(); }
  c.beginPath(); c.arc(cx, cy, R, 0, TAU);
  c.lineWidth = 16 + beat * 6; c.strokeStyle = `rgba(${hue},.2)`; c.stroke();
  c.lineWidth = 5; c.strokeStyle = 'rgba(255,150,190,.85)'; c.setLineDash([22, 12]); c.lineDashOffset = -t * 20; c.stroke(); c.setLineDash([]);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, on = ((i + Math.floor(t * 6)) % 3) === 0; c.fillStyle = on ? '#fff3c4' : 'rgba(255,200,220,.35)'; c.beginPath(); c.arc(cx + Math.cos(a) * (R + 14), cy + Math.sin(a) * (R + 14), on ? 4 : 2.6, 0, TAU); c.fill(); }
}
