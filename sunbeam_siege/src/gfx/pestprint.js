/* SUNBEAM SIEGE gfx: Pestprint, procedural pixel sprites for pests.
 * Classic script. Defines window.SB.gfx.pestprint. See design/B20-pestprint-fx.md.
 * Sprites are drawn facing right on a pixel buffer, outlined, then mirrored to face LEFT
 * (pests face the cats). Anchor = bottom center of the canvas (feet), x/y passed to drawPest.
 */
(function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  root.SB = root.SB || {};
  SB.gfx = SB.gfx || {};

  // ---------- color helpers ----------
  var LE = new Uint8Array(new Uint32Array([1]).buffer)[0] === 1;
  function parse(h) {
    if (typeof h !== 'string') return h;
    h = h.replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.substr(0, 2), 16), parseInt(h.substr(2, 2), 16), parseInt(h.substr(4, 2), 16)];
  }
  function mix(a, b, t) {
    a = parse(a); b = parse(b);
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function pack(rgb, a) {
    a = a === undefined ? 255 : a;
    rgb = parse(rgb);
    return LE ? (((a << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0)
              : (((rgb[0] << 24) | (rgb[1] << 16) | (rgb[2] << 8) | a) >>> 0);
  }
  function unpack(c) {
    return LE ? [c & 255, (c >>> 8) & 255, (c >>> 16) & 255, c >>> 24] : [c >>> 24, (c >>> 16) & 255, (c >>> 8) & 255, c & 255];
  }
  var DARK = '#140f26', WHITE = '#ffffff';
  function mkPal(base, extra) {
    extra = extra || {};
    var p = {
      b: pack(base),
      s: pack(mix(base, '#241a4a', 0.38)),
      l: pack(mix(base, '#fff6e0', 0.32)),
      d: pack(mix(base, DARK, 0.62)),      // deep shade, also outline
      o: pack(mix(base, DARK, 0.72)),
      w: pack('#f4efe6'), k: pack('#1c1630'), red: pack('#ff5d6c'),
      pink: pack('#f0a6b4'), gold: pack('#f2c14e'), goldD: pack('#b8862a'),
      a: pack(extra.accent || '#e7a0b0'), a2: pack(extra.accent2 || '#ffd95a'),
      aS: pack(mix(extra.accent || '#e7a0b0', '#241a4a', 0.38)),
      aL: pack(mix(extra.accent || '#e7a0b0', '#fff6e0', 0.35)),
      baseHex: base
    };
    return p;
  }

  // ---------- painter ----------
  function Painter(W, H) {
    this.W = W; this.H = H; this.d = new Uint32Array(W * H);
    this.after = []; this.A = {}; this.noOutline = false;
  }
  var PP = Painter.prototype;
  PP.set = function (x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return;
    this.d[y * this.W + x] = c;
  };
  PP.get = function (x, y) { return (x < 0 || y < 0 || x >= this.W || y >= this.H) ? 0 : this.d[y * this.W + x]; };
  PP.rect = function (x, y, w, h, c) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) this.set(x + i, y + j, c);
  };
  // shaded rectangle: light top row, shade bottom row and right column
  PP.rects = function (x, y, w, h, P, lightEdge) {
    x = Math.round(x); y = Math.round(y); w = Math.round(w); h = Math.round(h);
    this.rect(x, y, w, h, P.b);
    if (h > 2) { this.rect(x, y, w, 1, P.l); this.rect(x, y + h - 1, w, 1, P.s); }
    if (w > 3) this.rect(x + w - 1, y + (h > 2 ? 1 : 0), 1, h - (h > 2 ? 2 : 0), P.s);
    if (lightEdge && w > 3) this.rect(x, y + 1, 1, h - 2, P.l);
  };
  PP.ell = function (cx, cy, rx, ry, c) {
    var x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) this.set(x, y, c);
    }
  };
  // shaded ellipse with light from top-left, 3 steps
  PP.ells = function (cx, cy, rx, ry, P, flat) {
    var x0 = Math.floor(cx - rx), x1 = Math.ceil(cx + rx), y0 = Math.floor(cy - ry), y1 = Math.ceil(cy + ry);
    var big = rx >= 3 && ry >= 3 && !flat;
    for (var y = y0; y <= y1; y++) for (var x = x0; x <= x1; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        var c = P.b;
        if (big) {
          var lit = -0.45 * dx - 0.9 * dy, sh = 0.9 * dy + 0.35 * dx;
          if (lit > 0.62) c = P.l; else if (sh > 0.5) c = P.s;
        }
        this.set(x, y, c);
      }
    }
  };
  PP.line = function (x0, y0, x1, y1, c, th) {
    th = th || 1;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    var dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1, err = dx + dy;
    for (var n = 0; n < 400; n++) {
      if (th <= 1) this.set(x0, y0, c); else this.rect(x0 - Math.floor(th / 2), y0 - Math.floor(th / 2), th, th, c);
      if (x0 === x1 && y0 === y1) break;
      var e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  };
  PP.tri = function (x0, y0, x1, y1, x2, y2, c) {
    var minx = Math.floor(Math.min(x0, x1, x2)), maxx = Math.ceil(Math.max(x0, x1, x2));
    var miny = Math.floor(Math.min(y0, y1, y2)), maxy = Math.ceil(Math.max(y0, y1, y2));
    function sgn(px, py, ax, ay, bx, by) { return (px - bx) * (ay - by) - (ax - bx) * (py - by); }
    for (var y = miny; y <= maxy; y++) for (var x = minx; x <= maxx; x++) {
      var px = x + 0.5, py = y + 0.5;
      var d1 = sgn(px, py, x0, y0, x1, y1), d2 = sgn(px, py, x1, y1, x2, y2), d3 = sgn(px, py, x2, y2, x0, y0);
      var neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.set(x, y, c);
    }
  };
  PP.defer = function (fn) { this.after.push(fn); };

  // ---------- eyes ----------
  // style: 'beady' (2x2), 'big' (3x3 white + pupil), 'huge' (4x4), 'angry' (beady + brow), 'slit'
  function eye(g, P, p, x, y, style, lookDx) {
    x = Math.round(x); y = Math.round(y); lookDx = lookDx === undefined ? 1 : lookDx;
    if (p.d) { g.set(x, y, P.k); g.set(x + 2, y, P.k); g.set(x + 1, y + 1, P.k); g.set(x, y + 2, P.k); g.set(x + 2, y + 2, P.k); return; }
    if (p.h) { g.set(x, y, P.k); g.set(x + 1, y + 1, P.k); g.set(x, y + 2, P.k); return; }
    if (style === 'beady' || style === 'angry') {
      g.rect(x, y, 2, 2, P.k); g.set(x + 1, y, P.w);
      if (style === 'angry') { g.set(x - 1, y - 2, P.k); g.set(x, y - 1, P.k); g.set(x + 1, y - 1, P.k); }
    } else if (style === 'big') {
      g.rect(x, y, 3, 3, P.w); g.set(x, y, 0); g.set(x + 2, y, 0); g.set(x, y + 2, 0); g.set(x + 2, y + 2, 0);
      g.rect(x + (lookDx > 0 ? 1 : 0), y + 1, 2, 2, P.k); g.set(x + (lookDx > 0 ? 1 : 0), y + 1, P.k);
      g.set(x + 1, y, P.w);
      g.set(x + 1, y, P.w);
    } else if (style === 'huge') {
      g.rect(x, y, 4, 4, P.w); g.set(x, y, 0); g.set(x + 3, y, 0); g.set(x, y + 3, 0); g.set(x + 3, y + 3, 0);
      g.rect(x + 1 + (lookDx > 0 ? 1 : 0), y + 1, 1, 2, P.k);
      if (p.a) g.rect(x + 1, y + 1, 2, 2, P.k);
    } else if (style === 'slit') {
      g.rect(x, y, 3, 2, P.gold); g.set(x + 1, y, P.k); g.set(x + 1, y + 1, P.k);
    } else if (style === 'red') {
      g.rect(x, y, 2, 2, P.red); g.set(x, y, P.w);
    } else { g.rect(x, y, 2, 2, P.k); }
  }
  // pair of eyes on a flat front (objects)
  function face(g, P, p, x, y, gap, style, brow) {
    eye(g, P, p, x, y, style, 1); eye(g, P, p, x + gap, y, style, 1);
    if (brow && !p.d && !p.h) {
      g.line(x - 1, y - 2, x + 2, y - 1, P.k); g.line(x + gap + 3, y - 2, x + gap, y - 1, P.k);
    }
  }
  function mouth(g, P, p, x, y, w) {
    if (p.m) { g.rect(x, y, w, 2, P.k); g.rect(x + 1, y, 1, 1, P.w); if (w > 3) g.rect(x + w - 2, y, 1, 1, P.w); }
    else if (p.d) { g.line(x, y + 1, x + w - 1, y, P.k); }
    else g.rect(x, y + 1, w, 1, P.k);
  }

  // ---------- species ----------
  var SP = {};
  // each: fn(g, P, p, o) with o = {U, cx, fy, sz, boss, ears, w, h}; sets g.A anchors
  // anchors: x=head center, y=head top, w=head half width, ex,ey=eye, nx,ny=neck

  SP.mouse = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - 1 + p.l - (p.h ? 1 : 0), by = fy - U(5) + p.b;
    var tw = p.d ? 0 : (p.b ? 1 : 0);
    // tail
    var pts = [[bx - U(5), by + U(1)], [bx - U(8), by + U(2)], [bx - U(11), by], [bx - U(12), by - U(3) - tw], [bx - U(10), by - U(5) - tw]];
    for (var i = 0; i < pts.length - 1; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], P.a);
    // far ear, body, head, near ear
    g.ells(bx + U(6.5), by - U(5.5), U(2.4), U(2.4), P, true);
    g.ells(bx - 1, by, U(6), U(4), P);
    g.ells(bx + U(5), by - U(1), U(4), U(3.5), P);
    g.ells(bx + U(3), by - U(5), U(2.6), U(2.6), P, true);
    g.ell(bx + U(3), by - U(5), U(1.4), U(1.4), P.a);
    g.set(bx + U(10), by, P.a); g.set(bx + U(9), by - 1, P.a);
    if (o.boss) g.set(bx + U(10), by - 1, P.a);
    // feet
    g.rect(bx - U(3), fy - 1, 2, 2, P.a); g.rect(bx + U(2), fy - 1, 2, 2, P.a);
    g.rect(bx - U(3), by + U(3), U(2), fy - (by + U(3)), P.s); g.rect(bx + U(2), by + U(3), U(2), fy - (by + U(3)), P.s);
    eye(g, P, p, bx + U(6), by - U(2.6), 'angry');
    mouth(g, P, p, bx + U(8), by + U(1), 2);
    g.defer(function () { g.set(bx + U(10) + 1, by - 1, P.w); g.set(bx + U(11), by + 1, P.w); g.set(bx + U(10) + 1, by + 2, P.w); });
    g.A = { x: bx + U(5), y: by - U(4.5), w: U(4), ex: bx + U(6), ey: by - U(2.6), nx: bx + U(2), ny: by + U(2) };
  };

  SP.rat = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), by = fy - U(5.5) + p.b;
    // long bare tail
    var pts = [[bx - U(7), by + U(2)], [bx - U(10), by + U(3)], [bx - U(13), by + U(1)], [bx - U(14), by - U(2)], [bx - U(12), by - U(4)]];
    for (var i = 0; i < pts.length - 1; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], P.a, o.boss ? 2 : 1);
    g.ells(bx + U(9), by - U(5.5), U(2), U(2), P, true);
    g.ells(bx, by, U(8), U(4.6), P);
    g.ells(bx - U(3.5), by + U(1), U(4), U(3.6), P, true);
    // head: wedge
    g.ells(bx + U(8), by - U(1), U(4.4), U(3.6), P);
    g.tri(bx + U(10), by - U(3), bx + U(14), by + U(0.5), bx + U(10), by + U(2.5), P.b);
    g.ells(bx + U(5.5), by - U(5.4), U(2.4), U(2.4), P, true); g.ell(bx + U(5.5), by - U(5.4), U(1.3), U(1.3), P.a);
    g.set(bx + U(14), by, P.pink); g.set(bx + U(13), by - 1, P.pink);
    g.rect(bx - U(4), fy - 1, 3, 2, P.a); g.rect(bx + U(4), fy - 1, 3, 2, P.a);
    g.rect(bx - U(4), by + U(3), U(2), fy - (by + U(3)), P.s); g.rect(bx + U(4), by + U(3), U(2), fy - (by + U(3)), P.s);
    eye(g, P, p, bx + U(9), by - U(3), 'angry');
    // scar
    g.set(bx + U(9) - 1, by - U(4), P.pink); g.set(bx + U(9), by - U(3) + 2, P.pink);
    // buck teeth
    if (p.m) { g.rect(bx + U(11), by + U(1), 3, 3, P.k); g.rect(bx + U(11), by + U(1), 1, 2, P.w); g.rect(bx + U(13), by + U(1), 1, 2, P.w); }
    else { g.rect(bx + U(11), by + U(2), 2, 2, P.w); g.set(bx + U(11), by + U(1), P.k); }
    g.A = { x: bx + U(8), y: by - U(4.6), w: U(4), ex: bx + U(9), ey: by - U(3), nx: bx + U(4), ny: by + U(1) };
  };

  SP.hamster = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(7) + p.b;
    g.ells(bx, by, U(9), U(6.4), P);
    // belly
    g.ells(bx + U(1), by + U(2.2), U(5.4), U(3.8), { b: P.aL, l: P.aL, s: P.a }, true);
    // cap patch
    g.ells(bx - U(2), by - U(4), U(4.6), U(2.6), { b: P.a, l: P.aL, s: P.aS }, true);
    g.ells(bx + U(5), by - U(5.4), U(2), U(2), P, true); g.ell(bx + U(5), by - U(5.4), U(1), U(1), P.pink);
    g.ells(bx - U(3), by - U(5.8), U(2), U(2), P, true); g.ell(bx - U(3), by - U(5.8), U(1), U(1), P.pink);
    // cheeks (stuffed)
    var puff = p.m ? 0 : 1;
    g.ells(bx + U(5), by + U(1.8), U(3.8) + puff, U(3) + puff, { b: P.aL, l: P.w, s: P.l }, true);
    g.set(bx + U(8.6), by + U(0.6), P.pink); g.set(bx + U(8.6) - 1, by + U(0.6), P.pink);
    g.set(bx + U(8.2), by, P.k);
    eye(g, P, p, bx + U(4.2), by - U(2.4), 'beady');
    // seed in paws
    g.rect(bx + U(1), by + U(3), 3, 2, P.k); g.rect(bx + U(1), by + U(3), 3, 1, P.l);
    // feet
    g.rect(bx - U(4), fy - 1, 3, 2, P.pink); g.rect(bx + U(3), fy - 1, 3, 2, P.pink);
    if (p.m) { g.rect(bx + U(7.2), by + U(2.8), 2, 2, P.k); }
    g.A = { x: bx + U(2), y: by - U(6.4), w: U(6), ex: bx + U(4.2), ey: by - U(2.4), nx: bx + U(2), ny: by + U(4) };
  };

  SP.squirrel = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + U(2) + p.l - (p.h ? 1 : 0), by = fy - U(6) + p.b;
    var sway = p.b ? 1 : 0;
    // big fluffy tail: stacked blobs
    var tail = [[bx - U(6), by + U(1), 4, 3.4], [bx - U(8), by - U(3), 4.6, 4], [bx - U(8) + sway, by - U(8), 4.6, 4], [bx - U(5) + sway, by - U(11), 3.6, 3.2]];
    for (var i = 0; i < tail.length; i++) g.ells(tail[i][0], tail[i][1], U(tail[i][2]), U(tail[i][3]), { b: P.s, l: P.b, s: P.d });
    g.ells(bx - U(8), by - U(3), U(2), U(2.6), { b: P.aL, l: P.aL, s: P.b }, true);
    g.ells(bx, by, U(5), U(5), P);
    g.ells(bx + U(1.5), by + U(1.5), U(3), U(3.2), { b: P.aL, l: P.aL, s: P.a }, true);
    g.ells(bx + U(3.5), by - U(4.5), U(3.6), U(3.2), P);
    g.tri(bx + U(2), by - U(7), bx + U(2.5), by - U(10), bx + U(4.5), by - U(7), P.b);
    g.tri(bx + U(5), by - U(7), bx + U(6.8), by - U(10), bx + U(7), by - U(6), P.b);
    g.set(bx + U(2.5), by - U(10) - 1, P.l); g.set(bx + U(6.8), by - U(10) - 1, P.l);
    g.set(bx + U(7.2), by - U(4), P.k); g.set(bx + U(7.2), by - U(3.2), P.k);
    eye(g, P, p, bx + U(4.6), by - U(5.5), 'angry');
    // acorn held
    g.ells(bx + U(3.4), by + U(2.6), U(2), U(1.8), { b: P.goldD, l: P.gold, s: P.d }, true);
    g.rect(bx + U(2), by + U(1), 4, 1, P.d);
    mouth(g, P, p, bx + U(5.6), by - U(2.8), 2);
    g.rect(bx - U(2), fy - 1, 3, 2, P.s); g.rect(bx + U(2), fy - 1, 3, 2, P.s);
    g.A = { x: bx + U(3.5), y: by - U(7.6), w: U(3.6), ex: bx + U(4.6), ey: by - U(5.5), nx: bx + U(1), ny: by - U(1) };
  };

  // dog: o.sz S/M/L, o.ears 'floppy'|'pointy'
  SP.dog = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), by = fy - U(9) + p.b;
    var legH = U(5);
    // tail
    var wag = p.b ? -1 : 1;
    g.line(bx - U(8), by - U(1), bx - U(11), by - U(5) + wag, P.b, 2);
    g.line(bx - U(11), by - U(5) + wag, bx - U(12), by - U(7) + wag, P.l, 2);
    // far legs
    g.rect(bx - U(5), by + U(3), U(3), fy - by - U(3), P.s); g.rect(bx + U(4), by + U(3), U(3), fy - by - U(3), P.s);
    g.ells(bx, by, U(9), U(5.4), P);
    // chest patch
    g.ells(bx + U(5), by + U(2), U(3), U(3), { b: P.aL, l: P.w, s: P.l }, true);
    // near legs
    g.rects(bx - U(7), by + U(2), U(3.4), fy - by - U(2), P); g.rects(bx + U(2), by + U(2), U(3.4), fy - by - U(2), P);
    g.rect(bx - U(7), fy - 1, U(3.4), 1, P.aL); g.rect(bx + U(2), fy - 1, U(3.4), 1, P.aL);
    // head + snout
    var hx = bx + U(9), hy = by - U(5);
    g.ells(hx, hy, U(4.6), U(4.2), P);
    g.rects(hx + U(2), hy, U(5.4), U(3.4), { b: P.aL, l: P.w, s: P.l });
    g.rect(hx + U(7), hy, 2, 2, P.k); g.set(hx + U(7), hy, P.pink);
    // ears
    if (o.ears === 'pointy') {
      g.tri(hx - U(3), hy - U(2), hx - U(2.4), hy - U(7.4), hx + U(0.6), hy - U(3), P.s);
      g.tri(hx + U(0.6), hy - U(3.4), hx + U(2.5), hy - U(7.8), hx + U(3.4), hy - U(2), P.b);
      g.tri(hx + U(1.5), hy - U(3.4), hx + U(2.5), hy - U(6.4), hx + U(3), hy - U(2.6), P.pink);
    } else {
      g.ells(hx - U(1.4), hy - U(0.6), U(2.2), U(3.8), { b: P.d, l: P.s, s: P.d }, true);
      g.ells(hx + U(0.6), hy - U(0.2) + (p.b ? 1 : 0), U(2.4), U(4), { b: P.s, l: P.b, s: P.d }, true);
    }
    eye(g, P, p, hx + U(2.6), hy - U(1.8), 'angry');
    // mouth
    if (p.m) { g.rect(hx + U(3), hy + U(2.4), U(5), 2, P.k); g.rect(hx + U(3.4), hy + U(2.4), 1, 1, P.w); g.rect(hx + U(6), hy + U(2.4), 1, 1, P.w); g.rect(hx + U(4.5), hy + U(4.2), 2, 1, P.red); }
    else g.rect(hx + U(3), hy + U(3), U(4), 1, P.k);
    // collar
    g.rect(bx + U(5), by - U(2), U(3), U(1.6), P.red);
    if (o.sz === 'L') { g.set(bx + U(5), by - U(2) - 1, P.w); g.set(bx + U(7), by - U(2) - 1, P.w); g.set(bx + U(6), by - U(2) - 1, P.w); }
    g.A = { x: hx, y: hy - U(4.2), w: U(4.6), ex: hx + U(2.6), ey: hy - U(1.8), nx: bx + U(6), ny: by - U(2) };
  };

  SP.crow = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(9) + p.b;
    var flap = p.a ? 1 : 0;
    // tail feathers
    g.tri(bx - U(4), by + U(1), bx - U(12), by + U(5), bx - U(5), by + U(4), P.s);
    g.tri(bx - U(4), by + U(0), bx - U(12), by + U(2), bx - U(5), by + U(3), P.b);
    g.ells(bx, by, U(6.6), U(4.6), P);
    // wing
    if (flap) {
      g.tri(bx - U(2), by - U(1), bx - U(9), by - U(10), bx + U(2), by - U(4), P.s);
      g.tri(bx - U(2), by - U(1), bx - U(6), by - U(11), bx + U(2), by - U(5), P.b);
      g.line(bx - U(5), by - U(8), bx - U(2), by - U(2), P.l);
    } else {
      g.ells(bx - U(1), by + U(0.6), U(4.8), U(3), { b: P.s, l: P.b, s: P.d }, true);
      g.line(bx - U(5), by + U(1), bx + U(2), by + U(2), P.b);
    }
    // head
    g.ells(bx + U(6), by - U(3.4), U(3.6), U(3.4), P);
    // beak
    g.tri(bx + U(8.6), by - U(4.6), bx + U(14), by - U(2.6) + (p.m ? -1 : 0), bx + U(8.6), by - U(2.4), P.gold);
    if (p.m) { g.tri(bx + U(8.6), by - U(2.2), bx + U(13), by - U(0.6), bx + U(8.6), by - U(0.8), P.goldD); }
    else g.line(bx + U(9), by - U(2.4), bx + U(13), by - U(2.6), P.goldD);
    eye(g, P, p, bx + U(6.4), by - U(4.6), 'angry');
    g.set(bx + U(7), by - U(5.8), P.w);
    // legs
    g.defer(function () {
      g.rect(bx - U(1), by + U(4), 1, fy - by - U(3), P.goldD); g.rect(bx + U(2), by + U(4), 1, fy - by - U(3), P.goldD);
      g.rect(bx - U(1) - 1, fy, 3, 1, P.goldD); g.rect(bx + U(2) - 1, fy, 3, 1, P.goldD);
    });
    g.A = { x: bx + U(6), y: by - U(6.8), w: U(3.4), ex: bx + U(6.4), ey: by - U(4.6), nx: bx + U(3), ny: by - U(1) };
  };

  SP.raccoon = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(1) + p.l - (p.h ? 1 : 0), by = fy - U(8) + p.b;
    // ringed tail
    var tx = bx - U(7), ty = by + U(1);
    for (var i = 0; i < 6; i++) {
      g.ells(tx - i * U(1.7), ty - U(1) - Math.sin(i * 0.55 + (p.b ? 0.4 : 0)) * U(2), U(2.8), U(2.6), (i % 2 ? { b: P.k, l: P.s, s: P.k } : P), true);
    }
    g.rect(bx - U(4), by + U(3), U(3), fy - by - U(3), P.s); g.rect(bx + U(3), by + U(3), U(3), fy - by - U(3), P.s);
    g.ells(bx, by, U(7.6), U(5.4), P);
    g.ells(bx + U(1.4), by + U(1.6), U(4.2), U(3.4), { b: P.aL, l: P.w, s: P.l }, true);
    g.rects(bx - U(6), by + U(2.4), U(3), fy - by - U(2.4), P); g.rects(bx + U(2), by + U(2.4), U(3), fy - by - U(2.4), P);
    g.rect(bx - U(6), fy - 1, U(3), 1, P.k); g.rect(bx + U(2), fy - 1, U(3), 1, P.k);
    var hx = bx + U(7), hy = by - U(3.6);
    g.tri(hx - U(3.6), hy - U(2), hx - U(3), hy - U(6.6), hx - U(0.2), hy - U(3), P.b);
    g.tri(hx + U(0.4), hy - U(3), hx + U(2.8), hy - U(6.6), hx + U(3.8), hy - U(1.6), P.b);
    g.tri(hx + U(1.4), hy - U(3), hx + U(2.8), hy - U(5.4), hx + U(3.2), hy - U(2.2), P.pink);
    g.ells(hx, hy, U(4.8), U(3.8), P);
    g.tri(hx + U(2), hy - U(1), hx + U(7.4), hy + U(1.4), hx + U(2), hy + U(3), P.aL);
    // mask
    g.rect(hx - U(2.6), hy - U(2.2), U(6), U(2.4), P.k); g.set(hx - U(2.6), hy - U(2.2), 0); g.set(hx + U(3.4), hy - U(2.2), 0);
    g.set(hx + U(7.2), hy + U(0.8), P.k); g.rect(hx + U(6), hy + U(0.4), 2, 2, P.k);
    eye(g, P, p, hx + U(1.4), hy - U(1.6), 'big', 1);
    // loot sack
    g.ells(bx - U(1), by - U(5), U(3), U(3), { b: P.goldD, l: P.gold, s: P.d }, true);
    g.rect(bx - U(2), by - U(8), 3, 2, P.d);
    if (p.m) g.rect(hx + U(4), hy + U(2.4), U(3), 2, P.k);
    g.A = { x: hx, y: hy - U(3.8), w: U(4.8), ex: hx + U(1.4), ey: hy - U(1.6), nx: bx + U(5), ny: by - U(2) };
  };

  SP.fox = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(1) + p.l - (p.h ? 1 : 0), by = fy - U(8) + p.b;
    var sw = p.b ? 1 : 0;
    // brush tail with white tip
    g.ells(bx - U(8), by + U(0) - sw, U(5), U(3.2), P);
    g.ells(bx - U(11.4), by - U(1.4) - sw, U(2.6), U(2.4), { b: P.w, l: P.w, s: P.aL }, true);
    g.rect(bx - U(4), by + U(3), U(3), fy - by - U(3), P.s); g.rect(bx + U(3), by + U(3), U(3), fy - by - U(3), P.s);
    g.ells(bx, by, U(8), U(4.8), P);
    g.ells(bx + U(4.6), by + U(1.4), U(3.4), U(3), { b: P.w, l: P.w, s: P.aL }, true);
    g.rects(bx - U(6), by + U(2.4), U(3), fy - by - U(2.4), P); g.rects(bx + U(2), by + U(2.4), U(3), fy - by - U(2.4), P);
    g.rect(bx - U(6), fy - U(2), U(3), U(3), P.d); g.rect(bx + U(2), fy - U(2), U(3), U(3), P.d);
    var hx = bx + U(8), hy = by - U(3);
    g.tri(hx - U(3.2), hy - U(2), hx - U(2.6), hy - U(8), hx + U(0.4), hy - U(3), P.b);
    g.tri(hx + U(0.2), hy - U(3), hx + U(3), hy - U(8), hx + U(3.8), hy - U(1.4), P.b);
    g.tri(hx - U(2.2), hy - U(3), hx - U(2.2), hy - U(7), hx - U(0.6), hy - U(3), P.d);
    g.tri(hx + U(1.4), hy - U(3), hx + U(3), hy - U(7), hx + U(3.2), hy - U(2), P.d);
    g.ells(hx, hy, U(4.4), U(3.6), P);
    g.tri(hx + U(1), hy - U(1.4), hx + U(8), hy + U(1.4), hx + U(1), hy + U(3.4), P.b);
    g.tri(hx + U(2), hy + U(0.4), hx + U(7.6), hy + U(1.6), hx + U(1.4), hy + U(3.4), P.w);
    g.rect(hx + U(7.4), hy + U(0.6), 2, 2, P.k);
    eye(g, P, p, hx + U(1.4), hy - U(1.8), 'slit');
    g.line(hx + U(0.4), hy - U(3), hx + U(3), hy - U(2.4), P.k);
    if (p.m) { g.rect(hx + U(3), hy + U(2.6), U(4), 2, P.k); g.set(hx + U(3.4), hy + U(2.6), P.w); g.set(hx + U(6), hy + U(2.6), P.w); }
    g.A = { x: hx, y: hy - U(3.6), w: U(4.4), ex: hx + U(1.4), ey: hy - U(1.8), nx: bx + U(6), ny: by - U(1) };
  };

  SP.snake = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy;
    var ph = (p.b ? 0.9 : 0) + (p.a ? 0.4 : 0), len = U(22), x0 = cx - U(13) + p.l - (p.h ? 1 : 0), ymid = fy - U(6) + (p.d ? 3 : 0);
    var N = 40, last = null;
    for (var i = 0; i <= N; i++) {
      var t = i / N, x = x0 + t * len, amp = U(4.4) * (0.4 + 0.6 * (1 - Math.abs(t - 0.5) * 1.1));
      var lift = p.a ? Math.max(0, (t - 0.55)) * U(14) : 0;
      var y = ymid + Math.sin(t * 9 + ph) * amp - (t > 0.82 ? (t - 0.82) * U(26) : 0) - lift;
      var r = U(1.5) + (t < 0.2 ? t * 5 * U(0.6) : U(0.9)) * 1;
      var c = ((i >> 1) % 3 === 1) ? P.a : P.b;
      g.ell(x, y, r, r, c);
      if (!(i % 2)) g.set(x, y - r + 1, P.l);
      last = [x, y, r];
    }
    // belly stripe hint along bottom handled by shade pass: lighten
    var hx = last[0] + U(2), hy = last[1] - U(1);
    g.ells(hx, hy, U(3.6), U(2.8), P);
    g.tri(hx + U(2), hy - U(2), hx + U(5), hy, hx + U(2), hy + U(2), P.b);
    eye(g, P, p, hx - U(0.4), hy - U(1.6), 'slit');
    var tg = p.m ? 6 : 4;
    g.defer(function () {
      g.line(hx + U(5), hy + 1, hx + U(5) + tg, hy + 1, P.red); g.set(hx + U(5) + tg + 1, hy, P.red); g.set(hx + U(5) + tg + 1, hy + 2, P.red);
      if (p.m) { g.set(hx + U(3), hy + 2, P.w); g.set(hx + U(3) + 2, hy + 2, P.w); }
    });
    g.A = { x: hx, y: hy - U(2.8), w: U(3.6), ex: hx, ey: hy - U(1.6), nx: last[0], ny: last[1] };
  };

  SP.spider = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(8) + (p.a ? 2 : 0) + (p.b ? 0 : 0);
    var cr = p.b ? 1 : 0;
    // legs drawn after outline
    g.defer(function () {
      for (var side = 0; side < 2; side++) {
        var col = side ? P.b : P.s;
        for (var i = 0; i < 4; i++) {
          var ox = bx - U(3) + i * U(2.4) + (side ? U(1.2) : 0), jx = ox + (i < 2 ? -U(3) : U(3)) * (i === 1 || i === 2 ? 1.1 : 1.4);
          var kneeY = by - U(6) - (side ? 1 : 0) + ((i + side) % 2 ? cr : 0);
          var fx = ox + (i < 2 ? -U(6) : U(6)) + (i === 1 ? U(2) : 0) + (i === 2 ? -U(2) : 0);
          g.line(ox, by - U(1), jx, kneeY, col); g.line(jx, kneeY, fx, fy, col);
          g.set(jx, kneeY - 1, P.l);
        }
      }
    });
    g.ells(bx - U(3.4), by - U(1), U(5.4), U(4.6), P);
    // hourglass mark
    g.tri(bx - U(5.4), by - U(3.4), bx - U(1.4), by - U(3.4), bx - U(3.4), by - U(1.4), P.red);
    g.tri(bx - U(5), by + U(1.4), bx - U(1.8), by + U(1.4), bx - U(3.4), by - U(0.6), P.red);
    g.ells(bx + U(3.4), by - U(0.6), U(3.6), U(3.2), P);
    var ex = bx + U(4), ey = by - U(1.8);
    eye(g, P, p, ex, ey, 'big', 1);
    if (!p.d && !p.h) { g.rect(ex - 3, ey + 1, 2, 2, P.red); g.rect(ex + 1, ey - 3, 2, 2, P.red); }
    if (p.m) { g.rect(bx + U(5), by + U(1.4), 2, 2, P.w); g.rect(bx + U(2), by + U(1.4), 1, 2, P.w); }
    g.A = { x: bx + U(3.4), y: by - U(3.8), w: U(3.6), ex: ex, ey: ey, nx: bx, ny: by };
  };

  SP.flea = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, hop = p.a ? 3 : (p.b ? 1 : 0), bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(6) - hop;
    // big back legs
    g.defer(function () {
      g.line(bx - U(2), by + U(2), bx - U(6), by - U(1), P.d); g.line(bx - U(6), by - U(1), bx - U(7), fy, P.d);
      g.line(bx, by + U(2), bx - U(3), by - U(1), P.s); g.line(bx - U(3), by - U(1), bx - U(3), fy, P.s);
      g.line(bx + U(2), by + U(2), bx + U(3), fy, P.d); g.line(bx + U(4), by + U(1), bx + U(6), fy, P.s);
      g.rect(bx - U(7) - 1, fy, 3, 1, P.d);
    });
    g.ells(bx, by, U(4.2), U(4.4), P);
    for (var k = 0; k < 3; k++) g.line(bx - U(3), by - U(2) + k * 2, bx + U(2), by - U(2) + k * 2 + 1, P.s);
    g.ells(bx + U(4), by - U(1.4), U(2.6), U(2.6), P);
    g.line(bx + U(5), by - U(3.6), bx + U(8), by - U(7), P.d);
    g.line(bx + U(4), by - U(3.8), bx + U(5), by - U(8), P.d);
    g.tri(bx + U(6), by - U(1), bx + U(10), by + U(1), bx + U(6), by + U(1), P.d);
    eye(g, P, p, bx + U(4), by - U(2.4), 'beady');
    if (p.m) g.rect(bx + U(6), by + U(0.6), 2, 2, P.red);
    g.A = { x: bx + U(4), y: by - U(4), w: U(2.6), ex: bx + U(4), ey: by - U(2.4), nx: bx + U(2), ny: by };
  };

  SP.goose = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), by = fy - U(8) + p.b;
    var reach = p.a ? U(4) : 0;
    g.tri(bx - U(6), by - U(1), bx - U(12), by - U(3), bx - U(6), by + U(3), P.s);
    g.ells(bx, by, U(8), U(5), P);
    g.ells(bx - U(1.4), by + U(0.4), U(5), U(2.8), { b: P.l, l: P.w, s: P.b }, true);
    g.line(bx - U(5), by + U(0), bx + U(1), by + U(1.4), P.s);
    // neck: thick curve
    var nx0 = bx + U(5), ny0 = by - U(2), hx = bx + U(8) + reach, hy = by - U(11) + (p.a ? U(3) : 0);
    for (var i = 0; i <= 12; i++) {
      var t = i / 12, ex = nx0 + (hx - nx0) * t + Math.sin(t * 3.1) * U(2) * (p.a ? 0.3 : 1), ey = ny0 + (hy - ny0) * t;
      g.ells(ex, ey, U(2.2), U(2.2), P, true);
    }
    g.ells(hx, hy, U(3.2), U(2.8), P);
    g.rect(hx + U(2.6), hy - 1, U(5), p.m ? 2 : 3, P.gold);
    if (p.m) { g.rect(hx + U(2.6), hy + 1, U(5), 2, P.goldD); g.rect(hx + U(3), hy + 1, U(4), 1, P.k); }
    g.rect(hx + U(2.6), hy - 2, 2, 1, P.goldD);
    eye(g, P, p, hx + U(0.6), hy - U(1.6), 'angry');
    g.defer(function () {
      g.rect(bx - U(2), by + U(5), 2, fy - by - U(5) + 1, P.gold); g.rect(bx + U(2), by + U(5), 2, fy - by - U(5) + 1, P.gold);
      g.rect(bx - U(2), fy, 4, 1, P.goldD); g.rect(bx + U(2), fy, 4, 1, P.goldD);
    });
    g.A = { x: hx, y: hy - U(2.8), w: U(3.2), ex: hx + U(0.6), ey: hy - U(1.6), nx: nx0, ny: ny0 };
  };

  // ----- objects -----
  SP.vacuum = function (g, P, p, o) {
    if (o.boss) return SP.vacuum_boss(g, P, p, o);
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(1) + p.l - (p.h ? 1 : 0), by = fy - U(8) + p.b;
    var steel = { b: pack('#8a8fa6'), l: pack('#c1c6da'), s: pack('#5b6079') };
    // hose arc over top
    var pts = [], i;
    for (i = 0; i <= 14; i++) { var a = Math.PI * (1 - i / 14); pts.push([bx - U(1) + Math.cos(a) * U(8), by - U(4) - Math.sin(a) * U(10)]); }
    for (i = 0; i < pts.length - 1; i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i % 2 ? steel.s : steel.b, 2);
    g.rects(pts[14][0] - 2, pts[14][1] - 1, U(5), U(3), steel);
    g.rect(pts[0][0] - 2, pts[0][1] - 1, 4, 4, steel.s);
    // body
    g.rect(bx - U(9), by + U(4), U(19), U(2), P.s);
    g.ells(bx, by, U(10), U(6), P);
    g.rect(bx - U(9), by + U(0.5), U(19), 2, P.d); g.rect(bx - U(9), by + U(0.5) + 2, U(19), 1, P.l);
    // dust bag window
    g.rect(bx - U(7), by - U(3), U(4), U(3), P.l); g.rect(bx - U(7) + 1, by - U(3) + 1, U(4) - 2, U(3) - 2, P.w);
    // intake mouth
    var mw = p.m ? U(3.6) : U(2.4);
    g.rect(bx + U(7), by - U(1), mw, U(5), P.k);
    if (p.m) { for (i = 0; i < 3; i++) g.set(bx + U(7) + 1, by - U(1) + 1 + i * 2, P.w); }
    // wheels
    var rot = p.b ? 1 : 0;
    function wheel(wx) { g.ell(wx, fy - U(2), U(3), U(3), P.k); g.ell(wx, fy - U(2), U(1.6), U(1.6), steel.b); g.set(wx + (rot ? 1 : -1), fy - U(2) - 1, steel.l); }
    wheel(bx - U(6)); wheel(bx + U(6));
    eye(g, P, p, bx + U(2.6), by - U(3.4), 'big', 1); eye(g, P, p, bx + U(6), by - U(3.4), 'big', 1);
    if (!p.d && !p.h) { g.line(bx + U(2), by - U(5), bx + U(4.6), by - U(4.4), P.k); g.line(bx + U(8), by - U(5), bx + U(6.2), by - U(4.4), P.k); }
    if (o.boss) {
      g.rect(bx - U(2), by - U(1), U(5), U(3.6), P.d); g.rect(bx - U(2) + 1, by - U(1) + 1, U(5) - 2, U(3.6) - 2, P.gold);
      g.rect(bx - U(1.4), by + 0, 1, U(2), P.k); g.rect(bx + U(1.4), by + 0, 1, U(2), P.k); g.line(bx - U(1.4), by + 0, bx + U(1.4), by + U(2), P.k);
      g.rect(bx - U(7) - 2, by - U(8), U(6), U(3), P.d); g.rect(bx - U(7) - 1, by - U(8) - U(2), U(2), U(2), P.red);
    }
    if (p.m) g.defer(function () { for (var k = 0; k < 4; k++) g.line(bx + U(15) - k * 3, by - U(2) + k * 2 - 2, bx + U(18) - k * 3, by - U(2) + k * 2 - 2, P.l); });
    g.A = { x: bx + U(4), y: by - U(6), w: U(6), ex: bx + U(4), ey: by - U(3.4), nx: bx, ny: by - U(5) };
  };

  // Boss: Vacuum Mk IX. Upright, hulking, glowing orange headlamp eye, long black hose arm, bag full of socks.
  SP.vacuum_boss = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), bob = p.b;
    var steel = { b: pack('#8a8fa6'), l: pack('#d3d8ea'), s: pack('#5b6079') };
    var bag = { b: pack('#d8caa8'), l: pack('#f4ead0'), s: pack('#a89870') };
    var hose = { b: pack('#2c2742'), l: pack('#5a5578'), s: pack('#14102a') };
    // dust bag behind the trunk, stuffed with socks
    g.ells(bx - U(8), fy - U(13) - bob, U(4.6), U(8), bag);
    g.rect(bx - U(10), fy - U(15) - bob, U(3), 2, pack('#ff6fae')); g.rect(bx - U(9), fy - U(11) - bob, U(3), 2, pack('#5fb4ff')); g.rect(bx - U(11), fy - U(8) - bob, 3, 2, pack('#ffd95a'));
    // handle
    g.line(bx - U(3), fy - U(20) - bob, bx - U(6), fy - U(29) - bob, steel.b, 3);
    g.rect(bx - U(10), fy - U(31) - bob, U(7), 3, P.k);
    // foot plate and wheels
    g.rects(bx - U(9), fy - U(4), U(22), U(3), P);
    g.rects(bx + U(7), fy - U(4.4), U(8), U(3.4), { b: steel.s, l: steel.b, s: P.d });
    var mw = p.m ? U(4) : U(2);
    g.rect(bx + U(15), fy - U(4), mw, U(3), P.k);
    if (p.m) for (var t = 0; t < 3; t++) g.set(bx + U(15), fy - U(4) + t, P.w);
    function wheel(wx) { g.ell(wx, fy - U(1.4), U(2.2), U(2.2), P.k); g.ell(wx, fy - U(1.4), U(1.1), U(1.1), steel.b); }
    wheel(bx - U(6)); wheel(bx + U(7));
    // trunk
    g.ells(bx, fy - U(13) - bob, U(7), U(10), P);
    g.rect(bx - U(6), fy - U(8), U(12), 1, P.d);
    // chrome IX plate
    g.rects(bx - U(4), fy - U(9), U(7), U(3.4), steel);
    g.rect(bx - U(3), fy - U(8) + 1, 1, U(2), P.k); g.line(bx - U(1), fy - U(8) + 1, bx + U(1), fy - U(6) - 1, P.k); g.line(bx + U(1), fy - U(8) + 1, bx - U(1), fy - U(6) - 1, P.k);
    // headlamp eye
    var lx = bx + U(2.6), ly = fy - U(16) - bob;
    g.ell(lx, ly, U(3.6), U(3.6), P.d); g.ell(lx, ly, U(2.8), U(2.8), pack('#ff9a2e')); g.ell(lx, ly, U(1.8), U(1.8), pack('#fff0a0'));
    g.rect(lx + (p.a ? 1 : 0), ly - 1, 2, p.d ? 1 : 3, P.k);
    if (!p.d && !p.h) { g.line(lx - U(4), ly - U(4.6), lx + U(4), ly - U(2.6), P.k, 2); }
    g.defer(function () { if (p.d) return; var gl = pack('#ffb347', 120); for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; g.set(lx + Math.cos(a) * U(5.2), ly + Math.sin(a) * U(5.2), gl); } });
    // hose arm: from the shoulder out to a claw nozzle (reaches out when attacking)
    var sx = bx + U(6), sy = fy - U(11) - bob, hx = bx + U(14) + (p.a ? U(6) : 0), hy = fy - U(5) + (p.a ? -U(3) : 0);
    var n = 14, i;
    for (i = 0; i <= n; i++) { var tt = i / n, ex = sx + (hx - sx) * tt + Math.sin(tt * 3.14) * U(3), ey = sy + (hy - sy) * tt + Math.sin(tt * 3.14) * U(2); g.ells(ex, ey, U(1.8), U(1.8), i % 2 ? hose : { b: hose.l, l: hose.l, s: hose.b }, true); }
    g.rects(hx - 2, hy - U(2), U(4), U(4), steel);
    g.rect(hx + U(2), hy - U(2), 2, 2, steel.l); g.rect(hx + U(2), hy + 1, 2, 2, steel.l); g.rect(hx + U(2), hy - 1, 2, 1, P.k);
    g.A = { x: bx + U(2), y: fy - U(24), w: U(6), ex: lx, ey: ly, nx: bx, ny: fy - U(18) };
  };

  SP.mop = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(7) + p.b;
    var tilt = p.a ? U(8) : (p.b ? 1 : 0);
    // handle
    g.line(bx, by - U(4), bx + tilt, by - U(18), pack('#a9835a'), 2);
    g.line(bx - 1, by - U(4), bx - 1 + tilt, by - U(18), pack('#caa77a'), 1);
    g.rect(bx + tilt - 2, by - U(18) - 1, 5, 2, P.d);
    // mop head: shaggy mound
    g.ells(bx, by, U(8), U(6.6), { b: P.b, l: P.l, s: P.s });
    for (var i = -8; i <= 8; i++) {
      var len = U(3) + ((i * 7 + 13) % 4);
      g.rect(bx + U(i), by + U(4), 1, len + (p.b ? ((i & 1) ? 1 : 0) : ((i & 1) ? 0 : 1)), (i % 3 === 0) ? P.s : P.b);
    }
    g.rect(bx - U(8), by + U(4), U(17), 1, P.s);
    // band
    g.rect(bx - U(4), by - U(5), U(8), 2, P.red);
    // eyes peek through strands
    eye(g, P, p, bx + U(0), by - U(1), 'big', 1); eye(g, P, p, bx + U(4), by - U(1), 'big', 1);
    if (!p.d && !p.h) { g.line(bx - 1, by - U(2.6), bx + 2, by - U(1.6), P.k); g.line(bx + U(7), by - U(2.6), bx + U(4) + 1, by - U(1.6), P.k); }
    mouth(g, P, p, bx + U(1), by + U(3), 4);
    if (p.a) g.defer(function () { g.set(bx + tilt + 2, by - U(10), pack('#6ec6ff')); g.set(bx + tilt + 3, by - U(8), pack('#6ec6ff')); g.set(bx + tilt + 1, by - U(6), pack('#6ec6ff')); });
    g.A = { x: bx + U(2), y: by - U(6.6), w: U(7), ex: bx + U(2), ey: by - U(1), nx: bx, ny: by };
  };

  SP.spray = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), by = fy - U(8) + p.b;
    var liq = pack('#58b6e8'), liqL = pack('#a7e0ff');
    // body: tall rounded bottle
    g.ells(bx, by + U(2), U(6), U(8), { b: P.l, l: P.w, s: P.b });
    // liquid
    g.rect(bx - U(5), by + U(3), U(11), U(6), liq);
    g.rect(bx - U(5), by + U(3), U(11), 1, liqL);
    g.ells(bx, by + U(6), U(5.6), U(4), { b: liq, l: liqL, s: pack('#3a8ec0') });
    g.rect(bx - U(5), by + U(3), U(11), 1, liqL);
    g.rect(bx + 3, by + U(3) + 2, 1, 3, liqL);
    // neck + head
    g.rects(bx - U(2), by - U(7), U(4), U(4), { b: P.s, l: P.b, s: P.d });
    g.rects(bx - U(3), by - U(11), U(10), U(5), { b: P.b, l: P.l, s: P.s });
    g.rects(bx + U(7), by - U(9), U(3), U(2.4), { b: P.b, l: P.l, s: P.s });
    g.rect(bx + U(10), by - U(8.6), 2, 2, P.k);
    // trigger
    var trig = p.a ? 2 : 0;
    g.line(bx + U(3), by - U(5), bx + U(5) - trig, by - U(2), P.red, 2);
    g.rect(bx + U(2), by - U(5), U(3), 2, P.s);
    eye(g, P, p, bx + 0, by - U(9.4), 'big', 1); eye(g, P, p, bx + U(3.4), by - U(9.4), 'big', 1);
    if (!p.d && !p.h) { g.line(bx - 1, by - U(11), bx + 2, by - U(10.2), P.k); g.line(bx + U(6), by - U(11), bx + U(3) + 1, by - U(10.2), P.k); }
    // label
    g.rect(bx - U(3), by - U(1), U(6), U(3.6), P.w); g.rect(bx - U(3), by - U(1), U(6), 1, P.l);
    g.rect(bx, by - U(0) + 0, 1, 2, P.red); g.set(bx, by + U(2) - 0, P.red);
    if (o.boss) {
      // musketeer hat + plume + rapier + moustache
      g.ells(bx + U(2), by - U(12.6), U(8), U(2), { b: P.red, l: P.red, s: pack('#a8343f') }, true);
      g.rect(bx - U(2), by - U(16), U(8), U(4), pack('#a8343f'));
      g.line(bx + U(5), by - U(15), bx - U(7), by - U(19), P.w, 2); g.line(bx - U(7), by - U(19), bx - U(10), by - U(15), P.w, 1);
      g.rect(bx + U(7), by - U(7), U(4), 1, P.k); g.rect(bx + U(10), by - U(7), 1, 3, P.k);
    }
    if (p.a) g.defer(function () {
      for (var k = 0; k < 14; k++) {
        var tt = k / 13, sx = bx + U(12) + 3 + tt * U(14), sy = by - U(8) + (((k * 5) % 7) - 3) * tt * 2.2;
        g.set(sx, sy, k % 2 ? liq : liqL); if (k % 3 === 0) g.set(sx + 1, sy + 1, liqL);
      }
    });
    g.A = { x: bx + U(2), y: by - U(11), w: U(5), ex: bx + 1, ey: by - U(9.4), nx: bx, ny: by - U(7) };
  };

  SP.cucumber = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(6) + p.b;
    var look = (p.b ? 1 : 0);
    g.ells(bx, by, U(11), U(4.8), P);
    g.rect(bx - U(10), by - U(1.4), 2, U(3), P.l);
    // stem end
    g.rect(bx - U(11), by - U(1), 3, U(2.4), pack('#c9d98a'));
    // stripes + bumps
    for (var i = -7; i <= 7; i += 2) { g.set(bx + U(i), by - U(3) + ((i + 8) % 3), P.s); g.set(bx + U(i) + 1, by + U(2) + ((i + 7) % 3) - 1, P.s); }
    g.line(bx - U(7), by - U(0.4), bx + U(5), by - U(0.4), P.l);
    // huge spooked eyes
    eye(g, P, p, bx + U(3) + look, by - U(2), 'big', look ? -1 : 1);
    eye(g, P, p, bx + U(6.2) + look, by - U(2), 'big', look ? -1 : 1);
    if (!p.d && !p.h) { g.line(bx + U(2.4), by - U(3.6), bx + U(4.6), by - U(3), P.k); g.line(bx + U(7.8), by - U(3.6), bx + U(6), by - U(3), P.k); }
    // little o mouth
    if (p.d) g.line(bx + U(5), by + U(2.4), bx + U(8), by + U(1.6), P.k);
    else { g.rect(bx + U(5), by + U(2), 2, p.m ? 3 : 2, P.k); }
    // sweat drop
    if (!p.d) g.defer(function () { g.set(bx + U(9.6), by - U(4), pack('#8fd3ff')); g.set(bx + U(9.6), by - U(3), pack('#8fd3ff')); });
    g.rect(bx - U(4), fy - 1, 3, 2, P.s); g.rect(bx + U(3), fy - 1, 3, 2, P.s);
    g.A = { x: bx + U(4), y: by - U(5.4), w: U(5), ex: bx + U(4), ey: by - U(3.6), nx: bx, ny: by };
  };

  SP.bathtub = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(8) + p.b;
    var water = pack('#5b9fd6'), waterL = pack('#9fd2f2'), foam = pack('#f4f8ff');
    // feet
    g.defer(function () {});
    [[-8, 1], [7, 1]].forEach(function (f) {
      g.ells(bx + U(f[0]), fy - U(1.2), U(2), U(1.8), { b: P.gold, l: P.gold, s: P.goldD }, true);
    });
    // body
    g.rects(bx - U(10), by - U(1), U(21), U(8), P);
    g.ells(bx - U(8.4), by + U(5.4), U(2.6), U(2.6), P); g.ells(bx + U(8.4), by + U(5.4), U(2.6), U(2.6), P);
    g.rects(bx - U(7), by + U(6), U(15), U(2), P);
    // rim
    g.rect(bx - U(11), by - U(2), U(23), U(2.4), P.l); g.rect(bx - U(11), by + 0, U(23), 1, P.s);
    // water inside, waves
    g.rect(bx - U(9), by - U(1), U(19), 2, water);
    for (var i = -8; i <= 8; i += 2) g.set(bx + U(i), by - U(1) + ((i >> 1) & 1) - (p.b ? 1 : 0), waterL);
    // foam heap with eyes
    var fm = { b: foam, l: P.w, s: pack('#cfe0f0') };
    g.ells(bx - U(5), by - U(4), U(3.6), U(3), fm); g.ells(bx - U(1), by - U(5.6), U(4), U(3.6), fm); g.ells(bx + U(3.6), by - U(3.6), U(3.4), U(2.8), fm);
    g.ell(bx - U(4), by - U(8.4) + (p.b ? 1 : 0), 1.5, 1.5, foam); g.ell(bx + U(1), by - U(8.6), 1, 1, waterL);
    eye(g, P, p, bx - U(2.4), by - U(6.6), 'big', 1); eye(g, P, p, bx + U(1.6), by - U(6.6), 'big', 1);
    if (!p.d && !p.h) { g.line(bx - U(3.4), by - U(8.2), bx - U(0.4), by - U(7.2), P.k); g.line(bx + U(4.6), by - U(8.2), bx + U(1.6) + 1, by - U(7.2), P.k); }
    // rubber duck
    g.ells(bx + U(7), by - U(2.6), U(1.8), U(1.6), { b: pack('#ffd95a'), l: pack('#fff3b0'), s: pack('#d9a82a') }, true);
    g.set(bx + U(8.6), by - U(3.6), pack('#ff9a3d')); g.set(bx + U(8.6) + 1, by - U(3), pack('#ff9a3d'));
    // tap
    g.rect(bx - U(10), by - U(6), 2, U(4), P.gold); g.rect(bx - U(10), by - U(6), U(3), 2, P.gold);
    if (p.a) g.defer(function () {
      for (var k = 0; k < 16; k++) { var tt = k / 15; g.set(bx + U(11) + tt * U(14), by - U(6) - Math.sin(tt * 3.14) * U(7) + tt * U(8), k % 2 ? water : waterL); }
    });
    g.A = { x: bx - U(0.4), y: by - U(9), w: U(5), ex: bx - U(2.4), ey: by - U(6.6), nx: bx, ny: by };
  };

  SP.carrier = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(9) + p.b;
    var shake = p.a ? 1 : 0;
    g.rects(bx - U(10), by - U(6), U(21), U(15), P);
    // top shell lip + handle
    g.rect(bx - U(10), by - U(6), U(21), 2, P.l); g.rect(bx - U(11), by - U(1), U(23), 1, P.s);
    g.rect(bx - U(4), by - U(9), U(9), 2, P.d); g.rect(bx - U(4), by - U(9), 2, U(3), P.d); g.rect(bx + U(4), by - U(9), 2, U(3), P.d);
    g.rect(bx - U(3), by - U(8), U(7), 1, P.s);
    // vents on side
    for (var v = 0; v < 3; v++) g.rect(bx - U(9), by + U(1) + v * U(2.4), U(4), 1, P.d);
    // door face
    var dx = bx - U(3), dy = by - U(3), dw = U(13), dh = U(11);
    g.rect(dx, dy, dw, dh, P.k);
    // red glowing eyes behind bars
    var ey = dy + U(3);
    if (p.d) { eye(g, P, p, dx + U(2.4), ey, 'big'); eye(g, P, p, dx + U(7.6), ey, 'big'); }
    else {
      var w2 = p.m ? 3 : 2;
      g.rect(dx + U(2), ey, w2 + 1, w2, P.red); g.rect(dx + U(7.2), ey, w2 + 1, w2, P.red);
      g.set(dx + U(2), ey, P.w); g.set(dx + U(7.2), ey, P.w);
      g.line(dx + U(1), ey - 2, dx + U(2) + 3, ey - 1, P.red); g.line(dx + U(11.4), ey - 2, dx + U(7.2), ey - 1, P.red);
    }
    for (var b = 0; b <= dw; b += 2) g.rect(dx + b + shake * ((b >> 1) & 1), dy, 1, dh, P.l);
    g.rect(dx, dy, dw, 1, P.s); g.rect(dx, dy + dh - 1, dw, 1, P.s);
    // latch
    g.rect(bx + U(9), by + U(2), 2, U(3), P.gold);
    if (o.boss) {
      // grille door as clenched teeth, towel tuft and hospital tag
      for (var tb = 0; tb < dw; tb += 3) { g.rect(dx + tb + 1, dy + 1, 2, 3 + (p.m ? 1 : 0), P.w); g.rect(dx + tb + 1, dy + dh - 4 - (p.m ? 1 : 0), 2, 3 + (p.m ? 1 : 0), P.w); }
      g.rect(bx + U(1), by - U(8) - 1, U(5), 3, pack('#5fb4ff')); g.rect(bx + U(2), by - U(8) - 3, U(3), 2, pack('#8fd3ff'));
      g.line(bx + U(10), by - U(2), bx + U(11), by + U(3), P.s); g.rect(bx + U(10), by + U(3), 5, 6, P.w); g.rect(bx + U(10) + 2, by + U(3) + 1, 1, 4, P.red); g.rect(bx + U(10) + 1, by + U(3) + 2, 3, 1, P.red);
      g.rect(bx - U(8), by - U(4), U(4), U(4), P.w); g.rect(bx - U(7), by - U(4), 2, U(4), P.red); g.rect(bx - U(8), by - U(3), U(4), 2, P.red);
      g.rect(bx - U(9), by + U(7), U(18), 2, P.gold);
    }
    g.A = { x: bx, y: by - U(9), w: U(10), ex: dx + U(2), ey: ey, nx: bx, ny: by };
  };

  SP.hose = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), by = fy;
    var ring = { b: P.b, l: P.l, s: P.s };
    // base coils
    var coils = o.boss ? 4 : 3;
    for (var c = 0; c < coils; c++) {
      var cyy = by - U(2.4) - c * U(2.8);
      g.ells(bx, cyy, U(10) - c * U(0.8), U(2.6), (c % 2) ? { b: P.s, l: P.b, s: P.d } : ring);
      g.ells(bx, cyy, U(4), U(1.2), { b: P.d, l: P.d, s: P.d }, true);
      g.rect(bx - U(10) + c * 2, cyy - 1, U(20) - c * 4, 1, P.l);
    }
    // reel handle
    g.rect(bx + U(9), by - U(10), 2, U(9), P.gold);
    // neck
    var top = by - U(2.4) - (coils - 1) * U(2.8);
    var hx = bx + U(7) + (p.a ? U(6) : 0), hy = top - U(12) + (p.a ? U(4) : 0) + (p.b ? 1 : 0);
    var n = 16;
    for (var i = 0; i <= n; i++) {
      var t = i / n, ex = bx - U(3) + (hx - (bx - U(3))) * t + Math.sin(t * 3.14) * -U(5) * (1 - t * 0.2), ey = top + (hy - top) * t;
      g.ells(ex, ey, U(2.2), U(2.2), (i % 2) ? { b: P.s, l: P.b, s: P.d } : ring, true);
    }
    // nozzle head
    g.rects(hx - U(2), hy - U(3.4), U(7), U(5.4), { b: P.gold, l: pack('#ffe28a'), s: P.goldD });
    g.rects(hx + U(5), hy - U(2.4), U(3), U(3.4), { b: P.goldD, l: P.gold, s: P.d });
    g.rect(hx + U(8), hy - U(1.4), 2, U(1.8), P.k);
    eye(g, P, p, hx - U(0.4), hy - U(2.2), 'beady'); eye(g, P, p, hx + U(2.6), hy - U(2.2), 'beady');
    if (!p.d && !p.h) { g.line(hx - 1, hy - 4, hx + 2, hy - 3, P.k); g.line(hx + U(5) - 2, hy - 4, hx + U(2) + 2, hy - 3, P.k); }
    if (p.a) g.defer(function () {
      var wc = pack('#6ec6ff'), wl = pack('#c4ecff');
      for (var k = 0; k < 20; k++) { var tt = k / 19; g.set(hx + U(10) + tt * U(14), hy - U(0.4) + tt * tt * U(10) + (((k * 3) % 3) - 1), k % 2 ? wc : wl); }
    });
    g.A = { x: hx + U(1.4), y: hy - U(3.4), w: U(4), ex: hx, ey: hy - U(2.2), nx: hx, ny: hy + U(2) };
  };

  SP.laserdot = function (g, P, p, o) {
    g.noOutline = true;
    var U = o.U, cx = o.cx, cy = o.fy - U(9) - (p.b ? 1 : 0), bx = cx + p.l;
    var r = U(5) + (p.a ? 1 : 0) + (p.h ? -1 : 0);
    var glow = pack('#ff3b4d', 90), glow2 = pack('#ff3b4d', 150);
    // ripple rings (dithered)
    var rr = r + U(4) + (p.b ? 2 : 0);
    for (var y = -rr; y <= rr; y++) for (var x = -rr; x <= rr; x++) {
      var d = Math.sqrt(x * x + y * y);
      if (d <= rr && d > rr - 1.4 && ((x + y) & 1) === 0) g.set(bx + x, cy + y, glow);
      var r2 = r + U(1.6);
      if (d <= r2 && d > r + 0.2 && ((x + y) & 1) === 0) g.set(bx + x, cy + y, glow2);
    }
    g.ells(bx, cy, r, r, { b: pack('#ff3b4d'), l: pack('#ff8a96'), s: pack('#c21f35') });
    g.ell(bx, cy, r * 0.55, r * 0.55, pack('#ff6475'));
    g.rect(bx - Math.floor(r * 0.5), cy - Math.floor(r * 0.6), 2, 2, pack('#fff0f0'));
    // pupil: cat-eye slit bait
    if (p.d) { g.rect(bx - 1, cy, 3, 1, pack('#7a1a28')); }
    else { g.rect(bx + 0, cy - Math.floor(r * 0.5), 1, Math.floor(r), pack('#7a1a28')); }
    // sparkle
    if (!p.d) { g.set(bx + r + 2, cy - r, pack('#fff0f0')); g.set(bx + r + 2, cy - r - 1, pack('#fff0f0')); g.set(bx + r + 1, cy - r, pack('#fff0f0')); g.set(bx + r + 3, cy - r, pack('#fff0f0')); }
    if (o.boss && !p.d) {
      // smug half-lidded eyes, smirk, and afterimage copies trailing off
      g.rect(bx - r + 2, cy - 2, 3, 2, pack('#fff0f0')); g.rect(bx + 1, cy - 2, 3, 2, pack('#fff0f0'));
      g.rect(bx - r + 3, cy - 1, 2, 1, pack('#7a1a28')); g.rect(bx + 2, cy - 1, 2, 1, pack('#7a1a28'));
      g.rect(bx - r + 2, cy - 3, 3, 1, pack('#7a1a28')); g.rect(bx + 1, cy - 3, 3, 1, pack('#7a1a28'));
      g.line(bx - 2, cy + 3, bx + 2, cy + 3, pack('#7a1a28')); g.set(bx + 3, cy + 2, pack('#7a1a28'));
      g.defer(function () { for (var k = 1; k <= 3; k++) { var gh = pack('#ff3b4d', 170 - k * 30); for (var yy = -r; yy <= r; yy++) for (var xx = -r; xx <= r; xx++) if (xx * xx + yy * yy <= r * r && ((xx + yy + k) & 1) === 0 && (xx + yy) % 2 === 0) g.set(bx + r * 1.5 + k * U(5) + xx * 0.7, cy + yy * 0.7 + k * 2, gh); } });
    }
    g.A = { x: bx, y: cy - r, w: r, ex: bx, ey: cy, nx: bx, ny: cy };
  };

  SP.alarm_clock = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), r = U(o.boss ? 9.4 : 7.4), cy = fy - U(2.6) - r;
    var sh = p.a ? (p.b ? 1 : -1) : 0, gold = { b: P.gold, l: pack('#ffe28a'), s: P.goldD };
    // legs and feet
    g.rect(bx - U(4.6), fy - U(3), 2, U(3), P.k); g.rect(bx + U(3), fy - U(3), 2, U(3), P.k);
    g.rect(bx - U(5.4), fy - 1, 4, 1, P.k); g.rect(bx + U(2.4), fy - 1, 4, 1, P.k);
    // twin bells + hammer
    g.ells(bx - U(4.6) - sh, cy - r + U(0.6), U(3.2), U(2.4), gold);
    g.ells(bx + U(4.6) + sh, cy - r + U(0.6), U(3.2), U(2.4), gold);
    g.rect(bx - 1, cy - r - U(2.4), 2, U(2.4), P.k); g.rect(bx - 2 + (p.a ? (p.b ? 2 : -2) : 0), cy - r - U(3.4), 4, U(1.4), P.k);
    // body and face
    g.ells(bx, cy, r, r, P);
    g.ell(bx, cy, r - U(1.4), r - U(1.4), P.w);
    for (var k = 0; k < 4; k++) { var a = k * Math.PI / 2; g.rect(bx + Math.cos(a) * (r - U(2.2)), cy + Math.sin(a) * (r - U(2.2)), 1, 1, P.k); }
    g.line(bx, cy + U(1), bx + U(0.4), cy - U(0.6), P.red); g.line(bx, cy + U(1), bx + U(3), cy + U(2.4), P.k);
    eye(g, P, p, bx - U(3.6), cy - U(3.4), 'big', 1); eye(g, P, p, bx + U(1.4), cy - U(3.4), 'big', 1);
    if (!p.d && !p.h) { g.line(bx - U(4.4), cy - U(5.4), bx - U(1.8), cy - U(4.4), P.k); g.line(bx + U(3.8), cy - U(5.4), bx + U(1.4), cy - U(4.4), P.k); }
    if (p.m) g.rect(bx - U(1.2), cy + U(3.6), U(3), 2, P.k);
    if (p.a) g.defer(function () { var rc = pack('#ffd95a'); for (var q = 0; q < 3; q++) { g.set(bx - U(9) - q * 2, cy - U(5) + q * 3, rc); g.set(bx + U(9) + q * 2, cy - U(5) + q * 3, rc); } });
    g.A = { x: bx, y: cy - r - U(3), w: U(5), ex: bx - U(3.6), ey: cy - U(3.4), nx: bx, ny: cy };
  };

  SP.door = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx + p.l - (p.h ? 1 : 0), by = fy;
    var fr = { b: P.s, l: P.b, s: P.d };
    var W = U(15) - (p.a ? 4 : 0), H = U(26);
    // frame
    g.rects(bx - U(9), by - H - U(2), U(18), H + U(2), fr);
    g.rect(bx - U(7), by - H, U(14), H, P.k);
    // door slab
    var sx = bx - U(7), sw = W;
    g.rects(sx, by - H, sw, H, P);
    // panels
    var pw = sw - 6;
    g.rect(sx + 3, by - H + 3, pw, U(6), P.s); g.rect(sx + 4, by - H + 4, pw - 2, U(6) - 2, P.b);
    g.rect(sx + 3, by - H + U(9) + 3, pw, U(9), P.s); g.rect(sx + 4, by - H + U(9) + 4, pw - 2, U(9) - 2, P.b);
    // eyes in upper panel
    var ex = sx + 3 + Math.round(pw * 0.2);
    eye(g, P, p, ex, by - H + U(2.6), 'big', 1); eye(g, P, p, ex + Math.max(4, Math.round(pw * 0.45)), by - H + U(2.6), 'big', 1);
    if (!p.d && !p.h) { g.line(ex - 1, by - H + U(2.6) - 2, ex + 2, by - H + U(2.6) - 1, P.k); g.line(ex + Math.max(4, Math.round(pw * 0.45)) + 3, by - H + U(2.6) - 2, ex + Math.max(4, Math.round(pw * 0.45)), by - H + U(2.6) - 1, P.k); }
    // knob nose
    g.ells(sx + sw - 4, by - U(12), 2.4, 2.4, { b: P.gold, l: pack('#fff0a8'), s: P.goldD }, true);
    // mail slot mouth
    g.rect(sx + 3, by - U(7), pw, p.m || p.a ? 3 : 2, P.k);
    if (p.m || p.a) { for (var t = 0; t < pw; t += 3) g.set(sx + 3 + t, by - U(7), P.w); }
    // hinges
    g.rect(sx - 1, by - H + U(3), 2, 3, P.gold); g.rect(sx - 1, by - U(5), 2, 3, P.gold);
    // gap light at bottom
    g.rect(bx - U(7), by - 1, U(14), 1, p.a ? P.gold : P.d);
    g.A = { x: bx, y: by - H - U(2), w: U(8), ex: ex, ey: by - H + U(2.6), nx: bx, ny: by - U(10) };
  };

  SP.hairdryer = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bx = cx - U(2) + p.l - (p.h ? 1 : 0), by = fy - U(11) + p.b;
    // cord: curly tail
    g.defer(function () {
      var px = bx - U(3), py = by + U(11);
      for (var i = 0; i < 26; i++) { var t = i / 25; g.set(px - t * U(12) + Math.cos(i * 1.1) * 1.4, py + (fy - py - 1) * t * 0 + Math.sin(i * 1.1) * 2 + (p.b ? 1 : 0), P.d); }
    });
    // handle
    g.rects(bx - U(3), by + U(2), U(5), U(9), { b: P.s, l: P.b, s: P.d });
    g.rect(bx - U(2), by + U(3), 2, U(2.4), P.red);
    g.rect(bx - U(3), by + U(9), U(5), 2, P.k);
    // barrel
    g.ells(bx + U(2), by - U(1), U(10), U(5.6), P);
    // rear grille
    g.rect(bx - U(7), by - U(3), U(2), U(5), P.d);
    for (var i = 0; i < 3; i++) g.rect(bx - U(7), by - U(3) + i * 2 + 1, U(2), 1, P.l);
    // nozzle
    g.rects(bx + U(10), by - U(4), U(4), U(6), { b: P.s, l: P.b, s: P.d });
    g.rect(bx + U(13), by - U(3), 2, U(4), P.k);
    // stripe
    g.rect(bx - U(2), by - U(5), U(10), 1, P.red);
    eye(g, P, p, bx + U(0.4), by - U(3.4), 'big', 1); eye(g, P, p, bx + U(4.4), by - U(3.4), 'big', 1);
    if (!p.d && !p.h) { g.line(bx - 1, by - U(5), bx + 2, by - U(4), P.k); g.line(bx + U(8) - 1, by - U(5), bx + U(5), by - U(4), P.k); }
    if (p.a || p.m) g.defer(function () {
      var hot = [pack('#ff5d6c'), pack('#ff9a3d'), pack('#ffd95a')];
      for (var w = 0; w < 3; w++) for (var k = -3; k <= 3; k++) g.set(bx + U(15) + 3 + w * 4 + Math.abs(k) * 0.6, by - U(1) + k * (1.5 + w * 0.7), hot[w]);
    });
    g.A = { x: bx + U(2), y: by - U(6.6), w: U(8), ex: bx + 1, ey: by - U(3.4), nx: bx, ny: by + U(2) };
  };

  SP.balloon = function (g, P, p, o) {
    var U = o.U, cx = o.cx, fy = o.fy, bob = Math.round(Math.sin((p.b ? 1.5 : 0)) * 1.5);
    var bx = cx + p.l - (p.h ? 1 : 0), by = fy - U(15) + bob;
    if (p.d) {
      // popped: limp scraps on the floor
      g.defer(function () {
        g.ells(bx, fy - 2, U(5), 2, { b: P.b, l: P.l, s: P.s }, true);
        g.tri(bx + U(3), fy - 1, bx + U(7), fy - 4, bx + U(6), fy, P.b);
        g.tri(bx - U(6), fy - 1, bx - U(3), fy - 5, bx - U(2), fy, P.s);
        g.set(bx, fy - 3, P.k); g.set(bx + 2, fy - 3, P.k);
        g.line(bx, fy, bx - U(7), fy, P.w);
      });
      g.A = { x: bx, y: fy - 5, w: 4, ex: bx, ey: fy - 3, nx: bx, ny: fy };
      return;
    }
    var sq = p.a ? 1 : 0;
    g.ells(bx, by, U(7) + sq, U(8.6) - sq, P);
    g.tri(bx - 2, by + U(8.2), bx + 3, by + U(8.2), bx, by + U(10), P.s);
    g.rect(bx - 2, by + U(8) - 1, 5, 1, P.s);
    // shine
    g.rect(bx - U(4), by - U(6), 2, U(2.4), P.w); g.set(bx - U(4) + 2, by - U(6) - 1, P.w); g.set(bx - U(4), by - U(6) + U(2.4), P.w);
    // smug face
    var ey = by - U(1);
    if (p.h) { eye(g, P, p, bx - U(2.6), ey, 'beady'); eye(g, P, p, bx + U(2), ey, 'beady'); }
    else {
      g.rect(bx - U(3), ey, 3, 2, P.w); g.rect(bx - U(3), ey, 3, 1, P.k); g.rect(bx - U(2), ey + 1, 2, 1, P.k);
      g.rect(bx + U(1.4), ey, 3, 2, P.w); g.rect(bx + U(1.4), ey, 3, 1, P.k); g.rect(bx + U(2.4), ey + 1, 2, 1, P.k);
    }
    // smirk
    g.line(bx - U(1.6), by + U(3), bx + U(1), by + U(3), P.k); g.set(bx + U(1) + 1, by + U(2.4), P.k); g.set(bx + U(1) + 2, by + U(2), P.k);
    if (p.m) g.rect(bx - U(1), by + U(3), 3, 2, P.k);
    g.defer(function () {
      var sx = bx, sy = by + U(10);
      for (var i = 0; sy + i < fy; i++) g.set(sx + Math.round(Math.sin(i * 0.6 + (p.b ? 1 : 0)) * 1.6), sy + i, P.w);
    });
    g.A = { x: bx, y: by - U(8.6), w: U(7), ex: bx - 2, ey: ey, nx: bx, ny: by + U(8) };
  };

  // ---------- species table ----------
  // box: S=32 M=40 L=48 B=64 ; sz default size class ; fall: 'flip' | 'rotate'
  var DEF = {
    mouse:     { fn: 'mouse', sz: 'S', col: ['#9a9fb2', '#e7a0b0'], fall: 'flip', name: 'Mouse' },
    rat:       { fn: 'rat', sz: 'S', col: ['#7d7490', '#c98a9c'], fall: 'flip', name: 'Rat' },
    hamster:   { fn: 'hamster', sz: 'S', col: ['#d9c6a6', '#b08a5c'], fall: 'flip', name: 'Hamster' },
    squirrel:  { fn: 'squirrel', sz: 'S', col: ['#a8806c', '#e9cfae'], fall: 'flip', name: 'Squirrel' },
    dog:       { fn: 'dog', sz: 'M', col: ['#9c8a7e', '#e6dccf'], fall: 'flip', name: 'Dog' },
    crow:      { fn: 'crow', sz: 'S', col: ['#454a6a', '#8d93b8'], fall: 'flip', name: 'Crow' },
    raccoon:   { fn: 'raccoon', sz: 'M', col: ['#8a8d9e', '#d8d9e2'], fall: 'flip', name: 'Raccoon' },
    fox:       { fn: 'fox', sz: 'M', col: ['#cf7b52', '#f3e9dc'], fall: 'flip', name: 'Fox' },
    snake:     { fn: 'snake', sz: 'M', col: ['#5f9680', '#d9c36a'], fall: 'none', name: 'Snake' },
    spider:    { fn: 'spider', sz: 'S', col: ['#7d6aa6', '#ff5d6c'], fall: 'flip', name: 'Spider' },
    flea:      { fn: 'flea', sz: 'S', box: 24, col: ['#b5685a', '#e6b09a'], fall: 'flip', name: 'Flea' },
    goose:     { fn: 'goose', sz: 'M', col: ['#ecebf3', '#c8c9d8'], fall: 'flip', name: 'Goose' },
    vacuum:    { fn: 'vacuum', sz: 'M', col: ['#b04a5c', '#d9dae6'], fall: 'rotate', name: 'Vacuum' },
    mop:       { fn: 'mop', sz: 'M', col: ['#8d8da4', '#c9c9d6'], fall: 'rotate', name: 'Mop' },
    spray:     { fn: 'spray', sz: 'M', col: ['#9fc9cc', '#e8f4f4'], fall: 'rotate', name: 'Spray Bottle' },
    cucumber:  { fn: 'cucumber', sz: 'S', col: ['#6f9f6c', '#c9d98a'], fall: 'flip', name: 'Cucumber' },
    bathtub:   { fn: 'bathtub', sz: 'L', col: ['#c6d2e6', '#f4f8ff'], fall: 'flip', name: 'Bathtub' },
    carrier:   { fn: 'carrier', sz: 'M', col: ['#7a8296', '#c3c8d6'], fall: 'flip', name: 'Carrier Crate' },
    hose:      { fn: 'hose', sz: 'M', col: ['#4f9a62', '#a7dcb0'], fall: 'flip', name: 'Hose' },
    laserdot:  { fn: 'laserdot', sz: 'S', col: ['#ff3b4d', '#ffd0d6'], fall: 'none', name: 'Red Dot' },
    door:      { fn: 'door', sz: 'L', col: ['#8a6248', '#c9a37c'], fall: 'rotate', name: 'Door' },
    hairdryer: { fn: 'hairdryer', sz: 'M', col: ['#6f7494', '#c6c9de'], fall: 'flip', name: 'Hair Dryer' },
    alarm_clock: { fn: 'alarm_clock', sz: 'S', col: ['#d9514e', '#f2c14e'], fall: 'flip', name: 'Alarm Clock' },
    balloon:   { fn: 'balloon', sz: 'M', col: ['#8f7cf0', '#d9d2ff'], fall: 'none', name: 'Balloon' }
  };
  // per-seed coat variety so different dogs and rodents do not all look alike (only when no colors given)
  var COATS = {
    dog: [['#9c8a7e', '#e6dccf'], ['#d8b06a', '#f6e8c8'], ['#4a4048', '#c9a37c'], ['#e8e2d8', '#9aa0b0'], ['#7a4a30', '#e6c9a0'], ['#c9743a', '#f6efe4'], ['#8c93a6', '#f1f3f8']],
    mouse: [['#9a9fb2', '#e7a0b0'], ['#c9a98a', '#f0c8c0'], ['#e6e2dc', '#f0a6b4'], ['#6f6a7e', '#d98aa0']],
    rat: [['#7d7490', '#c98a9c'], ['#5e5648', '#c9a09a'], ['#a09a9e', '#e0aab4'], ['#46404e', '#b87a8c']],
    squirrel: [['#a8806c', '#e9cfae'], ['#8c8c98', '#e6e6ee'], ['#c9743a', '#f3e2c4']],
    hamster: [['#d9c6a6', '#b08a5c'], ['#e8e2d8', '#c9a98a'], ['#b8864e', '#f0e0c0']]
  };
  var ALIAS = {
    clock: { species: 'alarm_clock' }, alarm: { species: 'alarm_clock' }, snooze_alarm: { species: 'alarm_clock' },
    boss_alarm_clock: { species: 'alarm_clock', size: 'B', boss: true }, alarm_clock_dawn: { species: 'alarm_clock', size: 'B', boss: true }, boss_dawn: { species: 'alarm_clock', size: 'B', boss: true },
    boss_great_bath: { species: 'bathtub', size: 'B', boss: true }, boss_bath: { species: 'bathtub', size: 'B', boss: true }, boss_bathtub: { species: 'bathtub', size: 'B', boss: true }, great_bath: { species: 'bathtub', size: 'B', boss: true },
    dog_small: { species: 'dog', size: 'S' }, dog_medium: { species: 'dog', size: 'M' }, dog_large: { species: 'dog', size: 'L' },
    dog_floppy: { species: 'dog', size: 'M', ears: 'floppy' }, dog_pointy: { species: 'dog', size: 'M', ears: 'pointy' },
    puppy: { species: 'dog', size: 'S', ears: 'floppy' }, hound: { species: 'dog', size: 'L', ears: 'floppy' }, terrier: { species: 'dog', size: 'S', ears: 'pointy' },
    shepherd: { species: 'dog', size: 'L', ears: 'pointy' },
    mop_bucket: { species: 'mop' }, spray_bottle: { species: 'spray' }, bath: { species: 'bathtub' }, tub: { species: 'bathtub' },
    vet_carrier: { species: 'carrier' }, crate: { species: 'carrier' }, carrier_crate: { species: 'carrier' }, laser: { species: 'laserdot' },
    red_dot: { species: 'laserdot' }, laser_dot: { species: 'laserdot' }, hair_dryer: { species: 'hairdryer' }, dryer: { species: 'hairdryer' },
    garden_hose: { species: 'hose' }, vacuum_cleaner: { species: 'vacuum' }, roomba: { species: 'vacuum' },
    rat_king: { species: 'rat', size: 'B', accessory: 'crown', boss: true },
    boss_rat_king: { species: 'rat', size: 'B', accessory: 'crown', boss: true },
    boss_hose: { species: 'hose', size: 'B', boss: true }, boss_garden_hose: { species: 'hose', size: 'B', boss: true },
    boss_vacuum: { species: 'vacuum', size: 'B', boss: true }, vacuum_mk9: { species: 'vacuum', size: 'B', boss: true }, vacuum_mk_ix: { species: 'vacuum', size: 'B', boss: true },
    boss_spray: { species: 'spray', size: 'B', boss: true }, spray_bottle_duelist: { species: 'spray', size: 'B', boss: true },
    boss_carrier: { species: 'carrier', size: 'B', boss: true }, boss_vet_carrier: { species: 'carrier', size: 'B', boss: true },
    boss_reddot: { species: 'laserdot', size: 'B', boss: true }, boss_red_dot: { species: 'laserdot', size: 'B', boss: true },
    cuke: { species: 'cucumber' }, kitchen_cucumber: { species: 'cucumber' }
  };
  var SIZES = { S: { box: 32, u: 1, cap: 1 }, M: { box: 40, u: 1.25, cap: 2 }, L: { box: 48, u: 1.5, cap: 3 }, B: { box: 64, u: 2, cap: 5 } };
  var POSES = {
    idle0: { b: 0 },
    idle1: { b: 1 },
    attack: { l: 3, m: 1, a: 1, b: 0 },
    hurt: { h: 1, b: 0 },
    dead: { d: 1, b: 0 }
  };
  var POSE_NAMES = ['idle0', 'idle1', 'attack', 'hurt', 'dead'];

  // ---------- accessories ----------
  var ACCESSORIES = ['none', 'crown', 'hat_top', 'helmet', 'bandana', 'eyepatch', 'scar', 'bowtie', 'party', 'goggles', 'monocle', 'horns', 'cape', 'sunglasses'];
  function drawAccessory(g, P, name, o) {
    var A = g.A; if (!A || !A.x || name === 'none' || !name) return;
    var k = Math.max(1, Math.round(o.u)), x = Math.round(A.x), y = Math.round(A.y), w = Math.max(3, Math.round(A.w));
    var gold = P.gold, goldD = P.goldD;
    switch (name) {
      case 'crown':
        g.rect(x - 3 * k, y - 2 * k, 6 * k + 1, 2 * k, gold);
        g.rect(x - 3 * k, y - 2 * k, 6 * k + 1, 1, pack('#ffe28a'));
        g.rect(x - 3 * k, y - 4 * k, k, 2 * k, gold); g.rect(x - 1 * k + 1, y - 4 * k - (k > 1 ? 1 : 0), k, 2 * k + 1, gold); g.rect(x + 2 * k, y - 4 * k, k + 1, 2 * k, gold);
        g.set(x - 1 * k + 1, y - 2 * k + 1, P.red); g.set(x + k, y - 2 * k + 1, pack('#5fb4ff'));
        g.set(x - 3 * k, y - 4 * k - 1, pack('#fff3b0')); g.set(x + 2 * k, y - 4 * k - 1, pack('#fff3b0'));
        break;
      case 'hat_top':
        g.rect(x - 4 * k, y - 1, 8 * k, 2, P.k); g.rect(x - 2 * k, y - 6 * k, 5 * k, 6 * k, P.k);
        g.rect(x - 2 * k, y - 2 * k, 5 * k, 2, P.red); g.rect(x - 2 * k, y - 6 * k, 2, 6 * k, pack('#3a3358'));
        break;
      case 'helmet':
        g.ells(x, y + 2 * k, w + 1, 4 * k, { b: pack('#a3a9bd'), l: pack('#dfe3f2'), s: pack('#6e7590') });
        g.rect(x - w, y + 2 * k, 2 * w + 1, 2, pack('#6e7590')); g.rect(x, y - 1, 1, 2 * k, pack('#6e7590'));
        break;
      case 'bandana':
        g.rect(x - w, y + 2 * k, 2 * w, 2 * k, P.red); g.rect(x - w, y + 2 * k, 2 * w, 1, pack('#ff93a0'));
        g.tri(x - w - 1, y + 2 * k, x - w - 4 * k, y + 1, x - w - 1, y + 4 * k, P.red);
        g.set(x - 1, y + 2 * k + 1, P.w); g.set(x + 2, y + 2 * k + 1, P.w);
        break;
      case 'eyepatch':
        g.rect(A.ex - 1, A.ey - 1, 4, 4, P.k); g.line(A.ex - 1, A.ey - 1, A.ex - 5, A.ey - 4, P.k); g.line(A.ex + 3, A.ey + 3, A.ex + 6, A.ey + 6, P.k);
        break;
      case 'scar':
        g.line(A.ex - 1, A.ey - 3, A.ex + 2, A.ey + 3, P.pink); g.line(A.ex, A.ey - 3, A.ex + 3, A.ey + 3, P.w);
        break;
      case 'bowtie':
        var bx = Math.round(A.nx), by = Math.round(A.ny);
        g.tri(bx - 4 * k, by - 2 * k, bx, by, bx - 4 * k, by + 2 * k, P.red); g.tri(bx + 4 * k, by - 2 * k, bx, by, bx + 4 * k, by + 2 * k, P.red);
        g.rect(bx - 1, by - 1, 3, 3, pack('#a8343f'));
        break;
      case 'party':
        g.tri(x - 3 * k, y + 1, x + 3 * k, y + 1, x, y - 8 * k, pack('#ff6fae'));
        g.line(x - 2 * k, y - 1, x + 1, y - 7 * k, pack('#ffd95a')); g.line(x + k, y - 1, x - 1, y - 5 * k, pack('#6ec6ff'));
        g.ell(x, y - 8 * k, 1.5, 1.5, P.w);
        break;
      case 'goggles':
        g.line(x - w, y + 3 * k, x + w, y + 3 * k, P.k, 2);
        g.ell(x - 2 * k, y + 2 * k, 2.5 * k, 2.5 * k, pack('#6e7590')); g.ell(x + 2 * k, y + 2 * k, 2.5 * k, 2.5 * k, pack('#6e7590'));
        g.ell(x - 2 * k, y + 2 * k, 1.6 * k, 1.6 * k, pack('#8fe3ff')); g.ell(x + 2 * k, y + 2 * k, 1.6 * k, 1.6 * k, pack('#8fe3ff'));
        break;
      case 'monocle':
        g.ell(A.ex + 1, A.ey + 1, 3, 3, gold); g.ell(A.ex + 1, A.ey + 1, 2, 2, 0); g.line(A.ex + 1, A.ey + 4, A.ex - 2, A.ey + 9, goldD);
        // re-draw eye inside ring
        g.rect(A.ex, A.ey, 2, 2, P.k);
        break;
      case 'horns':
        g.tri(x - w + 1, y + 3 * k, x - w - k, y - 4 * k, x - 1, y + 2, pack('#e8dcc0'));
        g.tri(x + w - 1, y + 3 * k, x + w + k, y - 4 * k, x + 1, y + 2, pack('#e8dcc0'));
        break;
      case 'sunglasses':
        g.rect(A.ex - 3, A.ey - 1, 8, 3, P.k); g.rect(A.ex - 3, A.ey - 1, 3, 1, pack('#4a4570'));
        break;
    }
  }
  function drawCapeBehind(g, P, o) {
    var cx = o.cx, fy = o.fy, U = o.U;
    g.tri(cx - U(2), fy - U(16), cx - U(12), fy - U(1), cx + U(2), fy - U(2), P.red);
    g.tri(cx - U(2), fy - U(16), cx - U(8), fy - U(14), cx - U(12), fy - U(1), pack('#a8343f'));
  }

  // ---------- normalize descriptors ----------
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function normalize(d) {
    if (typeof d === 'string') d = { species: d };
    d = d || {};
    var sp = String(d.species || d.kind || 'mouse').toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^pest_/, '');
    var out = { species: sp, size: d.size, ears: d.ears, accessory: d.accessory || 'none', colors: d.colors, boss: !!d.boss, seed: d.seed | 0, facing: d.facing || 'left' };
    var al = ALIAS[sp];
    if (al) { out.species = al.species; if (!out.size && al.size) out.size = al.size; if (!out.ears && al.ears) out.ears = al.ears; if (al.boss) out.boss = true; if (al.accessory && !d.accessory) out.accessory = al.accessory; }
    if (!DEF[out.species]) out.species = 'mouse';
    var def = DEF[out.species];
    var sz = out.size; if (typeof sz === 'string') sz = sz.toUpperCase(); var szMap = { SMALL: 'S', MEDIUM: 'M', LARGE: 'L', BOSS: 'B' };
    sz = szMap[sz] || sz;
    if (!SIZES[sz]) sz = def.sz;
    if (out.boss) sz = 'B';
    out.size = sz;
    if (out.species === 'dog' && !out.ears) out.ears = (hash(String(out.seed) + sz) & 1) ? 'floppy' : 'pointy';
    if (!out.ears) out.ears = 'pointy';
    // colors: array [base, accent, accent2], object, or palette name
    var c = out.colors, base = def.col[0], acc = def.col[1], acc2 = '#ffd95a';
    if (!c && COATS[out.species] && out.seed) { var ct = COATS[out.species][hash(String(out.seed) + out.species) % COATS[out.species].length]; base = ct[0]; acc = ct[1]; }
    if (Array.isArray(c)) { base = c[0] || base; acc = c[1] || acc; acc2 = c[2] || acc2; }
    else if (c && typeof c === 'object') { base = c.base || c.main || base; acc = c.accent || acc; acc2 = c.accent2 || acc2; }
    else if (typeof c === 'string' && c[0] === '#') base = c;
    out.colors = [base, acc, acc2];
    return out;
  }
  function keyOf(n) { return [n.species, n.size, n.ears, n.accessory, n.colors.join(','), n.boss ? 1 : 0, n.facing].join('|'); }

  // ---------- rendering ----------
  var hasDoc = typeof document !== 'undefined';
  function newCanvas(w, h) {
    if (SB.gfx.createCanvas) return SB.gfx.createCanvas(w, h);
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }
  function outlinePass(g, P) {
    var W = g.W, H = g.H, src = g.d, out = new Uint32Array(src);
    var oc = P.o;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) {
      if (src[y * W + x]) continue;
      var n = (x > 0 && src[y * W + x - 1]) || (x < W - 1 && src[y * W + x + 1]) || (y > 0 && src[(y - 1) * W + x]) || (y < H - 1 && src[(y + 1) * W + x]);
      if (n) out[y * W + x] = oc;
    }
    g.d = out;
  }
  function transform(g, mode, W, H) {
    var s = g.d, d = new Uint32Array(W * H), x, y;
    if (mode === 'flip') { for (y = 0; y < H; y++) for (x = 0; x < W; x++) d[(H - 1 - y) * W + x] = s[y * W + x]; }
    else if (mode === 'rotate') { // fall onto its back, rotate 90 degrees clockwise
      for (y = 0; y < H; y++) for (x = 0; x < W; x++) d[x * W + (W - 1 - y)] = s[y * W + x];
    } else d.set(s);
    // settle: bbox bottom at H-2, bbox centered
    var minx = W, maxx = -1, miny = H, maxy = -1;
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) if (d[y * W + x]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    if (maxx < 0) return d;
    var ox = Math.round(W / 2 - (minx + maxx) / 2), oy = (H - 2) - maxy, r = new Uint32Array(W * H);
    for (y = 0; y < H; y++) for (x = 0; x < W; x++) { var v = d[y * W + x]; if (v) { var nx = x + ox, ny = y + oy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) r[ny * W + nx] = v; } }
    return r;
  }
  function desat(buf, amt) {
    for (var i = 0; i < buf.length; i++) {
      var c = buf[i]; if (!c) continue;
      var u = unpack(c), gr = (u[0] * 0.3 + u[1] * 0.55 + u[2] * 0.15);
      var r = Math.round(u[0] + (gr - u[0]) * amt), g2 = Math.round(u[1] + (gr - u[1]) * amt), b = Math.round(u[2] + (gr - u[2]) * amt);
      buf[i] = pack([r, g2, b], u[3]);
    }
  }
  function mirror(buf, W, H) {
    var d = new Uint32Array(W * H);
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) d[y * W + (W - 1 - x)] = buf[y * W + x];
    return d;
  }
  function toCanvas(buf, W, H) {
    var cv = newCanvas(W, H), ctx = cv.getContext('2d'), id = ctx.createImageData(W, H);
    new Uint32Array(id.data.buffer).set(buf);
    ctx.putImageData(id, 0, 0);
    return cv;
  }
  function renderFrame(n, poseName) {
    var def = DEF[n.species], S = SIZES[n.size], box = def.box && n.size === def.sz ? def.box : S.box;
    var u = def.box && n.size === def.sz ? 1 : S.u;
    var P = mkPal(n.colors[0], { accent: n.colors[1], accent2: n.colors[2] });
    var p = Object.assign({ l: 0, b: 0, m: 0, a: 0, h: 0, d: 0 }, POSES[poseName]);
    var g = new Painter(box, box);
    var o = {
      U: function (v) { return Math.round(v * u); }, u: u, cx: Math.floor(box / 2), fy: box - 3, sz: n.size, ears: n.ears, boss: n.boss || n.size === 'B', box: box
    };
    if (n.accessory === 'cape') drawCapeBehind(g, P, o);
    // boss rat king gets a ragged red cape too
    if (n.species === 'rat' && o.boss && n.accessory === 'crown') drawCapeBehind(g, P, o);
    SP[def.fn](g, P, p, o);
    var A = g.A;
    if (n.accessory !== 'cape') drawAccessory(g, P, n.accessory, o);
    if (!g.noOutline) outlinePass(g, P);
    for (var i = 0; i < g.after.length; i++) g.after[i]();
    var buf = g.d;
    if (p.d) {
      if (def.fall !== 'none') buf = transform(g, def.fall, box, box);
      desat(buf, 0.35);
    }
    if (n.facing === 'left') buf = mirror(buf, box, box);
    // mirror anchors
    var anc = null;
    if (A && A.x) {
      var mx = function (x) { return n.facing === 'left' ? box - 1 - x : x; };
      anc = { x: mx(A.x), y: A.y, w: A.w, ex: mx(A.ex), ey: A.ey };
    }
    return { buf: buf, A: anc };
  }

  var cache = new Map(), CACHE_MAX = 300;
  function make(desc) {
    var n = normalize(desc), key = keyOf(n);
    var hit = cache.get(key); if (hit) return hit;
    var def = DEF[n.species], S = SIZES[n.size];
    var box = def.box && n.size === def.sz ? def.box : S.box;
    var frames = {}, anchors = {}, bufs = {};
    for (var i = 0; i < POSE_NAMES.length; i++) {
      var r = renderFrame(n, POSE_NAMES[i]);
      frames[POSE_NAMES[i]] = toCanvas(r.buf, box, box); bufs[POSE_NAMES[i]] = r.buf; anchors[POSE_NAMES[i]] = r.A;
    }
    // tight bounds of idle0 for hit boxes and health plates
    var b = bounds(bufs.idle0, box, box);
    var sp = { desc: n, key: key, w: box, h: box, frames: frames, anchor: anchors.idle0, bounds: b, capacity: S.cap, flying: n.species === 'crow' || n.species === 'balloon' || n.species === 'laserdot', _bufs: bufs, _flash: {} };
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, sp);
    return sp;
  }
  function bounds(buf, W, H) {
    var minx = W, maxx = -1, miny = H, maxy = -1;
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (buf[y * W + x]) { if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    return { x: minx, y: miny, w: maxx - minx + 1, h: maxy - miny + 1 };
  }
  function flashFrame(sp, pose, color) {
    var k = pose + (color || '');
    if (sp._flash[k]) return sp._flash[k];
    var src = sp._bufs[pose], out = new Uint32Array(src.length), rgb = parse(color || '#ffffff');
    for (var i = 0; i < src.length; i++) if (src[i]) out[i] = pack(rgb, unpack(src[i])[3]);
    return (sp._flash[k] = toCanvas(out, sp.w, sp.h));
  }

  // ---------- drawPest ----------
  // pose: 'idle' | 'attack' | 'hurt' | 'dead' | 'death' | 'idle0' | 'idle1'
  // x,y = feet position (bottom center) in logical px; scale = integer
  // opts: {flash:bool|color, alpha, flip, bob, t (death progress 0..1), phase}
  function drawPest(ctx, descriptor, pose, x, y, scale, tick, opts) {
    opts = opts || {};
    var sp = descriptor && descriptor.frames ? descriptor : make(descriptor);
    scale = scale || 1; tick = tick || 0;
    var ph = (opts.phase !== undefined ? opts.phase : (hash(sp.key) % 60));
    var name = pose || 'idle', t = opts.t, alpha = opts.alpha === undefined ? 1 : opts.alpha, dy = 0, dx = 0, flash = opts.flash;
    if (name === 'idle') name = (((tick + ph) / (opts.idleTicks || 30)) | 0) % 2 ? 'idle1' : 'idle0';
    if (name === 'death') {
      t = t === undefined ? 1 : t;
      if (t < 0.25) { name = 'hurt'; flash = flash || (t < 0.18 ? true : false); dx = -1; }
      else { name = 'dead'; alpha *= Math.max(0, 1 - (t - 0.6) / 0.4); dy = Math.min(0, 0); }
    }
    if (!sp.frames[name]) name = 'idle0';
    if (sp.flying && (name === 'idle0' || name === 'idle1') && !opts.noBob && !opts.reduceMotion) dy -= Math.round(Math.sin((tick + ph) / 14) * 1.2);
    if (opts.reduceMotion && (name === 'idle1')) name = 'idle0';
    var src = flash ? flashFrame(sp, name, typeof flash === 'string' ? flash : null) : sp.frames[name];
    var flip = opts.flip === true;
    var dxPix = Math.round(x - (sp.w / 2) * scale) + dx * scale, dyPix = Math.round(y - (sp.h - 3) * scale) + dy * scale - 0;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    if (opts.tint) { /* tint handled by caller via overlay; kept simple */ }
    if (flip) { ctx.translate(Math.round(x), 0); ctx.scale(-1, 1); ctx.translate(-Math.round(x), 0); }
    ctx.drawImage(src, dxPix, dyPix, sp.w * scale, sp.h * scale);
    ctx.restore();
    return { x: dxPix, y: dyPix, w: sp.w * scale, h: sp.h * scale };
  }

  // pixels of a frame for death bursts: [{x,y,color}] in sprite space (feet-centered, y up negative)
  function pixels(desc, pose, maxCount) {
    var sp = make(desc), buf = sp._bufs[pose || 'idle0'], out = [], i, W = sp.w;
    for (i = 0; i < buf.length; i++) if (buf[i]) {
      var u = unpack(buf[i]);
      out.push({ x: (i % W) - W / 2, y: ((i / W) | 0) - (sp.h - 3), color: 'rgb(' + u[0] + ',' + u[1] + ',' + u[2] + ')' });
    }
    if (maxCount && out.length > maxCount) { var step = out.length / maxCount, r = []; for (var k = 0; k < maxCount; k++) r.push(out[Math.floor(k * step)]); out = r; }
    return out;
  }

  // catalog used by demo and data agents
  var CATALOG = [
    'mouse', 'rat', 'hamster', 'squirrel', 'dog_small', 'dog_medium', 'dog_large', 'dog_floppy', 'dog_pointy', 'crow', 'raccoon', 'fox', 'snake', 'spider', 'flea', 'goose',
    'vacuum', 'mop', 'spray_bottle', 'cucumber', 'bathtub', 'carrier_crate', 'hose', 'red_dot', 'door', 'hair_dryer', 'balloon', 'alarm_clock',
    'boss_rat_king', 'boss_hose', 'boss_vacuum', 'boss_spray', 'boss_carrier', 'boss_reddot', 'boss_great_bath', 'boss_alarm_clock'
  ];

  SB.gfx.pestprint = {
    make: make, drawPest: drawPest, normalize: normalize, pixels: pixels, flashFrame: function (sp, pose, color) { return flashFrame(sp.frames ? sp : make(sp), pose || 'idle0', color); },
    species: Object.keys(DEF), accessories: ACCESSORIES, catalog: CATALOG, poses: POSE_NAMES, sizes: SIZES,
    clearCache: function () { cache.clear(); }
  };
})();
