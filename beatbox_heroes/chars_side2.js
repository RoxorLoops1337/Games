// BEATBOX HEROES -- chars_side2.js
// Part 6 of the character renderer: everything that is WORN in profile (hats, glasses, tops, bottoms, shoes,
// accessories) plus the composition of a complete side-view sprite (drawSide). See chars_side.js for the skeleton.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
    if (!BBH.CharsHair) require('./chars_hair.js');
    if (!BBH.CharsGear) require('./chars_gear.js');
    if (!BBH.CharsAcc) require('./chars_acc.js');
    if (!BBH.CharsSide) require('./chars_side.js');
  }
  const { PAL, mix, Pix } = BBH;
  const Kit = BBH.CharsKit, SD = BBH.CharsSide, Hair = BBH.CharsHair, { CX, HY, M, Painter, shade, flat, GR, X, Y, iX, iY, nx, ny, edge, ring } = Kit;
  const ramp = (c) => Kit.softRamp(c), sh = SD.sh, hash = SD.hash;
  const ellM = (cx, cy, rx, ry) => M().ellipse(cx, cy, rx, ry);
  const polyM = (pts) => M().poly(pts);
  const rr = (cx, cy, hw, hh, r) => M().fn(cx - hw - 1, cy - hh - 1, cx + hw + 1, cy + hh + 1, (x, y) => { const ax = Math.abs(x - cx), ay = Math.abs(y - cy); if (ax > hw || ay > hh) return false; const dx = ax - (hw - r), dy = ay - (hh - r); return dx <= 0 || dy <= 0 || Math.hypot(dx, dy) <= r; });
  const above = (zf, zb) => polyM([[2, -12], [42, -12], [42, zf - 0.2], [32, zf], [8, zb], [2, zb + 0.2]]);
  const starM = (cx, cy, r1, r2) => M().fn(cx - r1 - 1, cy - r1 - 1, cx + r1 + 1, cy + r1 + 1, (x, y) => { const dx = x - cx, dy = y - cy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2, q = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= r2 + (r1 - r2) * Math.max(0, 1 - Math.abs(q) / (Math.PI / 5) * 1.05); });

  /* -------------------------------------------------------------------- hats */
  const HATP = {};
  // each: (c) -> { m (silhouette for the forehead shadow), draw(P, o), drawBack(P, o), noClip }
  // o = { rp, col, D (design painter shifted to the body bob), oy }
  const SH = (m, o) => m.shiftN(0, o.oy);
  const bandLine = (o, zf, zb, c, th) => o.D.line(30.6, zf, 9.4, zb, c, th);

  HATP.cap = () => {
    const dome = ellM(19.6, 18.2, 10.2, 9.0).and(above(16.4, 19.2)), brim = polyM([[29.4, 15.6], [37.0, 17.2], [37.4, 19.4], [29.2, 18.6]]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(dome, o), rp, { cap: 4, hi: true });
        D.poly([[20, 9.6], [15.6, 12.4], [13.2, 17.2]], rp.shade); D.poly([[20, 9.6], [24.6, 12], [27.6, 16]], rp.shade);
        D.rect(18.8, 8.6, 1.8, 1.4, rp.light); D.px(19.2, 8.8, rp.hi);
        bandLine(o, 16.6, 19.4, rp.deep);
        sh(P, SH(brim, o), rp, { cap: 2, hi: true });
        D.poly([[29.8, 17.8], [36.2, 18.8]], rp.deep); D.poly([[29.6, 16.2], [35.4, 17.5]], rp.light);
      },
    };
  };
  HATP.capback = () => {
    const dome = ellM(19.6, 18.2, 10.2, 9.0).and(above(16.4, 19.2)), brim = polyM([[10.8, 18.0], [4.6, 19.8], [4.2, 21.4], [10.6, 20.6]]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(brim, o), rp, { cap: 2, hi: true });
        sh(P, SH(dome, o), rp, { cap: 4, hi: true });
        D.poly([[20, 9.6], [15.6, 12.4], [13.2, 17.2]], rp.shade); D.poly([[20, 9.6], [24.6, 12], [27.6, 16]], rp.shade);
        bandLine(o, 16.6, 19.4, rp.deep);
        D.rect(26.4, 14.0, 3.4, 2.4, rp.deep); D.px(27.2, 14.6, '#e8d28a'); D.px(28.4, 14.6, '#fff0b8'); D.px(27.2, 15.4, '#b8984a');
      },
    };
  };
  HATP.snapback = () => {
    const dome = ellM(19.6, 17.4, 10.2, 9.6).and(above(16.4, 19.2)), brim = polyM([[29.6, 15.8], [37.8, 16.6], [38.0, 18.4], [29.4, 17.8]]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, col } = o, fr = ramp(mix(col, '#ffffff', 0.28));
        sh(P, SH(dome, o), rp, { cap: 4, hi: true });
        sh(P, SH(dome.clone().and(polyM([[22, 6], [32, 6], [32, 20], [22, 20]])), o), fr, { cap: 3, hi: true });
        D.vl(22.2, 9.6, 16.4, rp.shade);
        SH(starM(27.2, 12.4, 2.0, 0.9), o).each((x, y) => P.px(x, y, '#ffe14d')); D.px(27.2, 12.4, '#fff7b0');
        bandLine(o, 16.6, 19.4, rp.deep);
        sh(P, SH(brim, o), rp, { cap: 2, hi: true });
        D.poly([[29.8, 17.8], [37.8, 18.2]], rp.deep);
      },
    };
  };
  HATP.fitted = () => {
    const dome = ellM(19.6, 17.8, 10.3, 9.2).and(above(16.4, 19.2)), brim = polyM([[29.4, 15.6], [38.0, 16.8], [38.2, 18.8], [29.2, 18.4]]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(dome, o), rp, { cap: 4, hi: true });
        for (const u of [14.4, 18, 22, 26]) D.poly([[u, 9.6 + Math.abs(u - 20) * 0.3], [u + (u < 20 ? -0.8 : 0.8), 16.4]], rp.shade);
        D.rect(19.4, 8.4, 1.6, 1.4, rp.light);
        D.px(27.6, 12.4, '#ffe14d'); D.px(26.8, 13.2, '#ffe14d'); D.px(28.4, 13.2, '#ffe14d'); D.px(27.6, 14.0, '#b8984a'); D.px(27.6, 13.2, '#fff7b0');
        bandLine(o, 16.6, 19.4, rp.deep);
        sh(P, SH(brim, o), rp, { cap: 2, hi: true });
        D.poly([[29.8, 17.9], [37.2, 18.3]], rp.deep);
        SH(ellM(33.6, 17.4, 1.6, 0.6), o).each((x, y) => P.px(x, y, '#c9f0ff')); D.px(33.2, 17.3, '#ffffff'); D.px(34.4, 17.4, '#ff9ad0');
      },
    };
  };
  HATP.trucker = () => {
    const dome = ellM(19.6, 18.2, 10.2, 9.0).and(above(16.4, 19.2)), brim = polyM([[29.6, 15.8], [36.0, 17.4], [36.4, 19.0], [29.4, 18.0]]), front = dome.clone().and(polyM([[22.6, 6], [34, 6], [34, 20], [22.6, 20]]));
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, col } = o, mesh = ramp(mix(col, '#e8e0f0', 0.5));
        const dm = SH(dome, o); sh(P, dm, mesh, { cap: 4, hi: true }); dm.each((x, y) => { if (((x + y) & 1) === 0) P.px(x, y, mesh.shade); });
        sh(P, SH(front, o), rp, { cap: 3, hi: true }); edge(SH(front, o), -1, 0).each((x, y) => P.px(x, y, rp.deep));
        D.px(26.8, 13.0, '#ffe14d'); D.px(28.0, 12.4, '#ffe14d'); D.hl(26.4, 28.6, 14.2, '#fff7b0', 1);
        bandLine(o, 16.6, 19.4, rp.deep);
        sh(P, SH(brim, o), rp, { cap: 2, hi: true }); D.poly([[29.8, 18.0], [36.2, 19.0]], rp.deep);
      },
    };
  };
  HATP.beanie = () => {
    const dome = ellM(19.6, 17.0, 10.2, 9.8).and(above(15.4, 18.8)), cuff = ellM(19.6, 17.0, 10.3, 9.9).and(polyM([[2, 12.6], [42, 12.6], [42, 15.8], [32, 16], [8, 19.4], [2, 19.4]])).and(above(16.4, 19.6)).sub(above(13.4, 16.8));
    return {
      m: dome.clone().or(cuff).or(bumpM(18.6, 7.4, 2.4)),
      draw(P, o) {
        const { rp, D, col } = o, pp = ramp(mix(col, '#ffffff', 0.3));
        sh(P, SH(dome, o), rp, { cap: 4, hi: true });
        SH(dome, o).each((x, y) => { const u = iX(x); if (iY(y - o.oy) < 13 && Math.floor((u + 40) * 1.15) % 3 === 0) P.px(x, y, rp.shade); });
        sh(P, SH(cuff, o), ramp(mix(col, '#ffffff', 0.12)), { cap: 3, hi: true });
        SH(cuff, o).each((x, y) => { if (Math.floor((iX(x) + 40) * 1.5) % 2 === 0) P.px(x, y, rp.shade); });
        bandLine(o, 15.6, 18.8, rp.deep); D.poly([[29.4, 13.4], [9.6, 16.8]], rp.deep);
        const pom = bumpM(18.6, 7.4, 2.4); sh(P, SH(pom, o), pp, { cap: 3, hi: true });
        SH(pom, o).each((x, y) => { if (((x * 5 + y * 7) % 6) === 0) P.px(x, y, pp.hi); else if (((x * 3 + y * 5) % 7) === 0) P.px(x, y, pp.shade); });
      },
    };
  };
  const bumpM = (cx, cy, r) => ellM(cx, cy, r, r);
  HATP.bandana = () => {
    const cloth = ellM(19.6, 17.8, 9.9, 8.7).and(above(15.8, 19.0));
    const tails = polyM([[11, 18.4], [5.6, 21], [4.4, 27], [7.6, 25.4], [8.8, 29.4], [11.6, 22]]);
    return {
      m: cloth.clone().or(tails),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(tails, o), rp, { cap: 2, hi: true });
        sh(P, SH(cloth, o), rp, { cap: 4, hi: true });
        SH(cloth, o).each((x, y) => { const q = (x * 5 + y * 7) % 11; if (q === 0) P.px(x, y, rp.hi); else if (q === 5) P.px(x, y, rp.shade); });
        for (let i = 0; i < 5; i++) { const x = 14 + i * 3.2, y = 12.4 + Math.abs(i - 2) * 0.8; D.px(x, y, rp.hi); D.px(x + 0.7, y + 0.6, rp.light); D.px(x + 0.7, y - 0.6, rp.light); }
        bandLine(o, 15.8, 19.0, rp.deep); D.px(10.6, 18.8, rp.deep); D.px(7.6, 25.4, rp.shade);
      },
    };
  };
  HATP.headband = () => {
    const ringM = ellM(20, 19.2, 9.9, 9.3).sub(ellM(20, 19.2, 8.8, 8.2)).and(polyM([[34, 14.2], [34, 17.6], [8, 21.8], [8, 18.6]]));
    return {
      m: ringM,
      draw(P, o) { const { rp, D } = o; sh(P, SH(ringM, o), rp, { cap: 2, hi: true }); for (let x = 12; x < 29; x += 2.3) D.px(x, 16.8 + (29 - x) * 0.12, rp.light); D.px(27, 15.2, rp.hi); },
    };
  };
  HATP.durag = () => {
    const dome = ellM(19.6, 18.0, 9.8, 8.9).and(above(16.0, 19.4)), band = ellM(19.6, 18.0, 9.9, 9.0).and(polyM([[34, 13.8], [34, 17.0], [8, 20.6], [8, 17.4]])).and(above(17.4, 20.2));
    const tails = polyM([[11.6, 19.2], [8.6, 24], [6.6, 32], [8.8, 34.4], [11.4, 31], [12.8, 24]]), tails2 = polyM([[11, 18.4], [7.6, 22.4], [4.4, 29.4], [6.2, 31.6], [9, 26]]);
    return {
      m: dome.clone().or(band), back: tails.clone().or(tails2),
      drawBack(P, o) {
        const { rp, D } = o;
        sh(P, SH(tails2, o), rp, { cap: 2, hi: true, bias: 1 }); sh(P, SH(tails, o), rp, { cap: 3, hi: true });
        SH(tails, o).each((x, y) => { if (((iX(x) * 1.1 + iY(y - o.oy) * 0.7) % 3) < 0.5) P.px(x, y, rp.light); });
      },
      draw(P, o) {
        const { rp, D, col } = o;
        sh(P, SH(dome, o), rp, { cap: 4, hi: true, dither: true });
        for (let i = 0; i < 3; i++) D.line(24 - i * 3, 10.6 + i * 0.6, 22 - i * 3, 15.6, rp.hi);
        D.poly([[12.6, 12.4], [10.6, 17.6]], rp.deep);
        sh(P, SH(band, o), ramp(mix(col, '#000000', 0.2)), { cap: 2, hi: true });
        bandLine(o, 14.6, 17.6, rp.light, 1);
      },
    };
  };
  const brimRing = (cy, rx, ry) => ellM(19.8, cy, rx, ry);
  HATP.bucket = () => {
    const dome = ellM(19.6, 17.2, 9.8, 8.4).and(above(16.2, 19.0)), brim = brimRing(17.0, 15.4, 1.9);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(dome, o), rp, { cap: 4, hi: true });
        sh(P, SH(brim, o), rp, { cap: 3, hi: true });
        for (let x = 6; x <= 33; x += 1.4) D.px(x, 18.2 + Math.sin(x * 0.3) * 0.2, rp.shade);
        D.poly([[11, 15.0], [28, 14.4]], rp.deep, 1); D.px(14, 10.4, rp.light);
        D.rect(19, 8.6, 1.6, 1.2, rp.light);
      },
    };
  };
  HATP.bucketfur = () => {
    const dome = ellM(19.6, 17.2, 10.2, 8.8).and(above(16.2, 19.0)), brim = brimRing(17.0, 16.0, 2.2), all = dome.clone().or(brim);
    return {
      m: all,
      draw(P, o) {
        const fur = ramp(mix(o.col, '#fff6ea', 0.28)), a = SH(all, o);
        sh(P, a, fur, { cap: 4, hi: true });
        a.each((x, y) => { const h = hash(x * 3 + 7, (y >> 1) * 5 + 3), h2 = hash(x, y); if (h < 0.16) P.px(x, y, fur.hi); else if (h < 0.27) P.px(x, y, fur.shade); else if (h2 > 0.93) P.px(x, y, fur.light); });
        const rag = M(); a.each((x, y) => { for (const [ox, oy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (!a.get(x + ox, y + oy) && hash(x + ox * 7, y + oy * 5) < 0.55) rag.set(x + ox, y + oy); });
        rag.each((x, y) => P.px(x, y, hash(x + 2, y) < 0.5 ? fur.base : fur.light));
      },
    };
  };
  HATP.beret = () => {
    const body = ellM(18.6, 12.4, 10.6, 3.8).or(ellM(23.4, 13.6, 6, 2.8)), stem = M().rect(18.6, 7.6, 1.8, 2);
    return {
      m: body.clone().or(stem),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(body, o), rp, { cap: 5, hi: true }); sh(P, SH(stem, o), rp, { cap: 2 });
        for (let i = 0; i < 4; i++) D.line(12 + i * 3.4, 10.4, 13.4 + i * 3.4, 13.2 + (i % 2) * 0.4, rp.shade);
        D.poly([[10.6, 14.6], [29, 15.4]], rp.deep); D.px(14, 10.4, rp.hi); D.px(15, 10.4, rp.hi);
      },
    };
  };
  HATP.fedora = () => {
    const crown = polyM([[11.4, 16.4], [11.8, 10.6], [14.6, 6.6], [19.8, 7.4], [24.6, 6.4], [27.6, 9.2], [28.4, 16.4]]), brim = brimRing(16.8, 15.6, 2.0), bandM = crown.clone().and(polyM([[8, 13.2], [32, 13.2], [32, 16.8], [8, 16.8]]));
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const { rp, D, col } = o, bc = ramp(mix(col, PAL.ink, 0.45));
        sh(P, SH(crown, o), rp, { cap: 4, hi: true });
        D.poly([[19.8, 7.6], [19.6, 11.6]], rp.deep); D.px(15.4, 8.4, rp.hi); D.px(16.4, 8.2, rp.hi);
        sh(P, SH(bandM, o), bc, { cap: 2, hi: true }); D.rect(24.4, 13.6, 2.2, 2.4, '#e8c050'); D.px(25, 14, '#fff0a0');
        sh(P, SH(brim, o), rp, { cap: 3, hi: true }); D.poly([[5, 18.0], [34, 17.8]], rp.deep, 1);
      },
    };
  };
  HATP.cowboy = () => {
    const crown = polyM([[11.8, 16.4], [12.2, 9.6], [14.4, 5.8], [17.6, 7.4], [20, 6.0], [23.4, 7.6], [26.4, 6.0], [28.2, 10], [28.2, 16.4]]), brim = polyM([[3, 12.6], [7.6, 15.6], [19.8, 17.2], [32, 15.6], [37, 12.2], [37.4, 13.8], [32.4, 18.2], [19.8, 19.4], [7.4, 18.2], [2.8, 14.2]]);
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const { rp, D, col } = o, bc = ramp(mix(col, PAL.ink, 0.5));
        sh(P, SH(crown, o), rp, { cap: 4, hi: true });
        D.poly([[17.8, 7.6], [17.6, 12]], rp.deep); D.poly([[23.4, 7.8], [23.6, 12]], rp.deep);
        sh(P, SH(crown.clone().and(polyM([[8, 13.4], [32, 13.4], [32, 16.6], [8, 16.6]])), o), bc, { cap: 2, hi: true });
        D.rect(24.4, 13.4, 2.4, 2.6, '#e8c050'); D.px(25, 13.8, '#fff0a0');
        sh(P, SH(brim, o), rp, { cap: 2, hi: true }); D.poly([[8, 18.2], [19.8, 19.2], [32, 18.0]], rp.deep);
      },
    };
  };
  HATP.tophat = () => {
    const crown = polyM([[12.8, 16.4], [12.4, 3.8], [27.0, 3.6], [27.4, 16.4]]), brim = brimRing(16.8, 13.6, 1.9);
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(crown, o), rp, { cap: 4, hi: true });
        D.vl(25.4, 5.4, 15, rp.light, 1); D.px(25.4, 4.8, rp.hi); D.px(24.4, 5.2, rp.hi);
        sh(P, SH(crown.clone().and(polyM([[8, 12.6], [32, 12.6], [32, 15.8], [8, 15.8]])), o), ramp('#c42a45'), { cap: 2, hi: true });
        D.rect(24.6, 12.8, 2.2, 2.4, '#ffe14d');
        sh(P, SH(brim, o), rp, { cap: 3, hi: true }); D.poly([[7, 18.0], [32, 17.8]], rp.deep, 1);
      },
    };
  };
  HATP.catears = (c) => {
    const hm = c.hm, ringM = hm.clone().growD(1.1).sub(hm.clone()).and(polyM([[34, 6], [34, 15.6], [8, 19.6], [8, 6]])), near = polyM([[19.6, 11], [21.4, 4.2], [27, 9.8]]), far = polyM([[13.6, 12], [14.8, 5.8], [19.6, 10.4]]);
    return {
      m: ringM.clone().or(near).or(far),
      draw(P, o) {
        const { rp, D } = o, pk = ramp('#ff7ab6');
        sh(P, SH(ringM, o), rp, { cap: 2, hi: true }); sh(P, SH(far, o), rp, { cap: 3, hi: true, bias: 1 });
        sh(P, SH(near, o), rp, { cap: 3, hi: true });
        sh(P, SH(polyM([[20.4, 10.6], [21.6, 6.4], [25, 10]]), o), pk, { cap: 3, hi: true });
      },
    };
  };
  HATP.crown = () => {
    const band = polyM([[11.6, 12.8], [12.4, 8.8], [27.8, 8.6], [28.4, 12.4]]), pts = M();
    [[13.8, 4.6], [17.8, 6.2], [21.8, 6.6], [25.6, 5.2]].forEach(([x, h]) => pts.or(polyM([[x - 2.2, 9.2], [x + 2.2, 9.2], [x, 8.6 - h + 4]])));
    return {
      m: band.clone().or(pts),
      draw(P, o) {
        const { D, col } = o, rp = ramp('#e8b923');
        sh(P, SH(pts.clone().sub(band), o), rp, { cap: 3, hi: true }); sh(P, SH(band, o), rp, { cap: 2, hi: true });
        for (const [x, y] of [[13.8, 4.8], [17.8, 6.4], [21.8, 6.8], [25.6, 5.4]]) { D.px(x, y, '#fff3b0'); }
        for (const gx of [15, 20.4, 25]) { D.rect(gx - 0.8, 10.2, 1.8, 1.6, col); D.px(gx - 0.2, 10.4, mix(col, '#ffffff', 0.6)); }
        D.hl(12.6, 27.6, 12.4, rp.deep);
      },
    };
  };
  HATP.halo = () => {
    const ringM = ellM(19.4, 6.6, 9.8, 1.8).sub(ellM(19.4, 6.6, 8.2, 0.7));
    return {
      m: M(), noClip: true,
      draw(P, o) {
        const { D } = o, g = '#ffe56a', rg = SH(ringM, o), b = rg.bounds();
        SH(ellM(19.4, 6.6, 11.6, 3.8), o).each((x, y) => { if (!rg.get(x, y) && ((x + y) & 1) && P.alphaAt(x, y) < 10) P.px(x, y, g, 70); });
        rg.each((x, y) => P.px(x, y, y > (b.y0 + b.y1) / 2 + 0.5 ? '#c98f1a' : x < (b.x0 + b.x1) / 2 ? '#fff9c0' : g));
        D.px(13, 6, '#ffffff');
      },
    };
  };
  HATP.visor = () => {
    const band = ellM(20, 19.2, 9.9, 9.3).sub(ellM(20, 19.2, 8.8, 8.2)).and(polyM([[34, 14.0], [34, 17.6], [8, 21.0], [8, 18.2]])), bill = polyM([[29.8, 15.6], [37.8, 17.2], [38, 18.4], [29.6, 17.2]]);
    return {
      m: band.clone().or(bill),
      draw(P, o) {
        const { rp, D, col } = o, nc = '#2ee6ff', tint = ramp(mix(col, nc, 0.45));
        sh(P, SH(band, o), rp, { cap: 2, hi: true });
        const bm = SH(bill, o), bb = bm.bounds(); bm.each((x, y) => { const q = (y - bb.y0) / Math.max(1, bb.y1 - bb.y0); P.px(x, y, q < 0.3 ? tint.hi : ((x + y) & 1) ? tint.base : tint.light); });
        D.poly([[29.8, 18.0], [38, 18.6]], nc); for (let x = 31; x < 38; x += 1.6) D.add(x, 19.4, nc, 70);
      },
    };
  };
  HATP.chef = () => {
    const puff = ellM(14.6, 9.4, 5.6, 4.8).or(ellM(24, 8.8, 5.6, 4.8)).or(ellM(19.4, 5.8, 6.4, 4.6)).or(polyM([[11.4, 16.6], [11.6, 10], [27.8, 10], [28.2, 16.6]])), band = polyM([[11.4, 16.6], [11.8, 12.4], [28, 12.4], [28.4, 16.6]]);
    return {
      m: puff.clone(),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(puff, o), rp, { cap: 5, hi: true, dither: true });
        for (const [x, y] of [[14, 7], [24.6, 7], [19.4, 4.6]]) D.vl(x, y, y + 2.4, rp.shade);
        sh(P, SH(band, o), rp, { cap: 2, hi: true }); D.hl(11.8, 28, 16.4, rp.deep);
      },
    };
  };
  HATP.wizard = () => {
    const cone = polyM([[10.2, 16.8], [12.8, 12], [16, 8.2], [19.6, 4], [23.6, 1.6], [26.2, 2.6], [23.2, 5.4], [24.6, 10.4], [28.8, 16.8]]), brim = brimRing(16.8, 13.8, 1.9);
    return {
      m: cone.clone().or(brim),
      draw(P, o) {
        const { rp, D, col } = o, bc = ramp(mix(col, '#ffe14d', 0.7)), st = '#ffe14d';
        sh(P, SH(cone, o), rp, { cap: 5, hi: true });
        D.hl(11.4, 28, 15.2, bc.base, 2);
        for (const [x, y] of [[19.8, 11], [23.8, 6.8]]) { D.px(x, y, '#fff7b0'); D.px(x - 1, y, st); D.px(x + 1, y, st); D.px(x, y - 1, st); D.px(x, y + 1, st); }
        sh(P, SH(brim, o), rp, { cap: 3, hi: true }); D.poly([[6.4, 18.2], [33, 18.0]], rp.deep, 1);
      },
    };
  };
  HATP.pirate = () => {
    const body = polyM([[8, 17.4], [11, 9], [19.6, 5.2], [28.5, 9.6], [32, 17.6], [28, 18.6], [19.6, 15], [11.4, 18.8]]);
    return {
      m: body,
      draw(P, o) {
        const { rp, D } = o, bm = SH(body, o), gd = '#e8b923';
        sh(P, bm, rp, { cap: 4, hi: true });
        bm.each((x, y) => { if (!bm.get(x, y + 1) || !bm.get(x, y - 1)) P.px(x, y, gd); });
        const sk = '#fffaf0', dk = '#120d1f';
        D.rect(18, 8.6, 3.6, 2.2, sk); D.rect(19, 10.4, 1.8, 1.2, sk); D.px(18.8, 9.4, dk); D.px(20.6, 9.4, dk);
        D.line(15.4, 11.6, 24.2, 13.4, sk); D.line(24.2, 11.6, 15.4, 13.4, sk);
      },
    };
  };
  HATP.headphonehat = (c) => {
    const hm = c.hm, band = hm.clone().growD(2.2).sub(hm.clone().growD(0.6)).and(polyM([[16.8, 2], [23.4, 2], [23.4, 18], [16.8, 18]])), puff = ellM(19.7, 20.6, 3.9, 4.6);
    return {
      m: band.clone().or(puff),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(band, o), rp, { cap: 2, hi: true });
        const ps = SH(puff, o); sh(P, ps, rp, { cap: 4, hi: true });
        ps.each((x, y) => { if (((x * 3 + y * 5) % 4) === 0) P.px(x, y, rp.hi); else if (((x * 5 + y * 3) % 7) === 0) P.px(x, y, rp.shade); });
        D.px(15.6, 18.6, rp.light); D.px(15.4, 22.4, rp.light);
      },
    };
  };
  HATP.hood = (c) => {
    const hood = ellM(18.8, 15.8, 13.0, 13.4).sub(polyM([[27.6, 12.4], [33.6, 15], [33.8, 28], [25, 31], [22.6, 24], [23.8, 17.4]])).clipY(0, 29);
    const drape = ellM(19, 31.6, 9.4, 3.6).sub(ellM(19, 33, 3.2, 5)), inner = polyM([[26.4, 13.4], [31.4, 15.4], [31.6, 26], [25, 28.4], [23.4, 22], [24.6, 16.6]]);
    return {
      m: hood.clone().or(drape),
      draw(P, o) {
        const { rp, D } = o;
        sh(P, SH(drape, o), rp, { cap: 4, hi: false });
        sh(P, SH(hood, o), rp, { cap: 5, hi: true, dither: true });
        const rim = SH(hood, o); edge(rim, 1, 0).each((x, y) => P.px(x, y, rp.light));
        D.line(11, 12, 9.6, 22, rp.shade); D.line(14, 6, 11.4, 12, rp.shade); D.line(21, 3.6, 17, 5.6, rp.light); D.px(14.6, 6.8, rp.hi);
        D.vl(25.2, 29, 36, '#f7f2e8'); D.px(25.2, 36.6, '#e8c050');
      },
    };
  };

  // does this hat sit on top of the hair? (true) or leave it alone
  function hatBuild(X) {
    if (X.hatId === 'none') return null;
    if (X._hatS === undefined) { const fn = HATP[X.hatId]; X._hatS = fn ? fn({ hm: SD.headLocal(X.S), S: X.S }) : null; }
    return X._hatS;
  }
  const hatCtx = (X) => ({ rp: ramp(X.L.hat.color), col: X.L.hat.color, oy: SD.oyOf(X.S), D: new Painter(X.P).shiftN(0, SD.oyOf(X.S)) });
  function hatBackS(X) { const h = hatBuild(X); if (h && h.drawBack) h.drawBack(X.P, hatCtx(X)); }
  function hatS(X) { const h = hatBuild(X); if (h) h.draw(X.P, hatCtx(X)); }
  function hatMaskS(X) { const h = hatBuild(X); return h && !h.noClip ? h.m : null; }

  /* ----------------------------------------------------------------- glasses */
  function glassesS(X) {
    const g = X.L.glasses; if (!g || g.id === 'none') return;
    const P = X.P, S = X.S, oy = SD.oyOf(S), D = new Painter(P).shiftN(0, oy), rp = ramp(g.color), dark = '#1a1630';
    const SHM = (m) => m.shiftN(0, oy), put = (m, c) => SHM(m).each((x, y) => P.px(x, y, c));
    const lens = (m, c1, c2) => { const s = SHM(m), b = s.bounds(); if (!b) return; s.each((x, y) => P.px(x, y, mix(c1, c2, (y - b.y0) / (b.y1 - b.y0 + 1)))); };
    const [ex, ey] = SD.EYE_C, fx = ex + 1.5;                      // lens centre sits just in front of the eye
    const arm = (c, y) => D.line(fx - 1.2, y === undefined ? ey - 0.6 : y, 19.8, (y === undefined ? ey - 0.6 : y) - 0.4, c);
    const glint = (cx, cy) => { D.line(cx - 0.6, cy + 0.9, cx + 0.2, cy - 0.9, '#ffffff'); D.px(cx + 0.5, cy - 1.4, '#ffffff'); };
    const frameLens = (outer, inner, r, c1, c2) => { lens(inner, c1, c2); sh(P, SHM(outer.clone().sub(inner)), r, { cap: 2, hi: true }); };
    switch (g.id) {
      case 'round': case 'nerd': case 'gold_round': {
        const gold = g.id === 'gold_round', r = gold ? ramp('#e8b923') : rp;
        const o = g.id === 'nerd' ? rr(fx, ey, 2.1, 3.2, 0.9) : ellM(fx, ey, 2.2, 3.5), i = g.id === 'nerd' ? rr(fx, ey, 1.2, 2.4, 0.5) : ellM(fx, ey, 1.4, 2.7);
        frameLens(o, i, r, gold ? '#e8a54a' : '#cfe9ff', gold ? '#8a3f6a' : '#9fc8e8'); glint(fx - 0.2, ey - 0.6); arm(r.shade);
        break;
      }
      case 'shades': case 'wayfarer': case 'oversized': {
        const big = g.id === 'oversized', way = g.id === 'wayfarer';
        const lm = big ? rr(fx + 0.2, ey + 0.2, 2.4, 3.9, 1.0) : way ? polyM([[fx - 1.8, ey - 2.2], [fx + 2.2, ey - 1.8], [fx + 1.6, ey + 2.6], [fx - 1.4, ey + 2.6]]) : rr(fx, ey + 0.1, 2.0, 2.7, 1.0);
        lens(lm, '#3a3060', '#14102a');
        sh(P, SHM(big ? lm.clone().sub(rr(fx + 0.2, ey + 0.2, 1.4, 3.0, 0.6)) : polyM([[fx - 2.2, ey - 2.8], [fx + 2.4, ey - 2.8], [fx + 2.4, ey - 1.6], [fx - 2.2, ey - 1.6]])), big ? ramp(mix(g.color, '#17141f', 0.5)) : rp, { cap: 2, hi: true });
        glint(fx - 0.4, ey - 0.2); arm(rp.shade, ey - 1.8);
        break;
      }
      case 'aviator': {
        const lm = M().fn(fx - 3, ey - 3.8, fx + 3, ey + 4.2, (x, y) => { const v = (y - ey) / 3.4, w = 2.2 * (v < 0 ? 1 : Math.max(0.15, 1 - v * v * 0.5)); return Math.abs(x - fx) <= w && y >= ey - 3.2 && y <= ey + 3.4; });
        frameLens(lm.clone().growD(0.7), lm, ramp('#d4a017'), '#2f5a6a', '#9fd0c8'); glint(fx - 0.2, ey - 0.8); arm('#a47a10', ey - 2.4);
        break;
      }
      case 'sport': {
        const sm = polyM([[fx - 2.4, ey - 2.6], [fx + 3.6, ey - 2.2], [fx + 3.4, ey + 2.6], [fx - 2.0, ey + 2.4]]), mir = ramp(g.color), s2 = SHM(sm), b = s2.bounds();
        s2.each((x, y) => { const t = (y - b.y0) / (b.y1 - b.y0 + 1); P.px(x, y, t < 0.3 ? mir.hi : t < 0.6 ? mir.light : t < 0.8 ? mir.base : mir.shade); });
        edge(s2, 0, -1).each((x, y) => P.px(x, y, dark)); edge(s2, 0, 1).each((x, y) => P.px(x, y, dark)); D.px(fx + 0.4, ey - 0.6, '#ffffff'); arm(dark, ey - 1.6);
        break;
      }
      case 'heart': case 'star': {
        const r = ramp(g.color);
        const m = g.id === 'heart' ? M().fn(fx - 2.4, ey - 3.8, fx + 2.4, ey + 4, (x, y) => { const u = (x - fx) / 1.9, v = -(y - ey - 0.3) / 3.4 + 0.35; return Math.pow(u * u + v * v - 1, 3) - u * u * v * v * v <= 0; }) : starM(fx, ey, 3.2, 1.2);
        sh(P, SHM(m), r, { cap: 3, hi: true }); glint(fx - 0.4, ey - 0.8); edge(SHM(m), 0, 1).each((x, y) => P.px(x, y, r.deep)); arm(r.deep, ey - 0.4);
        break;
      }
      case 'pixel': {
        const c = g.color, lt = mix(c, '#ffffff', 0.38);
        D.rect(fx - 2.2, ey - 2.2, 5, 1.2, c); D.rect(fx - 2.2, ey - 1.0, 5, 1.2, c); D.rect(fx - 1.2, ey + 0.2, 4, 1.2, c); D.rect(fx - 0.2, ey + 1.4, 3, 1.2, c);
        D.rect(fx - 8.6, ey - 2.2, 7, 1.0, c); D.rect(fx - 2.2, ey - 2.2, 2.4, 0.8, lt); D.px(fx + 1.4, ey - 0.4, lt);
        break;
      }
      case 'monocle': {
        const rg = ramp(g.color), o = ellM(fx, ey, 2.2, 3.4), i = ellM(fx, ey, 1.4, 2.6);
        frameLens(o, i, rg, '#e8f4ff', '#bcd8f0'); glint(fx - 0.2, ey - 0.6);
        for (let t = 0; t < 10; t++) D.px(fx - 0.6 + Math.sin(t * 0.6) * 0.8, ey + 3.6 + t, t % 2 ? rg.base : rg.light);
        break;
      }
      case 'goggles': {
        const br = ramp('#8a5a30'), brass = ramp('#d4a017');
        D.line(fx - 1, ey - 3.2, 8.6, 15.8, br.base, Math.max(2, GR.t * 2)); D.line(fx - 1, ey - 3.9, 8.8, 15.0, br.light, 1);
        const tube = rr(fx + 0.8, ey, 2.3, 3.2, 0.8); lens(tube, '#7ad8ff', '#2a6a98');
        sh(P, SHM(rr(fx - 0.6, ey, 1.2, 3.8, 0.5)), brass, { cap: 2, hi: true }); sh(P, SHM(rr(fx + 2.5, ey, 0.9, 3.5, 0.4)), brass, { cap: 2, hi: true });
        D.px(fx + 0.4, ey - 1, '#e8ffff'); D.px(fx + 1.2, ey - 0.4, '#8fe0ff');
        break;
      }
      case 'vr': {
        const pm = rr(fx + 0.6, ey, 3.0, 4.2, 1.2); sh(P, SHM(pm), rp, { cap: 3, hi: true });
        put(rr(fx + 1.2, ey, 1.6, 3.0, 0.8), '#120d1f'); D.vl(fx + 1.2, ey - 1.6, ey + 1.6, '#2ee6ff'); D.px(fx + 1.0, ey - 0.8, '#8ff0ff');
        D.line(fx - 2.4, ey - 1.6, 8.6, 17.6, rp.shade, Math.max(2, GR.t)); D.line(fx - 2.4, ey - 0.6, 8.8, 18.8, rp.deep, 1);
        break;
      }
      case 'neonbar': {
        put(rr(fx + 0.2, ey, 1.5, 2.4, 0.7), '#120d1f'); D.vl(fx + 0.6, ey - 2, ey + 2, g.color); D.px(fx + 0.6, ey, '#ffffff');
        for (let y = ey - 2.4; y < ey + 2.6; y += 1.4) D.add(fx + 2.2, y, g.color, 100);
        arm(rp.base, ey - 0.4);
        break;
      }
      case 'eyepatch': {
        const pm = ellM(fx - 0.4, ey, 2.2, 3.1); sh(P, SHM(pm), ramp(mix(g.color, '#3a3050', 0.2)), { cap: 3, hi: true }); D.px(fx - 1.2, ey - 1, '#8a7ab0');
        const sc = mix(g.color, '#3a3050', 0.35); D.line(fx - 1.4, ey - 2.8, 12.2, 13.6, sc); D.line(fx - 1.6, ey - 2.4, 12.4, 14.4, mix(sc, '#6a5a90', 0.4)); D.line(fx - 2, ey + 0.4, 19.6, ey - 0.6, sc);
        break;
      }
      case 'chromeshield': {
        const sm = polyM([[fx - 2.6, ey - 2.8], [fx + 3.6, ey - 2.2], [fx + 4.4, ey + 0.6], [fx + 2.6, ey + 2.8], [fx - 2.2, ey + 2.6]]), s2 = SHM(sm), b = s2.bounds();
        s2.each((x, y) => { const t = (y - b.y0) / (b.y1 - b.y0 + 1); P.px(x, y, t < 0.2 ? '#f4fbff' : t < 0.42 ? '#bfe3f2' : t < 0.55 ? '#5d7fa0' : t < 0.7 ? '#2e4668' : t < 0.86 ? '#e8b78a' : '#ffd9b0'); });
        edge(s2, 0, -1).each((x, y) => P.px(x, y, '#ffffff')); D.px(fx - 0.6, ey - 1.6, '#ffffff'); D.px(fx + 1.6, ey - 1.0, '#ffffff'); arm('#9fb4cc', ey - 1.6);
        break;
      }
    }
  }

  /* ----------------------------------------------------------------- tops */
  const TOPSPEC = {
    tee: { hem: 14, sl: 0.42, k: 0.2 }, tank: { hem: 14, sl: 0, k: 0 }, hoodie: { hem: 16, sl: 1, k: 0.35 }, croptop: { hem: 9, sl: 0.4, k: 0.15 }, sweater: { hem: 16, sl: 1, k: 0.3 },
    flannel: { hem: 15, sl: 1, k: 0.2 }, dress: { hem: 16, sl: 0, k: 0 }, jacket: { hem: 15, sl: 1, k: 0.3 }, varsity: { hem: 15, sl: 1, k: 0.3 }, tracktop: { hem: 15, sl: 1, k: 0.25 },
    puffer: { hem: 16, sl: 1, k: 0.9, bulk: 1 }, hawaiian: { hem: 15, sl: 0.42, k: 0.25 }, overalls: { hem: 16, sl: 0.4, k: 0.2 }, turtleneck: { hem: 15, sl: 1, k: 0.1 },
    kimono: { hem: 16, sl: 0.8, k: 1.1, bulk: 1 }, tux: { hem: 16, sl: 1, k: 0.25 }, poncho: { hem: 15, sl: 0.7, k: 1.3, bulk: 1 }, bbhtee: { hem: 14, sl: 0.42, k: 0.2 },
    stagesuit: { hem: 16, sl: 1, k: 0.2 }, champ: { hem: 16, sl: 1, k: 0.7, bulk: 1 }, oversized: { hem: 16, sl: 0.62, k: 0.95, bulk: 1 }, hoodiebig: { hem: 16, sl: 1, k: 1.05, bulk: 1 },
    jersey: { hem: 15, sl: 0, k: 0 }, bomber: { hem: 15, sl: 1, k: 0.4 }, denimjacket: { hem: 15, sl: 1, k: 0.3 }, windbreaker: { hem: 15, sl: 1, k: 0.35 }, puffvest: { hem: 15, sl: 1, k: 0.12 },
  };
  const HIGH = { tracktop: 1, puffer: 1, turtleneck: 1, bomber: 1, windbreaker: 1, puffvest: 1 }, VNECK = { flannel: 1, jacket: 1, hawaiian: 1, kimono: 1, tux: 1, champ: 1, stagesuit: 1, denimjacket: 1, jersey: 1 };
  const sleeveCol = (L, id) => (id === 'varsity' || id === 'overalls' || id === 'puffvest' ? L.top.color2 : L.top.color);
  const DIG = { 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'] };

  function topS(X) {
    const L = X.L, id = L.top.id, spec = TOPSPEC[id]; if (!spec) return;
    const P = X.P, S = X.S, G = S.G, D = X.D0, rp = ramp(L.top.color), r2 = ramp(L.top.color2), y0 = S.hipY - 15;
    const c0 = (r) => 20.5 + S.lean * (1 - r / 16), fe = (r) => c0(r) + G.hf[Math.max(0, Math.min(16, Math.round(r)))], be = (r) => c0(r) - G.hb[Math.max(0, Math.min(16, Math.round(r)))];
    const body = SD.torsoSide(S).clipY(y0, y0 + spec.hem);
    if (spec.bulk) { const gr = body.growD(spec.bulk > 1 ? 1.5 : 1.1); body.or(gr); body.clipY(y0 + 1, y0 + spec.hem); }
    const EXT = { oversized: [5.6, 5.9, 6.1, 6.2, 6.2, 6.2], hoodiebig: [5.8, 6.1, 6.3, 6.4, 6.4, 6.4, 6.4], champ: [5.4, 5.8, 6.2, 6.6, 7, 7.4, 7.8], kimono: [5.4, 5.8] }[id];
    let skirt = null;
    if (id === 'dress') { skirt = rows2(y0 + 11, [4.6, 5.2, 5.8, 6.4, 7.0, 7.6, 8.2, 8.8, 9.4, 10, 10.4], 20.5); body.or(skirt); }
    else if (EXT) body.or(rows2(y0 + 17, EXT.map((v) => v + (spec.bulk ? 1 : 0)), 20.5));
    if (id === 'poncho') body.or(polyM([[be(2) - 1, y0 + 1.6], [fe(2) + 1, y0 + 1.6], [fe(2) + 5, y0 + 14.4], [be(2) - 5, y0 + 14.4]]));
    // neckline
    if (VNECK[id] && !HIGH[id]) body.sub(polyM([[fe(0) - 1, y0 - 1.5], [fe(0) + 2, y0 - 1.5], [fe(3) + 0.4, y0 + 3.4], [fe(0) + 0.8, y0 + 2.8]]));
    else if (!HIGH[id]) body.sub(polyM([[fe(0) - 0.6, y0 - 1.5], [fe(0) + 2, y0 - 1.5], [fe(1) + 0.6, y0 + 0.8], [fe(0), y0 + 1.0]]));
    const rolled = HIGH[id] ? rows2(y0 - 2.6, [3.0, 3.1, 3.2, 3.3], 20.5).and(polyM([[16, y0 - 3], [25.6, y0 - 3], [25.6, y0 + 1.2], [16, y0 + 1.2]])) : null;
    if (rolled) body.or(rolled);
    sh(P, body, rp, { cap: 4, dither: id === 'puffer' || id === 'puffvest' });
    const put = (m, c) => m.each((x, y) => P.px(x, y, c));
    const hemEdge = () => { const e = M(); body.each((x, y) => { if (!body.get(x, y + 1) && y > ny(y0 + 8)) e.set(x, y); }); return e; };
    const hemLine = (c) => put(hemEdge(), c);
    const frontLine = (c, r0, r1) => { for (let r = r0; r <= r1; r += 0.5) D.px(fe(r) - 0.5, y0 + r, c); };
    const collar = (c) => { D.poly([[be(0) + 0.4, y0 - 0.2], [c0(0) + 0.4, y0 + 1.2], [fe(0) - 0.4, y0 + 0.4]], c); };
    const folds = (c, rows) => { for (const r of rows) { D.line(c0(r) - 3.6, y0 + r, c0(r) - 0.8, y0 + r + 1.1, c); D.line(c0(r) + 3.6, y0 + r + 0.4, c0(r) + 1, y0 + r + 1.4, c); } };
    const bodyEach = (fn) => body.each((x, y) => fn(x, y, iX(x), iY(y) - y0));
    switch (id) {
      case 'tee': case 'bbhtee': {
        collar(rp.light); hemLine(rp.shade); folds(rp.shade, [8]);
        if (id === 'bbhtee') { const lt = { B: ['110', '101', '110', '101', '110'], H: ['101', '101', '111', '101', '101'] }; ['B', 'H'].forEach((ch, i) => lt[ch].forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === '1') D.rect(fe(6) - 4.6 + i * 3.6 + k, y0 + 5 + j, 1, 1, L.top.color2); })); }
        break;
      }
      case 'oversized': {
        collar(rp.light); folds(rp.shade, [8, 12]); D.line(be(8) + 1, y0 + 17, be(8) + 2.4, y0 + 22, rp.deep); D.line(fe(8) - 0.4, y0 + 17, fe(8) - 0.2, y0 + 22, rp.deep);
        const bolt = polyM([[fe(8) - 2.6, y0 + 9.8], [fe(8) - 0.6, y0 + 9.8], [fe(8) - 2.6, y0 + 13.4], [fe(8) - 0.4, y0 + 13.4], [fe(8) - 4.6, y0 + 18.4], [fe(8) - 3.4, y0 + 14.8], [fe(8) - 5, y0 + 14.8]]).and(body);
        put(bolt.shiftN(Math.max(1, Math.round(GR.k * 0.8)), Math.max(1, Math.round(GR.k * 0.8))).sub(bolt).and(body), rp.deep); sh(P, bolt, r2, { cap: 3, hi: true });
        hemLine(rp.deep);
        break;
      }
      case 'tank': { collar(rp.light); hemLine(rp.shade); folds(rp.shade, [8]); D.vl(c0(0) + 0.6, y0 - 0.6, y0 + 2.6, rp.light); break; }
      case 'jersey': {
        put(edge(body, 1, 0), r2.base); put(edge(body, 0, 1).and(body), r2.base); collar(r2.base);
        bodyEach((x, y, u, v) => { if (v > 2 && (Math.floor(v * 1.05) % 2 === 0) && (x & 1)) P.px(x, y, rp.shade); });
        const cs = Math.max(1, Math.round(GR.k * 0.8)), gw = 4 * cs, x0 = Math.round(Kit.X(c0(6) - 3)), yy = Math.round(Kit.Y(y0 + 5));
        for (let pass = 0; pass < 2; pass++) ['2', '3'].forEach((ch, n) => { const g = DIG[ch]; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') { const bx = x0 + n * gw + i * cs, by = yy + j * cs; if (pass === 0) P.rect(bx - 1, by - 1, cs + 2, cs + 2, rp.deep); else P.rect(bx, by, cs, cs, L.top.color2); } });
        D.hl(be(14) + 0.4, fe(14) - 0.4, y0 + 14.4, r2.base);
        break;
      }
      case 'hoodie': case 'hoodiebig': {
        const big = id === 'hoodiebig', hb = ellM(be(0) + 0.6, y0 - 0.6, big ? 4.6 : 3.8, big ? 3.2 : 2.6); sh(P, hb, rp, { cap: 3, hi: true }); put(edge(hb, 0, 1).and(hb), rp.shade);
        collar(rp.light); D.vl(fe(2) - 1.0, y0 + 2.4, y0 + (big ? 8.4 : 6.4), r2.light); D.px(fe(2) - 1.0, y0 + (big ? 8.9 : 6.9), '#e8c050');
        const pk = polyM([[c0(9) - 2, y0 + 9.4], [fe(9) - 0.4, y0 + 9], [fe(9) + 0.4, y0 + 15], [c0(9) - 2.4, y0 + 15]]); put(edge(pk, 0, -1).and(body), rp.hi); D.line(fe(10) - 0.6, y0 + 9.4, fe(10) - 0.2, y0 + 15, rp.shade);
        hemEdge().each((x, y) => P.px(x, y, rp.light)); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15.4, rp.shade); folds(rp.shade, big ? [5, 7.6] : [6]);
        break;
      }
      case 'croptop': { collar(rp.light); hemLine(r2.base); D.hl(be(9) + 0.4, fe(9) - 0.4, y0 + 8.6, r2.light); folds(rp.shade, [5]); break; }
      case 'sweater': {
        bodyEach((x, y, u, v) => { if (v > 2.2 && v < 14 && (Math.floor((u + 40) * 1.25) % 2 === 0) && ((Math.floor(v * 1.1) + Math.floor(u)) & 1)) P.px(x, y, rp.shade); });
        collar(rp.hi); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15, rp.light); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 16, rp.shade); D.hl(be(7) + 0.4, fe(7) - 0.4, y0 + 7.2, L.top.color2); D.hl(be(8) + 0.4, fe(8) - 0.4, y0 + 8.4, r2.light);
        break;
      }
      case 'flannel': {
        bodyEach((x, y, u, v) => { if (v > 2.4) { const a = ((Math.floor(u) % 4) + 4) % 4, b = Math.floor(v) % 4; if (a === 0) P.px(x, y, r2.base); if (b === 0) P.px(x, y, r2.shade); if (a === 0 && b === 0) P.px(x, y, r2.deep); if (a === 2 && b === 2) P.px(x, y, r2.light); } });
        D.poly([[fe(0) - 0.4, y0 + 0.4], [fe(2) + 0.4, y0 + 3.4]], rp.hi); frontLine(rp.deep, 4, 15); for (const r of [6, 9, 12]) D.px(fe(r) - 1, y0 + r, '#fff0c9'); hemLine(rp.shade);
        break;
      }
      case 'dress': {
        collar(rp.light); D.vl(c0(0) + 0.6, y0 - 0.6, y0 + 2.8, rp.light); D.hl(be(10) + 0.6, fe(10) - 0.6, y0 + 10, r2.base, 2);
        skirt.each((x, y) => { const u = iX(x); if (Math.abs((u * 0.9) % 3) < 0.45 && iY(y) > y0 + 12) P.px(x, y, rp.shade); }); put(edge(skirt, 0, 1), r2.light);
        for (const [dx, r] of [[-3, 14], [2.4, 15], [-0.6, 17], [3.8, 18.6], [-4.6, 19]]) { D.px(c0(r) + dx, y0 + r, r2.hi); D.px(c0(r) + dx + 1, y0 + r, r2.light); D.px(c0(r) + dx, y0 + r + 1, r2.light); }
        break;
      }
      case 'jacket': {
        collar(rp.hi); D.poly([[fe(0) - 0.4, y0 + 0.6], [fe(3) + 0.2, y0 + 3.6]], rp.hi); D.line(fe(3), y0 + 4, fe(14) - 0.6, y0 + 15, rp.deep); for (let r = 5; r < 15; r += 1.8) D.px(fe(r) - 1.4, y0 + r, '#cfd3e6');
        for (let r = 1.4; r < 8; r += 0.7) D.px(be(r) + 1.2 + r * 0.25, y0 + r, rp.hi);
        D.hl(c0(11) - 2, c0(11) + 1, y0 + 11, '#cfd3e6', 1); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15, rp.shade); hemLine(rp.deep);
        break;
      }
      case 'bomber': {
        for (let r = 0; r < 14; r += 0.55) { D.px(be(r) + 1.4 + r * 0.45, y0 + r + 1, rp.hi); if (r > 3) D.px(be(r) + 3 + r * 0.3, y0 + r + 1, rp.light); }
        collar(r2.base); frontLine(rp.deep, 2, 14); for (let r = 3; r < 14; r += 1.6) D.px(fe(r) - 1.2, y0 + r, '#cfd3e6');
        D.hl(be(14) + 0.4, fe(14) - 0.4, y0 + 14.4, r2.base, 2); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15.6, r2.light); D.hl(be(13) + 0.4, fe(13) - 0.4, y0 + 13.6, '#ffffff', 1);
        for (let x = be(15); x < fe(15); x += 1.3) D.vl(x, y0 + 14.4, y0 + 16, r2.shade);
        break;
      }
      case 'denimjacket': {
        const st = '#ffb454';
        bodyEach((x, y) => { if (hash(x, y) < 0.16) P.px(x, y, rp.light); else if (hash(y, x + 9) < 0.09) P.px(x, y, rp.shade); });
        collar(rp.hi); D.poly([[fe(0) - 0.4, y0 + 0.8], [fe(3) - 0.2, y0 + 3.8]], rp.hi); frontLine(rp.deep, 4, 15); for (const r of [5.6, 8.6, 11.6]) D.px(fe(r) - 1.2, y0 + r, '#e8c050');
        D.hl(c0(7) - 2.4, c0(7) + 0.8, y0 + 6.2, rp.deep, 1); D.hl(c0(8) - 2.4, c0(8) + 0.8, y0 + 8.4, st, 1); D.vl(c0(7) - 2.4, y0 + 6.2, y0 + 8.4, st); D.vl(c0(7) + 0.8, y0 + 6.2, y0 + 8.4, st);
        D.line(be(3) + 1, y0 + 3, c0(5), y0 + 6, st); D.hl(be(14) + 0.4, fe(14) - 0.4, y0 + 14, st); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15, rp.deep);
        break;
      }
      case 'windbreaker': {
        const yoke = body.clone().clipY(y0 - 3, y0 + 6.2); sh(P, yoke, r2, { cap: 4 }); D.hl(be(6) + 0.4, fe(6) - 0.4, y0 + 6.4, rp.deep); D.hl(be(7) + 0.4, fe(7) - 0.4, y0 + 7.4, '#ffffff');
        D.vl(c0(11) - 0.4, y0 + 7.6, y0 + 15, r2.base); D.vl(c0(11) - 1.4, y0 + 7.6, y0 + 15, '#ffffff'); frontLine(rp.deep, 2, 15); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15.4, r2.base); folds(rp.shade, [9]);
        break;
      }
      case 'puffvest': {
        for (const r of [4.2, 8.0, 11.8, 15.4]) { bodyEach((x, y, u, v) => { if (Math.abs(v - r) < 0.45) P.px(x, y, rp.deep); else if (Math.abs(v - (r - 1.0)) < 0.45 && ((x + y) & 1) === 0) P.px(x, y, rp.light); }); }
        frontLine(rp.deep, 2, 15); D.px(fe(3) - 1, y0 + 2.5, '#ffffff'); hemEdge().each((x, y) => P.px(x, y, rp.deep));
        break;
      }
      case 'varsity': {
        collar(r2.base); frontLine(rp.deep, 3, 14); for (const r of [5, 8, 11]) D.px(fe(r) - 1, y0 + r, '#fff0c9'); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15, r2.base); D.hl(be(14) + 0.4, fe(14) - 0.4, y0 + 14, '#ffffff');
        const bm = ['110', '101', '110', '101', '110']; bm.forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === '1') D.rect(fe(6) - 4.2 + k, y0 + 5 + j, 1, 1, '#f7f2e8'); }); folds(rp.shade, [8]);
        break;
      }
      case 'tracktop': {
        collar(rp.light); frontLine(rp.deep, 1, 15); D.px(fe(2) - 1, y0 + 2.4, '#ffffff'); D.vl(c0(10) - 1, y0 + 2, y0 + 15, r2.base); D.vl(c0(10) - 2, y0 + 2, y0 + 15, r2.light);
        D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 15, rp.shade); hemLine(rp.shade); folds(rp.shade, [9]);
        break;
      }
      case 'puffer': {
        for (const r of [4, 8, 12, 16]) bodyEach((x, y, u, v) => { if (Math.abs(v - r) < 0.45) P.px(x, y, rp.deep); else if (Math.abs(v - (r - 1)) < 0.4 && ((x + y) & 1) === 0) P.px(x, y, rp.light); });
        frontLine(rp.deep, 2, 15.5); D.px(fe(2) - 1, y0 + 2.6, '#ffffff');
        break;
      }
      case 'hawaiian': {
        D.poly([[fe(0) - 0.4, y0 + 0.6], [fe(2) + 0.2, y0 + 3.4]], rp.hi); frontLine(rp.deep, 4, 15);
        [[-3, 5], [1.5, 6.6], [-1, 9.4], [2.4, 11.4], [-4, 12.4], [1, 14]].forEach(([dx, r], i) => { for (const [ox, oy] of [[0, 0], [-1.1, 0], [1.1, 0], [0, -1.1], [0, 1.1]]) D.px(c0(r) + dx + ox, y0 + r + oy, ox === 0 && oy === 0 ? r2.hi : r2.light); D.px(c0(r) + dx + (i % 2 ? 1.6 : -1.6), y0 + r + 1.4, '#3f9b5a'); });
        hemLine(rp.shade);
        break;
      }
      case 'overalls': {
        const inner = body.clone(); sh(P, inner, r2, { cap: 4 }); collar(r2.light);
        const bib = polyM([[fe(5) - 5.2, y0 + 5], [fe(5) + 0.2, y0 + 5], [fe(12) + 0.2, y0 + 16.4], [fe(12) - 5.4, y0 + 16.4]]).and(body); sh(P, bib, rp, { cap: 4 });
        D.line(be(2) + 2, y0 + 1.4, fe(5) - 3.2, y0 + 5.4, rp.base, Math.max(2, GR.t)); D.px(fe(5) - 3.4, y0 + 5.6, '#e8c050'); D.hl(fe(8) - 4.6, fe(8) - 1, y0 + 8.4, rp.deep); D.hl(be(15) + 0.4, fe(15) - 0.4, y0 + 16, rp.shade);
        break;
      }
      case 'turtleneck': {
        for (let x = c0(0) - 2; x <= c0(0) + 2.6; x += 1.4) D.vl(x, y0 - 2.4, y0 + 0.4, rp.shade);
        D.hl(c0(0) - 2.6, c0(0) + 3, y0 + 0.8, rp.deep); bodyEach((x, y, u, v) => { if (v > 2.6 && (Math.floor((u + 40) * 1.1) % 3 === 0) && ((y & 3) < 2)) P.px(x, y, rp.shade); }); hemLine(rp.shade); folds(rp.shade, [9]);
        break;
      }
      case 'kimono': {
        D.line(fe(0) - 0.6, y0 + 1, c0(8) - 0.5, y0 + 8.6, r2.base); D.line(fe(0) - 1.4, y0 + 1, c0(8) - 1.5, y0 + 8.6, r2.light);
        D.hl(be(10) + 0.4, fe(10) - 0.4, y0 + 9, r2.base, 2); D.hl(be(10) + 0.4, fe(10) - 0.4, y0 + 10.3, r2.light); D.hl(be(10) + 0.4, fe(10) - 0.4, y0 + 11.3, r2.shade);
        put(edge(body, 0, 1).and(body), r2.base); D.vl(fe(14) - 1, y0 + 9, y0 + 20, r2.base);
        for (const [dx, r] of [[-3, 5], [1, 14], [-2, 18]]) { D.px(c0(r) + dx, y0 + r, '#fff0c9'); D.px(c0(r) + dx + 1, y0 + r + 1, '#fff0c9'); }
        break;
      }
      case 'tux': {
        const shirt = polyM([[fe(0) - 1, y0 + 0.4], [fe(0) + 1.4, y0 + 1], [fe(12) + 0.2, y0 + 14], [fe(12) - 2.6, y0 + 14]]).and(body); sh(P, shirt, ramp('#f7f2e8'), { cap: 3 });
        D.line(fe(0) - 1.4, y0 + 0.6, fe(9) - 1.2, y0 + 9, rp.hi); D.line(fe(0) - 2.4, y0 + 0.6, fe(9) - 2.4, y0 + 9, rp.light);
        D.px(fe(3) - 0.8, y0 + 2.4, r2.base); D.px(fe(4) - 0.8, y0 + 3.6, r2.deep); D.px(fe(5) - 0.8, y0 + 5, r2.deep);
        D.px(fe(9) - 1.6, y0 + 9, '#fff'); D.px(fe(9) - 0.8, y0 + 9.2, '#e84a6a'); D.hl(be(16) + 0.4, fe(16) - 0.4, y0 + 16, rp.shade);
        break;
      }
      case 'poncho': {
        collar(rp.light);
        bodyEach((x, y, u, v) => { if (v >= 6 && (Math.abs(v - 8.5) < 0.7 || Math.abs(v - 13) < 0.6)) P.px(x, y, r2.base); if (Math.abs(v - 11) < 0.45 && ((x + y) & 1)) P.px(x, y, r2.light); });
        edge(body, 0, 1).each((x, y) => { if (iY(y) > y0 + 12) P.px(x, y, ((x + y) & 1) ? r2.base : rp.shade); });
        for (let x = c0(14) - 10; x <= c0(14) + 10; x += 1.6) D.vl(x, y0 + 14.4, y0 + 15.6, r2.light);
        break;
      }
      case 'stagesuit': {
        D.vl(c0(10) - 1, y0 + 2, y0 + 15, r2.hi); D.vl(c0(10) - 2, y0 + 2, y0 + 15, r2.base); collar(r2.light); D.hl(be(11) + 0.4, fe(11) - 0.4, y0 + 11, r2.base); D.hl(be(12) + 0.4, fe(12) - 0.4, y0 + 12, r2.light);
        D.rect(fe(11) - 3.4, y0 + 10.4, 2.8, 2.6, '#ffe14d'); D.px(fe(11) - 2.8, y0 + 11, '#fff7b0');
        bodyEach((x, y, u, v) => { if (v > 1.5 && hash(x * 3, y * 7) < 0.045) P.px(x, y, '#ffffff'); });
        break;
      }
      case 'champ': {
        frontLine(r2.base, 1, 22); D.vl(fe(10) - 2, y0 + 1, y0 + 22, r2.light);
        for (let x = be(1); x <= fe(2); x += 0.7) { D.px(x, y0 + 1.2, (Math.floor(x * 2) & 1) ? '#ffffff' : '#e6dff2'); D.px(x, y0 + 2, ((x * 3) & 1) ? '#e6dff2' : '#cfc6e4'); D.px(x, y0 + 2.8, '#cfc6e4'); }
        D.hl(be(11) + 0.4, fe(11) - 0.4, y0 + 11, r2.base); D.hl(be(12) + 0.4, fe(12) - 0.4, y0 + 12, r2.light); edge(body, 0, 1).each((x, y) => { if (iY(y) > y0 + 13) P.px(x, y, r2.base); });
        break;
      }
      case 'stagesuit2': break;
    }
    // collar roll for high necks
    if (HIGH[id]) { for (let x = c0(0) - 2.4; x <= c0(0) + 2.8; x += 1.3) D.vl(x, y0 - 2.4, y0 + 0.6, rp.shade); D.hl(c0(0) - 2.6, c0(0) + 3, y0 - 2.6, rp.light); }
  }
  function rows2(y0, hws, cx) {
    const Lp = [], Rp = [], n = hws.length;
    Lp.push([cx - hws[0], y0 - 0.5]); Rp.push([cx + hws[0], y0 - 0.5]);
    for (let i = 0; i < n; i++) { Lp.push([cx - hws[i], y0 + i]); Rp.push([cx + hws[i], y0 + i]); }
    Lp.push([cx - hws[n - 1], y0 + n - 0.5]); Rp.push([cx + hws[n - 1], y0 + n - 0.5]);
    return polyM(Lp.concat(Rp.reverse()));
  }

  // sleeve over an arm in profile
  function sleeveS(X, sd) {
    const L = X.L, id = L.top.id, spec = TOPSPEC[id]; if (!spec || spec.sl <= 0) return;
    const S = X.S, P = X.P, col = sleeveCol(L, id), rp = ramp(col), r2 = ramp(L.top.color2), a = S.arms[sd];
    const full = SD.armMaskS(S, sd, 0, 1, spec.k), part = SD.armMaskS(S, sd, 0, spec.sl, spec.k);
    sh(P, part, rp, { cap: 3, ctx: full });
    const endT = spec.sl, lerp = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
    const e = endT >= 1 ? a.ha : endT < 0.5 ? lerp(a.sh, a.el, endT * 2) : lerp(a.el, a.ha, endT * 2 - 1);
    const hoodie = ['hoodie', 'hoodiebig', 'sweater', 'tracktop', 'puffer'].indexOf(id) >= 0;
    const cuffCol = id === 'varsity' ? '#ffffff' : id === 'bomber' || id === 'windbreaker' ? r2.base : hoodie ? rp.light : id === 'kimono' || id === 'champ' ? r2.base : id === 'denimjacket' ? '#ffb454' : rp.shade;
    const cr = (id === 'oversized' || id === 'tee' || id === 'bbhtee' || id === 'hawaiian') ? 1.4 : 2.0 + (spec.k > 0.9 ? 0.4 : 0);
    part.each((x, y) => {
      const dd = Math.hypot(iX(x) - e[0], iY(y) - e[1]);
      if (dd < cr && endT >= 0.4) P.px(x, y, ((id === 'bomber' || id === 'hoodie' || id === 'hoodiebig' || id === 'sweater') && ((x + y) & 1)) ? rp.shade : cuffCol);
      else if (dd < cr + 0.9 && dd >= cr && endT >= 0.4 && (id === 'bomber' || id === 'varsity')) P.px(x, y, id === 'varsity' ? r2.base : r2.light);
    });
    if (id === 'tracktop' || id === 'windbreaker') part.each((x, y) => { if (!part.get(x, y - 1)) P.px(x, y, id === 'tracktop' ? r2.base : '#ffffff'); });
    if (id === 'flannel') part.each((x, y) => { if ((Math.floor(iX(x) + iY(y)) % 4 === 0)) P.px(x, y, r2.base); });
    if (id === 'hawaiian') part.each((x, y) => { if (hash(x, y) < 0.08) P.px(x, y, r2.hi); });
    if (id === 'denimjacket') part.each((x, y) => { if (hash(x, y) < 0.14) P.px(x, y, rp.light); else if (hash(y, x) < 0.08) P.px(x, y, rp.shade); });
    if (id === 'bomber') part.each((x, y) => { if (((iX(x) * 0.7 + iY(y) * 0.9) % 3) < 0.4) P.px(x, y, rp.hi); });
    if (id === 'puffer' || id === 'hoodiebig') part.each((x, y) => { if (((iY(y) - a.sh[1]) % 3.6) > 3.1) P.px(x, y, rp.deep); });
    if (id === 'poncho') edge(part, 0, 1).each((x, y) => P.px(x, y, ((x + y) & 1) ? r2.base : rp.shade));
    if (id === 'oversized') edge(part, 0, 1).each((x, y) => P.px(x, y, rp.deep));
    if (id === 'stagesuit') part.each((x, y) => { if (hash(x, y * 3) < 0.04) P.px(x, y, '#ffffff'); });
  }

  /* --------------------------------------------------------------- bottoms */
  const BOTS = { jeans: { end: 1, k: 0.15 }, cargo: { end: 1, k: 0.55 }, shorts: { end: 0.42, k: 0.5 }, joggers: { end: 0.97, k: 0.4 }, baggy: { end: 1, k: 0.95 }, leggings: { end: 1, k: 0 }, trackpants: { end: 1, k: 0.25 }, slacks: { end: 1, k: 0.2 }, flares: { end: 1, k: 0.15 }, goldpants: { end: 1, k: 0.1 }, sweatpants: { end: 1, k: 0.6 }, ripped: { end: 1, k: 0.95 }, camo: { end: 1, k: 0.6 }, techpants: { end: 1, k: 0.3 } };
  const dim = (P, m, k) => m.each((x, y) => { const p = P.get(x, y); if (p[3] > 200) P.px(x, y, mix([p[0], p[1], p[2]], '#2a1f45', k)); });
  function bottomLegS(X, sd) {
    const L = X.L, id = L.bottom.id, spec = BOTS[id]; if (!spec) return null;
    const P = X.P, S = X.S, D = X.D0, K = X.K, rp = ramp(L.bottom.color), leg = S.legs[sd], far = sd === 'F';
    let lm = SD.legMaskS(S, sd, 0, spec.end, spec.k);
    if (id === 'flares') lm.or(M().capsule(leg.kn[0], leg.kn[1], leg.an[0], leg.an[1] + 0.5, S.G.legR[1] + 0.4, S.G.legR[2] + 1.7));
    sh(P, lm, rp, { cap: 3 });
    const lerp = (t) => t < 0.5 ? [leg.hip[0] + (leg.kn[0] - leg.hip[0]) * t * 2, leg.hip[1] + (leg.kn[1] - leg.hip[1]) * t * 2] : [leg.kn[0] + (leg.an[0] - leg.kn[0]) * (t * 2 - 1), leg.kn[1] + (leg.an[1] - leg.kn[1]) * (t * 2 - 1)];
    const lm2 = (fn) => lm.each((x, y) => fn(x, y, iX(x), iY(y))), hemRows = (c, n) => lm.each((x, y) => { if (!lm.get(x, y + 1) || (lm.get(x + 1, y + 1) === 0 && lm.get(x - 1, y + 1) === 0 && false)) for (let q = 0; q < (n || 1); q++) P.px(x, y - q, c); });
    const frontEdge = (c) => lm.each((x, y) => { if (!lm.get(x + 1, y) && iY(y) > leg.hip[1] + 2) P.px(x, y, c); });
    const endCuff = (c, t0) => { const e = lerp(1); lm.each((x, y) => { if (Math.hypot(iX(x) - leg.an[0], iY(y) - leg.an[1]) < 2.1) P.px(x, y, c); }); };
    const at = (t) => lerp(t);
    switch (id) {
      case 'jeans': frontEdge(rp.light); lm2((x, y) => { if (hash(x, y) < 0.06) P.px(x, y, rp.light); }); { const k = at(0.55); D.line(k[0] - 2, k[1] - 0.4, k[0] + 1, k[1] + 0.6, rp.shade); } endCuff(rp.light); break;
      case 'cargo': case 'camo': {
        if (id === 'camo') {
          const t1 = ramp(mix(L.bottom.color, '#17141f', 0.45)), t2 = ramp(mix(L.bottom.color, '#ffffff', 0.25)), t3 = ramp(mix(L.bottom.color, '#7a5a30', 0.45));
          lm2((x, y, u, v) => { const n = Math.sin(u * 1.35 + Math.sin(v * 0.7) * 1.8) + Math.sin(v * 1.1 - u * 0.5) + Math.sin((u + v) * 0.9 + 2.0); if (n > 1.15) P.px(x, y, t1.base); else if (n < -1.25) P.px(x, y, t3.base); else if (n > 0.55 && n < 0.75) P.px(x, y, t2.base); });
          lm.each((x, y) => { if (!lm.get(x + 1, y) && !lm.get(x + 1, y + 1)) P.px(x, y, ((x + y) & 1) ? rp.light : t2.light); });
        }
        const p0 = at(0.26), pk = rr(p0[0] + 0.2, p0[1] + 0.6, 2.2, 2.3, 0.5).and(lm); sh(P, pk, rp, { cap: 2, hi: true }); put(edge(pk, 0, -1), rp.deep); put(edge(pk, 1, 0), rp.shade);
        D.px(p0[0] + 0.4, p0[1] + 1.6, '#e8c050'); { const a = at(0.9); D.hl(a[0] - 2, a[0] + 2, a[1] - 0.4, rp.deep); } frontEdge(rp.light);
        break;
      }
      case 'shorts': hemRows(rp.deep); break;
      case 'joggers': case 'sweatpants': {
        endCuff(((leg.an[0] * 7) | 0) & 1 ? rp.light : rp.base); lm.each((x, y) => { if (Math.hypot(iX(x) - leg.an[0], iY(y) - leg.an[1]) < 2.1) P.px(x, y, ((x + y) & 1) ? rp.light : rp.base); else if (Math.hypot(iX(x) - leg.an[0], iY(y) - leg.an[1]) < 2.7) P.px(x, y, rp.deep); });
        lm.each((x, y) => { if (iY(y) > leg.hip[1] + 1.5 && Math.hypot(iX(x) - leg.an[0], iY(y) - leg.an[1]) > 3 && !lm.get(x + 1, y)) { P.px(x, y, '#f7f2e8'); P.px(x - 1, y, '#cfc6e4'); } });
        if (id === 'sweatpants') { for (let q = 0; q < 3; q++) { const t = at(0.55 + q * 0.12); D.line(t[0] - 1.8, t[1], t[0] + 1.4, t[1] + 0.9, rp.shade); } }
        break;
      }
      case 'baggy': { for (let q = 0.45; q < 0.95; q += 0.17) { const t = at(q); D.line(t[0] - 2.2, t[1] + 0.3, t[0] + 1.4, t[1] - 0.2, rp.shade); } hemRows(rp.shade, 2); frontEdge(rp.light); break; }
      case 'ripped': {
        frontEdge(rp.light); lm2((x, y) => { if (hash(x, y) < 0.1) P.px(x, y, rp.light); else if (hash(y + 5, x) < 0.06) P.px(x, y, rp.shade); });
        const k = at(0.52), rip = M().fn(k[0] - 2.6, k[1] - 2.4, k[0] + 2.6, k[1] + 2.4, (x, y) => ((x - k[0]) / 2.1) ** 2 + ((y - k[1]) / 1.7) ** 2 <= 1).and(lm); sh(P, rip, K.r, { cap: 2 });
        rip.each((x, y) => { if (!rip.get(x, y - 1)) P.px(x, y, rp.deep); }); for (let q = -1; q <= 1; q++) { D.px(k[0] + q * 1.4, k[1] - 1.7, '#e8e0f0'); D.px(k[0] + q * 1.4 + 0.5, k[1] + 1.7, '#e8e0f0'); }
        lm.each((x, y) => { if (Math.hypot(iX(x) - leg.an[0], iY(y) - leg.an[1]) < 1.5 && hash(x, y) < 0.5) P.px(x, y, '#e8e0f0'); });
        break;
      }
      case 'leggings': lm.each((x, y) => { if (!lm.get(x - 1, y) && ((y & 3) !== 0)) P.px(x, y, rp.hi); }); break;
      case 'trackpants': lm.each((x, y) => { if (iY(y) > leg.hip[1] + 2 && !lm.get(x + 1, y)) { P.px(x, y, '#f7f2e8'); P.px(x - 1, y, '#f7f2e8'); } }); endCuff(rp.deep); break;
      case 'slacks': { const a = at(0.15), b = at(0.95); D.line(a[0] + 0.6, a[1], b[0] + 0.6, b[1], rp.hi); endCuff(rp.deep); break; }
      case 'flares': lm.each((x, y) => { if (!lm.get(x, y + 1)) P.px(x, y, rp.deep); }); break;
      case 'goldpants': lm2((x, y) => { if (hash(x, y) < 0.05) P.px(x, y, '#ffffff'); if (!lm.get(x + 1, y)) P.px(x, y, rp.hi); }); break;
      case 'techpants': {
        const stp = ramp(mix(L.bottom.color, '#ffffff', 0.18)), a = at(0.34), b = at(0.62);
        D.hl(a[0] - 3, a[0] + 3, a[1], stp.base); D.hl(a[0] - 3, a[0] + 3, a[1] + 1, stp.shade); D.rect(a[0] + 1.4, a[1] - 0.4, 1.8, 2.2, '#cfd3e6'); D.px(a[0] + 2, a[1], '#ffffff');
        D.hl(b[0] - 3, b[0] + 3, b[1], stp.base); D.px(b[0] + 1.6, b[1] + 0.9, '#8a8aa8'); lm.each((x, y) => { if (!lm.get(x + 1, y) && iY(y) > leg.hip[1] + 1.5) P.px(x, y, '#9aa4c0'); });
        { const z = at(0.82); D.vl(z[0] + 0.4, z[1], leg.an[1] - 0.4, '#8a8aa8'); } endCuff(rp.deep);
        break;
      }
    }
    function put(m, c) { m.each((x, y) => P.px(x, y, c)); }
    return lm;
  }
  function hipsS(X) {
    const L = X.L, id = L.bottom.id, P = X.P, S = X.S, D = X.D0, rp = ramp(L.bottom.color), y0 = S.hipY - 15;
    if (id === 'skirt' || id === 'kilt') {
      const hw = id === 'kilt' ? [4.4, 4.9, 5.4, 5.9, 6.4, 6.8, 7.2, 7.4, 7.6] : [4.4, 4.9, 5.8, 6.7, 7.6, 8.4, 8.8, 9, 9.2, 9.2];
      const sk = rows2(S.hipY - 3.4, hw, 20.5); sh(P, sk.clone().or(SD.hipsSide(S)), rp, { cap: 4 });
      D.hl(15.8, 25.2, S.hipY - 3.2, rp.light);
      if (id === 'skirt') { sk.each((x, y) => { const u = iX(x); if (Math.abs((u * 0.85) % 2.6) < 0.4 && iY(y) > S.hipY - 2) P.px(x, y, rp.shade); }); edge(sk, 0, 1).each((x, y) => P.px(x, y, rp.light)); }
      else {
        const r2 = ramp(mix(L.bottom.color, '#ffffff', 0.4)), r3 = ramp(mix(L.bottom.color, '#17141f', 0.5));
        sk.each((x, y) => { const u = iX(x), v = iY(y) - S.hipY; if (Math.floor(v) % 3 === 0) P.px(x, y, r3.base); if ((Math.floor(u + 20) % 4) === 0) P.px(x, y, r2.base); if ((Math.floor(u + 20) % 4) === 0 && Math.floor(v) % 3 === 0) P.px(x, y, r3.deep); });
        edge(sk, 0, 1).each((x, y) => P.px(x, y, rp.deep)); D.rect(24.2, S.hipY, 1.4, 2.6, '#e8c050');
      }
      return;
    }
    const spec = BOTS[id]; if (!spec) return;
    sh(P, SD.hipsSide(S).clipY(S.hipY - 2.4, S.hipY + 2), rp, { cap: 4 });
    const wb = (c) => D.hl(15.6, 25.6, S.hipY - 2.4, c);
    if (['jeans', 'slacks', 'cargo', 'camo', 'ripped', 'baggy'].indexOf(id) >= 0) { wb(id === 'slacks' ? '#2a2236' : rp.deep); D.rect(24.4, S.hipY - 3, 1.8, 1.6, '#e8c050'); D.px(24.8, S.hipY - 2.6, '#fff0a0'); }
    else if (['sweatpants', 'trackpants', 'joggers', 'techpants'].indexOf(id) >= 0) { wb(rp.light); D.hl(15.6, 25.6, S.hipY - 1.4, rp.deep); if (id === 'sweatpants') { D.vl(24.4, S.hipY - 1.4, S.hipY + 2.4, '#f7f2e8'); D.px(24.4, S.hipY + 2.8, '#e8c050'); } }
    else if (id === 'goldpants') wb('#fff0a0');
  }

  /* ----------------------------------------------------------------- shoes */
  function shoeS(X, sd) {
    const L = X.L, id = L.shoes.id, P = X.P, S = X.S, D = X.D0, K = X.K, rp = ramp(L.shoes.color), leg = S.legs[sd];
    const alt = ramp(mix(L.shoes.color, '#ffffff', 0.62)), dk = ramp(mix(L.shoes.color, '#17141f', 0.55));
    const sole = { sneakers: '#f7f2e8', hightops: '#f7f2e8', skate: '#e8d8a8', loafers: '#2a2236', boots: '#2a2236', combat: '#1c1826', platform: mix(L.shoes.color, '#f7f2e8', 0.7), goldkicks: '#ffe56a', sandals: mix(L.shoes.color, '#2a2236', 0.2), retro: '#f7f2e8', fatlaces: '#f7f2e8', timbs: '#e8d8b0', slides: '#f7f2e8' }[id] || '#f7f2e8';
    const an = leg.an, phi = leg.phi, T = (u, v) => SD.rotF(an, phi, u, v), TP = (pts) => polyM(pts.map((p) => T(p[0], p[1])));
    const tall = { hightops: 3, boots: 6.4, combat: 5, retro: 3.6, timbs: 4.8, slides: 3.8 }[id] || 0.6, wide = id === 'skate' || id === 'combat' || id === 'platform' || id === 'retro' || id === 'timbs' ? 0.5 : 0;
    const plat = id === 'platform' ? 1.4 : 0;
    const upperP = [[-2.7 - wide, -0.6], [1.9, -0.6], [2.7, 0.8], [4.4, 1.9], [5.9 + wide * 0.6, 3.0], [6.1 + wide * 0.6, 4.4], [-2.9 - wide, 4.4]];
    const foot = TP(upperP), shaft = TP([[-2.7 - wide, -tall], [1.9, -tall], [1.9, -0.4], [-2.7 - wide, -0.4]]), all = foot.clone().or(shaft);
    const solM = TP([[-3.0 - wide, 3.0 - plat], [6.2 + wide * 0.6, 3.0 - plat], [6.2 + wide * 0.6, 4.5], [-3.0 - wide, 4.5]]);
    const upper = all.clone().sub(solM), far = sd === 'F';
    const put = (m, c) => m.each((x, y) => P.px(x, y, c));
    const px = (u, v, c) => { const p = T(u, v); D.px(p[0], p[1], c); }, ln = (u0, v0, u1, v1, c, th) => { const a = T(u0, v0), b = T(u1, v1); D.line(a[0], a[1], b[0], b[1], c, th); };
    if (id === 'sandals') {
      sh(P, foot.clone().sub(solM), K.r, { cap: 3 }); put(solM, sole); ln(-0.4, 0.6, 3.6, 2.0, rp.base); ln(-0.4, 1.4, 3.8, 2.8, rp.shade); px(1.4, 0.8, rp.hi); px(4.4, 2.4, K.r.light);
      return all;
    }
    if (id === 'slides') {
      const sock = TP([[-2.5, -tall], [1.8, -tall], [1.9, 0.4], [4.2, 1.8], [5.4, 3.0], [5.4, 3.2], [-2.6, 3.2]]); sh(P, sock, ramp('#f7f2e8'), { cap: 3 });
      ln(-2.4, -tall + 0.6, 1.8, -tall + 0.6, rp.base); ln(-2.4, -tall + 1.5, 1.8, -tall + 1.5, '#f7f2e8');
      put(solM, '#ffffff'); edge(solM, 0, 1).each((x, y) => P.px(x, y, '#c9c0e0'));
      const strap = TP([[0.2, 0.4], [4.2, 1.6], [4.6, 3.0], [0.4, 1.8]]); sh(P, strap, rp, { cap: 2, hi: true }); ln(0.4, 0.7, 4.2, 1.8, rp.hi);
      return all;
    }
    sh(P, upper, rp, { cap: 3, hi: true });
    put(solM, sole); edge(solM, 0, 1).each((x, y) => P.px(x, y, mix(sole, '#6a4a8f', 0.35)));
    solM.each((x, y) => { if (((x + y) & 1) && hash(x, y) < 0.3) P.px(x, y, mix(sole, '#6a4a8f', 0.15)); });
    switch (id) {
      case 'sneakers': case 'skate': case 'goldkicks': case 'hightops': {
        ln(0.2, -0.1, 3.8, 1.8, '#f7f2e8'); ln(0.2, 0.7, 3.4, 2.4, '#e6dff2'); px(1.0, 0.4, rp.deep); px(2.2, 1.0, rp.deep);
        put(TP([[4.4, 1.9], [5.9, 3.0], [6.1, 3.0], [4.6, 2.6]]), '#f7f2e8'); ln(-2.7, 2.4, 4.6, 2.9, id === 'goldkicks' ? '#ffe56a' : rp.shade);
        if (id === 'hightops') { for (let i = 1; i <= 3; i++) px(0.6, -i, i % 2 ? '#e6dff2' : '#f7f2e8'); ln(-2.6, -3, 1.8, -3, '#f7f2e8'); ln(-2.6, -2.2, 1.8, -2.2, rp.shade); }
        if (id === 'skate') ln(-2.8, 2.0, 5.2, 2.5, rp.deep);
        if (id === 'goldkicks') { px(-1.2, 1.2, '#ffffff'); px(3.2, 1.8, '#ffffff'); ln(-2.8, 3.1, 5.6, 3.1, '#ffe56a'); }
        break;
      }
      case 'retro': {
        ln(-2.6, -tall + 0.3, 1.8, -tall + 0.3, alt.light); ln(-2.6, -tall + 1.1, 1.8, -tall + 1.1, rp.shade);
        sh(P, TP([[3.4, 1.9], [4.4, 1.9], [5.9, 3.0], [6.1, 4.4], [3.4, 4.4]]).and(upper), dk, { cap: 2, hi: true });
        sh(P, TP([[-2.9, -tall + 1], [-0.6, -tall + 1], [-0.6, 3.2], [-2.9, 3.2]]).and(upper), dk, { cap: 2, hi: true });
        for (let i = -tall + 1.8; i <= 0.6; i += 1.1) ln(0.2, i, 1.8, i + 0.2, '#ffffff'); ln(-0.8, -tall + 1, 2.4, 1.0, rp.shade); ln(0.6, 3.6, 2.2, 3.6, '#9ad8ff');
        break;
      }
      case 'fatlaces': {
        for (let q = 0; q < 3; q++) { ln(0.4 + q * 1.1, -0.2 + q * 0.5, 1.8 + q * 1.1, 0.1 + q * 0.5, q % 2 ? '#e6dff2' : '#ffffff'); } put(TP([[0.4, -0.9], [2.0, -0.9], [2.0, 0.2], [0.4, 0.2]]), '#ffffff'); ln(0.2, -0.4, -0.8, 1.2, '#ffffff'); ln(2.0, -0.4, 3.0, 1.2, '#ffffff'); px(1.1, -0.3, '#cfc6e4');
        ln(-2.8, 2.7, 5.8, 3.0, rp.shade);
        break;
      }
      case 'timbs': {
        ln(-2.6, -tall, 1.8, -tall, rp.light); ln(-2.6, -tall + 0.9, 1.8, -tall + 0.9, rp.shade);
        for (let i = -tall + 1.6; i <= 0.8; i += 1.2) { px(-0.6, i, rp.deep); px(1.2, i, rp.deep); ln(-0.4, i + 0.2, 1.0, i + 0.2, '#6a4a2a'); }
        put(edge(TP([[3.4, 1.9], [4.4, 1.9], [5.9, 3.0], [6.1, 4.4], [3.4, 4.4]]).and(upper), -1, 0), rp.deep); for (let i = 3.6; i <= 5.8; i += 0.9) px(i, 2.6, '#fff0c9');
        solM.each((x, y) => { if ((x & 1) === 0) P.px(x, y, '#8a6a3a'); });
        break;
      }
      case 'boots': case 'combat': {
        for (let i = 1; i <= tall; i += 1.6) px(0.2, -i, rp.light);
        if (id === 'combat') { ln(-2.6, -tall, 1.8, -tall, '#2a2236'); for (let i = 0; i <= 3; i += 1.1) px(0.6, -i, '#f7f2e8'); } else ln(-2.6, -tall, 1.8, -tall, rp.light);
        solM.each((x, y) => { if (!((x + y) & 1)) P.px(x, y, '#0f0b19'); });
        break;
      }
      case 'platform': { ln(0.6, 1.2, 4, 2.2, rp.light); ln(-3, 2.6, 6.2, 2.6, mix(sole, '#ffffff', 0.4)); break; }
      case 'loafers': { px(3.0, 1.4, '#e8c050'); px(3.8, 1.8, '#fff0a0'); ln(0.4, 0.2, 3.2, 1.0, rp.light); ln(-2.7, 0.8, 1.8, 0.8, rp.shade); break; }
    }
    return all;
  }

  /* ------------------------------------------------------------ accessories */
  const chainPath = (S, t) => { const y0 = S.hipY - 15, a = [19.4, y0 + 0.2], m = [23.6, y0 + 2.0], b = [25.4 + S.lean * 0.1, y0 + 7.2]; return t < 0.5 ? [a[0] + (m[0] - a[0]) * t * 2, a[1] + (m[1] - a[1]) * t * 2] : [m[0] + (b[0] - m[0]) * (t * 2 - 1), m[1] + (b[1] - m[1]) * (t * 2 - 1)]; };
  function neckS(X) {
    const a = X.L.acc.neck; if (!a || a.id === 'none_neck') return;
    const P = X.P, S = X.S, D = X.D0, y0 = S.hipY - 15, rp = ramp(a.color);
    const p = (t) => chainPath(S, t);
    switch (a.id) {
      case 'chain': { for (let t = 0; t <= 1.001; t += 0.06) { const q = p(t); D.px(q[0], q[1], t * 14 % 2 < 1 ? rp.hi : rp.base); D.px(q[0] + 0.8, q[1], rp.shade); } const q = p(1); D.px(q[0], q[1] + 0.8, rp.hi); D.px(q[0], q[1] + 1.6, rp.light); D.px(q[0] - 0.4, q[1] + 2.4, rp.base); break; }
      case 'cubanchain': {
        const gold = ramp(mix(a.color, '#e8b923', 0.5)); let i = 0;
        for (let t = 0; t <= 1.001; t += 0.07) { const q = p(t), horiz = (i++ & 1) === 0, m = horiz ? ellM(q[0], q[1], 1.15, 0.8) : ellM(q[0], q[1], 0.8, 1.15); sh(P, m, gold, { cap: 2, hi: true }); if (i % 3 === 0) D.px(q[0] - 0.3, q[1] - 0.3, '#ffffff'); }
        const q = p(1), pend = rr(q[0] + 0.2, q[1] + 3.6, 1.9, 2.8, 0.6); sh(P, pend, gold, { cap: 3, hi: true });
        const inner = rr(q[0] + 0.3, q[1] + 3.8, 1.0, 1.8, 0.3); flat(P, inner, '#d8f4ff'); inner.each((x, y) => { if (hash(x, y) < 0.4) P.px(x, y, '#ffffff'); }); D.px(q[0] + 2.8, q[1] + 1.6, '#ffffff'); D.vl(q[0] + 2.8, q[1] + 0.8, q[1] + 2.4, '#ffffff', 1); D.add(q[0] - 2, q[1] + 6.6, '#fff7b0', 170);
        break;
      }
      case 'dogtags': {
        for (let t = 0; t <= 1.001; t += 0.05) { const q = p(t); D.px(q[0], q[1], t * 20 % 2 < 1 ? '#e6edf8' : '#8a96b0'); D.px(q[0] + 0.8, q[1], '#6a7690'); }
        const metal = ramp(a.color), q = p(1);
        for (const [dx, dy, ar] of [[-0.4, 1.8, 0], [0.6, 2.8, 0.2]]) { const t2 = rr(q[0] + dx, q[1] + dy + 1.6, 1.0, 2.2, 0.6); sh(P, t2, metal, { cap: 2, hi: true }); D.hl(q[0] + dx - 0.6, q[0] + dx + 0.6, q[1] + dy + 1.2, metal.deep, 1); }
        break;
      }
      case 'scarf': {
        const m = ellM(21.0, y0 + 0.6, 3.8, 2.4), tail = polyM([[18.6, y0 + 1.6], [14, y0 + 4], [9.4, y0 + 8.4], [8.4, y0 + 11], [11.6, y0 + 10], [15.4, y0 + 6.8], [19.6, y0 + 4]]);
        sh(P, tail, rp, { cap: 3 }); sh(P, m, rp, { cap: 3 });
        const r2 = ramp(mix(a.color, '#ffffff', 0.55)); m.each((x, y) => { if (Math.abs((iX(x) * 0.9) % 3) < 0.7) P.px(x, y, r2.base); }); tail.each((x, y) => { if ((Math.floor(iX(x) + iY(y)) % 3) === 0) P.px(x, y, r2.base); });
        for (let i = 0; i < 3; i++) D.px(8.6 + i * 1.2, y0 + 11.4 - i * 0.2, i % 2 ? rp.light : rp.shade);
        break;
      }
      case 'bowtie': { const bm = polyM([[23.0, y0 + 1.4], [26.4, y0 + 0.2], [26.4, y0 + 3.4]]); sh(P, bm, rp, { cap: 2, hi: true }); sh(P, polyM([[22.6, y0 + 1.4], [19.4, y0 + 0.2], [19.8, y0 + 3.2]]), rp, { cap: 2, hi: true }); D.rect(22.2, y0 + 0.7, 1.8, 1.9, rp.light); break; }
      case 'hpneck': {
        const b = ramp(a.color), cup = rr(21.4, y0 + 5.2, 2.8, 3.8, 1.2); D.line(18.6, y0 - 0.4, 16.8, y0 + 1.4, b.deep, Math.max(2, GR.t)); D.line(23.4, y0 - 0.2, 23.6, y0 + 1.6, b.deep);
        sh(P, cup, b, { cap: 3, hi: true }); sh(P, rr(21.8, y0 + 5.2, 1.6, 2.6, 0.7), ramp(mix(a.color, '#17141f', 0.6)), { cap: 2, hi: true }); D.px(20.4, y0 + 2.6, b.hi);
        break;
      }
      case 'lanyard': {
        for (let t = 0; t <= 1.001; t += 0.05) { const q = p(t); D.px(q[0], q[1], rp.base); D.px(q[0] + 0.7, q[1], rp.light); }
        const q = p(1), card = rr(q[0] - 0.2, q[1] + 3.6, 1.6, 3.0, 0.4); flat(P, card, '#f7f2e8'); D.hl(q[0] - 1.6, q[0] + 1.2, q[1] + 1.2, rp.base, 2); D.rect(q[0] - 1.0, q[1] + 3.2, 1.4, 1.8, '#4a3a6a'); edge(card, 0, 1).each((x, y) => P.px(x, y, '#cfc6e4'));
        break;
      }
      case 'medal': { const g = ramp('#e8b923'); for (let t = 0; t <= 1.001; t += 0.06) { const q = p(t); D.px(q[0], q[1], t < 0.5 ? '#e63946' : '#3a5fcd'); D.px(q[0] + 0.7, q[1], t < 0.5 ? '#3a5fcd' : '#e63946'); } const q = p(1), d = ellM(q[0], q[1] + 3.4, 2.4, 2.4); sh(P, d, g, { cap: 3, hi: true }); D.px(q[0] - 0.4, q[1] + 2.8, '#fff7b0'); D.px(q[0], q[1] + 3.4, '#fff3b0'); break; }
    }
  }
  function earsS(X) {
    const a = X.L.acc.ears; if (!a || a.id === 'none_ears') return;
    const P = X.P, S = X.S, oy = SD.oyOf(S), D = new Painter(P).shiftN(0, oy), rp = ramp(a.color), SHM = (m) => m.shiftN(0, oy), ex = 19.7, ey = 20.6;
    switch (a.id) {
      case 'studs': D.px(ex, ey + 2.4, rp.hi); D.px(ex + 0.2, ey + 3.0, rp.base); break;
      case 'iced': D.px(ex, ey + 2.8, '#ffffff'); D.px(ex + 0.2, ey + 3.5, '#bfe9ff'); D.px(ex - 0.9, ey + 2.8, '#e8f8ff'); D.px(ex + 0.9, ey + 2.8, '#e8f8ff'); D.px(ex, ey + 2.0, '#e8f8ff'); D.px(ex, ey + 3.8, '#9ad8ff'); D.add(ex + 1.6, ey + 2.0, '#ffffff', 160); break;
      case 'hoops': { const rg = ellM(ex + 0.2, ey + 5.0, 1.7, 2.3).sub(ellM(ex + 0.2, ey + 5.0, 0.8, 1.3)); sh(P, SHM(rg), rp, { cap: 2, hi: true }); break; }
      case 'dangles': { D.px(ex, ey + 2.4, rp.hi); D.vl(ex, ey + 3, ey + 4.6, rp.base); flat(P, SHM(starM(ex, ey + 6.6, 1.9, 0.6)), '#ffe14d'); D.px(ex, ey + 6.6, '#fff7b0'); break; }
      case 'hpears': {
        const hm = SD.headLocal(S), band = hm.clone().growD(2.6).sub(hm.clone().growD(1.2)).and(polyM([[16.4, 2], [23.2, 2], [23.2, 19], [16.4, 19]]));
        sh(P, SHM(band), rp, { cap: 2, hi: true });
        const cup = rr(ex, ey, 2.7, 3.8, 1.2); sh(P, SHM(cup), rp, { cap: 3, hi: true }); sh(P, SHM(rr(ex + 0.4, ey, 1.6, 2.7, 0.8)), ramp(mix(a.color, '#17141f', 0.55)), { cap: 2, hi: true }); D.px(ex - 0.8, ey - 2.4, rp.hi);
        break;
      }
    }
  }
  function backS(X) {
    const a = X.L.acc.back; if (!a || a.id === 'none_back') return;
    const P = X.P, S = X.S, D = X.D0, y0 = S.hipY - 15, rp = ramp(a.color);
    switch (a.id) {
      case 'cape': {
        const sway = S.pose === 'walkside' ? 1.6 + Math.sin(S.frame * 1.05) * 0.8 : 0.4;
        const m = polyM([[17.6, y0 + 1.4], [22.6, y0 + 1.2], [20.4, y0 + 18], [19, y0 + 31], [8.4 - sway, y0 + 32], [10 - sway, y0 + 18], [13.6, y0 + 6]]).clipY(0, 62);
        sh(P, m, rp, { cap: 5, dither: true });
        m.each((x, y) => { const v = iY(y) - y0; if (Math.abs(((iX(x) + v * 0.4) * 0.7) % 3) < 0.3 && v > 6) P.px(x, y, rp.shade); });
        edge(m, 0, 1).each((x, y) => P.px(x, y, ((x + y) & 1) ? rp.shade : rp.deep));
        break;
      }
      case 'wings': {
        const g = ramp(a.color), flap = S.pose === 'walkside' ? Math.sin(S.frame * 1.05) * 1.4 : 0, wm = M();
        // a fan of feathers sweeping up and back from the shoulder blade
        [[2.75, 15.5], [2.45, 15], [2.15, 13.4], [1.85, 11.4], [1.55, 9]].forEach(([ang, len], i) => { const bx = 17.6, by = y0 + 4.4 + i * 0.5; wm.capsule(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len * -1 * -1 - flap * (i + 1) * 0.3, 1.9, 0.6); });
        wm.or(polyM([[18.4, y0 + 2], [11, y0 - 5 - flap], [5.4, y0 - 2.5 - flap], [4.6, y0 + 2], [10, y0 + 9], [16.4, y0 + 8]])).clipY(0, 62);
        sh(P, wm, g, { cap: 4, hi: true });
        wm.each((x, y) => { if (hash(x, y) < 0.07) P.px(x, y, g.hi); });
        D.line(17.4, y0 + 4.4, 7, y0 - 2 - flap, g.deep); D.line(17.4, y0 + 5.4, 6.2, y0 + 2 - flap, g.deep); D.line(17.4, y0 + 6.4, 6.4, y0 + 6 - flap, g.deep);
        edge(wm, 0, 1).each((x, y) => { if ((x + y) & 1) P.add(x, y + 1, a.color, 120); });
        wm.growD(1.4).each((x, y) => { if (!wm.get(x, y) && ((x + y) & 1) && P.alphaAt(x, y) < 10) P.px(x, y, a.color, 70); });
        break;
      }
      case 'guitar': {
        const g = ramp('#c4642a'), nk = ramp('#6a3b1c'), neck = M().capsule(13, y0 + 12, 6.4, y0 - 5, 1.2, 1.2), hs = M().rect(3.8, y0 - 9.6, 4, 4), body = ellM(13.6, y0 + 17.6, 5, 5.6).or(ellM(14.6, y0 + 12, 3.6, 3.6));
        sh(P, neck, nk, { cap: 2 }); sh(P, hs, ramp('#2a2236'), { cap: 2, hi: true }); sh(P, body, g, { cap: 4, hi: true });
        flat(P, ellM(14.4, y0 + 17.6, 1.7, 1.7), '#120d1f'); for (const [x, y] of [[4.4, y0 - 8.6], [6.6, y0 - 8.6], [4.4, y0 - 6.8], [6.6, y0 - 6.8]]) D.px(x, y, '#e8c050');
        break;
      }
      case 'backpack': {
        const bag = rr(13.0, y0 + 8, 3.6, 7.2, 1.6); sh(P, bag, rp, { cap: 4, hi: true }); edge(bag, 0, -1).each((x, y) => P.px(x, y, rp.light));
        D.vl(11.6, y0 + 3, y0 + 12, rp.shade); D.hl(11.4, 15, y0 + 5.4, rp.deep); D.rect(11.6, y0 + 8.6, 2.6, 2.6, rp.light); D.px(12, y0 + 9, rp.hi);
        break;
      }
    }
  }
  // front straps / bags that sit on the torso
  function backFrontS(X) {
    const a = X.L.acc.back; if (!a) return;
    const P = X.P, S = X.S, D = X.D0, y0 = S.hipY - 15, rp = ramp(a.color);
    if (a.id === 'backpack') { const st = polyM([[18.4, y0 + 1.2], [20.6, y0 + 1.0], [21.6, y0 + 12.6], [19.6, y0 + 12.8]]).and(X.torsoM); sh(P, st, rp, { cap: 2, hi: true }); D.px(20.6, y0 + 12.8, '#cfd3e6'); D.hl(18.8, 21.4, y0 + 6.4, rp.deep); }
    else if (a.id === 'guitar') { D.line(23.4, y0 + 1, 14.4, y0 + 14, '#3a2a1a', Math.max(1, GR.t)); D.line(24.4, y0 + 1, 15.4, y0 + 14, '#5a3a22', 1); }
    else if (a.id === 'crossbody') {
      const strap = polyM([[18.6, y0 + 0.8], [20.8, y0 + 0.4], [25.6, y0 + 14.4], [23.8, y0 + 15.4]]).and(X.torsoM.clone().or(SD.hipsSide(S))); sh(P, strap, rp, { cap: 2, hi: true });
      for (let t = 0.1; t < 0.9; t += 0.18) D.px(19.6 + 5 * t, y0 + 0.8 + 14 * t, rp.deep);
      const bag = rr(23.4, y0 + 17.2, 2.6, 3.0, 0.8); sh(P, bag, rp, { cap: 3, hi: true }); D.hl(20.8, 26, y0 + 15.8, rp.deep); D.px(23.4, y0 + 16.6, '#cfd3e6'); D.px(21.4, y0 + 16.2, '#e8c050'); D.rect(22.2, y0 + 18.4, 2.2, 0.9, rp.shade);
    }
  }
  function wristS(X, sd) {
    const w = X.L.acc.wrist; if (!w || w.id === 'none_wrist') return;
    const P = X.P, S = X.S, a = S.arms[sd], D = X.D0, rp = ramp(w.color), t = 0.82;
    if ((w.id === 'watch' || w.id === 'icedwatch') && sd === 'F') return;
    const wx = a.el[0] + (a.ha[0] - a.el[0]) * t, wy = a.el[1] + (a.ha[1] - a.el[1]) * t;
    let dx = a.ha[0] - a.el[0], dy = a.ha[1] - a.el[1]; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const px = -dy, py = dx, band = (off, len, c, th) => D.line(wx + dx * off - px * len, wy + dy * off - py * len, wx + dx * off + px * len, wy + dy * off + py * len, c, th);
    switch (w.id) {
      case 'wristband': band(-0.6, 1.9, rp.base); band(0.2, 1.9, rp.light); band(0.9, 1.9, rp.shade); break;
      case 'stackedbands': { const cs = [rp.base, '#ffe14d', '#ff4fa3', '#2ee6ff']; for (let i = 0; i < 4; i++) band(-1.6 + i * 1.0, 1.9, cs[i]); break; }
      case 'watch': { band(-0.5, 1.9, '#2a2236'); band(0.4, 1.9, '#3a3050'); const f = rr(wx + px * 1.4, wy + py * 1.4, 1.4, 1.7, 0.6); sh(P, f, ramp('#2a2236'), { cap: 2, hi: true }); D.px(wx + px * 1.4, wy + py * 1.4, rp.hi); break; }
      case 'icedwatch': {
        const gold = ramp('#e8b923'); band(-1.1, 2.1, gold.base); band(0.0, 2.1, gold.light); band(1.0, 2.1, gold.shade);
        const bz = rr(wx + px * 1.6, wy + py * 1.6, 2.0, 2.6, 0.8); sh(P, bz, gold, { cap: 3, hi: true }); const face = rr(wx + px * 1.7, wy + py * 1.7, 1.2, 1.8, 0.4); flat(P, face, '#d8f4ff'); face.each((x, y) => { if (hash(x, y) < 0.4) P.px(x, y, '#ffffff'); }); D.add(wx + px * 3, wy + py * 3 - 1, '#ffffff', 190); D.px(wx + px * 1.7, wy + py * 1.7, '#2a2236');
        break;
      }
      case 'bracelets': { const cs = [rp.base, '#ffe14d', '#ff4fa3']; for (let i = 0; i < 3; i++) band(-1 + i * 1.1, 1.8, i % 2 ? cs[i] : mix(cs[i], '#ffffff', 0.25)); break; }
    }
  }
  function heldS(X) {
    const h = X.L.acc.hand; if (!h || h.id === 'none_hand') return;
    const S = X.S, P = X.P, D = X.D0, a = S.arms.N, hx = a.ha[0], hy = a.ha[1];
    const hand = () => { sh(P, X.B.hand.N, X.K.r, { cap: 3 }); D.px(hx + 0.6, hy - 0.5, X.K.r.light); D.hl(hx - 1, hx + 1, hy + 1, X.K.r.shade, 1); };
    if (h.id === 'boombox') {
      const bx = hx + 1.6, by = hy - 6.4, g = ramp(h.color), box = rr(bx, by + 3, 5.4, 3.6, 0.8); sh(P, box, g, { cap: 3, hi: true });
      for (const sx of [-2.8, 2.8]) { sh(P, ellM(bx + sx, by + 3.2, 1.9, 1.9), ramp('#2a2236'), { cap: 3, hi: true }); flat(P, ellM(bx + sx, by + 3.2, 0.9, 0.9), '#4a4a62'); }
      D.rect(bx - 1.4, by + 1.4, 2.8, 1.6, '#9dff4a'); D.line(bx - 3.4, by - 0.4, bx - 2.2, by - 3, '#cfd3e6'); D.hl(bx - 1.8, bx + 1.8, by - 0.6, g.deep);
      hand(); return;
    }
    const neon = h.id === 'neonmic', gold = h.id === 'goldmic', col = h.color;
    const metal = ramp(gold ? '#e8b923' : '#b8bed4'), mesh = gold ? ramp('#c98f1a') : neon ? ramp(col) : ramp('#5a5a74'), body = neon ? ramp(mix(col, '#17141f', 0.5)) : ramp(gold ? '#a47a10' : '#2a2a3c');
    const mouth = S.mic;
    const bx = mouth ? 29.6 : hx + 0.4, by = mouth ? 26.0 + S.dyB : hy - 4.4, h0 = mouth ? [hx, hy] : [hx, hy + 2.4];
    const handle = M().capsule(bx + (h0[0] - bx) * 0.3, by + (h0[1] - by) * 0.3, h0[0], h0[1], 1.0, 0.85); sh(P, handle, body, { cap: 2, hi: true });
    if (neon) handle.each((x, y) => { if (((x + y) & 3) === 0) P.px(x, y, col); });
    const ball = ellM(bx, by, 1.8, 1.8); sh(P, ball, mesh, { cap: 3, hi: true });
    if (GR.k > 1.8) ball.each((x, y) => { if (((x + y) & 1) === 0 && hash(x, y) < 0.5) P.px(x, y, neon ? mesh.hi : gold ? mesh.deep : '#3a3a52'); });
    flat(P, ellM(bx + (h0[0] - bx) * 0.3, by + (h0[1] - by) * 0.3, 1.4, 0.7), neon ? col : metal.light); D.px(bx - 0.8, by - 0.8, '#ffffff');
    if (neon) for (const [ox, oy] of [[-2.6, 0], [2.6, 0.4], [0, -2.6], [0.6, 2.6]]) D.add(bx + ox, by + oy, col, 90);
    hand();
  }

  /* ---------------------------------------------------------- composition */
  function armS(X, sd) {
    const P = X.P, S = X.S, K = X.K, far = sd === 'F', a = S.arms[sd];
    sh(P, X.B.arm[sd], K.r, { cap: 3 }); sh(P, X.B.hand[sd], K.r, { cap: 3 });
    sleeveS(X, sd);
    if (far) { dim(P, X.B.arm[sd], 0.3); dim(P, X.B.hand[sd], 0.3); }
    else { sh(P, X.B.hand[sd], K.r, { cap: 3 }); X.D0.px(a.ha[0] + 0.6, a.ha[1] - 0.5, K.r.light); }
    wristS(X, sd);
  }
  function legS(X, sd) {
    const P = X.P, S = X.S, K = X.K, far = sd === 'F';
    sh(P, X.B.leg[sd], K.r, { cap: 3 });
    const lm = bottomLegS(X, sd), sm = shoeS(X, sd);
    if (far) { const m = X.B.leg[sd].clone(); if (lm) m.or(lm); if (sm) m.or(sm); dim(P, m, 0.3); }
  }
  function drawSide(L, pose, frame, o) {
    o = o || {};
    const S = SD.skelSide(L.body, pose, frame, { blink: o.blink, mood: o.mood }), K = Kit.skinCols(L.skin), P = new Pix(GR.W, GR.H);
    const X0 = { P, D0: new Painter(P), S, B: SD.bodyMasksS(S), K, L, hairR: Kit.softRamp(L.hair.color), o, side: true };
    X0.D = new Painter(P).shiftN(0, SD.oyOf(S));
    X0.hatId = o.noHat ? 'none' : L.hat.id;
    X0.hatInfo = { zone: null };
    const X_ = X0;
    // 1. behind the body
    if (!o.noBack) backS(X_);
    SD.hairBackS(X_); hatBackS(X_);
    armS(X_, 'F');
    legS(X_, 'F'); legS(X_, 'N');
    // 2. torso
    const tm = X_.B.torso.clone().or(SD.hipsSide(S)); X_.torsoM = tm; sh(P, tm, K.r, { cap: 4 });
    hipsS(X_); topS(X_); neckS(X_); if (!o.noBack) backFrontS(X_);
    // 3. head
    SD.drawHeadSkinS(P, S, L, K); SD.shadowS(X_, hatMaskS(X_));
    SD.drawNoseS(P, S, K); SD.drawMarksS(P, S, L, K); SD.drawFacialS(P, S, L, X_.hairR); SD.drawEyeS(P, S, L, K); SD.drawMouthS(P, S, L, K); SD.drawBrowS(P, S, L, X_.hairR, K);
    SD.hairFrontS(X_); hatS(X_); glassesS(X_); earsS(X_);
    // 4. near arm over everything
    armS(X_, 'N'); heldS(X_);
    // centre the torso on the sprite's mirror axis so a flipped (left-facing) sprite keeps the same feet position
    const Q = new Pix(GR.W, GR.H); Q.blit(P, 1, 0);
    Q.outline((c) => o.outline(c));
    return { pix: Q, S };
  }

  Object.assign(BBH.CharsSide, { drawSide, HATP, TOPSPEC, BOTS, hatBuild });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsSide;
})(typeof globalThis !== 'undefined' ? globalThis : this);
