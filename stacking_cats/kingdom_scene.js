// The Cat Kingdom panorama: a little village with the nine buildings and the wonders floating above it.
import { BUILDINGS, WONDERS, CATS, buildingLevel, upgradeCost } from './cats.js';
import { drawCat } from './art_cats.js';
import { drawBuilding } from './art_kingdom.js';
import { TAU, mulberry, texturize, hash, mix, shade } from './art_util.js';
import { iconCanvas } from './art_icons.js';

export const KW = 920, KH = 256;
// feet position and size of each building (back row smaller)
const SPOTS = {
  dojo: { x: 92, y: 152, s: 0.86 }, beds: { x: 282, y: 152, s: 0.86 }, yarn: { x: 472, y: 152, s: 0.86 }, spa: { x: 662, y: 152, s: 0.86 }, tower: { x: 836, y: 152, s: 0.86 },
  shrine: { x: 182, y: 222, s: 1 }, vault: { x: 372, y: 222, s: 1 }, tent: { x: 562, y: 222, s: 1 }, stall: { x: 752, y: 222, s: 1 },
};
const WONDER_X = (i) => 110 + i * 140;
const WONDER_Y = 46;

export function hitTest(x, y) {
  for (const w of WONDERS.map((w, i) => ({ w, i })).reverse()) if (Math.hypot(x - WONDER_X(w.i), y - WONDER_Y) < 26) return { type: 'wonder', id: w.w.id };
  const order = BUILDINGS.slice().sort((a, b) => SPOTS[b.id].y - SPOTS[a.id].y);
  for (const b of order) {
    const p = SPOTS[b.id], h = 120 * p.s;
    if (x > p.x - h * 0.52 && x < p.x + h * 0.52 && y > p.y - h * 0.95 && y < p.y + 8) return { type: 'building', id: b.id };
  }
  return null;
}


const sprites = new Map();
function sprite(id, lvl) {
  const key = id + ':' + lvl;
  let c = sprites.get(key);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 240;
    const x = c.getContext('2d'); x.scale(2, 2); drawBuilding(x, id, lvl);
    texturize(c, { seed: hash(key), len: 8, lw: 1.3, count: 2600, dir: 0.04, spread: 0.6, alpha: 0.4, amp: 0.11, minLum: 60 });   // planks, shingles and plaster grain
    sprites.set(key, c);
  }
  return c;
}

// ---------------------------------------------------------------- the painted world (all of it drawn once and cached)
const SC = 2;   // backing scale of every cached layer
function mk(w, h, fn) {
  const c = document.createElement('canvas'); c.width = Math.ceil(w * SC); c.height = Math.ceil(h * SC);
  const g = c.getContext('2d'); g.scale(SC, SC); g.lineJoin = 'round'; g.lineCap = 'round'; fn(g);
  return c;
}
// the cobbled road: two cubic segments, sampled once
const ROAD = [[0, 190, 250, 176, 420, 200, 640, 184], [640, 184, 780, 176, 860, 190, KW, 182]];
const bez = (s, u) => { const v = 1 - u; return [v * v * v * s[0] + 3 * v * v * u * s[2] + 3 * v * u * u * s[4] + u * u * u * s[6], v * v * v * s[1] + 3 * v * v * u * s[3] + 3 * v * u * u * s[5] + u * u * u * s[7]]; };
const ROAD_PTS = []; for (const s of ROAD) for (let i = 0; i <= 120; i++) ROAD_PTS.push(bez(s, i / 120));
function roadY(x) { let best = ROAD_PTS[0]; for (const p of ROAD_PTS) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; }
const ridge = (x, base, amp, ph, f) => base + Math.sin(x / f + ph) * amp + Math.sin(x / (f * 0.41) + ph * 1.7) * amp * 0.28;

const PAL = {
  day: { sky: ['#4fb0f2', '#a6dffd', '#e3f6ff', '#fff0cc'], haze: '#e6f4ff', tone: (c, d) => mix(c, '#e6f4ff', d) },
  night: { sky: ['#0a0f33', '#1b2764', '#3a4a8c', '#6c70ae'], haze: '#2b3478', tone: (c, d) => mix(shade(c, -0.4), '#232a66', 0.35 + d * 0.3) },
};

