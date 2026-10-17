'use strict';
// ===================== ART_HUMANS: chibi "sticker" cast (RoxorLoops & Jasmin identity) =====================
// Overrides drawHuman() from art.js. Pose contract unchanged: feet at (0,0), facing RIGHT,
// p = {t, atk, talk, hurt, noShadow, sit, mug, armAng}. ~250 units tall, head ≈ 40-45% of the height.
// Rendering language (see reference/STYLE_BIBLE.md):
//  * two-pass ink: pass 0 collects every silhouette part into ONE path and strokes it with a thick, even
//    ink line; pass 1 paints the parts (flat saturated fill + soft hue-shifted shade band on the side away
//    from the light + thin light rim + small glossy specular) with thinner interior lines.
//  * big glossy anime eyes (gradient iris, pupil, 2 catch-lights, bottom glow), tiny nose/mouth, blush.
//  * procedural tie-dye (tiled radial blotches -> CanvasPattern) for Roxor's hoodie.
//  * layer cache: legs + rigid upper body baked to bitmaps; face, swinging arms, ponytail/mullet/tails live.
// Spec field `look` ('roxor' | 'jasmin' | 'bass') selects the hero outfits; everyone else is driven by spec.
const hum_draw = (function () {
  const H = Math.PI / 2, TAU = Math.PI * 2;
  const INK = '#15101c', OL = 7.5, LW = 2.3;
  const LX = 0.45, LY = -0.89;                          // key light: upper-front (figure-local)
  const SHD = 'rgba(72,38,140,.24)', HIL = 'rgba(255,255,255,.34)';
  const NO = {}, DASH = [3, 3], NODASH = [];
  const CYAN = '#3fd8e8', CYAN_D = '#1597b0', PINK = '#f06aa0', PINK_L = '#ff9cc6', PINK_D = '#d63a82';
  const LIME = '#6cc22e', LIME_L = '#a6e65a', LAV = '#b79ae8', SKY = '#7fd0e8', YEL = '#ffd23a', ORA = '#ff8a2a';
  const SILVER = '#d4dbe3', GOLD = '#ffc93a', CREAM = '#fbf7ea', NAVY = '#232a4a';
  const IRIS = ['#4a8fd8', '#8a5228', '#3fa05a', '#b07a2a', '#6a5ad0', '#c0508a'];
  let X = null, M = 1;
  const OPT = { cache: 1 };

  // ---------- colour ----------
  function rgbOf(col) {
    if (col[0] === '#') {
      let h = col.slice(1); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16); return [n >> 16, (n >> 8) & 255, n & 255];
    }
    const m = col.match(/[\d.]+/g); return m ? [+m[0], +m[1], +m[2]] : [128, 128, 128];
  }
  const ci = v => v < 0 ? 0 : v > 255 ? 255 : v | 0;
  const MIXC = new Map();
  function mixc(a, b, t) {
    const key = a + b + t; let r = MIXC.get(key); if (r) return r;
    const A = rgbOf(a), B = rgbOf(b);
    r = '#' + ((1 << 24) | (ci(A[0] + (B[0] - A[0]) * t) << 16) | (ci(A[1] + (B[1] - A[1]) * t) << 8) | ci(A[2] + (B[2] - A[2]) * t)).toString(16).slice(1);
    MIXC.set(key, r); return r;
  }
  const TONES = new Map();
  function tone(col) {
    let T = TONES.get(col); if (T) return T;
    T = { b: col, d: mixc(col, '#3a2466', .32), dd: mixc(col, '#150a20', .58), l: mixc(col, '#ffffff', .32), ll: mixc(col, '#ffffff', .65) };
    TONES.set(col, T); return T;
  }
  // ---------- procedural tie-dye tile (cyan / lavender / white swirl) ----------
  let TDC = null; const TDP = new WeakMap();
  function tieDye() {
    let p = TDP.get(X); if (p) return p;
    if (!TDC) {
      const S = 120; TDC = document.createElement('canvas'); TDC.width = TDC.height = S; const g = TDC.getContext('2d');
      g.fillStyle = '#f2f0ff'; g.fillRect(0, 0, S, S);
      let sd = 77; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const cols = ['63,216,232', '183,154,232', '127,208,232', '205,180,245', '150,230,240'];
      for (let i = 0; i < 38; i++) {
        const x = r() * S, y = r() * S, rad = 10 + r() * 20, col = cols[i % cols.length], a = .75 + r() * .25;
        for (let ox = -S; ox <= S; ox += S) for (let oy = -S; oy <= S; oy += S) {
          const gx = x + ox, gy = y + oy; if (gx < -rad || gx > S + rad || gy < -rad || gy > S + rad) continue;
          const gr = g.createRadialGradient(gx, gy, rad * .15, gx, gy, rad);
          gr.addColorStop(0, `rgba(${col},${a})`); gr.addColorStop(.6, `rgba(${col},${a * .55})`); gr.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = gr; g.beginPath(); g.arc(gx, gy, rad, 0, TAU); g.fill();
        }
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.6; g.lineCap = 'round';
      for (let i = 0; i < 14; i++) { const x = r() * S, y = r() * S, a0 = r() * TAU; g.beginPath(); g.arc(x, y, 5 + r() * 9, a0, a0 + 1.6 + r()); g.stroke(); }
    }
    p = X.createPattern(TDC, 'repeat'); TDP.set(X, p); return p;
  }

  // ---------- path builders (append a closed subpath; never beginPath) ----------
  function blob(a) {
    const n = a.length / 2;
    X.moveTo((a[2 * n - 2] + a[0]) / 2, (a[2 * n - 1] + a[1]) / 2);
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; X.quadraticCurveTo(a[2 * i], a[2 * i + 1], (a[2 * i] + a[2 * j]) / 2, (a[2 * i + 1] + a[2 * j + 1]) / 2); }
    X.closePath();
  }
  function poly(a) { X.moveTo(a[0], a[1]); for (let i = 2; i < a.length; i += 2) X.lineTo(a[i], a[i + 1]); X.closePath(); }
  function rr(x, y, w, h, r) { X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r); X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath(); }
  function ell(cx, cy, rx, ry, rot, ccw) { rot = rot || 0; X.moveTo(cx + Math.cos(rot) * rx, cy + Math.sin(rot) * rx); X.ellipse(cx, cy, rx, ry, rot, 0, TAU, !!ccw); X.closePath(); }
  function capsule(x1, y1, r1, x2, y2, r2) {
    const a = Math.atan2(y2 - y1, x2 - x1);
    X.moveTo(x1 + Math.cos(a + H) * r1, y1 + Math.sin(a + H) * r1);
    X.arc(x2, y2, r2, a + H, a - H, true); X.arc(x1, y1, r1, a - H, a + H, true); X.closePath();
  }
  function starP(cx, cy, R, r, rot) {
    rot = rot || 0;
    for (let i = 0; i < 10; i++) { const a = rot - H + i * Math.PI / 5, q = i % 2 ? r : R; i ? X.lineTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q) : X.moveTo(cx + Math.cos(a) * q, cy + Math.sin(a) * q); }
    X.closePath();
  }
  function heartP(x, y, s) {
    X.moveTo(x, y + s * .9);
    X.bezierCurveTo(x - s * 1.5, y - s * .1, x - s * .75, y - s * 1.15, x, y - s * .42);
    X.bezierCurveTo(x + s * .75, y - s * 1.15, x + s * 1.5, y - s * .1, x, y + s * .9);
    X.closePath();
  }
  // smooth tapered limb through 3 joints
  function limb3(ax, ay, ra, bx, by, rb, cx, cy, rc) {
    let d1x = bx - ax, d1y = by - ay, l1 = Math.hypot(d1x, d1y) || 1; d1x /= l1; d1y /= l1;
    let d2x = cx - bx, d2y = cy - by, l2 = Math.hypot(d2x, d2y) || 1; d2x /= l2; d2y /= l2;
    let mx = d1x + d2x, my = d1y + d2y, lm = Math.hypot(mx, my) || 1; mx /= lm; my /= lm;
    const nAx = -d1y, nAy = d1x, nBx = -my, nBy = mx, nCx = -d2y, nCy = d2x;
    const L0x = ax + nAx * ra, L0y = ay + nAy * ra, L1x = bx + nBx * rb, L1y = by + nBy * rb, L2x = cx + nCx * rc, L2y = cy + nCy * rc;
    const R0x = ax - nAx * ra, R0y = ay - nAy * ra, R1x = bx - nBx * rb, R1y = by - nBy * rb, R2x = cx - nCx * rc, R2y = cy - nCy * rc;
    const a1 = Math.atan2(d1y, d1x), a2 = Math.atan2(d2y, d2x);
    X.moveTo(L0x, L0y);
    X.quadraticCurveTo(2 * L1x - (L0x + L2x) / 2, 2 * L1y - (L0y + L2y) / 2, L2x, L2y);
    X.arc(cx, cy, rc, a2 + H, a2 - H, true);
    X.quadraticCurveTo(2 * R1x - (R0x + R2x) / 2, 2 * R1y - (R0y + R2y) / 2, R0x, R0y);
    X.arc(ax, ay, ra, a1 - H, a1 + H, true);
    X.closePath();
  }

  // ---------- painting primitives ----------
  // P: one sticker part. o: {d shade offset, h rim, fill (pattern), flat, lw, sil, spec:[x,y,rx,ry,rot], post(T), shd}
  function P(f, col, o) {
    o = o || NO;
    if (!M) { if (o.sil !== false) f(); return; }
    const T = tone(col);
    X.beginPath(); f(); X.fillStyle = o.fill || col; X.fill();
    if (!o.flat || o.post || o.spec) {
      X.save(); X.clip();
      if (!o.flat) {
        const d = o.d != null ? o.d : 6, h = o.h != null ? o.h : 2.2;
        if (d > 0) { X.beginPath(); f(); X.translate(LX * d, LY * d); f(); X.translate(-LX * d, -LY * d); X.fillStyle = o.shd || SHD; X.fill('evenodd'); }
        if (h > 0) { X.beginPath(); f(); X.translate(-LX * h, -LY * h); f(); X.translate(LX * h, LY * h); X.fillStyle = HIL; X.fill('evenodd'); }
      }
      if (o.post) o.post(T);
      if (o.spec) { const q = o.spec; X.beginPath(); X.ellipse(q[0], q[1], q[2], q[3], q[4] || 0, 0, TAU); X.fillStyle = 'rgba(255,255,255,.88)'; X.fill(); }
      X.restore();
    }
    if (o.lw !== 0) { X.beginPath(); f(); X.lineWidth = o.lw || LW; X.strokeStyle = INK; X.stroke(); }
  }
  function tl(x1, y1, cx, cy, x2, y2, wd, col) {       // tapered crescent stroke
    if (!M) return;
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * wd, ny = dx / L * wd;
    X.beginPath(); X.moveTo(x1, y1); X.quadraticCurveTo(cx + nx, cy + ny, x2, y2); X.quadraticCurveTo(cx - nx, cy - ny, x1, y1); X.fillStyle = col; X.fill();
  }
  function ln(x1, y1, cx, cy, x2, y2, lw, col) {
    if (!M) return;
    X.beginPath(); X.moveTo(x1, y1); X.quadraticCurveTo(cx, cy, x2, y2); X.lineWidth = lw; X.strokeStyle = col; X.stroke();
  }
  function stitch(x1, y1, cx, cy, x2, y2, col) { if (!M) return; X.setLineDash(DASH); ln(x1, y1, cx, cy, x2, y2, 1.2, col); X.setLineDash(NODASH); }
  function dot(x, y, r, col) { if (!M) return; X.beginPath(); X.arc(x, y, r, 0, TAU); X.fillStyle = col; X.fill(); }
  function ellF(cx, cy, rx, ry, rot, col) { if (!M) return; X.beginPath(); X.ellipse(cx, cy, rx, ry, rot, 0, TAU); X.fillStyle = col; X.fill(); }
  function sparkle(x, y, r, col) {
    if (!M) return;
    X.beginPath(); X.moveTo(x, y - r); X.quadraticCurveTo(x, y, x + r, y); X.quadraticCurveTo(x, y, x, y + r); X.quadraticCurveTo(x, y, x - r, y); X.quadraticCurveTo(x, y, x, y - r); X.closePath();
    X.fillStyle = col; X.fill(); X.lineWidth = 1.4; X.strokeStyle = INK; X.stroke();
  }
  function note(x, y, s, col) {                          // little eighth note doodle
    if (!M) return;
    X.save(); X.translate(x, y); X.scale(s, s);
    X.beginPath(); X.ellipse(0, 0, 5, 3.8, -.4, 0, TAU); X.moveTo(4.4, -1); X.lineTo(4.4, -16); X.quadraticCurveTo(9, -12, 11, -7);
    X.lineWidth = 4 / s; X.strokeStyle = INK; X.stroke();
    X.beginPath(); X.ellipse(0, 0, 5, 3.8, -.4, 0, TAU); X.fillStyle = col; X.fill();
    X.beginPath(); X.moveTo(4.4, -1); X.lineTo(4.4, -16); X.quadraticCurveTo(9, -12, 11, -7); X.lineWidth = 1.8 / s; X.strokeStyle = col; X.stroke();
    X.restore();
  }

  // ---------- main ----------
  function draw(c0, s, p) {
    let c = c0; X = c;
    const look = s.look || '', w = s.build || 1, seed = s.seed || 3; let t = p.t || 0;
    const atk = p.atk || 0, talk = p.talk || 0, sit = !!p.sit, hurt = !!p.hurt && !atk;
    const hat = s.hat || 'hair', acc = s.accent || PINK, hc = s.hatCol || acc;
    const skin = s.skin || '#f2c09a', coat = s.coat || '#2d7d79';
    const roxor = look === 'roxor', jas = look === 'jasmin', bass = look === 'bass';
    const pants = roxor ? '#4a5272' : s.pants || mixc(coat, '#1c1626', .5);
    const bootC = s.boot || (roxor ? '#ffffff' : jas ? '#fff2f7' : bass ? '#2a2630' : '#7a4a2e');
    const handC = s.glove || skin;
    const hairC = s.hair || (roxor ? '#4a2a1a' : jas ? '#2a1a22' : (hat === 'hair' || hat === 'mohawk') ? hc : '#5a3822');
    const browC = mixc(hairC, '#150a14', .5);
    const scarfC = look ? null : (s.scarf || null), shirtC = s.shirt || CREAM;
    const mood = hurt ? 'hurt' : (s.face || 'grim');
    const long = !look && (hat === 'tophat' || hat === 'hood');
    const bare = bass || (!look && w >= 1.3 && !long);
    const irisC = roxor ? '#3f86d6' : jas ? '#8a4e26' : bass ? '#6a4a2a' : IRIS[seed % IRIS.length];
    let bob = Math.sin(t * 2.6 + seed) * 2.4, br = Math.sin(t * 2.6 + seed + 1.1);
    let sq = Math.sin(t * 5.2 + seed * 2) * .5 + .5;             // bouncy squash 0..1
    const bl = (t * .37 + seed * .713) % 3.1, blink = bl < .12;
    const str = atk >= .35 ? Math.sin(Math.min(1, (atk - .35) / .3) * H) : 0;
    const wind = atk > 0 && atk < .35 ? atk / .35 : 0;
    let lean = Math.sin(t * 1.1 + seed) * .012;
    if (atk > 0) lean += atk < .35 ? -.08 * wind : .1 * str * (1 - Math.max(0, (atk - .8) / .2) * .5);
    if (hurt) lean -= .15;
    let ang = p.mug ? -1.4 : p.armAng != null ? p.armAng : hurt ? 1.05 : (atk > 0 ? (atk < .35 ? lerp(.5, -1.9, ease.out(atk / .35)) : lerp(-1.9, (s.weapon === 'knife' || s.weapon === 'pistol' || !s.weapon) ? .1 : 1.2, ease.out((atk - .35) / .65))) : (.5 + Math.sin(t * 2.6 + seed) * .06));
    const wp = p.mug ? 'mug' : (s.weapon || 'knife');
    const cw = 25 * w, TT = -136, HM = long ? -36 : -58, hipY = -64;
    const aw = Math.pow(w, .6);
    const HX = 8, HY = -186;
    let nod = (talk > 0 ? Math.sin(t * 9) * .04 * talk : 0) + (hurt ? -.14 : 0) + wind * -.06 + str * .06;
    const swayBase = () => Math.sin(t * 2.3 + seed) * 4 + wind * -6 + str * 9 + (hurt ? 8 : 0);

    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (!p.noShadow) {
      const sx = sit ? 30 : 4, R = 44 * w + 14;
      c.save(); c.translate(sx, 3); c.scale(1, .2);
      const g = c.createRadialGradient(0, 0, 4, 0, 0, R);
      g.addColorStop(0, 'rgba(25,10,40,.45)'); g.addColorStop(.6, 'rgba(25,10,40,.22)'); g.addColorStop(1, 'rgba(25,10,40,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill(); c.restore();
    }

    // ---------------- shoes & legs ----------------
    const shoe = (ax, front) => {
      const b = (1 + w) / 2, gy = 0, col = front ? bootC : mixc(bootC, '#2a2040', .16);
      const topY = jas ? gy - 44 : gy - 30, soleH = jas ? 13 : roxor ? 11 : 9;
      P(() => {
        X.moveTo(ax - 13 * b, topY); X.quadraticCurveTo(ax - 17 * b, gy - 16, ax - 16 * b, gy - soleH + 2);
        X.lineTo(ax + 28 * b, gy - soleH + 2); X.quadraticCurveTo(ax + 32 * b, gy - soleH - 12, ax + 18 * b, gy - soleH - 16);
        X.quadraticCurveTo(ax + 10 * b, gy - soleH - 18, ax + 9 * b, topY - 1); X.quadraticCurveTo(ax - 2 * b, topY - 5, ax - 13 * b, topY); X.closePath();
      }, col, {
        d: 5, spec: [ax + 19 * b, gy - soleH - 10, 4.2, 2.2, -.35], post: T => {
          if (roxor) { tl(ax - 10 * b, gy - soleH - 4, ax + 6 * b, gy - soleH - 18, ax + 20 * b, gy - soleH - 6, 2.6, CYAN); }
          else if (jas) { tl(ax - 12 * b, topY + 8, ax, topY + 4, ax + 9 * b, topY + 8, 2.2, PINK_L); dot(ax + 2 * b, gy - 30, 3, PINK); }
          else { ln(ax + 8 * b, gy - soleH - 16, ax + 16 * b, gy - soleH - 6, ax + 24 * b, gy - soleH - 2, 1.6, T.dd); }
          // laces
          for (let i = 0; i < (jas ? 3 : 2); i++) ln(ax + (4 + i * 3) * b, topY + 6 + i * 7, ax + (8 + i * 3) * b, topY + 4 + i * 7, ax + (12 + i * 3) * b, topY + 7 + i * 7, 1.8, front ? CREAM : T.l);
        }
      });
      const soleC = roxor ? CREAM : jas ? PINK_L : bass ? '#4a4452' : '#3a2620';
      P(() => rr(ax - 18 * b, gy - soleH, 50 * b, soleH, soleH * .45), soleC, {
        d: 2, h: 1.2, post: () => { if (roxor) { X.fillStyle = CYAN; X.fillRect(ax - 18 * b, gy - soleH * .55, 50 * b, 2.4); } if (jas) for (let i = 0; i < 5; i++) ln(ax + (-12 + i * 9) * b, gy - soleH + 2, ax + (-12 + i * 9) * b, gy - soleH * .5, ax + (-12 + i * 9) * b, gy - 2, 1.2, PINK_D); }
      });
    };
    const leg = (hx_, hy_, kx, ky, ax, ay, front) => {
      const r0 = 12.5 * w, r1 = 10.5 * w, r2 = 9.5 * w, col = front ? pants : mixc(pants, '#140c22', .2);
      P(() => limb3(hx_, hy_, r0, kx, ky, r1, ax, ay, r2), col, {
        d: 5, post: T => {
          if (roxor) ln(hx_ + 1, hy_ + 4, kx + 1, ky, ax + 1, ay - 4, 3.2, CYAN);
          tl(kx - r1 * .9, ky - 2, kx - r1 * .3, ky + 3, kx + r1 * .2, ky + 6, 1.6, T.dd);
          if (!jas && !sit) { X.globalAlpha = .5; ellF(hx_, HM + 4 + bob, 22 * w, 6, 0, T.dd); X.globalAlpha = 1; }
        }
      });
      shoe(ax, front);
    };

    // ---------------- weapons (hand-local frame: grip at 0, business end toward -y) ----------------
    const mic = (bodyC, ringC, k) => {
      if (M && k === 1) { X.beginPath(); X.moveTo(0, 30); X.bezierCurveTo(-4, 46, 10, 50, 4, 66); X.lineWidth = 5.4; X.strokeStyle = INK; X.stroke(); X.lineWidth = 2.6; X.strokeStyle = '#3a3448'; X.stroke(); }
      P(() => { X.moveTo(-6.5 * k, -8 * k); X.lineTo(6.5 * k, -8 * k); X.lineTo(4 * k, 30 * k); X.quadraticCurveTo(0, 33 * k, -4 * k, 30 * k); X.closePath(); }, bodyC, { d: 3, spec: [-2.4 * k, 6 * k, 1.3 * k, 10 * k, 0] });
      P(() => rr(-7.5 * k, -13 * k, 15 * k, 6.5 * k, 2.6 * k), ringC, { d: 2, h: 1.2, post: () => { if (ringC === CYAN) { X.fillStyle = 'rgba(200,250,255,.7)'; X.fillRect(-6 * k, -11 * k, 12 * k, 1.6 * k); } } });
      P(() => ell(0, -24 * k, 12 * k, 12.5 * k), SILVER, {
        d: 5, h: 1.6, spec: [-4.5 * k, -29 * k, 3.8 * k, 2.6 * k, -.6], post: () => {
          X.lineWidth = 1.1; X.strokeStyle = 'rgba(40,40,70,.45)'; X.beginPath();
          for (let i = -28; i <= 28; i += 5) { X.moveTo((i - 14) * k, -38 * k); X.lineTo((i + 14) * k, -10 * k); X.moveTo((i + 14) * k, -38 * k); X.lineTo((i - 14) * k, -10 * k); }
          X.stroke();
        }
      });
    };
    const weapon = () => {
      if (wp === 'knife') {                                   // microphone
        mic(jas ? PINK : roxor ? '#22202c' : mixc(acc, '#15101c', .45), roxor ? CYAN : jas ? '#2a2433' : acc, 1);
      } else if (wp === 'cane') {                             // mic stand (Jasmin) / star-topped showbiz stand (villains)
        const poleC = jas ? '#2a2433' : mixc(hc, '#15101c', .3);
        P(() => capsule(0, 46, 3.4, 0, -56, 3.4), poleC, { d: 1.5, h: 1, post: () => ln(1.4, 40, 1.8, -10, 1.4, -52, 1.2, 'rgba(255,255,255,.5)') });
        P(() => rr(-5, -2, 10, 7, 2.5), jas ? PINK : GOLD, { d: 1.5, h: 1 });
        if (jas) {
          P(() => rr(-5.5, -60, 11, 8, 3), '#3a3448', { d: 1.5, h: 1 });
          X.save(); X.translate(0, -62); X.rotate(.5); mic(PINK, '#2a2433', .62); X.restore();
          P(() => starP(0, -26, 10, 4.6, .2), YEL, { d: 2.5, h: 1.2, spec: [-2, -29, 1.8, 1.2, 0] });
        } else {
          P(() => starP(0, -70, 17, 8, -.1), acc === GOLD ? acc : mixc(acc, GOLD, .55), { d: 4, h: 1.6, spec: [-4, -76, 3.5, 2.2, -.5] });
          P(() => ell(0, -70, 4.4, 4.4), PINK, { d: 1.5, h: 1, sil: false });
        }
      } else if (wp === 'club') {                             // giant drumstick
        P(() => { X.moveTo(-6.5, 22); X.quadraticCurveTo(-7, -20, -3.4, -62); X.lineTo(3.4, -62); X.quadraticCurveTo(7, -20, 6.5, 22); X.quadraticCurveTo(0, 26, -6.5, 22); X.closePath(); }, '#f2c27a', {
          d: 3.5, spec: [-2.6, -30, 1.4, 16, .02], post: T => { tl(2, 10, 4, -20, 2, -54, 1.2, T.d); }
        });
        P(() => ell(0, -70, 6.4, 9.5), '#f7d49a', { d: 2.5, h: 1.2, spec: [-2, -74, 1.6, 2.6, 0] });
        P(() => rr(-7.4, -4, 14.8, 22, 4), bass ? YEL : acc, { d: 2.5, h: 1.2, post: () => { for (let i = 0; i < 4; i++) tl(-7, -1 + i * 6, 0, 1 + i * 6, 7, -3 + i * 6, 1.4, INK); } });
      } else if (wp === 'axe') {                              // electric guitar
        const bc = acc, neckC = '#c98a4a';
        P(() => rr(-3.8, -6, 7.6, 36, 2), '#3a2a26', { d: 1.5, h: 1, post: () => { for (const y of [4, 12, 20]) dot(0, y, 1.2, CREAM); } });
        P(() => rr(-5.5, 26, 11, 14, 3.5), '#2a2433', { d: 1.5, h: 1, post: () => { for (let i = 0; i < 3; i++) { dot(-5.5, 29 + i * 4, 1.6, SILVER); dot(5.5, 29 + i * 4, 1.6, SILVER); } } });
        P(() => rr(-3.6, -40, 7.2, 36, 2), neckC, { d: 1.5, h: 1 });
        P(() => blob([-16, -36, -22, -54, -14, -64, -22, -82, -6, -88, 2, -74, 16, -88, 24, -74, 17, -60, 22, -42, 4, -32]), bc, {
          d: 6, h: 2, spec: [12, -76, 3.6, 2.2, -.6], post: T => {
            X.beginPath(); blob([-10, -40, -14, -54, -4, -60, 4, -48, 12, -44, 4, -36]); X.fillStyle = CREAM; X.fill(); X.lineWidth = 1.4; X.strokeStyle = INK; X.stroke();
            for (const y of [-50, -62]) { X.beginPath(); rr(-6, y - 2.6, 12, 5.2, 1.5); X.fillStyle = '#22202c'; X.fill(); }
            X.beginPath(); rr(-7, -74, 14, 4, 1.5); X.fillStyle = SILVER; X.fill();
          }
        });
        if (M) { X.lineWidth = .8; X.strokeStyle = 'rgba(255,255,255,.85)'; X.beginPath(); for (let i = -1.5; i <= 1.5; i++) { X.moveTo(i * 1.6, 30); X.lineTo(i * 1.6, -72); } X.stroke(); }
      } else if (wp === 'wrench') {                           // music-note tuning wrench
        P(() => rr(-4.6, -50, 9.2, 64, 4.4), SILVER, { d: 3, h: 1.6, spec: [-1.6, -24, 1.2, 12, 0] });
        P(() => ell(-9, 18, 12, 8.5, -.4), '#2a2433', { d: 3, h: 1.4, spec: [-13, 15, 3.4, 1.8, -.4] });
        P(() => { X.moveTo(3, -44); X.bezierCurveTo(16, -40, 24, -30, 20, -14); X.bezierCurveTo(18, -24, 12, -30, 3, -30); X.closePath(); }, acc, { d: 2, h: 1.2 });
        P(() => { X.moveTo(-12, -50); X.quadraticCurveTo(-16, -66, -9, -76); X.lineTo(-3, -70); X.quadraticCurveTo(-6, -64, -4, -60); X.lineTo(4, -60); X.quadraticCurveTo(6, -64, 3, -70); X.lineTo(9, -76); X.quadraticCurveTo(16, -66, 12, -50); X.closePath(); }, SILVER, { d: 3.5, h: 1.6, spec: [-9, -66, 1.6, 4, .3] });
      } else if (wp === 'pistol') {                           // megaphone / air horn (business end along +x)
        P(() => rr(-5, -4, 10, 22, 4), '#2a2433', { d: 2, h: 1 });
        P(() => { X.moveTo(-10, -20); X.lineTo(12, -22); X.lineTo(38, -36); X.quadraticCurveTo(44, -14, 38, 8); X.lineTo(12, -4); X.lineTo(-10, -6); X.quadraticCurveTo(-14, -13, -10, -20); X.closePath(); }, CREAM, {
          d: 5, spec: [20, -22, 6, 1.6, -.5], post: () => { X.fillStyle = acc; X.beginPath(); X.moveTo(20, -26); X.lineTo(27, -30); X.lineTo(27, 3); X.lineTo(20, 0); X.closePath(); X.fill(); }
        });
        P(() => ell(39, -14, 6, 22.5), mixc(acc, '#15101c', .2), { d: 2, h: 1.4, post: () => ellF(40.5, -14, 3.4, 17, 0, '#2a2433') });
      } else if (wp === 'bottle') {                           // fizzy soda bottle
        P(() => { X.moveTo(-9, 12); X.quadraticCurveTo(-11, -14, -8, -24); X.quadraticCurveTo(-4, -32, -3.5, -40); X.lineTo(3.5, -40); X.quadraticCurveTo(4, -32, 8, -24); X.quadraticCurveTo(11, -14, 9, 12); X.quadraticCurveTo(0, 16, -9, 12); X.closePath(); }, LIME_L, {
          d: 4, spec: [-5, -18, 1.6, 9, .05], post: () => {
            X.beginPath(); rr(-11, -14, 22, 14, 2); X.fillStyle = PINK; X.fill(); X.beginPath(); heartP(0, -7.5, 4); X.fillStyle = CREAM; X.fill();
            for (let i = 0; i < 4; i++) { X.beginPath(); X.arc(-4 + (i * 5) % 9, 8 - i * 7 - ((t * 20 + i * 7) % 10), 1.5, 0, TAU); X.strokeStyle = 'rgba(255,255,255,.85)'; X.lineWidth = 1; X.stroke(); }
          }
        });
        P(() => rr(-5, -47, 10, 8, 2.5), PINK_D, { d: 1.5, h: 1 });
      } else if (wp === 'mug') {                              // mug with heart + steam
        P(() => { X.moveTo(9, -18); X.bezierCurveTo(22, -20, 22, -1, 9, -2); X.lineTo(9, -7); X.bezierCurveTo(15.5, -7, 15.5, -14, 9, -13); X.closePath(); }, CREAM, { d: 2, h: 1 });
        P(() => { X.moveTo(-11, -23); X.lineTo(11, -23); X.lineTo(10, 3); X.quadraticCurveTo(0, 6, -10, 3); X.closePath(); }, CREAM, {
          d: 4, spec: [-6, -14, 1.8, 6, 0], post: () => { X.beginPath(); heartP(1, -10, 5); X.fillStyle = PINK; X.fill(); X.lineWidth = 1.2; X.strokeStyle = INK; X.stroke(); }
        });
        P(() => ell(0, -23, 11, 3), '#6a3a1e', { flat: 1, lw: 1.4, sil: false });
        if (M) for (let i = 0; i < 2; i++) {
          const ph = (t * .7 + i * .5) % 1, sx = -4 + i * 8 + Math.sin(t * 3 + i) * 2;
          X.globalAlpha = .7 * Math.sin(ph * Math.PI);
          ln(sx, -28 - ph * 8, sx + Math.sin(t * 4 + i * 2) * 5, -36 - ph * 10, sx, -44 - ph * 12, 2.4, '#fff');
          X.globalAlpha = 1;
        }
      }
    };
    // chubby mitten hand (hand-local)
    const fist = (col, r) => {
      P(() => ell(0, 0, r * 1.08, r), col, { d: 3, h: 1.4, spec: [-r * .25, -r * .45, r * .32, r * .18, -.4], post: T => { tl(r * .1, -r * .2, r * .55, r * .05, r * .9, -r * .1, 1.2, T.dd); tl(r * .05, r * .3, r * .5, r * .5, r * .85, r * .35, 1.2, T.dd); } });
      P(() => ell(-r * .35, -r * .62, r * .5, r * .36, -.5), col, { d: 1.2, h: .8, sil: false, lw: 1.8 });
    };

    // ---------------- head (head-local: origin at head centre) ----------------
    const headP = () => {
      X.moveTo(-50, -4);
      X.bezierCurveTo(-50, -38, -26, -52, 2, -52);
      X.bezierCurveTo(32, -52, 53, -32, 53, -2);
      X.bezierCurveTo(53, 24, 40, 44, 16, 47);
      X.bezierCurveTo(-14, 50, -50, 34, -50, -4);
      X.closePath();
    };
    const tufts = () => P(() => poly([-34, -26, -58, -14, -50, -6, -62, 6, -48, 8, -56, 22, -40, 16, -38, 30, -26, 12, -20, -10]), hairC, { d: 3, post: T => { tl(-50, -2, -40, 0, -30, -4, 1.4, T.dd); tl(-50, 14, -40, 12, -30, 10, 1.2, T.dd); } });
    const headBack = () => {      // live, animated pieces behind head & body (head-local)
      const sw = swayBase();
      if (jas) {                    // HIGH BRAIDED PONYTAIL
        const p0x = -20, p0y = -58, p1x = -84, p1y = -78, p2x = -74 + sw, p2y = 64;
        const n = 18, pts = [];
        for (let i = 0; i <= n; i++) {
          const u = i / n, a = 1 - u;
          const x = a * a * p0x + 2 * a * u * p1x + u * u * p2x + Math.sin(t * 2.3 + seed + u * 3) * u * 2.5;
          const y = a * a * p0y + 2 * a * u * p1y + u * u * p2y;
          const tx = 2 * a * (p1x - p0x) + 2 * u * (p2x - p1x), ty = 2 * a * (p1y - p0y) + 2 * u * (p2y - p1y);
          pts.push([x, y, Math.atan2(ty, tx), u]);
        }
        const tip = pts[n];
        P(() => { X.moveTo(tip[0] - 8, tip[1] - 8); X.quadraticCurveTo(tip[0] - 9, tip[1] + 8, tip[0] - 4 + sw * .2, tip[1] + 18); X.lineTo(tip[0] + 1, tip[1] + 10); X.lineTo(tip[0] + 4 + sw * .2, tip[1] + 17); X.quadraticCurveTo(tip[0] + 8, tip[1] + 6, tip[0] + 7, tip[1] - 8); X.closePath(); }, hairC, { d: 2.5, h: 1.2 });
        for (let i = n - 1; i >= 1; i--) {
          const q = pts[i], r = 14 - q[3] * 6, side = i % 2 ? 1 : -1;
          const ox = Math.cos(q[2] + H) * side * 2.6, oy = Math.sin(q[2] + H) * side * 2.6;
          P(() => ell(q[0] + ox, q[1] + oy, r * .95, r * .62, q[2] + side * .5), hairC, { d: 3, h: 1.6, lw: 1.9, post: T => tl(q[0] + ox - Math.cos(q[2]) * r * .5, q[1] + oy - Math.sin(q[2]) * r * .5, q[0] + ox, q[1] + oy - 3, q[0] + ox + Math.cos(q[2]) * r * .4, q[1] + oy + Math.sin(q[2]) * r * .4, 1.4, 'rgba(255,220,240,.45)') });
        }
      } else if (roxor) {           // long mullet tail
        const m = sw * .8;
        P(() => { X.moveTo(-46, -8); X.quadraticCurveTo(-60, 22, -60 + m, 56); X.lineTo(-52 + m, 46); X.lineTo(-52 + m * .9, 68); X.lineTo(-42 + m * .7, 50); X.lineTo(-36 + m * .5, 62); X.quadraticCurveTo(-30, 34, -22, 16); X.closePath(); }, hairC, {
          d: 4, post: T => { tl(-48, 6, -52, 30, -54 + m, 52, 1.4, T.dd); tl(-38, 10, -40, 30, -42 + m * .8, 48, 1.2, T.dd); tl(-50, -2, -54, 14, -54, 30, 1.6, 'rgba(255,220,190,.35)'); }
        });
      } else if (hat === 'hair' && seed % 2 === 1) {        // generic puffy ponytail
        P(() => { X.moveTo(-40, -30); X.quadraticCurveTo(-74, -30, -72 + sw * .5, 10); X.quadraticCurveTo(-72 + sw, 40, -58 + sw, 56); X.quadraticCurveTo(-54 + sw * .6, 28, -46, 12); X.quadraticCurveTo(-38, -4, -28, -8); X.closePath(); }, hairC, { d: 4, post: T => { tl(-62, -14, -66 + sw * .5, 12, -60 + sw, 44, 1.4, T.dd); tl(-52, -18, -56, 2, -52 + sw * .6, 26, 1.6, T.ll); } });
        P(() => ell(-42, -24, 7, 6, .6), acc, { d: 1.5, h: 1 });
      }
      if (hat === 'bandana') {
        const f1 = Math.sin(t * 5 + seed) * 4, f2 = Math.sin(t * 6 + seed + 2) * 4;
        P(() => { X.moveTo(-50, -20); X.quadraticCurveTo(-64, -20 + f1, -78, -12 + f1); X.quadraticCurveTo(-74, -2 + f1, -66, -2 + f1 * .6); X.quadraticCurveTo(-58, -10, -48, -10); X.closePath(); }, mixc(hc, '#140a14', .15), { d: 2, h: 1 });
        P(() => { X.moveTo(-50, -14); X.quadraticCurveTo(-60, -4 + f2, -66, 12 + f2); X.quadraticCurveTo(-58, 16 + f2, -54, 12 + f2 * .6); X.quadraticCurveTo(-52, 2, -46, -8); X.closePath(); }, hc, { d: 2, h: 1 });
      }
    };
    const head = () => {
      if (hat === 'cap' || hat === 'bowler' || hat === 'tophat' || hat === 'bandana' || hat === 'helm') tufts();
      if (hat === 'hair' && !jas) {   // back hair mass behind the head
        P(() => { X.moveTo(-40, -36); X.quadraticCurveTo(-64, -10, -58, 30); X.quadraticCurveTo(-48, 40, -34, 34); X.lineTo(-30, 0); X.closePath(); }, mixc(hairC, '#150a14', .1), { d: 3, h: 1 });
      }
      P(headP, skin, {
        d: 7, h: 2.4, post: T => {
          if (hat === 'mohawk') { X.globalAlpha = .28; ellF(-14, -30, 44, 22, -.25, hairC); ellF(-38, -4, 12, 22, 0, hairC); X.globalAlpha = 1; for (let i = 0; i < 14; i++) dot(-40 + (i * 37 % 50), -38 + (i * 23 % 30), .9, mixc(hairC, skin, .4)); }
          if (hat === 'bald') { tl(-30, -34, -8, -52, 18, -44, 5, 'rgba(255,255,255,.6)'); dot(26, -40, 2.4, 'rgba(255,255,255,.7)'); }
          if (bass) { X.globalAlpha = .22; ellF(22, 36, 32, 14, -.1, '#3a2a30'); X.globalAlpha = 1; }
          // rosy cheeks
          for (const q of [[-6, 26, 10, 5.5], [42, 25, 6.5, 4.6]]) {
            const g = X.createRadialGradient(q[0], q[1], 1, q[0], q[1], q[2] * 1.3);
            g.addColorStop(0, 'rgba(255,100,140,.55)'); g.addColorStop(1, 'rgba(255,100,140,0)');
            X.fillStyle = g; X.beginPath(); X.ellipse(q[0], q[1], q[2] * 1.3, q[3] * 1.3, 0, 0, TAU); X.fill();
          }
        }
      });
      // tiny nose
      tl(22, 22, 25, 25, 21, 26, 1.3, skT.dd);
      // ear
      const earP = () => { X.moveTo(-30, 2); X.bezierCurveTo(-44, -6, -50, 14, -40, 22); X.quadraticCurveTo(-34, 26, -30, 20); X.closePath(); };
      if (hat !== 'hood' && !roxor) P(earP, skin, { d: 2, h: 1, sil: false, post: T => tl(-34, 6, -42, 12, -36, 18, 1.5, T.dd) });
      // scar -> cute band-aid sticker
      if (s.scar) { X.save(); X.translate(-14, 30); X.rotate(-.5); P(() => rr(-10, -4.5, 20, 9, 4.5), '#ffd7b0', { d: 1.5, h: 1, sil: false, post: () => { X.beginPath(); rr(-4, -4.5, 8, 9, 1.5); X.fillStyle = '#f2bf92'; X.fill(); for (const q of [[-1.5, -2], [1.5, -2], [-1.5, 2], [1.5, 2]]) dot(q[0], q[1], .7, '#c48a60'); } }); X.restore(); }
      // beard (fluffy chibi beard)
      if (s.beard) {
        P(() => { X.moveTo(-40, 14); X.bezierCurveTo(-42, 44, -18, 70, 10, 68); X.bezierCurveTo(38, 66, 56, 44, 52, 16); X.quadraticCurveTo(44, 36, 30, 40); X.quadraticCurveTo(16, 44, 4, 38); X.quadraticCurveTo(-20, 32, -40, 14); X.closePath(); }, s.beard, {
          d: 5, spec: [30, 52, 4, 2.2, -.3], post: T => { for (let i = 0; i < 5; i++) tl(-26 + i * 14, 40 + (i % 2) * 4, -24 + i * 14, 50 + (i % 2) * 4, -20 + i * 13, 60, 1.3, T.dd); }
        });
        P(() => { X.moveTo(8, 30); X.quadraticCurveTo(14, 20, 24, 24); X.quadraticCurveTo(34, 18, 44, 26); X.quadraticCurveTo(48, 32, 42, 32); X.quadraticCurveTo(34, 28, 24, 31); X.quadraticCurveTo(14, 34, 8, 30); X.closePath(); }, s.beard, { d: 2, h: 1, sil: false });
      }
      // ---- hair & hats ----
      if (hat === 'hair' && jas) {
        P(() => { X.moveTo(-50, 18); X.bezierCurveTo(-60, -34, -26, -62, 6, -60); X.bezierCurveTo(40, -58, 58, -36, 54, -6); X.quadraticCurveTo(48, -20, 36, -24); X.quadraticCurveTo(14, -30, -6, -26); X.quadraticCurveTo(-24, -20, -30, -4); X.quadraticCurveTo(-38, 14, -50, 18); X.closePath(); }, hairC, {
          d: 5, h: 2, post: T => {
            tl(-30, -44, -6, -58, 22, -52, 3, 'rgba(255,220,240,.38)');          // shine ring
            tl(22, -29, 6, -46, -10, -58, 1.4, T.dd);                            // centre part
            for (let i = 0; i < 6; i++) { const x = 30 - i * 9, y = -32 - i * 4.4; ln(x - 3, y - 3, x, y + 1, x + 3, y - 2, 1.6, T.ll); ln(x - 3, y - 3, x - 1, y - 6, x + 2, y - 7, 1.2, T.dd); } // cornrow braid
          }
        });
        P(() => { X.moveTo(46, -18); X.quadraticCurveTo(58, 2, 54, 30); X.quadraticCurveTo(50, 18, 44, 4); X.closePath(); }, hairC, { d: 1.5, h: 1, sil: false });   // face-framing strand
        // scrunchie at the ponytail base
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; P(() => ell(-22 + Math.cos(a) * 8, -58 + Math.sin(a) * 5, 6.5, 5.5, a), i % 2 ? PINK : PINK_L, { d: 1.5, h: 1, lw: 1.8 }); }
        P(() => ell(-22, -58, 6, 4), PINK_D, { flat: 1, lw: 1.6, sil: false });
        // hair clips
        X.save(); X.translate(30, -36); X.rotate(-.5); P(() => rr(-9, -2.6, 18, 5.2, 2.6), PINK, { d: 1, h: 1, sil: false, spec: [-4, -1.2, 3, .9, 0] }); X.restore();
        X.save(); X.translate(16, -42); X.rotate(-.35); P(() => rr(-7, -2.4, 14, 4.8, 2.4), LIME, { d: 1, h: 1, sil: false }); X.restore();
        // ear + earring
        P(earP, skin, { d: 2, h: 1, sil: false, post: T => tl(-34, 6, -42, 12, -36, 18, 1.5, T.dd) });
        if (M) { X.beginPath(); X.arc(-36, 28, 4, 0, TAU); X.lineWidth = 3.6; X.strokeStyle = INK; X.stroke(); X.lineWidth = 1.8; X.strokeStyle = GOLD; X.stroke(); }
        P(() => heartP(-36, 34, 3.4), PINK, { flat: 1, lw: 1.3, sil: false });
      } else if (hat === 'hair') {
        const fl = Math.sin(t * 2.6 + seed) * .8;
        P(() => {
          X.moveTo(-52, 22); X.bezierCurveTo(-62, -30, -30, -62, 4, -60); X.bezierCurveTo(40, -60, 62, -32, 55, -2);
          X.lineTo(50, -8 + fl); X.quadraticCurveTo(46, -18, 40, -16); X.quadraticCurveTo(36, -8 + fl, 30, -9); X.quadraticCurveTo(26, -20, 16, -20);
          X.quadraticCurveTo(10, -10 + fl, 2, -12); X.quadraticCurveTo(-4, -22, -14, -22); X.quadraticCurveTo(-20, -10, -28, -2);
          X.quadraticCurveTo(-32, 12, -38, 20); X.quadraticCurveTo(-44, 28, -52, 22); X.closePath();
        }, hairC, {
          d: 5, h: 2.2, post: T => { tl(-34, -40, -6, -56, 26, -48, 3.2, 'rgba(255,255,255,.4)'); tl(-40, -6, -36, -26, -20, -40, 1.4, T.dd); tl(6, -26, 16, -36, 30, -36, 1.3, T.dd); }
        });
      } else if (hat === 'mohawk') {
        const sw = Math.sin(t * 3 + seed) * 1.2;
        P(() => {
          X.moveTo(-46, -10); X.quadraticCurveTo(-56, -32, -68 + sw, -46); X.quadraticCurveTo(-48, -44, -38, -38);
          X.quadraticCurveTo(-44, -60, -50 + sw, -74); X.quadraticCurveTo(-26, -66, -18, -48);
          X.quadraticCurveTo(-16, -72, -18 + sw, -88); X.quadraticCurveTo(4, -76, 4, -52);
          X.quadraticCurveTo(12, -74, 20 + sw, -84); X.quadraticCurveTo(28, -62, 20, -44);
          X.quadraticCurveTo(34, -56, 44 + sw, -56); X.quadraticCurveTo(42, -38, 32, -30); X.quadraticCurveTo(-2, -50, -46, -10); X.closePath();
        }, hairC, {
          d: 5, h: 2.2, post: T => { tl(-30, -42, -42, -54, -48 + sw, -70, 1.4, T.dd); tl(-10, -48, -14, -66, -16 + sw, -82, 1.4, T.dd); tl(8, -50, 14, -66, 18 + sw, -78, 1.3, T.dd); tl(-24, -54, -12, -64, -6, -74, 2.4, 'rgba(255,230,200,.45)'); tl(18, -50, 26, -54, 38, -54, 1.6, 'rgba(255,230,200,.4)'); }
        });
      } else if (hat === 'cap') {
        P(() => { X.moveTo(-56, -4); X.bezierCurveTo(-60, -48, -28, -66, 4, -65); X.bezierCurveTo(38, -64, 58, -42, 54, -14); X.quadraticCurveTo(0, -28, -56, -4); X.closePath(); }, hc, {
          d: 6, spec: [26, -50, 6, 3, -.6], post: T => { ln(4, -65, 8, -44, 6, -22, 1.6, T.dd); stitch(-50, -10, 0, -30, 52, -18, T.l); }
        });
        P(() => starP(22, -40, 8, 3.8, 0), hc === YEL ? PINK : YEL, { d: 1.5, h: 1, sil: false });
        P(() => ell(4, -65, 4, 2.6), tone(hc).d, { d: 1, h: .8 });
        P(() => { X.moveTo(30, -20); X.quadraticCurveTo(70, -32, 88, -16); X.quadraticCurveTo(92, -6, 80, -5); X.quadraticCurveTo(56, -10, 34, -8); X.closePath(); }, mixc(hc, '#15101c', .15), { d: 3, h: 1.6 });
      } else if (hat === 'tophat') {
        c.save(); c.translate(4, 0); c.rotate(-.08);
        const band = hc === acc ? PINK : acc;
        P(() => ell(2, -44, 62, 11), mixc(hc, '#000000', .2), { d: 3, h: 1.6 });
        P(() => { X.moveTo(-32, -46); X.quadraticCurveTo(-37, -86, -31, -114); X.quadraticCurveTo(2, -122, 37, -114); X.quadraticCurveTo(42, -86, 37, -46); X.quadraticCurveTo(2, -38, -32, -46); X.closePath(); }, hc, {
          d: 8, spec: [26, -96, 3.4, 12, .05], post: () => { X.beginPath(); X.moveTo(-36, -64); X.quadraticCurveTo(2, -56, 40, -64); X.lineTo(40, -50); X.quadraticCurveTo(2, -42, -36, -50); X.closePath(); X.fillStyle = band; X.fill(); X.lineWidth = 1.8; X.strokeStyle = INK; X.stroke(); }
        });
        P(() => ell(3, -114, 34, 7), mixc(hc, '#ffffff', .12), { d: 1.5, h: 1 });
        P(() => starP(24, -57, 8, 3.6, .1), band === YEL || band === GOLD ? PINK_L : YEL, { d: 1.5, h: 1, sil: false });
        c.restore();
      } else if (hat === 'bowler') {
        P(() => ell(2, -38, 60, 9), mixc(hc, '#000000', .2), { d: 2, h: 1.4 });
        P(() => { X.moveTo(-38, -40); X.bezierCurveTo(-42, -94, 46, -94, 42, -40); X.quadraticCurveTo(2, -32, -38, -40); X.closePath(); }, hc, {
          d: 7, spec: [22, -72, 6, 3.4, -.6], post: () => { X.beginPath(); X.moveTo(-40, -52); X.quadraticCurveTo(2, -44, 44, -52); X.lineTo(43, -40); X.quadraticCurveTo(2, -32, -39, -40); X.closePath(); X.fillStyle = mixc(acc, '#000000', .2); X.fill(); X.lineWidth = 1.6; X.strokeStyle = INK; X.stroke(); }
        });
        P(() => heartP(30, -46, 4.4), PINK, { flat: 1, lw: 1.3, sil: false });
      } else if (hat === 'helm') {        // cute hard hat
        P(() => { X.moveTo(-56, -12); X.bezierCurveTo(-58, -66, 58, -72, 56, -14); X.quadraticCurveTo(0, -26, -56, -12); X.closePath(); }, hc, {
          d: 7, spec: [24, -50, 7, 3.4, -.6], post: T => { X.beginPath(); X.moveTo(-6, -62); X.quadraticCurveTo(2, -66, 10, -62); X.lineTo(12, -22); X.lineTo(-8, -20); X.closePath(); X.fillStyle = T.l; X.fill(); X.lineWidth = 1.6; X.strokeStyle = INK; X.stroke(); }
        });
        P(() => { X.moveTo(-62, -16); X.quadraticCurveTo(0, -32, 72, -20); X.quadraticCurveTo(76, -12, 70, -10); X.quadraticCurveTo(0, -22, -62, -6); X.quadraticCurveTo(-66, -11, -62, -16); X.closePath(); }, mixc(hc, '#15101c', .12), { d: 2, h: 1.4 });
        P(() => starP(-26, -40, 8, 3.6, -.2), PINK, { d: 1.5, h: 1, sil: false });
      } else if (hat === 'bandana') {
        P(() => { X.moveTo(-56, -2); X.bezierCurveTo(-60, -52, -24, -66, 6, -64); X.bezierCurveTo(40, -62, 58, -40, 54, -14); X.quadraticCurveTo(14, -30, -24, -18); X.quadraticCurveTo(-42, -12, -56, -2); X.closePath(); }, hc, {
          d: 6, spec: [24, -50, 5, 2.6, -.6], post: () => { const pts = [-36, -36, -16, -50, 6, -52, 26, -44, -20, -30, 0, -34, 40, -32, -44, -18, 16, -24]; for (let i = 0; i < pts.length; i += 2) ellF(pts[i], pts[i + 1], 3, 3, 0, 'rgba(255,255,255,.85)'); }
        });
        P(() => ell(-50, -16, 8, 7, .4), mixc(hc, '#000000', .12), { d: 2, h: 1 });
      } else if (hat === 'hood') {
        P(() => { ell(-4, -4, 64, 60); ell(16, 10, 44, 42, 0, true); }, hc, {
          d: 7, spec: [-30, -40, 7, 4, -.7], post: T => { tl(-56, 20, -60, -10, -46, -40, 2, T.dd); stitch(-26, -54, 10, -66, 44, -48, T.l); }
        });
        if (M) { X.save(); X.beginPath(); headP(); X.clip(); X.beginPath(); X.ellipse(16, 10, 44, 42, 0, 0, TAU); X.lineWidth = 9; X.strokeStyle = 'rgba(40,20,70,.25)'; X.stroke(); X.restore(); }
        // strings
        ln(-10, 48, -12, 60, -8, 74, 2.4, CREAM); ln(40, 48, 42, 60, 40, 72, 2.4, CREAM);
      }
      // ---- hero accessories ----
      if (roxor) {
        // headband with cyan waveform
        P(() => { X.moveTo(-52, -18); X.quadraticCurveTo(4, -42, 55, -22); X.lineTo(55, -9); X.quadraticCurveTo(4, -30, -52, -5); X.closePath(); }, NAVY, {
          d: 2, h: 1.2, post: () => {
            if (M) { X.save(); X.shadowColor = CYAN; X.shadowBlur = 6; X.fillStyle = '#7ff0ff'; for (let i = 0; i < 9; i++) { const x = 8 + i * 4, hh = [3, 6, 9, 5, 10, 7, 4, 8, 3][i]; X.fillRect(x - 1, -26 + (x - 8) * .2 - hh / 2, 2.2, hh); } X.restore(); }
          }
        });
        // headphone cup on the ear
        P(() => ell(-38, 10, 13, 16, .1), '#2a2f45', { d: 3, h: 1.4, spec: [-42, 2, 3, 2, -.5] });
        if (M) { X.save(); X.shadowColor = CYAN; X.shadowBlur = 8; X.beginPath(); X.ellipse(-37, 10, 7.5, 10, .1, 0, TAU); X.lineWidth = 3; X.strokeStyle = CYAN; X.stroke(); X.restore(); }
      }
    };
    const skT = tone(skin);

    // ---------------- face (head-local, live) ----------------
    const face = () => {
      if (!M) return;
      const iT = tone(irisC);
      const eye = (cx, cy, rx, ry, near) => {
        if (mood === 'hurt') {                     // >< squeezed eyes
          const d = near ? 1 : -1;
          X.lineWidth = 3.4; X.strokeStyle = INK; X.beginPath();
          X.moveTo(cx - rx * .8 * d, cy - ry * .5); X.lineTo(cx + rx * .6 * d, cy); X.lineTo(cx - rx * .8 * d, cy + ry * .5); X.stroke(); return;
        }
        if (blink) { X.beginPath(); X.moveTo(cx - rx, cy + 1); X.quadraticCurveTo(cx, cy + ry * .55, cx + rx, cy + 1); X.lineWidth = 3.2; X.strokeStyle = INK; X.stroke(); return; }
        const eP = () => { X.moveTo(cx + rx, cy); X.ellipse(cx, cy, rx, ry, 0, 0, TAU); };
        X.beginPath(); eP(); X.fillStyle = '#ffffff'; X.fill();
        X.save(); X.beginPath(); eP(); X.clip();
        const ix = cx + rx * .1, iy = cy + ry * .1, irx = rx * .86, iry = ry * .88;
        const g = X.createLinearGradient(0, iy - iry, 0, iy + iry);
        g.addColorStop(0, iT.dd); g.addColorStop(.5, irisC); g.addColorStop(1, iT.ll);
        X.beginPath(); X.ellipse(ix, iy, irx, iry, 0, 0, TAU); X.fillStyle = g; X.fill(); X.lineWidth = 1.6; X.strokeStyle = iT.dd; X.stroke();
        ellF(ix, iy - ry * .05, irx * .46, iry * .5, 0, '#1a0e1e');
        tl(ix - irx * .7, iy + iry * .45, ix, iy + iry * 1.05, ix + irx * .7, iy + iry * .45, iry * .2, 'rgba(255,255,255,.45)');
        X.fillStyle = 'rgba(50,20,70,.22)'; X.fillRect(cx - rx - 2, cy - ry - 2, rx * 2 + 4, ry * .55);
        // mood lids
        let lid = null;
        if (mood === 'angry') lid = near ? [cx - rx - 2, cy - ry * .9, cx + rx + 2, cy - ry * .2] : [cx - rx - 2, cy - ry * .2, cx + rx + 2, cy - ry * .9];
        else if (mood === 'grim') lid = [cx - rx - 2, cy - ry * .42, cx + rx + 2, cy - ry * .42];
        else if (mood === 'sad') lid = near ? [cx - rx - 2, cy - ry * .4, cx + rx + 2, cy - ry * .85] : [cx - rx - 2, cy - ry * .85, cx + rx + 2, cy - ry * .4];
        if (lid) { X.beginPath(); X.moveTo(lid[0], lid[1]); X.lineTo(lid[2], lid[3]); X.lineTo(lid[2], cy - ry - 4); X.lineTo(lid[0], cy - ry - 4); X.closePath(); X.fillStyle = skin; X.fill(); }
        X.restore();
        // lash line + lower lid
        if (lid) { X.beginPath(); X.moveTo(lid[0] + 1, lid[1]); X.lineTo(lid[2] - 1, lid[3]); X.lineWidth = 3.6; X.strokeStyle = INK; X.stroke(); }
        else {
          tl(cx - rx - 1, cy - ry * .15, cx, cy - ry * 1.25, cx + rx + 1.5, cy - ry * .35, 2.4, INK);
          if (jas) { tl(cx + rx * .6, cy - ry * .75, cx + rx + 3, cy - ry * .9, cx + rx + 5, cy - ry * 1.2, 1.3, INK); }
        }
        X.beginPath(); X.ellipse(cx, cy, rx, ry, 0, .25, Math.PI - .25); X.lineWidth = 1.3; X.strokeStyle = 'rgba(40,20,40,.6)'; X.stroke();
        // catch-lights
        const hy = lid ? Math.max(cy - ry * .2, Math.min(lid[1], lid[3]) + ry * .35) : cy - ry * .32;
        ellF(ix - irx * .32, hy, rx * .34, ry * .24, -.4, '#ffffff');
        dot(ix + irx * .34, iy + iry * .36, rx * .14, 'rgba(255,255,255,.9)');
        if (jas) sparkle(ix + irx * .3, cy - ry * .45, rx * .22, '#fff');
      };
      eye(4, 8, 11, 14, true);
      if (s.patch) {
        P(() => ell(32, 7, 10.5, 12.5), '#2a2433', { d: 2, h: 1.4, sil: false, spec: [28, 2, 2.4, 1.6, -.5] });
        ln(26, -3, 0, -26, -48, -14, 2.4, INK);
        P(() => starP(32, 7, 5, 2.3, 0), YEL, { flat: 1, lw: 1, sil: false });
      } else eye(32, 6, 9, 13.5, false);
      // brows
      let a1 = 0, a2 = 0, lift = 0;
      if (mood === 'angry') { a1 = 5; a2 = -5; lift = 3; } else if (mood === 'sad' || mood === 'hurt') { a1 = -4; a2 = 4; lift = -1; }
      else if (mood === 'grin') { lift = -3; } else if (mood === 'grim') { a1 = 1.5; a2 = -1.5; lift = 1; }
      const by = -12 + lift;
      tl(-6, by + 1 - a1 * .5, 4, by - 4, 13, by + a1, 2.6, browC);
      tl(25, by + a2, 32, by - 4, 39, by + 1 - a2 * .5, 2.2, browC);
      // mouth
      const mo = talk > 0 ? Math.abs(Math.sin(t * 14)) * talk : 0;
      const lipC = jas ? '#c83a6a' : '#7a1c34';
      if (mo > .18 || mood === 'grin' || mood === 'hurt') {
        const hgt = mo > .18 ? 4 + mo * 8 : mood === 'hurt' ? 7 : 9;
        X.beginPath();
        if (mood === 'hurt' && mo <= .18) { X.moveTo(12, 36); X.lineTo(16, 32); X.lineTo(20, 36); X.lineTo(24, 32); X.lineTo(28, 36); X.quadraticCurveTo(20, 42, 12, 36); }
        else { X.moveTo(11, 31); X.quadraticCurveTo(20, 33, 30, 30); X.quadraticCurveTo(29, 31 + hgt * 1.2, 20, 31 + hgt); X.quadraticCurveTo(12, 31 + hgt * .9, 11, 31); }
        X.closePath(); X.fillStyle = lipC; X.fill();
        X.save(); X.clip(); X.fillStyle = '#ffffff'; X.fillRect(8, 26, 26, 4.6); ellF(21, 32 + hgt, 7, 4.2, 0, '#ff7a9a'); X.restore();
        X.lineWidth = 2; X.strokeStyle = INK; X.stroke();
      } else if (mood === 'angry') {
        if (bass) { tl(12, 34, 20, 33, 29, 30, 1.8, INK); tl(28, 29, 30, 30, 31, 32, 1, INK); }         // friendly-grumpy smirk
        else {
          X.beginPath(); X.moveTo(12, 36); X.quadraticCurveTo(20, 29, 29, 35); X.quadraticCurveTo(20, 35, 12, 36); X.closePath(); X.fillStyle = '#ffffff'; X.fill();
          X.lineWidth = 2; X.strokeStyle = INK; X.stroke(); ln(16, 33.6, 16.5, 34, 17, 35, 1, INK); ln(24, 33.2, 24.5, 34, 25, 35, 1, INK);
        }
      } else if (mood === 'sad') { ln(13, 35, 20, 30, 28, 35, 2.2, INK); }
      else if (mood === 'blank') { ellF(20, 33, 3, 2.6, 0, lipC); }
      else { tl(13, 33, 20, 35, 28, 32, 1.6, INK); }
      // hurt sweat drop
      if (mood === 'hurt') { X.beginPath(); X.moveTo(46, -26); X.quadraticCurveTo(54, -14, 50, -10); X.quadraticCurveTo(44, -8, 43, -14); X.closePath(); X.fillStyle = SKY; X.fill(); X.lineWidth = 1.6; X.strokeStyle = INK; X.stroke(); }
    };

    // ---------------- torso (body frame) ----------------
    const bodyP = (hm, fl) => () => {
      X.moveTo(-cw + 8, TT - 2);
      X.quadraticCurveTo(-cw - 3, TT, -cw - 3, TT + 18);
      X.bezierCurveTo(-cw - 5, TT + 44, -cw - 6 - fl, hm - 16, -cw - 3 - fl, hm - 2);
      X.quadraticCurveTo(0, hm + 7, cw + 4 + fl, hm - 2);
      X.bezierCurveTo(cw + 7 + fl, hm - 16, cw + 5, TT + 44, cw + 3, TT + 18);
      X.quadraticCurveTo(cw + 3, TT, cw - 8, TT - 2);
      X.quadraticCurveTo(0, TT - 6, -cw + 8, TT - 2);
      X.closePath();
    };
    const torsoRoxor = () => {
      P(bodyP(HM, 2), SKY, {
        fill: tieDye(), d: 9, spec: [cw - 6, TT + 18, 4, 2.6, -.6], post: () => {
          X.fillStyle = 'rgba(90,70,170,.18)'; X.beginPath(); rr(-cw - 10, HM - 12, 2 * cw + 20, 16, 4); X.fill();
          ln(-cw - 6, HM - 11, 2, HM - 6, cw + 8, HM - 11, 1.8, INK);
          for (let i = 0; i < 9; i++) { const x = -cw + 2 + i * (2 * cw) / 8; ln(x, HM - 9, x, HM - 5, x, HM + 2, 1, 'rgba(60,40,120,.3)'); }
        }
      });
      P(() => { X.moveTo(-cw + 8, -94); X.lineTo(cw - 2, -94); X.quadraticCurveTo(cw + 3, -80, cw, -70); X.lineTo(-cw + 5, -70); X.quadraticCurveTo(-cw + 1, -82, -cw + 8, -94); X.closePath(); }, LAV, {
        fill: tieDye(), d: 3, h: 1.2, sil: false, post: () => { tl(-cw + 6, -92, -cw + 3, -82, -cw + 6, -71, 2, 'rgba(50,30,100,.35)'); tl(cw - 2, -92, cw + 1, -82, cw - 1, -71, 2, 'rgba(50,30,100,.35)'); }
      });
      // glowing ring emblem
      if (M) {
        X.save(); X.shadowColor = CYAN; X.shadowBlur = 12;
        const ex = -3, ey = -108;
        X.beginPath(); X.arc(ex, ey, 11, 0, TAU); X.lineWidth = 4; X.strokeStyle = CYAN; X.stroke();
        X.beginPath(); X.arc(ex, ey, 4.5, 0, TAU); X.fillStyle = '#c8faff'; X.fill(); X.restore();
        X.beginPath(); X.arc(ex, ey, 13.6, 0, TAU); X.lineWidth = 1.4; X.strokeStyle = INK; X.stroke();
        X.beginPath(); X.arc(ex, ey, 8.4, 0, TAU); X.stroke();
        for (const a of [-.4, 2.7]) ln(ex + Math.cos(a) * 17, ey + Math.sin(a) * 17, ex + Math.cos(a + .3) * 18, ey + Math.sin(a + .3) * 18, ex + Math.cos(a + .6) * 17, ey + Math.sin(a + .6) * 17, 2, CYAN_D);
      }
      // hood bunched behind the neck + drawstrings
      P(() => { X.moveTo(-cw + 2, TT + 10); X.quadraticCurveTo(-cw - 8, TT - 16, 4, TT - 14); X.quadraticCurveTo(cw + 8, TT - 16, cw + 1, TT + 8); X.quadraticCurveTo(8, TT + 2, -cw + 2, TT + 10); X.closePath(); }, LAV, { fill: tieDye(), d: 4 });
      for (const x of [2, 16]) { ln(x, TT + 4, x - 2, TT + 18, x, TT + 30, 4.4, INK); ln(x, TT + 4, x - 2, TT + 18, x, TT + 30, 2.2, CREAM); P(() => rr(x - 2.6, TT + 29, 5.2, 7, 2), CYAN, { flat: 1, lw: 1.4, sil: false }); }
    };
    const torsoJasmin = () => {
      P(() => { X.moveTo(-cw + 2, -84); X.lineTo(cw + 2, -84); X.quadraticCurveTo(cw + 14, -62, cw + 20, -40); X.quadraticCurveTo(0, -32, -cw - 18, -40); X.quadraticCurveTo(-cw - 10, -62, -cw + 2, -84); X.closePath(); }, PINK_L, {
        d: 6, spec: [cw + 4, -60, 2.4, 6, -.4], post: T => { for (let i = 0; i < 5; i++) { const x = -cw - 6 + i * (2 * cw + 18) / 4; ln(x * .7 + 1, -82, x * .9, -62, x, -38, 1.4, T.d); } for (let i = 0; i < 7; i++) { X.beginPath(); heartP(-cw - 4 + i * (2 * cw + 10) / 6, -52 + (i % 2) * 8, 2.4); X.fillStyle = 'rgba(255,255,255,.75)'; X.fill(); } }
      });
      P(bodyP(-80, 0), '#ffd6e6', { d: 6 });
      P(bodyP(-70, 1), coat, {
        d: 9, spec: [cw - 6, TT + 16, 4, 2.4, -.6], post: T => {
          stitch(-cw - 2, -78, 0, -73, cw + 4, -78, T.ll);
          for (const x of [-cw + 6, cw - 14]) { X.beginPath(); rr(x, -120, 13, 11, 2); X.fillStyle = T.d; X.fill(); X.lineWidth = 1.5; X.strokeStyle = INK; X.stroke(); stitch(x + 1, -116, x + 6.5, -115, x + 12, -116, T.ll); }
        }
      });
      P(() => { X.moveTo(-1, TT - 2); X.lineTo(19, TT - 2); X.quadraticCurveTo(16, -100, 15, -70); X.lineTo(3, -70); X.quadraticCurveTo(2, -100, -1, TT - 2); X.closePath(); }, '#ffd6e6', { d: 3, h: 1, sil: false });
      for (const y of [-112, -96, -80]) { dot(1.5, y, 3, INK); dot(1.5, y, 2, SILVER); }
      P(() => poly([-4, TT - 3, -14, TT + 12, 1, TT + 12, 4, TT]), mixc(coat, '#ffffff', .2), { d: 2, h: 1, sil: false });
      P(() => poly([22, TT - 3, 32, TT + 12, 18, TT + 12, 15, TT]), mixc(coat, '#ffffff', .2), { d: 2, h: 1, sil: false });
      if (M) { X.beginPath(); X.moveTo(1, TT - 2); X.quadraticCurveTo(9, TT + 22, 18, TT - 2); X.lineWidth = 1.6; X.strokeStyle = GOLD; X.stroke(); }
      P(() => heartP(9.5, TT + 12, 4), PINK_D, { flat: 1, lw: 1.4, sil: false, spec: [8, TT + 10, 1.2, .8, 0] });
    };
    const torsoBass = () => {
      P(bodyP(HM, 4), coat, {
        d: 9, spec: [cw - 6, TT + 18, 4.5, 2.6, -.6], post: T => { tl(-cw + 4, -80, -cw + 12, -76, -cw + 18, -78, 2, T.l); tl(cw - 16, -72, cw - 8, -74, cw, -70, 2, T.l); }
      });
      P(() => ell(10, -98, 17, 17), YEL, {
        d: 4, h: 1.4, sil: false, spec: [3, -106, 3.4, 2.2, -.6], post: () => { ellF(4, -102, 2.4, 4, 0, INK); ellF(16, -102, 2.4, 4, 0, INK); ln(1, -94, 10, -84, 19, -94, 2.6, INK); }
      });
      P(() => { X.moveTo(-cw + 10, TT); X.quadraticCurveTo(8, TT + 10, cw - 6, TT); X.lineTo(cw - 7, TT + 5); X.quadraticCurveTo(8, TT + 16, -cw + 11, TT + 5); X.closePath(); }, mixc(coat, '#ffffff', .1), { d: 1.5, h: 1, sil: false });
    };
    const torsoGeneric = () => {
      const f = bodyP(HM, long ? 7 : 1);
      P(f, coat, {
        d: 9, spec: [cw - 6, TT + 18, 4.5, 2.6, -.6], post: T => {
          ln(11, TT + 22, 12, (TT + HM) / 2, 11, HM + 5, 2, INK);
          for (let i = 0; i < 3; i++) { const y = TT + 34 + i * 15; X.beginPath(); X.arc(17, y, 3.4, 0, TAU); X.fillStyle = acc; X.fill(); X.lineWidth = 1.3; X.strokeStyle = INK; X.stroke(); dot(16, y - 1, 1, '#fff'); }
          X.beginPath(); rr(-cw + 2, -96, 15, 12, 3); X.fillStyle = T.d; X.fill(); X.lineWidth = 1.5; X.strokeStyle = INK; X.stroke();
          if (long) { ln(-8, HM - 30, -9, HM - 14, -10, HM + 5, 2, INK); stitch(-cw - 6, HM - 6, 0, HM + 1, cw + 8, HM - 6, T.l); }
        }
      });
      P(() => { X.moveTo(-2, TT - 3); X.lineTo(22, TT - 3); X.lineTo(11, TT + 24); X.closePath(); }, shirtC, { d: 3, h: 1, sil: false });
      const lap = mixc(coat, '#ffffff', .14);
      P(() => poly([-2, TT - 3, -12, TT, 6, TT + 26, 11, TT + 24]), lap, { d: 2, h: 1, sil: false });
      P(() => poly([22, TT - 3, 32, TT, 16, TT + 26, 11, TT + 24]), lap, { d: 2, h: 1, sil: false });
      if (!long) {
        P(() => { X.moveTo(-cw - 4, -76); X.quadraticCurveTo(0, -71, cw + 5, -76); X.lineTo(cw + 5, -67); X.quadraticCurveTo(0, -62, -cw - 4, -67); X.closePath(); }, '#3a2433', { d: 2, h: 1, sil: false });
        P(() => starP(12, -71, 8, 4, 0), GOLD, { d: 1.5, h: 1, sil: false, spec: [10, -74, 1.4, 1, 0] });
      }
      if (scarfC) {
        P(() => ell(8, TT + 2, cw + 3, 11), scarfC, { d: 4, h: 1.4, post: T => { tl(-cw + 6, TT + 4, 8, TT + 9, cw, TT + 4, 1.6, T.dd); } });
        P(() => ell(24, TT + 12, 7, 6), mixc(scarfC, '#000000', .1), { d: 1.5, h: 1, sil: false });
      }
    };
    const torso = () => { if (roxor) torsoRoxor(); else if (jas) torsoJasmin(); else if (bass) torsoBass(); else torsoGeneric(); };
    const neckAcc = () => {        // body-frame bits drawn on top of the head's lower edge
      if (bass) {
        P(() => { X.moveTo(-20, -136); X.quadraticCurveTo(8, -110, 36, -134); X.lineTo(36, -126); X.quadraticCurveTo(8, -102, -20, -128); X.closePath(); }, '#2a2f45', { d: 1.5, h: 1 });
        P(() => ell(-20, -134, 12, 14, .2), '#2a2f45', { d: 3, h: 1.4, spec: [-24, -140, 3, 2, -.5], post: () => ellF(-19, -134, 6.5, 8.5, .2, YEL) });
        P(() => ell(38, -132, 10, 13, -.2), '#2a2f45', { d: 3, h: 1.4, post: () => ellF(37, -132, 5, 7.5, -.2, YEL) });
      }
    };
    const scarfTails = () => {
      if (!scarfC) return;
      const wv = Math.sin(t * 5 + seed) * 5, wv2 = Math.sin(t * 6.3 + seed + 1) * 6;
      P(() => {
        X.moveTo(-10, TT - 2); X.quadraticCurveTo(-34, TT - 8 + wv * .5, -56, TT - 10 + wv); X.quadraticCurveTo(-66, TT - 12 + wv2, -74, TT - 4 + wv2);
        X.quadraticCurveTo(-62, TT + 2 + wv, -52, TT + 4 + wv * .6); X.quadraticCurveTo(-60, TT + 12 + wv2 * .6, -64, TT + 22 + wv2 * .6);
        X.quadraticCurveTo(-40, TT + 16, -20, TT + 12); X.quadraticCurveTo(-12, TT + 8, -10, TT - 2); X.closePath();
      }, scarfC, { d: 4, h: 1.6, post: T => { tl(-16, TT + 2, -36, TT - 2 + wv * .4, -56, TT - 4 + wv * .8, 1.6, T.dd); } });
    };

    // ---------------- arms ----------------
    const sleeve = (front) => {
      if (roxor) return { col: SKY, fill: tieDye(), cuff: LAV };
      if (jas) return { col: coat, cuff: mixc(coat, '#ffffff', .3) };
      if (bass) return { col: coat, cuff: coat };
      return { col: front ? coat : mixc(coat, '#140c1c', .18), cuff: front ? acc : mixc(acc, '#140c1c', .18) };
    };
    const armParts = (sx, sy, ex, ey, hx_, hy_, front) => {
      const S = sleeve(front), r0 = 11 * aw, r1 = 9.5 * aw, r2 = 9 * aw;
      const skinC = front ? skin : mixc(skin, '#2a1440', .14), col = front ? S.col : mixc(S.col, '#140c1c', .18);
      const fill = S.fill;
      if (bare) {
        P(() => limb3(sx, sy, r0 - 1, ex, ey, r1 - 1, hx_, hy_, r2 - 1.5), skinC, { d: 4 });
        P(() => capsule(sx, sy, r0 + 1, lerp(sx, ex, .45), lerp(sy, ey, .45), r0 + 1), col, { d: 3, h: 1.4, fill });
      } else {
        P(() => limb3(sx, sy, r0, ex, ey, r1, hx_, hy_, r2), col, { d: 5, fill, post: T => tl(ex - 6, ey - 3, ex, ey + 2, ex + 4, ey + 6, 1.6, 'rgba(60,30,110,.35)') });
        const cx0 = lerp(ex, hx_, .72), cy0 = lerp(ey, hy_, .72), cx1 = lerp(ex, hx_, .88), cy1 = lerp(ey, hy_, .88);
        P(() => capsule(cx0, cy0, r2 + 2, cx1, cy1, r2 + 2), front ? S.cuff : mixc(S.cuff, '#140c1c', .18), { d: 2, h: 1, post: () => { if (roxor) for (let i = 1; i < 4; i++) { const k = i / 4; ln(lerp(cx0, cx1, k) - 3, lerp(cy0, cy1, k) - 6, lerp(cx0, cx1, k), lerp(cy0, cy1, k), lerp(cx0, cx1, k) + 3, lerp(cy0, cy1, k) + 6, 1, 'rgba(60,40,120,.4)'); } } });
      }
    };
    const backArm = () => {
      const swing = atk > 0 ? (atk < .35 ? 5 * wind : -10 * str) : 0;
      const sx = -21 * w, sy = TT + 16, ex = sx - 6 * w + swing * .5, ey = sy + 22, hx_ = sx - 4 * w + swing, hy_ = sy + 44 + br * 1.2;
      armParts(sx, sy, ex, ey, hx_, hy_, false);
      c.save(); c.translate(hx_, hy_ + 3); c.rotate(1.3);
      fist(mixc(handC, '#2a1440', .14), 11 * aw); c.restore();
    };
    const frontArm = () => {
      const sx = 20 * w, sy = TT + 16, al = p.mug ? 36 : 50;
      const up = atk > 0 ? Math.max(0, -Math.sin(ang)) : 0, fwd = 26 * up;
      const hx_ = sx + Math.cos(ang) * al + fwd, hy_ = sy + Math.sin(ang) * al + fwd * .2;
      let ex, ey;
      if (p.mug) { ex = sx + 18; ey = sy + 16; }
      else { const ea = ang + (atk > 0 && ang < -.6 ? lerp(.42, 1.05, clamp((-.6 - ang) / 1.2, 0, 1)) : .42); ex = sx + Math.cos(ea) * al * .52 + fwd * .6; ey = sy + Math.sin(ea) * al * .52; }
      // wind-up sparkle + strike soundwave
      if (M && wind > .2) { sparkle(hx_ - 14, hy_ - 30, 6 + wind * 5, YEL); note(hx_ + 16, hy_ - 40 - wind * 10, .9, PINK); }
      if (M && atk > .36 && atk < .92) {
        const k = (atk - .36) / .56, a = Math.sin(k * Math.PI), dir = ang * .3 - .12;
        X.save(); X.translate(hx_ + 6, hy_ - 10); X.rotate(dir);
        const cols = [CYAN, PINK, LIME];
        for (let i = 0; i < 3; i++) {
          const r = 34 + i * 18 + k * 34; X.globalAlpha = Math.max(0, a * (1 - i * .22));
          X.beginPath(); X.arc(14, 0, r, -.62 + i * .06, .62 - i * .06); X.lineWidth = 8 - i; X.strokeStyle = INK; X.stroke(); X.lineWidth = 4.4 - i * .6; X.strokeStyle = cols[i]; X.stroke();
        }
        X.globalAlpha = 1; X.restore();
      }
      armParts(sx, sy, ex, ey, hx_, hy_, true);
      c.save(); c.translate(hx_, hy_);
      c.rotate(ang + (atk > 0 ? 0.2 : 0.7) - 1.57 + (wp === 'pistol' ? 1.1 : 2.4 * up) + (wp === 'axe' && !atk ? .55 : 0));
      if (wp === 'mug') c.rotate(-(ang + .7 - 1.57));
      weapon();
      fist(handC, 11.5 * aw);
      c.restore();
    };

    // ---------------- composition ----------------
    // part: 0 whole figure (live), 1 legs, 2 rigid upper body incl. arms (no face), 3 animated back pieces,
    //       4 face, 5 torso+head (no arms), 6 back arm, 7 front arm
    const upperT = () => { c.translate(0, hipY); c.rotate(lean); c.scale(1 + sq * .012, 1 - sq * .014); c.translate(0, -hipY + bob); };
    const hT = () => { c.save(); c.translate(HX, HY + br * .6); c.translate(0, 44); c.rotate(nod); c.translate(0, -44); };
    const pass = part => {
      c.save();
      if (part <= 1) {
        if (sit) {
          leg(-4, -40, 40 * w, -46, 44 * w, -18, 0);
          leg(8, -38, 52 * w, -42, 58 * w, -18, 1);
        } else {
          const kf = str * 6 - wind * 2;
          leg(-10 * w, -66, -13 * w - kf * .3, -42, -15 * w, -18, 0);
          leg(11 * w, -66, 14 * w + kf, -42, 17 * w + kf * .5, -18, 1);
        }
      }
      if (part !== 1) {
        if (sit) c.translate(0, 28);
        if (part !== 2 && part !== 5) upperT();
        if (part === 0 || part === 3) { hT(); headBack(); c.restore(); scarfTails(); }
        if (part === 0 || part === 2 || part === 6) backArm();
        if (part === 0 || part === 2 || part === 5) { torso(); hT(); head(); if (!part) face(); c.restore(); neckAcc(); }
        if (part === 4) { hT(); face(); c.restore(); }
        if (part === 0 || part === 2 || part === 7) frontArm();
      }
      c.restore();
    };
    // two-pass ink: one thick even silhouette stroke, then paint
    const twoPass = part => {
      M = 0; c.beginPath(); pass(part);
      c.lineWidth = OL; c.strokeStyle = INK; c.stroke();
      M = 1; pass(part);
    };

    const m0 = c.getTransform(), dev = Math.hypot(m0.a, m0.b);
    // Layer cache: legs and the rigid upper body are baked at the current device scale and re-blitted with
    // the live bob/lean/squash transform; animated bits (ponytail, mullet, tails, face, swinging arms) stay live.
    const still = !atk && !hurt && p.armAng == null;
    if (!OPT.cache || sit || p.mug || dev < .05 || dev > 4) { twoPass(0); c.restore(); return; }
    const k = Math.ceil(dev * 4) / 4;
    let sig = SIG.get(s); if (!sig) { sig = JSON.stringify(s); SIG.set(s, sig); }
    const key = sig + '|' + k;
    let e = CACHE.get(key);
    if (!e) { e = {}; CACHE.set(key, e); if (CACHE.size > 40) CACHE.delete(CACHE.keys().next().value); }
    const mk = (x0, y0, x1, y1, part) => {
      const keep = [t, ang, br, nod, bob, sq, lean];
      t = 0; ang = .5; br = 0; nod = 0; bob = 0; sq = 0; lean = 0;
      const cv = document.createElement('canvas'); cv.width = Math.ceil((x1 - x0) * k); cv.height = Math.ceil((y1 - y0) * k);
      const g = cv.getContext('2d'); g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k); g.lineJoin = 'round'; g.lineCap = 'round';
      c = g; X = g; twoPass(part); c = c0; X = c0;
      [t, ang, br, nod, bob, sq, lean] = keep;
      return { cv, x0, y0, w: x1 - x0, h: y1 - y0 };
    };
    const blit = L => c.drawImage(L.cv, L.x0, L.y0, L.w, L.h);
    if (!e.L) e.L = mk(-36 * w - 30, -96, 36 * w + 66, 8, 1);
    br = 0; nod = 0;
    blit(e.L);
    twoPass(3);
    if (still) {           // idle / talking: arms baked too
      if (!e.B) e.B = mk(-60 * w - 30, -330, 40 * w + 150, -20, 2);
      c.save(); upperT(); blit(e.B); c.restore();
      twoPass(4);
    } else {               // attacking / hurt: torso+head baked, arms live
      if (!e.T) e.T = mk(-50 * w - 40, -330, 40 * w + 70, -20, 5);
      twoPass(6);
      c.save(); upperT(); blit(e.T); c.restore();
      twoPass(4);
      twoPass(7);
    }
    c.restore();
  }
  const CACHE = new Map(), SIG = new WeakMap();
  draw.opt = OPT;
  return draw;
})();
function drawHuman(c, s, p) { hum_draw(c, s, p); }
