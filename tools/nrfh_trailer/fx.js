// No Room For Heroes trailer: particles, kinetic type and other juice.
// Particles are closed-form (position is a formula of age), so any t can be
// painted without simulating the frames before it.
'use strict';

// ballistic with linear drag k and gravity gy: position after age a
function ballistic(x0, y0, vx, vy, a, k = 1.5, gy = 900) {
  const e = Math.exp(-k * a), f = (1 - e) / k;
  return [x0 + vx * f, y0 + (vy + gy / k) * f - gy * a / k];
}

// burst of n particles born at age 0; o: {x,y, n, seed, speed:[a,b], angle:[a,b] (rad), life:[a,b], size:[a,b],
//   gy, drag, cols:[...], add (bool), shape:'sq'|'dot'|'spark'|'shard', spin, fadeIn}
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
    const col = o.cols ? o.cols[Math.floor(r() * o.cols.length)] : '#ffb050';
    const delay = o.stagger ? r() * o.stagger : 0;
    const spinv = (r() - .5) * (o.spin || 0);
    const jx = (r() - .5) * (o.jitter || 0), jy = (r() - .5) * (o.jitter || 0);
    const a = age - delay;
    if (a < 0 || a > life) continue;
    const u = a / life;
    const [x, y] = ballistic(o.x + jx, o.y + jy, Math.cos(ang) * sp, Math.sin(ang) * sp, a, o.drag != null ? o.drag : 1.5, o.gy != null ? o.gy : 900);
    const alpha = (1 - u) * (o.fadeIn ? clamp(a / o.fadeIn) : 1) * (o.alpha != null ? o.alpha : 1);
    g.globalAlpha = alpha;
    g.fillStyle = col;
    const s = sz * (o.shrink === false ? 1 : (1 - u * .6));
    if (o.shape === 'spark') {
      // streak along velocity: draw from previous position
      const [px, py] = ballistic(o.x + jx, o.y + jy, Math.cos(ang) * sp, Math.sin(ang) * sp, Math.max(0, a - (o.streak || .035)), o.drag != null ? o.drag : 1.5, o.gy != null ? o.gy : 900);
      g.strokeStyle = col; g.lineWidth = s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
    } else if (o.shape === 'dot') {
      g.beginPath(); g.arc(x, y, s, 0, 7); g.fill();
    } else if (o.shape === 'shard') {
      g.save(); g.translate(x, y); g.rotate(spinv * a + ang);
      g.beginPath(); g.moveTo(-s, -s * .4); g.lineTo(s * .9, -s * .7); g.lineTo(s * .6, s * .8); g.closePath(); g.fill();
      g.restore();
    } else {
      g.fillRect(x - s / 2, y - s / 2, s, s);
    }
  }
  g.restore();
}

// ambient field: embers / motes rising, wrapping deterministically. box [x,y,w,h]
function embers(g, t, o) {
  const r = rng(o.seed || 7);
  const [bx, by, bw, bh] = o.box || [0, 0, W, H];
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (o.n || 60); i++) {
    const x0 = r() * bw, sp = lerp(o.speed ? o.speed[0] : 30, o.speed ? o.speed[1] : 120, r()), ph = r();
    const sz = lerp(o.size ? o.size[0] : 1.5, o.size ? o.size[1] : 4, r()), col = o.cols ? o.cols[Math.floor(r() * o.cols.length)] : '#ffb066';
    const wob = r() * 6.28, wa = lerp(6, 30, r());
    const y = by + bh - ((ph * bh + t * sp) % bh);
    const x = bx + x0 + Math.sin(t * 1.3 + wob) * wa + (o.wind || 0) * t % bw;
    const life = (y - by) / bh;
    g.globalAlpha = (o.alpha || 1) * Math.sin(Math.PI * clamp(life)) * (.5 + .5 * Math.sin(t * 7 + wob * 3));
    g.fillStyle = col;
    g.fillRect(x, y, sz, sz);
    if (o.glow) { g.globalAlpha *= .25; g.beginPath(); g.arc(x + sz / 2, y + sz / 2, sz * 3, 0, 7); g.fill(); }
  }
  g.restore();
}

