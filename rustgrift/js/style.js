'use strict';
// ===================== STYLE: painterly "dusk cartoon" rendering layer =====================
// Thin dark outlines, gradient shading with warm rim light, glossy UI, sunset skylines.
const STYLE = { lw: 0.72, amp: 0.5 };

function bbox(pts) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const q of pts) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
  return [x0, y0, x1, y1];
}
function paintShade(c, x0, y0, x1, y1, lw, rimPath, o) {
  const g = c.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(255,205,140,0.24)'); g.addColorStop(.45, 'rgba(255,205,140,0)');
  g.addColorStop(.5, 'rgba(12,6,40,0)'); g.addColorStop(1, 'rgba(12,6,45,0.55)');
  c.fillStyle = g; c.fillRect(x0 - 3, y0 - 3, x1 - x0 + 6, y1 - y0 + 6);
  c.save(); c.translate(lw * .9, lw * .9); rimPath(); c.lineWidth = lw * 1.3; c.strokeStyle = 'rgba(255,178,100,0.5)'; c.stroke(); c.restore();
}
function inkShape(c, pts, fill, o = {}) {
  const seed = o.seed || 1, amp = (o.amp != null ? o.amp : 1.2) * STYLE.amp, lw = (o.lw || 4) * STYLE.lw, sharp = o.sharp;
  if (fill) {
    shapePath(c, pts, seed, amp, sharp); c.fillStyle = fill; c.fill();
    if (o.shade !== false) {
      const b = bbox(pts); c.save(); shapePath(c, pts, seed, amp, sharp); c.clip();
      paintShade(c, b[0], b[1], b[2], b[3], lw, () => shapePath(c, pts, seed, amp, sharp));
      c.restore();
    }
  }
  if (o.stroke !== false) { shapePath(c, pts, seed, amp, sharp); c.lineWidth = lw; c.strokeStyle = o.line || C.ink; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); }
}
function rrPath(c, x, y, w, h, r, seed, a) {
  const j = i => jit(seed, i, a);
  c.beginPath();
  c.moveTo(x + r + j(1), y + j(2));
  c.lineTo(x + w - r + j(3), y + j(4)); c.quadraticCurveTo(x + w + j(5), y + j(6), x + w + j(7), y + r + j(8));
  c.lineTo(x + w + j(9), y + h - r + j(10)); c.quadraticCurveTo(x + w + j(11), y + h + j(12), x + w - r + j(13), y + h + j(14));
  c.lineTo(x + r + j(15), y + h + j(16)); c.quadraticCurveTo(x + j(17), y + h + j(18), x + j(19), y + h - r + j(20));
  c.lineTo(x + j(21), y + r + j(22)); c.quadraticCurveTo(x + j(23), y + j(24), x + r + j(1), y + j(2));
  c.closePath();
}
function inkRect(c, x, y, w, h, fill, seed = 1, o = {}) {
  const r = o.r != null ? o.r : 8, a = (o.amp != null ? o.amp : 1.2) * STYLE.amp, lw = (o.lw || 4) * STYLE.lw;
  const path = () => rrPath(c, x, y, w, h, r, seed, a);
  if (fill) {
    path(); c.fillStyle = fill; c.fill();
    if (o.shade !== false) { c.save(); path(); c.clip(); paintShade(c, x, y, x + w, y + h, lw, path); c.restore(); }
  }
  if (o.stroke !== false) { path(); c.lineWidth = lw; c.strokeStyle = o.line || C.ink; c.lineJoin = 'round'; c.stroke(); }
}
function glossRect(c, x, y, w, h, r = 8) { // top-half glassy highlight
  c.save(); rrPath(c, x, y, w, h, r, 1, 0); c.clip();
  const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, 'rgba(255,255,255,.32)'); g.addColorStop(.5, 'rgba(255,255,255,.06)'); g.addColorStop(.52, 'rgba(0,0,0,.08)'); g.addColorStop(1, 'rgba(0,0,0,.22)');
  c.fillStyle = g; c.fillRect(x, y, w, h); c.restore();
}

