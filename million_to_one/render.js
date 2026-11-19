// Million To One: everything drawn on the canvas. Reads a Race, never changes it.
// Art direction: cartoon biology. Squishy, glossy, a bit silly. No image files: every
// sprite, tile and glow is painted in code (some of it once, into offscreen canvases).
import { VIEW_W, channel, centre, zoneIndex, ZSTART, FORK_Y0, FORK_END, DEAD_Y } from './core.js';
import { ZONES, RACE_LEN } from './content.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const h1 = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const RGBC = new Map();
const rgb = (hex) => {
  let v = RGBC.get(hex);
  if (!v) { const n = parseInt(String(hex).replace('#', '').slice(0, 6), 16) || 0; v = [n >> 16, (n >> 8) & 255, n & 255]; RGBC.set(hex, v); }
  return v;
};
const css = (a, al = 1) => `rgba(${a[0] | 0},${a[1] | 0},${a[2] | 0},${al})`;
const lerpC = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hexA = (hex, a) => css(rgb(hex), a);
const FRUIT = ['#ff4d6d', '#5b7cff', '#ffa630', '#b84dff', '#ff6b9a'];
const CROWD = ['#f3f0ff', '#fff0f6', '#eefcff', '#fffbe8', '#f0fff4', '#f7efff'];
const CAPS = ['#ff3d6e', '#5b7cff', '#2fd17a', '#ffa630', '#b84dff'];
const FACE_ACC = [[], ['glasses'], ['stache'], ['bow', 'lashes'], ['cap'], ['shades']];
const BOSS_LOOK = {
  Steve: { acc: ['cap'], cap: '#5b7cff', mouth: 'grin' },
  Brock: { acc: ['band', 'stache'], band: '#ff7a2f', brow: 'angry' },
  Tiffany: { acc: ['bow', 'lashes', 'glasses'], mouth: 'smirk' },
  Gunther: { acc: ['mohawk', 'shades'], mouth: 'grin' },
  Chad: { acc: ['crown', 'shades'], mouth: 'smirk' },
};
const FONT = '"Baloo 2", system-ui, sans-serif';
const TS = 1.25, TW = 440, TH = 720;          // backdrop tile: logical size and pixel scale
const MAXP = 420;

