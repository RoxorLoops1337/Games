// Clawspire 2.0 trailer: particles, kinetic type, UI callouts and other juice.
// Particles are closed-form (position is a formula of age), so any t can be
// painted without simulating the frames before it.
'use strict';

function ballistic(x0, y0, vx, vy, a, k = 1.5, gy = 900) {
  const e = Math.exp(-k * a), f = (1 - e) / k;
  return [x0 + vx * f, y0 + (vy + gy / k) * f - gy * a / k];
}
// burst of n particles born at age 0
// o: {x,y,n,seed,speed:[a,b],angle:[a,b],life:[a,b],size:[a,b],gy,drag,cols,add,shape,spin,stagger,alpha}
function burst(g, age, o) {
  if (age < 0) return;
  const r = rng(o.seed || 1);
  const n = o.n || 20, add = o.add !== false;
  g.save();
  if (add) g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < n; i++) {
    const ang = lerp(o.angle ? o.angle[0] : 0, o.angle ? o.angle[1] : Math.PI * 2, r());
    const sp = lerp(o.speed ? o.speed[0] : 100, o.speed ? o.speed[1] : 500, Math.pow(r(), o.speedPow || 1));
    const life = lerp(o.life ? o.life[0] : .4, o.life ? o.life[1] : 1.2, r());
    const sz = lerp(o.size ? o.size[0] : 2, o.size ? o.size[1] : 6, r());
    const col = o.cols ? o.cols[Math.floor(r() * o.cols.length)] : C.gold;
    const delay = o.stagger ? r() * o.stagger : 0;
    const spinv = (r() - .5) * (o.spin || 0), ph = r() * 6.28;
    const jx = (r() - .5) * (o.jitter || 0), jy = (r() - .5) * (o.jitter || 0);
    const a = age - delay;
    if (a < 0 || a > life) continue;
    const u = a / life;
    const drag = o.drag != null ? o.drag : 1.5, gy = o.gy != null ? o.gy : 900;
    const [x, y] = ballistic(o.x + jx, o.y + jy, Math.cos(ang) * sp, Math.sin(ang) * sp, a, drag, gy);
    g.globalAlpha = (1 - u * u) * (o.alpha != null ? o.alpha : 1);
    g.fillStyle = col;
    const s = sz * (o.shrink === false ? 1 : (1 - u * .5));
    if (o.shape === 'spark') {
      const [px, py] = ballistic(o.x + jx, o.y + jy, Math.cos(ang) * sp, Math.sin(ang) * sp, Math.max(0, a - (o.streak || .035)), drag, gy);
      g.strokeStyle = col; g.lineWidth = s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    } else if (o.shape === 'dot') {
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    } else if (o.shape === 'confetti') {
      g.save(); g.translate(x, y); g.rotate(ph + spinv * a);
      g.scale(1, Math.cos(a * (6 + spinv) + ph));
      g.fillRect(-s, -s * .45, s * 2, s * .9); g.restore();
    } else if (o.shape === 'coin') {
      coin(g, x, y, s, a * (8 + spinv) + ph);
    } else if (o.shape === 'star') {
      star4(g, x, y, s * (1 + .3 * Math.sin(a * 20 + ph)), col);
    } else {
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  g.restore();
}
// rising motes, wrapping deterministically
function motes(g, t, o) {
  const r = rng(o.seed || 7);
  const [bx, by, bw, bh] = o.box || [0, 0, W, H];
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (o.n || 60); i++) {
    const x0 = r() * bw, sp = lerp(o.speed ? o.speed[0] : 30, o.speed ? o.speed[1] : 120, r()), ph = r();
    const sz = lerp(o.size ? o.size[0] : 1.5, o.size ? o.size[1] : 4, r()), col = o.cols ? o.cols[Math.floor(r() * o.cols.length)] : C.gold;
    const wob = r() * 6.28, wa = lerp(6, 30, r());
    const y = by + bh - ((ph * bh + t * sp) % bh);
    const x = bx + x0 + Math.sin(t * 1.3 + wob) * wa;
    const life = (y - by) / bh;
    g.globalAlpha = (o.alpha || 1) * Math.sin(Math.PI * clamp(life)) * (.5 + .5 * Math.sin(t * 7 + wob * 3));
    g.fillStyle = col;
    g.beginPath(); g.arc(x, y, sz, 0, 7); g.fill();
  }
  g.restore();
}
function star4(g, x, y, s, col) {
  g.save(); g.fillStyle = col || '#fff';
  g.beginPath(); g.moveTo(x, y - s); g.quadraticCurveTo(x, y, x + s, y); g.quadraticCurveTo(x, y, x, y + s);
  g.quadraticCurveTo(x, y, x - s, y); g.quadraticCurveTo(x, y, x, y - s); g.fill(); g.restore();
}
// a spinning gold coin (ang = spin phase), radius r
function coin(g, x, y, r, ang) {
  const sx = Math.cos(ang);
  g.save(); g.translate(x, y); g.scale(Math.max(.08, Math.abs(sx)), 1);
  g.fillStyle = sx >= 0 ? '#b86a10' : '#8a4a08'; g.beginPath(); g.arc(r * .12, 0, r, 0, 7); g.fill();
  const gr = g.createLinearGradient(0, -r, 0, r);
  gr.addColorStop(0, '#fff3b0'); gr.addColorStop(.45, '#ffc94d'); gr.addColorStop(1, '#d68a12');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
  g.strokeStyle = '#a85e0c'; g.lineWidth = r * .12; g.beginPath(); g.arc(0, 0, r * .74, 0, 7); g.stroke();
  if (sx > 0) star4(g, 0, 0, r * .45, '#fff1b8');
  g.restore();
}