function conifer(g, x, y, h, c) { g.fillStyle = c; for (let k = 0; k < 3; k++) { const w = h * (0.34 - k * 0.07), yy = y - h * (0.28 * k); g.beginPath(); g.moveTo(x - w, yy); g.lineTo(x, yy - h * 0.5); g.lineTo(x + w, yy); g.fill(); } }
function bgLayer(night) {
  const P = night ? PAL.night : PAL.day, tone = P.tone;
  return mk(KW, KH, (g) => {
    const sky = g.createLinearGradient(0, 0, 0, 150); P.sky.forEach((c, i) => sky.addColorStop([0, 0.45, 0.8, 1][i], c));
    g.fillStyle = sky; g.fillRect(0, 0, KW, KH);
    const r = mulberry(11);
    if (night) {   // moon and a faint milky band
      const mh = g.createRadialGradient(866, 38, 8, 866, 38, 110); mh.addColorStop(0, 'rgba(210,225,255,.55)'); mh.addColorStop(1, 'rgba(210,225,255,0)');
      g.fillStyle = mh; g.fillRect(740, 0, 180, 150);
      g.fillStyle = '#f6f3dc'; g.beginPath(); g.arc(866, 38, 15, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,160,170,.4)'; for (const [dx, dy, rr] of [[-5, -3, 3.4], [4, 4, 2.8], [3, -7, 1.8], [-6, 6, 1.8]]) { g.beginPath(); g.arc(866 + dx, 38 + dy, rr, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(16,22,70,.55)'; g.beginPath(); g.arc(872, 34, 13.5, 0, TAU); g.arc(866, 38, 15, 0, TAU, true); g.fill('evenodd');
    } else {   // sun: broad warm bloom, soft rays, bright disc
      const sh = g.createRadialGradient(866, 38, 6, 866, 38, 150); sh.addColorStop(0, 'rgba(255,248,200,.95)'); sh.addColorStop(0.25, 'rgba(255,240,170,.45)'); sh.addColorStop(1, 'rgba(255,240,170,0)');
      g.fillStyle = sh; g.fillRect(700, 0, 220, 170);
      g.fillStyle = 'rgba(255,250,210,.22)';
      for (let i = 0; i < 14; i++) { const a = i * TAU / 14 + 0.2; g.beginPath(); g.moveTo(866, 38); g.lineTo(866 + Math.cos(a - 0.07) * 120, 38 + Math.sin(a - 0.07) * 120); g.lineTo(866 + Math.cos(a + 0.07) * 120, 38 + Math.sin(a + 0.07) * 120); g.fill(); }
      g.fillStyle = '#fffbe0'; g.beginPath(); g.arc(866, 38, 16, 0, TAU); g.fill(); g.fillStyle = '#fff3a8'; g.beginPath(); g.arc(866, 38, 12, 0, TAU); g.fill();
    }
    // far mountains with snow caps, hazy with distance
    const mc = tone('#9db6dc', 0.35), pk = [];
    for (let x = -40; x < KW + 120; x += 90 + r() * 50) pk.push([x, 62 + r() * 34]);
    g.fillStyle = mc; g.beginPath(); g.moveTo(-40, 140);
    pk.forEach((p, i) => { g.lineTo(p[0], p[1]); const n = pk[i + 1]; if (n) g.lineTo((p[0] + n[0]) / 2 + 6, 110 + r() * 8); });
    g.lineTo(KW + 120, 140); g.fill();
    g.fillStyle = night ? 'rgba(200,215,255,.55)' : 'rgba(255,255,255,.85)';
    for (const [x, y] of pk) { if (y > 88) continue; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 15, y + 17); g.lineTo(x - 8, y + 13); g.lineTo(x - 3, y + 19); g.lineTo(x + 4, y + 13); g.lineTo(x + 10, y + 17); g.lineTo(x + 16, y + 18); g.closePath(); g.fill(); }
    const hz = g.createLinearGradient(0, 90, 0, 140); hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, night ? 'rgba(90,100,170,.5)' : 'rgba(235,246,255,.75)'); g.fillStyle = hz; g.fillRect(0, 90, KW, 52);
    // layered hills: each nearer layer is greener and clearer; far ones carry tiny conifers, a windmill and cottages
    const layers = [['#a8d9b0', 124, 12, 0.5, 150, 0.45], ['#8fd68f', 138, 13, 2.1, 120, 0.25], ['#7fcf72', 152, 12, 4.0, 95, 0.1]];
    layers.forEach(([col, base, amp, ph, f, depth], li) => {
      const c = tone(col, depth), dark = tone(shade(col, -0.28), depth);
      const hg = g.createLinearGradient(0, base - amp, 0, base + 46); hg.addColorStop(0, shade(c, night ? 0.04 : 0.14)); hg.addColorStop(1, c);
      g.fillStyle = hg; g.beginPath(); g.moveTo(0, KH);
      for (let x = 0; x <= KW; x += 8) g.lineTo(x, ridge(x, base, amp, ph, f));
      g.lineTo(KW, KH); g.fill();
      if (li < 2) for (let x = 6 + r() * 8; x < KW; x += 9 + r() * 12) { const y = ridge(x, base, amp, ph, f) + 3 + r() * 5; conifer(g, x, y, 12 + r() * 9, dark); }
      if (li === 0) for (const x of [330, 610, 770]) {   // cottages and a windmill on the far ridge
        const y = ridge(x, base, amp, ph, f) + 4;
        g.fillStyle = tone('#f0e2cc', 0.4); g.fillRect(x - 5, y - 6, 10, 6); g.fillStyle = tone('#c9585a', 0.4); g.beginPath(); g.moveTo(x - 7, y - 6); g.lineTo(x, y - 12); g.lineTo(x + 7, y - 6); g.fill();
      }
      if (li === 0) { const x = 150, y = ridge(x, base, amp, ph, f) + 4; g.fillStyle = tone('#e8dcc6', 0.4); g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x - 2.5, y - 14); g.lineTo(x + 2.5, y - 14); g.lineTo(x + 4, y); g.fill(); g.strokeStyle = tone('#8a6a4a', 0.4); g.lineWidth = 1.2; g.beginPath(); for (let a = 0.4; a < TAU; a += TAU / 4) { g.moveTo(x, y - 14); g.lineTo(x + Math.cos(a) * 10, y - 14 + Math.sin(a) * 10); } g.stroke(); }
    });
    // meadow: gradient, soft mowing bands, grass tufts
    const gr = g.createLinearGradient(0, 150, 0, KH); gr.addColorStop(0, tone('#80d070', 0)); gr.addColorStop(1, tone('#58a653', 0));
    const gpath = new Path2D(); gpath.moveTo(0, 168); for (let x = 0; x <= KW; x += 10) gpath.lineTo(x, 166 + Math.sin(x / 90 + 1) * 5); gpath.lineTo(KW, KH); gpath.lineTo(0, KH); gpath.closePath();
    g.fillStyle = gr; g.fill(gpath);
    g.save(); g.clip(gpath); g.fillStyle = 'rgba(255,255,255,.055)';
    for (let x = -60; x < KW + 60; x += 70) { g.beginPath(); g.moveTo(x, 150); g.lineTo(x + 36, 150); g.lineTo(x + 6, KH); g.lineTo(x - 30, KH); g.fill(); }
    const shade2 = g.createLinearGradient(0, 160, 0, 190); shade2.addColorStop(0, 'rgba(30,70,40,.18)'); shade2.addColorStop(1, 'rgba(30,70,40,0)'); g.fillStyle = shade2; g.fillRect(0, 160, KW, 30);
    g.lineWidth = 0.8;
    for (let i = 0; i < 520; i++) {
      const x = r() * KW, y = 168 + r() * 90; if (Math.abs(y - roadY(x)) < 13) continue;
      g.strokeStyle = r() < 0.5 ? tone('#4f9a4a', 0) : tone('#9be58a', 0); const hh = 2 + r() * 3.4;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - 1.2, y - hh); g.moveTo(x, y); g.lineTo(x + 1.3, y - hh * 0.8); g.moveTo(x, y); g.lineTo(x + 0.2, y - hh * 1.15); g.stroke();
    }
    g.restore();
    // a picket fence along the back of the meadow, behind the back row of buildings
    for (let x = 0; x < KW; x += 4) {
      const y = 158 + Math.sin(x / 90 + 1) * 3;
      if (x % 12 === 0) { g.fillStyle = tone('#f4ead6', 0.0); g.strokeStyle = tone('#a08560', 0.0); g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 1.6, y); g.lineTo(x - 1.6, y - 8); g.lineTo(x, y - 10.5); g.lineTo(x + 1.6, y - 8); g.lineTo(x + 1.6, y); g.closePath(); g.fill(); g.stroke(); }
    }
    g.strokeStyle = tone('#d8c9a8', 0); g.lineWidth = 1.3;
    for (const dy of [-6.2, -2.4]) { g.beginPath(); for (let x = 0; x <= KW; x += 6) { const y = 158 + Math.sin(x / 90 + 1) * 3 + dy; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
    // cobbled road: soil verge, pale bed, then stones in three lanes
    const road = new Path2D(); road.moveTo(0, 190); for (const s of ROAD) road.bezierCurveTo(s[2], s[3], s[4], s[5], s[6], s[7]);
    g.lineCap = 'butt'; g.lineJoin = 'round';
    g.strokeStyle = tone('#8a6a45', 0); g.lineWidth = 25; g.stroke(road);
    g.strokeStyle = tone('#c9ae7e', 0); g.lineWidth = 22; g.stroke(road);
    g.strokeStyle = tone('#e2cc9c', 0); g.lineWidth = 17; g.stroke(road);
    g.lineCap = 'round';
    const rs = mulberry(23);
    for (let seg = 0; seg < 2; seg++) for (let i = 0; i < 150; i++) {
      const u = i / 150, [px, py] = bez(ROAD[seg], u), [qx, qy] = bez(ROAD[seg], Math.min(1, u + 0.01)), a = Math.atan2(qy - py, qx - px);
      for (const off of [-6.2, 0, 6.2]) {
        if (rs() < 0.12) continue;
        const nx = -Math.sin(a), ny = Math.cos(a), x = px + nx * (off + (rs() - 0.5) * 1.2), y = py + ny * (off + (rs() - 0.5) * 1.2);
        const base = ['#d6bd8a', '#c8ad7b', '#e6d3a6', '#bfa474', '#d9c597'][Math.floor(rs() * 5)];
        g.save(); g.translate(x, y); g.rotate(a + (rs() - 0.5) * 0.3);
        const w = 4.2 + rs() * 2.4, h = 2.8 + rs() * 0.8;
        g.fillStyle = tone(base, 0); g.strokeStyle = tone('#8d7249', 0); g.lineWidth = 0.55; g.beginPath(); g.roundRect(-w / 2, -h / 2, w, h, 1.2); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(-w / 2 + 0.7, -h / 2 + 0.4, w * 0.5, 0.7);
        g.restore();
      }
      if (i % 15 === 0 && rs() < 0.9) { g.fillStyle = tone('#6fb560', 0); g.beginPath(); g.arc(px + (rs() - 0.5) * 3, py + (rs() < 0.5 ? -12.4 : 12.4), 1.3, 0, TAU); g.fill(); }
    }
    // flower clusters, kept off the road
    const fr = mulberry(7);
    for (let i = 0; i < 46; i++) {
      const x = fr() * KW, y = 172 + fr() * 82; if (Math.abs(y - roadY(x)) < 15) continue;
      const col = ['#ffffff', '#ffd23f', '#ff9ac6', '#c9a0ff', '#ff8a6a'][i % 5];
      for (let k = 0; k < 3; k++) {
        const fx = x + (fr() - 0.5) * 9, fy = y + (fr() - 0.5) * 5;
        g.strokeStyle = tone('#3f8a40', 0); g.lineWidth = 0.7; g.beginPath(); g.moveTo(fx, fy + 3.2); g.lineTo(fx, fy); g.stroke();
        g.fillStyle = tone(col, 0); for (let p = 0; p < 5; p++) { g.beginPath(); g.arc(fx + Math.cos(p * 1.2566) * 1.5, fy + Math.sin(p * 1.2566) * 1.5, 1, 0, TAU); g.fill(); }
        g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(fx, fy, 0.9, 0, TAU); g.fill();
      }
    }
  });
}

