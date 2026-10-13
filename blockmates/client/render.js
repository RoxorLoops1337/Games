// Drawing: sky, parallax hills, painted sections, liquids, creatures, smooth light map, particles.
import { W, H, SEA, BLOCKS, B, I, ITEMS, L_LAVA, MOBS, DAY_SECONDS } from '../shared/data.js';

export const JOB_COL = { follow: '#4ad8ff', chop: '#7ac84a', mine: '#ff9a3d', farm: '#f2d33c', guard: '#e2574c', stay: '#bbbbbb' };
import { computeLight, SEC } from './cworld.js';
import { S, drawBlockhead, drawMob, itemIcon, tileArt, rr } from './art.js';
import { daylight, phaseOf, clamp } from '../shared/util.js';

const FONT = "'Fredoka', 'Trebuchet MS', 'Segoe UI', system-ui, sans-serif";
const mix = (a, b, t) => a + (b - a) * t;
const mixc = (c1, c2, t) => [mix(c1[0], c2[0], t), mix(c1[1], c2[1], t), mix(c1[2], c2[2], t)];
const rgb = (c) => `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;

const SKY_NIGHT = [[6, 10, 34], [20, 34, 78]];
const SKY_DUSK = [[58, 70, 140], [246, 150, 96]];
const SKY_DAY = [[58, 156, 240], [190, 232, 255]];

export function skyColors(time) {
  const s = Math.sin(phaseOf(time) * Math.PI * 2);
  let a, b;
  if (s < -0.2) { a = SKY_NIGHT; b = SKY_NIGHT; }
  else if (s < 0.06) { const t = (s + 0.2) / 0.26; a = SKY_NIGHT; b = SKY_DUSK; return [mixc(a[0], b[0], t), mixc(a[1], b[1], t)]; }
  else if (s < 0.4) { const t = (s - 0.06) / 0.34; a = SKY_DUSK; b = SKY_DAY; return [mixc(a[0], b[0], t), mixc(a[1], b[1], t)]; }
  else { a = SKY_DAY; b = SKY_DAY; }
  return [a[0], a[1]];
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.g = canvas.getContext('2d');
    this.light = null; this.lightKey = '';
    this.lm = document.createElement('canvas'); this.lg = this.lm.getContext('2d');
    this.gm = document.createElement('canvas'); this.gg = this.gm.getContext('2d');
    this.stars = Array.from({ length: 140 }, (_, i) => ({ x: ((i * 7919) % 1000) / 1000, y: ((i * 104729) % 1000) / 1000 * 0.7, r: 0.6 + ((i * 31) % 10) / 10 * 1.2, p: i }));
    this.clouds = Array.from({ length: 9 }, (_, i) => ({ x: i * 340 + ((i * 97) % 120), y: 0.06 + ((i * 53) % 30) / 100, s: 0.8 + ((i * 29) % 10) / 12, sp: 6 + (i % 4) * 2 }));
    this.dpr = 1; this.w = 0; this.h = 0;
    this.paints = 0;
  }
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.w = this.cv.clientWidth * dpr | 0; this.h = this.cv.clientHeight * dpr | 0;
    if (this.cv.width !== this.w || this.cv.height !== this.h) { this.cv.width = this.w; this.cv.height = this.h; }
  }

  // ---------------------------------------------------------------- sky
  drawSky(G) {
    const g = this.g, w = this.w, h = this.h;
    const [top, bot] = skyColors(G.time);
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, rgb(top)); gr.addColorStop(1, rgb(bot));
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const dl = daylight(G.time), ts = G.ts;
    const horizon = h * 0.62 + (G.cam.y - SEA) * ts * 0.12;
    // stars
    const na = clamp(1 - dl * 1.6, 0, 1);
    if (na > 0.02) for (const s of this.stars) {
      g.globalAlpha = na * (0.5 + 0.5 * Math.sin(G.t * 2 + s.p));
      g.fillStyle = '#fff'; g.fillRect(s.x * w, s.y * h * 0.9, s.r * this.dpr, s.r * this.dpr);
    }
    g.globalAlpha = 1;
    // sun and moon
    const ph = phaseOf(G.time) * Math.PI * 2;
    const orb = (ang, r, col, glow) => {
      const x = w / 2 - Math.cos(ang) * w * 0.46, y = horizon - Math.sin(ang) * h * 0.52;
      if (y > horizon + r) return;
      const rg = g.createRadialGradient(x, y, r * 0.3, x, y, r * 3.2); rg.addColorStop(0, glow); rg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rg; g.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
      g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    };
    orb(ph, 34 * this.dpr, '#fff6c0', 'rgba(255,230,140,0.55)');
    orb(ph + Math.PI, 26 * this.dpr, '#eef2ff', 'rgba(170,190,255,0.35)');
    // moon craters
    // clouds
    const cl = clamp(dl * 1.2 + 0.18, 0.18, 1);
    for (const c of this.clouds) {
      const px = ((c.x + G.t * c.sp - G.cam.x * ts * 0.06) % 3200 + 3200) % 3200 - 200;
      const py = horizon - h * (0.62 - c.y) * 0.9;
      g.globalAlpha = 0.85 * cl;
      g.fillStyle = dl > 0.4 ? '#fff' : '#9aa6d0';
      const k = c.s * this.dpr * 22;
      g.beginPath();
      g.ellipse(px, py, k * 1.6, k * 0.7, 0, 0, 7); g.ellipse(px - k, py + k * 0.1, k, k * 0.55, 0, 0, 7); g.ellipse(px + k * 1.1, py + k * 0.15, k * 1.1, k * 0.5, 0, 0, 7); g.ellipse(px + k * 0.2, py - k * 0.4, k * 0.9, k * 0.6, 0, 0, 7);
      g.fill();
    }
    g.globalAlpha = 1;
    // hills (three layers of parallax silhouettes, tinted into the sky)
    const biome = G.biome || 'plains';
    const tint = { tundra: [200, 220, 240], forest: [58, 130, 70], plains: [110, 176, 80], desert: [214, 186, 120], mountains: [128, 134, 150] }[biome] || [90, 160, 80];
    for (let layer = 0; layer < 3; layer++) {
      const par = 0.12 + layer * 0.16;
      const base = horizon + (3 - layer) * 14 * this.dpr + (layer * 20) * this.dpr;
      const fog = [0.7, 0.45, 0.2][layer];
      const col = mixc(mixc(tint, [30, 40, 70], 1 - dl), bot, fog);
      g.fillStyle = rgb(mixc(col, [0, 0, 0], layer * 0.04));
      g.beginPath(); g.moveTo(0, h);
      const off = G.cam.x * ts * par;
      for (let x = 0; x <= w + 8; x += 8) {
        const wx = (x + off) / (ts * 2);
        const hh = (Math.sin(wx * 0.37 + layer * 2) * 22 + Math.sin(wx * 0.11 + layer) * 38 + Math.sin(wx * 0.9 + layer * 5) * 6) * (1 + layer * 0.2) * this.dpr * (biome === 'mountains' ? 1.8 : 1);
        g.lineTo(x, base - hh - 40 * this.dpr);
      }
      g.lineTo(w, h); g.closePath(); g.fill();
    }
    // below the surface the sky fades to the cave dark
    const depth = clamp((G.cam.y - SEA) / 30, 0, 1);
    if (depth > 0) { g.fillStyle = `rgba(8,6,18,${depth})`; g.fillRect(0, 0, w, h); }
  }

  // ---------------------------------------------------------------- world
  drawWorld(G) {
    const g = this.g, cw = G.cw, ts = G.ts, w = this.w, h = this.h;
    const camX = G.cam.x, camY = G.cam.y;
    const vx0 = Math.floor(camX - w / ts / 2) - 1, vx1 = Math.ceil(camX + w / ts / 2) + 1;
    const vy0 = Math.floor(camY - h / ts / 2) - 1, vy1 = Math.ceil(camY + h / ts / 2) + 1;
    G.view = { vx0, vx1, vy0, vy1 };
    const sx0 = Math.floor(vx0 / SEC), sx1 = Math.floor(vx1 / SEC), sy0 = Math.max(0, Math.floor(vy0 / SEC)), sy1 = Math.min(H / SEC - 1, Math.floor(vy1 / SEC));
    const scale = ts / S;
    const px = (tx) => Math.round((tx - camX) * ts + w / 2), py = (ty) => Math.round((ty - camY) * ts + h / 2);
    g.imageSmoothingEnabled = scale !== 1;
    this.paints = 0;
    const secs = [];
    for (let sy = sy0; sy <= sy1; sy++) for (let sx = sx0; sx <= sx1; sx++) {
      if (!cw.hasChunk(Math.floor(sx * SEC / 32))) continue;
      const k = sx + ',' + sy;
      if (!cw.secs.has(k) || cw.dirty.has(k)) { if (this.paints >= 5 && cw.secs.has(k)) { secs.push([sx, sy, cw.secs.get(k)]); continue; } this.paints++; }
      secs.push([sx, sy, cw.section(sx, sy)]);
    }
    const size = (sx) => px((sx + 1) * SEC) - px(sx * SEC);
    for (const [sx, sy, s] of secs) { if (s.empty) continue; g.drawImage(s.bg, px(sx * SEC), py(sy * SEC), size(sx) + 1, py((sy + 1) * SEC) - py(sy * SEC) + 1); }
    for (const [sx, sy, s] of secs) { if (s.empty) continue; g.drawImage(s.fg, px(sx * SEC), py(sy * SEC), size(sx) + 1, py((sy + 1) * SEC) - py(sy * SEC) + 1); }
    cw.prune();
  }

  drawLiquids(G) {
    const g0 = this.g, cw = G.cw, ts = G.ts, w = this.w, h = this.h, { vx0, vx1, vy0, vy1 } = G.view;
    if (!this.wc) { this.wc = document.createElement('canvas'); this.wg = this.wc.getContext('2d'); }
    if (this.wc.width !== w || this.wc.height !== h) { this.wc.width = w; this.wc.height = h; }
    const g = this.wg; g.clearRect(0, 0, w, h);
    const t = G.t;
    let any = false;
    for (let y = Math.max(0, vy0); y <= Math.min(H - 1, vy1); y++) {
      for (let x = vx0; x <= vx1; x++) {
        const v = cw.liqAt(x, y);
        if (!v) continue;
        any = true;
        const lvl = v & 15, type = v >> 4;
        const above = cw.liqAt(x, y - 1);
        const full = above && (above >> 4) === type;
        const hgt = full ? 1 : Math.max(0.12, lvl / 8);
        const dx = Math.floor((x - G.cam.x) * ts + w / 2), dy = (y + 1 - hgt - G.cam.y) * ts + h / 2;
        const wave = full ? 0 : Math.sin(x * 0.9 + t * 2.2) * 0.04 * ts;
        const cwid = Math.ceil(ts) + 1;
        if (type === L_LAVA) {
          const gr = g0.createLinearGradient(0, dy, 0, dy + hgt * ts); gr.addColorStop(0, '#ffcf4a'); gr.addColorStop(0.25, '#ff7a1a'); gr.addColorStop(1, '#c4300c');
          g0.fillStyle = gr; g0.fillRect(dx, dy + wave, cwid, hgt * ts + 1);
          if (!full) { g0.fillStyle = '#fff2a0'; g0.fillRect(dx, dy + wave, cwid, 3 * this.dpr); }
          g0.fillStyle = 'rgba(255,220,100,0.5)'; const bx = ((x * 37 + y * 11) % 7) / 7; g0.fillRect(dx + bx * ts, dy + ((t * 0.7 + x * 0.37 + y * 0.19) % 1) * ts * hgt, ts * 0.18, ts * 0.12);
        } else {
          g.fillStyle = full ? '#2f7fe0' : '#4a98ee';
          g.fillRect(dx, dy + wave, cwid, hgt * ts + 1);
          if (!full) { g.fillStyle = '#d8f2ff'; g.fillRect(dx, dy + wave, cwid, 2.5 * this.dpr); }
          else if (((x + y * 3) & 7) === 0) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(dx + ts * 0.2, dy + ts * ((t * 0.4 + x) % 1), ts * 0.1, ts * 0.3); }
        }
      }
    }
    if (any) { g0.globalAlpha = 0.62; g0.drawImage(this.wc, 0, 0); g0.globalAlpha = 1; }
  }

  // ---------------------------------------------------------------- light
  drawLight(G) {
    const g = this.g, cw = G.cw, ts = G.ts, w = this.w, h = this.h, { vx0, vx1, vy0, vy1 } = G.view;
    const vw = vx1 - vx0 + 3, vh = vy1 - vy0 + 3; // light map cells
    const extras = [];
    for (const p of G.players.values()) {
      const lv = p.held && ITEMS[p.held] && ITEMS[p.held].place ? BLOCKS[ITEMS[p.held].place].light : 0;
      if (lv) extras.push([p.x, p.y - 1.1, Math.min(14, lv)]);
    }
    const key = `${vx0}|${vy0}|${vw}|${vh}|${cw.ver}|${extras.map((e) => Math.floor(e[0]) + ',' + Math.floor(e[1])).join(';')}`;
    if (key !== this.lightKey && (!this.light || performance.now() - (this.lightAt || 0) > 45 || this.light.vw !== vw || this.light.vh !== vh || this.light.vx0 !== vx0 || this.light.vy0 !== vy0)) {
      const M = 15;
      const L = computeLight(cw, vx0 - 1 - M, vy0 - 1 - M, vw + 2 * M, vh + 2 * M, this.light, extras);
      L.vx0 = vx0; L.vy0 = vy0; L.vw = vw; L.vh = vh; L.M = M;
      this.light = L; this.lightKey = key; this.lightAt = performance.now();
    }
    const L = this.light;
    if (!L) return;
    if (this.lm.width !== vw || this.lm.height !== vh) { this.lm.width = this.gm.width = vw; this.lm.height = this.gm.height = vh; }
    const dl = daylight(G.time);
    const skyF = (0.27 + 0.73 * dl) * (1 - 0.25 * G.weather.k);
    const img = this.lg.createImageData(vw, vh), glow = this.gg.createImageData(vw, vh);
    const d = img.data, gd = glow.data;
    const stride = L.w;
    const flick = G.t * 11;
    for (let j = 0; j < vh; j++) {
      for (let i = 0; i < vw; i++) {
        const li = (j + L.M) * stride + (i + L.M);
        const sk = L.sky[li] / 15 * skyF, bl = L.blk[li] / 15;
        const b = Math.max(sk, bl);
        const f = Math.pow(b, 1.2);
        const o = (j * vw + i) * 4;
        const share = sk >= bl ? 1 : 0;
        const nr = share ? 10 * (1 - dl) : 0;
        d[o] = nr * 0.6; d[o + 1] = nr * 1.1; d[o + 2] = nr * 2.6 + (share ? 6 : 0);
        d[o + 3] = (1 - f) * (share ? 235 - 40 * dl : 240);
        if (bl > 0.12) {
          const fl = 0.88 + 0.12 * Math.sin(flick + (i * 7 + j * 3));
          gd[o] = 255; gd[o + 1] = 168; gd[o + 2] = 70; gd[o + 3] = Math.min(255, bl * bl * 120 * fl * (1 - dl * 0.55));
        }
      }
    }
    this.lg.putImageData(img, 0, 0); this.gg.putImageData(glow, 0, 0);
    const dx = (vx0 - 1 - G.cam.x) * ts + w / 2, dy = (vy0 - 1 - G.cam.y) * ts + h / 2;
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'low';
    g.drawImage(this.lm, dx, dy, vw * ts, vh * ts);
    g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(this.gm, dx, dy, vw * ts, vh * ts); g.restore();
    g.imageSmoothingEnabled = G.ts / S !== 1;
  }

  // ---------------------------------------------------------------- entities
  toScreen(G, x, y) { return [(x - G.cam.x) * G.ts + this.w / 2, (y - G.cam.y) * G.ts + this.h / 2]; }

  drawEntities(G) {
    const g = this.g, ts = G.ts;
    // drops
    for (const d of G.drops.values()) {
      const [sx, sy] = this.toScreen(G, d.x, d.y);
      if (sx < -60 || sx > this.w + 60 || sy < -60 || sy > this.h + 60) continue;
      const bob = Math.sin(G.t * 3 + d.id) * 0.06 * ts;
      const sz = ts * 0.62;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(sx, sy + 2, sz * 0.4, sz * 0.12, 0, 0, 7); g.fill();
      g.drawImage(itemIcon(d.item), sx - sz / 2, sy - sz + bob - 2, sz, sz);
      if (d.n > 1) { g.font = `bold ${Math.round(ts * 0.3)}px ${FONT}`; g.fillStyle = '#fff'; g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeText(d.n, sx + sz * 0.1, sy); g.fillText(d.n, sx + sz * 0.1, sy); }
    }
    // arrows
    for (const a of G.arrows.values()) {
      const [sx, sy] = this.toScreen(G, a.x, a.y);
      g.save(); g.translate(sx, sy); g.rotate(Math.atan2(a.vy, a.vx)); g.fillStyle = '#8a5a2a'; g.fillRect(-ts * 0.4, -1.5, ts * 0.8, 3); g.fillStyle = '#c8ccd4'; g.fillRect(ts * 0.3, -3, ts * 0.18, 6); g.restore();
    }
    // mobs
    for (const m of G.mobs.values()) {
      const [sx, sy] = this.toScreen(G, m.x, m.y);
      if (sx < -150 || sx > this.w + 150 || sy < -150 || sy > this.h + 150) continue;
      g.fillStyle = 'rgba(0,0,0,0.2)'; g.beginPath(); g.ellipse(sx, sy, ts * 0.45, ts * 0.1, 0, 0, 7); g.fill();
      drawMob(g, sx, sy, ts, m.type, { dir: m.dir, t: m.anim, hurt: m.hurt > 0, air: !m.onGround });
      if (m.hp < MOBS[m.type].hp) {
        const bw = ts * (MOBS[m.type].boss ? 2 : 0.9), top = sy - MOBS[m.type].h * ts - 10;
        g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(sx - bw / 2, top, bw, 5); g.fillStyle = '#e24a4a'; g.fillRect(sx - bw / 2, top, bw * clamp(m.hp / MOBS[m.type].hp, 0, 1), 5);
      }
    }
    // buddies
    for (const n of G.npcs.values()) {
      const [sx, sy] = this.toScreen(G, n.x, n.y);
      if (sx < -100 || sx > this.w + 100 || sy < -140 || sy > this.h + 140) continue;
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(sx, sy, ts * 0.35, ts * 0.09, 0, 0, 7); g.fill();
      const tool = { chop: I.stone_axe, mine: I.iron_pickaxe, farm: I.wood_shovel, guard: I.iron_sword }[n.job] || 0;
      drawBlockhead(g, sx, sy, ts, n.look, { dir: n.dir, t: n.anim, speed: Math.min(1, Math.abs(n.vx) / 6), air: !n.onGround, swing: n.swingT > 0 ? n.swingT / 0.25 : 0, held: tool, armor: [0, 0, 0], blink: 0, band: JOB_COL[n.job] || '#ddd' });
    }
    // players
    const list = [...G.players.values()].sort((a, b) => (a === G.me ? 1 : 0) - (b === G.me ? 1 : 0));
    for (const p of list) {
      const [sx, sy] = this.toScreen(G, p.x, p.y);
      if (sx < -100 || sx > this.w + 100 || sy < -140 || sy > this.h + 140) continue;
      if (p.dead) { g.globalAlpha = 0.6; }
      g.fillStyle = 'rgba(0,0,0,0.22)'; g.beginPath(); g.ellipse(sx, sy, ts * 0.35, ts * 0.09, 0, 0, 7); g.fill();
      drawBlockhead(g, sx, sy, ts, p.look, {
        dir: p.dir, t: p.anim, speed: Math.min(1, Math.abs(p.vx) / 6), air: !p.onGround && !p.climb, climb: p.climb, swing: p.swingT > 0 ? p.swingT / 0.25 : 0,
        held: p.held, armor: p.armor, blink: p.blink > 0 ? 1 : 0, dead: p.dead, hurt: p.hurtT > 0,
      });
      g.globalAlpha = 1;
      if (p.fish) {
        const [bx, by] = this.toScreen(G, p.fish.x, p.fish.y - 0.35 + Math.sin(G.t * 3 + p.id) * 0.04);
        const hx = sx + p.dir * ts * 0.55, hy = sy - ts * 0.95;
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = Math.max(1, ts * 0.03);
        g.beginPath(); g.moveTo(hx, hy); g.quadraticCurveTo((hx + bx) / 2, Math.min(hy, by) - ts * 1.2, bx, by); g.stroke();
        g.fillStyle = '#fff'; g.beginPath(); g.arc(bx, by, ts * 0.11, 0, 7); g.fill(); g.fillStyle = '#e63950'; g.beginPath(); g.arc(bx, by - ts * 0.03, ts * 0.11, Math.PI, 0); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(bx, by + ts * 0.1, ts * 0.25, ts * 0.06, 0, 0, 7); g.stroke();
      }
      if (p.wet) { g.fillStyle = 'rgba(70,150,240,0.22)'; g.fillRect(sx - ts * 0.4, sy - ts * 1.0, ts * 0.8, ts * 0.9); }
    }
  }

  drawNames(G) {
    const g = this.g, ts = G.ts;
    g.textAlign = 'center';
    for (const n of G.npcs.values()) {
      const [sx, sy] = this.toScreen(G, n.x, n.y);
      if (sx < -100 || sx > this.w + 100 || sy < -100 || sy > this.h + 160) continue;
      const label = `${n.owner}'s Buddy · ${n.job}`;
      g.font = `600 ${Math.round(Math.max(10, ts * 0.32))}px ${FONT}`;
      const tw = g.measureText(label).width, y = sy - ts * 2.0;
      g.fillStyle = 'rgba(10,14,30,0.55)'; rr(g, sx - tw / 2 - 6, y - ts * 0.34, tw + 12, ts * 0.46, 7); g.fill();
      g.fillStyle = JOB_COL[n.job] || '#fff'; g.fillText(label, sx, y);
    }
    for (const p of G.players.values()) {
      const [sx, sy] = this.toScreen(G, p.x, p.y);
      if (sx < -100 || sx > this.w + 100 || sy < -100 || sy > this.h + 160) continue;
      const y = sy - ts * 2.05;
      g.font = `600 ${Math.round(Math.max(11, ts * 0.38))}px ${FONT}`;
      const tw = g.measureText(p.name).width;
      g.fillStyle = 'rgba(10,14,30,0.55)'; rr(g, sx - tw / 2 - 6, y - ts * 0.38, tw + 12, ts * 0.5, 7); g.fill();
      g.fillStyle = p === G.me ? '#ffe98a' : '#fff'; g.fillText(p.name, sx, y);
      if (p.emote) { g.font = `${Math.round(ts * 0.8)}px ${FONT}`; g.fillText(['', '♥', '!', '?', '♪', '☺', '✦', 'zZ', '☀', '☠'][p.emote] || '', sx, y - ts * 0.55); }
      if (p.say && p.sayT > 0) {
        g.font = `500 ${Math.round(Math.max(11, ts * 0.36))}px ${FONT}`;
        const t = p.say.length > 40 ? p.say.slice(0, 40) + '…' : p.say, tw2 = g.measureText(t).width;
        g.globalAlpha = Math.min(1, p.sayT);
        g.fillStyle = 'rgba(255,255,255,0.92)'; rr(g, sx - tw2 / 2 - 8, y - ts * 1.1, tw2 + 16, ts * 0.52, 9); g.fill();
        g.fillStyle = '#222'; g.fillText(t, sx, y - ts * 0.72);
        g.globalAlpha = 1;
      }
    }
    g.textAlign = 'left';
  }

  // sign text near the player, cursor, cracks, placement ghost
  drawOverlays(G) {
    const g = this.g, ts = G.ts, cw = G.cw;
    // signs
    g.textAlign = 'center';
    for (const [k, m] of cw.meta) {
      if (m.k !== 'sign' || !m.text) continue;
      const [x, y] = k.split(',').map(Number);
      if (Math.abs(x - G.me.x) > 6 || Math.abs(y - G.me.y) > 5) continue;
      const [sx, sy] = this.toScreen(G, x + 0.5, y);
      g.font = `500 ${Math.round(ts * 0.38)}px ${FONT}`;
      const tw = g.measureText(m.text).width;
      g.fillStyle = 'rgba(255,248,220,0.95)'; rr(g, sx - tw / 2 - 8, sy - ts * 0.9, tw + 16, ts * 0.5, 7); g.fill();
      g.fillStyle = '#4a3418'; g.fillText(m.text, sx, sy - ts * 0.54);
    }
    for (const [k, m] of cw.meta) {
      if (m.k !== 'waystone') continue;
      const [x, y] = k.split(',').map(Number);
      if (Math.abs(x - G.me.x) > 14 || Math.abs(y - G.me.y) > 8) continue;
      const [sx, sy] = this.toScreen(G, x + 0.5, y - 0.4);
      g.font = `600 ${Math.round(ts * 0.34)}px ${FONT}`; g.fillStyle = '#bff0ff'; g.strokeStyle = 'rgba(0,20,40,0.7)'; g.lineWidth = 3;
      g.strokeText(m.name || 'Waystone', sx, sy); g.fillText(m.name || 'Waystone', sx, sy);
    }
    g.textAlign = 'left';
    const c = G.cursor;
    if (c && c.ok) {
      const [sx, sy] = this.toScreen(G, c.x, c.y);
      const inReach = c.reach;
      g.strokeStyle = inReach ? 'rgba(255,255,255,0.85)' : 'rgba(255,90,90,0.6)'; g.lineWidth = 2;
      rr(g, sx + 1, sy + 1, ts - 2, ts - 2, 5); g.stroke();
      if (G.ghost && inReach) { g.globalAlpha = 0.45; g.drawImage(tileArt(G.ghost, 0), sx, sy, ts, ts); g.globalAlpha = 1; }
    }
    const mi = G.mining;
    if (mi && mi.prog > 0) {
      const [sx, sy] = this.toScreen(G, mi.x, mi.y);
      g.fillStyle = `rgba(0,0,0,${0.12 + mi.prog * 0.3})`; g.fillRect(sx, sy, ts, ts);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1.5; g.beginPath();
      const n = Math.ceil(mi.prog * 7);
      for (let i = 0; i < n; i++) { const a = i * 2.4 + 0.5; g.moveTo(sx + ts * (0.5 + Math.cos(a) * 0.05), sy + ts * (0.5 + Math.sin(a) * 0.05)); g.lineTo(sx + ts * (0.5 + Math.cos(a) * 0.45), sy + ts * (0.5 + Math.sin(a) * 0.45)); }
      g.stroke();
    }
  }

  drawParticles(G) {
    const g = this.g, ts = G.ts;
    for (const p of G.parts) {
      const [sx, sy] = this.toScreen(G, p.x, p.y);
      g.globalAlpha = clamp(p.life / p.max * 1.6, 0, 1);
      if (p.text) {
        g.font = `700 ${Math.round(ts * 0.5)}px ${FONT}`; g.textAlign = 'center'; g.fillStyle = p.col; g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3;
        g.strokeText(p.text, sx, sy); g.fillText(p.text, sx, sy); g.textAlign = 'left';
      } else if (p.round) { g.fillStyle = p.col; g.beginPath(); g.arc(sx, sy, p.size * ts, 0, 7); g.fill(); if (p.ring) { g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1; g.stroke(); } }
      else { g.fillStyle = p.col; const s = p.size * ts; g.fillRect(sx - s / 2, sy - s / 2, s, s); }
    }
    g.globalAlpha = 1;
  }

  drawWeather(G) {
    const k = G.weather.k;
    if (k < 0.03) return;
    const g = this.g, w = this.w, h = this.h, t = G.t;
    if (G.cam.y > SEA + 12) return;
    g.fillStyle = `rgba(30,44,80,${0.22 * k})`; g.fillRect(0, 0, w, h);
    const n = Math.floor(k * 170);
    if (G.weather.kind === 'snow') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = 0; i < n; i++) { const x = ((i * 97.3 + t * 18 * ((i % 5) + 1) + Math.sin(t + i) * 22) % (w + 20) + w + 20) % (w + 20), y = ((i * 53.7 + t * (45 + (i % 7) * 9) * this.dpr) % h + h) % h; g.beginPath(); g.arc(x, y, (1.2 + (i % 3) * 0.7) * this.dpr, 0, 7); g.fill(); }
    } else {
      g.strokeStyle = 'rgba(190,215,255,0.55)'; g.lineWidth = this.dpr; g.beginPath();
      for (let i = 0; i < n * 1.4; i++) { const x = ((i * 91.7 + t * 120) % (w + 60) + w + 60) % (w + 60) - 30, y = ((i * 47.9 + t * (700 + (i % 5) * 90) * this.dpr) % h + h) % h; g.moveTo(x, y); g.lineTo(x - 5 * this.dpr, y + 16 * this.dpr); }
      g.stroke();
    }
  }

  // sunbeam tint and damage flash on top of everything
  drawScreenFx(G) {
    const g = this.g;
    if (G.hurtFlash > 0) { g.fillStyle = `rgba(220,30,30,${G.hurtFlash * 0.45})`; g.fillRect(0, 0, this.w, this.h); }
    if (G.under) { g.fillStyle = 'rgba(30,90,180,0.28)'; g.fillRect(0, 0, this.w, this.h); }
    const dl = daylight(G.time);
    if (G.cam.y < SEA + 8 && dl > 0.2 && dl < 0.8) { g.fillStyle = `rgba(255,150,60,${0.12 * (1 - Math.abs(dl - 0.5) * 2)})`; g.fillRect(0, 0, this.w, this.h); }
    // vignette
    const gr = g.createRadialGradient(this.w / 2, this.h / 2, Math.min(this.w, this.h) * 0.45, this.w / 2, this.h / 2, Math.max(this.w, this.h) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = gr; g.fillRect(0, 0, this.w, this.h);
  }

  frame(G) {
    this.resize();
    this.drawSky(G);
    this.drawWorld(G);
    this.drawEntities(G);
    this.drawLiquids(G);
    this.drawLight(G);
    this.drawOverlays(G);
    this.drawParticles(G);
    this.drawNames(G);
    this.drawWeather(G);
    this.drawScreenFx(G);
  }
}
void ITEMS; void B; void BLOCKS; void W; void DAY_SECONDS;