// ---------- HP bar / shield badge ----------
function shieldBadge(c, x, y, n, s = 1) {
  c.save(); c.translate(x, y); c.scale(s, s);
  inkShape(c, [[-15, -17], [0, -21], [15, -17], [15, 4], [0, 20], [-15, 4]], '#243a66', { seed: 3, lw: 4, sharp: 1, amp: 0, shade: true });
  c.strokeStyle = '#a9c8ff'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-11, -13); c.lineTo(0, -16); c.lineTo(11, -13); c.lineTo(11, 3); c.lineTo(0, 15); c.lineTo(-11, 3); c.closePath(); c.stroke();
  txt(c, String(n), 0, 7, { size: 20, font: FD, color: '#fff', align: 'center', stroke: C.ink, sw: 4 });
  c.restore();
}
function hpBar(c, u, cx, y, w = 130, h = 16, o = {}) {
  const x = cx - w / 2, r = h / 2;
  c.save();
  rrPath(c, x, y, w, h, r, 3, 0); c.fillStyle = '#1a0f22'; c.fill();
  c.save(); rrPath(c, x + 2, y + 2, w - 4, h - 4, r - 2, 3, 0); c.clip();
  const k = clamp(u.dhp / u.maxhp, 0, 1), k2 = clamp(u.hp / u.maxhp, 0, 1);
  c.fillStyle = '#f1d9a6'; c.fillRect(x, y, w * k, h);
  const base = o.col || C.red; const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, shade(base === C.red ? '#e04a42' : base, .25)); g.addColorStop(1, shade(base === C.red ? '#a81c2c' : base, -.25));
  c.fillStyle = g; c.fillRect(x, y, w * k2, h);
  c.fillStyle = 'rgba(255,255,255,.3)'; c.fillRect(x, y + 1, w * k2, h * .32);
  c.restore();
  rrPath(c, x, y, w, h, r, 3, 0); c.lineWidth = 2.5; c.strokeStyle = '#0a0610'; c.stroke();
  c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.25)'; rrPath(c, x + 1.5, y + 1.5, w - 3, h - 3, r - 1.5, 3, 0); c.stroke();
  txt(c, `${Math.max(0, Math.ceil(u.hp))}/${u.maxhp}`, cx, y + h - 3.5, { size: 13, font: FD, color: '#fff', align: 'center', stroke: '#1a0f22', sw: 3 });
  if (u.block > 0) shieldBadge(c, x - 4, y + h / 2, u.block, .95);
  c.restore();
}
function intentBubble(c, x, y, ic, label, col = '#e04a42') {
  c.save();
  c.fillStyle = 'rgba(255,120,40,.18)'; c.beginPath(); c.arc(x, y, 38, 0, 6.3); c.fill();
  c.beginPath(); c.moveTo(x - 9, y + 24); c.lineTo(x, y + 40); c.lineTo(x + 9, y + 24); c.closePath(); c.fillStyle = col; c.strokeStyle = C.ink; c.lineWidth = 2.5; c.fill(); c.stroke();
  const g = c.createRadialGradient(x - 8, y - 10, 4, x, y, 30); g.addColorStop(0, '#3a2a48'); g.addColorStop(1, '#130b1c');
  c.beginPath(); c.arc(x, y, 28, 0, 6.3); c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.85)'; c.stroke();
  c.lineWidth = 2; c.strokeStyle = C.ink; c.beginPath(); c.arc(x, y, 31, 0, 6.3); c.stroke();
  c.shadowColor = '#fff'; c.shadowBlur = 8; icon(c, ic, x, y - 1, 17); c.shadowBlur = 0;
  if (label) txt(c, label, x + 34, y + 10, { size: 32, font: FD, color: '#fff', stroke: C.ink, sw: 6, rot: -.04 });
  c.restore();
}

