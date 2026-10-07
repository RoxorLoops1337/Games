// BEATBOX HEROES -- chars_acc.js
// Part 4 of the character renderer: glasses and accessories (neck, ears, back, hand, wrist).
// Same design-unit authoring as the other parts, rasterised on the current grid.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
  }
  const { PAL, mix } = BBH;
  const Kit = BBH.CharsKit, { CX, HY, T0, M, shade, flat, GR, iX, iY, nx, ny, Painter, edge, ring } = Kit;
  const ramp = (c) => Kit.softRamp(c);
  const rpOf = (c) => ramp(c);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000; };
  const R = (r) => HY + r;
  const EU = 5.0, EV = 9.8;                                // eye centre offsets (see chars_body FACE)

  // rounded rectangle mask (design units)
  const rr = (cx, cy, hw, hh, r) => M().fn(cx - hw - 1, cy - hh - 1, cx + hw + 1, cy + hh + 1, (x, y) => {
    const ax = Math.abs(x - cx), ay = Math.abs(y - cy); if (ax > hw || ay > hh) return false;
    const dx = ax - (hw - r), dy = ay - (hh - r); return dx <= 0 || dy <= 0 || Math.hypot(dx, dy) <= r;
  });
  const ellM = (cx, cy, rx, ry) => M().ellipse(cx, cy, rx, ry);

  /* ----------------------------------------------------------------- glasses */
  function glasses(X) {
    const g = X.L.glasses; if (!g || g.id === 'none') return;
    const P = X.P, S = X.S, f = Kit.faceCtx(S), D = new Painter(P).shiftN(f.ox, f.oy), rp = rpOf(g.color), dark = '#1a1630';
    const SH = (m) => m.shiftN(f.ox, f.oy);
    const put = (m, c) => SH(m).each((x, y) => P.px(x, y, c));
    const lens = (m, c1, c2) => { const s = SH(m), b = s.bounds(); if (!b) return; s.each((x, y) => P.px(x, y, mix(c1, c2, (y - b.y0) / (b.y1 - b.y0 + 1)))); };
    const frame = (outer, inner, r) => { const fm = outer.clone().sub(inner); shade(P, SH(fm), r || rp, { cap: 2, hi: true }); return fm; };
    const glint = (cx, cy, big) => { D.line(cx - 1.2, cy + 0.4, cx + 0.4, cy - 1.2, '#ffffff'); D.px(cx + 1.4, cy - 1.5, '#ffffff'); if (big) D.px(cx - 1.8, cy + 1.0, '#d8f0ff'); };
    const ecx = (s) => CX + s * EU, ecy = R(EV);
    const temples = (c, y) => { for (const s of [-1, 1]) D.line(CX + s * 8.6, y === undefined ? ecy - 0.8 : y, CX + s * 10.6, (y === undefined ? ecy - 0.8 : y) + 0.4, c); };
    switch (g.id) {
      case 'round': case 'nerd': {
        for (const s of [-1, 1]) {
          const o = g.id === 'round' ? ellM(ecx(s), ecy, 3.6, 3.5) : rr(ecx(s), ecy, 3.6, 3.1, 1.0), i = g.id === 'round' ? ellM(ecx(s), ecy, 2.5, 2.4) : rr(ecx(s), ecy, 2.6, 2.1, 0.5);
          frame(o, i); glint(ecx(s) - 1.0, ecy - 0.6);
        }
        D.hl(CX - 1.6, CX + 1.6, ecy - 1.2, rp.base); D.px(CX, ecy - 1.7, rp.hi); temples(rp.shade);
        break;
      }
      case 'shades': case 'wayfarer': {
        const way = g.id === 'wayfarer';
        for (const s of [-1, 1]) {
          const lm = way ? M().poly([[ecx(s) - 3.6, ecy - 1.8], [ecx(s) + 3.6, ecy - 1.6], [ecx(s) + 2.8, ecy + 2.4], [ecx(s) - 2.8, ecy + 2.4]]) : rr(ecx(s), ecy + 0.1, 3.5, 2.5, 1.2);
          lens(lm, '#3a3060', '#14102a'); glint(ecx(s) - 1.4, ecy - 0.4, true);
          const top = M().fn(ecx(s) - 4, ecy - 3, ecx(s) + 4, ecy - 1.2, (x, y) => Math.abs(x - ecx(s)) <= 3.9 && y <= ecy - 1.3 + (way ? 0.4 : 0));
          if (way) { const f2 = way ? M().poly([[ecx(s) - 4.0, ecy - 2.6], [ecx(s) + 4.0, ecy - 2.6], [ecx(s) + 3.6, ecy - 1.2], [ecx(s) - 3.6, ecy - 1.0]]) : top; shade(P, SH(f2), rp, { cap: 2, hi: true }); }
          else D.hl(ecx(s) - 3.6, ecx(s) + 3.6, ecy - 2.3, rp.base);
        }
        D.hl(CX - 1.8, CX + 1.8, ecy - 2.1, rp.base); D.px(CX, ecy - 1.6, rp.shade);
        temples(rp.shade, ecy - 1.8);
        break;
      }
      case 'aviator': {
        for (const s of [-1, 1]) {
          const lm = M().fn(ecx(s) - 4, ecy - 3.5, ecx(s) + 4, ecy + 4, (x, y) => { const v = (y - ecy) / 3.3, w = 3.7 * (v < 0 ? 1 : Math.max(0, 1 - v * v * 0.55)); return Math.abs(x - ecx(s)) <= w && y >= ecy - 2.9 && y <= ecy + 3.2 && Math.hypot((x - ecx(s)) / 3.7, v * 0.9) <= 1.12; });
          lens(lm, '#2f5a6a', '#9fd0c8'); frame(lm.clone().growD(0.7), lm, rpOf('#d4a017')); glint(ecx(s) - 1.2, ecy - 0.6, true);
        }
        D.hl(CX - 1.8, CX + 1.8, ecy - 2.2, '#d4a017'); D.hl(CX - 1.2, CX + 1.2, ecy - 1.4, '#a47a10');
        temples('#a47a10', ecy - 1.8);
        break;
      }
      case 'sport': {
        const sm = M().fn(CX - 11, ecy - 3.5, CX + 11, ecy + 3.5, (x, y) => { const u = (x - CX) / 10.6; if (Math.abs(u) > 1) return false; const top = ecy - 2.5 + 1.3 * u * u, bot = ecy + 2.3 + 1.1 * u * u * (1 - 0) - 0.9 * Math.pow(Math.abs(u), 6) * 0; return y >= top && y <= bot && !(Math.abs(u) < 0.13 && y > ecy - 0.2); });
        const mir = ramp(g.color); sm.shiftN(f.ox, f.oy).each((x, y) => { const b = SH(sm).bounds(); const t = (y - b.y0) / (b.y1 - b.y0 + 1); P.px(x, y, t < 0.3 ? mir.hi : t < 0.6 ? mir.light : t < 0.8 ? mir.base : mir.shade); });
        edge(SH(sm), 0, -1).each((x, y) => P.px(x, y, dark)); edge(SH(sm), 0, 1).each((x, y) => P.px(x, y, dark));
        for (let q = -8; q <= 8; q += 4) D.line(CX + q - 0.6, ecy + 0.8, CX + q + 1.2, ecy - 1.4, '#ffffff');
        D.line(CX - 11, ecy - 0.4, CX - 10.2, ecy - 1.2, dark); D.line(CX + 11, ecy - 0.4, CX + 10.2, ecy - 1.2, dark);
        break;
      }
      case 'heart': {
        const hr = ramp(g.color);
        for (const s of [-1, 1]) {
          const hm = M().fn(ecx(s) - 4.2, ecy - 3.8, ecx(s) + 4.2, ecy + 4.2, (x, y) => { const u = (x - ecx(s)) / 3.7, v = -(y - ecy - 0.3) / 3.5 + 0.35; return Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v <= 0; });
          shade(P, SH(hm), hr, { cap: 3, hi: true }); glint(ecx(s) - 1.3, ecy - 1.2);
          edge(SH(hm), 0, 1).each((x, y) => P.px(x, y, hr.deep));
        }
        D.hl(CX - 1.2, CX + 1.2, ecy - 1.6, hr.deep); temples(hr.deep, ecy - 1.2);
        break;
      }
      case 'star': {
        const sr = ramp(g.color);
        for (const s of [-1, 1]) {
          const sm = M().fn(ecx(s) - 4.4, ecy - 4.4, ecx(s) + 4.4, ecy + 4.4, (x, y) => { const dx = x - ecx(s), dy = y - ecy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2, q = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= 1.6 + 2.7 * Math.max(0, 1 - Math.abs(q) / (Math.PI / 5) * 1.08); });
          shade(P, SH(sm), sr, { cap: 3, hi: true }); glint(ecx(s) - 0.6, ecy - 0.6);
          edge(SH(sm), 0, 1).each((x, y) => P.px(x, y, sr.deep));
        }
        D.hl(CX - 1.2, CX + 1.2, ecy, sr.deep); temples(sr.deep, ecy - 0.6);
        break;
      }
      case 'pixel': {
        // the iconic 8-bit "deal with it" shades, drawn on the design grid so the stair-steps stay chunky
        const c = g.color, lt = mix(c, '#ffffff', 0.38), v0 = R(8);
        D.rect(CX - 10, v0, 20, 1.2, c);
        for (const [x0, w] of [[-10, 8], [2, 8]]) D.rect(CX + x0, v0 + 1.2, w, 1.2, c);
        for (const [x0, w] of [[-9, 6], [3, 6]]) D.rect(CX + x0, v0 + 2.4, w, 1.2, c);
        for (const [x0, w] of [[-8, 4], [4, 4]]) D.rect(CX + x0, v0 + 3.6, w, 1.2, c);
        D.rect(CX - 11, v0, 1, 1.2, c); D.rect(CX + 10, v0, 1, 1.2, c);
        for (const s of [-1, 1]) { D.rect(CX + s * 6.5 - 1.5 + (s < 0 ? 0 : 0), v0 + 1.3, 3, 0.9, lt); D.px(CX + s * 7.6, v0 + 2.5, lt); }
        D.rect(CX - 10, v0, 6, 0.8, lt);
        break;
      }
      case 'monocle': {
        const rg = rpOf(g.color), rcm = ellM(ecx(1), ecy, 3.7, 3.6), ri = ellM(ecx(1), ecy, 2.6, 2.5);
        frame(rcm, ri, rg); glint(ecx(1) - 1, ecy - 0.8);
        for (let t = 0; t < 10; t++) { const px = ecx(1) + 1.2 + Math.sin(t * 0.6) * 0.8 + t * 0.15, py = ecy + 3.4 + t * 1.0; D.px(px, py, t % 2 ? rg.base : rg.light); }
        D.px(ecx(1) + 3.4, ecy - 1.2, rg.hi);
        break;
      }
      case 'goggles': {
        const br = ramp('#8a5a30'), brass = ramp('#d4a017');
        D.hl(CX - 11.5, CX + 11.5, ecy - 3.2, br.base, Math.max(2, GR.t * 2)); D.hl(CX - 11.5, CX + 11.5, ecy - 4.0, br.light, 1);
        for (let x = -10; x <= 10; x += 2.6) D.px(CX + x, ecy - 3.0, br.deep);
        for (const s of [-1, 1]) {
          const lm = ellM(ecx(s), ecy + 0.1, 3.0, 3.0); lens(lm, '#7ad8ff', '#2a6a98');
          frame(lm.clone().growD(1.0), lm, brass); glint(ecx(s) - 1, ecy - 0.8, true);
          for (let q = 0; q < 6; q++) { const a = q * 1.05; D.px(ecx(s) + Math.cos(a) * 3.9, ecy + Math.sin(a) * 3.9, brass.hi); }
        }
        D.hl(CX - 1.6, CX + 1.6, ecy - 1.0, brass.base); D.hl(CX - 1.6, CX + 1.6, ecy - 0.2, brass.shade);
        break;
      }
      case 'vr': {
        const pm = rr(CX, ecy, 10.5, 3.9, 1.8);
        shade(P, SH(pm), rp, { cap: 3, hi: true });
        const vis = rr(CX, ecy + 0.1, 9.6, 3.0, 1.4); put(vis, '#120d1f');
        for (const s of [-1, 1]) { const gm = ellM(ecx(s) * 1 + (s < 0 ? 0.4 : -0.4) + 0, ecy + 0.2, 2.8, 1.7).and(rr(CX, ecy, 9.6, 3.0, 1.4)); put(gm, '#1a8aa8'); D.hl(ecx(s) - 2.2, ecx(s) + 2.2, ecy + 0.2, '#2ee6ff'); D.px(ecx(s) - 1.4, ecy - 0.4, '#8ff0ff'); }
        D.vl(CX - 0.5, ecy - 2.4, ecy + 2.6, rp.shade); D.vl(CX + 0.5, ecy - 2.4, ecy + 2.6, rp.deep);
        for (let x = -9; x <= 9; x += 2.4) D.add(x + CX, ecy + 4.4, '#2ee6ff', 90);
        D.hl(CX - 10, CX + 10, ecy + 3.6, rp.shade, 1);
        temples(rp.shade, ecy - 0.6);
        break;
      }
      case 'neonbar': {
        const sl = rr(CX, ecy, 10, 1.9, 0.8); put(sl, '#120d1f');
        D.hl(CX - 9.4, CX + 9.4, ecy - 0.1, g.color, 1); for (let x = -9; x <= 9; x += 3.3) D.px(CX + x, ecy - 0.1, '#ffffff');
        D.hl(CX - 9.6, CX + 9.6, ecy - 2.0, rp.deep, 1);
        for (let x = -9; x <= 9; x += 1.6) { D.add(x + CX, ecy - 2.8, g.color, 100); D.add(x + CX + 0.8, ecy + 2.6, g.color, 90); }
        temples(rp.base, ecy - 0.4);
        break;
      }
      case 'eyepatch': {
        const pm = M().fn(ecx(-1) - 4.2, ecy - 3.8, ecx(-1) + 4.2, ecy + 4.2, (x, y) => ((x - ecx(-1)) / 3.7) ** 2 + ((y - ecy - 0.2) / 3.5) ** 2 <= 1);
        shade(P, SH(pm), rpOf(mix(g.color, '#3a3050', 0.2)), { cap: 3, hi: true });
        D.px(ecx(-1) - 1.4, ecy - 1.0, '#8a7ab0'); D.px(ecx(-1) - 0.6, ecy - 1.4, '#6a5a90');
        const sc = mix(g.color, '#3a3050', 0.35);
        D.line(ecx(-1) + 1, ecy - 3.2, CX + 9.5, ecy - 7.2, sc); D.line(ecx(-1) + 2, ecy - 3.0, CX + 9.8, ecy - 6.6, mix(sc, '#6a5a90', 0.4));
        D.line(ecx(-1) - 3.2, ecy - 0.8, CX - 10.6, ecy - 2.4, sc);
        break;
      }
      case 'chromeshield': {
        // rimless one-piece chrome wrap with a horizon reflection and sparkles
        const sm = M().fn(CX - 11.5, ecy - 4.6, CX + 11.5, ecy + 4.2, (x, y) => {
          const u = (x - CX) / 9.6; if (Math.abs(u) > 1) return false;
          const top = ecy - 2.9 + 1.0 * u * u * u * u * 2 - 0.4 * (1 - u * u), bot = ecy + 2.3 + 1.1 * u * u;
          return y >= top && y <= bot && !(Math.abs(u) < 0.1 && y > ecy - 0.4);
        });
        const s2 = SH(sm), b = s2.bounds();
        s2.each((x, y) => {
          const t = (y - b.y0) / (b.y1 - b.y0 + 1), u = (iX(x - f.ox) - CX) / 10.8;
          let c = t < 0.2 ? '#f4fbff' : t < 0.42 ? '#bfe3f2' : t < 0.55 ? '#5d7fa0' : t < 0.7 ? '#2e4668' : t < 0.86 ? '#e8b78a' : '#ffd9b0';
          if (Math.abs(((u * 6 + t * 4) % 2)) < 0.12) c = '#ffffff';
          P.px(x, y, c);
        });
        edge(s2, 0, -1).each((x, y) => P.px(x, y, '#ffffff')); edge(s2, 0, 1).each((x, y) => P.px(x, y, '#3a4a68'));
        D.px(CX - 7.5, ecy - 2.4, '#ffffff'); D.px(CX - 6.5, ecy - 2.9, '#ffffff'); D.px(CX + 6.8, ecy - 1.4, '#ffffff'); D.vl(CX + 7.6, ecy - 2.6, ecy - 0.4, '#e8f6ff', 1);
        temples('#9fb4cc', ecy - 2);
        break;
      }
      case 'oversized': {
        for (const s of [-1, 1]) {
          const o = rr(ecx(s) + s * 0.2, ecy + 0.2, 4.7, 3.7, 1.0), i = rr(ecx(s) + s * 0.2, ecy + 0.2, 3.8, 2.8, 0.6);
          shade(P, SH(o.clone().sub(i)), rpOf(mix(g.color, '#17141f', 0.5)), { cap: 2, hi: true });
          lens(i, '#2c2548', '#0f0c1e'); glint(ecx(s) - 1.8, ecy - 0.6, true); D.hl(ecx(s) - 3.2, ecx(s) - 0.6, ecy - 1.6, '#5a4a98', 1);
        }
        D.hl(CX - 1.4, CX + 1.4, ecy - 1.3, '#17141f', Math.max(2, GR.t)); temples('#17141f', ecy - 1.2);
        break;
      }
      case 'gold_round': {
        const gd = ramp('#e8b923');
        for (const s of [-1, 1]) {
          const lm = ellM(ecx(s), ecy, 3.3, 3.3); lens(lm, s < 0 ? '#e8a54a' : '#e8a54a', '#8a3f6a');
          const thin = ellM(ecx(s), ecy, 3.7, 3.7).sub(ellM(ecx(s), ecy, 3.1, 3.1)); shade(P, SH(thin), gd, { cap: 2, hi: true });
          glint(ecx(s) - 1, ecy - 0.8, true);
        }
        D.hl(CX - 1.8, CX + 1.8, ecy - 1.6, gd.base); D.hl(CX - 1.4, CX + 1.4, ecy - 0.8, gd.shade); temples(gd.shade);
        break;
      }
    }
  }

  /* ------------------------------------------------------------------ ears */
  function ears(X) {
    const a = X.L.acc.ears; if (!a || a.id === 'none_ears') return;
    const P = X.P, S = X.S, f = Kit.faceCtx(S), D = new Painter(P).shiftN(f.ox, f.oy), rp = rpOf(a.color);
    const SH = (m) => m.shiftN(f.ox, f.oy);
    for (const s of [-1, 1]) {
      const ex = CX + s * 10.6, ey = R(10.2);
      switch (a.id) {
        case 'studs': D.px(ex, R(11.8), rp.hi); D.px(ex + s * 0.2, R(12.4), rp.base); break;
        case 'iced': {
          D.px(ex, R(12.0), '#ffffff'); D.px(ex + s * 0.2, R(12.7), '#bfe9ff'); D.px(ex - s * 0.9, R(12.0), '#e8f8ff'); D.px(ex + s * 0.9, R(12.0), '#e8f8ff'); D.px(ex, R(11.2), '#e8f8ff'); D.px(ex, R(13.0), '#9ad8ff');
          D.add(ex + s * 1.4, R(11.4), '#ffffff', 160); D.add(ex - s * 1.0, R(13.4), '#9ad8ff', 140);
          break;
        }
        case 'hoops': {
          const rg = M().ellipse(ex + s * 0.3, R(14.0), 1.7, 2.2).sub(M().ellipse(ex + s * 0.3, R(14.0), 0.8, 1.2)); shade(P, SH(rg), rp, { cap: 2, hi: true });
          break;
        }
        case 'dangles': {
          D.px(ex, R(11.6), rp.hi); D.px(ex, R(12.4), rp.light); D.vl(ex, R(12.6), R(14), rp.base);
          const st = M().fn(ex - 2.2, R(14) - 0.6, ex + 2.2, R(18.4), (x, y) => { const dx = x - ex, dy = y - R(16.2), r = Math.hypot(dx, dy), q = Math.atan2(dy, dx) + Math.PI / 2, w = ((q % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= 0.6 + 1.5 * Math.max(0, 1 - Math.abs(w) / (Math.PI / 5)); });
          flat(P, SH(st), '#ffe14d'); D.px(ex, R(16.2), '#fff7b0');
          break;
        }
        case 'hpears': {
          const hm = Kit.headMask(S, true), r0 = hm.clone().clipY(0, R(8)), band = r0.clone().growD(2.6).sub(r0.clone().growD(1.2)).clipY(0, R(8.5));
          if (s < 0) shade(P, SH(band), rp, { cap: 2, hi: true });
          const cup = rr(ex + s * 0.2, R(10.4), 2.6, 3.8, 1.2), cm = ramp(mix(a.color, '#17141f', 0.55));
          shade(P, SH(cup), rp, { cap: 3, hi: true });
          const pad = rr(ex - s * 0.3, R(10.4), 1.7, 2.8, 0.8); shade(P, SH(pad), cm, { cap: 2, hi: true });
          D.px(ex + s * 0.5, R(8.6), rp.hi); D.hl(ex - 1.2, ex + 1.2, R(10.5), rp.light, 1);
          break;
        }
      }
    }
  }

  /* ------------------------------------------------------------------- neck */
  function neck(X) {
    const L = X.L, a = L.acc.neck; if (!a || a.id === 'none_neck') return;
    const P = X.P, S = X.S, D = X.D, cx = CX + S.tx, y0 = T0 + S.dy, rp = rpOf(a.color);
    const tp = (dx, r, c) => D.px(cx + dx, y0 + r, c);
    const link = (px, py, horiz, gold, glint) => {
      const m = horiz ? M().ellipse(px, py, 1.15, 0.8) : M().ellipse(px, py, 0.8, 1.15);
      shade(P, m, gold, { cap: 2, hi: true });
      if (glint) D.px(px - 0.3, py - 0.3, '#ffffff');
    };
    switch (a.id) {
      case 'chain': {
        for (let t = 0; t <= 1.001; t += 0.07) { const u = (t - 0.5) * 2, x = u * 4.2, y = 0.9 + (1 - u * u) * 4.6; tp(x, y, t * 14 % 2 < 1 ? rp.hi : rp.base); }
        tp(0, 6.2, rp.hi); tp(0, 6.9, rp.light); tp(-0.5, 7.4, rp.base); tp(0.5, 7.4, rp.shade);
        break;
      }
      case 'cubanchain': {
        const gold = ramp(mix(a.color, '#e8b923', 0.5));
        let i = 0;
        for (let t = 0; t <= 1.001; t += 0.065) { const u = (t - 0.5) * 2, x = u * 4.6, y = 0.9 + (1 - u * u) * 5.2; link(cx + x, y0 + y, (i++ & 1) === 0, gold, i % 3 === 0); }
        // big pendant: a faceted gold block with an iced centre and sparkle glints
        const pend = M().rect(cx - 2.6, y0 + 7.4, 5.2, 5.4).or(M().rect(cx - 1.4, y0 + 6.2, 2.8, 1.4)); shade(P, pend, gold, { cap: 3, hi: true });
        const inner = M().rect(cx - 1.5, y0 + 8.4, 3, 3.2); flat(P, inner, '#d8f4ff');
        inner.each((x, y) => { if (hash(x, y) < 0.35) P.px(x, y, '#ffffff'); else if (hash(y, x) < 0.2) P.px(x, y, '#8fd0f0'); });
        D.px(cx - 0.5, y0 + 9.4, '#ffffff'); D.vl(cx + 3.6, y0 + 7.4, y0 + 9.0, '#ffffff', 1); D.hl(cx + 2.8, cx + 4.4, y0 + 8.2, '#ffffff', 1);
        D.add(cx - 3.4, y0 + 11.2, '#fff7b0', 170);
        break;
      }
      case 'dogtags': {
        for (let t = 0; t <= 1.001; t += 0.05) { const u = (t - 0.5) * 2, x = u * 4.0, y = 0.8 + (1 - u * u) * 5.6; tp(x, y, t * 20 % 2 < 1 ? '#e6edf8' : '#8a96b0'); }
        const metal = rpOf(a.color);
        for (const [dx, dy] of [[-0.6, 6.2], [1.0, 7.4]]) { const t = rr(cx + dx, y0 + dy + 2, 1.7, 2.3, 0.9); shade(P, t, metal, { cap: 2, hi: true }); D.hl(cx + dx - 0.9, cx + dx + 0.9, y0 + dy + 1.3, metal.deep, 1); D.hl(cx + dx - 0.9, cx + dx + 0.5, y0 + dy + 2.3, metal.shade, 1); D.px(cx + dx - 0.8, y0 + dy + 0.6, '#ffffff'); }
        break;
      }
      case 'scarf': {
        const m = M().rows(y0 + 0, [S.G.neck + 2.5, S.G.neck + 3, S.G.neck + 3], cx), tail = M().rect(cx + 1, y0 + 2, 4, 9).or(M().rect(cx + 2, y0 + 11, 3, 1));
        shade(P, tail, rp, { cap: 3 }); shade(P, m, rp, { cap: 3 });
        const r2 = rpOf(mix(a.color, '#ffffff', 0.55));
        m.each((x, y) => { const u = iX(x) - cx; if (Math.abs(((u * 0.9) % 3)) < 0.7) P.px(x, y, r2.base); });
        tail.each((x, y) => { if (Math.floor(iY(y) - y0) % 3 === 0) P.px(x, y, r2.base); });
        for (let i = 0; i < 4; i++) D.px(cx + 1.4 + i, y0 + 12, i % 2 ? rp.light : rp.shade);
        D.hl(cx - 5, cx + 5, y0 + 0.2, rp.light, 1); D.line(cx - 3, y0 + 1.6, cx + 3, y0 + 2.4, rp.deep);
        break;
      }
      case 'bowtie': {
        for (const s of [-1, 1]) { const w = M().poly([[cx + s * 0.8, y0 + 1.6], [cx + s * 4.2, y0 - 0.2], [cx + s * 4.2, y0 + 3.6]]); shade(P, w, rp, { cap: 2, hi: true }); D.line(cx + s * 1.0, y0 + 1.6, cx + s * 4.0, y0 + 1.6, rp.deep); }
        D.rect(cx - 1, y0 + 0.7, 2, 1.9, rp.light); D.px(cx - 0.4, y0 + 1.0, rp.hi);
        break;
      }
      case 'hpneck': {
        const b = rpOf(a.color);
        for (let r = -1; r <= 2; r += 0.5) { tp(-4.6, r, b.deep); tp(4.6, r, b.deep); } th2(D, cx - 3.6, cx + 3.6, y0 - 1.2, b.deep);
        for (const s of [-1, 1]) {
          const cup = rr(cx + s * 8.0, y0 + 5.6, 2.8, 3.9, 1.2); shade(P, cup, b, { cap: 3, hi: true });
          const pad = rr(cx + s * 8.0 - s * 0.3, y0 + 5.6, 1.7, 2.7, 0.8); shade(P, pad, rpOf(mix(a.color, '#17141f', 0.6)), { cap: 2, hi: true });
          D.px(cx + s * 7.5 - 0.6, y0 + 3.3, b.hi); D.vl(cx + s * 5.4, y0 + 1, y0 + 3, b.shade);
        }
        break;
      }
      case 'lanyard': {
        for (let r = 0; r <= 8; r += 0.5) { const dx = 3.5 - r * 0.4; tp(-dx, r, rp.base); tp(dx - 1, r, rp.light); }
        const card = rr(cx, y0 + 11.6, 2.8, 3.4, 0.6); flat(P, card, '#f7f2e8');
        edge(card, 0, -1).each((x, y) => P.px(x, y, '#cfc6e4')); edge(card, 0, 1).each((x, y) => P.px(x, y, '#cfc6e4'));
        D.rect(cx - 2.8, y0 + 8.6, 5.6, 1.4, rp.base); D.rect(cx - 1.8, y0 + 10.6, 2.2, 2.2, '#4a3a6a'); D.hl(cx - 0.4, cx + 2, y0 + 11.4, '#9a8ab8', 1); D.hl(cx - 0.4, cx + 1.4, y0 + 12.4, '#9a8ab8', 1);
        break;
      }
      case 'medal': {
        const g = ramp('#e8b923');
        for (let r = 0; r <= 6; r += 0.5) { const dx = 3.5 - r * 0.45; tp(-dx, r, '#e63946'); tp(dx - 1, r, '#3a5fcd'); }
        D.rect(cx - 1, y0 + 6.4, 2, 1.4, '#e63946');
        const disc = M().ellipse(cx, y0 + 9.6, 2.7, 2.7); shade(P, disc, g, { cap: 3, hi: true });
        D.px(cx - 0.6, y0 + 8.8, '#fff7b0'); D.px(cx + 0.6, y0 + 10.4, g.deep); D.px(cx, y0 + 9.6, '#fff3b0');
        break;
      }
    }
  }
  const th2 = (D, a, b, y, c) => D.hl(a, b, y, c);

  /* ------------------------------------------------------------------- back */
  function back(X) {
    const a = X.L.acc.back; if (!a || a.id === 'none_back') return;
    const P = X.P, S = X.S, cx = CX + S.tx, y0 = T0 + S.dy, rp = rpOf(a.color), D = X.D;
    switch (a.id) {
      case 'cape': {
        const m = M().rows(y0 + 2, [5, 7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11, 11.5, 12, 12.5, 12.5, 13, 13, 13.5, 13.5, 14, 14, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5], cx).clipY(0, 62);
        shade(P, m, rp, { cap: 5, dither: true });
        m.each((x, y) => { const u = iX(x) - cx; if (Math.abs(((u * 0.62) % 3)) < 0.3 && iY(y) > y0 + 6) P.px(x, y, rp.shade); });
        edge(m, 0, 1).each((x, y) => P.px(x, y, ((x + y) & 1) ? rp.shade : rp.deep));
        D.hl(cx - 7, cx + 7, y0 + 2, rp.light);
        break;
      }
      case 'wings': {
        const g = rpOf(a.color);
        for (const s of [-1, 1]) {
          const wm = M();
          for (let i = 0; i < 6; i++) { const len = 16 - i * 1.7, ang = -0.95 + i * 0.3; wm.capsule(cx + s * 7, y0 + 4 + i * 1.1, cx + s * (7 + Math.cos(ang) * len * 0.9), y0 + 4 + i * 1.1 + Math.sin(ang + 0.35) * len * 0.55 - 5 + i * 2, 1.5, 0.6); }
          wm.or(M().poly([[cx + s * 7, y0 + 2], [cx + s * 15, y0 - 8], [cx + s * 20, y0 - 5], [cx + s * 12, y0 + 6]])).clipY(0, 62);
          shade(P, wm, g, { cap: 4, hi: true });
          wm.each((x, y) => { if (hash(x, y) < 0.07) P.px(x, y, g.hi); });
          edge(wm, 0, 1).each((x, y) => { if ((x + y) & 1) P.add(x, y + 1, a.color, 120); });
          wm.growD(1.4).each((x, y) => { if (!wm.get(x, y) && ((x + y) & 1) && P.alphaAt(x, y) < 10) P.px(x, y, a.color, 70); });
        }
        break;
      }
      case 'guitar': {
        const g = ramp('#c4642a'), neckC = ramp('#6a3b1c');
        const body = M().ellipse(cx - 8, y0 + 18, 5, 5.5).or(M().ellipse(cx - 6, y0 + 13, 3.6, 3.6)), nk = M().capsule(cx - 5, y0 + 12, cx + 10, y0 - 4, 1.2, 1.2), hs = M().rect(cx + 9, y0 - 8, 4, 4);
        shade(P, nk, neckC, { cap: 2 }); shade(P, hs, ramp('#2a2236'), { cap: 2, hi: true }); shade(P, body, g, { cap: 4, hi: true });
        const hole = M().ellipse(cx - 8, y0 + 18.4, 1.7, 1.7); flat(P, hole, '#120d1f'); D.hl(cx - 9.6, cx - 6.4, y0 + 20.4, '#e8c050', 1);
        for (const [x, y] of [[cx + 10, y0 - 7], [cx + 12, y0 - 7], [cx + 10, y0 - 5], [cx + 12, y0 - 5]]) D.px(x, y, '#e8c050');
        for (let i = 0; i < 5; i++) D.px(cx + (i * 3) - 3 + 0.2, y0 + 11 - i * 3 + 0.4, '#cfd3e6');
        break;
      }
      case 'backpack': {
        const bag = M().rows(y0 + 0, [10.5, 11.5, 12, 12, 12, 12, 12, 12, 11.5, 10.5, 9.5, 8], cx);
        shade(P, bag, rp, { cap: 4, hi: true }); edge(bag, 0, -1).each((x, y) => P.px(x, y, rp.light));
        for (const s of [-1, 1]) D.vl(cx + s * 8.6, y0 + 3, y0 + 8, rp.shade);
        break;
      }
    }
  }
  // parts of back items that sit on the front of the body (straps, crossbody bag)
  function front(X) {
    const a = X.L.acc.back; if (!a) return;
    const P = X.P, S = X.S, cx = CX + S.tx, y0 = T0 + S.dy, rp = rpOf(a.color), D = X.D;
    if (a.id === 'backpack') {
      for (const s of [-1, 1]) { const st = M().rect(cx + s * 5.6 - 0.8, y0 + 1, 1.8, 12.5).and(X.torsoM); shade(P, st, rp, { cap: 2, hi: true }); for (let r = 4; r < 13; r += 4) D.hl(cx + s * 5.6 - 0.8, cx + s * 5.6 + 0.8, y0 + r, rp.deep); }
      D.px(cx - 5.6, y0 + 13.4, '#cfd3e6'); D.px(cx + 5.6, y0 + 13.4, '#cfd3e6');
    } else if (a.id === 'guitar') {
      D.line(cx + 5, y0 + 1, cx - 6, y0 + 14, '#3a2a1a', Math.max(1, GR.t)); D.line(cx + 6, y0 + 1, cx - 5, y0 + 14, '#5a3a22', 1);
    } else if (a.id === 'crossbody') {
      // strap over the left shoulder to a small bag on the right hip, with a zip and a buckle
      const strap = M().poly([[cx - 6.4, y0 + 1], [cx - 4.4, y0 + 0.4], [cx + 8.2, y0 + 14.4], [cx + 6.4, y0 + 15.4]]).and(X.torsoM.clone().or(Kit.hipMask(S)));
      shade(P, strap, rp, { cap: 2, hi: true });
      for (let t = 0.1; t < 0.9; t += 0.18) D.px(cx - 5.4 + 13.6 * t, y0 + 0.7 + 14 * t, rp.deep);
      const bag = rr(cx + 6.6, y0 + 15.6, 3.4, 2.7, 0.9);
      shade(P, bag, rp, { cap: 3, hi: true });
      D.hl(cx + 3.4, cx + 9.8, y0 + 14.6, rp.deep); D.hl(cx + 3.4, cx + 9.8, y0 + 13.9, rp.light, 1);
      D.px(cx + 6.4, y0 + 15.2, '#cfd3e6'); D.px(cx + 6.4, y0 + 16.2, '#8a8aa8'); D.rect(cx + 5.4, y0 + 17.1, 2.4, 0.9, rp.shade);
      D.px(cx + 3.8, y0 + 14.9, '#e8c050');
    }
  }

  /* ------------------------------------------------------------------ wrist */
  function wrist(X, side) {
    const w = X.L.acc.wrist; if (!w || w.id === 'none_wrist') return;
    const P = X.P, S = X.S, a = S.arms[side], D = X.D, rp = rpOf(w.color), sg = side === 'L' ? -1 : 1;
    const t = 0.82, wx = a.el[0] + (a.ha[0] - a.el[0]) * t, wy = a.el[1] + (a.ha[1] - a.el[1]) * t;
    let dx = a.ha[0] - a.el[0], dy = a.ha[1] - a.el[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx;                                 // perpendicular to the forearm
    const band = (off, len, c, th) => D.line(wx + dx * off - px * len, wy + dy * off - py * len, wx + dx * off + px * len, wy + dy * off + py * len, c, th);
    switch (w.id) {
      case 'wristband': { band(-0.6, 1.9, rp.base); band(0.2, 1.9, rp.light); band(0.9, 1.9, rp.shade); D.px(wx - px * 1.4, wy - py * 1.4, rp.hi); break; }
      case 'stackedbands': { const cs = [rp.base, '#ffe14d', '#ff4fa3', '#2ee6ff']; for (let i = 0; i < 4; i++) band(-1.6 + i * 1.0, 1.9, cs[i]); D.px(wx - px * 1.5, wy - py * 1.5 - 1, '#ffffff'); break; }
      case 'watch': {
        if (side !== 'L') return;
        band(-0.5, 1.9, '#2a2236'); band(0.4, 1.9, '#3a3050');
        const f = rr(wx, wy, 1.7, 1.7, 0.6); shade(P, f, ramp('#2a2236'), { cap: 2, hi: true }); D.px(wx - 0.3, wy - 0.3, rp.hi); D.px(wx + 0.5, wy + 0.5, rp.base); D.px(wx, wy - 1.0, rp.light);
        break;
      }
      case 'icedwatch': {
        if (side !== 'L') return;
        const gold = ramp('#e8b923');
        band(-1.1, 2.1, gold.base); band(-0.2, 2.1, gold.light); band(0.7, 2.1, gold.shade);
        const bz = rr(wx, wy, 2.6, 2.6, 0.9); shade(P, bz, gold, { cap: 3, hi: true });
        const face = rr(wx, wy, 1.7, 1.7, 0.5); flat(P, face, '#d8f4ff');
        face.each((x, y) => { if (hash(x, y) < 0.4) P.px(x, y, '#ffffff'); else if (hash(y, x) < 0.2) P.px(x, y, '#8fd0f0'); });
        D.line(wx, wy, wx + 0.9, wy - 1.0, '#2a2236'); D.px(wx, wy, '#2a2236');
        for (const [ox, oy] of [[-2.9, -1.4], [2.9, -1.4], [-2.9, 1.4], [2.9, 1.4]]) D.px(wx + ox, wy + oy, '#e8f8ff');
        D.add(wx - 3.4, wy - 2.6, '#ffffff', 190); D.hl(wx - 2.4, wx - 1.2, wy - 3.0, '#ffffff', 1); D.vl(wx - 1.8, wy - 3.6, wy - 2.4, '#ffffff', 1);
        break;
      }
      case 'bracelets': { const cs = [rp.base, '#ffe14d', '#ff4fa3']; for (let i = 0; i < 3; i++) band(-1 + i * 1.1, 1.8, i % 2 ? cs[i] : mix(cs[i], '#ffffff', 0.25)); break; }
    }
  }

  /* ------------------------------------------------------------- held items */
  function micDraw(X, x, y, kind, col, mouth) {
    const P = X.P, D = X.D, neon = kind === 'neonmic', gold = kind === 'goldmic';
    const metal = ramp(gold ? '#e8b923' : '#b8bed4'), mesh = gold ? ramp('#c98f1a') : neon ? ramp(col) : ramp('#5a5a74'), body = neon ? ramp(mix(col, '#17141f', 0.5)) : ramp(gold ? '#a47a10' : '#2a2a3c');
    const bx = mouth ? x - 3.8 : x, by = mouth ? y - 1.6 : y - 4.6;
    const hx = mouth ? x + 0.6 : x, hy = mouth ? y + 1.4 : y + 2.4;
    const handle = M().capsule(bx + (hx - bx) * 0.35, by + (hy - by) * 0.35, hx, hy, 1.0, 0.85);
    shade(P, handle, body, { cap: 2, hi: true });
    if (neon) handle.each((x2, y2) => { if (((x2 + y2) & 3) === 0) P.px(x2, y2, col); });
    const ball = M().ellipse(bx, by, 1.8, 1.8); shade(P, ball, mesh, { cap: 3, hi: true });
    if (GR.k > 1.8) ball.each((x2, y2) => { if (((x2 + y2) & 1) === 0 && hash(x2, y2) < 0.5) P.px(x2, y2, neon ? mesh.hi : gold ? mesh.deep : '#3a3a52'); });
    else D.hl(bx - 1.2, bx + 1.2, by + 0.4, neon ? mesh.hi : gold ? mesh.deep : '#3a3a52', 1);
    const ringM = M().ellipse(bx + (hx - bx) * 0.3, by + (hy - by) * 0.3, 1.4, 0.7); flat(P, ringM, neon ? col : metal.light);
    D.px(bx - 0.8, by - 0.8, '#ffffff');
    if (neon) for (const [ox, oy] of [[-2.6, 0], [2.6, 0.4], [0, -2.6], [0.6, 2.6]]) D.add(bx + ox, by + oy, col, 90);
  }
  function held(X) {
    const h = X.L.acc.hand; if (!h || h.id === 'none_hand') return;
    const S = X.S, P = X.P, D = X.D, a = S.arms.R, hx = a.ha[0], hy = a.ha[1];
    if (h.id === 'boombox') {
      const bx = hx + (S.mic ? -1 : 2), by = S.mic ? hy - 8 : hy - 5.6, g = ramp(h.color);
      const box = rr(bx, by + 3.5, 5.8, 3.8, 0.8); shade(P, box, g, { cap: 3, hi: true });
      for (const sx of [-3.3, 3.3]) { const sp = M().ellipse(bx + sx, by + 3.7, 2.0, 2.0); shade(P, sp, ramp('#2a2236'), { cap: 3, hi: true }); const cone = M().ellipse(bx + sx, by + 3.7, 1.0, 1.0); flat(P, cone, '#4a4a62'); D.px(bx + sx - 0.4, by + 3.2, '#9a9ab8'); }
      D.rect(bx - 1.6, by + 1.8, 3.2, 1.8, '#9dff4a'); D.hl(bx - 1.2, bx + 1.2, by + 2.4, '#e8ffd0', 1); D.px(bx + 1.2, by + 2.0, '#2a2236');
      D.hl(bx - 1.4, bx + 1.4, by + 4.8, '#17141f'); D.px(bx - 1.0, by + 5.6, '#e8c050'); D.px(bx + 1.0, by + 5.6, '#ff4f4f');
      D.line(bx - 3.6, by - 0.1, bx - 2.4, by - 2.6, '#cfd3e6'); D.px(bx - 2.4, by - 3.0, '#ffffff'); D.hl(bx - 2.0, bx + 2.0, by - 0.6, g.deep);
      D.px(bx - 5, by + 1.4, g.hi);
      shade(P, X.B.hand.R, X.K.r, { cap: 3 });
      return;
    }
    micDraw(X, hx, hy, h.id, h.color, S.mic);
    shade(P, X.B.hand.R, X.K.r, { cap: 3 });
    D.px(hx - 0.4, hy - 0.4, X.K.r.light); D.hl(hx - 1, hx + 1, hy + 1.0, X.K.r.shade, 1); D.px(hx + 1.2, hy - 0.2, X.K.r.base);
  }

  Object.assign(BBH, { CharsAcc: { glasses, ears, neck, back, front, wrist, held } });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsAcc;
})(typeof globalThis !== 'undefined' ? globalThis : this);
