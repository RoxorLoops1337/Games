// Galaxy Pusher drawing: perspective camera for the machine, coin sprites, the battle screen,
// the cat mech, the enemies and the Galaxy Wheel. Pure drawing: state comes in, pixels go out.
import { W, FRONT, BACK, PH, GUT, KIND, CHUTE_Z, WHEEL, TOWER, TH_T, ROW, ENERGY_MAX, FEVER_TIME, heroAtk, xpNeed } from './core.js';

export const COLS = {
  B: { main: '#2fb4ff', dark: '#0d5fa8', light: '#a8e4ff', glow: '#5cd0ff', name: 'BLUE' },
  P: { main: '#ff4fb0', dark: '#a3176a', light: '#ffc0e3', glow: '#ff7ccc', name: 'PINK' },
  Y: { main: '#ffc21f', dark: '#b9700a', light: '#fff0a6', glow: '#ffd75c', name: 'YELLOW' },
  JP: { main: '#ff3b47', dark: '#8f0f1a', light: '#ffb3b8', glow: '#ff6b74', name: 'JACKPOT' },
};
export const FONT = '"Russo One", "Arial Black", system-ui, sans-serif';
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;

export function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function txt(g, s, x, y, size, col, o = {}) {
  g.font = `${o.weight || ''} ${size}px ${FONT}`; g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
  if (o.stroke !== false) { g.lineJoin = 'round'; g.lineWidth = o.lw || Math.max(2, size * 0.18); g.strokeStyle = o.stroke || 'rgba(8,4,24,0.95)'; g.strokeText(s, x, y); }
  if (o.glow) { g.shadowColor = o.glow; g.shadowBlur = o.blur || size * 0.6; }
  g.fillStyle = col; g.fillText(s, x, y); g.shadowBlur = 0;
}

// ------------------------------------------------------------------------------------------------ camera
export function makeCam(rect) {
  const C = [W / 2, FRONT + 6.5, 27], T = [W / 2, 9.6, 0];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const nrm = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const f = nrm(sub(T, C)), r = nrm(cross([0, 0, 1], f)), u = cross(f, r);
  const raw = (x, y, z) => { const p = [x - C[0], y - C[1], z - C[2]]; const zc = dot(p, f); return [dot(p, r) / zc, dot(p, u) / zc, zc]; };
  const pts = [[0, BACK, 0], [W, BACK, 0], [0, FRONT, 0], [W, FRONT, 0], [0, BACK, 8.5], [W, BACK, 8.5], [0, FRONT + 1.2, -2.2], [W, FRONT + 1.2, -2.2]].map((p) => raw(...p));
  let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const [a, b] of pts) { u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); }
  const s = Math.min(rect.w * 1.0 / (u1 - u0), rect.h * 0.99 / (v1 - v0));
  const ox = rect.x + rect.w / 2 - ((u0 + u1) / 2) * s;
  const oy = rect.y + rect.h - 4 + v0 * s;
  const cam = {
    rect, s, C,
    // returns screen x, y, k (px per unit at that depth) and q (how flat a horizontal disc looks there)
    P(x, y, z) {
      const dx = x - C[0], dy = y - C[1], dz = z - C[2];
      const zc = dx * f[0] + dy * f[1] + dz * f[2];
      const k = s / zc;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return { x: ox + (dx * r[0] + dy * r[1] + dz * r[2]) * k, y: oy - (dx * u[0] + dy * u[1] + dz * u[2]) * k, k, q: -dz / d };
    },
  };
  // screen x -> field x along the chute line (used for aiming)
  // the finger aims along the middle of the field, so the far left and right are easy to reach
  const a = cam.P(2, 9, 0), b = cam.P(W - 2, 9, 0);
  cam.aimOf = (sx) => clamp((sx - a.x) / (b.x - a.x), 0, 1);
  cam.xOfAim = (aim, y = 1.5, z = PH) => { const p = cam.P(lerp(1.2, W - 1.2, aim), y, z); return p.x; };
  return cam;
}