// rain streaks in screen space
function rain(g, t, o = {}) {
  const r = rng(o.seed || 3);
  g.save();
  g.strokeStyle = o.col || 'rgba(170,160,255,.35)'; g.lineWidth = o.lw || 1.6;
  const ang = o.angle || .22, len = o.len || 60, sp = o.speed || 2400;
  g.beginPath();
  for (let i = 0; i < (o.n || 160); i++) {
    const x0 = r() * (W + 400) - 200, ph = r();
    const y = ((ph * (H + len * 2) + t * sp * (.8 + r() * .4)) % (H + len * 2)) - len;
    const x = x0 - y * Math.tan(ang);
    g.moveTo(x, y); g.lineTo(x - Math.sin(ang) * len, y - Math.cos(ang) * len);
  }
  g.globalAlpha = o.alpha != null ? o.alpha : 1;
  g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- type
// draw text with a thick dark outline + inner fill; fill may be a gradient builder (y0,y1)=>style
function strokeText(g, txt, x, y, o = {}) {
  g.save();
  g.font = o.font; g.textAlign = o.align || 'center'; g.textBaseline = 'alphabetic';
  if (o.tracking) g.letterSpacing = o.tracking + 'px';
  const m = g.measureText(txt);
  const asc = m.actualBoundingBoxAscent, dsc = m.actualBoundingBoxDescent;
  if (o.shadow) { g.fillStyle = o.shadow; g.fillText(txt, x + (o.shadowX || 0), y + (o.shadowY || 10)); }
  if (o.outline) { g.lineJoin = 'round'; g.lineWidth = o.outlineW || 12; g.strokeStyle = o.outline; g.strokeText(txt, x, y); }
  g.fillStyle = typeof o.fill === 'function' ? o.fill(g, y - asc, y + dsc) : (o.fill || '#fff');
  g.fillText(txt, x, y);
  if (o.inner) { g.lineWidth = o.innerW || 2; g.strokeStyle = o.inner; g.strokeText(txt, x, y); }
  g.restore();
  return m;
}
const FILL = {
  gold: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(.45, '#ffd34d'); gr.addColorStop(.55, '#e39a1f'); gr.addColorStop(1, '#8a4a0c'); return gr; },
  blood: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffb3a8'); gr.addColorStop(.35, '#ff3b2f'); gr.addColorStop(.7, '#b3120e'); gr.addColorStop(1, '#5c0606'); return gr; },
  steel: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.48, '#d8d4e6'); gr.addColorStop(.52, '#8f89a8'); gr.addColorStop(1, '#4b4566'); return gr; },
  arcane: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#f3e2ff'); gr.addColorStop(.5, '#c07bff'); gr.addColorStop(1, '#5a1ea0'); return gr; },
  ice: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, '#9adfff'); gr.addColorStop(1, '#2a74c9'); return gr; },
  fire: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff3b0'); gr.addColorStop(.4, '#ffb03a'); gr.addColorStop(.75, '#ff4a12'); gr.addColorStop(1, '#8a1004'); return gr; },
  volt: (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#ffffff'); gr.addColorStop(.5, '#fff34d'); gr.addColorStop(1, '#c79a00'); return gr; },
};

// word slam: scales in from `from` with a spring, holds, then exits. lt = seconds since the slam.
// returns the current scale (for syncing shakes)
function slam(g, txt, x, y, lt, o = {}) {
  if (lt < 0) return 0;
  const dur = o.dur || 1.2, out = o.out || .12;
  if (lt > dur + out) return 0;
  let s = 1, a = 1;
  const inT = o.in || .09;
  if (lt < inT) { const u = E.outCubic(lt / inT); s = lerp(o.from || 3.2, 1, u); a = u; }
  else s = 1 + (o.settle != null ? o.settle : .06) * Math.exp(-(lt - inT) * 7) * Math.cos((lt - inT) * 26) + (o.drift || 0) * (lt - inT);
  if (lt > dur) { const u = (lt - dur) / out; a *= 1 - u; s *= 1 + u * (o.exitGrow || .5); }
  g.save();
  g.translate(x, y); g.scale(s, s); if (o.rot) g.rotate(o.rot * Math.exp(-lt * 8));
  g.globalAlpha *= a;
  if (o.glowCol) { g.save(); g.shadowColor = o.glowCol; g.shadowBlur = o.glowBlur || 40; strokeText(g, txt, 0, 0, Object.assign({}, o, { outline: null, shadow: null })); g.restore(); }
  strokeText(g, txt, 0, 0, o);
  g.restore();
  return s;
}

// letters that fly in one by one (typewriter with punch)
function stagger(g, txt, x, y, lt, o = {}) {
  g.save();
  g.font = o.font; g.textBaseline = 'alphabetic';
  if (o.tracking) g.letterSpacing = o.tracking + 'px';
  const total = g.measureText(txt).width;
  let cx = x - (o.align === 'left' ? 0 : total / 2);
  const per = o.per || .025, inT = o.in || .14;
  for (let i = 0; i < txt.length; i++) {
    const ch = txt[i];
    const w = g.measureText(ch).width + (o.tracking || 0);
    const u = clamp((lt - i * per) / inT);
    if (u > 0 && ch !== ' ') {
      const e = E.outBack(u, 2.2);
      g.save();
      g.translate(cx + w / 2, y + (1 - e) * (o.dy != null ? o.dy : 60));
      g.scale(lerp(o.from || 1.8, 1, E.outCubic(u)), lerp(o.from || 1.8, 1, E.outCubic(u)));
      g.globalAlpha *= clamp(u * 2);
      strokeText(g, ch, 0, 0, Object.assign({}, o, { align: 'center', tracking: 0 }));
      g.restore();
    }
    cx += w;
  }
  g.restore();
}

