// BEATBOX HEROES -- chars_gear.js
// Part 3 of the character renderer: tops, bottoms, shoes and the arms (skin + sleeves + hands).
// Clothes are coloured regions built from the SAME masks as the body (torso, arm capsules, leg capsules), so every
// garment fits every body type and every pose automatically. Glasses and accessories live in chars_acc.js.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
  }
  const { PAL, mix } = BBH;
  const Kit = BBH.CharsKit, { CX, T0, M, shade, flat, darkenAt, ring, edge, GR, iX, iY, nx, ny, Painter } = Kit;
  const ramp = (c) => Kit.softRamp(c);
  const rpOf = (c) => ramp(c);
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000; };

  /* ----------------------------------------------------------------- tops */
  // hem: last torso row (0..16, row 0 is y=29); sl: sleeve end along the arm (0 none .. 1 wrist); k: sleeve widening
  const TOPS = {
    tee: { hem: 14, sl: 0.42, k: 0.2 }, tank: { hem: 14, sl: 0, k: 0 }, hoodie: { hem: 16, sl: 1, k: 0.35 }, croptop: { hem: 9, sl: 0.4, k: 0.15 },
    sweater: { hem: 16, sl: 1, k: 0.3 }, flannel: { hem: 15, sl: 1, k: 0.2 }, dress: { hem: 16, sl: 0, k: 0 }, jacket: { hem: 15, sl: 1, k: 0.3 },
    varsity: { hem: 15, sl: 1, k: 0.3 }, tracktop: { hem: 15, sl: 1, k: 0.25 }, puffer: { hem: 16, sl: 1, k: 0.9, bulk: 1 }, hawaiian: { hem: 15, sl: 0.42, k: 0.25 },
    overalls: { hem: 16, sl: 0.4, k: 0.2 }, turtleneck: { hem: 15, sl: 1, k: 0.1 }, kimono: { hem: 16, sl: 0.8, k: 1.1, bulk: 1 }, tux: { hem: 16, sl: 1, k: 0.25 },
    poncho: { hem: 15, sl: 0.7, k: 1.3, bulk: 1 }, bbhtee: { hem: 14, sl: 0.42, k: 0.2 }, stagesuit: { hem: 16, sl: 1, k: 0.2 }, champ: { hem: 16, sl: 1, k: 0.7, bulk: 1 },
    oversized: { hem: 16, sl: 0.62, k: 0.95, bulk: 1 }, hoodiebig: { hem: 16, sl: 1, k: 1.05, bulk: 1 }, jersey: { hem: 15, sl: 0, k: 0 },
    bomber: { hem: 15, sl: 1, k: 0.4 }, denimjacket: { hem: 15, sl: 1, k: 0.3 }, windbreaker: { hem: 15, sl: 1, k: 0.35 }, puffvest: { hem: 15, sl: 1, k: 0.12 },
  };
  const NECK = { tee: 'crew', tank: 'scoop', hoodie: 'crew', croptop: 'crew', sweater: 'crew', flannel: 'v', dress: 'scoop', jacket: 'v', varsity: 'crew', tracktop: 'high', puffer: 'high', hawaiian: 'v', overalls: 'crew', turtleneck: 'high', kimono: 'v', tux: 'v', poncho: 'crew', bbhtee: 'crew', stagesuit: 'v', champ: 'v', oversized: 'crew', hoodiebig: 'crew', jersey: 'v', bomber: 'high', denimjacket: 'v', windbreaker: 'high', puffvest: 'high' };
  const sleeveColor = (X, id) => (id === 'varsity' || id === 'overalls' || id === 'puffvest' ? X.L.top.color2 : X.L.top.color);

  function torsoRegion(X, spec) {
    const S = X.S, m = X.torsoM.clone();
    m.clipY(S.dy + T0, S.dy + T0 + spec.hem);
    if (spec.bulk) { const g = m.growD(spec.bulk > 1 ? 1.5 : 1); m.or(g); m.clipY(S.dy + T0 + 1, S.dy + T0 + spec.hem); }
    return m;
  }

  // tiny 3x5 digits for the jersey number
  const DIGITS = { 2: ['111', '001', '111', '100', '111'], 3: ['111', '001', '111', '001', '111'], 7: ['111', '001', '010', '010', '010'], 0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 8: ['111', '101', '111', '101', '111'] };
  function drawNumber(P, D, str, cx, y, col, outline) {
    const cs = Math.max(1, Math.round(GR.k * 0.8)), gw = 3 * cs + cs, W = str.length * gw - cs;
    const x0 = Math.round(Kit.X(cx)) + D.ox - Math.floor(W / 2), y0 = Math.round(Kit.Y(y)) + D.oy;
    for (let pass = 0; pass < 2; pass++) for (let n = 0; n < str.length; n++) {
      const g = DIGITS[str[n]]; if (!g) continue;
      for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j][i] === '1') {
        const bx = x0 + n * gw + i * cs, by = y0 + j * cs;
        if (pass === 0) { P.rect(bx - 1, by - 1, cs + 2, cs + 2, outline); } else P.rect(bx, by, cs, cs, col);
      }
    }
  }

  function top(X) {
    const L = X.L, id = L.top.id, spec = TOPS[id]; if (!spec) return;
    const P = X.P, D = X.D, S = X.S, rp = rpOf(L.top.color), r2 = rpOf(L.top.color2), cx = CX + S.tx, y0 = T0 + S.dy;
    const tp = (dx, row, c) => D.px(cx + dx, y0 + row, c);
    const th = (a, b, row, c, w) => D.hl(cx + a, cx + b, y0 + row, c, w);
    const tv = (dx, a, b, c) => D.vl(cx + dx, y0 + a, y0 + b, c);
    const tl = (a, b, c, d, col) => D.line(cx + a, y0 + b, cx + c, y0 + d, col);
    const body = torsoRegion(X, spec), hw = S.G.neck, nk = NECK[id];
    // long garments extend over the hips
    const ext = { oversized: [8.8, 9.2, 9.4, 9.5, 9.6, 9.6], hoodiebig: [8.8, 9.3, 9.6, 9.8, 9.9, 9.9, 9.9], dress: [], champ: [7.5, 8, 8.5, 9, 9.5, 10, 10.5], kimono: [7.5, 8] }[id];
    let skirt = null;
    if (id === 'dress') { skirt = M().rows(y0 + 11, [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11], cx); body.or(skirt); }
    else if (ext) body.or(M().rows(y0 + 17, ext, cx));
    if (id === 'poncho') body.or(M().rows(y0 + 6, [8, 9, 10, 10.5, 11, 11.5, 12, 12.5, 12.5], cx));
    // neckline
    let neckOpen = M();
    if (nk === 'crew') neckOpen = M().ellipse(cx, y0 + 0.1, hw + 0.9, 1.9).or(M().rect(cx - hw - 0.5, y0 - 1, hw * 2 + 1, 2));
    else if (nk === 'scoop') neckOpen = M().ellipse(cx, y0 + 0.4, hw + 1.6, 3.4).or(M().rect(cx - hw - 1, y0 - 1, hw * 2 + 2, 2));
    else if (nk === 'v') neckOpen = M().poly([[cx - hw - 1, y0 - 1.5], [cx + hw + 1, y0 - 1.5], [cx + hw * 0.55, y0 + 1.4], [cx, y0 + 4.8], [cx - hw * 0.55, y0 + 1.4]]);
    else neckOpen = M().rect(cx - hw - 0.5, y0 - 1, hw * 2 + 1, 1);
    if (nk === 'high') body.or(M().rows(y0 - 1, [hw + 1, hw + 1, hw + 1], cx));
    body.sub(neckOpen);
    shade(P, body, rp, { cap: 4, dither: id === 'puffer' || id === 'puffvest' });
    // collar rim: the edge of the neckline, in the garment's lighter tone
    const collar = ring(neckOpen, body);
    const hemEdge = () => { const e = M(); body.each((x, y) => { if (!body.get(x, y + 1) && y > ny(y0 + 8)) e.set(x, y); }); return e; };
    const sideEdge = (dxn) => { const e = M(); body.each((x, y) => { if (!body.get(x + dxn, y) && y > ny(y0 + 2)) e.set(x, y); }); return e; };
    const hemLine = (c) => hemEdge().each((x, y) => P.px(x, y, c));
    const putM = (m, c) => m.each((x, y) => P.px(x, y, c));
    const folds = (c, rows) => { for (const r of rows) { tl(-5.5, r, -2.5, r + 1.2, c); tl(5.5, r + 0.3, 2.5, r + 1.4, c); } };
    const bodyEach = (fn) => body.each((x, y) => fn(x, y, (iX(x) - cx), (iY(y) - y0)));
    // sheen: light band down the left shoulder
    const sheen = () => { for (let r = 1.2; r < 8; r += 0.6) D.px(cx - 6.4 + r * 0.25, y0 + r, rp.hi); };
    switch (id) {
      case 'tee': case 'bbhtee': {
        putM(collar, rp.light); th(-4, 4, 1.4, rp.light, 1);
        hemLine(rp.shade); folds(rp.shade, [8]); tl(-6.5, 11, -4, 13.4, rp.shade);
        if (id === 'bbhtee') { const lt = { B: ['110', '101', '110', '101', '110'], H: ['101', '101', '111', '101', '101'] }; ['B', 'B', 'H'].forEach((ch, i) => lt[ch].forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === '1') D.rect(cx - 5.5 + i * 4 + k, y0 + 5 + j, 1, 1, L.top.color2); })); }
        break;
      }
      case 'oversized': {
        putM(collar, rp.light); th(-4.5, 4.5, 1.6, rp.light, 1); th(-4.5, 4.5, 2.4, rp.shade, 1);
        // drop shoulder seam, side vent, wrinkles
        tl(-8.4, 2.4, -7.6, 8.4, rp.shade); tl(8.4, 2.4, 7.6, 8.4, rp.shade);
        tl(-7, 12, -3, 14.6, rp.shade); tl(7, 11, 2, 15.2, rp.shade); tl(-6.4, 17.4, -2, 19.2, rp.shade); tl(6.5, 18, 3, 20, rp.shade);
        tv(-9, 18.5, 22.4, rp.deep); tv(9, 18.5, 22.4, rp.deep);
        // bold graphic: a lightning bolt with a drop shadow and speed stripes, no text
        const bolt = M().poly([[cx + 1.6, y0 + 10.4], [cx + 3.8, y0 + 10.4], [cx + 1.6, y0 + 14.2], [cx + 4.0, y0 + 14.2], [cx - 2.4, y0 + 20.0], [cx - 0.4, y0 + 15.4], [cx - 3.0, y0 + 15.4]]);
        const bsh = bolt.shiftN(Math.max(1, Math.round(GR.k * 0.9)), Math.max(1, Math.round(GR.k * 0.9))).sub(bolt);
        putM(bsh.and(body), rp.deep); shade(P, bolt, r2, { cap: 3, hi: true });
        putM(edge(bolt, -1, 0).and(bolt), r2.hi);
        th(-8, -4.6, 12.4, L.top.color2, 1); th(-8.4, -5.6, 13.8, r2.shade, 1); th(4.8, 8, 12.4, L.top.color2, 1); th(5.8, 8.4, 13.8, r2.shade, 1);
        hemLine(rp.deep);
        break;
      }
      case 'tank': { putM(collar, rp.light); th(-3.6, 3.6, 1.6, rp.light, 1); hemLine(rp.shade); folds(rp.shade, [8]); break; }
      case 'jersey': {
        // basketball jersey: V-neck trim, armhole trim, number, mesh texture, side panels
        const arm = M(); for (const s of [-1, 1]) arm.or(M().ellipse(cx + s * 9.2, y0 + 3.2, 3.2, 6.4)); arm.and(body);
        // armholes cut deeper: skin shows
        const ah = M(); for (const s of [-1, 1]) ah.or(M().ellipse(cx + s * 9.6, y0 + 3.0, 2.6, 6.6)); body.sub(ah);
        // re-shade (cheap): repaint body only on the cut edge with trim
        for (const s of [-1, 1]) { const tr = ring(ah, body); putM(tr, r2.base); }
        putM(collar, r2.base); putM(ring(neckOpen.clone().or(M().rect(cx - hw - 1.4, y0 - 1.5, 2 * hw + 2.8, 3)), body).sub(collar), r2.light);
        bodyEach((x, y, u, v) => { if (v > 2 && (Math.floor(v * 1.05) % 2 === 0) && (x & 1)) P.px(x, y, rp.shade); });
        for (const s of [-1, 1]) { tv(s * 6.8, 4, 15, r2.base); tv(s * 6.8 - s * 0.9, 4, 15, r2.shade); }
        drawNumber(P, D, '23', cx, y0 + 5.3, L.top.color2, rp.deep);
        th(-6.5, 6.5, 14.6, r2.base, 1); hemLine(r2.base);
        break;
      }
      case 'hoodie': case 'hoodiebig': {
        const big = id === 'hoodiebig';
        // hood bunched around the neck, drawstrings, kangaroo pocket
        putM(collar, rp.light);
        const hoodRing = ring(neckOpen.clone().growD(1.2), body).sub(collar); putM(hoodRing, rp.base);
        th(-4.8, 4.8, 0.6, rp.shade, 1); th(-5.4, 5.4, 1.5, rp.hi, 1);
        for (const s of [-1, 1]) { tp(s * 5.6, 1, rp.base); tv(s * 5.6, 0.4, 2.4, rp.shade); }
        for (const s of [-1, 1]) { tv(s * 1.7, 2.4, big ? 8.4 : 6.4, r2.light); tv(s * 1.7 + s * 0.4, 2.4, big ? 8.2 : 6.2, r2.shade); tp(s * 1.7, (big ? 8.9 : 6.9), '#e8c050'); tp(s * 1.7, (big ? 9.6 : 7.6), '#b8984a'); }
        // pocket
        const pk = M().poly([[cx - 6.6, y0 + 9], [cx + 6.6, y0 + 9], [cx + 7.4, y0 + 15.2], [cx - 7.4, y0 + 15.2]]); const pe = edge(pk, 0, -1);
        putM(pe.and(body), rp.hi); tl(-6.6, 9, -7.4, 15.2, rp.shade); tl(6.6, 9, 7.4, 15.2, rp.shade);
        tl(-2, 10, -4, 12, rp.shade); tl(2, 10, 4, 12, rp.shade);
        hemEdge().each((x, y) => P.px(x, y, rp.light)); th(-7, 7, 15.4, rp.shade, 1);
        folds(rp.shade, big ? [5.4, 7.6] : [6]);
        if (big) { tl(-8, 17.5, -5, 19.4, rp.shade); tl(8, 17.5, 5, 19.4, rp.shade); }
        break;
      }
      case 'croptop': { putM(collar, rp.light); th(-4, 4, 1.4, rp.light, 1); hemLine(r2.base); th(-4.8, 4.8, 9, r2.light, 1); folds(rp.shade, [5]); break; }
      case 'sweater': {
        bodyEach((x, y, u, v) => { if (v > 2.2 && v < 14 && (Math.floor((u + 40) * 1.25) % 2 === 0) && ((Math.floor(v * 1.1) + Math.floor(u)) & 1)) P.px(x, y, rp.shade); });
        putM(collar, rp.light); th(-4.8, 4.8, 1.6, rp.hi, 1); th(-5, 5, 0.6, rp.light, 1);
        th(-6.8, 6.8, 15, rp.light, 1); th(-6.8, 6.8, 16, rp.shade, 1); for (let x = -6.6; x <= 6.6; x += 1.3) tv(x, 15, 16.5, rp.deep);
        th(-7.6, 7.6, 7.2, L.top.color2, 1); th(-7.6, 7.6, 8.4, r2.light, 1);
        folds(rp.shade, [10]);
        break;
      }
      case 'flannel': {
        bodyEach((x, y, u, v) => { if (v > 2.4) { const a = ((Math.floor(u * 1.0) % 4) + 4) % 4, b = Math.floor(v) % 4; if (a === 0) P.px(x, y, r2.base); if (b === 0) P.px(x, y, r2.shade); if (a === 0 && b === 0) P.px(x, y, r2.deep); if (a === 2 && b === 2) P.px(x, y, r2.light); } });
        putM(collar, rp.hi); tl(-3.6, 1.4, -1.4, 3.8, rp.hi); tl(3.6, 1.4, 1.4, 3.8, rp.hi);
        tv(-0.5, 4.6, 15, rp.deep); tv(0.5, 4.6, 15, rp.light); for (const r of [6, 9, 12]) tp(0.5, r, '#fff0c9');
        th(-0.5, 0.5, 1.8, '#f7f2e8', 1); th(-0.6, 0.6, 2.8, '#cfc6e4', 1);
        hemLine(rp.shade); folds(rp.shade, [8]);
        break;
      }
      case 'dress': {
        putM(collar, rp.light);
        for (const s of [-1, 1]) { tv(s * 3.6, 0.6, 2.8, rp.light); }
        th(-6.5, 6.5, 10, r2.base, 1); th(-6.5, 6.5, 11, r2.light, 1); tp(0, 10.5, r2.hi);
        skirt.each((x, y) => { const u = iX(x) - cx; if (Math.abs(((u * 0.9) % 3)) < 0.45 && iY(y) > y0 + 12) P.px(x, y, rp.shade); });
        edge(skirt, 0, 1).each((x, y) => P.px(x, y, ((x + y) & 1) ? r2.light : r2.base));
        for (const [dx, r] of [[-4.5, 14], [3.5, 15], [-1.5, 17], [5.5, 18], [-6.5, 18], [0.5, 20]]) { tp(dx, r, r2.hi); tp(dx + 1, r, r2.light); tp(dx, r + 1, r2.light); tp(dx - 1, r, r2.light); tp(dx, r - 1, r2.light); }
        break;
      }
      case 'jacket': {
        putM(collar, rp.hi); tl(-3.4, 1.2, -1.2, 3.8, rp.hi); tl(3.4, 1.2, 1.2, 4.2, rp.hi);
        for (let r = 1.4; r <= 4.6; r += 0.6) { tp(-0.5 - (4.6 - r) * 0.5, r, r2.base); }
        tv(0.5, 4.6, 15, rp.deep); tv(-0.5, 4.6, 15, rp.hi);
        for (let r = 5; r < 15; r += 1.8) tp(1.4, r, '#cfd3e6'); tp(1.4, 14.6, '#ffffff');
        for (let r = 1.4; r < 6.6; r += 0.7) tp(-6.4 + r * 0.25, r, rp.hi);
        th(-7, -3.6, 3.2, rp.hi, 1); tl(-7, 3.2, -6, 8.8, rp.light);
        th(-5.6, -3.2, 11, '#cfd3e6', 1); tl(5.6, 11, 3.4, 11, rp.light); tp(3.4, 11, '#cfd3e6');
        tl(-6.4, 7.4, -3.5, 9.4, rp.shade); tl(6.4, 7.4, 3.5, 9.4, rp.shade);
        th(-7, 7, 15, rp.shade, 1); hemLine(rp.deep);
        break;
      }
      case 'bomber': {
        // satin sheen, ribbed collar / hem with stripes, zip, sleeve patch
        for (let r = 0; r < 14; r += 0.55) { tp(-5.4 + r * 0.55, r + 1, rp.hi); if (r > 3) tp(-3.0 + r * 0.4, r + 1, rp.light); }
        putM(collar, r2.base); putM(ring(neckOpen.clone().growD(1.2), body).sub(collar), r2.light);
        tv(0, 2, 14.4, rp.deep); tv(0.9, 2, 14.4, rp.hi); for (let r = 3; r < 14; r += 1.6) tp(0, r, '#cfd3e6'); tp(0.4, 3, '#ffffff');
        th(-7.4, 7.4, 14.4, r2.base, 2); th(-7.4, 7.4, 15.6, r2.light, 1); for (let x = -7; x <= 7; x += 1.3) tv(x, 14.4, 16, r2.shade);
        th(-7.2, 7.2, 13.7, '#ffffff', 1);
        tl(-6, 7.8, -3.4, 10.4, rp.shade); tl(6, 7.4, 3.6, 10.2, rp.shade);
        break;
      }
      case 'denimjacket': {
        // denim: faded dither, contrast stitching, flap pockets, button placket, pointed collar
        bodyEach((x, y, u, v) => { if (hash(x, y) < 0.16) P.px(x, y, rp.light); else if (hash(y, x + 9) < 0.09) P.px(x, y, rp.shade); });
        const st = '#ffb454';
        putM(collar, rp.hi); tl(-4, 1.2, -1.2, 4.0, rp.hi); tl(4, 1.2, 1.2, 4.0, rp.hi); tl(-4.4, 1.6, -1.6, 4.2, st);
        tv(-0.5, 4.2, 15, rp.deep); tv(0.5, 4.2, 15, rp.light); for (const r of [5.6, 8.6, 11.6]) { tp(0, r, '#e8c050'); }
        for (const s of [-1, 1]) { const px0 = s * 4.2; th(px0 - 1.8, px0 + 1.8, 6.2, rp.deep, 1); th(px0 - 1.8, px0 + 1.8, 8.4, st, 1); tv(px0 - 1.8, 6.2, 8.4, st); tv(px0 + 1.8, 6.2, 8.4, st); tp(px0, 7.2, '#e8c050'); }
        tl(-7, 3, -3.8, 5.4, st); tl(7, 3, 3.8, 5.4, st);
        th(-7, 7, 14, st, 1); th(-7, 7, 15, rp.deep, 1); tv(-7, 4, 14, st); tv(7, 4, 14, st);
        for (const s of [-1, 1]) { th(s * 3.4, s * 6.2, 11.4, rp.shade, 1); }
        break;
      }
      case 'windbreaker': {
        // colour-block: accent shoulders yoke, side stripes, high collar, zip, elastic hem
        const yoke = body.clone().clipY(y0, y0 + 6.4); flat(P, yoke, L.top.color2);
        yoke.each((x, y) => { const u = (iX(x) - cx), v = iY(y) - y0; if (u + 7 + v * 0.2 < 0.01 * 0 || false) { } });
        shade(P, yoke, r2, { cap: 4 });
        th(-8, 8, 6.4, rp.deep, 1); th(-8, 8, 7.4, '#ffffff', 1);
        for (const s of [-1, 1]) { tv(s * 6.4, 7.6, 15, r2.base); tv(s * 6.4 - s * 0.9, 7.6, 15, '#ffffff'); }
        putM(collar, rp.light); putM(ring(neckOpen.clone().growD(1.0), body).sub(collar), rp.base);
        tv(0, 1.6, 15, rp.deep); tv(0.9, 1.6, 15, rp.hi); tp(0.4, 2.6, '#ffffff');
        th(-7.4, 7.4, 15.4, r2.base, 1); th(-7.4, 7.4, 14.4, rp.shade, 1);
        for (let r = 8; r < 15; r += 2) tl(2, r, 4, r + 0.6, rp.shade);
        folds(rp.shade, [9]);
        break;
      }
      case 'puffvest': {
        // quilted vest over a long-sleeve (the sleeves use the accent colour)
        const bands = [4.2, 8.0, 11.8, 15.4];
        for (const r of bands) { bodyEach((x, y, u, v) => { if (Math.abs(v - r) < 0.45) P.px(x, y, rp.deep); else if (Math.abs(v - (r - 1.0)) < 0.45 && ((x + y) & 1) === 0) P.px(x, y, rp.light); }); }
        bodyEach((x, y, u, v) => { if (Math.abs(u) < 0.5 && v > 1.5) P.px(x, y, rp.deep); });
        putM(collar, rp.light); putM(ring(neckOpen.clone().growD(1.2), body).sub(collar), rp.base);
        tp(0.4, 2.5, '#ffffff'); tp(0.4, 3.4, '#cfd3e6');
        for (const s of [-1, 1]) { putM(sideEdge(s).and(body), rp.shade); }
        hemEdge().each((x, y) => P.px(x, y, rp.deep));
        break;
      }
      case 'varsity': {
        putM(collar, r2.base); th(-4.5, 4.5, 0.6, r2.light, 1);
        tv(-0.5, 3, 14, rp.deep); tv(0.5, 3, 14, rp.light); for (const r of [5, 8, 11]) tp(0.5, r, '#fff0c9');
        th(-7, 7, 15, r2.base, 1); th(-7, 7, 14, '#ffffff', 1);
        const bmap = ['110', '101', '110', '101', '110']; bmap.forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === '1') D.rect(cx - 6 + k, y0 + 5 + j, 1, 1, '#f7f2e8'); });
        tp(-6.6, 4, r2.hi); folds(rp.shade, [8]);
        break;
      }
      case 'tracktop': {
        putM(collar, rp.light); putM(ring(neckOpen.clone().growD(1.0), body).sub(collar), rp.base);
        tv(-0.5, 1, 15, rp.deep); tv(0.5, 1, 15, rp.hi); tp(0.5, 2.4, '#ffffff'); tp(0.5, 3.6, '#cfd3e6');
        for (const s of [-1, 1]) { tv(s * 6.6, 1.6, 15, r2.base); tv(s * 5.8, 1.6, 15, r2.light); }
        th(-6.8, 6.8, 15, rp.shade, 1); hemLine(rp.shade); folds(rp.shade, [9]);
        break;
      }
      case 'puffer': {
        for (const r of [4, 8, 12, 16]) { bodyEach((x, y, u, v) => { if (Math.abs(v - r) < 0.45) P.px(x, y, rp.deep); else if (Math.abs(v - (r - 1)) < 0.4 && ((x + y) & 1) === 0) P.px(x, y, rp.light); }); }
        putM(collar, rp.light); putM(ring(neckOpen.clone().growD(1.4), body).sub(collar), rp.shade);
        tv(-0.5, 2, 15.5, rp.deep); tv(0.5, 2, 15.5, rp.hi); tp(0.5, 2.6, '#ffffff'); tp(0.5, 3.6, '#cfd3e6');
        break;
      }
      case 'hawaiian': {
        tl(-3.6, 1.2, -1.2, 3.8, rp.hi); tl(3.6, 1.2, 1.2, 3.8, rp.hi); putM(collar, rp.hi);
        tv(-0.5, 4, 15, rp.deep); tv(0.5, 4, 15, rp.light);
        const fl = [[-5.5, 5], [4.5, 6], [-3.5, 9], [3.5, 11], [-6.5, 12], [6.5, 13], [-2.5, 14], [1.5, 7]];
        fl.forEach(([dx, r], i) => { for (const [ox, oy] of [[0, 0], [-1.1, 0], [1.1, 0], [0, -1.1], [0, 1.1]]) tp(dx + ox, r + oy, ox === 0 && oy === 0 ? r2.hi : r2.light); tp(dx + (i % 2 ? 1.6 : -1.6), r + 1.4, '#3f9b5a'); tp(dx + (i % 2 ? 2.4 : -2.4), r + 2.0, '#2c7a42'); });
        hemLine(rp.shade); folds(rp.shade, [8]);
        break;
      }
      case 'overalls': {
        const inner = body.clone(); shade(P, inner, r2, { cap: 4 }); putM(collar, r2.light);
        const bib = M().rows(y0 + 5, [5, 5.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5], cx); shade(P, bib, rp, { cap: 4 });
        for (const s of [-1, 1]) { tv(s * 4.6, 1, 5.4, rp.base); tv(s * 3.6, 1, 5.4, rp.light); tp(s * 4.1, 5.6, '#e8c050'); tp(s * 4.1, 6.2, '#b8984a'); }
        th(-2.6, 2.6, 8.2, rp.deep, 1); th(-2.6, 2.6, 12, rp.shade, 1); tv(-2.6, 8.2, 12, rp.shade); tv(2.6, 8.2, 12, rp.shade);
        th(-5.2, 5.2, 5.6, rp.light, 1); for (let x = -5; x <= 5; x += 1.2) tp(x, 5.1, rp.shade);
        th(-7, 7, 16, rp.shade, 1);
        break;
      }
      case 'turtleneck': {
        const roll = M().rows(y0 - 1, [hw + 1.3, hw + 1.5, hw + 1.5], cx); shade(P, roll, rp, { cap: 3, hi: true });
        for (let x = -3.5; x <= 3.5; x += 1.4) tv(x, -1, 1.4, rp.shade); th(-4.5, 4.5, 1.7, rp.deep, 1);
        bodyEach((x, y, u, v) => { if (v > 2.6 && (Math.floor((u + 40) * 1.1) % 3 === 0) && ((y & 3) < 2)) P.px(x, y, rp.shade); });
        hemLine(rp.shade); folds(rp.shade, [9]);
        break;
      }
      case 'kimono': {
        tl(-3.6, 1.2, 1.2, 7.6, r2.base); tl(-2.8, 1.2, 2.0, 7.6, r2.light); tl(3.6, 1.2, 0, 8.6, r2.light); tl(2.8, 1.2, -0.8, 8.6, r2.base);
        tv(-0.5, 8.6, 20, r2.base); tv(0.5, 8.6, 20, r2.light);
        th(-7.6, 7.6, 9, r2.base, 2); th(-7.6, 7.6, 10.3, r2.light, 1); th(-7.6, 7.6, 11.3, r2.shade, 1); tp(0.5, 10, r2.hi);
        edge(body, 0, 1).and(M().clipY(0, 99)).each((x, y) => { if (iY(y) > y0 + 14) P.px(x, y, r2.base); });
        for (const [dx, r] of [[-5.5, 5], [5.5, 6], [-4.5, 14], [4.5, 15], [-6, 18]]) { tp(dx, r, '#fff0c9'); tp(dx + 1, r + 1, '#fff0c9'); tp(dx + 0.3, r + 2, '#fff0c9'); }
        break;
      }
      case 'tux': {
        const sh = M().poly([[cx - 3.6, y0 + 1], [cx + 3.6, y0 + 1], [cx + 1.4, y0 + 12.6], [cx - 1.4, y0 + 12.6]]).and(body); shade(P, sh, rpOf('#f7f2e8'), { cap: 3 });
        const sat = rpOf(mix(L.top.color, '#ffffff', 0.18)); tl(-3.8, 1.2, -0.6, 8.6, sat.light); tl(3.8, 1.2, 0.6, 8.6, sat.light); tl(-4.5, 1.2, -1.2, 8.6, sat.hi);
        th(-0.5, 0.5, 2.2, r2.base, 1); th(-0.4, 0.4, 3.2, r2.deep, 1); tp(0, 4.4, r2.deep); tp(0, 5.4, r2.deep);
        tp(3.6, 8, '#fff'); tp(4.6, 8.2, '#e84a6a'); tp(0, 11, '#2c2a3a'); tp(0, 13, '#2c2a3a');
        th(-7, 7, 16, rp.shade, 1);
        break;
      }
      case 'poncho': {
        putM(collar, rp.light);
        bodyEach((x, y, u, v) => { if (v >= 6 && (Math.abs(v - 8.5) < 0.7 || Math.abs(v - 13) < 0.6)) P.px(x, y, r2.base); if (Math.abs(v - 11) < 0.45 && ((x + y) & 1)) P.px(x, y, r2.light); });
        edge(body, 0, 1).each((x, y) => { if (iY(y) > y0 + 12) P.px(x, y, ((x + y) & 1) ? r2.base : rp.shade); });
        for (let x = -12; x <= 12; x += 1.6) tv(x, 15, 16.2, r2.light);
        break;
      }
      case 'stagesuit': {
        for (const s of [-1, 1]) { tv(s * 6.6, 2, 15, r2.hi); tv(s * 6.6 - s, 2, 15, r2.base); }
        tl(-3.6, 1.2, -1.2, 5, r2.base); tl(3.6, 1.2, 1.2, 5, r2.base); putM(collar, r2.light);
        th(-6.8, 6.8, 11, r2.base, 1); th(-6.8, 6.8, 12, r2.light, 1); D.rect(cx - 1.3, y0 + 10.4, 2.6, 2.6, '#ffe14d'); tp(-0.4, 11.2, '#fff7b0');
        bodyEach((x, y, u, v) => { if (v > 1.5 && hash(x * 3, y * 7) < 0.045) P.px(x, y, '#ffffff'); });
        tp(-6.6, 1, rp.hi); tp(-5.6, 1, rp.hi);
        break;
      }
      case 'champ': {
        for (let r = 1; r <= 24; r += 0.5) { tp(-0.5, r, r2.base); tp(0.5, r, r2.light); if (r > 2) { tp(-1.5, r, r2.shade); tp(1.5, r, r2.shade); } }
        for (let x = -6.6; x <= 6.6; x += 0.7) { const f = (Math.floor(x * 2) & 1) ? '#ffffff' : '#e6dff2'; tp(x, 1.2, f); tp(x, 2.0, ((x * 3) & 1) ? '#e6dff2' : '#cfc6e4'); tp(x, 2.8, ((x * 2) & 1) ? '#ffffff' : '#cfc6e4'); }
        th(-8, 8, 11, r2.base, 1); th(-8, 8, 12, r2.light, 1); tp(0, 11.4, '#fff3b0');
        edge(body, 0, 1).each((x, y) => { if (iY(y) > y0 + 13) P.px(x, y, r2.base); });
        for (const [dx, r] of [[-4.5, 16], [4.5, 18], [-5.5, 21], [5.5, 22]]) tp(dx, r, r2.hi);
        break;
      }
    }
  }

  // sleeves + cuffs, drawn with the arm
  function sleeve(X, side) {
    const L = X.L, id = L.top.id, spec = TOPS[id]; if (!spec || spec.sl <= 0) return;
    const S = X.S, P = X.P, G = S.G, D = X.D, col = sleeveColor(X, id), rp = rpOf(col), r2 = rpOf(L.top.color2);
    const full = Kit.armMask(S.arms[side], G, 0, 1, spec.k), part = Kit.armMask(S.arms[side], G, 0, spec.sl, spec.k), a = S.arms[side];
    shade(P, part, rp, { cap: 3, ctx: full });
    const endT = spec.sl;
    const ex = endT >= 1 ? a.ha[0] : (endT < 0.5 ? a.sh[0] + (a.el[0] - a.sh[0]) * endT * 2 : a.el[0] + (a.ha[0] - a.el[0]) * (endT * 2 - 1));
    const ey = endT >= 1 ? a.ha[1] : (endT < 0.5 ? a.sh[1] + (a.el[1] - a.sh[1]) * endT * 2 : a.el[1] + (a.ha[1] - a.el[1]) * (endT * 2 - 1));
    const hoodie = ['hoodie', 'hoodiebig', 'sweater', 'tracktop', 'puffer'].indexOf(id) >= 0;
    const cuffCol = id === 'varsity' ? '#ffffff' : id === 'bomber' || id === 'windbreaker' ? r2.base : hoodie ? rp.light : id === 'kimono' || id === 'champ' ? r2.base : id === 'denimjacket' ? '#ffb454' : rp.shade;
    // cuff band: the part of the sleeve closest to its end
    const cr = (id === 'oversized' || id === 'tee' || id === 'bbhtee' || id === 'hawaiian') ? 1.4 : 2.0 + (spec.k > 0.9 ? 0.4 : 0);
    part.each((x, y) => {
      const dd = Math.hypot(iX(x) - ex, iY(y) - ey);
      if (dd < cr && endT >= 0.4) P.px(x, y, ((id === 'bomber' || id === 'hoodie' || id === 'hoodiebig' || id === 'sweater') && ((x + y) & 1)) ? rp.shade : cuffCol);
      else if (dd < cr + 0.9 && dd >= cr && endT >= 0.4 && (id === 'bomber' || id === 'varsity')) P.px(x, y, id === 'varsity' ? r2.base : r2.light);
    });
    if (id === 'tracktop' || id === 'windbreaker') part.each((x, y) => { const e = !part.get(side === 'L' ? x - 1 : x + 1, y); if (e) P.px(x, y, id === 'tracktop' ? r2.base : '#ffffff'); });
    if (id === 'flannel') part.each((x, y) => { const u = iX(x), v = iY(y); if ((Math.floor(u + v) % 4 === 0)) P.px(x, y, r2.base); });
    if (id === 'hawaiian') part.each((x, y) => { if (hash(x, y) < 0.08) P.px(x, y, r2.hi); });
    if (id === 'denimjacket') part.each((x, y) => { if (hash(x, y) < 0.14) P.px(x, y, rp.light); else if (hash(y, x) < 0.08) P.px(x, y, rp.shade); });
    if (id === 'bomber') part.each((x, y) => { const u = iX(x), v = iY(y); if (((u * 0.7 + v * 0.9) % 3) < 0.4) P.px(x, y, rp.hi); });
    if (id === 'puffer' || id === 'hoodiebig') part.each((x, y) => { if (((iY(y) - a.sh[1]) % 3.6) > 3.1) P.px(x, y, rp.deep); });
    if (id === 'poncho') edge(part, 0, 1).each((x, y) => P.px(x, y, ((x + y) & 1) ? r2.base : rp.shade));
    if (id === 'oversized') edge(part, 0, 1).each((x, y) => P.px(x, y, rp.deep));
    if (id === 'stagesuit') part.each((x, y) => { if (hash(x, y * 3) < 0.04) P.px(x, y, '#ffffff'); });
  }

  /* -------------------------------------------------------------- bottoms */
  const BOT = {
    jeans: { end: 1, k: 0.15 }, cargo: { end: 1, k: 0.55 }, shorts: { end: 0.42, k: 0.5 }, joggers: { end: 0.97, k: 0.4 }, baggy: { end: 1, k: 0.95 },
    leggings: { end: 1, k: 0 }, trackpants: { end: 1, k: 0.25 }, slacks: { end: 1, k: 0.2 }, flares: { end: 1, k: 0.15 }, goldpants: { end: 1, k: 0.1 },
    sweatpants: { end: 1, k: 0.6 }, ripped: { end: 1, k: 0.95 }, camo: { end: 1, k: 0.6 }, techpants: { end: 1, k: 0.3 },
  };
  function bottom(X) {
    const L = X.L, id = L.bottom.id, P = X.P, S = X.S, D = X.D, rp = rpOf(L.bottom.color), cx = CX + S.tx, y0 = T0 + S.dy;
    const hips = Kit.hipMask(S), putM = (m, c) => m.each((x, y) => P.px(x, y, c));
    if (id === 'skirt' || id === 'kilt') {
      const hw = id === 'kilt' ? [6, 6.5, 7, 7.5, 8, 8.5, 9, 9, 9.5] : [6, 6.5, 7.5, 8.5, 9.5, 10.5, 11, 11, 11.5, 11.5];
      const sk = M().rows(y0 + 12, hw, cx);
      shade(P, sk.clone().or(hips.clone().clipY(y0 + 13, y0 + 16)), rp, { cap: 4 });
      D.hl(cx - 6.5, cx + 6.5, y0 + 12.4, rp.light);
      if (id === 'skirt') {
        sk.each((x, y) => { const u = iX(x) - cx; if (Math.abs((u * 0.85) % 2.6) < 0.4 && iY(y) > y0 + 13) P.px(x, y, rp.shade); });
        edge(sk, 0, 1).each((x, y) => P.px(x, y, rp.light));
      } else {
        const r2 = rpOf(mix(L.bottom.color, '#ffffff', 0.4)), r3 = rpOf(mix(L.bottom.color, '#17141f', 0.5));
        sk.each((x, y) => { const u = iX(x) - cx, v = iY(y) - y0; if (Math.floor(v) % 3 === 0) P.px(x, y, r3.base); if ((Math.floor(u + 20) % 4) === 0) P.px(x, y, r2.base); if ((Math.floor(u + 20) % 4) === 0 && Math.floor(v) % 3 === 0) P.px(x, y, r3.deep); if (Math.abs(((u * 0.9) % 2.4)) < 0.3) P.px(x, y, rp.deep); });
        edge(sk, 0, 1).each((x, y) => P.px(x, y, rp.deep));
        D.rect(cx - 5.4, y0 + 15, 1.4, 2.6, '#e8c050'); D.px(cx - 4.9, y0 + 15.4, '#fff0a0');
      }
      return;
    }
    const spec = BOT[id]; if (!spec) return;
    const gold = id === 'goldpants';
    shade(P, hips.clone().clipY(y0 + 13, y0 + 16), rp, { cap: 4 });
    const legs = {};
    for (const side of ['L', 'R']) {
      const leg = S.legs[side];
      let lm = Kit.legMask(S, side, 0, spec.end, spec.k);
      if (id === 'flares') { lm = M(); const rr = S.G.legR; lm.capsule(leg.hip[0], leg.hip[1], leg.ft[0], leg.ft[1] + 1, rr[0] + 0.15, rr[1] + 1.6, 0, 1); }
      legs[side] = lm;
      shade(P, lm, rp, { cap: 3 });
      const sg = side === 'L' ? -1 : 1, ox = side === 'L' ? -1 : 1;
      const hemY = leg.ft[1];
      const lx = (t) => leg.hip[0] + (leg.ft[0] - leg.hip[0]) * t, ly = (t) => leg.hip[1] + (leg.ft[1] - leg.hip[1]) * t;
      const lm2 = (fn) => lm.each((x, y) => fn(x, y, iX(x), iY(y)));
      const hemRows = (c, n) => lm.each((x, y) => { if (!lm.get(x, y + 1)) for (let q = 0; q < (n || 1); q++) P.px(x, y - q, c); });
      const outerEdge = (c) => lm.each((x, y) => { if (!lm.get(x + ox, y) && iY(y) > leg.hip[1] + 2) P.px(x, y, c); });
      switch (id) {
        case 'jeans': {
          outerEdge(rp.light); hemRows(rp.light);
          lm2((x, y, u, v) => { if (hash(x, y) < 0.06) P.px(x, y, rp.light); });
          D.px(leg.hip[0] - sg * 1.2, leg.hip[1] + 1.6, rp.deep); D.px(leg.hip[0] - sg * 1.2, leg.hip[1] + 2.6, rp.deep);
          // knee fold lines
          D.line(lx(0.55) - 1.4, ly(0.55), lx(0.55) + 1.4, ly(0.55) + 0.8, rp.shade);
          break;
        }
        case 'cargo': case 'camo': {
          if (id === 'camo') {
            const base = rpOf(L.bottom.color), t1 = rpOf(mix(L.bottom.color, '#17141f', 0.45)), t2 = rpOf(mix(L.bottom.color, '#ffffff', 0.25)), t3 = rpOf(mix(L.bottom.color, '#7a5a30', 0.45));
            lm2((x, y, u, v) => {
              const n = Math.sin(u * 1.35 + Math.sin(v * 0.7) * 1.8) + Math.sin(v * 1.1 - u * 0.5) + Math.sin((u + v) * 0.9 + 2.0);
              if (n > 1.15) P.px(x, y, t1.base); else if (n < -1.25) P.px(x, y, t3.base); else if (n > 0.55 && n < 0.75) P.px(x, y, t2.base);
            });
            // re-light the left edge so the volume survives the pattern
            lm.each((x, y) => { if (!lm.get(x - 1, y) || !lm.get(x - 1, y - 1)) P.px(x, y, ((x + y) & 1) ? rp.light : t2.light); if (!lm.get(x + 1, y) && !lm.get(x + 1, y + 1)) P.px(x, y, rp.shade); });
          }
          const pk = M().rect(lx(0.25) + (side === 'L' ? -3.2 : 0.4), ly(0.22), 3.2, 4.2).and(lm), edgeP = edge(pk, 0, -1);
          shade(P, pk, rp, { cap: 2, hi: true });
          if (id === 'camo') pk.each((x, y) => { if (hash(x + 3, y) < 0.3) P.px(x, y, rpOf(mix(L.bottom.color, '#17141f', 0.45)).base); });
          putM(edgeP, rp.deep); const pe = edge(pk, ox, 0); putM(pe, rp.shade); D.px(lx(0.25) + (side === 'L' ? -1.6 : 2), ly(0.22) + 2.2, '#e8c050');
          D.hl(lx(0.25) + (side === 'L' ? -3.2 : 0.4), lx(0.25) + (side === 'L' ? -0.2 : 3.4), ly(0.22) + 1.2, rp.deep);
          hemRows(rp.shade); outerEdge(rp.light);
          // ankle strap with a buckle
          D.hl(lx(0.88) - 2, lx(0.88) + 2, ly(0.88), rp.deep); D.px(lx(0.88), ly(0.88), '#cfd3e6');
          break;
        }
        case 'shorts': { hemRows(rp.deep); lm.each((x, y) => { if (!lm.get(x, y + 1) || !lm.get(x, y + 2)) { /* hem band */ } }); D.hl(lx(0.38) - 2.4, lx(0.38) + 2.4, ly(0.38) - 0.4, rp.light); break; }
        case 'joggers': case 'sweatpants': {
          // elastic cuffs that bunch up, side stripe, folds
          lm2((x, y, u, v) => { if (v >= leg.ft[1] - 2.2) P.px(x, y, ((x + y) & 1) ? rp.light : rp.base); });
          lm2((x, y, u, v) => { if (v >= leg.ft[1] - 2.2 && !lm.get(x, y + 1)) P.px(x, y, rp.deep); });
          const stripe = L.bottom.color2 || '#f7f2e8';
          lm.each((x, y) => { if (iY(y) > leg.hip[1] + 1.5 && iY(y) < leg.ft[1] - 2.4 && !lm.get(x + ox, y)) { P.px(x, y, '#f7f2e8'); P.px(x - ox, y, '#cfc6e4'); } });
          if (id === 'sweatpants') {
            for (let q = 0; q < 3; q++) D.line(lx(0.45 + q * 0.14) - 1.8, ly(0.45 + q * 0.14), lx(0.45 + q * 0.14) + 1.6, ly(0.45 + q * 0.14) + 1.0, rp.shade);
            D.line(lx(0.28) + (side === 'L' ? 1 : -1) * 1.4, ly(0.2), lx(0.28) + (side === 'L' ? 2.6 : -2.6), ly(0.4), rp.deep);
            lm2((x, y, u, v) => { if (v > leg.ft[1] - 5 && v < leg.ft[1] - 2.2 && hash(x, y) < 0.12) P.px(x, y, rp.shade); });
          }
          break;
        }
        case 'baggy': { for (let q = 0.45; q < 0.95; q += 0.17) D.line(lx(q) - 2.2, ly(q) + 0.3, lx(q) + 1.4, ly(q) - 0.2, rp.shade); hemRows(rp.shade, 2); outerEdge(rp.light); break; }
        case 'ripped': {
          outerEdge(rp.light);
          lm2((x, y, u, v) => { if (hash(x, y) < 0.1) P.px(x, y, rp.light); else if (hash(y + 5, x) < 0.06) P.px(x, y, rp.shade); });
          // knee rip: skin shows through with frayed threads
          const kx = lx(0.55) + (side === 'L' ? 0.2 : -0.2), ky = ly(0.58);
          const rip = M().fn(kx - 2.6, ky - 2.4, kx + 2.6, ky + 2.4, (x, y) => ((x - kx) / 2.1) ** 2 + ((y - ky) / 1.7) ** 2 <= 1).and(lm);
          shade(P, rip, X.K.r, { cap: 2 });
          rip.each((x, y) => { if (!rip.get(x, y - 1)) P.px(x, y, rp.deep); if (!rip.get(x - 1, y) && !rip.get(x, y - 1)) P.px(x, y, '#ffffff'); });
          for (let q = -1; q <= 1; q++) { D.px(kx + q * 1.4, ky - 1.7, '#e8e0f0'); D.px(kx + q * 1.4 + 0.5, ky + 1.7, '#e8e0f0'); }
          const rip2 = M().fn(lx(0.25) - 1.4, ly(0.25) - 0.8, lx(0.25) + 1.4, ly(0.25) + 0.8, (x, y) => Math.abs(x - lx(0.25)) <= 1.2 && Math.abs(y - ly(0.25) - 0.1) <= 0.5).and(lm);
          rip2.each((x, y) => P.px(x, y, X.K.r.shade));
          hemRows(rp.light, 1); lm2((x, y, u, v) => { if (v >= leg.ft[1] - 1.5 && hash(x, y) < 0.4) P.px(x, y, '#e8e0f0'); });
          D.line(lx(0.8) - 2, ly(0.8), lx(0.8) + 2, ly(0.8) + 1, rp.shade);
          break;
        }
        case 'leggings': { lm.each((x, y) => { if (!lm.get(x - ox, y) && ((y & 3) !== 0)) P.px(x, y, rp.hi); }); break; }
        case 'trackpants': { lm.each((x, y) => { if (iY(y) > leg.hip[1] + 2 && !lm.get(x + ox, y)) { P.px(x, y, '#f7f2e8'); P.px(x - ox, y, '#f7f2e8'); } }); hemRows(rp.deep); break; }
        case 'slacks': { D.line(lx(0.15), ly(0.15), lx(0.95), ly(0.95), rp.hi); hemRows(rp.deep); lm.each((x, y) => { if (hash(x, y) < 0.03) P.px(x, y, rp.light); }); break; }
        case 'flares': { lm.each((x, y) => { if (!lm.get(x, y + 1)) P.px(x, y, rp.deep); if (iY(y) > leg.ft[1] - 5 && ((x * 2 + y) % 5 === 0)) P.px(x, y, rp.shade); }); break; }
        case 'goldpants': { lm2((x, y) => { if (hash(x, y) < 0.05) P.px(x, y, '#ffffff'); if (!lm.get(x - 1, y) && side === 'L') P.px(x, y, rp.hi); }); D.px(leg.hip[0] - 0.5, leg.hip[1] + 6, '#fff'); D.px(leg.hip[0] + 0.5, leg.hip[1] + 7, '#fff'); break; }
        case 'techpants': {
          // black tech trousers: cross-thigh strap with a buckle, zip pockets, reflective piping, tapered zipped ankle
          const stp = rpOf(mix(L.bottom.color, '#ffffff', 0.18));
          const sy = ly(0.34); D.hl(lx(0.34) - 3.4, lx(0.34) + 3.4, sy, stp.base); D.hl(lx(0.34) - 3.4, lx(0.34) + 3.4, sy + 1, stp.shade);
          D.rect(lx(0.34) - 0.8, sy - 0.4, 1.8, 2.2, '#cfd3e6'); D.px(lx(0.34), sy, '#ffffff');
          const sy2 = ly(0.62); D.hl(lx(0.62) - 3.2, lx(0.62) + 3.2, sy2, stp.base); D.px(lx(0.62) + sg * 1.4, sy2, '#cfd3e6'); D.px(lx(0.62) + sg * 1.4, sy2 + 0.9, '#8a8aa8');
          lm.each((x, y) => { if (!lm.get(x - ox, y) && iY(y) > leg.hip[1] + 1.5) P.px(x, y, '#9aa4c0'); });
          D.line(lx(0.12) + sg * 1.6, ly(0.12), lx(0.12) + sg * 2.4, ly(0.3), '#cfd3e6'); D.px(lx(0.12) + sg * 2.4, ly(0.31), '#ffffff');
          D.vl(leg.ft[0], ly(0.8), hemY - 0.4, '#8a8aa8'); D.px(leg.ft[0], ly(0.8), '#ffffff');
          hemRows(rp.deep);
          break;
        }
      }
    }
    // waistband / belt / fly
    const wb = (c) => { for (const dx of [0]) D.hl(cx - S.G.hip + 0.6, cx + S.G.hip - 0.6, y0 + 13, c); };
    if (id === 'jeans' || id === 'slacks' || id === 'cargo' || id === 'camo' || id === 'ripped' || id === 'baggy') {
      wb(id === 'slacks' ? '#2a2236' : rp.deep); D.rect(cx - 1, y0 + 12.6, 2, 1.4, '#e8c050'); D.px(cx - 0.4, y0 + 12.9, '#fff0a0');
      if (id !== 'slacks') { D.vl(cx - 0.6, y0 + 14, y0 + 16.2, rp.deep); for (const s of [-1, 1]) D.vl(cx + s * 3.8, y0 + 12.6, y0 + 14, rp.shade); }
      if (id === 'camo') for (const s of [-1, 1]) D.px(cx + s * 3.8, y0 + 13, '#cfd3e6');
    } else if (id === 'sweatpants' || id === 'trackpants' || id === 'joggers' || id === 'techpants') {
      wb(rp.light); D.hl(cx - S.G.hip + 0.6, cx + S.G.hip - 0.6, y0 + 14, rp.deep);
      if (id === 'sweatpants') { D.vl(cx - 1.4, y0 + 14, y0 + 17.4, '#f7f2e8'); D.vl(cx + 1.4, y0 + 14, y0 + 16.8, '#cfc6e4'); D.px(cx - 1.4, y0 + 17.8, '#e8c050'); D.px(cx + 1.4, y0 + 17.2, '#e8c050'); D.px(cx - 0.5, y0 + 13.2, '#ffffff'); }
    } else if (gold) D.hl(cx - S.G.hip + 0.6, cx + S.G.hip - 0.6, y0 + 13, '#fff0a0');
  }

  /* ---------------------------------------------------------------- shoes */
  function shoes(X) {
    const L = X.L, id = L.shoes.id, P = X.P, S = X.S, D = X.D, rp = rpOf(L.shoes.color), K = X.K;
    const alt = rpOf(mix(L.shoes.color, '#ffffff', 0.62)), dk = rpOf(mix(L.shoes.color, '#17141f', 0.55));
    const sole = { sneakers: '#f7f2e8', hightops: '#f7f2e8', skate: '#e8d8a8', loafers: '#2a2236', boots: '#2a2236', combat: '#1c1826', platform: mix(L.shoes.color, '#f7f2e8', 0.7), goldkicks: '#ffe56a', sandals: mix(L.shoes.color, '#2a2236', 0.2), retro: '#f7f2e8', fatlaces: '#f7f2e8', timbs: '#e8d8b0', slides: '#f7f2e8' }[id] || '#f7f2e8';
    for (const side of ['L', 'R']) {
      const leg = S.legs[side], sg = side === 'L' ? -1 : 1, fx = leg.ft[0], fy = leg.ft[1];
      const tall = { hightops: 3, boots: 6, combat: 5, retro: 3.4, timbs: 4.6, slides: 3.8, fatlaces: 0.6 }[id] || 0;
      const wide = id === 'skate' || id === 'combat' || id === 'platform' || id === 'retro' || id === 'timbs' ? 0.5 : 0;
      const fcx = fx + sg * 0.55;
      const hws = [2.4 + wide, 3.0 + wide, 3.4 + wide, 3.5 + wide, 3.5 + wide, 3.3 + wide];
      const foot = M().rows(fy, hws, fcx);
      const shaft = tall ? M().rect(fcx - 2.4, fy - tall, 4.8, tall + 1) : M();
            const all = foot.clone().or(shaft);
      const solEdge = all.clone().and(M().rect(0, fy + 4.1, 60, 3));
      const upper = all.clone().sub(solEdge);
      const putM = (m, c) => m.each((x, y) => P.px(x, y, c));
      const cxn = Math.round(Kit.X(fcx)), tx = (u) => fcx + u;
      if (id === 'sandals') {
        shade(P, foot.clone().sub(solEdge), K.r, { cap: 3 }); putM(solEdge, sole);
        D.hl(fcx - 3, fcx + 3, fy + 1.2, rp.base); D.hl(fcx - 3, fcx + 3, fy + 2, rp.shade); D.px(fcx - 1.5, fy + 1.1, rp.hi);
        for (let i = -1.5; i <= 1.5; i += 1) D.px(fcx + i, fy + 0.2, K.r.light);
        continue;
      }
      if (id === 'slides') {
        // white socks up the ankle, a wide strap across the foot, chunky foam sole
        const sock = M().rect(fcx - 2.5, fy - tall, 5, tall + 2.2).or(M().rows(fy + 1, [2.7, 3.1, 3.1, 2.8], fcx));
        shade(P, sock, rpOf('#f7f2e8'), { cap: 3 });
        for (const r of [-tall + 0.6, -tall + 1.6]) D.hl(fcx - 2.3, fcx + 2.3, fy + r, r < -tall + 1 ? rp.base : '#f7f2e8');
        const solS = M().rect(fcx - 3.9 - wide, fy + 4.0, 7.8, 1.9).and(M().rect(0, fy + 4.0, 60, 3)); flat(P, solS, '#ffffff'); edge(solS, 0, 1).each((x, y) => P.px(x, y, '#c9c0e0'));
        const strap = M().rect(fcx - 3.3, fy + 0.9, 6.6, 1.9); shade(P, strap, rp, { cap: 2, hi: true });
        D.hl(fcx - 3, fcx + 3, fy + 0.8, rp.hi, 1); D.px(fcx - 2.2, fy + 1.7, rp.light);
        for (let i = -1; i <= 1; i += 1) D.px(fcx + i, fy + 2.9, '#fff0e8');
        continue;
      }
      shade(P, upper, rp, { cap: 3, hi: true });
      putM(solEdge, sole);
      edge(solEdge, 0, 1).each((x, y) => P.px(x, y, mix(sole, '#6a4a8f', 0.35)));
      solEdge.each((x, y) => { if (((x + y) & 1) && hash(x, y) < 0.3) P.px(x, y, mix(sole, '#6a4a8f', 0.15)); });
      const out = sg;
      switch (id) {
        case 'sneakers': case 'skate': case 'goldkicks': case 'hightops': {
          D.hl(tx(-2), tx(2), fy + 1.7, '#f7f2e8'); D.px(tx(-0.5), fy + 0.9, '#ffffff'); D.px(tx(0.5), fy + 0.9, '#e6dff2');
          D.px(tx(-1.6), fy + 2.6, rp.deep); D.px(tx(1.6), fy + 2.6, rp.deep);
          D.hl(tx(-2.4), tx(2.4), fy + 2.9, id === 'goldkicks' ? '#ffe56a' : rp.shade, 1);
          for (let i = -1; i <= 1; i++) D.px(tx(i * 0.9), fy + 1.0 + (i % 2 ? 0.4 : 0), '#f7f2e8');
          if (id === 'hightops') { for (let i = 1; i <= 3; i++) { D.px(tx(-0.5), fy - i, '#f7f2e8'); D.px(tx(0.5), fy - i, i % 2 ? '#e6dff2' : '#f7f2e8'); } D.hl(tx(-2.2), tx(2.2), fy - 3, '#f7f2e8', 1); D.hl(tx(-2), tx(2), fy - 2.2, rp.shade, 1); }
          if (id === 'skate') { D.hl(tx(-2.8), tx(2.8), fy + 2.2, rp.deep); D.px(tx(-0.5), fy + 0.8, '#ffffff'); }
          if (id === 'goldkicks') { D.px(tx(-2.4), fy + 1.6, '#fff'); D.px(tx(2.4), fy + 2.2, '#fff'); D.hl(tx(-2.6), tx(2.6), fy + 3.1, '#ffe56a'); D.px(tx(0), fy + 0.2, '#ffffff'); }
          break;
        }
        case 'retro': {
          // chunky retro high-top: contrast toe cap and heel panel, padded collar, laces, air window in the midsole
          D.hl(tx(-2.4), tx(2.4), fy - tall + 0.2, alt.light); D.hl(tx(-2.4), tx(2.4), fy - tall + 1.1, rp.shade);
          const toe = M().rows(fy + 1.9, [2.1, 2.8, 3.0], fcx).and(upper); shade(P, toe, dk, { cap: 2, hi: true });
          const heel = M().rect(fcx - (sg < 0 ? -0.4 : 3.6), fy - tall + 1.0, 3.2, tall + 1.4).and(upper); shade(P, heel, dk, { cap: 2, hi: true });
          for (let i = -tall + 1.8; i <= 0.6; i += 1.1) { D.hl(tx(-1.2), tx(1.2), fy + i, '#ffffff', 1); }
          D.vl(tx(0), fy - tall + 0.6, fy + 1.4, rp.shade);
          D.rect(tx(-1.7), fy + 3.8, 3.4, 1.0, '#9ad8ff'); D.px(tx(-1.1), fy + 3.9, '#ffffff');
          break;
        }
        case 'fatlaces': {
          // fat flat laces: wide light bands crossing the vamp with big loose bows
          for (let q = 0; q < 3; q++) { D.hl(tx(-2.0), tx(2.0), fy + 0.5 + q * 0.95, q % 2 ? '#e6dff2' : '#ffffff', 1); D.hl(tx(-1.9), tx(1.9), fy + 0.95 + q * 0.95, '#cfc6e4', 1); }
          D.rect(tx(-2.4), fy - 0.4, 2, 1.2, '#ffffff'); D.rect(tx(0.4), fy - 0.4, 2, 1.2, '#ffffff'); D.px(tx(-0.3), fy - 0.2, '#cfc6e4');
          D.line(tx(-2.4), fy - 0.2, tx(-3.2), fy + 1.4, '#ffffff'); D.line(tx(2.4), fy - 0.2, tx(3.2), fy + 1.4, '#ffffff');
          D.hl(tx(-2.8), tx(2.8), fy + 3.0, rp.shade, 1); D.px(tx(-2.2), fy + 1.8, rp.hi);
          break;
        }
        case 'timbs': {
          // wheat work boot: padded collar, eyelets and laces, stitched toe cap, lug sole with tread
          D.hl(tx(-2.4), tx(2.4), fy - tall, rp.light); D.hl(tx(-2.4), tx(2.4), fy - tall + 0.9, rp.shade);
          for (let i = -tall + 1.6; i <= 0.8; i += 1.2) { D.px(tx(-1.2), fy + i, rp.deep); D.px(tx(1.2), fy + i, rp.deep); D.hl(tx(-1), tx(1), fy + i + 0.2, '#6a4a2a', 1); }
          const cap = M().rows(fy + 1.8, [2.2, 2.9, 3.1], fcx).and(upper); edge(cap, 0, -1).each((x, y) => P.px(x, y, rp.deep));
          for (let i = -2.4; i <= 2.4; i += 0.9) D.px(tx(i), fy + 1.5, '#fff0c9');
          solEdge.each((x, y) => { if ((x & 1) === 0) P.px(x, y, '#8a6a3a'); });
          D.px(tx(-2.2), fy - 0.5, rp.hi);
          break;
        }
        case 'boots': case 'combat': {
          for (let i = 1; i <= tall; i += 1.6) { D.px(tx(-0.5), fy - i, rp.light); D.px(tx(0.5), fy - i, rp.light); }
          if (id === 'combat') { D.hl(tx(-2), tx(2), fy - tall, '#2a2236'); for (let i = 0; i <= 3; i += 1.1) { D.px(tx(-1), fy - i, '#f7f2e8'); D.px(tx(1), fy - i, '#f7f2e8'); } }
          else { D.hl(tx(-2.2), tx(2.2), fy - tall, rp.light); D.px(tx(-1.5), fy + 1, rp.hi); }
          solEdge.each((x, y) => { if (!((x + y) & 1)) P.px(x, y, '#0f0b19'); });
          break;
        }
        case 'platform': { D.hl(tx(-1.6), tx(1.6), fy + 1.2, rp.light); D.hl(tx(-3), tx(3), fy + 3.0, mix(sole, '#ffffff', 0.4)); for (let x = -3; x <= 3; x += 1.2) D.px(tx(x), fy + 4.1, rp.deep); break; }
        case 'loafers': { D.px(tx(-0.5), fy + 1.2, '#e8c050'); D.px(tx(0.5), fy + 1.2, '#fff0a0'); D.hl(tx(-1.8), tx(1.8), fy + 0.2, rp.light); D.px(tx(-1.8), fy + 2.2, rp.hi); D.hl(tx(-2.4), tx(2.4), fy + 0.8, rp.shade, 1); break; }
      }
    }
  }

  /* ----------------------------------------------------------------- arms */
  function arm(X, side) {
    const P = X.P, S = X.S, B = X.B, K = X.K, a = S.arms[side], D = X.D;
    const rg = ring(B.arm[side], X.torsoM);
    Kit.drawArmSkin(P, S, B, K, side);
    sleeve(X, side);
    // hand over the cuff: palm shade, thumb, knuckle line
    const hm = B.hand[side];
    shade(P, hm, K.r, { cap: 3 });
    const sg = side === 'L' ? -1 : 1;
    D.px(a.ha[0] + sg * 1.2, a.ha[1] - 0.2, K.r.light); D.hl(a.ha[0] - 0.8, a.ha[0] + 0.8, a.ha[1] + 1.1, K.r.shade, 1);
    D.px(a.ha[0] - sg * 0.6, a.ha[1] + 0.2, K.r.shade);
    if (S.point === side) { const o = sg; D.line(a.ha[0] + o * 1.2, a.ha[1] - 0.6, a.ha[0] + o * 3.8, a.ha[1] - 1.4, K.r.base, Math.max(1, GR.t)); D.px(a.ha[0] + o * 4.0, a.ha[1] - 1.5, K.r.light); }
    X.Acc.wrist(X, side);
    if (side === 'R') X.Acc.held(X);
  }

  Object.assign(BBH, { CharsGear: { bottom, shoes, top, arm, TOPS, BOT, hash } });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsGear;
})(typeof globalThis !== 'undefined' ? globalThis : this);