// ------------------------------------------------------------------------------------------------ coin sprites
const SPR = {};
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function metal(g, S, c0, c1, c2, rim) {
  const R = S / 2;
  let gr = g.createRadialGradient(R * 0.7, R * 0.55, R * 0.1, R, R, R);
  gr.addColorStop(0, c0); gr.addColorStop(0.55, c1); gr.addColorStop(1, c2);
  g.fillStyle = gr; g.beginPath(); g.arc(R, R, R - 1, 0, TAU); g.fill();
  g.lineWidth = S * 0.06; g.strokeStyle = rim; g.beginPath(); g.arc(R, R, R - S * 0.06, 0, TAU); g.stroke();
  g.lineWidth = S * 0.015; g.strokeStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.arc(R, R, R - S * 0.1, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
}
function star(g, x, y, r1, r0, n = 5, rot = -Math.PI / 2) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const r = i % 2 ? r0 : r1, a = rot + (i * Math.PI) / n; g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } g.closePath(); }
export function catFace(g, x, y, s, col = '#ffb02e', o = {}) {
  // a round tabby cat face, s = face radius
  g.save(); g.translate(x, y);
  g.fillStyle = col; g.strokeStyle = '#3a1d05'; g.lineWidth = s * 0.08; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(-s * 0.85, -s * 0.2); g.lineTo(-s * 0.75, -s * 1.05); g.lineTo(-s * 0.25, -s * 0.72); g.closePath(); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(s * 0.85, -s * 0.2); g.lineTo(s * 0.75, -s * 1.05); g.lineTo(s * 0.25, -s * 0.72); g.closePath(); g.fill(); g.stroke();
  g.fillStyle = '#ff9aa8'; g.beginPath(); g.moveTo(-s * 0.7, -s * 0.45); g.lineTo(-s * 0.68, -s * 0.85); g.lineTo(-s * 0.42, -s * 0.66); g.fill();
  g.beginPath(); g.moveTo(s * 0.7, -s * 0.45); g.lineTo(s * 0.68, -s * 0.85); g.lineTo(s * 0.42, -s * 0.66); g.fill();
  g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, s, s * 0.86, 0, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = '#b5620c'; g.lineWidth = s * 0.09; // stripes
  for (const k of [-0.3, 0, 0.3]) { g.beginPath(); g.moveTo(k * s, -s * 0.84); g.lineTo(k * s * 0.8, -s * 0.55); g.stroke(); }
  g.fillStyle = '#fff6e0'; g.beginPath(); g.ellipse(0, s * 0.35, s * 0.55, s * 0.4, 0, 0, TAU); g.fill();
  const blink = o.blink ? 0.15 : 1;
  g.fillStyle = '#1d2a12'; g.beginPath(); g.ellipse(-s * 0.36, -s * 0.05, s * 0.17, s * 0.22 * blink, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(s * 0.36, -s * 0.05, s * 0.17, s * 0.22 * blink, 0, 0, TAU); g.fill();
  if (blink === 1) { g.fillStyle = '#7dff6a'; g.beginPath(); g.ellipse(-s * 0.36, -s * 0.02, s * 0.1, s * 0.15, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(s * 0.36, -s * 0.02, s * 0.1, s * 0.15, 0, 0, TAU); g.fill();
    g.fillStyle = '#10180a'; g.fillRect(-s * 0.39, -s * 0.15, s * 0.06, s * 0.26); g.fillRect(s * 0.33, -s * 0.15, s * 0.06, s * 0.26);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(-s * 0.3, -s * 0.13, s * 0.05, 0, TAU); g.arc(s * 0.42, -s * 0.13, s * 0.05, 0, TAU); g.fill(); }
  g.fillStyle = '#ff6f8a'; g.beginPath(); g.moveTo(-s * 0.09, s * 0.17); g.lineTo(s * 0.09, s * 0.17); g.lineTo(0, s * 0.27); g.closePath(); g.fill();
  g.strokeStyle = '#3a1d05'; g.lineWidth = s * 0.05; g.beginPath(); g.moveTo(0, s * 0.27); g.quadraticCurveTo(-s * 0.1, s * 0.42, -s * 0.2, s * 0.34); g.moveTo(0, s * 0.27); g.quadraticCurveTo(s * 0.1, s * 0.42, s * 0.2, s * 0.34); g.stroke();
  g.lineWidth = s * 0.03; g.beginPath(); for (const sg of [-1, 1]) { g.moveTo(sg * s * 0.45, s * 0.25); g.lineTo(sg * s * 1.0, s * 0.15); g.moveTo(sg * s * 0.45, s * 0.33); g.lineTo(sg * s * 1.0, s * 0.38); } g.stroke();
  g.restore();
}
export function buildSprites() {
  const S = 96;
  const face = (k) => {
    const c = mk(S, S), g = c.getContext('2d'); const R = S / 2;
    if (k === 'c') { metal(g, S, '#ffffff', '#c9d2e0', '#7d889c', '#9aa5b8'); g.strokeStyle = 'rgba(80,90,110,0.55)'; g.lineWidth = 3; star(g, R, R, R * 0.42, R * 0.18); g.stroke(); g.beginPath(); g.arc(R, R, R * 0.62, 0, TAU); g.lineWidth = 2; g.stroke(); }
    else if (k === 'g') { metal(g, S, '#fffbe0', '#ffd34a', '#b5780e', '#e0a020'); g.fillStyle = 'rgba(150,90,0,0.55)'; star(g, R, R, R * 0.44, R * 0.19); g.fill(); g.fillStyle = 'rgba(255,255,220,0.8)'; star(g, R - 2, R - 2, R * 0.4, R * 0.17); g.fill(); }
    else {
      const C = COLS[k];
      g.fillStyle = C.dark; g.beginPath(); g.arc(R, R, R - 1, 0, TAU); g.fill();
      g.fillStyle = C.main; g.beginPath(); g.arc(R, R, R - 6, 0, TAU); g.fill();
      g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { g.save(); g.translate(R, R); g.rotate((i * TAU) / 8); g.fillRect(-4, -R + 2, 8, 9); g.restore(); }
      g.fillStyle = '#16122e'; g.beginPath(); g.arc(R, R, R * 0.66, 0, TAU); g.fill();
      g.save(); g.beginPath(); g.arc(R, R, R * 0.62, 0, TAU); g.clip();
      const bg = g.createRadialGradient(R, R * 0.8, 2, R, R, R * 0.7); bg.addColorStop(0, C.light); bg.addColorStop(1, C.main); g.fillStyle = bg; g.fillRect(0, 0, S, S);
      if (k === 'Y') catFace(g, R, R + 6, R * 0.42);
      else if (window.RJ && window.RJ.bust) {
        const t = mk(S, S); const tg = t.getContext('2d');
        try { window.RJ.bust(tg, k === 'B' ? 'roxor' : 'jasmin', S, S, { t: 0, expr: 'happy' }); } catch (e) { /* art kit missing */ }
        g.drawImage(t, R - R * 0.68, R - R * 0.66, R * 1.36, R * 1.36);
      }
      g.restore();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(R, R, R * 0.64, Math.PI * 1.1, Math.PI * 1.7); g.stroke();
    }
    return c;
  };
  const edge = (k) => {
    const c = mk(S, S), g = c.getContext('2d'), R = S / 2;
    const col = k === 'c' ? ['#5d6676', '#9ba5b5'] : k === 'g' ? ['#7a4a06', '#d39a1c'] : [COLS[k].dark, COLS[k].main];
    const gr = g.createLinearGradient(0, 0, S, 0); gr.addColorStop(0, col[0]); gr.addColorStop(0.35, col[1]); gr.addColorStop(1, col[0]);
    g.fillStyle = gr; g.beginPath(); g.arc(R, R, R - 1, 0, TAU); g.fill();
    if (k !== 'c' && k !== 'g') { g.fillStyle = '#fff'; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.fillRect(R + Math.cos(a) * R * 0.85 - 4, R * 1.4, 8, R * 0.6); } }
    return c;
  };
  for (const k of ['c', 'g', 'B', 'P', 'Y']) { SPR[k] = face(k); SPR[k + 'e'] = edge(k); }
  // ball
  const b = mk(64, 64), bg = b.getContext('2d'); const gr = bg.createRadialGradient(24, 22, 2, 32, 32, 31); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, '#dfe6f2'); gr.addColorStop(1, '#5a6478'); bg.fillStyle = gr; bg.beginPath(); bg.arc(32, 32, 30, 0, TAU); bg.fill(); SPR.ball = b;
  return SPR;
}
export const sprite = (k) => SPR[k];

// draw one coin given its bottom centre in the world
export function drawCoin(g, cam, k, x, y, z, h, r, alpha = 1, glow = 0) {
  const p = cam.P(x, y, z), q = cam.P(x, y, z + h);
  const rx = r * q.k, ry = rx * Math.max(0.2, q.q);
  if (rx < 0.5) return;
  if (alpha < 1) g.globalAlpha = alpha;
  g.drawImage(SPR[k + 'e'], p.x - rx, p.y - ry, rx * 2, ry * 2);
  if (q.y - p.y < -1.2) { g.fillStyle = k === 'c' ? '#7f899b' : k === 'g' ? '#b47c10' : COLS[k].dark; g.fillRect(q.x - rx + 0.5, q.y, rx * 2 - 1, p.y - q.y); }
  if (glow) { g.shadowColor = glow; g.shadowBlur = rx * 0.9; }
  g.drawImage(SPR[k], q.x - rx, q.y - ry, rx * 2, ry * 2);
  if (glow) g.shadowBlur = 0;
  if (alpha < 1) g.globalAlpha = 1;
}

