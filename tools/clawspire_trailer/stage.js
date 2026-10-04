// Clawspire 2.0 trailer: the set. The neon-arcade world the phones float in,
// the phone itself (bezel, glass, the live game inside) and the fake-3D
// projection that tilts it.
'use strict';

// ---------------------------------------------------------------- canvas pool
// A canvas is never rewritten after it was drawn into the scene within the same
// paint (Chromium's deferred raster can then drop tiles), so every phone slot
// owns its own offscreen canvas and every slot is drawn once per paint.
const _pool = new Map();
function poolCanvas(slot, w, h) {
  let c = _pool.get(slot);
  w = Math.max(2, Math.ceil(w)); h = Math.max(2, Math.ceil(h));
  if (!c || c.width !== w || c.height !== h) {
    c = makeCanvas(w, h);
    c._g = c.getContext('2d', { willReadFrequently: true });
    _pool.set(slot, c);
  }
  return c;
}

// ---------------------------------------------------------------- 3D projection
// rotate (x, y, z) by rx (pitch), ry (yaw), rz (roll); y points down, z toward the viewer
function rot3(x, y, z, rx, ry, rz) {
  let c = Math.cos(ry), s = Math.sin(ry);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(rx); s = Math.sin(rx);
  [y, z] = [y * c - z * s, y * s + z * c];
  c = Math.cos(rz); s = Math.sin(rz);
  [x, y] = [x * c - y * s, x * s + y * c];
  return [x, y, z];
}
// draw canvas `src` (its pixels = local units * k) as a plane centred at screen
// (cx, cy), rotated in 3D, with focal length f (design px). Sliced into strips,
// each an affine piece, along the axis the perspective bends most.
function drawPlane(g, src, k, cx, cy, rx, ry, rz, f = 2600, o = {}) {
  const sw = src.width, sh = src.height;
  const lw = sw / k, lh = sh / k;                          // local (design px) size
  const P = (u, v) => {                                    // canvas px -> screen
    const [x, y, z] = rot3(u / k - lw / 2, v / k - lh / 2, 0, rx, ry, rz);
    const s = f / (f - z);
    return [cx + x * s, cy + y * s];
  };
  g.save();
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'medium';
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (Math.abs(rx) < 1e-3 && Math.abs(ry) < 1e-3) {
    g.translate(cx, cy); g.rotate(rz); g.scale(1 / k, 1 / k);
    g.drawImage(src, -sw / 2, -sh / 2);
    g.restore(); return;
  }
  const vertical = Math.abs(ry) >= Math.abs(rx);            // yaw bends columns, pitch bends rows
  const span = vertical ? sw : sh;
  const n = clamp(Math.ceil(span / (8 * Math.max(1, k * .6))), 10, 90);
  for (let i = 0; i < n; i++) {
    const a0 = span * i / n, a1 = span * (i + 1) / n, am = (a0 + a1) / 2;
    let p0, p1, p2;                                       // strip origin, +along, +across (at the strip middle)
    if (vertical) { p0 = P(a0, sh / 2); p1 = P(a1, sh / 2); const top = P(am, 0), bot = P(am, sh); p2 = [bot[0] - top[0], bot[1] - top[1]]; }
    else { p0 = P(sw / 2, a0); p1 = P(sw / 2, a1); const lf = P(0, am), rt = P(sw, am); p2 = [rt[0] - lf[0], rt[1] - lf[1]]; }
    const ax = (p1[0] - p0[0]) / (a1 - a0), ay = (p1[1] - p0[1]) / (a1 - a0);
    const ov = 1.2;                                       // overlap so seams never open
    g.save();
    if (vertical) {
      const cxx = p2[0] / sh, cyy = p2[1] / sh;
      g.transform(ax, ay, cxx, cyy, p0[0] - cxx * sh / 2, p0[1] - cyy * sh / 2);
      g.drawImage(src, a0, 0, Math.min(sw - a0, a1 - a0 + ov), sh, 0, 0, Math.min(sw - a0, a1 - a0 + ov), sh);
    } else {
      const cxx = p2[0] / sw, cyy = p2[1] / sw;
      g.transform(cxx, cyy, ax, ay, p0[0] - cxx * sw / 2, p0[1] - cyy * sw / 2);
      g.drawImage(src, 0, a0, sw, Math.min(sh - a0, a1 - a0 + ov), 0, 0, sw, Math.min(sh - a0, a1 - a0 + ov));
    }
    g.restore();
  }
  g.restore();
}
// the projected bounding quad of a plane (for glows, shadows and callouts)
function planePoint(lw, lh, cx, cy, rx, ry, rz, u, v, f = 2600) {
  const [x, y, z] = rot3((u - .5) * lw, (v - .5) * lh, 0, rx, ry, rz);
  const s = f / (f - z);
  return [cx + x * s, cy + y * s];
}