function mk(w, h) {
  if (typeof document !== 'undefined') { const k = document.createElement('canvas'); k.width = w; k.height = h; return k; }
  return new OffscreenCanvas(w, h);
}
function seeded(s) { return () => { s |= 0; s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Renderer {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.parts = []; this.pops = []; this.rings = []; this.shake = 0; this.flash = 0; this.flashCol = '#fff';
    this.trail = []; this.time = 0; this.zoom = 1; this.zoomK = 0;
    this.glows = new Map(); this.tiles = new Map(); this.vig = null;
    this.wbcState = new WeakMap();
    this.sq = 0; this.sqV = 0; this.prev = { dashT: 0, frenzyT: 0, inv: 0, stuck: 0, shield: 0 };
    this.pHit = 0; this.sweatT = 0; this.eggJig = 0; this.lastDrill = 0;
    this.s = 1; this.H = 800; this.camY = null;
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.s = this.cv.width / VIEW_W; this.H = this.cv.height / this.s; this.dpr = dpr;
  }
  // world -> screen (logical units; the canvas transform scales to pixels)
  sy(wy) { return this.H - (wy - this.camY); }

  // ---------------------------------------------------------------- public juice
  addP(q) { if (this.parts.length >= MAXP) this.parts.shift(); this.parts.push(q); }
  burst(x, y, col, n = 10, spd = 120, life = 0.6, size = 3) {
    n = Math.min(n, 60);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = spd * (0.3 + Math.random());
      this.addP({ k: i % 4 === 0 ? 1 : 0, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col, size: size * (0.5 + Math.random()), g: 0, rot: 0, vr: 0 });
    }
  }
  pop(x, y, text, col = '#fff', size = 16, life = 1.1) {
    this.pops.push({ x, y, text, col, size, life, max: life, rot: (Math.random() - 0.5) * 0.25 });
    if (this.pops.length > 30) this.pops.shift();
  }
  // an expanding shockwave ring at world (x, y)
  ring(x, y, col = '#fff', r = 70, life = 0.45, w = 5) {
    this.rings.push({ x, y, col, r, life, max: life, w });
    if (this.rings.length > 16) this.rings.shift();
  }
  // party paper. With no position it rains from the top of the screen.
  confetti(x, y, n = 60) {
    const rain = x == null;
    n = Math.min(n, 120);
    for (let i = 0; i < n; i++) {
      const col = ['#ffd75c', '#ff5c8a', '#5ce1ff', '#7dffb0', '#b84dff', '#ffffff'][i % 6];
      const px = rain ? Math.random() * VIEW_W : x, py = rain ? this.camY + this.H + 20 + Math.random() * 120 : y;
      const a = Math.random() * TAU, v = rain ? 40 : 160 + Math.random() * 260;
      this.addP({ k: 2, x: px, y: py, vx: Math.cos(a) * v, vy: rain ? -60 - Math.random() * 80 : Math.sin(a) * v + 160, life: 2.4, max: 2.4, col, size: 3 + Math.random() * 3, g: 260, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14 });
    }
  }
  // a quick camera zoom-in on the player that springs back
  zoomPunch(amt = 0.08) { this.zoomK = Math.max(this.zoomK, Math.min(0.25, amt)); }

  // ---------------------------------------------------------------- cached sprites
  glow(col) {
    let g = this.glows.get(col);
    if (!g) {
      g = mk(64, 64); const x = g.getContext('2d'), c = rgb(col);
      const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, css(c, 1)); gr.addColorStop(0.35, css(c, 0.45)); gr.addColorStop(1, css(c, 0));
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64); this.glows.set(col, g);
    }
    return g;
  }
  dglow(col, x, y, r, a = 1) { const c = this.ctx; c.globalAlpha = a; c.drawImage(this.glow(col), x - r, y - r, r * 2, r * 2); c.globalAlpha = 1; }
  vignette() {
    if (!this.vig) {
      const mkV = (inner) => {
        const k = mk(256, 256), x = k.getContext('2d'), g = x.createRadialGradient(128, 150, 50, 128, 150, 190);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.6, inner.replace('A', '0.15')); g.addColorStop(1, inner.replace('A', '0.75'));
        x.fillStyle = g; x.fillRect(0, 0, 256, 256); return k;
      };
      this.vig = [mkV('rgba(10,0,10,A)'), mkV('rgba(150,0,30,A)')];
    }
    return this.vig;
  }
  tile(zi) {
    let t = this.tiles.get(zi);
    if (t) return t;
    if (this.tiles.size >= 4) this.tiles.delete(this.tiles.keys().next().value);
    t = mk(Math.round(TW * TS), Math.round(TH * TS));
    const g = t.getContext('2d'); g.scale(TS, TS);
    paintTile(g, ZONES[zi], zi);
    this.tiles.set(zi, t); return t;
  }

  // ---------------------------------------------------------------- frame
  draw(race, dt) {
    const c = this.ctx, p = race.p; this.time += dt;
    const lead = race.drill ? 0.5 : 0.27;
    const target = p.y - this.H * lead;
    this.camY = this.camY == null ? target : this.camY + (target - this.camY) * Math.min(1, dt * 8);
    this.react(race, dt);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const sh = this.shake > 0 ? this.shake : 0; this.shake = Math.max(0, this.shake - dt * 30);
    const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    // zoom punch pivots on the player
    this.zoomK *= Math.exp(-dt * 7); if (this.zoomK < 0.002) this.zoomK = 0; const zk = 1 + this.zoomK;
    const px = p.x, py = this.sy(p.y), s = this.s * zk;
    c.setTransform(s, 0, 0, s, (ox + px - px * zk) * this.s, (oy + py - py * zk) * this.s);

    const zi = zoneIndex(p.y), zn = ZONES[zi + 1];
    let bt = 0; if (zn) bt = clamp((p.y - (ZSTART[zi + 1] - 1500)) / 1500, 0, 1);
    this.zi = zi; this.bt = bt;
    const z = ZONES[zi];
    const deep = zn ? lerpC(rgb(z.col[0]), rgb(zn.col[0]), bt) : rgb(z.col[0]);
    const lite = zn ? lerpC(rgb(z.col[1]), rgb(zn.col[1]), bt) : rgb(z.col[1]);
    const wall = zn ? lerpC(rgb(z.wall), rgb(zn.wall), bt) : rgb(z.wall);
    this.drawBack(deep, zi, bt);
    this.drawTube(race, lite, wall, deep);
    this.drawScent(race);
    this.drawEnts(race, dt);
    this.drawEgg(race, dt);
    this.drawAgents(race);
    this.drawPlayer(race, dt);
    this.drawFx(race, dt);
    // speed lines when you are flying
    const fast = (p.dashT > 0 ? 1 : 0) + (p.frenzyT > 0 ? 0.7 : 0);
    if (fast && !race.drill) {
      c.lineWidth = 1.6; c.lineCap = 'round';
      c.strokeStyle = p.frenzyT > 0 ? `hsla(${(this.time * 500) % 360},100%,75%,${0.16 * fast})` : `rgba(255,255,255,${0.14 * fast})`;
      c.beginPath();
      for (let i = 0; i < 16; i++) { const x = (i * 97 + this.time * 31) % VIEW_W, y = ((i * 211 + this.time * 1500) % (this.H + 200)) - 100; c.moveTo(x, y); c.lineTo(x, y + 50 + 50 * fast); }
      c.stroke();
    }
    // vignette (cached sprites), low energy throb, flash
    c.setTransform(this.s, 0, 0, this.s, 0, 0);
    const [vn, vr] = this.vignette();
    c.drawImage(vn, -20, -20, VIEW_W + 40, this.H + 40);
    if (p.e < 25 && !race.over) { c.globalAlpha = clamp(0.55 + 0.35 * Math.sin(this.time * 8), 0, 1) * (1 - p.e / 25 * 0.5); c.drawImage(vr, -20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1; }
    if (this.flash > 0) { c.fillStyle = this.flashCol; c.globalAlpha = Math.min(1, this.flash); c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1; this.flash -= dt * 3; }
  }

  // notice state changes on the player and add juice main.js does not have to ask for
  react(race, dt) {
    const p = race.p, pv = this.prev;
    if (p.dashT > pv.dashT + 0.2) { this.sqV -= 9; this.ring(p.x, p.y - 6, '#8cdcff', 46, 0.35, 4); }
    if (p.frenzyT > pv.frenzyT + 1) { this.zoomPunch(0.1); this.ring(p.x, p.y, '#ffd75c', 120, 0.6, 8); this.ring(p.x, p.y, '#ff5cd2', 80, 0.45, 5); }
    if (p.inv > pv.inv + 0.3) { this.pHit = 0.35; this.ring(p.x, p.y, '#ffffff', 60, 0.35, 6); }
    if (p.stuck > pv.stuck + 0.2) this.sqV += 10;
    pv.dashT = p.dashT; pv.frenzyT = p.frenzyT; pv.inv = p.inv; pv.stuck = p.stuck;
    // squash and stretch spring: stretches long while dashing
    const want = p.dashT > 0 ? 0.24 : p.frenzyT > 0 ? 0.08 : 0;
    this.sqV += ((want - this.sq) * 260 - this.sqV * 13) * dt; this.sq = clamp(this.sq + this.sqV * dt, -0.4, 0.5);
    this.pHit = Math.max(0, this.pHit - dt);
  }

  // ---------------------------------------------------------------- backdrop
  drawBack(deep, zi, bt) {
    const c = this.ctx;
    c.fillStyle = css(deep); c.fillRect(-30, -30, VIEW_W + 60, this.H + 60);
    const base = this.camY * 0.35;
    const layer = (k, a) => {
      if (a <= 0.01) return;
      const t = this.tile(k); c.globalAlpha = a;
      const k0 = Math.floor((base - 40) / TH), k1 = Math.floor((base + this.H + 40) / TH);
      for (let j = k0; j <= k1; j++) c.drawImage(t, -20, this.H - ((j + 1) * TH - base), TW, TH + 0.5);
      c.globalAlpha = 1;
    };
    layer(zi, 1);
    if (ZONES[zi + 1]) layer(zi + 1, bt);
  }

  sides(race) {
    const y0 = this.camY;
    if (y0 + this.H < FORK_Y0) return [0];
    if (y0 > FORK_END + 200) return [race.p.side || race.eggSide];
    return [-1, 1];
  }
  drawTube(race, lite, wall, deep) {
    const c = this.ctx, y0 = this.camY - 60, y1 = this.camY + this.H + 60, step = 22, t = this.time;
    const polys = [];
    for (const side of this.sides(race)) {
      const L = [], R = [];
      for (let y = y0; y <= y1; y += step) {
        const top = side && race.p.side && side !== race.p.side && y > FORK_END + 200;
        if (side && side !== (race.p.side || side) && y > FORK_END + 600) break;
        const ch = channel(y, side);
        const wob = Math.sin(y / 60 + t * 2) * 3 + Math.sin(y / 23 - t * 3) * 1.2;
        L.push(ch.c - ch.h - wob, this.sy(y)); R.push(ch.c + ch.h + wob, this.sy(y));
        if (top) break;
      }
      if (L.length >= 4) polys.push([L, R]);
    }
    const path = () => {
      c.beginPath();
      for (const [L, R] of polys) {
        c.moveTo(L[0], L[1]);
        for (let i = 2; i < L.length; i += 2) c.lineTo(L[i], L[i + 1]);
        for (let i = R.length - 2; i >= 0; i -= 2) c.lineTo(R[i], R[i + 1]);
        c.closePath();
      }
    };
    const g = c.createLinearGradient(0, 0, VIEW_W, 0);
    g.addColorStop(0, css(deep)); g.addColorStop(0.5, css(lite)); g.addColorStop(1, css(deep));
    path(); c.fillStyle = g; c.fill();
    // inside the tube: soft inner shadow on the walls, then the zone's floating stuff
    c.save(); path(); c.clip();
    c.lineJoin = 'round';
    c.strokeStyle = css(deep, 0.55); c.lineWidth = 34;
    for (const [L, R] of polys) { strokePts(c, L); strokePts(c, R); }
    c.strokeStyle = css(wall, 0.12); c.lineWidth = 8;
    for (const [L, R] of polys) { strokePts(c, L, 9); strokePts(c, R, -9); }
    this.drawNear(this.zi, 1 - this.bt * 0.999);
    if (ZONES[this.zi + 1] && this.bt > 0.02) this.drawNear(this.zi + 1, this.bt);
    c.restore();
    // glossy rims and waving cilia
    for (const [L, R] of polys) {
      for (const P of [L, R]) {
        c.strokeStyle = css(wall, 0.22); c.lineWidth = 12; strokePts(c, P);
        c.strokeStyle = css(wall, 1); c.lineWidth = 2.6; strokePts(c, P);
      }
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 1.3; c.lineCap = 'round'; c.beginPath();
      for (let i = 0; i < L.length; i += 2) {
        const sw = Math.sin(t * 6 + i * 0.45) * 5, sw2 = Math.sin(t * 6 + i * 0.45 + 1.2) * 4;
        c.moveTo(L[i], L[i + 1]); c.quadraticCurveTo(L[i] + 5, L[i + 1] + sw2, L[i] + 9, L[i + 1] + sw);
        c.moveTo(R[i], R[i + 1]); c.quadraticCurveTo(R[i] - 5, R[i + 1] + sw2, R[i] - 9, R[i + 1] + sw);
      }
      c.stroke();
    }
    // the dead end of the wrong tube
    const ps = race.p.side;
    if (ps && ps !== race.eggSide) {
      const y = this.sy(DEAD_Y), ch = channel(DEAD_Y, ps);
      if (y > -80 && y < this.H + 80) {
        c.fillStyle = css(deep); c.fillRect(ch.c - ch.h - 20, y - 400, ch.h * 2 + 40, 400);
        c.strokeStyle = css(wall); c.lineWidth = 3; c.beginPath(); c.moveTo(ch.c - ch.h, y); c.quadraticCurveTo(ch.c, y + 30, ch.c + ch.h, y); c.stroke();
        // a tumbleweed rolls past. There is nothing here.
        const tx = ch.c + Math.sin(t * 0.8) * ch.h * 0.6, ty = y + 40;
        c.save(); c.translate(tx, ty); c.rotate(t * 3); c.strokeStyle = 'rgba(220,170,120,0.8)'; c.lineWidth = 1.5; c.beginPath();
        for (let i = 0; i < 7; i++) { const a = i * 0.9; c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); c.lineTo(Math.cos(a + 2.6) * 9, Math.sin(a + 2.6) * 9); }
        c.stroke(); c.restore();
        this.sign(ch.c, y + 80, 'NO EGG HERE', '#ff5c7a');
      }
    }
    const fy = this.sy(FORK_Y0 - 500);
    if (fy > -60 && fy < this.H + 60) this.sign(centre(FORK_Y0 - 500), fy, '← PICK A TUBE →', '#ff9be0');
  }
  sign(x, y, text, col) {
    const c = this.ctx; c.font = `800 15px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + 22, b = Math.sin(this.time * 3) * 2;
    c.fillStyle = 'rgba(0,0,0,0.3)'; this.rrect(x - w / 2 + 2, y - 12 + b, w, 28, 10); c.fill();
    c.fillStyle = 'rgba(20,0,20,0.8)'; this.rrect(x - w / 2, y - 14 + b, w, 28, 10); c.fill();
    c.strokeStyle = col; c.lineWidth = 2; c.stroke(); c.fillStyle = col; c.fillText(text, x, y + 1 + b);
  }
  rrect(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // things floating in the fluid of the tube, one look per zone (drawn inside the tube clip)
  drawNear(zi, a) {
    if (a <= 0.01) return;
    const c = this.ctx, z = ZONES[zi], id = z.id, t = this.time, NT = this.H + 160, cam = this.camY;
    const pos = (i, par, drift) => {
      const u = ((h1(i * 3.1 + zi) * NT - cam * par - drift * t) % NT + NT) % NT;
      return this.H + 80 - u;
    };
    const X = (i) => h1(i * 7.7 + zi * 13) * VIEW_W;
    c.globalAlpha = a;
    if (id === 'launch' || id === 'fork' || id === 'egg') {
      const col = id === 'launch' ? '#ff9ac0' : id === 'fork' ? '#ff9be0' : '#ffe08a';
      for (let i = 0; i < 10; i++) this.dglow(col, X(i) + Math.sin(t * 0.7 + i) * 12, pos(i, 0.85, -10), 18 + h1(i) * 26, a * 0.22);
      c.globalAlpha = a; c.fillStyle = id === 'egg' ? 'rgba(255,240,170,0.8)' : 'rgba(255,255,255,0.35)';
      c.beginPath();
      for (let i = 10; i < 40; i++) { const x = X(i) + Math.sin(t + i) * 6, y = pos(i, 1, 12), r = 0.7 + h1(i + 0.3) * 1.8; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
      if (id !== 'launch') {   // twinkly 4-point stars
        c.fillStyle = id === 'egg' ? '#fff3c0' : '#ffd0f0';
        for (let i = 40; i < 52; i++) { const k = 0.5 + 0.5 * Math.sin(t * 4 + i * 2); if (k < 0.3) continue; star4(c, X(i), pos(i, 0.95, 20), 2 + 4 * k); }
      }
    } else if (id === 'acid') {
      for (let i = 0; i < 4; i++) this.dglow('#9dff3c', X(i) + Math.sin(t * 0.4 + i * 2) * 60, pos(i, 0.6, 0), 90, a * 0.12);
      c.globalAlpha = a; c.strokeStyle = 'rgba(200,255,140,0.45)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 4; i < 34; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath();
      for (let i = 4; i < 34; i++) { const x = X(i) + Math.sin(t * 2 + i) * 5, y = pos(i, 1, -40 - h1(i) * 50), r = 1.5 + h1(i + 0.7) * 4.5; c.moveTo(x - r * 0.3, y - r * 0.35); c.arc(x - r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); }
      c.fill();
    } else if (id === 'goo') {
      c.strokeStyle = 'rgba(230,200,255,0.18)'; c.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x1 = X(i) - 60, x2 = x1 + 80 + h1(i + 2) * 140, y = pos(i, 0.9, 0), sag = 18 + 14 * Math.sin(t * 1.5 + i);
        c.lineWidth = 2 + h1(i + 5) * 3; c.beginPath(); c.moveTo(x1, y); c.quadraticCurveTo((x1 + x2) / 2, y + sag * 2, x2, y + h1(i + 9) * 20 - 10); c.stroke();
        c.fillStyle = 'rgba(230,200,255,0.25)'; c.beginPath(); c.arc((x1 + x2) / 2, y + sag + 3 + (t * 20 + i * 9) % 14, 2.2, 0, TAU); c.fill();
      }
      for (let i = 9; i < 15; i++) this.dglow('#c79bff', X(i), pos(i, 0.8, 0), 30 + h1(i) * 20, a * 0.18);
    } else if (id === 'sea') {
      for (let i = 0; i < 16; i++) {
        const x = X(i) + Math.sin(t * 0.5 + i) * 18, y = pos(i, 0.92, 18 + h1(i) * 20), r = 7 + h1(i + 0.4) * 9;
        const rot = t * (0.3 + h1(i) * 0.6) + i, sx = 0.35 + 0.65 * Math.abs(Math.cos(rot));
        c.save(); c.translate(x, y); c.rotate(i); c.scale(1, sx);
        c.fillStyle = 'rgba(214,40,70,0.55)'; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
        c.fillStyle = 'rgba(120,10,35,0.45)'; c.beginPath(); c.arc(0, 0, r * 0.5, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,140,160,0.35)'; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, r * 0.85, 3.6, 5.4); c.stroke();
        c.restore();
      }
      c.fillStyle = 'rgba(255,190,200,0.25)'; c.beginPath();
      for (let i = 16; i < 40; i++) { const x = X(i), y = pos(i, 1, 6), r = 1 + h1(i) * 1.5; c.moveTo(x + r, y); c.arc(x, y, r, 0, TAU); }
      c.fill();
    } else if (id === 'rapids') {
      c.strokeStyle = 'rgba(190,245,255,0.5)'; c.lineCap = 'round'; c.lineWidth = 1.8; c.beginPath();
      for (let i = 0; i < 26; i++) { const x = X(i) + Math.sin(t + i) * 4, y = pos(i, 1, 520 + h1(i) * 300), l = 26 + h1(i + 1) * 70; c.moveTo(x, y); c.lineTo(x + Math.sin(i) * 3, y + l); }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3; c.beginPath();
      for (let i = 26; i < 34; i++) { const x = X(i), y = pos(i, 1, 380), w = 14 + h1(i) * 16; c.moveTo(x - w, y); c.quadraticCurveTo(x, y + 8, x + w, y); }
      c.stroke();
    }
    c.globalAlpha = 1;
  }

  drawScent(race) {
    const c = this.ctx, p = race.p;
    if (!(p.y > FORK_Y0 - 4000 && p.y < FORK_END)) return;
    const strong = race.muts.nose ? 1 : 0.45;
    for (let i = 0; i < 18; i++) {
      const k = (this.time * 0.35 + i / 18) % 1, wy = FORK_Y0 + 1200 - k * 3600;
      const ch = channel(Math.max(wy, FORK_Y0 + 10), race.eggSide);
      const x = ch.c + Math.sin(i * 7.1 + this.time * 2) * ch.h * 0.6 * (1 - k * 0.5);
      c.fillStyle = `rgba(255,150,230,${strong * (1 - k) * 0.9})`;
      if (i % 3 === 0) heart(c, x, this.sy(wy), 3 + (i % 2) * 1.5); else { c.beginPath(); c.arc(x, this.sy(wy), 2.2 + (i % 3), 0, TAU); c.fill(); }
    }
    if (race.muts.nose && !p.side) {
      const ch = channel(FORK_Y0 + 300, race.eggSide), y = this.sy(Math.min(p.y + 350, FORK_Y0 + 200));
      c.save(); c.translate(ch.c, y + Math.sin(this.time * 6) * 4); c.fillStyle = '#ff8be0'; c.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 6);
      c.beginPath(); c.moveTo(0, -26); c.lineTo(18, 0); c.lineTo(7, 0); c.lineTo(7, 22); c.lineTo(-7, 22); c.lineTo(-7, 0); c.lineTo(-18, 0); c.closePath(); c.fill();
      c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); c.restore();
    }
  }

  // ---------------------------------------------------------------- hazards and pickups
  drawEnts(race, dt) {
    const c = this.ctx, top = this.camY + this.H + 80, bot = this.camY - 80, t = this.time, p = race.p;
    for (const e of race.ents) {
      if (e.dead || e.y > top + e.r || e.y < bot - (e.h || 0) - e.r) continue;
      const x = e.x, y = this.sy(e.y);
      switch (e.t) {
        case 'sugar': {
          const ci = Math.floor(Math.abs(e.x * 7 + e.y)) % FRUIT.length, col = FRUIT[ci], bob = Math.sin(t * 4 + e.y) * 2, yy = y + bob, r = e.r;
          this.dglow(col, x, yy, r + 10, 0.5);
          c.fillStyle = col; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.arc(x + 2, yy + 2.5, r * 0.75, 0, Math.PI); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - 3, yy - 3.5, 3, 2, -0.6, 0, TAU); c.fill();
          if (ci % 2 === 0) { c.fillStyle = 'rgba(255,240,150,0.85)'; for (let k = 0; k < 4; k++) c.fillRect(x - 4 + (k % 2) * 6, yy + (k >> 1) * 4 - 1, 1.4, 1.8); }
          c.fillStyle = '#5bd96b'; c.beginPath(); c.ellipse(x + 2, yy - r, 4.5, 2, -0.5, 0, TAU); c.fill();
          c.beginPath(); c.ellipse(x - 2, yy - r + 0.5, 3.5, 1.6, 0.6, 0, TAU); c.fill();
          break; }
        case 'dna': {
          this.dglow('#ff5cd2', x, y, 26, 0.35 + 0.15 * Math.sin(t * 6));
          c.lineCap = 'round';
          c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.4; c.beginPath();
          for (let i = 0; i <= 10; i += 2) { const yy = y - 14 + i * 2.8, s = Math.sin(t * 5 + i * 0.7) * 8; c.moveTo(x + s, yy); c.lineTo(x - s, yy); }
          c.stroke(); c.lineWidth = 3;
          for (let k = 0; k < 2; k++) { c.strokeStyle = k ? '#5ce1ff' : '#ff5cd2'; c.beginPath(); for (let i = 0; i <= 10; i++) { const yy = y - 14 + i * 2.8, xx = x + Math.sin(t * 5 + i * 0.7 + k * Math.PI) * 8; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
          if (Math.sin(t * 3 + e.y) > 0.9) { c.fillStyle = '#fff'; star4(c, x + 9, y - 12, 4); }
          break; }
        case 'shield': {
          const b = Math.sin(t * 4 + e.y) * 2, r = e.r;
          this.dglow('#ffd75c', x, y + b, r + 14, 0.45);
          c.fillStyle = '#ffd75c'; c.beginPath(); c.arc(x, y + b + 2, r * 0.85, Math.PI, 0); c.lineTo(x + r, y + b + 4); c.lineTo(x - r, y + b + 4); c.closePath(); c.fill();
          c.strokeStyle = '#b07a10'; c.lineWidth = 1.5; c.stroke();
          c.fillStyle = '#ff3d6e'; c.fillRect(x - 1.5, y + b - r * 0.8, 3, r * 0.9);
          c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - 4, y + b - 3, 2.5, 1.5, -0.6, 0, TAU); c.fill();
          break; }
        case 'alkali': {
          const r = e.r + Math.sin(t * 5 + e.y) * 1.5;
          this.dglow('#5cc8ff', x, y, r + 10, 0.4);
          c.fillStyle = 'rgba(92,200,255,0.3)'; c.strokeStyle = '#9ae2ff'; c.lineWidth = 2;
          c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x - r * 0.4, y - r * 0.4, 2.2, 0, TAU); c.fill();
          c.fillStyle = '#e6f8ff'; c.font = `800 10px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('pH', x, y + 1);
          break; }
        case 'acid': case 'goo': {
          const acid = e.t === 'acid', col = acid ? '#9dff3c' : '#c79bff', seed = e.seed || 0;
          this.dglow(col, x, y, e.r * 1.35, acid ? 0.22 : 0.16);
          c.fillStyle = hexA(col, acid ? 0.34 : 0.3);
          for (let i = 0; i < 16; i++) { const an = i / 16 * TAU, rr = e.r * (1 + 0.1 * Math.sin(an * 3 + seed + t * 2) + 0.05 * Math.sin(an * 5 - t * 3)); BX[i] = x + Math.cos(an) * rr; BY[i] = y + Math.sin(an) * rr * 0.78; }
          smoothBlob(c, 16); c.fill(); c.strokeStyle = hexA(col, 0.75); c.lineWidth = 2.2; c.stroke();
          c.fillStyle = hexA(col, 0.18); c.beginPath(); c.ellipse(x, y + e.r * 0.1, e.r * 0.6, e.r * 0.42, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - e.r * 0.35, y - e.r * 0.35, e.r * 0.18, e.r * 0.07, -0.5, 0, TAU); c.fill();
          for (let i = 0; i < 5; i++) {
            const k = (t * (acid ? 0.9 : 0.4) + i / 5 + seed) % 1, bx = x + Math.sin(i * 5 + seed) * e.r * 0.5, by = y + e.r * 0.4 - k * e.r * 0.8, br = 1.8 + 2.4 * (1 - k);
            c.strokeStyle = hexA(col, 0.9 * (1 - k)); c.lineWidth = 1.3; c.beginPath(); c.arc(bx, by, br, 0, TAU); c.stroke();
            if (acid && k > 0.85) { c.fillStyle = 'rgba(220,255,150,0.8)'; star4(c, bx, by - 3, 3); }
          }
          if (!acid) { c.strokeStyle = 'rgba(230,200,255,0.4)'; c.lineWidth = 1.5; c.beginPath(); for (let i = 0; i < 3; i++) { const xx = x + (i - 1) * e.r * 0.4, l = 8 + 6 * Math.sin(t * 2 + i + seed); c.moveTo(xx, y + e.r * 0.65); c.lineTo(xx, y + e.r * 0.65 + l); } c.stroke(); }
          break; }
        case 'gate': this.drawGate(e, y, t); break;
        case 'wbc': this.drawWbc(e, x, y, t, p, dt); break;
        case 'current': {
          const y1 = this.sy(e.y + e.h);
          c.lineCap = 'round'; c.lineJoin = 'round';
          for (let i = 0; i < 5; i++) {
            const yy = y1 + (i + 0.5) * (y - y1) / 5, k = ((t * 0.9 * e.dir + i * 0.27) % 1 + 1) % 1, xx = e.x - e.r + k * e.r * 2;
            const al = Math.sin(k * Math.PI) * 0.4;
            c.strokeStyle = `rgba(200,240,255,${al * 0.5})`; c.lineWidth = 8;
            c.beginPath(); c.moveTo(xx - 16 * e.dir, yy - 9); c.lineTo(xx, yy); c.lineTo(xx - 16 * e.dir, yy + 9); c.stroke();
            c.strokeStyle = `rgba(255,255,255,${al})`; c.lineWidth = 3; c.stroke();
            c.strokeStyle = `rgba(255,255,255,${al * 0.4})`; c.lineWidth = 1.5; c.beginPath(); c.moveTo(xx - 70 * e.dir, yy); c.lineTo(xx - 22 * e.dir, yy); c.stroke();
          }
          break; }
      }
    }
  }
  drawGate(e, y, t) {
    const c = this.ctx, ch = channel(e.y, e.side), L = ch.c - ch.h - 10, R = ch.c + ch.h + 10;
    const gaps = e.gaps.slice().sort((a, b) => a - b); let x0 = L;
    const segs = [];
    for (const g of gaps) { segs.push([x0, g - e.gw / 2]); x0 = g + e.gw / 2; }
    segs.push([x0, R]);
    // goo slabs with lumpy edges and drips
    c.lineJoin = 'round';
    for (const [a, b] of segs) {
      if (b - a < 2) continue;
      c.beginPath(); c.moveTo(a, y - 10);
      for (let xx = a; xx <= b; xx += 7) c.lineTo(xx, y - 10 + Math.sin(xx / 9 + t * 3) * 2.5);
      c.lineTo(b, y - 10); c.quadraticCurveTo(b + 7, y, b, y + 10);
      for (let xx = b; xx >= a; xx -= 7) c.lineTo(xx, y + 10 + Math.sin(xx / 7 - t * 3) * 2.5);
      c.lineTo(a, y + 10); c.quadraticCurveTo(a - 7, y, a, y - 10);
      c.closePath(); c.fillStyle = 'rgba(200,160,255,0.65)'; c.fill(); c.strokeStyle = '#f2e6ff'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath(); c.moveTo(a + 4, y - 4); c.lineTo(b - 4, y - 4); c.stroke();
      c.fillStyle = 'rgba(220,190,255,0.8)';
      for (let xx = a + 10; xx < b - 6; xx += 23) {
        const k = ((t * 0.6 + xx * 0.013) % 1), l = 4 + 14 * k;
        c.beginPath(); c.moveTo(xx - 2.5, y + 9); c.quadraticCurveTo(xx, y + 9 + l * 1.3, xx + 2.5, y + 9); c.fill();
        c.beginPath(); c.arc(xx, y + 10 + l, 2 + k, 0, TAU); c.fill();
      }
    }
    // the gaps glow and point the way
    for (const g of gaps) {
      this.dglow('#ffffff', g, y, e.gw * 0.55, 0.12 + 0.06 * Math.sin(t * 5));
      c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * Math.sin(t * 6)})`; c.lineWidth = 2.5; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) { const yy = y + 34 + k * 12 - ((t * 30) % 12); c.beginPath(); c.moveTo(g - 8, yy + 6); c.lineTo(g, yy); c.lineTo(g + 8, yy + 6); c.stroke(); }
    }
  }
  // Big Mac: a white blood cell with a wobbly membrane, arms that reach for you, and table manners to match
  drawWbc(e, x, y, t, p, dt) {
    const c = this.ctx, hunt = e.hunt || 0, ph = e.ph || 0;
    let st = this.wbcState.get(e); if (!st) { st = { eating: 0, burp: 0, full: 0, tail: 0 }; this.wbcState.set(e, st); }
    if (e.eat > 0) { if (!st.eating) { st.eating = 1; st.tail = 1.1; } st.full = 1; }
    else if (st.eating) {
      st.eating = 0; st.burp = 0.7;
      this.pop(e.x + 10, e.y + e.r + 12, ['burp', 'BURP', 'urp', 'yum'][Math.floor(Math.random() * 4)], '#eaffc0', 12, 0.9);
      for (let i = 0; i < 4; i++) this.addP({ k: 4, x: e.x + (Math.random() - 0.5) * 10, y: e.y + e.r * 0.4, vx: (Math.random() - 0.5) * 40, vy: 40 + Math.random() * 50, life: 0.8, max: 0.8, col: '#eaffc0', size: 2 + Math.random() * 3, g: 0, rot: 0, vr: 0 });
    }
    st.full = Math.max(0, st.full - dt * 0.3); st.burp = Math.max(0, st.burp - dt); st.tail = Math.max(0, st.tail - dt);
    const chomp = e.eat > 0 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
    const r = e.r * (1 + 0.06 * Math.sin(ph * 5) + 0.12 * st.full + 0.08 * Math.sin(st.burp * 20) * st.burp);
    const ang = Math.atan2(this.sy(p.y) - y, p.x - x);
    this.dglow(hunt > 0.5 ? '#ff9ab4' : '#f4eef7', x, y, r + 22, 0.28 + 0.15 * hunt);
    // membrane: wobble harmonics + pseudopod arms that stretch toward the player
    const reach = hunt * (0.55 + 0.15 * Math.sin(t * 7));
    for (let i = 0; i < 28; i++) {
      const a = i / 28 * TAU;
      let rr = 1 + 0.08 * Math.sin(a * 4 + ph * 3) + 0.05 * Math.sin(a * 7 - ph * 5);
      if (reach > 0.02) {
        const d0 = Math.cos(a - ang), d1 = Math.cos(a - ang - 0.75), d2 = Math.cos(a - ang + 0.75);
        rr += reach * (Math.pow(Math.max(0, d1), 10) + Math.pow(Math.max(0, d2), 10)) * 0.8 + reach * 0.25 * Math.pow(Math.max(0, d0), 4);
      }
      BX[i] = x + Math.cos(a) * r * rr; BY[i] = y + Math.sin(a) * r * rr;
    }
    smoothBlob(c, 28); c.fillStyle = '#f6f0f8'; c.fill(); c.strokeStyle = hunt > 0.5 ? '#e08aa8' : '#c9b6d9'; c.lineWidth = 2.2; c.stroke();
    c.fillStyle = 'rgba(210,190,230,0.45)'; c.beginPath(); c.arc(x + r * 0.1, y + r * 0.15, r * 0.78, 0, TAU); c.fill();
    // lobed nucleus + granules
    c.fillStyle = 'rgba(150,100,200,0.42)';
    for (let k = 0; k < 3; k++) { c.beginPath(); c.ellipse(x - r * 0.25 + k * r * 0.25, y + r * 0.08 + Math.sin(k * 2 + ph) * r * 0.08, r * 0.17, r * 0.13, k, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(160,120,200,0.5)';
    for (let k = 0; k < 6; k++) { const a = k * 1.1 + ph * 0.3; c.beginPath(); c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.5, 1.4, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.ellipse(x - r * 0.45, y - r * 0.5, r * 0.18, r * 0.09, -0.7, 0, TAU); c.fill();
    // eyes that follow you, angry brows when it is hunting
    const blink = ((t + ph) % 3.7) < 0.1 && hunt < 0.5;
    for (const sx of [-1, 1]) {
      const ex = x + sx * r * 0.33, ey = y - r * 0.25, er = r * 0.24;
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, er, 0, TAU); c.fill(); c.strokeStyle = '#4a3050'; c.lineWidth = 1.2; c.stroke();
      if (blink) { c.strokeStyle = '#4a3050'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - er, ey); c.lineTo(ex + er, ey); c.stroke(); }
      else {
        const pr = r * (0.1 + 0.03 * hunt);
        c.fillStyle = '#1a0a1a'; c.beginPath(); c.arc(ex + Math.cos(ang) * er * 0.42, ey + Math.sin(ang) * er * 0.42, pr, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + Math.cos(ang) * er * 0.42 - pr * 0.35, ey + Math.sin(ang) * er * 0.42 - pr * 0.4, pr * 0.35, 0, TAU); c.fill();
      }
      if (hunt > 0.35) { c.strokeStyle = '#4a3050'; c.lineWidth = 2.6; c.lineCap = 'round'; c.beginPath(); c.moveTo(ex - sx * er * 0.9, ey - er * (0.95 + 0.3 * (1 - hunt))); c.lineTo(ex + sx * er * 1.1, ey - er * 1.6); c.stroke(); }
    }
    // mouth: drooly when hunting, chomping when eating, a little tail sticking out after
    const mo = hunt * 0.25 + chomp * 0.2, my = y + r * 0.38;
    c.fillStyle = '#5a1030'; c.beginPath(); c.ellipse(x, my, r * 0.42, r * (0.05 + mo), 0, 0, TAU); c.fill();
    if (mo > 0.12) {
      c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(x, my + r * mo * 0.5, r * 0.22, r * mo * 0.4, 0, 0, TAU); c.fill();
      c.fillStyle = '#fff';
      for (let i = -2; i <= 2; i++) { const tx = x + i * r * 0.15; c.beginPath(); c.moveTo(tx - 3, my - r * mo * 0.8); c.lineTo(tx + 3, my - r * mo * 0.8); c.lineTo(tx, my - r * mo * 0.3); c.fill(); }
      if (hunt > 0.8) { const d = (t * 1.5 + ph) % 1; c.fillStyle = 'rgba(200,240,255,0.8)'; c.beginPath(); c.ellipse(x + r * 0.25, my + r * mo + d * 10, 1.6, 2.4 + d * 2, 0, 0, TAU); c.fill(); }
    }
    if (st.tail > 0) {
      c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.8; c.lineCap = 'round'; c.beginPath();
      const tx = x + r * 0.15, ty = my + 1; c.moveTo(tx, ty);
      for (let i = 1; i <= 5; i++) c.lineTo(tx + i * 3, ty + i * 2.5 + Math.sin(t * 30 + i) * 2.5 * i / 5);
      c.stroke();
    }
    if (st.full > 0.2) { c.strokeStyle = `rgba(150,100,200,${st.full * 0.5})`; c.lineWidth = 1.2; c.beginPath(); c.arc(x, y + r * 0.62, r * 0.18, 0.2, Math.PI - 0.2); c.stroke(); }
  }

  // ---------------------------------------------------------------- the egg
  drawEgg(race, dt) {
    const c = this.ctx, x = centre(RACE_LEN);
    const t = this.time, R = 150, d = race.drill, over = race.over;
    // drill taps make her jiggle (tap rate read from drill progress)
    if (d) { const rate = Math.max(0, d.me - this.lastDrill) / Math.max(dt, 1e-3); this.lastDrill = d.me; this.eggJig += (Math.min(1, rate / 3) - this.eggJig) * Math.min(1, dt * 10); }
    else { this.lastDrill = 0; this.eggJig *= 0.9; }
    let y = this.sy(RACE_LEN + 120);
    if (y < -400 || y > this.H + 500) return;
    const near = clamp(1 - (RACE_LEN - race.p.y) / 2500, 0, 1);
    const win = over && over.reason === 'win', late = over && over.reason === 'late';
    const jig = this.eggJig, sx = 1 + Math.sin(t * 28) * 0.025 * jig + Math.sin(t * 2) * 0.01, sy2 = 2 - sx;
    // halo + god rays
    this.dglow('#ffd77a', x, y, R * 2.3, 0.55 + 0.1 * Math.sin(t * 2));
    c.save(); c.translate(x, y); c.rotate(t * 0.08); c.fillStyle = 'rgba(255,235,160,0.08)';
    for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(R * 2.6, -26); c.lineTo(R * 2.6, 26); c.closePath(); c.fill(); }
    c.restore();
    // corona radiata: a fluffy cloud of helper cells
    c.fillStyle = 'rgba(255,225,160,0.75)'; c.beginPath();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + t * 0.1, rr = R + 18 + Math.sin(t * 2 + i * 1.7) * 5, cx = x + Math.cos(a) * rr * sx, cy = y + Math.sin(a) * rr * sy2, cr = 10 + (i % 3) * 2; c.moveTo(cx + cr, cy); c.arc(cx, cy, cr, 0, TAU); }
    c.fill();
    c.fillStyle = 'rgba(255,250,220,0.6)'; c.beginPath();
    for (let i = 0; i < 30; i++) { const a = i / 30 * TAU + t * 0.1, rr = R + 18 + Math.sin(t * 2 + i * 1.7) * 5, cx = x + Math.cos(a) * rr * sx - 3, cy = y + Math.sin(a) * rr * sy2 - 3; c.moveTo(cx + 3, cy); c.arc(cx, cy, 3, 0, TAU); }
    c.fill();
    c.save(); c.translate(x, y); c.scale(sx, sy2);
    // zona pellucida (jelly coat), then the egg itself
    c.fillStyle = 'rgba(255,245,215,0.35)'; c.beginPath(); c.arc(0, 0, R + 9, 0, TAU); c.fill();
    const g2 = c.createRadialGradient(-45, -55, 20, 0, 0, R);
    g2.addColorStop(0, '#fffbe8'); g2.addColorStop(0.55, '#ffd77a'); g2.addColorStop(1, '#e8a33c');
    c.fillStyle = g2; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 6; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-62, -78, 30, 14, -0.7, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(-30, -100, 6, 0, TAU); c.fill();
    // the face. Sleepy far away, wide awake when you arrive, giggly when drilled.
    const ink = '#7a4a12', lookX = clamp((race.p.x - x) / 60, -1, 1) * 7;
    c.strokeStyle = ink; c.fillStyle = ink; c.lineCap = 'round'; c.lineWidth = 5;
    const awake = near > 0.35 || d || over;
    for (const s of [-1, 1]) {
      const ex = s * 46, ey = 2;
      if (win) { c.fillStyle = '#ff3d6e'; heart(c, ex, ey, 18 + Math.sin(t * 10) * 2); c.fillStyle = ink; }
      else if (d && jig > 0.25) { c.beginPath(); c.moveTo(ex - 13, ey + 6); c.lineTo(ex, ey - 6); c.lineTo(ex + 13, ey + 6); c.stroke(); }
      else if (!awake) { c.beginPath(); c.arc(ex, ey - 2, 12, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
      else {
        const open = clamp((near - 0.35) / 0.4, 0.3, 1), blink = ((t % 4.1) < 0.14) ? 0.1 : 1;
        c.fillStyle = '#fff'; c.beginPath(); c.ellipse(ex, ey, 17, 21 * open * blink, 0, 0, TAU); c.fill(); c.stroke();
        if (blink > 0.5) {
          const lx = late ? 9 : lookX;
          c.fillStyle = ink; c.beginPath(); c.ellipse(ex + lx, ey + 3, 9, 11 * open, 0, 0, TAU); c.fill();
          c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx - 3, ey - 2, 3.5, 0, TAU); c.fill(); c.beginPath(); c.arc(ex + lx + 3, ey + 6, 1.6, 0, TAU); c.fill();
        }
        c.fillStyle = ink;
        c.beginPath(); c.moveTo(ex - 14, ey - 30 - 6 * near); c.quadraticCurveTo(ex, ey - 38 - 8 * near, ex + 14, ey - 30 - 6 * near); c.stroke();
      }
    }
    // mouth
    c.lineWidth = 5; c.strokeStyle = ink;
    if (win) { c.fillStyle = '#9a3b20'; c.beginPath(); c.arc(0, 40, 30, 0.05 * Math.PI, 0.95 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0, 58, 14, 7, 0, 0, TAU); c.fill(); }
    else if (late) { c.beginPath(); c.moveTo(-14, 50); c.quadraticCurveTo(0, 42, 14, 50); c.stroke(); c.fillStyle = 'rgba(150,220,255,0.9)'; c.beginPath(); c.ellipse(88, -40, 7, 10, 0, 0, TAU); c.fill(); }
    else if (d) { const o = 8 + 10 * jig + Math.sin(t * 30) * 3 * jig; c.fillStyle = '#9a3b20'; c.beginPath(); c.ellipse(0, 46, 14 + 6 * jig, o, 0, 0, TAU); c.fill(); }
    else if (!awake) { c.beginPath(); c.arc(0, 44, 9, 0.1 * Math.PI, 0.9 * Math.PI); c.stroke(); }
    else { c.beginPath(); c.arc(0, 38, 14 + 10 * near, 0.12 * Math.PI, 0.88 * Math.PI); c.stroke(); }
    c.fillStyle = `rgba(255,110,140,${0.4 + 0.3 * (near + jig)})`;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 78, 32, 16, 9, 0, 0, TAU); c.fill(); }
    c.restore();
    // Zzz while she naps
    if (!awake) {
      c.fillStyle = 'rgba(255,240,200,0.85)'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 0; i < 3; i++) { const k = (t * 0.4 + i / 3) % 1; c.globalAlpha = Math.sin(k * Math.PI); c.font = `800 ${Math.round(14 + k * 16)}px ${FONT}`; c.fillText('z', x + 70 + k * 40 + Math.sin(k * 6) * 6, y - R * 0.6 - k * 70); }
      c.globalAlpha = 1;
    }
    if (d) {   // drill progress rings around the egg
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 10; c.beginPath(); c.arc(x, y, R + 38, 0, TAU); c.stroke();
      c.strokeStyle = '#5ce1ff'; c.lineWidth = 8; c.beginPath(); c.arc(x, y, R + 38, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, d.me / d.need)); c.stroke();
      let lead = 0; for (const a of race.agents) if (a.alive && a.arrived) lead = Math.max(lead, a.drill);
      if (lead > 0) { c.strokeStyle = '#ff5c7a'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, R + 50, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, lead / d.need)); c.stroke(); }
    }
  }

  // ---------------------------------------------------------------- swimmers
  tail(c, x, y, ang, len, amp, ph) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    c.moveTo(x, y);
    for (let i = 1; i <= 7; i++) {
      const k = i / 7, off = Math.sin(ph - k * 5.5) * amp * k;
      c.lineTo(x - sa * len * k + ca * off, y + ca * len * k + sa * off);
    }
  }
  // a tapered tail in local space (pointing down): thick near the head, whip-thin at the tip
  taperTail(c, len, amp, ph, w) {
    let px = 0, py = 8;
    for (let i = 1; i <= 8; i++) {
      const k = i / 8, nx = Math.sin(ph - k * 5.5) * amp * k, ny = 8 + len * k;
      c.lineWidth = w * (1.15 - k * 0.85); c.beginPath(); c.moveTo(px, py); c.lineTo(nx, ny); c.stroke();
      px = nx; py = ny;
    }
  }
  drawAgents(race) {
    const c = this.ctx, top = this.camY + this.H + 40, bot = this.camY - 40, t = this.time, p = race.p;
    const vis = [], close = [];
    for (const a of race.agents) {
      if (!a.alive || a.y > top || a.y < bot) continue;
      if (p.side && a.y > FORK_Y0 && a.side !== p.side && a.y > FORK_END) continue;
      a._x = race.agentX(a);
      if (!a.boss && Math.abs(a.y - p.y) < 190 && close.length < 26) close.push(a); else vis.push(a);
      if (vis.length > 220) break;
    }
    // the far crowd: batched, one path per colour
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    for (const a of vis) if (!a.boss) this.tail(c, a._x, this.sy(a.y) + 7, a.kx * 0.2, 26, 5, t * 16 + a.ph);
    c.stroke();
    for (let ci = 0; ci < 3; ci++) {
      c.fillStyle = CROWD[ci * 2]; c.beginPath();
      for (const a of vis) if (!a.boss && ((a.face || 0) % 3) === ci) { const y = this.sy(a.y); c.moveTo(a._x + 5.5, y); c.ellipse(a._x, y, 5.5, 7.5, 0, 0, TAU); }
      c.fill();
    }
    c.fillStyle = '#2a1030';
    for (const a of vis) if (!a.boss && Math.abs(a.y - p.y) < 320) { const y = this.sy(a.y); if (((t + a.ph * 3) % 3.3) < 0.12) { c.fillRect(a._x - 3, y - 2, 2.4, 0.9); c.fillRect(a._x + 0.8, y - 2, 2.4, 0.9); } else { c.fillRect(a._x - 2.6, y - 2.5, 1.6, 2.2); c.fillRect(a._x + 1, y - 2.5, 1.6, 2.2); } }
    // the close ones get full faces and their accessories
    for (const a of close) {
      const y = this.sy(a.y), f = (a.face || 0) % 6, behind = a.y < p.y, dx = Math.abs(a._x - p.x);
      const o = { acc: FACE_ACC[f], cap: CAPS[Math.floor(a.ph * 10) % CAPS.length], blink: ((t + a.ph * 3) % 3.3) < 0.12 };
      if (behind && p.y - a.y < 70) { o.mouth = 'scared'; o.brow = 'worried'; o.look = 0; }
      else if (!behind && dx < 22 && a.y - p.y < 100) { o.brow = 'angry'; o.mouth = 'smirk'; }
      this.drawSwimmer(a._x, y, a.kx * 0.2, 1, CROWD[f], t * 16 + a.ph, o);
    }
    // the named rivals
    for (const a of vis) if (a.boss) {
      const nm = a.boss.name, look = BOSS_LOOK[nm.split(' ')[0]] || {};
      const x = a._x, y = this.sy(a.y);
      this.dglow(a.boss.col, x, y, 30, 0.35);
      const passed = a.y < p.y && p.y - a.y < 90;
      this.drawSwimmer(x, y, a.kx * 0.2, 1.3, a.boss.col, t * 15 + a.ph, { name: nm, acc: look.acc, cap: look.cap, band: look.band, mouth: passed ? 'scared' : look.mouth, brow: passed ? 'worried' : look.brow, taper: 1, blink: ((t + a.ph) % 2.9) < 0.12 });
    }
  }
  drawSwimmer(x, y, ang, sc, col, ph, o = {}) {
    const c = this.ctx, st = o.stretch || 1;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc, sc);
    // tail
    c.strokeStyle = o.tail || 'rgba(255,255,255,0.92)'; c.lineCap = 'round'; c.lineJoin = 'round';
    if (o.taper) this.taperTail(c, 34 * (0.8 + 0.2 * st), 6, ph, 3.4);
    else { c.lineWidth = 2.2; c.beginPath(); this.tail(c, 0, 8, 0, 32, 6, ph); c.stroke(); }
    c.scale(1 / Math.sqrt(st), st);
    // midpiece + head
    c.fillStyle = col; c.beginPath(); c.ellipse(0, 9.5, 2.8, 3.6, 0, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(40,0,40,0.28)'; c.lineWidth = 1; c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.08)'; c.beginPath(); c.ellipse(1.8, 3, 5, 6.5, 0, -0.6, 2.2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(-2.6, -4.5, 2.4, 3.4, -0.4, 0, TAU); c.fill();
    if (o.flash > 0) { c.fillStyle = `rgba(255,255,255,${Math.min(1, o.flash)})`; c.beginPath(); c.ellipse(0, 0, 7.8, 10.3, 0, 0, TAU); c.fill(); }
    const acc = o.acc || [];
    if (acc.includes('mohawk')) { c.fillStyle = '#ff3d6e'; c.beginPath(); for (let i = -2; i <= 2; i++) { c.moveTo(i * 2.2 - 1.6, -8.5); c.lineTo(i * 2.2, -14 - (2 - Math.abs(i)) * 1.5 + Math.sin(ph * 0.5 + i) * 0.6); c.lineTo(i * 2.2 + 1.6, -8.5); } c.fill(); }
    if (o.blush) { c.fillStyle = 'rgba(255,90,130,0.45)'; c.beginPath(); c.ellipse(-4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.ellipse(4.6, 1.4, 1.8, 1.1, 0, 0, TAU); c.fill(); }
    // eyes
    const look = o.look || 0, ink = '#1a0a1a';
    for (const sx of [-1, 1]) {
      const ex = sx * 3.2, ey = -2.5;
      if (o.dizzy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); c.moveTo(ex - 1.8, ey - 1.8); c.lineTo(ex + 1.8, ey + 1.8); c.moveTo(ex + 1.8, ey - 1.8); c.lineTo(ex - 1.8, ey + 1.8); c.stroke(); continue; }
      if (o.blink || o.happy) { c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath(); if (o.happy) c.arc(ex, ey + 0.6, 2, Math.PI * 1.1, Math.PI * 1.9); else { c.moveTo(ex - 2.4, ey); c.lineTo(ex + 2.4, ey); } c.stroke(); continue; }
      c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, 2.9, 0, TAU); c.fill();
      if (o.star) { c.fillStyle = o.star; star4(c, ex + look * 0.6, ey - 0.4, 2.4); }
      else {
        c.fillStyle = ink; c.beginPath(); c.arc(ex + look, ey - 0.7, o.mouth === 'scared' ? 1 : 1.45, 0, TAU); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + look - 0.5, ey - 1.3, 0.5, 0, TAU); c.fill();
      }
      if (o.tired) { c.fillStyle = col; c.beginPath(); c.arc(ex, ey, 3.1, Math.PI, TAU); c.fill(); c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex - 3, ey); c.lineTo(ex + 3, ey); c.stroke(); }
      if (acc.includes('lashes')) { c.strokeStyle = ink; c.lineWidth = 0.8; c.beginPath(); c.moveTo(ex + sx * 2.4, ey - 1.8); c.lineTo(ex + sx * 3.8, ey - 3); c.moveTo(ex + sx * 1.2, ey - 2.8); c.lineTo(ex + sx * 1.9, ey - 4.3); c.stroke(); }
    }
    if (o.brow) {
      c.strokeStyle = ink; c.lineWidth = 1.1; c.beginPath();
      for (const sx of [-1, 1]) { const inY = o.brow === 'angry' ? -5.2 : -7, outY = o.brow === 'angry' ? -6.8 : -5.6; c.moveTo(sx * 1.2, inY); c.lineTo(sx * 5, outY); }
      c.stroke();
    }
    if (acc.includes('glasses')) { c.strokeStyle = '#3a2a50'; c.lineWidth = 0.9; c.beginPath(); c.arc(-3.2, -2.5, 3.3, 0, TAU); c.moveTo(6.5, -2.5); c.arc(3.2, -2.5, 3.3, 0, TAU); c.moveTo(-0.1, -2.7); c.lineTo(0.1, -2.7); c.stroke(); }
    if (acc.includes('shades')) {
      c.fillStyle = '#141420'; c.beginPath(); c.moveTo(-7, -4.6); c.lineTo(7, -4.6); c.lineTo(6.2, -1.2); c.quadraticCurveTo(3.6, 0.6, 1, -1.6); c.lineTo(-1, -1.6); c.quadraticCurveTo(-3.6, 0.6, -6.2, -1.2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.55)'; c.fillRect(-5.4, -4, 2, 0.9); c.fillRect(2, -4, 2, 0.9);
    }
    // mouth
    const m = o.mouth;
    c.strokeStyle = '#5a1020'; c.fillStyle = '#5a1020'; c.lineWidth = 1.2;
    if (m === 'grin') { c.beginPath(); c.arc(0, 2.4, 3.2, 0.1 * Math.PI, 0.9 * Math.PI); c.closePath(); c.fill(); c.fillStyle = '#fff'; c.fillRect(-1.8, 2.6, 3.6, 0.9); }
    else if (m === 'huge') { c.beginPath(); c.arc(0, 2, 4.4, 0, Math.PI); c.closePath(); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0, 4.8, 2.2, 1.2, 0, 0, TAU); c.fill(); }
    else if (m === 'scared') { c.beginPath(); c.ellipse(0, 4, 2, 2.6, 0, 0, TAU); c.fill(); }
    else if (m === 'pant') { c.beginPath(); c.ellipse(0, 4.2, 2.4, 1.6 + 0.8 * Math.abs(Math.sin(ph * 0.3)), 0, 0, TAU); c.fill(); c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(0.6, 5.8, 1.4, 1.4, 0, 0, TAU); c.fill(); }
    else if (m === 'smirk') { c.beginPath(); c.moveTo(-2.4, 4.2); c.quadraticCurveTo(0.5, 5, 3, 2.8); c.stroke(); }
    else if (m === 'wobble') { c.beginPath(); c.moveTo(-3, 4); for (let i = 1; i <= 6; i++) c.lineTo(-3 + i, 4 + (i % 2 ? -0.7 : 0.7)); c.stroke(); }
    else { c.beginPath(); c.moveTo(-2, 4); c.quadraticCurveTo(0, 4.8, 2, 4); c.stroke(); }
    if (acc.includes('stache')) { c.fillStyle = '#5a3418'; c.beginPath(); c.ellipse(-2, 2.6, 2.4, 1.2, 0.3, 0, TAU); c.ellipse(2, 2.6, 2.4, 1.2, -0.3, 0, TAU); c.fill(); c.beginPath(); c.arc(-4.3, 2, 0.9, 0, TAU); c.arc(4.3, 2, 0.9, 0, TAU); c.fill(); }
    // headwear
    if (o.band || acc.includes('band')) {
      const bc = o.band || '#ff7a2f', fl = o.flap || 1;
      c.fillStyle = bc; c.beginPath(); c.moveTo(-7.4, -7.8); c.quadraticCurveTo(0, -9.6, 7.4, -7.8); c.lineTo(7.6, -5.2); c.quadraticCurveTo(0, -7, -7.6, -5.2); c.closePath(); c.fill();
      c.strokeStyle = bc; c.lineCap = 'round';
      for (let k = 0; k < 2; k++) {
        const w1 = Math.sin(ph * 0.55 + k * 1.3) * 2.5 * fl, w2 = Math.sin(ph * 0.55 + 1.7 + k * 1.3) * 3.5 * fl, L = 6 + 3 * fl + k * 1.5;
        c.lineWidth = 2.2 - k * 0.4; c.beginPath(); c.moveTo(6.8, -6.4);
        c.quadraticCurveTo(6.8 + L * 0.6, -6.4 + L * 0.2 + w1, 6.8 + L * 0.7 + k * 1.5, -6.4 + L + w2); c.stroke();
      }
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(-5, -8.4, 7, 0.8);
    }
    if (acc.includes('cap')) {
      const cc = o.cap || '#5b7cff';
      c.fillStyle = cc; c.beginPath(); c.arc(0, -6.2, 6.8, Math.PI * 1.05, Math.PI * 1.95); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(2.5, -6.6, 6, 1.6, -0.15, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -11.6, 1.1, 0, TAU); c.fill();
    }
    if (acc.includes('bow')) {
      c.fillStyle = '#ff5ca8'; c.save(); c.translate(-5, -8); c.rotate(-0.4 + Math.sin(ph * 0.3) * 0.08);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(-5, -4.5, -5, 0); c.quadraticCurveTo(-5, 4.5, 0, 0); c.quadraticCurveTo(5, -4.5, 5, 0); c.quadraticCurveTo(5, 4.5, 0, 0); c.fill();
      c.fillStyle = '#ff9bd0'; c.beginPath(); c.arc(0, 0, 1.4, 0, TAU); c.fill(); c.restore();
    }
    if (acc.includes('crown') || o.crown) {
      c.fillStyle = '#ffd75c'; c.beginPath(); c.moveTo(-6, -8.5); c.lineTo(-6.5, -15); c.lineTo(-3, -11); c.lineTo(0, -16.5); c.lineTo(3, -11); c.lineTo(6.5, -15); c.lineTo(6, -8.5); c.closePath(); c.fill();
      c.strokeStyle = '#b07a10'; c.lineWidth = 0.8; c.stroke();
      c.fillStyle = '#ff3d6e'; c.beginPath(); c.arc(0, -11, 1.2, 0, TAU); c.fill();
    }
    c.restore();
    if (o.name) {
      c.font = `800 10px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const ny = y - 21 * sc - (o.acc && o.acc.includes('crown') ? 6 : 0);
      c.lineWidth = 3; c.strokeStyle = 'rgba(20,0,20,0.75)'; c.strokeText(o.name, x, ny); c.fillStyle = col; c.fillText(o.name, x, ny);
    }
  }
  drawPlayer(race, dt) {
    const c = this.ctx, p = race.p, x = p.x, y = this.sy(p.y), t = this.time;
    const frenzy = p.frenzyT > 0, dash = p.dashT > 0;
    // trail: rainbow in frenzy, icy while dashing
    this.trail.push({ x, y: p.y, h: (t * 400) % 360 }); if (this.trail.length > 26) this.trail.shift();
    if (frenzy || dash) {
      c.lineCap = 'round';
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        c.strokeStyle = frenzy ? `hsla(${a.h},100%,65%,${i / this.trail.length * 0.8})` : `rgba(140,220,255,${i / this.trail.length * 0.6})`;
        c.lineWidth = 3 + i * 0.5; c.beginPath(); c.moveTo(a.x, this.sy(a.y) + 18); c.lineTo(b.x, this.sy(b.y) + 18); c.stroke();
      }
    }
    // aura
    this.dglow(frenzy ? '#ffd75c' : dash ? '#8cdcff' : p.acid > 0.2 ? '#9dff3c' : '#96ffaa', x, y, frenzy ? 58 : 44, frenzy ? 0.7 : 0.45);
    if (frenzy) {   // spinning rainbow halo
      c.lineWidth = 3; c.lineCap = 'round';
      for (let i = 0; i < 6; i++) { const a0 = t * 5 + i * TAU / 6; c.strokeStyle = `hsl(${(i * 60 + t * 300) % 360},100%,65%)`; c.beginPath(); c.arc(x, y, 27 + Math.sin(t * 9) * 2, a0, a0 + 0.7); c.stroke(); }
    }
    // wingman
    if (p.wing > 0) this.drawSwimmer(x - 26, y + 14 + Math.sin(t * 3) * 4, p.heading, 0.9, '#ffe0a8', t * 18 + 2, { band: '#5ce1ff', acc: ['glasses'], mouth: 'grin', blink: (t % 3) < 0.1 });
    let danger = false; for (const e of race.ents) if (e.t === 'wbc' && !e.dead && Math.abs(e.y - p.y) < 130 && Math.hypot(e.x - x, e.y - p.y) < 120) { danger = true; break; }
    const tw = dash ? 26 : frenzy ? 21 : 15 + (p.vy / 500) * 3;
    const blinkInv = p.inv > 0 && p.inv < 1 && Math.floor(t * 20) % 2 === 0;
    const low = p.e < 30, stuck = p.stuck > 0;
    const o = {
      band: '#ff3d6e', taper: 1, flap: 1 + (dash ? 1.4 : 0) + (p.vy / 700), stretch: 1 + this.sq,
      look: clamp(p.vx / 200, -1.2, 1.2), flash: this.pHit / 0.35,
      blink: !danger && !dash && (t % 3.4) < 0.12,
    };
    if (stuck) { o.dizzy = 1; o.mouth = 'wobble'; }
    else if (danger) { o.mouth = 'scared'; o.brow = 'worried'; }
    else if (frenzy) { o.mouth = 'huge'; o.star = '#ffd75c'; o.blush = 1; }
    else if (dash) { o.mouth = 'grin'; o.brow = 'angry'; }
    else if (p.combo > 5) { o.mouth = 'grin'; o.blush = 1; }
    else if (low) { o.mouth = 'pant'; o.tired = 1; o.brow = 'worried'; }
    else if (race.drill) { o.mouth = 'grin'; o.happy = 1; o.blush = 1; }
    const body = frenzy ? `hsl(${(t * 300) % 360},100%,82%)` : p.acid > 0.2 ? '#e8ffd0' : '#ffffff';
    if (!blinkInv) this.drawSwimmer(x, y, p.heading, 1.45, body, t * tw, o);
    // sweat when tired
    this.sweatT -= dt;
    if (low && !race.over && this.sweatT <= 0) {
      this.sweatT = 0.18 + p.e / 100;
      const s = Math.random() < 0.5 ? -1 : 1;
      this.addP({ k: 3, x: x + s * 9, y: p.y + 10, vx: s * (40 + Math.random() * 40), vy: 30 + Math.random() * 40, life: 0.6, max: 0.6, col: '#9ae2ff', size: 2.4, g: 220, rot: 0, vr: 0 });
    }
    // dizzy stars after a bonk
    if (stuck || p.inv > 0.6) {
      c.fillStyle = '#ffd75c';
      for (let i = 0; i < 3; i++) { const a = t * 7 + i * TAU / 3; star4(c, x + Math.cos(a) * 14, y - 18 + Math.sin(a) * 4, 3); }
    }
    // shields: bubbly hex shimmer
    for (let i = 0; i < p.shield; i++) {
      const r = 24 + i * 5 + Math.sin(t * 6 + i) * 1.5;
      c.strokeStyle = `rgba(255,215,92,${0.75 - i * 0.18})`; c.lineWidth = 2; c.beginPath();
      for (let k = 0; k <= 6; k++) { const a = k / 6 * TAU + t * (i % 2 ? -0.8 : 0.8); k ? c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r) : c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
      c.stroke();
    }
    if (p.acid > 0.2) { c.fillStyle = 'rgba(157,255,60,0.6)'; for (let i = 0; i < 3; i++) { const k = (t * 1.5 + i / 3) % 1; c.beginPath(); c.arc(x - 8 + i * 8, y - 6 - k * 16, 2 * (1 - k) + 0.5, 0, TAU); c.fill(); } }
    if (race.draftTarget && p.draft > 0.05) {
      const tx = race.agentX(race.draftTarget), ty = this.sy(race.draftTarget.y);
      c.strokeStyle = `rgba(140,220,255,${Math.min(0.9, p.draft * 2)})`; c.lineWidth = 1.5; c.setLineDash([4, 5]); c.lineDashOffset = -t * 40;
      c.beginPath(); c.moveTo(x - 9, y - 12); c.lineTo(tx - 5, ty + 8); c.moveTo(x + 9, y - 12); c.lineTo(tx + 5, ty + 8); c.stroke(); c.setLineDash([]); c.lineDashOffset = 0;
    }
    // "YOU" marker for the first seconds of a run (so you can find Kevin in the crowd)
    if (!race.demo && race.t != null && race.t < 4) {
      const a = clamp(4 - race.t, 0, 1), b = Math.sin(t * 8) * 3;
      c.globalAlpha = a; c.fillStyle = '#ff3d6e'; c.beginPath(); c.moveTo(x, y - 26 + b); c.lineTo(x - 7, y - 36 + b); c.lineTo(x + 7, y - 36 + b); c.closePath(); c.fill();
      c.font = `900 14px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 4; c.strokeStyle = '#2a0a24'; c.strokeText('YOU', x, y - 46 + b); c.fillStyle = '#fff'; c.fillText('YOU', x, y - 46 + b);
      c.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- effects
  drawFx(race, dt) {
    const c = this.ctx;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const f of race.fx) {
      const y = this.sy(f.y), k = clamp(f.age / 1.2, 0, 1);
      if (f.t === 'eaten') {
        c.globalAlpha = 1 - k; c.fillStyle = '#ff5c8a'; c.font = `800 12px ${FONT}`; c.fillText('nom', f.x, y - 10 - k * 30);
        c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(f.x + Math.cos(i * 1.7) * k * 20, y + Math.sin(i * 1.7) * k * 20, 1.5 * (1 - k) + 0.3, 0, TAU); c.fill(); }
      } else {   // a tiny ghost with a halo floats off to swimmer heaven
        const gy = y - 6 - k * 40, gx = f.x + Math.sin(k * 10) * 4;
        c.globalAlpha = 0.75 * (1 - k);
        c.fillStyle = '#fff'; c.beginPath(); c.arc(gx, gy, 5, Math.PI, 0); c.lineTo(gx + 5, gy + 6);
        for (let i = 0; i < 4; i++) c.lineTo(gx + 5 - (i + 0.5) * 2.5, gy + 6 + (i % 2 ? 2 : -1));
        c.lineTo(gx - 5, gy + 6); c.closePath(); c.fill();
        c.fillStyle = '#2a1030'; c.font = `700 6px ${FONT}`; c.fillText('x x', gx, gy);
        c.strokeStyle = '#ffd75c'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(gx, gy - 8, 4, 1.4, 0, 0, TAU); c.stroke();
      }
    }
    c.globalAlpha = 1;
    // rings
    let n = 0;
    for (const r of this.rings) {
      r.life -= dt; if (r.life <= 0) continue; this.rings[n++] = r;
      const k = 1 - r.life / r.max, e = 1 - (1 - k) * (1 - k);
      c.globalAlpha = 1 - k; c.strokeStyle = r.col; c.lineWidth = r.w * (1 - k) + 0.5;
      c.beginPath(); c.arc(r.x, this.sy(r.y), 6 + r.r * e, 0, TAU); c.stroke();
    }
    this.rings.length = n; c.globalAlpha = 1;
    // particles (in-place compaction, no per-frame arrays)
    n = 0;
    for (const q of this.parts) {
      q.life -= dt; if (q.life <= 0) continue; this.parts[n++] = q;
      q.x += q.vx * dt; q.y += q.vy * dt; q.vy -= (q.g || 0) * dt;
      const drag = q.k === 2 ? 0.985 : 0.94; q.vx *= drag; if (q.k === 2) q.vy *= 0.97; else if (q.k !== 3) q.vy *= drag;
      const a = q.life / q.max, sy = this.sy(q.y);
      c.globalAlpha = q.k === 2 ? Math.min(1, a * 3) : a; c.fillStyle = q.col;
      if (q.k === 1) { c.strokeStyle = q.col; c.lineWidth = q.size * 0.7 * (0.4 + a); c.lineCap = 'round'; c.beginPath(); c.moveTo(q.x, sy); c.lineTo(q.x - q.vx * 0.05, sy + q.vy * 0.05); c.stroke(); }
      else if (q.k === 2) { q.rot += q.vr * dt; const w = Math.cos(q.rot) * q.size; c.fillRect(q.x - w / 2, sy - q.size * 0.3, w || 0.5, q.size * 0.6); }
      else if (q.k === 3) { c.beginPath(); c.moveTo(q.x, sy - q.size * 1.8); c.quadraticCurveTo(q.x + q.size, sy, q.x, sy + q.size); c.quadraticCurveTo(q.x - q.size, sy, q.x, sy - q.size * 1.8); c.fill(); }
      else if (q.k === 4) { c.strokeStyle = q.col; c.lineWidth = 1.2; c.beginPath(); c.arc(q.x, sy, q.size * (1.5 - a * 0.5), 0, TAU); c.stroke(); }
      else { c.beginPath(); c.arc(q.x, sy, q.size * (0.4 + a), 0, TAU); c.fill(); }
    }
    this.parts.length = n; c.globalAlpha = 1;
    // popups: elastic pop-in, wobble, thick outline, drop shadow
    n = 0;
    for (const q of this.pops) {
      q.life -= dt; if (q.life <= 0) continue; this.pops[n++] = q;
      const k = 1 - q.life / q.max, ki = Math.min(1, k / 0.18);
      const sc = k < 0.18 ? backOut(ki) : 1 - Math.max(0, k - 0.75) * 0.6;
      const y = this.sy(q.y) - 52 * (1 - Math.pow(1 - k, 3)), rot = q.rot * (1 - k) + Math.sin(k * 18) * 0.05 * (1 - k);
      const fs = Math.max(6, Math.round(q.size * sc));
      c.globalAlpha = Math.min(1, q.life * 3);
      c.save(); c.translate(q.x, y); c.rotate(rot);
      c.font = `900 ${fs}px ${FONT}`;
      c.fillStyle = 'rgba(30,0,30,0.55)'; c.fillText(q.text, 1.5, fs * 0.14 + 1.5);
      c.lineJoin = 'round'; c.lineWidth = Math.max(3, fs * 0.28); c.strokeStyle = '#2a0a24'; c.strokeText(q.text, 0, 0);
      c.fillStyle = q.col; c.fillText(q.text, 0, 0);
      if (fs >= 16) { c.globalAlpha *= 0.35; c.fillStyle = '#fff'; c.fillText(q.text, 0, -fs * 0.06); }
      c.restore();
    }
    this.pops.length = n; c.globalAlpha = 1;
  }
}

// ---------------------------------------------------------------- small helpers
const BX = new Float32Array(64), BY = new Float32Array(64);
// a closed, smooth outline through the points in BX/BY (quadratic curves via midpoints)
function smoothBlob(c, n) {
  c.beginPath(); c.moveTo((BX[n - 1] + BX[0]) / 2, (BY[n - 1] + BY[0]) / 2);
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; c.quadraticCurveTo(BX[i], BY[i], (BX[i] + BX[j]) / 2, (BY[i] + BY[j]) / 2); }
  c.closePath();
}
function strokePts(c, P, dx = 0) {
  c.beginPath(); c.moveTo(P[0] + dx, P[1]);
  for (let i = 2; i < P.length; i += 2) c.lineTo(P[i] + dx, P[i + 1]);
  c.stroke();
}
function star4(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r); c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
}
function heart(c, x, y, r) {
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.1, x, y - r * 0.4);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9); c.fill();
}
function backOut(k) { const s = 2.2; k -= 1; return k * k * ((s + 1) * k + s) + 1; }

// One backdrop tile per zone, painted once: the flesh outside the tube, seen at parallax.
function paintTile(g, z, zi) {
  const rnd = seeded(9001 + zi * 77), W = TW, H = TH;
  const c0 = rgb(z.col[0]), c1 = rgb(z.col[1]), wl = rgb(z.wall);
  const wrap = (fn) => { for (const o of [-H, 0, H]) fn(o); };
  g.fillStyle = css(c0); g.fillRect(0, 0, W, H);
  // soft lumps of tissue
  for (let i = 0; i < 16; i++) {
    const x = rnd() * W, y = rnd() * H, r = 40 + rnd() * 90, al = 0.25 + rnd() * 0.3;
    wrap((o) => { const gr = g.createRadialGradient(x, y + o, 0, x, y + o, r); gr.addColorStop(0, css(c1, al)); gr.addColorStop(1, css(c1, 0)); g.fillStyle = gr; g.fillRect(x - r, y + o - r, r * 2, r * 2); });
  }
  g.lineCap = 'round'; g.lineJoin = 'round';
  if (z.id === 'launch') {      // veins
    for (let v = 0; v < 7; v++) {
      let x = rnd() * W, y = rnd() * H, a = rnd() * TAU, w = 5 + rnd() * 3;
      const pts = [[x, y, w]];
      for (let s = 0; s < 16 && w > 0.8; s++) { a += (rnd() - 0.5) * 0.8; x += Math.cos(a) * 24; y += Math.sin(a) * 24; w *= 0.88; pts.push([x, y, w]); }
      wrap((o) => {
        for (let i = 1; i < pts.length; i++) {
          g.strokeStyle = 'rgba(110,8,45,0.6)'; g.lineWidth = pts[i][2] + 2; g.beginPath(); g.moveTo(pts[i - 1][0], pts[i - 1][1] + o); g.lineTo(pts[i][0], pts[i][1] + o); g.stroke();
          g.strokeStyle = 'rgba(255,120,170,0.28)'; g.lineWidth = Math.max(0.6, pts[i][2] * 0.35); g.beginPath(); g.moveTo(pts[i - 1][0] - 1, pts[i - 1][1] + o - 1); g.lineTo(pts[i][0] - 1, pts[i][1] + o - 1); g.stroke();
        }
      });
    }
  } else if (z.id === 'acid') {
    for (let i = 0; i < 40; i++) { const x = rnd() * W, y = rnd() * H, r = 2 + rnd() * 9; wrap((o) => { g.strokeStyle = 'rgba(182,255,92,0.22)'; g.lineWidth = 1.3; g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(220,255,170,0.25)'; g.beginPath(); g.arc(x - r * 0.35, y + o - r * 0.35, r * 0.25, 0, TAU); g.fill(); }); }
  } else if (z.id === 'goo') {
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, y = rnd() * H, L = 60 + rnd() * 140, w = 1.5 + rnd() * 3;
      wrap((o) => { g.strokeStyle = 'rgba(217,184,255,0.22)'; g.lineWidth = w; g.beginPath(); g.moveTo(x, y + o); g.bezierCurveTo(x + 14, y + o + L * 0.3, x - 14, y + o + L * 0.7, x + 4, y + o + L); g.stroke(); g.fillStyle = 'rgba(217,184,255,0.3)'; g.beginPath(); g.arc(x + 4, y + o + L + 3, w + 1.5, 0, TAU); g.fill(); });
    }
  } else if (z.id === 'sea') {
    for (let i = 0; i < 24; i++) {
      const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 16, a = rnd() * TAU, sq = 0.5 + rnd() * 0.5;
      wrap((o) => { g.save(); g.translate(x, y + o); g.rotate(a); g.scale(1, sq); g.fillStyle = 'rgba(190,30,60,0.35)'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.fillStyle = 'rgba(90,5,25,0.35)'; g.beginPath(); g.arc(0, 0, r * 0.5, 0, TAU); g.fill(); g.restore(); });
    }
  } else if (z.id === 'fork') {
    for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 18; wrap((o) => { g.strokeStyle = 'rgba(255,155,224,0.13)'; g.lineWidth = 2; g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,155,224,0.16)'; g.beginPath(); g.arc(x + r * 0.2, y + o, r * 0.25, 0, TAU); g.fill(); }); }
  } else if (z.id === 'rapids') {
    for (let i = 0; i < 46; i++) { const x = rnd() * W, y = rnd() * H, L = 40 + rnd() * 120; wrap((o) => { g.strokeStyle = 'rgba(92,225,255,0.13)'; g.lineWidth = 1 + rnd() * 2; g.beginPath(); g.moveTo(x, y + o); g.quadraticCurveTo(x + 8, y + o + L / 2, x, y + o + L); g.stroke(); }); }
  } else if (z.id === 'egg') {
    for (let i = 0; i < 70; i++) { const x = rnd() * W, y = rnd() * H, r = 0.8 + rnd() * 2.2; wrap((o) => { g.fillStyle = 'rgba(255,225,140,0.45)'; g.beginPath(); g.arc(x, y + o, r, 0, TAU); g.fill(); }); }
  }
  // a little wall-tinted speckle everywhere so nothing looks flat
  for (let i = 0; i < 60; i++) { const x = rnd() * W, y = rnd() * H, r = 0.6 + rnd() * 1.4; g.fillStyle = css(wl, 0.12); g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); }
}