// ------------------------------------------------------------------------------------------------ the machine
let bgCache = null;
function quad(g, cam, pts) { g.beginPath(); pts.forEach((p, i) => { const s = cam.P(p[0], p[1], p[2]); if (i) g.lineTo(s.x, s.y); else g.moveTo(s.x, s.y); }); g.closePath(); }
function machineBackdrop(cam, rect, dpr) {
  const c = mk(Math.ceil(rect.w * dpr), Math.ceil((rect.y + rect.h) * dpr)); const g = c.getContext('2d'); g.scale(dpr, dpr);
  // cabinet interior
  const bg = g.createLinearGradient(0, rect.y, 0, rect.y + rect.h); bg.addColorStop(0, '#120a2e'); bg.addColorStop(1, '#05030f'); g.fillStyle = bg; g.fillRect(0, rect.y, rect.w, rect.h);
  // back wall
  quad(g, cam, [[0, BACK, 0], [W, BACK, 0], [W, BACK, 9], [0, BACK, 9]]);
  const p0 = cam.P(0, BACK, 9), p1 = cam.P(0, BACK, 0);
  let gr = g.createLinearGradient(0, p0.y, 0, p1.y); gr.addColorStop(0, '#1b1450'); gr.addColorStop(0.6, '#2b1d6e'); gr.addColorStop(1, '#3a2a7a'); g.fillStyle = gr; g.fill();
  // circuit lines on the back wall
  g.save(); quad(g, cam, [[0, BACK, 0], [W, BACK, 0], [W, BACK, 9], [0, BACK, 9]]); g.clip();
  g.strokeStyle = 'rgba(120,200,255,0.16)'; g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) { const x = 1 + i * 1.5, z = 1.5 + ((i * 37) % 7); const a = cam.P(x, BACK, z), b = cam.P(x, BACK, z + 2.5), d = cam.P(x + 1.2, BACK, z + 3.4); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(d.x, d.y); g.stroke(); g.fillStyle = 'rgba(120,200,255,0.3)'; g.beginPath(); g.arc(d.x, d.y, 2, 0, TAU); g.fill(); }
  g.restore();
  // side walls (acrylic)
  for (const x of [0, W]) {
    quad(g, cam, [[x, BACK, 0], [x, FRONT, 0], [x, FRONT, 3.2], [x, BACK, 6]]);
    g.fillStyle = 'rgba(120,170,255,0.10)'; g.fill(); g.strokeStyle = 'rgba(160,210,255,0.45)'; g.lineWidth = 2; g.stroke();
  }
  // floor
  quad(g, cam, [[0, BACK, 0], [W, BACK, 0], [W, FRONT, 0], [0, FRONT, 0]]);
  const f0 = cam.P(0, BACK, 0), f1 = cam.P(0, FRONT, 0);
  gr = g.createLinearGradient(0, f0.y, 0, f1.y); gr.addColorStop(0, '#2d3550'); gr.addColorStop(1, '#4b5676'); g.fillStyle = gr; g.fill();
  g.save(); g.clip(); g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
  for (let x = 0; x <= W; x += 1) { const a = cam.P(x, BACK, 0), b = cam.P(x, FRONT, 0); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  for (let y = 0; y <= FRONT; y += 1) { const a = cam.P(0, y, 0), b = cam.P(W, y, 0); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
  g.restore();
  // gutters at the front corners
  for (const [x0, x1] of [[0, GUT], [W - GUT, W]]) { quad(g, cam, [[x0, FRONT - 1.6, 0], [x1, FRONT - 1.6, 0], [x1, FRONT, 0], [x0, FRONT, 0]]); g.fillStyle = 'rgba(0,0,0,0.55)'; g.fill(); g.strokeStyle = 'rgba(255,60,90,0.6)'; g.lineWidth = 1.5; g.stroke(); }
  return c;
}
export function resetBackdrop() { bgCache = null; }

export function drawMachine(g, cam, game, V) {
  const f = game.f, rect = cam.rect;
  if (!bgCache || bgCache.key !== V.key) bgCache = { key: V.key, c: machineBackdrop(cam, rect, V.dpr) };
  g.drawImage(bgCache.c, 0, 0, bgCache.c.width / V.dpr, bgCache.c.height / V.dpr);
  const t = V.t;
  // energy ring on the back wall
  const ec = cam.P(W - 3.2, BACK, 4.2), er = 2.2 * ec.k;
  g.save();
  g.lineWidth = er * 0.18; g.strokeStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(ec.x, ec.y, er, 0, TAU); g.stroke();
  const en = game.fever > 0 ? game.fever / FEVER_TIME : game.energy / ENERGY_MAX;
  const rg = g.createLinearGradient(ec.x - er, 0, ec.x + er, 0); rg.addColorStop(0, '#2fb4ff'); rg.addColorStop(0.5, '#ff4fb0'); rg.addColorStop(1, '#ffc21f');
  g.strokeStyle = game.fever > 0 ? `hsl(${(t * 300) % 360},100%,65%)` : rg; g.shadowColor = g.strokeStyle; g.shadowBlur = 12 + (game.fever > 0 ? 10 * Math.sin(t * 12) : 0);
  g.beginPath(); g.arc(ec.x, ec.y, er, -Math.PI / 2, -Math.PI / 2 + TAU * en); g.stroke(); g.shadowBlur = 0;
  txt(g, game.fever > 0 ? 'x2' : Math.floor(en * 100) + '%', ec.x, ec.y, Math.max(9, er * (game.fever > 0 ? 0.7 : 0.42)), game.fever > 0 ? '#fff' : '#ffd75c');
  g.restore();
  // pusher block: top shelf + front face
  const pf = f.pf;
  quad(g, cam, [[0, BACK, PH], [W, BACK, PH], [W, pf, PH], [0, pf, PH]]);
  const s0 = cam.P(0, BACK, PH), s1 = cam.P(0, pf, PH);
  let gr = g.createLinearGradient(0, s0.y, 0, s1.y); gr.addColorStop(0, '#59627f'); gr.addColorStop(1, '#a9b3cf'); g.fillStyle = gr; g.fill();
  quad(g, cam, [[0, pf, 0], [W, pf, 0], [W, pf, PH], [0, pf, PH]]);
  const fa = cam.P(0, pf, PH), fb = cam.P(0, pf, 0);
  gr = g.createLinearGradient(0, fa.y, 0, fb.y); gr.addColorStop(0, '#e4e9f7'); gr.addColorStop(0.3, '#8e98b5'); gr.addColorStop(1, '#3c435c'); g.fillStyle = gr; g.fill();
  // neon trim on the pusher edge
  const n0 = cam.P(0, pf, PH), n1 = cam.P(W, pf, PH);
  g.strokeStyle = game.fever > 0 ? `hsl(${(t * 300) % 360},100%,65%)` : '#5cd0ff'; g.lineWidth = 2.5; g.shadowColor = g.strokeStyle; g.shadowBlur = 10;
  g.beginPath(); g.moveTo(n0.x, n0.y); g.lineTo(n1.x, n1.y); g.stroke(); g.shadowBlur = 0;

  // coins + towers, back to front
  const list = V.drawList || (V.drawList = []); list.length = 0;
  for (const c of f.coins) list.push(c);
  for (const T of f.towers) list.push(T);
  list.sort((a, b) => (a.y - b.y) || (a.z - b.z));
  const frontY = cam.P(W / 2, FRONT, 0).y;
  for (const c of list) {
    if (c.want !== undefined) { drawTower(g, cam, c, t); continue; }
    if (c.off && c.z < -0.2) continue;   // drawn after the front lip
    const glow = (c.k === 'B' || c.k === 'P' || c.k === 'Y') ? null : 0;
    drawCoin(g, cam, c.k, c.x, c.y, c.z, c.h, c.r, 1, glow);
  }
  // front lip and the falling coins disappearing behind it
  for (const c of f.coins) if (c.off && c.z < -0.2) drawCoin(g, cam, c.k, c.x, c.y, c.z, c.h, c.r, clamp(1 + c.z / 5, 0, 1));
  const l0 = cam.P(0, FRONT, 0), l1 = cam.P(W, FRONT, 0), l2 = cam.P(W, FRONT + 0.6, -2.5), l3 = cam.P(0, FRONT + 0.6, -2.5);
  g.beginPath(); g.moveTo(l0.x, l0.y); g.lineTo(l1.x, l1.y); g.lineTo(l2.x, rect.y + rect.h); g.lineTo(l3.x, rect.y + rect.h); g.closePath();
  gr = g.createLinearGradient(0, l0.y, 0, rect.y + rect.h); gr.addColorStop(0, '#1d1640'); gr.addColorStop(1, '#0a0618'); g.fillStyle = gr; g.fill();
  // edge glow
  const eg = V.edgeGlow || 0;
  g.strokeStyle = game.fever > 0 ? `hsl(${(t * 300 + 120) % 360},100%,65%)` : `rgba(255,${200 - eg * 80},${90 + eg * 100},${0.7 + eg * 0.3})`;
  g.lineWidth = 3 + eg * 3; g.shadowColor = '#ffd75c'; g.shadowBlur = 10 + eg * 20;
  const ga = cam.P(GUT, FRONT, 0), gb = cam.P(W - GUT, FRONT, 0);
  g.beginPath(); g.moveTo(ga.x, ga.y); g.lineTo(gb.x, gb.y); g.stroke(); g.shadowBlur = 0;
  g.strokeStyle = 'rgba(255,60,90,0.8)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(l0.x, l0.y); g.lineTo(ga.x, ga.y); g.moveTo(gb.x, gb.y); g.lineTo(l1.x, l1.y); g.stroke();
  // chevrons on the lip
  g.fillStyle = 'rgba(255,215,92,0.22)';
  for (let i = 0; i < 7; i++) { const x = ga.x + ((gb.x - ga.x) * (i + 0.5)) / 7, y = frontY + 10; const a = ((t * 2 + i * 0.25) % 1); g.globalAlpha = 0.25 + 0.5 * (1 - a); g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x, y + 7); g.lineTo(x + 8, y); g.lineTo(x + 8, y + 4); g.lineTo(x, y + 11); g.lineTo(x - 8, y + 4); g.fill(); }
  g.globalAlpha = 1;
}