// ---------------------------------------------------------------- the phone
const BEZ = 46, ORAD = 150, SRAD = 104;                     // in stage px (1080x1920 screen)
// o: {slot, id, ft, x, y, h (screen height, design px), rx, ry, rz, col (rim), glare (0..1),
//     flash (white over the screen), dim, zoom/cx/cy (crop inside the screen), f}
// returns screen-space corners of the screen [tl, tr, br, bl] and a stage->screen mapper
function phone(g, o) {
  const h = o.h, k0 = h / STAGE_H;                          // design px per stage px
  const res = Math.min(1, k0 * SCALE * (o.ss || 1.12));     // canvas px per stage px
  const cw = (STAGE_W + BEZ * 2) * res, ch = (STAGE_H + BEZ * 2) * res;
  const cv = poolCanvas(o.slot, cw, ch), x = cv._g;
  x.setTransform(1, 0, 0, 1, 0, 0);
  x.clearRect(0, 0, cv.width, cv.height);
  x.setTransform(res, 0, 0, res, BEZ * res, BEZ * res);
  // body: dark candy-metal with a coloured rim
  const col = o.col || C.pink;
  x.beginPath(); x.roundRect(-BEZ, -BEZ, STAGE_W + BEZ * 2, STAGE_H + BEZ * 2, ORAD);
  const bg = x.createLinearGradient(-BEZ, -BEZ, STAGE_W + BEZ, STAGE_H + BEZ);
  bg.addColorStop(0, '#3a2d58'); bg.addColorStop(.5, '#140c26'); bg.addColorStop(1, '#2a1d44');
  x.fillStyle = bg; x.fill();
  x.lineWidth = 10; x.strokeStyle = col; x.stroke();
  x.lineWidth = 3; x.strokeStyle = 'rgba(255,255,255,.55)';
  x.beginPath(); x.roundRect(-BEZ + 9, -BEZ + 9, STAGE_W + BEZ * 2 - 18, STAGE_H + BEZ * 2 - 18, ORAD - 9); x.stroke();
  // screen
  x.save();
  x.beginPath(); x.roundRect(0, 0, STAGE_W, STAGE_H, SRAD); x.clip();
  if (o.id) {
    if (o.zoom && o.zoom !== 1) {
      const z = o.zoom, ccx = (o.cx != null ? o.cx : .5) * STAGE_W, ccy = (o.cy != null ? o.cy : .5) * STAGE_H;
      x.translate(STAGE_W / 2, STAGE_H / 2); x.scale(z, z); x.translate(-ccx, -ccy);
    }
    drawStage(x, o.id, o.ft, o);
  } else if (o.paint) o.paint(x);
  x.restore();
  x.save();
  x.beginPath(); x.roundRect(0, 0, STAGE_W, STAGE_H, SRAD); x.clip();
  if (o.dim) { x.fillStyle = `rgba(8,4,18,${o.dim})`; x.fillRect(0, 0, STAGE_W, STAGE_H); }
  if (o.flash) { x.fillStyle = `rgba(255,255,255,${clamp(o.flash)})`; x.fillRect(0, 0, STAGE_W, STAGE_H); }
  if (o.over) o.over(x);
  // glass: a diagonal glare band that slides with the tilt
  const gp = o.glare != null ? o.glare : .5;
  const gx = lerp(-900, STAGE_W + 900, gp);
  const gr = x.createLinearGradient(gx - 380, 0, gx + 380, 700);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.13)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.globalCompositeOperation = 'lighter'; x.fillStyle = gr; x.fillRect(0, 0, STAGE_W, STAGE_H);
  x.restore();
  // dynamic island
  x.fillStyle = '#05030a'; x.beginPath(); x.roundRect(STAGE_W / 2 - 150, 26, 300, 70, 35); x.fill();

  // place it
  const rx = o.rx || 0, ry = o.ry || 0, rz = o.rz || 0, f = o.f || 2600;
  const { lw, lh, map } = phoneGeom(o);
  const sc = o.scale != null ? o.scale : 1;
  const a = o.alpha != null ? o.alpha : 1;
  // glow + contact shadow under the phone
  if (o.glow !== 0) {
    const gl = o.glow != null ? o.glow : 1;
    glowEllipse(g, o.x, o.y, lw * .75 * sc, lh * .6 * sc, col, .28 * gl * a);
  }
  drawPlane(g, cv, res / k0 / sc, o.x, o.y, rx, ry, rz, f, { alpha: a });
  return { map, w: lw * sc, h: lh * sc };
}
// where a phone's screen lands without drawing it: map(sx, sy) takes stage fractions
function phoneGeom(o) {
  const k0 = o.h / STAGE_H, sc = o.scale != null ? o.scale : 1;
  const lw = (STAGE_W + BEZ * 2) * k0, lh = (STAGE_H + BEZ * 2) * k0;
  const rx = o.rx || 0, ry = o.ry || 0, rz = o.rz || 0, f = o.f || 2600;
  const map = (sx, sy) => planePoint(lw * sc, lh * sc, o.x, o.y, rx, ry, rz, (BEZ + sx * STAGE_W) / (STAGE_W + BEZ * 2), (BEZ + sy * STAGE_H) / (STAGE_H + BEZ * 2), f);
  return { lw, lh, map };
}
function glowEllipse(g, x, y, rx, ry, col, a) {
  if (a <= 0) return;
  const spr = baked('glowspr' + col, 128, 128, c => {
    const gr = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, col); gr.addColorStop(.4, col + '66'); gr.addColorStop(1, col + '00');
    c.fillStyle = gr; c.fillRect(0, 0, 128, 128);
  });
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha *= clamp(a);
  g.drawImage(spr, x - rx, y - ry, rx * 2, ry * 2); g.restore();
}