// ---------- cards ----------
function cardTheme(d) {
  if (d.kind === 'n') return d.pwr || d.arg ? { c: '#8a4cc8', glow: '#c27bff', k: 'spark' } : d.comp && !d.inf ? { c: '#3a78d0', glow: '#7fb8ff', k: 'rays' } : { c: '#e8a21c', glow: '#ffd36a', k: 'spark' };
  if (d.type === 'curse') return { c: '#6f6a74', glow: '#9a8fa8', k: 'rays' };
  if (d.type === 'atk') return { c: '#d63a34', glow: '#ff6a4a', k: 'slash' };
  if (d.type === 'pwr') return { c: '#8a4cc8', glow: '#c27bff', k: 'spark' };
  return { c: '#1fa3b3', glow: '#6fe0f0', k: 'rays' };
}
function streak(c, x1, y1, x2, y2, w, fill, edge) {
  const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy), nx = -dy / L, ny = dx / L, mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo(mx + nx * w, my + ny * w, x2, y2); c.quadraticCurveTo(mx + nx * w * .15, my + ny * w * .15, x1, y1); c.closePath();
  c.fillStyle = fill; c.fill(); c.lineWidth = 2; c.strokeStyle = edge; c.stroke();
}
function drawCard(c, d, x, y, rot = 0, sc = 1, o = {}) {
  c.save(); c.translate(x, y); c.rotate(rot); c.scale(sc, sc);
  if (o.alpha != null) c.globalAlpha = o.alpha;
  const hw = CW / 2, hh = CH / 2, th = cardTheme(d), seed = (d.id || 'x').length * 13 + (d.id || 'x').charCodeAt(0);
  if (o.glow) { c.save(); c.shadowColor = o.glow; c.shadowBlur = 30; c.fillStyle = o.glow; c.globalAlpha *= .8; rrPath(c, -hw + 4, -hh + 4, CW - 8, CH - 8, 12, 1, 0); c.fill(); c.restore(); }
  c.save(); c.globalAlpha *= .4; c.fillStyle = '#000'; c.translate(6, 9); rrPath(c, -hw + 3, -hh + 3, CW - 6, CH - 6, 12, 1, 0); c.fill(); c.restore();
  // frame
  inkRect(c, -hw, -hh, CW, CH, th.c, seed, { lw: 5, r: 12 });
  c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 1.5; rrPath(c, -hw + 4, -hh + 4, CW - 8, CH - 8, 9, 1, 0); c.stroke();
  // art window
  const ax = -hw + 9, ay = -hh + 34, aw = CW - 18, ah = 92;
  c.save(); rrPath(c, ax, ay, aw, ah, 6, 1, 0); c.clip();
  const bg = c.createLinearGradient(0, ay, 0, ay + ah); bg.addColorStop(0, '#2b1c38'); bg.addColorStop(1, '#0f0818'); c.fillStyle = bg; c.fillRect(ax, ay, aw, ah);
  const cx = 0, cy = ay + ah / 2;
  const rg = c.createRadialGradient(cx, cy, 4, cx, cy, 80); rg.addColorStop(0, th.glow); rg.addColorStop(.35, th.c); rg.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha *= .75; c.fillStyle = rg; c.fillRect(ax, ay, aw, ah); c.globalAlpha = (o.alpha != null ? o.alpha : 1);
  c.save(); c.translate(cx, cy);
  if (th.k === 'slash') {
    streak(c, -70, 34, 62, -34, 11, '#fff4e0', '#ff4a3a'); streak(c, -62, 40, 70, -8, 7, '#ffd9b0', '#ff7a3a'); streak(c, -40, 44, 52, -40, 5, 'rgba(255,255,255,.7)', 'rgba(255,90,60,.8)');
  } else if (th.k === 'rays') {
    c.fillStyle = 'rgba(255,255,255,.14)'; for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + seed; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 110, Math.sin(a) * 110); c.lineTo(Math.cos(a + .11) * 110, Math.sin(a + .11) * 110); c.closePath(); c.fill(); }
  } else {
    c.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 16; i++) { const a = i * 2.4 + seed, r = 20 + (i * 17 % 50); c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r * .8, 1.5 + i % 3, 0, 6.3); c.fill(); }
  }
  c.shadowColor = th.glow; c.shadowBlur = 22; icon(c, d.art || 'sword', 0, 0, 29, { seed }); c.shadowBlur = 0;
  c.restore();
  halftone(c, ax, ay, aw, ah, 'rgba(0,0,0,.18)', 6, 1.6, 'up');
  c.restore();
  c.strokeStyle = C.ink; c.lineWidth = 2.5; rrPath(c, ax, ay, aw, ah, 6, 1, 0); c.stroke();
  // name
  const nm = d.name + (o.upg || d.up ? '+' : ''), fs = nm.length > 14 ? 17 : nm.length > 11 ? 19 : 22;
  c.save(); c.transform(1, 0, -.12, 1, 0, 0);
  txt(c, nm, 12, -hh + 25, { size: fs, font: FD, color: o.upg || d.up ? '#c8ff8a' : '#fff', align: 'center', stroke: C.ink, sw: 5 });
  c.restore();
  // text panel
  const ty = ay + ah + 5, th2 = hh - ty - 7;
  inkRect(c, -hw + 8, ty, CW - 16, th2, '#f1e6cc', seed + 1, { lw: 3, r: 7, shade: false, amp: .4 });
  const tl = d.kind === 'n' ? (d.pwr ? 'TACTIC' : d.arg ? 'ARGUMENT' : d.inf ? 'INFLUENCE' : d.comp ? 'COMPOSURE' : 'TRICK') : d.type === 'atk' ? 'ATTACK' : d.type === 'pwr' ? 'POWER' : d.type === 'curse' ? 'CURSE' : 'SKILL';
  txt(c, tl, 0, ty + 12, { size: 10, font: FD, color: shade(th.c, -.25), align: 'center' });
  richText(c, d.text, 0, ty + 27, CW - 30, 15, d.text.length > 70 ? 13 : 15, 'center');
  // cost orb
  c.save(); c.translate(-hw + 6, -hh + 8);
  const og = c.createRadialGradient(-5, -6, 2, 0, 0, 20); og.addColorStop(0, o.unaff ? '#c9c4cc' : '#ffe27a'); og.addColorStop(1, o.unaff ? '#6f6a74' : '#e59a14');
  c.beginPath(); c.arc(0, 0, 19, 0, 6.3); c.fillStyle = og; c.fill(); c.lineWidth = 3.5; c.strokeStyle = C.ink; c.stroke();
  c.lineWidth = 1.2; c.strokeStyle = 'rgba(255,255,255,.6)'; c.beginPath(); c.arc(0, 0, 15.5, 0, 6.3); c.stroke();
  txt(c, d.cost == null ? '' : String(d.cost), 0, 9, { size: 26, font: FD, color: '#241408', align: 'center' });
  c.restore();
  const rc = d.rarity === 'rare' ? '#ff9a2e' : d.rarity === 'uncommon' ? '#6fe0f0' : d.rarity === 'starter' ? '#d8cdb8' : '#9a94a0';
  inkShape(c, [[0, hh - 15], [7, hh - 8], [0, hh - 1], [-7, hh - 8]], rc, { seed, lw: 2, shade: false, sharp: 1, amp: 0 });
  if (o.dim) { c.fillStyle = 'rgba(15,8,25,.5)'; rrPath(c, -hw, -hh, CW, CH, 12, 1, 0); c.fill(); }
  c.restore();
}