function drawTower(g, cam, T, t) {
  const n = T.n; if (!n) return;
  const h = TH_T, k = T.gold ? 'g' : 'c';
  const ca = Math.cos(T.dir), sa = Math.sin(T.dir);
  const wob = T.state === 'stand' ? (T.wob || 0) : 0;
  const sway = wob * wob * 0.5 * Math.sin(t * (6 + wob * 8));
  const lean = T.state === 'fall' || T.state === 'teeter' ? T.ang : 0;
  // base glow ring
  const b = cam.P(T.x, T.y, 0);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(b.x, b.y, T.r * 1.3 * b.k, T.r * 1.3 * b.k * b.q, 0, 0, TAU); g.fill();
  const C = COLS[T.col] || COLS.B;
  if (T.state !== 'fall') { g.strokeStyle = C.glow; g.lineWidth = 2; g.globalAlpha = 0.5 + 0.4 * Math.sin(t * 6); g.beginPath(); g.ellipse(b.x, b.y, T.r * 1.5 * b.k, T.r * 1.5 * b.k * b.q, 0, 0, TAU); g.stroke(); g.globalAlpha = 1; }
  if (lean === 0 && sway === 0) {
    // fast path: one column with ridges, then the top face
    const top = cam.P(T.x, T.y, n * h), bot = cam.P(T.x, T.y, 0), rx = T.r * top.k;
    g.save(); g.shadowColor = C.glow; g.shadowBlur = 14; g.fillStyle = 'rgba(0,0,0,0.01)'; g.fillRect(top.x - rx, top.y, rx * 2, bot.y - top.y); g.restore();
    const gr = g.createLinearGradient(top.x - rx, 0, top.x + rx, 0);
    const cc = T.gold ? ['#7a4a06', '#ffe37a', '#c48816', '#6a3e04'] : ['#4b5466', '#eef2fa', '#9aa5b8', '#3d4556'];
    gr.addColorStop(0, cc[0]); gr.addColorStop(0.3, cc[1]); gr.addColorStop(0.6, cc[2]); gr.addColorStop(1, cc[3]);
    g.fillStyle = gr; g.fillRect(top.x - rx, top.y, rx * 2, bot.y - top.y);
    g.beginPath(); g.ellipse(bot.x, bot.y, rx, rx * bot.q, 0, 0, Math.PI); g.fill();
    // every coin's rim: a dark groove and a bright lip, so it reads as a stack of coins
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.beginPath();
    for (let i = 1; i < n; i++) { const p = cam.P(T.x, T.y, i * h); g.moveTo(p.x - rx, p.y); g.ellipse(p.x, p.y, rx, rx * p.q, 0, Math.PI, 0, true); }
    g.stroke();
    g.strokeStyle = T.gold ? 'rgba(255,245,190,0.55)' : 'rgba(255,255,255,0.45)'; g.beginPath();
    for (let i = 1; i < n; i++) { const p = cam.P(T.x, T.y, i * h); g.moveTo(p.x - rx * 0.7, p.y + 1.2); g.ellipse(p.x, p.y + 1.2, rx * 0.7, rx * 0.7 * p.q, 0, Math.PI * 0.85, Math.PI * 0.3, true); }
    g.stroke();
    // a soft neon wash in the tower colour
    const wash = g.createLinearGradient(0, top.y, 0, bot.y); wash.addColorStop(0, 'rgba(255,255,255,0)'); wash.addColorStop(1, C.glow + '55');
    g.fillStyle = wash; g.fillRect(top.x - rx, top.y, rx * 2, bot.y - top.y);
    drawCoin(g, cam, k, T.x, T.y, (n - 1) * h, h, T.r);
  } else {
    for (let i = 0; i < n; i++) {
      const hz = i * h + h / 2, s = Math.sin(lean), c = Math.cos(lean);
      const swx = sway * (hz / (n * h)) * (hz / 3);
      drawCoin(g, cam, k, T.x + ca * hz * s + swx, T.y + sa * hz * s, hz * c - h / 2, h, T.r);
    }
  }
  // the crown of tokens rides on top
  const topZ = n * h;
  T.crown.forEach((ck, i) => {
    const hz = topZ + i * KIND.B.h, s = Math.sin(lean), c = Math.cos(lean);
    const swx = sway * (topZ / 3);
    drawCoin(g, cam, ck, T.x + ca * hz * s + swx, T.y + sa * hz * s, hz * c, KIND.B.h, KIND.B.r, 1, COLS[ck].glow);
  });
  if (T.state === 'build') {
    const p = cam.P(T.x, T.y, topZ + 1.2);
    txt(g, String(n), p.x, p.y - 10, Math.max(14, p.k * 1.6), '#fff', { glow: C.glow });
  }
}