// speed lines toward a vanishing point
function speedLines(g, t, cx, cy, a, o = {}) {
  if (a <= 0) return;
  const r = rng(o.seed || 11);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.fillStyle = o.col || 'rgba(255,255,255,.9)';
  const n = o.n || 70, inner0 = o.inner || 380;
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2;
    const inner = lerp(inner0, inner0 * 2, r()) + ((t * 3000 * (o.speed || 1) + r() * 900) % 700);
    const len = lerp(160, 520, r()), wd = lerp(1.5, 7, r());
    g.globalAlpha = a * lerp(.25, 1, r());
    g.save(); g.translate(cx, cy); g.rotate(ang);
    g.beginPath(); g.moveTo(inner, -wd / 2); g.lineTo(inner + len, 0); g.lineTo(inner, wd / 2); g.fill();
    g.restore();
  }
  g.restore();
}
// light shafts from a point (additive wedges)
function shafts(g, x, y, a, o = {}) {
  if (a <= 0) return;
  const r = rng(o.seed || 5);
  g.save(); g.globalCompositeOperation = 'lighter';
  const col = o.col || 'rgba(255,200,120,A)';
  for (let i = 0; i < (o.n || 9); i++) {
    const ang = (o.dir || Math.PI / 2) + (r() - .5) * (o.spread || 1.1) + Math.sin((o.t || 0) * .7 + i) * .03 + (o.spin || 0) * (o.t || 0);
    const len = lerp(o.len || 900, (o.len || 900) * 1.6, r()), wd = lerp(.02, .08, r()) * (o.width || 1);
    const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    gr.addColorStop(0, col.replace('A', a * lerp(.25, .6, r())));
    gr.addColorStop(1, col.replace('A', 0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang - wd) * len, y + Math.sin(ang - wd) * len);
    g.lineTo(x + Math.cos(ang + wd) * len, y + Math.sin(ang + wd) * len);
    g.fill();
  }
  g.restore();
}
function wash(g, col, a, mode = 'source-over') {
  if (a <= 0) return;
  g.save(); base(g); g.globalCompositeOperation = mode; g.globalAlpha = clamp(a); g.fillStyle = col; g.fillRect(0, 0, W, H); g.restore();
}
function vignetteDark(g, a = .6, inner = .35) {
  g.save(); base(g);
  const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * inner, W / 2, H / 2, Math.max(W, H) * .62);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(4,2,10,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
}
// lens flare: hot core, anamorphic streak, ghosts mirrored through the frame centre
function flare(g, x, y, a, o = {}) {
  if (a <= 0) return;
  const col = o.col || '#ffc94d';
  g.save(); g.globalCompositeOperation = 'lighter';
  glowEllipse(g, x, y, 260 * (o.size || 1), 260 * (o.size || 1), col, .55 * a);
  glowEllipse(g, x, y, 90, 90, '#ffffff', .9 * a);
  // the streak
  glowEllipse(g, x, y, W * .55 * (o.size || 1), 16, '#ffe6b0', .7 * a);
  glowEllipse(g, x, y, W * .3, 5, '#ffffff', .8 * a);
  // ghosts
  const dx = W / 2 - x, dy = H / 2 - y;
  [[.5, 40, '#ff4f9a'], [.8, 70, '#2ee6d6'], [1.25, 26, '#ffc94d'], [1.6, 110, '#8a4dff']].forEach(([k, r, c]) => {
    glowEllipse(g, x + dx * k * 2, y + dy * k * 2, r, r, c, .22 * a);
  });
  g.restore();
}
// warm light leak sweeping across the frame (u: 0..1 progress)
function lightLeak(g, u, a, o = {}) {
  if (a <= 0) return;
  const x = lerp(-W * .3, W * 1.3, u), y = H * (o.y != null ? o.y : .3);
  glowEllipse(g, x, y, W * .55, H * .8, o.col || '#ff7a3a', .55 * a);
  glowEllipse(g, x + W * .2, y + H * .3, W * .35, H * .5, o.col2 || '#ff4f9a', .45 * a);
}