// cloud sprites (soft puffs, lit on top and shaded underneath)
function cloudSprite(night, spec) {
  return mk(150, 56, (g) => {
    for (const [dx, dy, rx, ry] of spec) { g.beginPath(); g.ellipse(75 + dx, 34 + dy, rx, ry, 0, 0, TAU); g.fillStyle = night ? 'rgba(150,160,215,.55)' : 'rgba(255,255,255,.93)'; g.fill(); }
    g.globalCompositeOperation = 'source-atop';
    const sh = g.createLinearGradient(0, 8, 0, 56); sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.55, night ? 'rgba(40,50,110,.1)' : 'rgba(150,185,225,.0)'); sh.addColorStop(1, night ? 'rgba(40,50,110,.5)' : 'rgba(150,185,225,.6)');
    g.fillStyle = sh; g.fillRect(0, 0, 150, 56);
  });
}
const CLOUDS = [[[0, 0, 34, 10], [-22, 4, 22, 8], [24, 4, 24, 8], [-6, -7, 20, 9], [12, -5, 16, 8]], [[0, 2, 28, 8], [-18, 5, 18, 6], [20, 5, 18, 6], [2, -5, 15, 7]], [[0, 0, 40, 11], [-28, 5, 24, 8], [30, 5, 26, 8], [-10, -8, 22, 10], [14, -9, 18, 9], [38, -2, 14, 7]]];

