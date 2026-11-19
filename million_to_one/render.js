// Million To One: everything drawn on the canvas. Reads a Race, never changes it.
import { VIEW_W, channel, centre, zoneIndex, ZSTART, FORK_Y0, FORK_END, DEAD_Y, trackInfo } from './core.js';
import { ZONES, RACE_LEN } from './content.js';

const TAU = Math.PI * 2;
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
const mix = (h1, h2, t) => { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16); const c = (s) => Math.round(((a >> s) & 255) * (1 - t) + ((b >> s) & 255) * t); return `rgb(${c(16)},${c(8)},${c(0)})`; };
const FRUIT = ['#ff4d6d', '#5b7cff', '#ffa630', '#b84dff', '#ff6b9a'];

export class Renderer {
  constructor(cv) {
    this.cv = cv; this.ctx = cv.getContext('2d');
    this.parts = []; this.pops = []; this.shake = 0; this.flash = 0; this.flashCol = '#fff';
    this.motes = Array.from({ length: 70 }, () => ({ x: Math.random() * VIEW_W, y: Math.random() * 1400, r: 0.6 + Math.random() * 2.4, d: 0.3 + Math.random() * 0.6 }));
    this.trail = []; this.time = 0; this.zoom = 1;
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = this.cv.clientWidth, h = this.cv.clientHeight;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.s = this.cv.width / VIEW_W; this.H = this.cv.height / this.s; this.dpr = dpr;
  }
  // world -> screen (logical units; the canvas transform scales to pixels)
  sy(wy) { return this.H - (wy - this.camY); }