// forked lightning
function lightning(g, x1, y1, x2, y2, seed, o = {}) {
  const r = rng(seed);
  const segs = [];
  const split = (ax, ay, bx, by, d, depth) => {
    if (depth <= 0) { segs.push([ax, ay, bx, by, o.lw || 3]); return; }
    const mx = (ax + bx) / 2 + (r() - .5) * d, my = (ay + by) / 2 + (r() - .5) * d * .35;
    split(ax, ay, mx, my, d * .55, depth - 1); split(mx, my, bx, by, d * .55, depth - 1);
    if (depth >= 3 && r() < (o.branch != null ? o.branch : .45)) {
      const len = Math.hypot(bx - ax, by - ay) * (.5 + r() * .5), ang = Math.atan2(by - ay, bx - ax) + (r() - .5) * 1.4;
      const bsplit = (ax2, ay2, bx2, by2, d2, dp) => {
        if (dp <= 0) { segs.push([ax2, ay2, bx2, by2, (o.lw || 3) * .5]); return; }
        const mx2 = (ax2 + bx2) / 2 + (r() - .5) * d2, my2 = (ay2 + by2) / 2 + (r() - .5) * d2 * .5;
        bsplit(ax2, ay2, mx2, my2, d2 * .55, dp - 1); bsplit(mx2, my2, bx2, by2, d2 * .55, dp - 1);
      };
      bsplit(mx, my, mx + Math.cos(ang) * len, my + Math.sin(ang) * len, d * .6, depth - 2);
    }
  };
  split(x1, y1, x2, y2, o.jit || Math.hypot(x2 - x1, y2 - y1) * .35, o.depth || 6);
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [wm, col, a] of [[5, o.glow || '#2ee6d6', .3], [1, o.col || '#e8fffd', 1], [.4, '#ffffff', 1]]) {
    g.strokeStyle = col; g.globalAlpha = (o.alpha != null ? o.alpha : 1) * a;
    for (const [ax, ay, bx, by, lw] of segs) { g.lineWidth = lw * wm; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
  }
  g.restore();
}