// ---------- backdrops ----------
const PALS = {
  alley: { sky: ['#241a4a', '#6b3a78', '#e2553f', '#f58f4a', '#fbc66a'], sun: ['#ffe9a0', '#ff8a30'], glow: '255,130,50', b1: '#5a4a86', b2: '#3a3468', b3: '#1b1a38', win: '#ffb04a', lamp: 1 },
  desert: { sky: ['#3a1f3f', '#9a3d4f', '#ef7a3a', '#f7b04f', '#fbe08a'], sun: ['#fff1b0', '#ff9a30'], glow: '255,150,60', b1: '#9a5a66', b2: '#6e3e50', b3: '#2c1a2a', win: '#ffcc66', lamp: 0 },
  foundry: { sky: ['#1c1233', '#4a2a6a', '#a04a8a', '#e07a5a', '#f5b070'], sun: ['#ffd9a0', '#ff7a4a'], glow: '255,110,80', b1: '#66508e', b2: '#3e2f66', b3: '#1a1230', win: '#ff9a4a', lamp: 1 },
  market: { sky: ['#10264a', '#25557a', '#4aa0a8', '#e8b46a', '#f7d79a'], sun: ['#fff4c0', '#ffc060'], glow: '255,200,110', b1: '#3f7088', b2: '#2a5068', b3: '#152a40', win: '#ffd27a', lamp: 1 },
  camp: { sky: ['#0b0d2a', '#161a4a', '#2a2f6a', '#4a4a8a', '#7a6aa0'], sun: ['#ffffff', '#d8e0ff'], glow: '170,185,255', b1: '#2e3068', b2: '#1e2050', b3: '#0f1030', win: '#ffcf6a', lamp: 0 },
  night: { sky: ['#0b0d2a', '#161a4a', '#2a2f6a', '#4a4a8a', '#7a6aa0'], sun: ['#ffffff', '#d8e0ff'], glow: '170,185,255', b1: '#2e3068', b2: '#1e2050', b3: '#0f1030', win: '#ffcf6a', lamp: 1 }
};
const HORIZON = 416;
function makeBackdrop(kind, seed = 1) {
  const key = kind + seed; if (BG_CACHE[key]) return BG_CACHE[key];
  const p = document.createElement('canvas'); p.width = W; p.height = H; const c = p.getContext('2d');
  const P = PALS[kind] || PALS.alley;
  let sd = seed * 1000 + 7; const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  const sg = c.createLinearGradient(0, 0, 0, HORIZON); [0, .3, .55, .8, 1].forEach((s, i) => sg.addColorStop(s, P.sky[i])); c.fillStyle = sg; c.fillRect(0, 0, W, H);
  const night = kind === 'night' || kind === 'camp';
  const sx = night ? 235 : 200 + r() * 700, sy = night ? 145 : 150 + r() * 40;
  if (night) for (let i = 0; i < 160; i++) { c.fillStyle = `rgba(255,250,220,${.25 + r() * .7})`; const sz = r() < .1 ? 2.2 : 1.2; c.fillRect(r() * W, r() * 300, sz, sz); }
  let g = c.createRadialGradient(sx, sy, 20, sx, sy, night ? 300 : 420); g.addColorStop(0, `rgba(${P.glow},${night ? .35 : .6})`); g.addColorStop(1, `rgba(${P.glow},0)`); c.fillStyle = g; c.fillRect(0, 0, W, H);
  g = c.createRadialGradient(sx - 20, sy - 20, 10, sx, sy, 90); g.addColorStop(0, P.sun[0]); g.addColorStop(1, night ? '#cfd6b8' : P.sun[1]); c.fillStyle = g; c.beginPath(); c.arc(sx, sy, night ? 76 : 88, 0, 6.3); c.fill();
  if (night) { c.fillStyle = 'rgba(120,125,100,.28)'; for (const [dx, dy, rr] of [[-22, -18, 16], [20, 8, 22], [-8, 30, 12], [30, -26, 9], [-34, 14, 8]]) { c.beginPath(); c.arc(sx + dx, sy + dy, rr, 0, 6.3); c.fill(); } }
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, night ? 77 : 90, 0, 6.3); c.stroke();
  // clouds
  for (let i = 0; i < (night ? 14 : 10); i++) {
    const cx = r() * W, cy = 30 + r() * (night ? 220 : 250), n = 4 + (r() * 4 | 0);
    if (night && Math.abs(cx - sx) < 170 && cy < 260) continue;
    for (let k = 0; k < n; k++) {
      const ex = cx + (k - n / 2) * (50 + r() * 40), rx = 70 + r() * 110, ry = 10 + r() * 20, ey = cy + (r() - .5) * 14;
      const cg = c.createLinearGradient(0, ey - ry, 0, ey + ry);
      if (night) { cg.addColorStop(0, 'rgba(140,150,210,.55)'); cg.addColorStop(.35, 'rgba(24,28,80,.85)'); cg.addColorStop(1, 'rgba(10,12,44,.85)'); }
      else { cg.addColorStop(0, `rgba(${P.glow},.55)`); cg.addColorStop(1, 'rgba(70,30,90,.55)'); }
      c.fillStyle = cg; c.beginPath(); c.ellipse(ex, ey, rx, ry, 0, 0, 6.3); c.fill();
    }
  }
  // skylines
  const skyline = (base, col, minH, maxH, wMin, wMax, winD, towers) => {
    let x = -30;
    while (x < W + 30) {
      const bw = wMin + r() * (wMax - wMin), bh = minH + r() * (maxH - minH), top = base - bh;
      const lg = c.createLinearGradient(x, top, x + bw, base); lg.addColorStop(0, shade(col, .12)); lg.addColorStop(1, shade(col, -.35));
      c.fillStyle = lg; c.fillRect(x, top, bw, bh + 4);
      c.fillStyle = `rgba(${P.glow},.28)`; c.fillRect(x, top, bw, 3); c.fillRect(x, top, 3, bh);
      c.strokeStyle = 'rgba(8,4,20,.55)'; c.lineWidth = 2; c.strokeRect(x, top, bw, bh + 4);
      if (r() < towers) { c.fillStyle = shade(col, -.3); c.fillRect(x + bw * .3, top - 26, bw * .35, 26); c.strokeRect(x + bw * .3, top - 26, bw * .35, 26); c.beginPath(); c.moveTo(x + bw * .3, top - 26); c.lineTo(x + bw * .47, top - 42); c.lineTo(x + bw * .65, top - 26); c.fillStyle = shade(col, -.45); c.fill(); c.stroke(); }
      else if (r() < .35) { c.strokeStyle = 'rgba(10,6,24,.8)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + bw / 2, top); c.lineTo(x + bw / 2, top - 30 - r() * 20); c.stroke(); }
      for (let wy = top + 14; wy < base - 16; wy += 22) for (let wx = x + 9; wx < x + bw - 14; wx += 17) {
        if (r() < winD) { c.fillStyle = P.win; c.globalAlpha = .55 + r() * .45; c.fillRect(wx, wy, 8, 11); c.globalAlpha = 1; }
        else if (r() < .5) { c.fillStyle = 'rgba(10,6,28,.55)'; c.fillRect(wx, wy, 8, 11); }
      }
      x += bw + r() * 4;
    }
  };
  skyline(HORIZON, P.b1, 70, 210, 50, 100, .12, .05);
  skyline(HORIZON + 6, P.b2, 90, 260, 60, 120, .3, .12);
  // fence + wall
  const wt = HORIZON - 52;
  g = c.createLinearGradient(0, wt, 0, HORIZON); g.addColorStop(0, '#3a3552'); g.addColorStop(1, '#161224'); c.fillStyle = g; c.fillRect(0, wt, W, HORIZON - wt + 4);
  c.fillStyle = 'rgba(255,170,90,.35)'; c.fillRect(0, wt, W, 3);
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; for (let y = wt + 14; y < HORIZON; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); for (let x = (y / 14 % 2) * 20; x < W; x += 40) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + 14); c.stroke(); } }
  for (const [fx0, fx1] of [[0, 480], [900, W]]) {
    c.strokeStyle = 'rgba(8,5,18,.75)'; c.lineWidth = 3; for (let x = fx0; x <= fx1; x += 120) { c.beginPath(); c.moveTo(x, wt - 78); c.lineTo(x, wt); c.stroke(); }
    c.lineWidth = 3; c.beginPath(); c.moveTo(fx0, wt - 78); c.lineTo(fx1, wt - 78); c.stroke();
    c.strokeStyle = 'rgba(8,5,18,.38)'; c.lineWidth = 1.5;
    for (let x = fx0 - 80; x < fx1 + 80; x += 16) { c.beginPath(); c.moveTo(x, wt); c.lineTo(x + 78, wt - 78); c.stroke(); c.beginPath(); c.moveTo(x + 78, wt); c.lineTo(x, wt - 78); c.stroke(); }
  }
  skyline(wt + 2, P.b3, 10, 10, 1, 2, 0, 0); // thin dark base line
  // ground
  g = c.createLinearGradient(0, HORIZON, 0, H); g.addColorStop(0, shade(P.b3, .25)); g.addColorStop(.45, shade(P.b3, -.35)); g.addColorStop(1, '#07050c'); c.fillStyle = g; c.fillRect(0, HORIZON, W, H - HORIZON);
  c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) { const y = HORIZON + 6 + Math.pow(i / 9, 1.6) * (H - HORIZON); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  for (let i = 0; i < 60; i++) { const x = r() * W, y = HORIZON + 10 + r() * (H - HORIZON), l = 30 + r() * 90; c.beginPath(); c.moveTo(x, y); c.lineTo(x + l, y + (r() - .5) * 14); c.stroke(); }
  // wet sun reflection
  g = c.createLinearGradient(0, HORIZON, 0, H); g.addColorStop(0, `rgba(${P.glow},${night ? .16 : .55})`); g.addColorStop(1, `rgba(${P.glow},0)`);
  c.save(); c.beginPath(); c.moveTo(sx - 60, HORIZON); c.lineTo(sx + 60, HORIZON); c.lineTo(sx + 260, H); c.lineTo(sx - 260, H); c.closePath(); c.clip(); c.fillStyle = g; c.fillRect(0, HORIZON, W, H);
  c.fillStyle = `rgba(255,${200 + (r() * 40 | 0)},150,.35)`; for (let i = 0; i < 26; i++) { const y = HORIZON + 8 + Math.pow(i / 26, 1.5) * (H - HORIZON - 10), w = 30 + i * 8; c.fillRect(sx - w / 2 + (r() - .5) * 30, y, w * (.4 + r() * .6), 2 + i * .12); }
  c.restore();
  for (let i = 0; i < 4; i++) { const px = r() * W, py = HORIZON + 60 + r() * 200; const pg = c.createLinearGradient(0, py - 10, 0, py + 12); pg.addColorStop(0, `rgba(${P.glow},.35)`); pg.addColorStop(1, 'rgba(20,10,40,.5)'); c.fillStyle = pg; c.beginPath(); c.ellipse(px, py, 50 + r() * 60, 8 + r() * 6, 0, 0, 6.3); c.fill(); }
  // rooftop props: crates, cooler, vents
  const crate = (x, y, w, h, col) => {
    const cg = c.createLinearGradient(x, y, x + w, y + h); cg.addColorStop(0, shade(col, .2)); cg.addColorStop(1, shade(col, -.4)); c.fillStyle = cg; c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(15,8,20,.85)'; c.lineWidth = 3; c.strokeRect(x, y, w, h); c.lineWidth = 1.6; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(x, y + h * i / 4); c.lineTo(x + w, y + h * i / 4); c.stroke(); }
    c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + w - 4, y + h - 4); c.moveTo(x + w - 4, y + 4); c.lineTo(x + 4, y + h - 4); c.stroke();
    c.fillStyle = `rgba(${P.glow},.35)`; c.fillRect(x, y, w, 3);
  };
  crate(1090, HORIZON - 64, 66, 66, '#8a5a34'); crate(1160, HORIZON - 52, 54, 52, '#7a4c2c'); crate(1118, HORIZON - 118, 52, 52, '#94643a');
  crate(560, HORIZON - 40, 46, 40, '#6e4a30');
  c.fillStyle = '#1b1830'; c.fillRect(760, HORIZON - 44, 52, 44); c.strokeStyle = C.ink; c.lineWidth = 3; c.strokeRect(760, HORIZON - 44, 52, 44); c.strokeStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(766, HORIZON - 36 + i * 9); c.lineTo(806, HORIZON - 36 + i * 9); c.stroke(); }
  // window-light reflections on wet ground
  for (let i = 0; i < 26; i++) { const lx = r() * W, ly = HORIZON + 30 + r() * 230; const lg = c.createLinearGradient(0, ly, 0, ly + 30 + r() * 40); lg.addColorStop(0, `${P.win}66`); lg.addColorStop(1, `${P.win}00`); c.fillStyle = lg; c.fillRect(lx, ly, 3 + r() * 6, 30 + r() * 40); }
  // string lights
  if (night || kind === 'market') {
    const strand = (x1, y1, x2, y2, sag, n) => {
      c.strokeStyle = 'rgba(10,6,20,.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x1, y1); c.quadraticCurveTo((x1 + x2) / 2, Math.max(y1, y2) + sag, x2, y2); c.stroke();
      for (let i = 1; i < n; i++) {
        const t = i / n, bx = (1 - t) * (1 - t) * x1 + 2 * t * (1 - t) * ((x1 + x2) / 2) + t * t * x2, by = (1 - t) * (1 - t) * y1 + 2 * t * (1 - t) * (Math.max(y1, y2) + sag) + t * t * y2;
        const bg2 = c.createRadialGradient(bx, by + 6, 1, bx, by + 6, 24); bg2.addColorStop(0, 'rgba(255,200,100,.9)'); bg2.addColorStop(1, 'rgba(255,170,60,0)'); c.fillStyle = bg2; c.fillRect(bx - 24, by - 18, 48, 48);
        c.fillStyle = '#ffd98a'; c.beginPath(); c.ellipse(bx, by + 6, 4, 6, 0, 0, 6.3); c.fill(); c.strokeStyle = C.ink; c.lineWidth = 1.5; c.stroke();
      }
    };
    c.fillStyle = '#0c0814'; c.fillRect(34, 120, 12, 300); c.fillRect(380, 250, 8, 170);
    strand(40, 150, 384, 262, 70, 9); strand(40, 190, 384, 300, 60, 8); strand(1240, 170, 820, 250, 60, 8);
  }
  // dark foreground silhouettes (frame the scene)
  c.fillStyle = '#0a0612'; c.strokeStyle = 'rgba(255,170,90,.25)'; c.lineWidth = 3;
  c.beginPath(); c.moveTo(0, H); c.lineTo(0, 600); c.quadraticCurveTo(50, 590, 90, 640); c.quadraticCurveTo(120, 690, 190, 700); c.lineTo(230, H); c.closePath(); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(W, H); c.lineTo(W, 610); c.quadraticCurveTo(W - 60, 600, W - 100, 650); c.quadraticCurveTo(W - 140, 700, W - 210, H); c.closePath(); c.fill(); c.stroke();
  // lamp post
  if (P.lamp) {
    const lx = 66; c.strokeStyle = '#0c0814'; c.lineCap = 'round';
    c.lineWidth = 14; c.beginPath(); c.moveTo(lx, 470); c.lineTo(lx, 120); c.quadraticCurveTo(lx, 96, lx + 40, 98); c.lineTo(lx + 100, 104); c.stroke();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,170,90,.4)'; c.beginPath(); c.moveTo(lx - 4, 460); c.lineTo(lx - 4, 130); c.stroke();
    c.fillStyle = '#0c0814'; c.beginPath(); c.moveTo(lx + 82, 98); c.lineTo(lx + 124, 98); c.lineTo(lx + 120, 116); c.lineTo(lx + 86, 116); c.closePath(); c.fill();
    c.strokeStyle = '#0c0814'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(lx, 150); c.quadraticCurveTo(lx + 160, 120, 380, 168); c.stroke();
  }
  // vignette
  g = c.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 860); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,3,20,.6)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  g = c.createLinearGradient(0, H - 200, 0, H); g.addColorStop(0, 'rgba(8,3,20,0)'); g.addColorStop(1, 'rgba(8,3,20,.45)'); c.fillStyle = g; c.fillRect(0, H - 200, W, 200);
  p.lampOn = !!P.lamp; p.glow = P.glow;
  BG_CACHE[key] = p; return p;
}
function drawBackdrop(c, kind, seed, t) {
  const img = typeof SPR !== 'undefined' && SPR.bgs[kind];
  if (img) { c.drawImage(img, 0, 0, W, H); const g = c.createRadialGradient(W / 2, H / 2, 380, W / 2, H / 2, 900); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,3,20,.45)'); c.fillStyle = g; c.fillRect(0, 0, W, H); return; }
  const bg = makeBackdrop(kind, seed); c.drawImage(bg, 0, 0, W, H);
  c.save(); c.globalAlpha = .12; c.fillStyle = '#ffd9c0';
  for (let i = 0; i < 6; i++) { const x = ((i * 260 + t * 12 * (1 + i % 3 * .3)) % (W + 300)) - 150; c.beginPath(); c.ellipse(x, 70 + i * 30, 140, 14, 0, 0, 6.3); c.fill(); }
  c.restore();
  if (bg.lampOn) { const f = .85 + Math.sin(t * 7) * .04 + Math.sin(t * 23) * .03; const g = c.createRadialGradient(190, 110, 4, 190, 120, 200 * f); g.addColorStop(0, 'rgba(255,225,150,.95)'); g.addColorStop(.25, 'rgba(255,190,90,.45)'); g.addColorStop(1, 'rgba(255,170,60,0)'); c.fillStyle = g; c.fillRect(0, 0, 420, 360); }
}