// game-style damage floater (Press Start 2P, rises and pops)
function floater(g, txt, x, y, age, col = '#ff5a3a', size = 34, rise = size * 2.4) {
  if (age < 0 || age > 1.1) return;
  const u = age / 1.1;
  const pop = age < .08 ? lerp(2.2, 1, age / .08) : 1 + .15 * Math.exp(-age * 10);
  g.save();
  g.translate(x, y - E.outCubic(u) * rise);
  g.scale(pop, pop);
  g.globalAlpha *= 1 - Math.pow(u, 3);
  strokeText(g, txt, 0, 0, { font: F.pix(size), fill: col, outline: '#140a1e', outlineW: size * .32 });
  g.restore();
}

// speed lines radiating to a vanishing point
function speedLines(g, t, cx, cy, a, o = {}) {
  if (a <= 0) return;
  const r = rng(o.seed || 11);
  g.save(); g.globalCompositeOperation = o.add ? 'lighter' : 'source-over';
  g.fillStyle = o.col || 'rgba(255,255,255,.9)';
  const n = o.n || 70;
  for (let i = 0; i < n; i++) {
    const ang = r() * Math.PI * 2 + t * (o.spin || 0);
    const inner = lerp(o.inner || 380, (o.inner || 380) * 2, r()) + ((t * 3000 * (o.speed || 1) + r() * 900) % 700);
    const len = lerp(160, 520, r()), wd = lerp(1.5, 7, r());
    g.globalAlpha = a * lerp(.25, 1, r());
    g.save(); g.translate(cx, cy); g.rotate(ang);
    g.beginPath(); g.moveTo(inner, -wd / 2); g.lineTo(inner + len, 0); g.lineTo(inner, wd / 2); g.fill();
    g.restore();
  }
  g.restore();
}

// light shafts from a point (world or screen), additive wedges
function shafts(g, x, y, a, o = {}) {
  if (a <= 0) return;
  const r = rng(o.seed || 5);
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (o.n || 9); i++) {
    const ang = (o.dir || Math.PI / 2) + (r() - .5) * (o.spread || 1.1) + Math.sin((o.t || 0) * .7 + i) * .03;
    const len = lerp(o.len || 900, (o.len || 900) * 1.6, r()), wd = lerp(.02, .08, r());
    const gr = g.createLinearGradient(x, y, x + Math.cos(ang) * len, y + Math.sin(ang) * len);
    gr.addColorStop(0, (o.col || 'rgba(255,200,120,A)').replace('A', a * lerp(.25, .6, r())));
    gr.addColorStop(1, (o.col || 'rgba(255,200,120,A)').replace('A', 0));
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(x, y);
    g.lineTo(x + Math.cos(ang - wd) * len, y + Math.sin(ang - wd) * len);
    g.lineTo(x + Math.cos(ang + wd) * len, y + Math.sin(ang + wd) * len);
    g.fill();
  }
  g.restore();
}

// full-frame colour wash
function wash(g, col, a, mode = 'source-over') {
  if (a <= 0) return;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = mode; g.globalAlpha = clamp(a); g.fillStyle = col; g.fillRect(0, 0, W, H); g.restore();
}
function vignetteDark(g, a = .6, inner = .35) {
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  const gr = g.createRadialGradient(W / 2, H / 2, H * inner, W / 2, H / 2, H * 1.05);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H); g.restore();
}