// ---------------------------------------------------------------- bats, moon, pumpkins
function bat(g, x, y, s, flap, col = '#0a0410') {
  const w = Math.sin(flap) * .8;                            // wing angle
  g.save(); g.translate(x, y); g.scale(s, s);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, -6); g.quadraticCurveTo(6, -8, 8, -2);
  // right wing
  g.lineTo(26, -14 - w * 22); g.quadraticCurveTo(32, -4 - w * 14, 44, -2 - w * 26);
  g.quadraticCurveTo(36, 6 - w * 10, 30, 10 - w * 6); g.quadraticCurveTo(22, 4, 18, 12); g.quadraticCurveTo(12, 6, 6, 8);
  g.lineTo(0, 12);
  g.lineTo(-6, 8); g.quadraticCurveTo(-12, 6, -18, 12); g.quadraticCurveTo(-22, 4, -30, 10 - w * 6);
  g.quadraticCurveTo(-36, 6 - w * 10, -44, -2 - w * 26); g.quadraticCurveTo(-32, -4 - w * 14, -26, -14 - w * 22);
  g.lineTo(-8, -2); g.quadraticCurveTo(-6, -8, 0, -6);
  g.fill();
  // ears + eyes
  g.beginPath(); g.moveTo(-5, -5); g.lineTo(-7, -13); g.lineTo(-2, -7); g.moveTo(5, -5); g.lineTo(7, -13); g.lineTo(2, -7); g.fill();
  g.fillStyle = '#ffb347'; g.fillRect(-4, -3, 2.5, 2); g.fillRect(1.5, -3, 2.5, 2);
  g.restore();
}
// a swarm crossing the frame: u (0..1) progress, dir +1 left->right. Dense enough to wipe.
function batSwarm(g, lt, u, o = {}) {
  const r = rng(o.seed || 66);
  const n = o.n || 160;
  for (let i = 0; i < n; i++) {
    const lane = r(), depth = lerp(.4, 1.6, Math.pow(r(), 1.5)), lag = r() * .5, ph = r() * 6.28;
    const k = (u * 1.5 - lag);
    if (k < -.1 || k > 1.2) continue;
    const x = lerp(-W * .25, W * 1.25, k) + Math.sin(ph + lt * 3) * 40;
    const y = lane * H * 1.1 - H * .05 + Math.sin(k * 6 + ph) * 60 * depth - (o.rise || 0) * k * H;
    bat(g, (o.dir || 1) > 0 ? x : W - x, y, 2.2 * depth * (o.size || 1), lt * 22 * (1.2 - depth * .2) + ph, depth > 1.2 ? '#050208' : '#12081c');
  }
}
function moon(g, x, y, r, a = 1) {
  const m = baked('moon', 512, 512, c => {
    const gr = c.createRadialGradient(220, 200, 20, 256, 256, 250);
    gr.addColorStop(0, '#fff6dc'); gr.addColorStop(.7, '#f1d9a6'); gr.addColorStop(1, '#d9b47a');
    c.fillStyle = gr; c.beginPath(); c.arc(256, 256, 250, 0, 7); c.fill();
    const rr = rng(5);
    for (let i = 0; i < 14; i++) {
      const cx = 100 + rr() * 300, cy = 100 + rr() * 300, cr = 12 + rr() * 40;
      if (Math.hypot(cx - 256, cy - 256) + cr > 240) continue;
      c.fillStyle = 'rgba(190,150,100,.35)'; c.beginPath(); c.arc(cx, cy, cr, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,245,220,.25)'; c.beginPath(); c.arc(cx - cr * .2, cy - cr * .2, cr * .6, 0, 7); c.fill();
    }
  });
  g.save(); g.globalAlpha *= a;
  glowEllipse(g, x, y, r * 2.6, r * 2.6, '#ffcf8a', .3);
  g.imageSmoothingEnabled = true; g.drawImage(m, x - r, y - r, r * 2, r * 2);
  g.restore();
}
function pumpkin(g, x, y, s, lit = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  glowEllipse(g, 0, 0, 90, 80, '#ff8a1f', .35 * lit);
  for (const [dx, w, c] of [[-26, 30, '#c94f0a'], [26, 30, '#c94f0a'], [-12, 30, '#e8650f'], [12, 30, '#e8650f'], [0, 26, '#ff7a1a']]) {
    g.fillStyle = c; g.beginPath(); g.ellipse(dx, 0, w, 40, 0, 0, 7); g.fill();
  }
  g.fillStyle = '#3a6a1a'; g.fillRect(-5, -52, 10, 16);
  g.fillStyle = `rgba(255,${200 + 40 * lit | 0},90,${.6 + .4 * lit})`;
  g.beginPath(); g.moveTo(-28, -8); g.lineTo(-12, -8); g.lineTo(-20, -22); g.fill();
  g.beginPath(); g.moveTo(28, -8); g.lineTo(12, -8); g.lineTo(20, -22); g.fill();
  g.beginPath(); g.moveTo(-32, 8); g.lineTo(32, 8); g.lineTo(22, 24); g.lineTo(10, 16); g.lineTo(0, 26); g.lineTo(-10, 16); g.lineTo(-22, 24); g.closePath(); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- type
const FILL = {
  candy: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff2f8'); gr.addColorStop(.42, '#ff9ccb'); gr.addColorStop(.5, '#ff4f9a'); gr.addColorStop(1, '#c0136a'); return gr; },
  gold: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fffbe0'); gr.addColorStop(.45, '#ffd85e'); gr.addColorStop(.55, '#f0a51e'); gr.addColorStop(1, '#a8600c'); return gr; },
  teal: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#f0fffd'); gr.addColorStop(.45, '#8bfff2'); gr.addColorStop(.55, '#2ee6d6'); gr.addColorStop(1, '#0e8a83'); return gr; },
  white: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.55, '#f4ecff'); gr.addColorStop(1, '#c9b8f0'); return gr; },
  orange: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff3c4'); gr.addColorStop(.4, '#ffb347'); gr.addColorStop(.6, '#ff7a12'); gr.addColorStop(1, '#a83a00'); return gr; },
  violet: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#f6eaff'); gr.addColorStop(.5, '#b98bff'); gr.addColorStop(1, '#5a1ea0'); return gr; },
};
// text with a candy 3D extrusion, thick ink outline and a gradient face
// o: {font, fill, outline, outlineW, depth, depthCol, align, tracking, glow}
function candyText(g, txt, x, y, o = {}) {
  g.save();
  g.font = o.font; g.textAlign = o.align || 'center'; g.textBaseline = 'alphabetic';
  if (o.tracking) g.letterSpacing = o.tracking + 'px';
  const m = g.measureText(txt);
  const asc = m.actualBoundingBoxAscent, dsc = m.actualBoundingBoxDescent;
  const ow = o.outlineW != null ? o.outlineW : asc * .11;
  g.lineJoin = 'round'; g.miterLimit = 2;
  const depth = o.depth != null ? o.depth : asc * .1;
  if (o.glow) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= .35; g.lineWidth = ow * 1.7; g.strokeStyle = o.glow;
    g.strokeText(txt, x, y + depth * .5); g.restore();
  }
  // extrusion: stacked outline + body copies stepping down
  const steps = Math.max(1, Math.round(depth / Math.max(1.5, asc * .02)));
  g.lineWidth = ow; g.strokeStyle = o.outline || '#1a0a2a'; g.fillStyle = o.outline || '#1a0a2a';
  for (let i = steps; i >= 1; i--) { const dy = depth * i / steps; g.strokeText(txt, x, y + dy); g.fillText(txt, x, y + dy); }
  g.strokeText(txt, x, y);
  if (depth > 0) {
    g.fillStyle = o.depthCol || '#7a0c46';
    for (let i = steps; i >= 1; i--) g.fillText(txt, x, y + depth * i / steps * .8);
  }
  g.fillStyle = typeof o.fill === 'function' ? o.fill(g, y - asc, y + dsc) : (o.fill || '#fff');
  g.fillText(txt, x, y);
  // a gloss line across the top third
  if (o.gloss !== false) {
    g.save();
    g.globalCompositeOperation = 'source-atop';
    g.restore();
  }
  g.restore();
  return m;
}
function measure(txt, font, tracking = 0) {
  const g = _mctx; g.font = font; g.letterSpacing = tracking + 'px';
  const m = g.measureText(txt);
  return { w: m.width, asc: m.actualBoundingBoxAscent, dsc: m.actualBoundingBoxDescent };
}
const _mctx = document.createElement('canvas').getContext('2d');
// fit a size so txt spans at most maxW
function fit(txt, fontFn, size, maxW, tracking = 0) {
  const w = measure(txt, fontFn(size), tracking).w;
  return w > maxW ? size * maxW / w : size;
}