// launcher: a glowing nozzle that slides along the top of the back wall
export function drawLauncher(g, cam, aim, t, firing, bank) {
  const x = lerp(1.2, W - 1.2, aim);
  const p = cam.P(x, BACK + 0.3, CHUTE_Z + 0.6), q = cam.P(x, BACK + 3.2, PH);
  // rail
  const a = cam.P(0.6, BACK + 0.3, CHUTE_Z + 0.6), b = cam.P(W - 0.6, BACK + 0.3, CHUTE_Z + 0.6);
  g.strokeStyle = 'rgba(120,200,255,0.35)'; g.lineWidth = 4; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
  // aim guide
  g.setLineDash([4, 6]); g.lineDashOffset = -t * 30; g.strokeStyle = 'rgba(255,215,92,0.55)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(p.x, p.y + 6); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
  g.fillStyle = 'rgba(255,215,92,0.4)'; g.beginPath(); g.ellipse(q.x, q.y, 1.1 * q.k, 1.1 * q.k * q.q, 0, 0, TAU); g.fill();
  // nozzle
  const s = Math.max(10, p.k * 1.4);
  g.save(); g.translate(p.x, p.y);
  rr(g, -s, -s * 0.7, s * 2, s * 1.3, s * 0.4); const gr = g.createLinearGradient(0, -s, 0, s); gr.addColorStop(0, '#ffe680'); gr.addColorStop(1, '#ff8a1f'); g.fillStyle = gr; g.fill();
  g.lineWidth = 2; g.strokeStyle = '#3a1d05'; g.stroke();
  g.fillStyle = firing ? '#fff' : '#3a1d05'; rr(g, -s * 0.55, s * 0.2, s * 1.1, s * 0.35, 3); g.fill();
  if (firing) { g.shadowColor = '#ffd75c'; g.shadowBlur = 16; g.fillStyle = 'rgba(255,240,180,0.8)'; g.fillRect(-s * 0.5, s * 0.25, s, s * 0.25); g.shadowBlur = 0; }
  if (bank <= 0) txt(g, 'EMPTY', 0, -s * 1.3, 11, '#ff6b74');
  g.restore();
}