// ---------------------------------------------------------------- props: trees, bushes, lanterns, fences, benches...
const props = new Map();
function drawProp(kind, g, v) {
  const o = '#2c4a2a';
  const blob = (x, y, r, c) => { g.fillStyle = c; g.strokeStyle = shade(c, -0.45); g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke(); };
  const foliage = (cx, cy, rad, c1, c2, c3, n) => {
    const rr = mulberry(v * 13 + 5);
    for (let i = 0; i < n; i++) { const a = rr() * TAU, d = rr() * rad * 0.6; blob(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, rad * (0.38 + rr() * 0.22), c1); }
    for (let i = 0; i < n; i++) { const a = rr() * TAU, d = rr() * rad * 0.5; g.fillStyle = c2; g.beginPath(); g.arc(cx + Math.cos(a) * d - rad * 0.12, cy + Math.sin(a) * d * 0.8 - rad * 0.2, rad * (0.14 + rr() * 0.1), 0, TAU); g.fill(); }
    for (let i = 0; i < n * 2; i++) { const a = rr() * TAU, d = rr() * rad * 0.7; g.fillStyle = c3; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, 0.9, 0, TAU); g.fill(); }
  };
  const shadow = (x, y, rx) => { g.fillStyle = 'rgba(30,60,30,.25)'; g.beginPath(); g.ellipse(x, y, rx, rx * 0.22, 0, 0, TAU); g.fill(); };
  if (kind === 'tree' || kind === 'blossom') {
    shadow(30, 66, 22);
    g.fillStyle = '#7a5232'; g.strokeStyle = '#3a2416'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(26, 66); g.quadraticCurveTo(28, 52, 27, 40); g.lineTo(33, 40); g.quadraticCurveTo(32, 52, 35, 66); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(40,20,10,.35)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(29, 60); g.lineTo(30, 46); g.moveTo(32, 62); g.lineTo(32, 48); g.stroke();
    if (kind === 'tree') foliage(30, 28, 25, '#4fa84a', '#8bdc6a', '#2f7a36', 7); else foliage(30, 28, 25, '#f09ac0', '#ffd0e4', '#d0689a', 7);
  } else if (kind === 'pine') {
    shadow(26, 66, 17);
    g.fillStyle = '#6a4630'; g.fillRect(23.5, 56, 5, 10);
    for (let k = 0; k < 4; k++) { const y = 58 - k * 12, w = 20 - k * 3.6; g.fillStyle = k % 2 ? '#2f8a54' : '#3b9a5e'; g.strokeStyle = '#1b4a30'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(26 - w, y); g.lineTo(26, y - 20); g.lineTo(26 + w, y); g.quadraticCurveTo(26, y + 5, 26 - w, y); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(26 - w + 2, y - 1); g.lineTo(26, y - 19); g.lineTo(26, y - 4); g.fill(); }
  } else if (kind === 'bush') {
    shadow(20, 20, 17); foliage(20, 12, 14, v % 2 ? '#58b04a' : '#46a24e', '#9ae27a', '#2f7a36', 5);
    if (v % 2) for (const [x, y] of [[12, 10], [24, 6], [27, 14], [17, 16]]) { g.fillStyle = '#ff7aa8'; g.beginPath(); g.arc(x, y, 1.5, 0, TAU); g.fill(); g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x, y, 0.5, 0, TAU); g.fill(); }
  } else if (kind === 'lantern') {
    shadow(10, 44, 7);
    g.fillStyle = '#3a3448'; g.strokeStyle = '#1a1424'; g.lineWidth = 0.7; g.fillRect(8.6, 14, 2.8, 30); g.strokeRect(8.6, 14, 2.8, 30);
    g.beginPath(); g.ellipse(10, 44, 4.5, 2, 0, 0, TAU); g.fill(); g.stroke();
    g.fillStyle = '#ffe9a0'; g.beginPath(); g.roundRect(4.5, 3, 11, 12, 2); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(60,40,20,.6)'; g.beginPath(); g.moveTo(10, 3); g.lineTo(10, 15); g.stroke();
    g.fillStyle = '#3a3448'; g.beginPath(); g.moveTo(3, 4); g.lineTo(10, -2); g.lineTo(17, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(10, -2.4, 1.1, 0, TAU); g.fill();
  } else if (kind === 'fence') {
    for (let i = 0; i < 6; i++) { const x = 3 + i * 7; g.fillStyle = '#f6ecd8'; g.strokeStyle = '#8a7048'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(x - 2, 14); g.lineTo(x - 2, 4); g.lineTo(x, 1.5); g.lineTo(x + 2, 4); g.lineTo(x + 2, 14); g.closePath(); g.fill(); g.stroke(); }
    g.fillStyle = '#d8c39a'; for (const y of [5.5, 10]) { g.fillRect(0, y, 44, 1.8); g.strokeRect(0, y, 44, 1.8); }
  } else if (kind === 'bench') {
    shadow(18, 15, 17);
    g.fillStyle = '#8a5a34'; g.strokeStyle = '#3a2416'; g.lineWidth = 0.7;
    g.fillRect(2, 5, 32, 4); g.strokeRect(2, 5, 32, 4); g.fillRect(2, -1, 32, 3.5); g.strokeRect(2, -1, 32, 3.5);
    for (const x of [4, 29]) { g.fillStyle = '#6a4224'; g.fillRect(x, 9, 3, 7); g.strokeRect(x, 9, 3, 7); g.fillRect(x, -1, 3, 8); }
  } else if (kind === 'crate') {
    shadow(14, 20, 15);
    g.fillStyle = '#c9a066'; g.strokeStyle = '#5a3a1a'; g.lineWidth = 0.8; g.fillRect(2, 4, 20, 16); g.strokeRect(2, 4, 20, 16);
    g.strokeStyle = 'rgba(90,58,26,.7)'; g.beginPath(); g.moveTo(2, 12); g.lineTo(22, 12); g.moveTo(2, 4); g.lineTo(22, 20); g.moveTo(22, 4); g.lineTo(2, 20); g.stroke();
    g.fillStyle = '#ff8a4a'; g.strokeStyle = '#8a3a1a'; g.beginPath(); g.arc(8, 3, 3.2, 0, TAU); g.fill(); g.stroke(); g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(15, 2.4, 3.2, 0, TAU); g.fill(); g.stroke();
  } else if (kind === 'signpost') {
    shadow(14, 36, 8);
    g.fillStyle = '#7a5232'; g.strokeStyle = '#3a2416'; g.lineWidth = 0.8; g.fillRect(12, 6, 4, 30); g.strokeRect(12, 6, 4, 30);
    g.fillStyle = '#d9b27a'; g.beginPath(); g.moveTo(2, 8); g.lineTo(20, 8); g.lineTo(26, 13); g.lineTo(20, 18); g.lineTo(2, 18); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#5a3a1a'; g.beginPath(); g.arc(12, 14.5, 2, 0, TAU); for (const d of [-3.2, 0, 3.2]) g.arc(12 + d, 10.8 + Math.abs(d) * 0.35, 1, 0, TAU); g.fill();
  } else if (kind === 'flowerbed') {
    g.fillStyle = '#8a5a34'; g.strokeStyle = '#3a2416'; g.lineWidth = 0.8; g.fillRect(1, 5, 30, 7); g.strokeRect(1, 5, 30, 7);
    g.fillStyle = '#3f2a18'; g.fillRect(2, 5.6, 28, 2);
    const rr = mulberry(v * 7 + 3), cols = ['#ff9ac6', '#ffd23f', '#ffffff', '#c9a0ff', '#ff8a6a'];
    for (let i = 0; i < 8; i++) { const x = 4 + i * 3.4, y = 4 - rr() * 3; g.strokeStyle = '#3f8a40'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, 6); g.lineTo(x, y); g.stroke(); g.fillStyle = cols[(i + v) % 5]; g.beginPath(); g.arc(x, y - 0.6, 2, 0, TAU); g.fill(); g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(x, y - 0.6, 0.7, 0, TAU); g.fill(); }
  }
}
// kind: [w, h, anchor x, anchor y]
const PROP_BOX = { tree: [60, 70, 30, 66], blossom: [60, 70, 30, 66], pine: [52, 70, 26, 66], bush: [40, 24, 20, 20], lantern: [20, 48, 10, 44], fence: [44, 16, 22, 14], bench: [36, 20, 18, 16], crate: [24, 24, 12, 20], signpost: [28, 40, 14, 36], flowerbed: [32, 14, 16, 12] };
function propSprite(kind, v) {
  const key = kind + v; let c = props.get(key);
  if (!c) { const b = PROP_BOX[kind]; c = mk(b[0], b[1], (g) => drawProp(kind, g, v)); props.set(key, c); }
  return c;
}
// [kind, x, y, scale, variant, minimum total building levels]. Bigger kingdoms grow more greenery and furniture.
const DECOR = [
  ['tree', 24, 214, 1.1, 1, 0], ['bush', 70, 238, 1, 1, 0], ['lantern', 118, 204, 1, 0, 0], ['flowerbed', 96, 247, 1, 2, 4],
  ['lantern', 262, 203, 1, 0, 0], ['bench', 288, 232, 1, 0, 0], ['bush', 252, 240, 0.9, 2, 2], ['fence', 262, 252, 1, 0, 8],
  ['blossom', 468, 216, 1, 2, 0], ['lantern', 502, 202, 1, 0, 6], ['flowerbed', 452, 247, 1, 3, 3], ['bush', 492, 240, 0.9, 1, 9],
  ['tree', 650, 216, 1, 3, 0], ['lantern', 686, 204, 1, 0, 0], ['bush', 628, 240, 1, 2, 5], ['fence', 636, 252, 1, 0, 12],
  ['pine', 876, 214, 1.1, 4, 0], ['signpost', 828, 232, 1, 0, 0], ['crate', 812, 240, 1, 0, 3], ['bush', 904, 242, 1, 1, 0], ['flowerbed', 852, 248, 1, 5, 7],
  ['pine', 12, 150, 0.8, 5, 14], ['tree', 208, 152, 0.7, 6, 16], ['blossom', 430, 150, 0.7, 7, 20], ['pine', 756, 150, 0.7, 8, 24], ['tree', 905, 154, 0.75, 9, 28],
];
const LANTERNS = DECOR.filter((d) => d[0] === 'lantern');
// cats of the village: walkers pace the road, loungers sit on benches, crates and the grass
let catSprites = null;
function villageCat(i) {
  if (!catSprites) catSprites = new Map();
  let c = catSprites.get(i);
  if (!c) { const d = CATS[i % CATS.length]; c = mk(30, 30, (g) => { g.scale(0.25, 0.25); drawCat(g, d, 'open'); }); catSprites.set(i, c); }
  return c;
}
const WALKERS = [{ cat: 0, y: 199, a: 10, b: 520, sp: 15, ph: 0 }, { cat: 3, y: 205, a: 300, b: 880, sp: 11, ph: 40 }, { cat: 5, y: 194, a: 120, b: 760, sp: 19, ph: 90 }];
const LOUNGERS = [{ cat: 2, x: 289, y: 232, lift: 12, sleep: true }, { cat: 6, x: 813, y: 240, lift: 17, sleep: false }, { cat: 1, x: 444, y: 233, lift: 0, sleep: true }, { cat: 4, x: 676, y: 232, lift: 0, sleep: false }];