// ---------------------------------------------------------------- the neon arcade
// o: {cam: [x, y] parallax camera, horizon (y), grid speed, halloween (0..1), rays}
function neonBg(g, t, o = {}) {
  const hw = o.halloween || 0;
  const camx = o.cam ? o.cam[0] : 0, camy = o.cam ? o.cam[1] : 0;
  const hz = (o.horizon != null ? o.horizon : H * .64) - camy * .3;
  // sky
  const sky = baked('sky' + W + 'x' + H + ':' + Math.round(hw * 10), 4, 512, c => {
    const gr = c.createLinearGradient(0, 0, 0, 512);
    if (hw > .5) { gr.addColorStop(0, '#0d0618'); gr.addColorStop(.45, '#2a0f3a'); gr.addColorStop(.62, '#7a2a3a'); gr.addColorStop(.66, '#ff8a1f'); gr.addColorStop(.7, '#3a1222'); gr.addColorStop(1, '#0b0610'); }
    else { gr.addColorStop(0, '#07040f'); gr.addColorStop(.4, '#1b0d36'); gr.addColorStop(.6, '#4a1660'); gr.addColorStop(.655, '#ff4f9a'); gr.addColorStop(.7, '#2a0c3a'); gr.addColorStop(1, '#0a0614'); }
    c.fillStyle = gr; c.fillRect(0, 0, 4, 512);
  });
  g.save();
  g.imageSmoothingEnabled = true;
  g.drawImage(sky, 0, 0, 4, 512, -40, (hz - H * .655) - 40, W + 80, H * 1.0 + 80 + Math.abs(camy));
  g.fillStyle = hw > .5 ? '#0b0610' : '#0a0614'; g.fillRect(-40, hz + H * .36, W + 80, H);
  // horizon sun / moon glow
  glowEllipse(g, W / 2 - camx * .05, hz, W * .55, H * .35, hw > .5 ? '#ff8a1f' : '#ff4f9a', .5);
  glowEllipse(g, W / 2 - camx * .05, hz - H * .1, W * .3, H * .25, hw > .5 ? '#8a4dff' : '#8a4dff', .35);
  // rays from above
  if (o.rays !== 0) shafts(g, W / 2 - camx * .1, -80, .22 * (o.rays || 1), { n: 9, dir: Math.PI / 2, spread: 1.3, len: H * 1.3, seed: 33, t, col: hw > .5 ? 'rgba(255,170,90,A)' : 'rgba(255,120,200,A)' });
  // city, two parallax layers
  for (const [layer, par, alpha] of [[0, .12, .55], [1, .25, .9]]) {
    const cty = city(layer, hw > .5);
    const cwid = cty.width / SCALE, chei = cty.height / SCALE;
    const ox = ((-camx * par) % cwid + cwid) % cwid;
    g.globalAlpha = alpha;
    for (let x0 = ox - cwid; x0 < W + 40; x0 += cwid) g.drawImage(cty, x0, hz - chei + 4, cwid, chei);
    g.globalAlpha = 1;
  }
  // grid floor
  grid(g, t, hz, camx, o.speed != null ? o.speed : 1, hw);
  // bokeh
  bokeh(g, t, camx, camy, o.bokeh != null ? o.bokeh : 1, hw);
  g.restore();
}
function city(layer, spooky) {
  const w = 2400, h = layer ? 300 : 380;
  return baked('city' + layer + (spooky ? 'h' : ''), w * SCALE, h * SCALE, c => {
    c.scale(SCALE, SCALE);
    const r = rng(layer ? 91 : 57);
    let x = 0;
    while (x < w) {
      const bw = lerp(60, 170, r()), bh = lerp(h * .35, h * .98, r());
      c.fillStyle = layer ? '#120a22' : '#1c1032';
      c.fillRect(x, h - bh, bw - 4, bh);
      // windows
      for (let wy = h - bh + 14; wy < h - 10; wy += 22) for (let wx = x + 10; wx < x + bw - 16; wx += 18) {
        if (r() < .32) { c.fillStyle = ['#ff4f9a', '#2ee6d6', '#ffc94d', '#8a4dff'][Math.floor(r() * 4)] + (layer ? 'cc' : '77'); c.fillRect(wx, wy, 8, 10); }
      }
      // neon sign on some roofs
      if (layer && r() < .3) { c.fillStyle = ['#ff4f9a', '#2ee6d6'][Math.floor(r() * 2)]; c.fillRect(x + 12, h - bh - 18, bw * .5, 6); }
      x += bw;
    }
    if (spooky) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,120,30,.12)'; c.fillRect(0, 0, w, h); }
  });
}
function grid(g, t, hz, camx, speed, hw) {
  const f = 520, rows = 22, cols = 34;
  const colA = hw > .5 ? '255,138,31' : '46,230,214', colB = hw > .5 ? '138,77,255' : '255,79,154';
  g.save();
  g.globalCompositeOperation = 'lighter';
  // floor wash
  const fl = g.createLinearGradient(0, hz, 0, H);
  fl.addColorStop(0, `rgba(${colB},.28)`); fl.addColorStop(.3, `rgba(${colB},.06)`); fl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = fl; g.fillRect(-40, hz, W + 80, H - hz + 40);
  // horizontal lines rush toward the camera
  const ph = (t * speed * 1.6) % 1;
  for (let i = 0; i < rows; i++) {
    const z = (i + 1 - ph) * .9;
    const y = hz + f / z * .9;
    if (y > H + 10) continue;
    const a = clamp((y - hz) / (H * .3)) * .55;
    g.strokeStyle = `rgba(${colA},${a.toFixed(3)})`; g.lineWidth = 1 + 2.5 * clamp((y - hz) / (H - hz));
    g.beginPath(); g.moveTo(-40, y); g.lineTo(W + 40, y); g.stroke();
  }
  // vertical lines converge to the vanishing point
  const vx = W / 2 - camx * .4;
  for (let j = -cols / 2; j <= cols / 2; j++) {
    const xb = vx + (j + ((camx * .02) % 1)) * W * .16;
    g.strokeStyle = `rgba(${colA},.38)`; g.lineWidth = 2;
    g.beginPath(); g.moveTo(vx + (xb - vx) * .02, hz); g.lineTo(vx + (xb - vx) * 3.2, H + 600); g.stroke();
  }
  g.restore();
}
function bokeh(g, t, camx, camy, a, hw) {
  if (a <= 0) return;
  const r = rng(404);
  const cols = hw > .5 ? ['#ff8a1f', '#8a4dff', '#ffc94d', '#ff4f9a'] : ['#ff4f9a', '#2ee6d6', '#ffc94d', '#8a4dff'];
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 34; i++) {
    const depth = lerp(.2, 1, r()), x0 = r() * (W + 400) - 200, y0 = r() * H * .9;
    const sz = lerp(18, 90, depth), col = cols[Math.floor(r() * cols.length)], ph = r() * 6.28;
    const x = ((x0 - camx * depth * .6 + Math.sin(t * .4 + ph) * 30) % (W + 400) + (W + 400)) % (W + 400) - 200;
    const y = y0 - camy * depth * .4 + Math.cos(t * .3 + ph) * 20;
    const spr = baked('bokeh' + col, 96, 96, c => {
      const gr = c.createRadialGradient(48, 48, 0, 48, 48, 48);
      gr.addColorStop(0, col + '55'); gr.addColorStop(.78, col + '66'); gr.addColorStop(.9, col + 'aa'); gr.addColorStop(1, col + '00');
      c.fillStyle = gr; c.fillRect(0, 0, 96, 96);
    });
    g.globalAlpha = a * lerp(.12, .4, 1 - depth) * (.7 + .3 * Math.sin(t * 2 + ph));
    g.drawImage(spr, x - sz, y - sz, sz * 2, sz * 2);
  }
  g.restore();
}