// the word slam: comes in from scale `from` with motion, overshoots and settles;
// lt = seconds since the slam. o: candyText opts + {from, in, dur, out, rot, exitTo, dx, dy}
function slam(g, txt, x, y, lt, o = {}) {
  if (lt < 0) return 0;
  const dur = o.dur != null ? o.dur : 1.2, out = o.out || .1;
  if (lt > dur + out) return 0;
  let s = 1, a = 1, ox = 0, oy = 0;
  const inT = o.in || .1;
  if (lt < inT) { const u = E.outCubic(lt / inT); s = lerp(o.from || 2.6, 1, u); a = clamp(lt / inT * 2); ox = (1 - u) * (o.dx || 0); oy = (1 - u) * (o.dy || 0); }
  else s = 1 + (o.settle != null ? o.settle : .07) * Math.exp(-(lt - inT) * 8) * Math.cos((lt - inT) * 28) + (o.drift || .02) * (lt - inT);
  if (lt > dur) {
    const u = E.inCubic((lt - dur) / out);
    if (o.exitTo === 'up') oy -= u * 200; else if (o.exitTo === 'left') ox -= u * W * .6; else if (o.exitTo === 'right') ox += u * W * .6;
    else s *= 1 + u * .6;
    a *= 1 - u;
  }
  // never wider than the frame (the vertical cut reuses the same words)
  const fw = measure(txt, o.font, o.tracking || 0).w, fitK = Math.min(1, (W - 90) / Math.max(1, fw));
  g.save();
  g.translate(x + ox, y + oy); g.scale(s * fitK, s * fitK);
  if (o.rot) g.rotate(o.rot * (lt < inT ? 1 : Math.exp(-(lt - inT) * 6) * .3 + .7));
  g.globalAlpha *= a;
  candyText(g, txt, 0, 0, o);
  g.restore();
  return s;
}
// letters fly in one by one with punch
function stagger(g, txt, x, y, lt, o = {}) {
  g.save();
  g.font = o.font; g.textBaseline = 'alphabetic';
  if (o.tracking) g.letterSpacing = o.tracking + 'px';
  const total0 = g.measureText(txt).width, fitK = Math.min(1, (W - 90) / Math.max(1, total0));
  g.translate(x, y); g.scale(fitK, fitK); g.translate(-x, -y);
  const total = total0;
  let cx = x - (o.align === 'left' ? 0 : total / 2);
  const per = o.per || .03, inT = o.in || .14;
  const outU = o.dur != null ? clamp((lt - o.dur) / .12) : 0;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    g.font = o.font; g.letterSpacing = '0px';
    const w = g.measureText(ch).width + (o.tracking || 0);
    const u = clamp((lt - i * per) / inT);
    if (u > 0 && ch !== ' ') {
      const e = E.outBack(u, 2.4);
      g.save();
      g.translate(cx + w / 2 - (o.tracking || 0) / 2, y + (1 - e) * (o.dy != null ? o.dy : 80) - outU * 60);
      const sc = lerp(o.from || 1.9, 1, E.outCubic(u)) * (1 + outU * .2);
      g.scale(sc, sc); if (o.spin) g.rotate((1 - E.outCubic(u)) * o.spin * (i % 2 ? 1 : -1));
      g.globalAlpha *= clamp(u * 2) * (1 - outU);
      candyText(g, ch, 0, 0, Object.assign({}, o, { align: 'center', tracking: 0 }));
      g.restore();
    }
    cx += w;
  }
  g.restore();
}
// a pill label (UI chips, the CTA): o {font, fg, bg, border, padX, h}
function pill(g, txt, x, y, o = {}) {
  g.save();
  g.font = o.font; g.textAlign = 'center'; g.textBaseline = 'middle';
  if (o.tracking) g.letterSpacing = o.tracking + 'px';
  const m = g.measureText(txt);
  const ph = o.h || m.actualBoundingBoxAscent * 2.1, pw = m.width + (o.padX || ph * .9);
  if (o.glow) glowEllipse(g, x, y, pw * .8, ph * 1.4, o.glow, .45);
  g.fillStyle = o.bg || C.ink; g.beginPath(); g.roundRect(x - pw / 2, y - ph / 2, pw, ph, ph / 2); g.fill();
  if (o.border) { g.lineWidth = o.borderW || 5; g.strokeStyle = o.border; g.stroke(); }
  g.fillStyle = o.fg || '#fff'; g.fillText(txt, x + (o.tracking || 0) / 2, y + (o.dy || 2));
  g.restore();
  return { w: pw, h: ph };
}