let layers = null;
function ensureLayers(night) {
  if (layers && layers.night === night) return layers;
  freeKingdomArt();
  layers = { night, bg: bgLayer(night), clouds: CLOUDS.map((s) => cloudSprite(night, s)), glow: mk(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,225,130,.9)'); gr.addColorStop(0.35, 'rgba(255,205,100,.35)'); gr.addColorStop(1, 'rgba(255,205,100,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }) };
  return layers;
}
export function freeKingdomArt() {
  if (layers) { layers.bg.width = layers.bg.height = 0; layers.glow.width = layers.glow.height = 0; for (const c of layers.clouds) c.width = c.height = 0; layers = null; }
  for (const c of props.values()) c.width = c.height = 0; props.clear();
  if (catSprites) { for (const c of catSprites.values()) c.width = c.height = 0; catSprites = null; }
}
const puff = (ctx, x, y, r, a, col) => { ctx.fillStyle = `rgba(${col},${a})`; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); };
const walkPos = (w, t) => { const L = w.b - w.a, s = ((t * w.sp + w.ph) % (2 * L)); return s < L ? { x: w.a + s, dir: 1 } : { x: w.b - (s - L), dir: -1 }; };

// state: { kingdom, selected: {type,id}|null, bumps: {id: startTime}, night?: boolean }
export function drawKingdom(ctx, st, t) {
  const k = st.kingdom, night = st.night === true, L = ensureLayers(night);
  ctx.drawImage(L.bg, 0, 0, KW, KH);
  if (night) {   // twinkling stars
    const r = mulberry(5);
    for (let i = 0; i < 46; i++) { const x = r() * KW, y = r() * 96, tw = 0.5 + 0.5 * Math.sin(t * (1.5 + r() * 2) + i * 2.3), s = 0.7 + r() * 1.1; ctx.fillStyle = `rgba(255,255,235,${0.25 + 0.7 * tw})`; ctx.fillRect(x - s / 2, y - s / 2, s, s); if (i % 7 === 0) { ctx.fillRect(x - s * 2.2, y - 0.3, s * 4.4, 0.6); ctx.fillRect(x - 0.3, y - s * 2.2, 0.6, s * 4.4); } }
  } else {   // the sun breathes a little
    ctx.globalAlpha = 0.25 + 0.12 * Math.sin(t * 0.8); ctx.drawImage(L.glow, 786, -42, 160, 160); ctx.globalAlpha = 1;
  }
  // clouds drift at their own speeds
  for (let i = 0; i < 5; i++) {
    const sp = 4 + i * 2.2, x = ((i * 230 + t * sp) % (KW + 260)) - 130, y = 12 + (i * 23) % 62;
    ctx.drawImage(L.clouds[i % 3], x - 75 * (0.7 + (i % 3) * 0.12), y - 20, 150 * (0.7 + (i % 3) * 0.12), 56 * (0.7 + (i % 3) * 0.12));
  }
  // birds by day, bats by night
  ctx.strokeStyle = night ? '#0e1230' : '#4a4a6a'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const big = i < 3, x = ((t * (big ? 40 : 22) + i * 190) % (KW + 100)) - 50, y = (big ? 70 + i * 14 : 104 + i * 4) + Math.sin(t * 2 + i) * 4, f = Math.sin(t * (big ? 12 : 9) + i) * 3 * (big ? 1 : 0.6), s = big ? 1 : 0.6;
    ctx.beginPath(); ctx.moveTo(x - 6 * s, y - f); ctx.quadraticCurveTo(x - 3 * s, y - 4 * s, x, y); ctx.quadraticCurveTo(x + 3 * s, y - 4 * s, x + 6 * s, y - f); ctx.stroke();
  }
  // everything standing in the village, sorted by its feet so cats walk in front of and behind buildings
  const total = BUILDINGS.reduce((a, b) => a + buildingLevel(k, b.id), 0), items = [];
  for (const d of DECOR) if (total >= d[5]) items.push({ y: d[2], d });
  for (const b of BUILDINGS) items.push({ y: SPOTS[b.id].y, b });
  WALKERS.forEach((w, i) => { const p = walkPos(w, t); items.push({ y: w.y, w, p, i }); });
  LOUNGERS.forEach((c, i) => items.push({ y: c.y + 0.5, c, i }));
  items.sort((a, b) => a.y - b.y);
  const sway = (x) => Math.sin(t * 1.3 + x * 0.05) * 0.035;
  const info = [];
  for (const it of items) {
    if (it.d) {
      const [kind, x, y, s, v] = it.d, c = propSprite(kind, v), bx = PROP_BOX[kind];
      const sw = (kind === 'tree' || kind === 'blossom' || kind === 'pine' || kind === 'bush') ? sway(x) * (kind === 'bush' ? 0.5 : 1) : 0;
      ctx.save(); ctx.translate(x, y); if (sw) ctx.transform(1, 0, sw, 1, 0, 0); ctx.drawImage(c, -bx[2] * s, -bx[3] * s, bx[0] * s, bx[1] * s); ctx.restore();
    } else if (it.w) {
      const bob = Math.abs(Math.sin(t * 7 + it.i * 2)) * 2.2, face = it.p.dir;
      ctx.fillStyle = 'rgba(30,60,30,.25)'; ctx.beginPath(); ctx.ellipse(it.p.x, it.w.y, 8, 2.2, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(it.p.x, it.w.y - bob); ctx.scale(face, 1); ctx.rotate(Math.sin(t * 7 + it.i * 2) * 0.05); ctx.drawImage(villageCat(it.w.cat), -14, -27, 28, 28); ctx.restore();
    } else if (it.c) {
      const c = it.c, br = Math.sin(t * 1.6 + it.i * 1.9) * 0.025, sq = c.sleep ? 0.84 : 0.94;
      ctx.fillStyle = 'rgba(30,60,30,.22)'; ctx.beginPath(); ctx.ellipse(c.x, c.y + 0.5, 9, 2.4, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(c.x, c.y - c.lift); ctx.scale(it.i % 2 ? -1 : 1, sq + br); ctx.drawImage(villageCat(c.cat), -14, -27, 28, 28); ctx.restore();
      if (c.sleep) { const u = (t * 0.5 + it.i * 0.37) % 1; ctx.fillStyle = `rgba(90,70,150,${0.9 * (1 - u)})`; ctx.font = `800 ${6 + u * 5}px sans-serif`; ctx.textAlign = 'center'; ctx.fillText('z', c.x + 11 + u * 8, c.y - c.lift - 22 - u * 12); }
    } else {
      const b = it.b, p = SPOTS[b.id], l = buildingLevel(k, b.id), sel = st.selected && st.selected.type === 'building' && st.selected.id === b.id;
      const bump = st.bumps && st.bumps[b.id] != null ? Math.max(0, 1 - (t - st.bumps[b.id]) / 0.6) : 0;
      const hop = sel ? Math.abs(Math.sin(t * 4)) * 5 : 0, pop = 1 + bump * 0.22 * Math.sin(bump * 3.14);
      const h = 120 * p.s * pop, maxed = l >= b.max;
      ctx.fillStyle = 'rgba(40,70,40,.26)'; ctx.beginPath(); ctx.ellipse(p.x + 5 * p.s, p.y, 54 * p.s, 8.5 * p.s, 0, 0, TAU); ctx.fill();
      if (maxed) { const pulse = 0.5 + 0.5 * Math.sin(t * 2 + p.x); ctx.strokeStyle = `rgba(255,214,90,${0.35 + 0.3 * pulse})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(p.x, p.y, 57 * p.s, 9 * p.s, 0, 0, TAU); ctx.stroke(); }
      if (sel) { const g2 = ctx.createRadialGradient(p.x, p.y - 36 * p.s, 6, p.x, p.y - 36 * p.s, 78 * p.s); g2.addColorStop(0, 'rgba(255,246,176,.8)'); g2.addColorStop(1, 'rgba(255,246,176,0)'); ctx.fillStyle = g2; ctx.fillRect(p.x - 90, p.y - 120, 180, 140); }
      ctx.drawImage(sprite(b.id, l), p.x - h / 2, p.y - h * (112 / 120) - hop, h, h);
      info.push({ b, p, l, h, sel, hop });
      // ambient life on the building itself
      const sx = p.x + (70 - 60) * h / 120, top = p.y - h * (112 / 120) - hop;
      if (b.id === 'beds' && l >= 1) for (let i = 0; i < 5; i++) { const u = (t * 0.35 + i / 5) % 1; puff(ctx, sx + u * 14 + Math.sin(t + i) * 2, top + 42 * h / 120 - u * 34, 2 + u * 4.5, 0.55 * (1 - u), '255,255,255'); }
      if (b.id === 'spa' && l >= 1) for (let i = 0; i < 6; i++) { const u = (t * 0.3 + i / 6) % 1, xx = p.x - 10 + (i % 3) * 10; puff(ctx, xx + Math.sin(t * 2 + i * 2) * 2.5, p.y - 20 - u * 28, 2.2 + u * 3, 0.4 * (1 - u), '255,255,255'); }
      if (l >= 4 && b.id !== 'spa') for (let i = 0; i < 2; i++) {   // sparkles on well grown buildings
        const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 3.1 + p.x), a = i * 2.4 + p.x;
        const x = p.x + Math.cos(a) * h * 0.34, y = top + h * (0.3 + 0.25 * Math.sin(a * 1.7)); ctx.fillStyle = `rgba(255,240,170,${0.2 + 0.7 * tw})`; ctx.fillRect(x - 0.6, y - 2.6 * tw, 1.2, 5.2 * tw); ctx.fillRect(x - 2.6 * tw, y - 0.6, 5.2 * tw, 1.2);
      }
    }
  }
  // little life in the air: butterflies by day, fireflies by night
  if (night) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) { const x = (i * 83 + Math.sin(t * 0.5 + i) * 26) % KW, y = 176 + (i * 37) % 70 + Math.sin(t * 0.8 + i * 2) * 8, a = 0.25 + 0.55 * Math.max(0, Math.sin(t * 1.7 + i * 1.3)); ctx.globalAlpha = a; ctx.drawImage(L.glow, x - 7, y - 7, 14, 14); }
    ctx.restore();
    // a cool moonlit multiply tint over the whole scene, then lamp light on top of it
    ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#8f98d6'; ctx.fillRect(0, 0, KW, KH); ctx.restore();
  } else for (let i = 0; i < 3; i++) {
    const x = 160 + i * 300 + Math.sin(t * 0.45 + i * 2) * 70, y = 170 + i * 16 + Math.sin(t * 0.9 + i * 3) * 10, wing = 1.1 + Math.sin(t * 16 + i * 4) * 0.9;
    ctx.fillStyle = ['#ff9ac6', '#ffd23f', '#8fd3ff'][i]; ctx.strokeStyle = 'rgba(60,30,60,.6)'; ctx.lineWidth = 0.5;
    for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.ellipse(x + sgn * wing * 1.7, y - 1, wing * 2.4, 2.8, sgn * 0.5, 0, TAU); ctx.fill(); ctx.stroke(); }
  }
  // lantern glow (steady by day, bright at night) and window warmth in the evening
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  for (const d of LANTERNS) { if (total < d[5]) continue; const fl = 0.85 + 0.15 * Math.sin(t * 9 + d[1]), r = night ? 34 : 11; ctx.globalAlpha = (night ? 0.95 : 0.4) * fl; ctx.drawImage(L.glow, d[1] - r, d[2] - 40 - r, r * 2, r * 2); }
  if (night) for (const f of info) if (f.l > 0) { ctx.globalAlpha = 0.28; ctx.drawImage(L.glow, f.p.x - 40, f.p.y - 70, 80, 80); }
  ctx.restore();
  // price tags, pips and names go on top of everything
  for (const { b, p, l, h, sel } of info) {
    // level pips
    for (let i = 0; i < b.max; i++) { ctx.fillStyle = i < l ? '#ffd23f' : 'rgba(80,60,110,.35)'; ctx.strokeStyle = '#6a4a14'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(p.x + (i - (b.max - 1) / 2) * 9, p.y + 11, 3, 0, TAU); ctx.fill(); if (i < l) ctx.stroke(); }
    const afford = l < b.max && k.coins >= upgradeCost(b.id, l);
    if (afford) { const y = p.y - h * 0.62 + Math.sin(t * 5 + p.x) * 3; ctx.fillStyle = '#ff4a6a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(p.x + h * 0.36, y, 9, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', p.x + h * 0.36, y + 4.5); }
    if (l < b.max && !sel) {
      // price tag: the next upgrade cost, bright when affordable
      const cost = upgradeCost(b.id, l), label = cost >= 10000 ? Math.round(cost / 1000) + 'k' : String(cost);
      ctx.font = '800 11px sans-serif'; ctx.textAlign = 'center';
      const tw = ctx.measureText(label).width + 26, ty = p.y + 17;
      ctx.fillStyle = afford ? '#2f8a4a' : 'rgba(42,29,74,.78)'; ctx.beginPath(); ctx.roundRect(p.x - tw / 2, ty, tw, 15, 7); ctx.fill();
      ctx.fillStyle = afford ? '#fff' : '#cfc4ee'; ctx.fillText(label, p.x + 7, ty + 11.5);
      ctx.drawImage(iconCanvas('\u{1FA99}'), p.x - tw / 2 + 2, ty - 1, 17, 17);
    }
    if (sel) { ctx.font = '800 13px sans-serif'; ctx.textAlign = 'center'; const w = ctx.measureText(b.name).width + 16; ctx.fillStyle = '#2a1d4a'; ctx.beginPath(); ctx.roundRect(p.x - w / 2, p.y + 16, w, 20, 10); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(b.name, p.x, p.y + 30); }
  }
  // wonders float above the village
  WONDERS.forEach((w, i) => {
    const owned = !!(k.wonders && k.wonders[w.id]), x = WONDER_X(i), y = WONDER_Y + Math.sin(t * 1.8 + i) * 4;
    const sel = st.selected && st.selected.type === 'wonder' && st.selected.id === w.id;
    const gl = ctx.createRadialGradient(x, y, 2, x, y, 36);
    gl.addColorStop(0, owned ? 'rgba(255,225,120,.95)' : sel ? 'rgba(255,255,255,.8)' : 'rgba(255,255,255,.45)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - 40, y - 40, 80, 80);
    ctx.fillStyle = owned ? '#fff6d0' : 'rgba(255,255,255,.7)'; ctx.strokeStyle = owned ? '#d9a600' : sel ? '#ff8fb7' : '#9a8ac0'; ctx.lineWidth = sel ? 3.5 : 2.2;
    ctx.beginPath(); ctx.arc(x, y, 21, 0, TAU); ctx.fill(); ctx.stroke();
    if (owned) {
      // a bought wonder wears a gold halo with a few twinkling sparks, so it reads as "yours" at a glance
      ctx.strokeStyle = 'rgba(255,214,90,.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 27 + Math.sin(t * 2.4 + i) * 1.5, 0, TAU); ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = t * 0.9 + k * (TAU / 4) + i, tw = 0.5 + 0.5 * Math.sin(t * 3 + k * 1.7 + i);
        ctx.fillStyle = `rgba(255,240,170,${0.35 + 0.55 * tw})`; ctx.beginPath(); ctx.arc(x + Math.cos(a) * 30, y + Math.sin(a) * 30, 1.6 + tw * 1.4, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = owned ? 1 : 0.55; ctx.drawImage(iconCanvas(w.icon), x - 15, y - 16, 30, 30); ctx.globalAlpha = 1;
    if (!owned) { ctx.fillStyle = '#2a1d4a'; ctx.font = '800 11px sans-serif'; const label = String(w.cost); const tw = ctx.measureText(label).width + 26; ctx.beginPath(); ctx.roundRect(x - tw / 2, y + 23, tw, 15, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(label, x + 7, y + 34); ctx.drawImage(iconCanvas('💎'), x - tw / 2 + 2, y + 22, 17, 17); }
  });
}


// wires a canvas to the scene. Returns { select, bump, stop }.
export function createKingdomScene(canvas, getKingdom, onSelect) {
  const ctx = canvas.getContext('2d');
  const h = new Date().getHours(), st = { kingdom: getKingdom(), selected: null, bumps: {}, night: h >= 20 || h < 6 };   // the village sleeps under the moon at night
  let raf = 0, t0 = performance.now();
  const frame = (ts) => {
    if (!canvas.isConnected) return;
    st.kingdom = getKingdom();
    const t = (ts - t0) / 1000;
    ctx.setTransform(canvas.width / KW, 0, 0, canvas.width / KW, 0, 0);
    drawKingdom(ctx, st, t);
    st.now = t;
    raf = requestAnimationFrame(frame);
  };
  const onDown = (e) => {
    // offsetX is in the element's own coordinates, so it stays right when the page is scaled or rotated
    const x = (e.offsetX / canvas.clientWidth) * KW, y = (e.offsetY / canvas.clientHeight) * KH;
    const hit = hitTest(x, y);
    if (hit) { st.selected = hit; onSelect(hit); }
  };
  canvas.addEventListener('pointerdown', onDown);
  raf = requestAnimationFrame(frame);
  return {
    select(h) { st.selected = h; },
    setNight(v) { st.night = !!v; },
    bump(id) { st.bumps[id] = st.now || 0; },
    stop() { cancelAnimationFrame(raf); canvas.removeEventListener('pointerdown', onDown); freeKingdomArt(); },
  };
}