// ---------- fire ----------
function drawFire(c, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s);
  const fl = .9 + Math.sin(t * 9) * .05 + Math.sin(t * 23) * .04;
  // ground glow
  let g = c.createRadialGradient(0, 0, 10, 0, 0, 260 * fl); g.addColorStop(0, 'rgba(255,170,60,.6)'); g.addColorStop(1, 'rgba(255,120,30,0)');
  c.save(); c.scale(1, .32); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 260 * fl, 0, 6.3); c.fill(); c.restore();
  // back rocks
  const rock = (rx, ry, rw, rh, a) => inkShape(c, ellPts(rx, ry, rw, rh, 9, a), '#8a8478', { seed: (rx * 3 + ry) | 0, lw: 3, amp: 2 });
  for (let i = 0; i < 6; i++) rock(-70 + i * 28, -8 - Math.sin(i * .5) * 6, 18, 12, i);
  // logs
  const log = (ang, len) => { c.save(); c.rotate(ang); inkShape(c, [[-len, -9], [len, -9], [len + 6, 0], [len, 9], [-len, 9], [-len - 6, 0]], '#6a4226', { seed: 5, lw: 3.5, amp: 1.5 }); c.fillStyle = 'rgba(255,120,30,.8)'; c.fillRect(-len * .5, -2, len, 3); c.restore(); };
  c.save(); c.translate(0, -6); log(-.25, 56); log(.28, 54); c.restore();
  // flames
  const layers = [{ n: 5, h: 150, w: 70, a: '#ff3a12', b: '#ff9a20', al: .95 }, { n: 4, h: 112, w: 52, a: '#ff8a1c', b: '#ffd23a', al: .95 }, { n: 3, h: 70, w: 32, a: '#ffd23a', b: '#fff6c8', al: .95 }];
  layers.forEach((L, li) => {
    for (let i = 0; i < L.n; i++) {
      const ox = (i - (L.n - 1) / 2) * L.w * .52, sway = Math.sin(t * (4.5 + i * .7) + i * 2 + li) * 9, hh = L.h * (.78 + .26 * Math.sin(t * (6 + i) + i * 1.9 + li * 2)) * (1 - Math.abs(i - (L.n - 1) / 2) * .13);
      const fg = c.createLinearGradient(0, 0, 0, -hh); fg.addColorStop(0, L.a); fg.addColorStop(1, L.b);
      c.beginPath(); c.moveTo(ox - L.w / 2, -4); c.bezierCurveTo(ox - L.w * .6 + sway * .3, -hh * .5, ox - L.w * .1 + sway, -hh * .75, ox + sway * 1.4, -hh);
      c.bezierCurveTo(ox + L.w * .15 + sway, -hh * .7, ox + L.w * .62 + sway * .3, -hh * .45, ox + L.w / 2, -4); c.closePath();
      c.fillStyle = fg; c.globalAlpha = L.al; c.fill(); c.globalAlpha = 1; if (li === 0) { c.lineWidth = 2.5; c.strokeStyle = 'rgba(80,10,5,.8)'; c.stroke(); }
    }
  });
  // front rocks
  for (let i = 0; i < 7; i++) rock(-84 + i * 28, 6 + Math.sin(i * 1.3) * 4, 20, 13, i * .4);
  c.restore();
}
function lightPool(c, x, y, r, a, t) {
  const f = 1 + Math.sin(t * 9) * .04 + Math.sin(t * 21) * .03;
  c.save(); c.globalCompositeOperation = 'screen';
  let g = c.createRadialGradient(x, y, 10, x, y, r * f); g.addColorStop(0, `rgba(255,150,50,${a})`); g.addColorStop(.5, `rgba(255,110,30,${a * .35})`); g.addColorStop(1, 'rgba(255,100,20,0)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.restore();
  c.save(); c.globalCompositeOperation = 'multiply'; g = c.createRadialGradient(x, y, r * .5, x, y, r * 2.2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(70,70,120,1)'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.restore();
}
// ---------- post: bloom ----------
let _bloom = null;
function bloomPass() {
  if (!_bloom) { _bloom = document.createElement('canvas'); _bloom.width = 320; _bloom.height = 180; }
  const b = _bloom.getContext('2d');
  b.filter = 'brightness(1.15) contrast(1.5) saturate(1.2)'; b.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, 320, 180); b.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .28; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(_bloom, 0, 0, 320, 180, 0, 0, cv.width, cv.height); ctx.restore();
}