// ------------------------------------------------------------------------------------------------ battle screen
let skyCache = null;
function skyline(w, h, dpr) {
  const c = mk(Math.ceil(w * dpr), Math.ceil(h * dpr)), g = c.getContext('2d'); g.scale(dpr, dpr);
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b0730'); gr.addColorStop(0.55, '#33186b'); gr.addColorStop(0.8, '#7a2a8a'); gr.addColorStop(1, '#ff5f9e'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
  let s = 7; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + rnd() * 0.7})`; const r = rnd() * 1.4 + 0.3; g.fillRect(rnd() * w, rnd() * h * 0.6, r, r); }
  // planet
  const px = w * 0.62, py = h * 0.25, pr = h * 0.16;
  const pg = g.createRadialGradient(px - pr * 0.4, py - pr * 0.4, 2, px, py, pr); pg.addColorStop(0, '#ffd1f0'); pg.addColorStop(1, '#8a3cc4'); g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,200,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(px, py, pr * 1.7, pr * 0.35, -0.3, 0, TAU); g.stroke();
  // two layers of towers
  for (const [layer, col, hm] of [[0, '#2a1454', 0.55], [1, '#170b36', 0.4]]) {
    let x = -10;
    while (x < w + 10) {
      const bw = 14 + rnd() * 30, bh = h * (0.15 + rnd() * hm);
      g.fillStyle = col; g.fillRect(x, h - bh, bw, bh);
      for (let wy = h - bh + 6; wy < h - 4; wy += 7) for (let wx = x + 3; wx < x + bw - 4; wx += 6) if (rnd() < 0.35) { g.fillStyle = rnd() < 0.5 ? 'rgba(92,208,255,0.55)' : 'rgba(255,124,204,0.5)'; g.fillRect(wx, wy, 2.5, 3); }
      x += bw + (layer ? 2 : 6);
    }
  }
  return c;
}
export function resetSky() { skyCache = null; }

export function drawMew(g, x, y, s, t, pose = 'idle') {
  // Mew, the cat mech: a round yellow pod with stubby arms, a jet pack and a cat pilot in a glass dome. Feet at (x, y), ~170px tall at s=1.
  g.save(); g.translate(x, y); g.scale(s, s);
  const bob = Math.sin(t * 3) * 3 + (pose === 'attack' ? -6 : 0);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(0, 0, 50, 9, 0, 0, TAU); g.fill();
  g.translate(0, bob);
  // flames
  const fl = 10 + Math.sin(t * 40) * 4 + (pose === 'attack' ? 14 : 0);
  g.fillStyle = '#ffd75c'; g.beginPath(); g.moveTo(-44, -40); g.lineTo(-58 - fl, -30); g.lineTo(-44, -22); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(-44, -36); g.lineTo(-52 - fl * 0.5, -31); g.lineTo(-44, -27); g.fill();
  g.lineJoin = 'round'; g.strokeStyle = '#3a1d05'; g.lineWidth = 5;
  // legs
  g.fillStyle = '#6b5a4a'; for (const lx of [-22, 18]) { rr(g, lx - 8, -26, 16, 22, 5); g.fill(); g.stroke(); rr(g, lx - 13, -8, 26, 10, 5); g.fillStyle = '#ffb02e'; g.fill(); g.stroke(); g.fillStyle = '#6b5a4a'; }
  // jet pack
  rr(g, -54, -64, 18, 44, 8); g.fillStyle = '#8c95ad'; g.fill(); g.stroke();
  // body pod
  const gr = g.createLinearGradient(-40, -100, 40, -20); gr.addColorStop(0, '#fff0a6'); gr.addColorStop(0.5, '#ffc21f'); gr.addColorStop(1, '#d98a0a');
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, -58, 44, 40, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = '#3a1d05'; g.globalAlpha = 0.15; g.beginPath(); g.ellipse(6, -44, 34, 22, 0, 0, Math.PI); g.fill(); g.globalAlpha = 1;
  // stripes on the pod
  g.strokeStyle = '#b5620c'; g.lineWidth = 5; for (const k of [-16, 0, 16]) { g.beginPath(); g.moveTo(k - 6, -24); g.lineTo(k, -36); g.stroke(); }
  g.strokeStyle = '#3a1d05'; g.lineWidth = 5;
  // arm (punch on attack)
  const ax = pose === 'attack' ? 70 : 42 + Math.sin(t * 3 + 1) * 2;
  g.fillStyle = '#8c95ad'; rr(g, 30, -66, ax - 26, 14, 7); g.fill(); g.stroke();
  g.fillStyle = '#ffc21f'; g.beginPath(); g.arc(ax + 6, -59, 12, 0, TAU); g.fill(); g.stroke();
  // glass dome with the cat
  g.save(); g.beginPath(); g.ellipse(4, -96, 34, 30, 0, 0, TAU); g.clip();
  g.fillStyle = 'rgba(150,220,255,0.35)'; g.fillRect(-40, -130, 90, 70);
  catFace(g, 6, -88, 22, '#ffb02e', { blink: (t % 4) > 3.85 });
  g.restore();
  g.strokeStyle = '#3a1d05'; g.lineWidth = 4; g.beginPath(); g.ellipse(4, -96, 34, 30, 0, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3; g.beginPath(); g.ellipse(4, -96, 26, 22, 0, Math.PI * 1.15, Math.PI * 1.5); g.stroke();
  // antenna
  g.strokeStyle = '#3a1d05'; g.lineWidth = 3; g.beginPath(); g.moveTo(14, -125); g.lineTo(20, -142); g.stroke();
  g.fillStyle = Math.sin(t * 6) > 0 ? '#ff4fb0' : '#ffd75c'; g.beginPath(); g.arc(20, -144, 5, 0, TAU); g.fill(); g.stroke();
  g.restore();
}

// enemies: drawn facing left, centre at (x, y), size ~ s*120 px
export function drawFoe(g, kind, x, y, s, t, flash = 0) {
  g.save(); g.translate(x, y); g.scale(s, s);
  g.lineJoin = 'round'; g.lineCap = 'round';
  const ink = '#14081f', L = 4.5;
  const body = (fn) => { fn(); };
  const eye = (ex, ey, r, col = '#ff3b47') => { g.fillStyle = '#fff'; g.beginPath(); g.arc(ex, ey, r, 0, TAU); g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke(); g.fillStyle = col; g.beginPath(); g.arc(ex - r * 0.25, ey, r * 0.55, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - r * 0.4, ey - r * 0.25, r * 0.18, 0, TAU); g.fill(); };
  const rotor = (rx, ry, w) => { g.fillStyle = 'rgba(210,230,255,0.35)'; g.beginPath(); g.ellipse(rx, ry, w, w * 0.25, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2; const a = t * 40; g.beginPath(); g.moveTo(rx + Math.cos(a) * w, ry + Math.sin(a) * w * 0.25); g.lineTo(rx - Math.cos(a) * w, ry - Math.sin(a) * w * 0.25); g.stroke(); };
  const drone = (dx, dy, sc) => {
    g.save(); g.translate(dx, dy); g.scale(sc, sc);
    g.strokeStyle = ink; g.lineWidth = L;
    g.fillStyle = '#5a6380'; for (const ax of [-46, 46]) { g.beginPath(); g.moveTo(0, -8); g.lineTo(ax, -24); g.stroke(); }
    g.fillStyle = '#c7cfdf'; g.beginPath(); g.ellipse(0, 0, 40, 26, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#7d3cff'; for (const sx of [-30, 0, 30]) { g.beginPath(); g.moveTo(sx - 7, -20); g.lineTo(sx, -40); g.lineTo(sx + 7, -20); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = '#2bd67b'; rr(g, -26, 2, 52, 10, 5); g.fill(); g.stroke();
    eye(-14, -4, 10);
    g.fillStyle = '#3d4456'; rr(g, -56, 6, 20, 8, 3); g.fill(); g.stroke();
    rotor(-46, -26, 22); rotor(46, -26, 22);
    g.restore();
  };
  const bob = Math.sin(t * 2.4) * 6;
  if (kind === 'drone') drone(0, bob, 1);
  else if (kind === 'drone2') { drone(18, -26 + bob, 0.8); drone(-16, 30 - bob, 0.8); }
  else if (kind === 'crab') {
    g.strokeStyle = ink; g.lineWidth = L; g.fillStyle = '#c4572f';
    for (let i = 0; i < 3; i++) for (const sg of [-1, 1]) { const lx = sg * (18 + i * 14); g.beginPath(); g.moveTo(lx, 20); g.lineTo(lx + sg * 14, 44 + Math.sin(t * 8 + i) * 3); g.stroke(); }
    g.beginPath(); g.ellipse(0, 10, 52, 32, 0, Math.PI, 0); g.lineTo(52, 22); g.lineTo(-52, 22); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#8a3a1c'; for (const bx of [-30, -10, 10, 30]) { g.beginPath(); g.arc(bx, -6, 3, 0, TAU); g.fill(); }
    const cl = Math.sin(t * 5) * 0.3;
    g.fillStyle = '#e06a3c'; g.save(); g.translate(-58, -4); g.rotate(-0.4 + cl); g.beginPath(); g.ellipse(-14, 0, 20, 13, 0, 0.5, TAU - 0.5); g.lineTo(-14, 0); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.save(); g.translate(58, -4); g.rotate(0.4 - cl); g.beginPath(); g.ellipse(14, 0, 20, 13, 0, Math.PI + 0.5, Math.PI - 0.5 + TAU); g.lineTo(14, 0); g.closePath(); g.fill(); g.stroke(); g.restore();
    g.strokeStyle = ink; g.lineWidth = 3; g.beginPath(); g.moveTo(-12, -22); g.lineTo(-14, -38); g.moveTo(12, -22); g.lineTo(14, -38); g.stroke();
    eye(-14, -42, 8, '#ffd75c'); eye(14, -42, 8, '#ffd75c');
  } else if (kind === 'saucer') {
    g.translate(0, bob);
    g.strokeStyle = ink; g.lineWidth = L;
    g.fillStyle = 'rgba(120,255,200,0.18)'; g.beginPath(); g.moveTo(-22, 16); g.lineTo(-40, 70); g.lineTo(40, 70); g.lineTo(22, 16); g.fill();
    g.fillStyle = 'rgba(160,230,255,0.6)'; g.beginPath(); g.ellipse(0, -10, 28, 26, 0, Math.PI, 0); g.fill(); g.stroke();
    g.fillStyle = '#4bd16a'; g.beginPath(); g.arc(0, -14, 13, 0, TAU); g.fill(); g.stroke(); eye(-4, -16, 6, '#1d1d1d');
    g.fillStyle = '#9aa5c0'; g.beginPath(); g.ellipse(0, 4, 62, 16, 0, 0, TAU); g.fill(); g.stroke();
    for (let i = 0; i < 6; i++) { const a = t * 4 + i; g.fillStyle = Math.sin(a * 2) > 0 ? '#ffd75c' : '#ff4fb0'; g.beginPath(); g.arc(-45 + i * 18, 6, 4, 0, TAU); g.fill(); }
  } else if (kind === 'eel') {
    g.strokeStyle = ink; g.lineWidth = L;
    g.beginPath(); for (let i = 0; i <= 20; i++) { const px = -50 + i * 6, py = Math.sin(t * 4 + i * 0.5) * 12 + bob; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.lineWidth = 30; g.strokeStyle = ink; g.stroke(); g.lineWidth = 22; g.strokeStyle = '#2a7bff'; g.stroke();
    g.lineWidth = 4; g.strokeStyle = '#a8e4ff'; g.setLineDash([6, 8]); g.lineDashOffset = -t * 40; g.stroke(); g.setLineDash([]);
    g.fillStyle = '#2a7bff'; g.strokeStyle = ink; g.lineWidth = L; g.beginPath(); g.ellipse(-56, Math.sin(t * 4) * 12 + bob, 22, 18, 0, 0, TAU); g.fill(); g.stroke();
    eye(-62, Math.sin(t * 4) * 12 + bob - 4, 7, '#ffd75c');
    g.strokeStyle = '#ffe680'; g.lineWidth = 2.5; for (let i = 0; i < 3; i++) { const a = t * 9 + i * 2; g.beginPath(); g.moveTo(-20 + i * 25, -20 + bob); g.lineTo(-14 + i * 25 + Math.sin(a) * 6, -34 + bob); g.lineTo(-22 + i * 25, -40 + bob); g.stroke(); }
  } else if (kind === 'boss_mech') {
    g.strokeStyle = ink; g.lineWidth = L;
    g.fillStyle = '#4b5470'; for (const lx of [-30, 18]) { rr(g, lx, 20, 20, 44, 6); g.fill(); g.stroke(); }
    g.fillStyle = '#7b2bd6'; rr(g, -56, -40, 112, 66, 16); g.fill(); g.stroke();
    g.fillStyle = '#ffd75c'; rr(g, -38, -6, 76, 10, 4); g.fill(); g.stroke();
    g.fillStyle = '#9aa5c0'; rr(g, -34, -84, 68, 48, 14); g.fill(); g.stroke();
    g.fillStyle = '#ff3b47'; g.beginPath(); g.moveTo(-24, -70); g.lineTo(24, -70); g.lineTo(18, -54); g.lineTo(-18, -54); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 8); g.fillRect(-16, -66, 32, 5); g.globalAlpha = 1;
    g.fillStyle = '#c7cfdf'; for (const sg of [-1, 1]) { g.save(); g.translate(sg * 62, -30); g.rotate(sg * (0.2 + Math.sin(t * 2) * 0.1)); rr(g, -12, -10, 24, 54, 10); g.fill(); g.stroke(); g.fillStyle = '#3d4456'; g.beginPath(); g.arc(0, 50, 14, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#c7cfdf'; g.restore(); }
    g.fillStyle = '#7d3cff'; for (const sx of [-24, 0, 24]) { g.beginPath(); g.moveTo(sx - 8, -84); g.lineTo(sx, -104); g.lineTo(sx + 8, -84); g.closePath(); g.fill(); g.stroke(); }
  } else if (kind === 'boss_squid') {
    g.translate(0, bob);
    g.strokeStyle = ink; g.lineWidth = L;
    for (let i = 0; i < 6; i++) {
      const bx = -40 + i * 16; g.beginPath(); g.moveTo(bx, 10);
      for (let k = 1; k <= 6; k++) g.lineTo(bx + Math.sin(t * 3 + i + k * 0.7) * 8, 10 + k * 11);
      g.lineWidth = 12; g.strokeStyle = ink; g.stroke(); g.lineWidth = 7; g.strokeStyle = '#ff4fb0'; g.stroke();
    }
    g.lineWidth = L; g.strokeStyle = ink;
    const gr = g.createRadialGradient(-10, -40, 4, 0, -20, 60); gr.addColorStop(0, '#ffc0e3'); gr.addColorStop(1, '#b0247a');
    g.fillStyle = gr; g.beginPath(); g.ellipse(0, -24, 56, 48, 0, 0, TAU); g.fill(); g.stroke();
    for (let i = 0; i < 5; i++) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.beginPath(); g.arc(-30 + i * 15, -50 + (i % 2) * 10, 5, 0, TAU); g.fill(); }
    eye(-22, -18, 14, '#7d3cff'); eye(18, -18, 14, '#7d3cff');
    g.strokeStyle = ink; g.lineWidth = 4; g.beginPath(); g.arc(-2, 6, 10, 0.2, Math.PI - 0.2); g.stroke();
  }
  if (flash > 0) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = `rgba(255,255,255,${flash})`; g.fillRect(-150, -150, 300, 300); }
  g.restore();
}

// the whole battle panel. B is the presentation state from main.js
export function drawBattle(g, rect, game, B, t, dpr) {
  const { x, y, w, h } = rect;
  if (!skyCache || skyCache.w !== w || skyCache.h !== h) skyCache = { w, h, c: skyline(w, h, dpr) };
  g.save(); rr(g, x, y, w, h, 14); g.clip();
  g.drawImage(skyCache.c, x, y, w, h);
  // moving floor grid
  const gy = y + h * 0.76;
  const fg = g.createLinearGradient(0, gy, 0, y + h); fg.addColorStop(0, '#2b0f4a'); fg.addColorStop(1, '#0c0420'); g.fillStyle = fg; g.fillRect(x, gy, w, y + h - gy);
  g.strokeStyle = 'rgba(255,79,176,0.45)'; g.lineWidth = 1;
  for (let i = 0; i < 6; i++) { const k = ((i + (t * 0.8) % 1) / 6); const yy = gy + (y + h - gy) * k * k; g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke(); }
  for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(x + w / 2 + i * w * 0.06, gy); g.lineTo(x + w / 2 + i * w * 0.2, y + h); g.stroke(); }
  g.strokeStyle = '#ff7ccc'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, gy); g.lineTo(x + w, gy); g.stroke();
  if (game.fever > 0) { g.fillStyle = `hsla(${(t * 200) % 360},100%,60%,0.12)`; g.fillRect(x, y, w, h); }

  const sh = B.shake ? (Math.random() - 0.5) * B.shake : 0;
  g.translate(sh, sh * 0.5);
  // heroes
  const hs = h * 0.00175;
  for (const H of B.heroes) {
    const hx = x + w * H.x + H.dx, hy = gy + h * 0.06 + H.dy;
    if (H.glow > 0) { g.fillStyle = `rgba(255,255,200,${H.glow * 0.4})`; g.beginPath(); g.ellipse(hx, hy - h * 0.25, h * 0.2, h * 0.32, 0, 0, TAU); g.fill(); }
    if (H.id === 'mew') drawMew(g, hx, hy, h * 0.003, t, H.pose);
    else if (window.RJ && window.RJ.draw) window.RJ.draw(g, H.id === 'rox' ? 'roxor' : 'jasmin', { x: hx, y: hy, s: hs * (H.id === 'jas' ? 0.98 : 1), pose: H.pose, t: t + (H.id === 'jas' ? 1.7 : 0) });
    const hero = game.heroes.find((q) => q.id === H.id), C = COLS[hero.col];
    // label: level and attack
    const ly = hy + 13;
    rr(g, hx - 27, ly - 8, 54, 16, 8); g.fillStyle = 'rgba(10,6,30,0.75)'; g.fill(); g.strokeStyle = C.main; g.lineWidth = 1.5; g.stroke();
    txt(g, 'Lv' + hero.lv, hx - 12, ly + 1, 9, C.light, { lw: 2 });
    txt(g, '⚔' + heroAtk(hero.lv), hx + 12, ly + 1, 9, '#fff', { lw: 2 });
    // xp pips
    const need = xpNeed(hero.lv);
    for (let i = 0; i < need; i++) { g.fillStyle = i < hero.xp ? C.main : 'rgba(255,255,255,0.2)'; g.fillRect(hx - 22 + (i * 44) / need + 1, ly + 10, 44 / need - 2, 3); }
  }
  // enemy
  const E = B.foe;
  if (E && E.alpha > 0) {
    const ex = x + w * 0.79 + E.dx, ey = y + h * 0.58 + E.dy;
    g.globalAlpha = E.alpha;
    g.save(); g.translate(ex, ey); g.scale(E.scale, E.scale);
    drawFoe(g, E.kind, 0, 0, h * (E.boss ? 0.0068 : 0.0052), t, E.flash);
    g.restore();
    g.globalAlpha = 1;
  }
  g.translate(-sh, -sh * 0.5);
  // enemy hp bar
  if (E && E.alpha > 0.2) {
    const bw = w * 0.4, bx = x + w - bw - 10, by = y + h * 0.27 - 8;
    txt(g, (E.boss ? '★ ' : '') + E.name, bx + bw, by - 9, 11, E.boss ? '#ffd75c' : '#fff', { align: 'right', lw: 3 });
    rr(g, bx, by, bw, 14, 7); g.fillStyle = 'rgba(10,6,30,0.85)'; g.fill();
    const k = clamp(E.shown / E.max, 0, 1), k2 = clamp(E.lag / E.max, 0, 1);
    if (k2 > k) { rr(g, bx + 2, by + 2, (bw - 4) * k2, 10, 5); g.fillStyle = '#fff'; g.fill(); }
    if (k > 0) { rr(g, bx + 2, by + 2, Math.max(10, (bw - 4) * k), 10, 5); const hg = g.createLinearGradient(bx, 0, bx + bw, 0); hg.addColorStop(0, '#2bd67b'); hg.addColorStop(1, '#a6ff5c'); g.fillStyle = hg; g.fill(); }
    txt(g, String(Math.ceil(E.shown)), bx + bw / 2, by + 7.5, 10, '#fff', { lw: 3 });
  }
  // sector label
  txt(g, B.stage, x + 10, y + h * 0.27 - 17, 10, '#bfe6ff', { align: 'left', lw: 3 });
  // token row (6 slots) across the top
  const n = ROW, sl = Math.min(w * 0.115, h * 0.2), gap = sl * 0.18, tw = n * sl + (n - 1) * gap, tx = x + (w - tw) / 2, ty = y + 6;
  rr(g, tx - 8, ty - 3, tw + 16, sl + 6, sl * 0.35); g.fillStyle = 'rgba(8,4,24,0.7)'; g.fill(); g.strokeStyle = 'rgba(160,210,255,0.35)'; g.lineWidth = 1.5; g.stroke();
  B.slots = [];
  for (let i = 0; i < n; i++) {
    const sx = tx + i * (sl + gap), cx = sx + sl / 2, cy = ty + sl / 2;
    B.slots.push([cx, cy, sl]);
    g.fillStyle = 'rgba(255,255,255,0.06)'; g.beginPath(); g.arc(cx, cy, sl * 0.44, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 1; g.stroke();
    const k = B.row[i];
    if (k) {
      const pop = B.rowPop[i] || 0, sz = sl * 0.92 * (1 + pop * 0.35);
      const same = B.row.filter((q) => q === k).length;
      if (same === 2) { g.shadowColor = COLS[k].glow; g.shadowBlur = 8 + 6 * Math.sin(t * 8); }
      g.drawImage(SPR[k], cx - sz / 2, cy - sz / 2, sz, sz); g.shadowBlur = 0;
    }
  }
  g.restore();
  // panel frame
  rr(g, x, y, w, h, 14); g.strokeStyle = game.fever > 0 ? `hsl(${(t * 300) % 360},100%,65%)` : 'rgba(92,208,255,0.6)'; g.lineWidth = 2.5; g.stroke();
}

// ------------------------------------------------------------------------------------------------ the Galaxy Wheel
export function pocketAngle(i) { return -Math.PI / 2 + ((i + 0.5) * TAU) / WHEEL.length; }
export function drawWheel(g, cx, cy, R, rot, ball, t, hiPocket, hiT, lights) {
  const N = WHEEL.length;
  // outer neon ring
  g.save();
  g.lineWidth = R * 0.09; const ring = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); ring.addColorStop(0, '#2fb4ff'); ring.addColorStop(0.5, '#a24bff'); ring.addColorStop(1, '#ff4fb0');
  g.strokeStyle = ring; g.shadowColor = '#a24bff'; g.shadowBlur = 20; g.beginPath(); g.arc(cx, cy, R * 1.06, 0, TAU); g.stroke(); g.shadowBlur = 0;
  // chasing bulbs
  for (let i = 0; i < 36; i++) { const a = (i / 36) * TAU, on = ((i + Math.floor(t * (lights || 10))) % 4) === 0; g.fillStyle = on ? '#fff6c0' : 'rgba(255,255,255,0.25)'; if (on) { g.shadowColor = '#ffd75c'; g.shadowBlur = 10; } g.beginPath(); g.arc(cx + Math.cos(a) * R * 1.06, cy + Math.sin(a) * R * 1.06, R * 0.022, 0, TAU); g.fill(); g.shadowBlur = 0; }
  // ball track
  g.fillStyle = '#0b0820'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * 0.86, 0, TAU); g.stroke();
  // wedges
  g.translate(cx, cy); g.rotate(rot);
  for (let i = 0; i < N; i++) {
    const P = WHEEL[i], C = COLS[P.c], a0 = -Math.PI / 2 + (i * TAU) / N, a1 = a0 + TAU / N;
    g.beginPath(); g.moveTo(Math.cos(a0) * R * 0.2, Math.sin(a0) * R * 0.2); g.arc(0, 0, R * 0.84, a0 + 0.02, a1 - 0.02); g.arc(0, 0, R * 0.22, a1 - 0.04, a0 + 0.04, true); g.closePath();
    const wg = g.createRadialGradient(0, 0, R * 0.2, 0, 0, R * 0.84); wg.addColorStop(0, C.dark); wg.addColorStop(0.6, C.main); wg.addColorStop(1, C.light);
    g.fillStyle = wg; g.fill();
    if (hiPocket === i) { g.fillStyle = `rgba(255,255,255,${0.35 + 0.35 * Math.sin(hiT * 14)})`; g.fill(); }
    g.strokeStyle = '#0b0820'; g.lineWidth = 3; g.stroke();
    const am = (a0 + a1) / 2;
    // hole
    const hx = Math.cos(am) * R * 0.7, hy = Math.sin(am) * R * 0.7;
    g.fillStyle = '#05030f'; g.beginPath(); g.arc(hx, hy, R * 0.085, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.stroke();
    // label
    g.save(); g.translate(Math.cos(am) * R * 0.45, Math.sin(am) * R * 0.45); g.rotate(am + Math.PI / 2);
    const lab = P.c === 'JP' ? 'JP' : P.x2 ? 'x2' : P.lv ? 'LV↑' : String(TOWER[P.c]);
    txt(g, lab, 0, 0, R * (P.c === 'JP' ? 0.13 : 0.1), '#fff', { lw: R * 0.025 });
    g.restore();
  }
  g.rotate(-rot);
  // hub
  const hg = g.createRadialGradient(-R * 0.05, -R * 0.05, 2, 0, 0, R * 0.22); hg.addColorStop(0, '#d8deeb'); hg.addColorStop(1, '#4b5470');
  g.fillStyle = hg; g.beginPath(); g.arc(0, 0, R * 0.2, 0, TAU); g.fill(); g.strokeStyle = '#0b0820'; g.lineWidth = 3; g.stroke();
  txt(g, 'GALAXY', 0, -R * 0.045, R * 0.06, '#ffd75c', { lw: R * 0.015 }); txt(g, 'WHEEL', 0, R * 0.045, R * 0.06, '#5cd0ff', { lw: R * 0.015 });
  // pointer arrows at left and right (like the cabinet's two gold arrows)
  // ball
  if (ball) {
    const bx = Math.cos(ball.a) * R * ball.r, by = Math.sin(ball.a) * R * ball.r - (ball.hop || 0) * R;
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(Math.cos(ball.a) * R * ball.r + 3, Math.sin(ball.a) * R * ball.r + 4, R * 0.055, R * 0.04, 0, 0, TAU); g.fill();
    g.drawImage(SPR.ball, bx - R * 0.06, by - R * 0.06, R * 0.12, R * 0.12);
  }
  g.restore();
}