  burst(x, y, col, n = 10, spd = 120, life = 0.6, size = 3) {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = spd * (0.3 + Math.random()); this.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col, size: size * (0.5 + Math.random()) }); }
  }
  pop(x, y, text, col = '#fff', size = 16, life = 1.1) { this.pops.push({ x, y, text, col, size, life, max: life }); if (this.pops.length > 30) this.pops.shift(); }

  draw(race, dt) {
    const c = this.ctx, p = race.p; this.time += dt;
    // camera: the player sits low on the screen so you see what is coming
    const lead = race.drill ? 0.5 : 0.27;
    const target = p.y - this.H * lead;
    this.camY = this.camY == null ? target : this.camY + (target - this.camY) * Math.min(1, dt * 8);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const sh = this.shake > 0 ? this.shake : 0; this.shake = Math.max(0, this.shake - dt * 30);
    const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    c.setTransform(this.s, 0, 0, this.s, ox * this.s, oy * this.s);

    const zi = zoneIndex(p.y), z = ZONES[zi], zn = ZONES[zi + 1];
    let bt = 0; if (zn) bt = Math.max(0, Math.min(1, (p.y - (ZSTART[zi + 1] - 1500)) / 1500));
    const deep = zn ? mix(z.col[0], zn.col[0], bt) : z.col[0], lite = zn ? mix(z.col[1], zn.col[1], bt) : z.col[1], wall = zn ? mix(z.wall, zn.wall, bt) : z.wall;
    // flesh outside the tube
    c.fillStyle = deep; c.fillRect(-20, -20, VIEW_W + 40, this.H + 40);
    this.drawTube(race, lite, wall, deep);
    this.drawMotes(race, wall);
    this.drawEnts(race);
    this.drawEgg(race);
    this.drawAgents(race);
    this.drawPlayer(race, dt);
    this.drawFx(race, dt);
    // speed lines when you are flying
    const fast = (p.dashT > 0 ? 1 : 0) + (p.frenzyT > 0 ? 0.7 : 0);
    if (fast && !race.drill) {
      c.strokeStyle = `rgba(255,255,255,${0.12 * fast})`; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < 14; i++) { const x = (i * 97 + this.time * 31) % VIEW_W, y = ((i * 211 + this.time * 1400) % (this.H + 200)) - 100; c.moveTo(x, y); c.lineTo(x, y + 60 + 40 * fast); }
      c.stroke();
    }
    // vignette + low-energy pulse + flash
    const g = c.createRadialGradient(VIEW_W / 2, this.H * 0.6, this.H * 0.25, VIEW_W / 2, this.H * 0.6, this.H * 0.85);
    const low = p.e < 25 ? 0.25 + 0.2 * Math.sin(this.time * 8) : 0;
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, low ? `rgba(120,0,20,${0.55 + low})` : 'rgba(0,0,0,0.55)');
    c.fillStyle = g; c.fillRect(-20, -20, VIEW_W + 40, this.H + 40);
    if (this.flash > 0) { c.fillStyle = this.flashCol; c.globalAlpha = Math.min(1, this.flash); c.fillRect(-20, -20, VIEW_W + 40, this.H + 40); c.globalAlpha = 1; this.flash -= dt * 3; }
  }

  sides(race) {
    const y0 = this.camY;
    if (y0 + this.H < FORK_Y0) return [0];
    if (y0 > FORK_END + 200) return [race.p.side || race.eggSide];
    return [-1, 1];
  }
  drawTube(race, lite, wall, deep) {
    const c = this.ctx, y0 = this.camY - 60, y1 = this.camY + this.H + 60, step = 22;
    for (const side of this.sides(race)) {
      const L = [], R = [];
      for (let y = y0; y <= y1; y += step) {
        const top = side && race.p.side && side !== race.p.side && y > FORK_END + 200;
        if (side && side !== (race.p.side || side) && y > FORK_END + 600) break;
        const ch = channel(y, side);
        const wob = Math.sin(y / 60 + this.time * 2) * 3;
        L.push([ch.c - ch.h - wob, this.sy(y)]); R.push([ch.c + ch.h + wob, this.sy(y)]);
        if (top) break;
      }
      if (L.length < 2) continue;
      const g = c.createLinearGradient(0, 0, VIEW_W, 0);
      g.addColorStop(0, deep); g.addColorStop(0.5, lite); g.addColorStop(1, deep);
      c.beginPath(); c.moveTo(L[0][0], L[0][1]);
      for (const q of L) c.lineTo(q[0], q[1]);
      for (let i = R.length - 1; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
      c.closePath(); c.fillStyle = g; c.fill();
      // glossy rims
      for (const side2 of [L, R]) {
        c.beginPath(); side2.forEach((q, i) => (i ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1])));
        c.strokeStyle = hexA(wall.startsWith('#') ? wall : '#ff7aa8', 0.25); c.lineWidth = 10; c.stroke();
        c.strokeStyle = wall; c.lineWidth = 2.5; c.stroke();
      }
      // cilia hairs on the walls
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.2; c.beginPath();
      for (let i = 0; i < L.length; i += 1) {
        const sw = Math.sin(this.time * 6 + i * 0.9) * 5;
        c.moveTo(L[i][0], L[i][1]); c.lineTo(L[i][0] + 7, L[i][1] + sw);
        c.moveTo(R[i][0], R[i][1]); c.lineTo(R[i][0] - 7, R[i][1] + sw);
      }
      c.stroke();
    }
    // the dead end of the wrong tube
    const ps = race.p.side;
    if (ps && ps !== race.eggSide) {
      const y = this.sy(DEAD_Y), ch = channel(DEAD_Y, ps);
      if (y > -80 && y < this.H + 80) {
        c.fillStyle = deep; c.fillRect(ch.c - ch.h - 20, y - 400, ch.h * 2 + 40, 400);
        c.strokeStyle = wall; c.lineWidth = 3; c.beginPath(); c.moveTo(ch.c - ch.h, y); c.quadraticCurveTo(ch.c, y + 30, ch.c + ch.h, y); c.stroke();
        this.sign(ch.c, y + 70, 'NO EGG HERE', '#ff5c7a');
      }
    }
    // fork sign
    const fy = this.sy(FORK_Y0 - 500);
    if (fy > -60 && fy < this.H + 60) this.sign(centre(FORK_Y0 - 500), fy, '← PICK A TUBE →', '#ff9be0');
  }
  sign(x, y, text, col) {
    const c = this.ctx; c.font = '800 15px "Baloo 2", system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    const w = c.measureText(text).width + 22;
    c.fillStyle = 'rgba(20,0,20,0.7)'; this.rrect(x - w / 2, y - 14, w, 28, 10); c.fill();
    c.strokeStyle = col; c.lineWidth = 2; c.stroke(); c.fillStyle = col; c.fillText(text, x, y + 1);
  }
  rrect(x, y, w, h, r) { const c = this.ctx; c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  drawMotes(race, wall) {
    const c = this.ctx; c.fillStyle = 'rgba(255,255,255,0.13)';
    for (const m of this.motes) {
      const y = ((m.y - this.camY * m.d) % 1400 + 1400) % 1400 - 100;
      c.beginPath(); c.arc(m.x + Math.sin(this.time + m.y) * 6, y * (this.H + 200) / 1400, m.r, 0, TAU); c.fill();
    }
    // fork scent: pink sparkles drift out of the right tube
    const p = race.p;
    if (p.y > FORK_Y0 - 4000 && p.y < FORK_END) {
      const strong = race.muts.nose ? 1 : 0.45;
      for (let i = 0; i < 18; i++) {
        const k = (this.time * 0.35 + i / 18) % 1, wy = FORK_Y0 + 1200 - k * 3600;
        const ch = channel(Math.max(wy, FORK_Y0 + 10), race.eggSide);
        const x = ch.c + Math.sin(i * 7.1 + this.time * 2) * ch.h * 0.6 * (1 - k * 0.5);
        c.fillStyle = `rgba(255,150,230,${strong * (1 - k) * 0.9})`; c.beginPath(); c.arc(x, this.sy(wy), 2.2 + (i % 3), 0, TAU); c.fill();
      }
      if (race.muts.nose && !p.side) {
        const ch = channel(FORK_Y0 + 300, race.eggSide), y = this.sy(Math.min(p.y + 350, FORK_Y0 + 200));
        c.save(); c.translate(ch.c, y); c.fillStyle = '#ff8be0'; c.globalAlpha = 0.6 + 0.4 * Math.sin(this.time * 6);
        c.beginPath(); c.moveTo(0, -26); c.lineTo(18, 0); c.lineTo(7, 0); c.lineTo(7, 22); c.lineTo(-7, 22); c.lineTo(-7, 0); c.lineTo(-18, 0); c.closePath(); c.fill(); c.restore();
      }
    }
  }

  drawEnts(race) {
    const c = this.ctx, top = this.camY + this.H + 80, bot = this.camY - 80, t = this.time, p = race.p;
    for (const e of race.ents) {
      if (e.dead || e.y > top + e.r || e.y < bot - (e.h || 0) - e.r) continue;
      const x = e.x, y = this.sy(e.y);
      switch (e.t) {
        case 'sugar': {
          const col = FRUIT[Math.floor(Math.abs(e.x * 7 + e.y)) % FRUIT.length], bob = Math.sin(t * 4 + e.y) * 2;
          c.fillStyle = hexA(col, 0.25); c.beginPath(); c.arc(x, y + bob, e.r + 6, 0, TAU); c.fill();
          c.fillStyle = col; c.beginPath(); c.arc(x, y + bob, e.r, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(x - 3, y + bob - 3, 2.6, 0, TAU); c.fill();
          c.fillStyle = '#5bd96b'; c.beginPath(); c.ellipse(x + 2, y + bob - e.r, 4, 2, -0.5, 0, TAU); c.fill();
          break; }
        case 'dna': {
          c.lineWidth = 2.5;
          for (let k = 0; k < 2; k++) { c.strokeStyle = k ? '#5ce1ff' : '#ff5cd2'; c.beginPath(); for (let i = 0; i <= 10; i++) { const yy = y - 14 + i * 2.8, xx = x + Math.sin(t * 5 + i * 0.7 + k * Math.PI) * 8; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); } c.stroke(); }
          c.fillStyle = 'rgba(255,255,255,0.15)'; c.beginPath(); c.arc(x, y, 18, 0, TAU); c.fill();
          break; }
        case 'shield': case 'alkali': {
          const col = e.t === 'shield' ? '#ffd75c' : '#5cc8ff';
          c.strokeStyle = col; c.lineWidth = 2.5; c.fillStyle = hexA(col, 0.2);
          c.beginPath(); c.arc(x, y, e.r + Math.sin(t * 5) * 1.5, 0, TAU); c.fill(); c.stroke();
          c.fillStyle = col; c.font = '800 11px system-ui'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(e.t === 'shield' ? '⛑' : 'pH', x, y + 1);
          break; }
        case 'acid': case 'goo': {
          const col = e.t === 'acid' ? '#9dff3c' : '#c79bff';
          c.fillStyle = hexA(col, e.t === 'acid' ? 0.32 : 0.28); c.beginPath();
          for (let i = 0; i <= 14; i++) { const a = i / 14 * TAU, rr = e.r * (1 + 0.12 * Math.sin(a * 3 + e.seed + t * 2)); const xx = x + Math.cos(a) * rr, yy = y + Math.sin(a) * rr * 0.78; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
          c.closePath(); c.fill(); c.strokeStyle = hexA(col, 0.7); c.lineWidth = 2; c.stroke();
          c.fillStyle = hexA(col, 0.8);
          for (let i = 0; i < 4; i++) { const k = (t * 0.7 + i / 4 + e.seed) % 1; c.beginPath(); c.arc(x + Math.sin(i * 5 + e.seed) * e.r * 0.5, y + e.r * 0.4 - k * e.r * 0.8, 2 + 2 * (1 - k), 0, TAU); c.fill(); }
          break; }
        case 'gate': {
          const ch = channel(e.y, e.side), L = ch.c - ch.h - 8, R = ch.c + ch.h + 8;
          const gaps = e.gaps.slice().sort((a, b) => a - b); let x0 = L;
          c.fillStyle = 'rgba(217,184,255,0.55)'; c.strokeStyle = '#efe0ff'; c.lineWidth = 2;
          const seg = (a, b) => { if (b - a < 2) return; c.beginPath(); c.moveTo(a, y - 9); for (let xx = a; xx <= b; xx += 8) c.lineTo(xx, y - 9 + Math.sin(xx / 9 + t * 3) * 2.5); c.lineTo(b, y + 9); for (let xx = b; xx >= a; xx -= 8) c.lineTo(xx, y + 9 + Math.sin(xx / 7 - t * 3) * 2.5); c.closePath(); c.fill(); c.stroke(); };
          for (const g of gaps) { seg(x0, g - e.gw / 2); x0 = g + e.gw / 2; }
          seg(x0, R);
          // drips + gap glow
          for (const g of gaps) { c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(g - e.gw / 2, y - 30, e.gw, 60); }
          break; }
        case 'wbc': {
          const hunt = e.hunt, r = e.r * (1 + 0.06 * Math.sin(e.ph * 5)), chomp = e.eat > 0 ? 0.5 + 0.5 * Math.sin(t * 40) : 0;
          c.fillStyle = 'rgba(255,240,245,0.16)'; c.beginPath(); c.arc(x, y, r + 10, 0, TAU); c.fill();
          c.fillStyle = '#f4eef7'; c.beginPath();
          for (let i = 0; i <= 18; i++) { const a = i / 18 * TAU, rr = r * (1 + 0.1 * Math.sin(a * 4 + e.ph * 3)); const xx = x + Math.cos(a) * rr, yy = y + Math.sin(a) * rr; i ? c.lineTo(xx, yy) : c.moveTo(xx, yy); }
          c.closePath(); c.fill(); c.strokeStyle = '#c9b6d9'; c.lineWidth = 2; c.stroke();
          c.fillStyle = 'rgba(160,110,200,0.45)'; c.beginPath(); c.ellipse(x + 5, y + 6, r * 0.35, r * 0.25, 0.4, 0, TAU); c.fill();
          // eyes look at you
          const ang = Math.atan2(this.sy(p.y) - y, p.x - x);
          for (const sx of [-1, 1]) {
            const ex = x + sx * r * 0.32, ey = y - r * 0.25;
            c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, r * 0.24, 0, TAU); c.fill(); c.strokeStyle = '#333'; c.lineWidth = 1; c.stroke();
            c.fillStyle = '#111'; c.beginPath(); c.arc(ex + Math.cos(ang) * r * 0.1, ey + Math.sin(ang) * r * 0.1, r * 0.11, 0, TAU); c.fill();
            if (hunt > 0.5) { c.strokeStyle = '#333'; c.lineWidth = 2; c.beginPath(); c.moveTo(ex - sx * r * 0.25, ey - r * 0.32); c.lineTo(ex + sx * r * 0.18, ey - r * 0.2); c.stroke(); }
          }
          // mouth
          const mo = hunt * 0.25 + chomp * 0.2;
          c.fillStyle = '#5a1030'; c.beginPath(); c.ellipse(x, y + r * 0.35, r * 0.42, r * (0.05 + mo), 0, 0, TAU); c.fill();
          if (mo > 0.12) { c.fillStyle = '#fff'; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(x + i * r * 0.15 - 3, y + r * 0.35 - r * mo * 0.7); c.lineTo(x + i * r * 0.15 + 3, y + r * 0.35 - r * mo * 0.7); c.lineTo(x + i * r * 0.15, y + r * 0.35 - r * mo * 0.3); c.fill(); } }
          break; }
        case 'current': {
          const y1 = this.sy(e.y + e.h);
          c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 3;
          for (let i = 0; i < 4; i++) {
            const yy = y1 + (i + 0.5) * (y - y1) / 4, k = ((t * 0.8 * e.dir + i * 0.3) % 1 + 1) % 1, xx = e.x - e.r + k * e.r * 2;
            c.beginPath(); c.moveTo(xx - 16 * e.dir, yy - 8); c.lineTo(xx, yy); c.lineTo(xx - 16 * e.dir, yy + 8); c.stroke();
          }
          break; }
      }
    }
  }

  drawEgg(race) {
    const c = this.ctx, y = this.sy(RACE_LEN + 120), x = centre(RACE_LEN);
    if (y < -400) return;
    const t = this.time, R = 150;
    const g = c.createRadialGradient(x, y, R * 0.2, x, y, R * 1.9);
    g.addColorStop(0, 'rgba(255,230,140,0.6)'); g.addColorStop(1, 'rgba(255,200,80,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, R * 1.9, 0, TAU); c.fill();
    // corona cells
    for (let i = 0; i < 26; i++) { const a = i / 26 * TAU + t * 0.1, rr = R + 14 + Math.sin(t * 2 + i) * 4; c.fillStyle = 'rgba(255,220,150,0.8)'; c.beginPath(); c.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 11, 0, TAU); c.fill(); }
    const g2 = c.createRadialGradient(x - 40, y - 50, 20, x, y, R);
    g2.addColorStop(0, '#fff8de'); g2.addColorStop(0.6, '#ffd77a'); g2.addColorStop(1, '#e8a33c');
    c.fillStyle = g2; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 6; c.stroke();
    // a sleepy face that wakes up when you get close
    const near = Math.max(0, 1 - (RACE_LEN - race.p.y) / 2500);
    c.fillStyle = '#7a4a12';
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * 45, y + 10, 10, 2 + 10 * near, 0, 0, TAU); c.fill(); }
    c.beginPath(); c.arc(x, y + 45, 14 + 6 * near, 0.1 * Math.PI, 0.9 * Math.PI); c.lineWidth = 4; c.strokeStyle = '#7a4a12'; c.stroke();
    c.fillStyle = 'rgba(255,120,150,0.5)'; for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(x + sx * 75, y + 35, 14, 8, 0, 0, TAU); c.fill(); }
    if (race.drill) {   // drill progress ring around the egg
      const d = race.drill;
      c.strokeStyle = '#5ce1ff'; c.lineWidth = 8; c.beginPath(); c.arc(x, y, R + 34, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, d.me / d.need)); c.stroke();
      let lead = 0; for (const a of race.agents) if (a.alive && a.arrived) lead = Math.max(lead, a.drill);
      if (lead > 0) { c.strokeStyle = '#ff5c7a'; c.lineWidth = 5; c.beginPath(); c.arc(x, y, R + 46, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, lead / d.need)); c.stroke(); }
    }
  }

  // ---------------------------------------------------------------- swimmers
  tail(c, x, y, ang, len, amp, ph, w) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    c.moveTo(x, y);
    for (let i = 1; i <= 7; i++) {
      const k = i / 7, off = Math.sin(ph - k * 5.5) * amp * k;
      c.lineTo(x - sa * len * k + ca * off, y + ca * len * k + sa * off);
    }
  }
  drawAgents(race) {
    const c = this.ctx, top = this.camY + this.H + 40, bot = this.camY - 40, t = this.time, p = race.p;
    const vis = [];
    for (const a of race.agents) {
      if (!a.alive || a.y > top || a.y < bot) continue;
      if (p.side && a.y > FORK_Y0 && a.side !== p.side && a.y > FORK_END) continue;
      vis.push(a); if (vis.length > 220) break;
    }
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    for (const a of vis) if (!a.boss) { const x = race.agentX(a), y = this.sy(a.y); a._x = x; this.tail(c, x, y + 7, a.kx * 0.2, 26, 5, t * 16 + a.ph, 1); }
    c.stroke();
    c.fillStyle = '#f3f0ff'; c.beginPath();
    for (const a of vis) if (!a.boss) { const y = this.sy(a.y); c.moveTo(a._x + 5.5, y); c.ellipse(a._x, y, 5.5, 7.5, 0, 0, TAU); }
    c.fill();
    // faces only on the close ones (cheap)
    c.fillStyle = '#222';
    for (const a of vis) if (!a.boss && Math.abs(a.y - p.y) < 220) { const y = this.sy(a.y); c.fillRect(a._x - 2.6, y - 2.5, 1.6, 2.2); c.fillRect(a._x + 1, y - 2.5, 1.6, 2.2); }
    // bosses
    for (const a of vis) if (a.boss) this.drawSwimmer(race.agentX(a), this.sy(a.y), a.kx * 0.2, 1.25, a.boss.col, t * 15 + a.ph, { name: a.boss.name, crown: a.boss.name.startsWith('Chad') });
  }
  drawSwimmer(x, y, ang, sc, col, ph, o = {}) {
    const c = this.ctx;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sc, sc);
    c.strokeStyle = o.tail || 'rgba(255,255,255,0.9)'; c.lineWidth = 2.4; c.lineCap = 'round';
    c.beginPath(); this.tail(c, 0, 8, 0, 34, 6, ph, 2); c.stroke();
    c.fillStyle = col; c.beginPath(); c.ellipse(0, 0, 7.5, 10, 0, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-2.5, -4, 2.5, 3.5, -0.4, 0, TAU); c.fill();
    const look = o.look || 0;
    for (const sx of [-1, 1]) { c.fillStyle = '#fff'; c.beginPath(); c.arc(sx * 3.2, -2.5, 2.8, 0, TAU); c.fill(); c.fillStyle = '#111'; c.beginPath(); c.arc(sx * 3.2 + look, -3.2, 1.4, 0, TAU); c.fill(); }
    if (o.mouth === 'grin') { c.strokeStyle = '#511'; c.lineWidth = 1.3; c.beginPath(); c.arc(0, 2.5, 3, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
    else if (o.mouth === 'scared') { c.fillStyle = '#511'; c.beginPath(); c.ellipse(0, 4, 2, 2.6, 0, 0, TAU); c.fill(); }
    else { c.strokeStyle = '#511'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-2, 4); c.lineTo(2, 4); c.stroke(); }
    if (o.band) { c.fillStyle = o.band; c.fillRect(-7.5, -7.5, 15, 3); c.beginPath(); c.moveTo(6, -6.5); c.lineTo(13, -9 + Math.sin(ph) * 2); c.lineTo(12, -4 + Math.sin(ph) * 2); c.fill(); }
    if (o.crown) { c.fillStyle = '#ffd75c'; c.beginPath(); c.moveTo(-6, -9); c.lineTo(-6, -15); c.lineTo(-3, -11); c.lineTo(0, -16); c.lineTo(3, -11); c.lineTo(6, -15); c.lineTo(6, -9); c.closePath(); c.fill(); }
    c.restore();
    if (o.name) { c.font = '700 10px system-ui, sans-serif'; c.textAlign = 'center'; c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillText(o.name, x + 1, y - 20 * sc + 1); c.fillStyle = col; c.fillText(o.name, x, y - 20 * sc); }
  }
  drawPlayer(race, dt) {
    const c = this.ctx, p = race.p, x = p.x, y = this.sy(p.y), t = this.time;
    const frenzy = p.frenzyT > 0;
    // rainbow trail
    this.trail.push({ x, y: p.y, h: (t * 400) % 360 }); if (this.trail.length > 26) this.trail.shift();
    if (frenzy || p.dashT > 0) {
      for (let i = 1; i < this.trail.length; i++) {
        const a = this.trail[i - 1], b = this.trail[i];
        c.strokeStyle = frenzy ? `hsla(${a.h},100%,65%,${i / this.trail.length * 0.8})` : `rgba(140,220,255,${i / this.trail.length * 0.6})`;
        c.lineWidth = 3 + i * 0.5; c.beginPath(); c.moveTo(a.x, this.sy(a.y) + 18); c.lineTo(b.x, this.sy(b.y) + 18); c.stroke();
      }
    }
    // aura
    const g = c.createRadialGradient(x, y, 4, x, y, 42);
    g.addColorStop(0, frenzy ? 'rgba(255,215,92,0.55)' : 'rgba(150,255,170,0.4)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, 42, 0, TAU); c.fill();
    // wingman
    if (p.wing > 0) this.drawSwimmer(x - 26, y + 14 + Math.sin(t * 3) * 4, p.heading, 0.9, '#ffe0a8', t * 18 + 2, { band: '#5ce1ff' });
    let danger = false; for (const e of race.ents) if (e.t === 'wbc' && !e.dead && Math.hypot(e.x - x, e.y - p.y) < 120) danger = true;
    const tw = p.dashT > 0 ? 24 : frenzy ? 20 : 15 + (p.vy / 500) * 3;
    const blink = p.inv > 0 && Math.floor(t * 20) % 2 === 0;
    if (!blink) this.drawSwimmer(x, y, p.heading, 1.45, frenzy ? `hsl(${(t * 300) % 360},100%,80%)` : '#ffffff', t * tw, { band: '#ff3d6e', look: Math.max(-1.2, Math.min(1.2, p.vx / 200)), mouth: danger ? 'scared' : frenzy || p.combo > 5 ? 'grin' : '' });
    // shields
    for (let i = 0; i < p.shield; i++) { c.strokeStyle = `rgba(255,215,92,${0.7 - i * 0.2})`; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 22 + i * 5 + Math.sin(t * 6) * 1.5, 0, TAU); c.stroke(); }
    if (p.acid > 0.2) { c.fillStyle = 'rgba(157,255,60,0.25)'; c.beginPath(); c.arc(x, y, 20, 0, TAU); c.fill(); }
    if (race.draftTarget && p.draft > 0.05) {
      c.strokeStyle = `rgba(140,220,255,${p.draft * 2})`; c.lineWidth = 1.5; c.setLineDash([4, 5]);
      c.beginPath(); c.moveTo(x - 9, y - 12); c.lineTo(race.agentX(race.draftTarget) - 5, this.sy(race.draftTarget.y) + 8); c.moveTo(x + 9, y - 12); c.lineTo(race.agentX(race.draftTarget) + 5, this.sy(race.draftTarget.y) + 8); c.stroke(); c.setLineDash([]);
    }
  }

  drawFx(race, dt) {
    const c = this.ctx;
    for (const f of race.fx) {
      const y = this.sy(f.y), k = f.age / 1.2;
      if (f.t === 'eaten') { c.fillStyle = `rgba(255,80,120,${1 - k})`; c.font = '800 11px system-ui'; c.textAlign = 'center'; c.fillText('nom', f.x, y - k * 30); }
      else { c.strokeStyle = `rgba(255,255,255,${1 - k})`; c.lineWidth = 1.5; c.beginPath(); c.arc(f.x, y, 4 + k * 14, 0, TAU); c.stroke(); c.fillStyle = `rgba(255,255,255,${0.7 * (1 - k)})`; c.font = '10px system-ui'; c.textAlign = 'center'; c.fillText('x_x', f.x, y - 8 - k * 26); }
    }
    for (const q of this.parts) {
      q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 0.94; q.vy *= 0.94;
      const a = Math.max(0, q.life / q.max); c.globalAlpha = a; c.fillStyle = q.col;
      c.beginPath(); c.arc(q.x, this.sy(q.y), q.size * (0.4 + a), 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
    this.parts = this.parts.filter((q) => q.life > 0);
    if (this.parts.length > 500) this.parts.splice(0, this.parts.length - 500);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const q of this.pops) {
      q.life -= dt; const k = 1 - q.life / q.max, sc = k < 0.12 ? 0.5 + k / 0.12 * 0.7 : 1.2 - Math.min(0.2, (k - 0.12));
      const y = this.sy(q.y) - k * 46;
      c.globalAlpha = Math.min(1, q.life * 2.5);
      c.font = `900 ${Math.round(q.size * sc)}px "Baloo 2", system-ui, sans-serif`;
      c.lineWidth = 4; c.strokeStyle = 'rgba(30,0,30,0.85)'; c.strokeText(q.text, q.x, y); c.fillStyle = q.col; c.fillText(q.text, q.x, y);
    }
    c.globalAlpha = 1;
    this.pops = this.pops.filter((q) => q.life > 0);
  }
}