// ---------------------------------------------------------------- UI callouts
// an animated callout aimed at the game's own UI: a pulsing ring + brackets at
// the target (tx, ty), a line that draws out to (lx, ly), a label that slides out.
// o: {col, side: 'left'|'right', r (target ring), box: [w, h] brackets, dur, size}
function callout(g, lt, tx, ty, lx, ly, label, o = {}) {
  if (lt < 0) return;
  const dur = o.dur || 1.4;
  if (lt > dur + .2) return;
  const out = clamp((lt - dur) / .2);
  const col = o.col || C.teal;
  g.save();
  g.globalAlpha *= 1 - out;
  // target: brackets or ring
  const tu = E.outBack(clamp(lt / .2), 2);
  if (o.box) {
    const [bw, bh] = o.box, s = lerp(1.5, 1, tu), cl = Math.min(bw, bh) * .28;
    g.strokeStyle = col; g.lineWidth = 7; g.lineCap = 'round';
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const cx = tx + sx * bw / 2 * s, cy = ty + sy * bh / 2 * s;
      g.beginPath(); g.moveTo(cx - sx * cl, cy); g.lineTo(cx, cy); g.lineTo(cx, cy - sy * cl); g.stroke();
    }
  } else {
    const rr = (o.r || 46) * lerp(2, 1, tu);
    g.strokeStyle = col; g.lineWidth = 7;
    g.beginPath(); g.arc(tx, ty, rr, 0, 7); g.stroke();
    const pu = (lt * 1.6) % 1;
    g.globalAlpha *= 1 - pu; g.lineWidth = 4; g.beginPath(); g.arc(tx, ty, rr * (1 + pu * .8), 0, 7); g.stroke();
    g.globalAlpha /= Math.max(.001, 1 - pu);
  }
  g.fillStyle = col; g.beginPath(); g.arc(tx, ty, 9, 0, 7); g.fill();
  // leader: target -> elbow -> label
  const lu = E.outCubic(clamp((lt - .08) / .22));
  const ex = lx, ey = ly;
  const sx0 = tx + (ex - tx) * 0, sy0 = ty;
  const elbowX = o.elbow != null ? o.elbow : tx + (ex - tx) * .35, elbowY = ey;
  const pts = [[sx0, sy0], [elbowX, elbowY], [ex, ey]];
  const seg1 = Math.hypot(elbowX - sx0, elbowY - sy0), seg2 = Math.hypot(ex - elbowX, ey - elbowY), tot = seg1 + seg2;
  let d = lu * tot;
  g.strokeStyle = col; g.lineWidth = 6; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  if (d <= seg1) { g.lineTo(lerp(sx0, elbowX, d / seg1), lerp(sy0, elbowY, d / seg1)); }
  else { g.lineTo(elbowX, elbowY); g.lineTo(lerp(elbowX, ex, (d - seg1) / seg2), ey); }
  g.stroke();
  // label
  const la = clamp((lt - .22) / .16);
  if (la > 0 && label) {
    const size = o.size || L(84, 112);
    const font = F.disp(size * .72);
    g.font = font; g.letterSpacing = '2px';
    const tw = g.measureText(label).width;
    const padX = 34, bh = size * 1.25, bw = tw + padX * 2;
    let right = ex >= tx;
    if (right && ex + bw > W - 30) right = false;            // keep the label inside the frame
    else if (!right && ex - bw < 30) right = true;
    const bx = clamp(right ? ex : ex - bw, 30, Math.max(30, W - 30 - bw));
    const slide = (1 - E.outCubic(la)) * (right ? -40 : 40);
    g.save();
    g.beginPath(); g.rect(bx - 4, ey - bh, bw + 8, bh * 2); g.clip();
    g.translate(slide, 0);
    g.fillStyle = 'rgba(11,6,24,.92)'; g.beginPath(); g.roundRect(bx, ey - bh / 2, bw, bh, 14); g.fill();
    g.lineWidth = 5; g.strokeStyle = col; g.stroke();
    g.fillStyle = col; g.fillRect(right ? bx : bx + bw - 12, ey - bh / 2 + 10, 12, bh - 20);
    g.fillStyle = '#ffffff'; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.fillText(label, bx + padX, ey + size * .06);
    g.restore();
  }
  g.restore();
}
// a number ticking up: from -> to over dur (ease out), with a pop on every change
function counter(g, lt, x, y, from, to, dur, o = {}) {
  if (lt < 0) return;
  const u = E.outCubic(clamp(lt / dur));
  const v = Math.round(lerp(from, to, u));
  const step = (lerp(from, to, u) % 1);
  const pop = 1 + .12 * (1 - step) * (u < 1 ? 1 : Math.exp(-(lt - dur) * 10));
  g.save(); g.translate(x, y); g.scale(pop, pop);
  candyText(g, (o.prefix || '') + v + (o.suffix || ''), 0, 0, o);
  g.restore();
}
// a burst ring (shock ring drawn in 2D)
function ring(g, x, y, age, o = {}) {
  if (age < 0 || age > (o.life || .5)) return;
  const u = age / (o.life || .5);
  g.save(); g.globalCompositeOperation = 'lighter';
  g.strokeStyle = o.col || '#fff'; g.globalAlpha = (1 - u) * (o.alpha || 1);
  g.lineWidth = (o.lw || 14) * (1 - u) + 1;
  g.beginPath(); g.arc(x, y, lerp(o.r0 || 20, o.r1 || 400, E.outCubic(u)), 0, 7); g.stroke();
  g.restore();
}