// ---------------------------------------------------------------- caption tiers
// Tier A: story lines. Cinzel, steel white, dark outline, upper third, centre-safe
// (auto-fits inside 1040 px so 1:1 / 9:16 crops keep the words).
function fitFont(g, txt, size, maxW, fontFn = F.epic) {
  g.save(); g.font = fontFn(size); g.letterSpacing = '4px'; const w = g.measureText(txt).width; g.restore();
  return w > maxW ? size * maxW / w : size;
}
function tierA(g, txt, y, lt, o = {}) {
  if (lt < 0) return;
  if (o.until != null && lt > o.until + .1) return;
  const size = fitFont(g, txt, o.size || 92, o.maxW || 1040, o.fontFn || F.epic);
  const inT = .13;
  const u = clamp(lt / inT);
  const s = lt < inT ? lerp(o.from || 1.35, 1, E.outCubic(u)) : 1 + .012 * (lt - inT);
  const out = o.until != null ? clamp((lt - o.until) / .1) : 0;
  g.save();
  g.translate(W / 2 + (o.x || 0), y);
  g.scale(s * (1 + out * .15), s * (1 + out * .15));
  g.globalAlpha *= E.outCubic(u) * (1 - out);
  // soft dark plate behind the words so they read over bloom (baked once per line)
  g.save(); g.font = (o.fontFn || F.epic)(size); g.letterSpacing = '4px';
  const w = g.measureText(txt).width; g.restore();
  const pw = w + 40, ph = size * 1.05, pad = 70;
  const plate = baked('plate:' + Math.round(pw) + 'x' + Math.round(ph), pw + pad * 2, ph + pad * 2, x => {
    x.filter = 'blur(26px)'; x.fillStyle = '#05020a'; x.fillRect(pad, pad, pw, ph);
  });
  g.save(); g.globalAlpha *= .55; g.drawImage(plate, -w / 2 - 20 - pad, -size * .8 - pad); g.restore();
  strokeText(g, txt, 0, 0, { font: (o.fontFn || F.epic)(size), fill: o.fill || FILL.steel, outline: '#0a0510', outlineW: size * .16, tracking: 4,
    shadow: 'rgba(0,0,0,.6)', shadowY: size * .08 });
  g.restore();
}
// Tier B: hit callouts. Pixel font, element colour, tilted, springs in beside the hit.
function tierB(g, txt, x, y, lt, col, o = {}) {
  if (lt < 0 || lt > (o.dur || .9) + .1) return;
  const size = o.size || 72;
  const inT = .07;
  let s;
  if (lt < inT) s = lerp(2.6, 1, E.outCubic(lt / inT));
  else s = 1 + .14 * Math.exp(-(lt - inT) * 9) * Math.cos((lt - inT) * 30);
  const out = clamp((lt - (o.dur || .9)) / .1);
  g.save();
  g.translate(x, y); g.rotate(o.rot != null ? o.rot : -.09); g.scale(s * (1 + out * .4), s * (1 + out * .4));
  g.globalAlpha *= clamp(lt / .03) * (1 - out);
  g.save(); g.shadowColor = o.glow || col; g.shadowBlur = 30;
  strokeText(g, txt, 0, 0, { font: F.pix(size), fill: col, outline: '#12081c', outlineW: size * .34 });
  g.restore();
  strokeText(g, txt, 0, 0, { font: F.pix(size), fill: o.fill || col, outline: null });
  g.restore();
}

// forked lightning: midpoint displacement with side branches (screen or world space)
function lightning(g, x1, y1, x2, y2, seed, o = {}) {
  const r = rng(seed);
  const segs = [];
  const split = (ax, ay, bx, by, d, depth) => {
    if (depth <= 0) { segs.push([ax, ay, bx, by, o.lw || 3]); return; }
    const mx = (ax + bx) / 2 + (r() - .5) * d, my = (ay + by) / 2 + (r() - .5) * d * .35;
    split(ax, ay, mx, my, d * .55, depth - 1); split(mx, my, bx, by, d * .55, depth - 1);
    if (depth >= 3 && r() < (o.branch != null ? o.branch : .45)) {
      const len = Math.hypot(bx - ax, by - ay) * (.5 + r() * .5), ang = Math.atan2(by - ay, bx - ax) + (r() - .5) * 1.4;
      const sub = [];
      const bsplit = (ax2, ay2, bx2, by2, d2, dp) => {
        if (dp <= 0) { segs.push([ax2, ay2, bx2, by2, (o.lw || 3) * .5]); return; }
        const mx2 = (ax2 + bx2) / 2 + (r() - .5) * d2, my2 = (ay2 + by2) / 2 + (r() - .5) * d2 * .5;
        bsplit(ax2, ay2, mx2, my2, d2 * .55, dp - 1); bsplit(mx2, my2, bx2, by2, d2 * .55, dp - 1);
      };
      bsplit(mx, my, mx + Math.cos(ang) * len, my + Math.sin(ang) * len, d * .6, depth - 2);
    }
  };
  split(x1, y1, x2, y2, o.jit || Math.hypot(x2 - x1, y2 - y1) * .35, o.depth || 6);
  g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'butt'; g.lineJoin = 'miter';
  for (const [pass, wm, col, a] of [[0, 5, o.glow || '#b163ff', .28], [1, 1, o.col || '#f0e4ff', 1], [2, .4, '#ffffff', 1]]) {
    g.strokeStyle = col; g.globalAlpha = (o.alpha != null ? o.alpha : 1) * a;
    for (const [ax, ay, bx, by, lw] of segs) { g.lineWidth = lw * wm; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke(); }
  }
  g.restore();
}
