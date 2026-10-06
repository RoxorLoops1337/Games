// BEATBOX HEROES -- chars_gear.js
// Part 3 of the character renderer: tops, bottoms, shoes, glasses and accessories.
// Clothes are coloured regions built from the SAME masks as the body (torso, arm capsules, leg capsules),
// so every garment fits every body type and every pose automatically.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
  }
  const { PAL, ramp, mix } = BBH;
  const Kit = BBH.CharsKit, { CX, T0, M, shade, flat, darkenAt, ring } = Kit;
  const rpOf = (c) => ramp(c);

  /* ----------------------------------------------------------------- tops */
  // hem: last torso row (0..16, row 0 is y=29) covered; sl: sleeve end along the arm (0 none .. 1 wrist); k: sleeve widening
  const TOPS = {
    tee: { hem: 14, sl: 0.42, k: 0.2 }, tank: { hem: 14, sl: 0, k: 0 }, hoodie: { hem: 16, sl: 1, k: 0.35 }, croptop: { hem: 9, sl: 0.4, k: 0.15 },
    sweater: { hem: 16, sl: 1, k: 0.3 }, flannel: { hem: 15, sl: 1, k: 0.2 }, dress: { hem: 16, sl: 0, k: 0 }, jacket: { hem: 15, sl: 1, k: 0.3 },
    varsity: { hem: 15, sl: 1, k: 0.3 }, tracktop: { hem: 15, sl: 1, k: 0.25 }, puffer: { hem: 16, sl: 1, k: 0.9, bulk: 1 }, hawaiian: { hem: 15, sl: 0.42, k: 0.25 },
    overalls: { hem: 16, sl: 0.4, k: 0.2 }, turtleneck: { hem: 15, sl: 1, k: 0.1 }, kimono: { hem: 16, sl: 0.8, k: 1.1, bulk: 1 }, tux: { hem: 16, sl: 1, k: 0.25 },
    poncho: { hem: 15, sl: 0.7, k: 1.3, bulk: 1 }, bbhtee: { hem: 14, sl: 0.42, k: 0.2 }, stagesuit: { hem: 16, sl: 1, k: 0.2 }, champ: { hem: 16, sl: 1, k: 0.7, bulk: 1 },
  };

  function torsoRegion(X, spec) {
    const S = X.S, m = X.torsoM.clone();
    m.clipY(S.dy + T0, S.dy + T0 + spec.hem);
    if (spec.bulk) { const g = m.grow(); m.or(g); m.clipY(S.dy + T0 + 1, S.dy + T0 + spec.hem); }
    return m;
  }
  const sleeveColor = (X, id) => (id === 'varsity' || id === 'overalls' ? X.L.top.color2 : X.L.top.color);

  function top(X) {
    const L = X.L, id = L.top.id, spec = TOPS[id]; if (!spec) return;
    const P = X.P, S = X.S, rp = rpOf(L.top.color), r2 = rpOf(L.top.color2), cx = CX + S.tx, y0 = T0 + S.dy;
    const px = (dx, row, c) => P.px(cx + dx, y0 + row, c);
    const body = torsoRegion(X, spec);
    // neckline: remove the neck area so skin shows through
    const neckOpen = M();
    const nk = { tee: 'crew', tank: 'scoop', hoodie: 'crew', croptop: 'crew', sweater: 'crew', flannel: 'v', dress: 'scoop', jacket: 'v', varsity: 'crew', tracktop: 'crew', puffer: 'high', hawaiian: 'v', overalls: 'crew', turtleneck: 'high', kimono: 'v', tux: 'v', poncho: 'crew', bbhtee: 'crew', stagesuit: 'v', champ: 'v' }[id];
    const hw = S.G.neck;
    // rows 0 = neck, 1.. shoulders
    const cut = (row, w) => { for (let x = Math.ceil(cx - w + 0.5); x <= Math.floor(cx + w - 0.5); x++) neckOpen.set(x, y0 + row); };
    cut(0, hw + 1);
    if (nk === 'crew') { cut(1, hw - 0.5); }
    else if (nk === 'scoop') { cut(1, hw + 1); cut(2, hw); cut(3, hw - 1.5); }
    else if (nk === 'v') { cut(1, hw); cut(2, hw - 1); cut(3, hw - 2); cut(4, 1); }
    else if (nk === 'high') { /* collar covers the neck */ }
    if (nk !== 'high') body.sub(neckOpen); else { body.or(M().rows(y0, [hw + 0.5, hw + 0.5]).shift(S.tx, 0)); }
    let bodyRp = rp;
    if (id === 'tux') bodyRp = rpOf(L.top.color);
    // dress: add a skirt
    let skirt = null;
    if (id === 'dress') {
      skirt = M().rows(y0 + 11, [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10, 10.5, 11], cx);
      body.or(skirt);
    }
    if (id === 'champ') body.or(M().rows(y0 + 17, [7.5, 8, 8.5, 9, 9.5, 10, 10.5], cx));
    if (id === 'kimono') body.or(M().rows(y0 + 17, [7.5, 8], cx));
    if (id === 'poncho') { const w = M().rows(y0 + 6, [8, 9, 10, 10.5, 11, 11.5, 12, 12.5, 12.5], cx); body.or(w); }
    shade(P, body, bodyRp, { cap: 4, hi: false, deep: false, dither: id === 'puffer' });
    const bounds = body.bounds(); const yb = bounds ? bounds.y1 : y0 + 15;
    // hem line
    const hemLine = (c) => { body.each((x, y) => { if (!body.get(x, y + 1) && y > y0 + 8) P.px(x, y, c); }); };
    const edgeShadow = () => { body.each((x, y) => { if (y > y0 + 4 && !body.get(x + 1, y) && body.get(x, y)) P.px(x, y, rp.deep); });  };
    switch (id) {
      case 'tee': case 'bbhtee': {
        // crew collar rib
        for (let dx = -3.5; dx <= 3.5; dx++) px(dx, 1, rp.light);
        px(-3.5, 0, rp.light); px(3.5, 0, rp.light); px(-3.5, 1, rp.hi); px(-2.5, 1, rp.light);
        hemLine(rp.shade);
        if (id === 'bbhtee') {
          // 'BBH' chest print in 3x5 pixel letters
          const lt = { B: ['110', '101', '110', '101', '110'], H: ['101', '101', '111', '101', '101'] };
          const word = ['B', 'B', 'H'];
          word.forEach((ch, i) => lt[ch].forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === '1') px(-5.5 + i * 4 + k, 5 + j, L.top.color2); }));
        }
        break;
      }
      case 'tank': {
        for (let dx = -3.5; dx <= 3.5; dx += 7) { px(dx, 1, rp.light); px(dx, 2, rp.light); }
        hemLine(rp.shade);
        // armholes: skin shows at the shoulders
        break;
      }
      case 'hoodie': {
        // hood bunched around the neck, drawstrings, kangaroo pocket
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 1, rp.light); px(dx, 0, rp.shade); }
        for (const s of [-1, 1]) { px(s * 4.5, 0, rp.base); px(s * 4.5, 1, rp.shade); }
        px(-1.5, 2, r2.light); px(-1.5, 3, r2.light); px(-1.5, 4, r2.base); px(1.5, 2, r2.light); px(1.5, 3, r2.light); px(1.5, 4, r2.base);
        px(-1.5, 5, r2.hi); px(1.5, 5, r2.hi);
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 9, rp.shade); }
        px(-4.5, 10, rp.shade); px(4.5, 10, rp.shade); px(-3.5, 14, rp.shade); px(3.5, 14, rp.shade);
        for (let dx = -3.5; dx <= 3.5; dx++) px(dx, 9, rp.light);
        for (let dx = -5.5; dx <= 5.5; dx++) px(dx, 15, rp.light);
        px(0.5, 10, rp.deep); px(-0.5, 10, rp.deep);
        hemLine(rp.shade);
        break;
      }
      case 'croptop': {
        for (let dx = -3.5; dx <= 3.5; dx++) px(dx, 1, rp.light);
        hemLine(r2.base);
        for (let dx = -4.5; dx <= 4.5; dx++) px(dx, 9, r2.light);
        break;
      }
      case 'sweater': {
        // chunky knit: vertical ribs and a rib band at hem and collar
        body.each((x, y) => { if (y > y0 + 2 && y < y0 + 14 && ((x - cx) | 0) % 2 === 0 && ((y + (x >> 1)) & 1)) P.px(x, y, rp.shade); });
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 1, rp.hi); px(dx, 0, rp.light); }
        for (let dx = -6.5; dx <= 6.5; dx++) { px(dx, 15, rp.light); px(dx, 16, rp.shade); }
        for (let dx = -6.5; dx <= 6.5; dx += 2) { px(dx, 16, rp.deep); }
        // a stripe in the accent colour
        for (let dx = -7.5; dx <= 7.5; dx++) if (body.get(Math.round(cx + dx), y0 + 8)) { px(dx, 7, r2.base); px(dx, 8, r2.light); }
        break;
      }
      case 'flannel': {
        body.each((x, y) => { const cxl = x - Math.floor(cx); const yy = y - y0; if (yy > 2) { if ((cxl % 4 + 4) % 4 === 0) P.px(x, y, r2.base); if (yy % 4 === 0) P.px(x, y, r2.shade); if ((cxl % 4 + 4) % 4 === 0 && yy % 4 === 0) P.px(x, y, r2.deep); } });
        // collar + placket
        px(-3.5, 1, rp.hi); px(-2.5, 2, rp.hi); px(-1.5, 3, rp.hi); px(3.5, 1, rp.hi); px(2.5, 2, rp.hi); px(1.5, 3, rp.hi);
        px(-4.5, 1, rp.light); px(4.5, 1, rp.light);
        for (let r = 5; r <= 15; r++) { px(-0.5, r, rp.deep); px(0.5, r, rp.light); }
        for (const r of [6, 9, 12]) px(0.5, r, '#fff0c9');
        // undershirt in the V
        px(-0.5, 1, '#f7f2e8'); px(0.5, 1, '#f7f2e8'); px(-0.5, 2, '#e6dff2'); px(0.5, 2, '#e6dff2'); px(-0.5, 3, '#cfc6e4'); px(0.5, 3, '#cfc6e4');
        hemLine(rp.shade);
        break;
      }
      case 'dress': {
        // straps, bodice seam, flared skirt with pleats and a belt in the accent colour
        for (const s of [-1, 1]) { px(s * 3.5, 1, rp.light); px(s * 3.5, 0, rp.light); px(s * 3.5, 2, rp.light); }
        for (let dx = -6.5; dx <= 6.5; dx++) { px(dx, 10, r2.base); px(dx, 11, r2.light); }
        px(0.5, 10, r2.hi); px(-0.5, 10, r2.hi);
        skirt.each((x, y) => { if (((x - Math.floor(cx)) % 3 === 0) && y > y0 + 12) P.px(x, y, rp.shade); });
        skirt.each((x, y) => { if (!skirt.get(x, y + 1)) P.px(x, y, ((x + y) & 1) ? r2.light : r2.base); });
        // flower print
        for (const [dx, r] of [[-4.5, 14], [3.5, 15], [-1.5, 17], [5.5, 18], [-6.5, 18], [0.5, 20]]) { px(dx, r, r2.hi); px(dx + 1, r, r2.light); px(dx, r + 1, r2.light); }
        break;
      }
      case 'jacket': {
        // glossy leather: collar flaps, diagonal zip, shoulder sheen, inner tee in the accent colour
        for (let r = 1; r <= 15; r++) { const dx = -3.5 + (r > 8 ? 0 : 0) + (r % 2 ? 0 : 0); px(0.5, r, r === 1 ? r2.base : rp.deep); px(-0.5, r, r2.base); if (r > 3) px(-0.5, r, rp.deep); }
        for (let r = 2; r <= 5; r++) { px(-1.5 - (r - 2), r, rp.hi); px(2.5 + (r - 2), r, rp.hi); px(-0.5, r, r2.base); px(0.5, r, r2.light); }
        for (let r = 4; r <= 14; r++) { px(2.5 + 0 * r, r, rp.shade); }
        px(1.5, 8, '#cfd3e6'); px(1.5, 9, '#fff'); px(1.5, 12, '#cfd3e6');
        for (let dx = -6.5; dx <= -3.5; dx++) px(dx, 3, rp.hi);
        px(-6.5, 4, rp.light); px(-5.5, 4, rp.light); px(-4.5, 7, rp.light); px(-4.5, 8, rp.light);
        // pocket zips
        px(-4.5, 11, '#cfd3e6'); px(-3.5, 11, '#cfd3e6'); px(3.5, 11, rp.light); px(4.5, 11, rp.light);
        for (let dx = -6.5; dx <= 6.5; dx++) px(dx, 15, rp.shade);
        break;
      }
      case 'varsity': {
        // letter-patch, snap line, rib collar / hem in the accent colour with a white stripe
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 0, r2.light); px(dx, 1, r2.base); }
        px(-4.5, 2, r2.base); px(4.5, 2, r2.base); px(-3.5, 2, r2.shade); px(3.5, 2, r2.shade);
        for (let r = 3; r <= 14; r++) { px(-0.5, r, rp.deep); px(0.5, r, rp.light); }
        for (const r of [5, 8, 11]) { px(0.5, r, '#fff0c9'); }
        for (let dx = -6.5; dx <= 6.5; dx++) { px(dx, 15, r2.base); px(dx, 14, '#ffffff'); }
        // chest 'B' patch
        const bmap = ['110', '101', '110', '101', '110'];
        bmap.forEach((row, j) => { for (let k = 0; k < 3; k++) if (row[k] === '1') px(-5.5 + k, 5 + j, '#f7f2e8'); });
        px(-6.5, 4, r2.hi);
        break;
      }
      case 'tracktop': {
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 0, rp.light); px(dx, 1, rp.base); }
        for (let r = 2; r <= 15; r++) { px(-0.5, r, rp.deep); px(0.5, r, rp.hi); }
        px(0.5, 3, '#fff'); px(0.5, 4, '#cfd3e6');
        for (let r = 2; r <= 15; r++) { px(-6.5, r, r2.base); px(6.5, r, r2.shade); px(-5.5, r, r2.light); px(5.5, r, r2.base); }
        for (let dx = -5.5; dx <= 5.5; dx++) px(dx, 15, rp.shade);
        break;
      }
      case 'puffer': {
        for (const r of [4, 8, 12, 16]) body.each((x, y) => { if (y === y0 + r) P.px(x, y, rp.deep); if (y === y0 + r - 1 && ((x + y) & 1) === 0) P.px(x, y, rp.light); });
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 0, rp.light); px(dx, 1, rp.shade); }
        px(-4.5, 1, rp.light); px(4.5, 1, rp.light);
        for (let r = 2; r <= 15; r++) { px(-0.5, r, rp.deep); px(0.5, r, rp.hi); }
        px(0.5, 2, '#fff'); px(0.5, 3, '#cfd3e6');
        break;
      }
      case 'hawaiian': {
        px(-3.5, 1, rp.hi); px(-2.5, 2, rp.hi); px(-1.5, 3, rp.hi); px(3.5, 1, rp.hi); px(2.5, 2, rp.hi); px(1.5, 3, rp.hi);
        for (let r = 4; r <= 15; r++) { px(-0.5, r, rp.deep); px(0.5, r, rp.light); }
        const fl = [[-5.5, 5], [4.5, 6], [-3.5, 9], [3.5, 11], [-6.5, 12], [6.5, 13], [-2.5, 14], [1.5, 7]];
        fl.forEach(([dx, r], i) => { px(dx, r, r2.hi); px(dx - 1, r, r2.base); px(dx + 1, r, r2.base); px(dx, r - 1, r2.light); px(dx, r + 1, r2.light); px(dx + (i % 2 ? 1 : -1), r + 1, '#3f9b5a'); });
        hemLine(rp.shade);
        break;
      }
      case 'overalls': {
        // tee underneath (accent), denim bib + straps, buttons, pocket
        const inner = body.clone(); shade(P, inner, r2, { cap: 4 });
        for (let dx = -3.5; dx <= 3.5; dx++) px(dx, 1, r2.light);
        const bib = M().rows(y0 + 5, [5, 5.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5], cx);
        shade(P, bib, rp, { cap: 4 });
        for (const s of [-1, 1]) { for (let r = 1; r <= 5; r++) { px(s * 4.5, r, rp.base); px(s * 3.5, r, rp.light); } px(s * 4, 5, '#e8c050'); }
        px(-4.5, 6, '#e8c050'); px(4.5, 6, '#e8c050');
        for (let dx = -2.5; dx <= 2.5; dx++) { px(dx, 8, rp.shade); px(dx, 12, rp.shade); }
        px(-2.5, 9, rp.shade); px(2.5, 9, rp.shade); px(-2.5, 10, rp.shade); px(2.5, 10, rp.shade); px(-2.5, 11, rp.shade); px(2.5, 11, rp.shade);
        for (let dx = -6.5; dx <= 6.5; dx++) px(dx, 16, rp.shade);
        break;
      }
      case 'turtleneck': {
        for (let dx = -4; dx <= 3.5; dx++) { px(dx + 0.5, 0, rp.light); px(dx + 0.5, 1, rp.base); }
        for (let dx = -3.5; dx <= 3.5; dx++) { px(dx, -1, rp.light); }
        for (let dx = -3.5; dx <= 3.5; dx += 2) px(dx, 0, rp.shade);
        body.each((x, y) => { if (y > y0 + 2 && ((x - Math.floor(cx)) % 3 === 0) && ((y & 3) < 2)) P.px(x, y, rp.shade); });
        hemLine(rp.shade);
        break;
      }
      case 'kimono': {
        // crossed lapel, wide obi, trim
        for (let r = 1; r <= 12; r++) { px(-3.5 + Math.min(r, 7) * 0.5 - 0.5, r, r2.base); px(3.5 - Math.min(r, 7) * 0.5, r, r2.light); }
        for (let r = 1; r <= 5; r++) { px(-4.5 + r * 0.5, r, r2.hi); px(4.5 - r * 0.5, r, r2.hi); }
        for (let dx = -7.5; dx <= 7.5; dx++) { px(dx, 9, r2.base); px(dx, 10, r2.light); px(dx, 11, r2.shade); }
        px(0.5, 10, r2.hi); px(-0.5, 10, r2.hi);
        for (let r = 12; r <= 18; r++) { px(-0.5, r, r2.base); px(0.5, r, r2.light); }
        body.each((x, y) => { if (!body.get(x, y + 1) && y > y0 + 13) P.px(x, y, r2.base); });
        // small cranes: dots
        for (const [dx, r] of [[-5.5, 5], [5.5, 6], [-4.5, 14], [4.5, 15]]) { px(dx, r, '#fff0c9'); px(dx + 1, r + 1, '#fff0c9'); }
        break;
      }
      case 'tux': {
        // white shirt V with a black tie, satin lapels, pocket square, buttons
        for (let r = 1; r <= 12; r++) { const w = Math.max(0.5, 3.5 - r * 0.3); for (let dx = -w; dx <= w; dx++) px(dx, r, '#f7f2e8'); }
        px(-0.5, 1, '#e6dff2'); px(0.5, 1, '#e6dff2');
        for (let r = 2; r <= 9; r++) { px(-0.5, r, '#cfc6e4'); }
        for (let r = 1; r <= 8; r++) { px(-3.2 - r * 0.0 - Math.min(r, 3) * 0.0 + 0, r, rp.hi); }
        for (let r = 1; r <= 9; r++) { px(-3.5 + r * 0.3 - 1, r, rp.light); px(3.5 - r * 0.3 + 0, r, rp.light); }
        px(-0.5, 2, r2.base); px(0.5, 2, r2.base); px(-0.5, 3, r2.deep); px(0.5, 3, r2.deep); px(0.5, 4, r2.deep); px(-0.5, 4, r2.deep); px(0.5, 5, r2.deep);
        px(3.5, 8, '#fff'); px(4.5, 8, '#e84a6a'); px(-0.5, 11, rp.hi); px(0.5, 13, rp.deep);
        px(-0.5, 12, '#2c2a3a');
        for (let dx = -6.5; dx <= 6.5; dx++) px(dx, 16, rp.shade);
        break;
      }
      case 'poncho': {
        for (let dx = -4.5; dx <= 4.5; dx++) { px(dx, 0, rp.light); px(dx, 1, rp.shade); }
        // stripes across the whole garment
        body.each((x, y) => { const yy = y - y0; if (yy >= 6 && (yy === 8 || yy === 9 || yy === 13)) P.px(x, y, yy === 13 ? r2.light : r2.base); });
        body.each((x, y) => { if (y === y0 + 11 && ((x + y) & 1)) P.px(x, y, r2.light); });
        body.each((x, y) => { if (!body.get(x, y + 1) && y > y0 + 12) P.px(x, y, ((x + y) & 1) ? r2.base : rp.shade); });
        for (let dx = -12; dx <= 12; dx++) if (body.get(Math.round(cx + dx), y0 + 14) && ((dx + 12) % 3 === 0)) px(dx, 15, r2.light);
        break;
      }
      case 'stagesuit': {
        // neon piping along the sides, V neck, sequins and a bold belt
        for (let r = 2; r <= 15; r++) { px(-6.5, r, r2.hi); px(6.5, r, r2.hi); }
        for (let r = 1; r <= 4; r++) { px(-3.5 + r * 0.5 - 0.5, r, r2.base); px(3.5 - r * 0.5 + 0.5, r, r2.base); }
        for (let dx = -6.5; dx <= 6.5; dx++) { px(dx, 11, r2.base); px(dx, 12, r2.light); }
        px(-0.5, 11, '#ffe14d'); px(0.5, 11, '#ffe14d'); px(-0.5, 12, '#fff7b0'); px(0.5, 12, '#ffe14d');
        body.each((x, y) => { if (((x * 7 + y * 11) % 13) === 0 && y > y0 + 1) P.px(x, y, '#ffffff'); });
        px(-6.5, 1, rp.hi); px(-5.5, 1, rp.hi); px(6.5, 1, rp.light);
        break;
      }
      case 'champ': {
        // long robe: gold trim down the front, fur collar, belt
        for (let r = 0; r <= 24; r++) { px(-0.5, r + 1, r2.base); px(0.5, r + 1, r2.light); if (r > 1) { px(-1.5, r + 1, r2.shade); px(1.5, r + 1, r2.shade); } }
        for (let dx = -6.5; dx <= 6.5; dx++) { const f = (Math.floor(dx * 2) & 1) ? '#ffffff' : '#e6dff2'; px(dx, 1, f); px(dx, 2, ((dx * 2) & 3) ? '#e6dff2' : '#cfc6e4'); }
        px(-6.5, 3, '#ffffff'); px(6.5, 3, '#e6dff2');
        for (let dx = -8; dx <= 8; dx++) if (body.get(Math.round(cx + dx), y0 + 11)) { px(dx, 11, r2.base); px(dx, 12, r2.light); }
        body.each((x, y) => { if (!body.get(x, y + 1) && y > y0 + 13) P.px(x, y, r2.base); });
        for (const [dx, r] of [[-4.5, 16], [4.5, 18], [-5.5, 21], [5.5, 22]]) { px(dx, r, r2.hi); }
        break;
      }
    }
    // soft contact shadow under the collar (the chin)
    if (nk !== 'high') for (let dx = -3.5; dx <= 3.5; dx++) { const x = cx + dx, y = y0 + 1; }
  }

  // sleeves + cuffs, drawn with the arm
  function sleeve(X, side) {
    const L = X.L, id = L.top.id, spec = TOPS[id]; if (!spec || spec.sl <= 0) return;
    const S = X.S, P = X.P, B = X.B, G = S.G;
    const col = sleeveColor(X, id), rp = rpOf(col);
    const full = Kit.armMask(S.arms[side], G, 0, 1, spec.k);
    const part = Kit.armMask(S.arms[side], G, 0, spec.sl, spec.k);
    shade(P, part, rp, { cap: 3, ctx: full });
    const a = S.arms[side];
    // cuff / hem at the sleeve end
    const endT = spec.sl;
    const ex = endT >= 1 ? a.ha[0] : (endT < 0.5 ? a.sh[0] + (a.el[0] - a.sh[0]) * endT * 2 : a.el[0] + (a.ha[0] - a.el[0]) * (endT * 2 - 1));
    const ey = endT >= 1 ? a.ha[1] : (endT < 0.5 ? a.sh[1] + (a.el[1] - a.sh[1]) * endT * 2 : a.el[1] + (a.ha[1] - a.el[1]) * (endT * 2 - 1));
    const cuffCol = id === 'varsity' ? '#ffffff' : id === 'hoodie' || id === 'sweater' || id === 'tracktop' || id === 'puffer' ? rp.light : id === 'kimono' || id === 'champ' ? rpOf(L.top.color2).base : rp.shade;
    const cm = Kit.armMask(a, G, Math.max(0, endT - 0.1), endT, spec.k).and(part);
    // cuff pixels: those near the end point
    cm.each((x, y) => { if (Math.hypot(x - ex, y - ey) < 2.3 && endT >= 0.4) P.px(x, y, cuffCol); });
    if (id === 'tracktop' || id === 'stagesuit') part.each((x, y) => { const out = side === 'L' ? x < (a.sh[0] + a.el[0]) / 2 - 0.5 : x > (a.sh[0] + a.el[0]) / 2 + 0.5; if (out && ((x + y) & 1) === 0 && id === 'stagesuit') P.px(x, y, rpOf(L.top.color2).hi); });
    if (id === 'tracktop') { const r2 = rpOf(L.top.color2); part.each((x, y) => { const xo = side === 'L' ? Math.min(a.sh[0], a.el[0], a.ha[0]) : 0; const edge = !part.get(side === 'L' ? x - 1 : x + 1, y); if (edge) P.px(x, y, r2.base); }); }
    if (id === 'flannel') part.each((x, y) => { if (((x + y) % 4) === 0) P.px(x, y, rpOf(L.top.color2).base); });
    if (id === 'hawaiian') part.each((x, y) => { if (((x * 3 + y * 2) % 7) === 0) P.px(x, y, rpOf(L.top.color2).hi); });
    if (id === 'puffer') part.each((x, y) => { if (((y - Math.round(a.sh[1])) % 4) === 3) P.px(x, y, rp.deep); });
    if (id === 'poncho') part.each((x, y) => { if (!part.get(x, y + 1)) P.px(x, y, ((x + y) & 1) ? rpOf(L.top.color2).base : rp.shade); });
  }

  /* -------------------------------------------------------------- bottoms */
  const BOT = {
    jeans: { end: 1, k: 0.15 }, cargo: { end: 1, k: 0.55 }, shorts: { end: 0.42, k: 0.5 }, joggers: { end: 0.97, k: 0.4 }, baggy: { end: 1, k: 0.95 },
    leggings: { end: 1, k: 0 }, trackpants: { end: 1, k: 0.25 }, slacks: { end: 1, k: 0.2 }, flares: { end: 1, k: 0.15 }, goldpants: { end: 1, k: 0.1 },
  };
  function bottom(X) {
    const L = X.L, id = L.bottom.id, P = X.P, S = X.S, B = X.B, rp = rpOf(L.bottom.color), cx = CX + S.tx, y0 = T0 + S.dy;
    const hips = Kit.hipMask(S);
    if (id === 'skirt' || id === 'kilt') {
      const hw = id === 'kilt' ? [6, 6.5, 7, 7.5, 8, 8.5, 9, 9, 9.5] : [6, 6.5, 7.5, 8.5, 9.5, 10.5, 11, 11, 11.5];
      const sk = M().rows(y0 + 12, hw.concat(id === 'kilt' ? [] : [11.5]), cx);
      if (S.sit) sk.or(M().rows(y0 + 12, hw, cx));
      // also a short waistband block over the hips
      shade(P, sk.or(hips.clone().clipY(y0 + 13, y0 + 16)), rp, { cap: 4 });
      const bm = sk.bounds();
      if (id === 'skirt') {
        sk.each((x, y) => { if (((x - Math.floor(cx)) % 3 === 0) && y > y0 + 13) P.px(x, y, rp.shade); });
        sk.each((x, y) => { if (!sk.get(x, y + 1)) P.px(x, y, rp.light); });
        for (let dx = -6.5; dx <= 6.5; dx++) P.px(cx + dx, y0 + 12, rp.light);
      } else {
        // plaid: cross lines in lighter / darker tones, hem fringe
        const r2 = rpOf(mix(L.bottom.color, '#ffffff', 0.4)), r3 = rpOf(mix(L.bottom.color, '#17141f', 0.5));
        sk.each((x, y) => { const yy = y - y0; if (yy % 3 === 0) P.px(x, y, r3.base); if ((x - Math.floor(cx) + 20) % 4 === 0) P.px(x, y, r2.base); if ((x - Math.floor(cx) + 20) % 4 === 0 && yy % 3 === 0) P.px(x, y, r3.deep); });
        sk.each((x, y) => { if (!sk.get(x, y + 1)) P.px(x, y, rp.deep); });
        P.px(cx - 4.5, y0 + 15, '#e8c050'); P.px(cx - 4.5, y0 + 16, '#b88a30');
        for (let dx = -6.5; dx <= 6.5; dx++) P.px(cx + dx, y0 + 12, rp.light);
      }
      return;
    }
    const spec = BOT[id]; if (!spec) return;
    const gold = id === 'goldpants';
    const rpp = gold ? ramp(mix(L.bottom.color, '#e8b923', 0.0) === L.bottom.color ? L.bottom.color : L.bottom.color) : rp;
    // hips
    const hipM = hips.clone().clipY(y0 + 13, y0 + 16);
    shade(P, hipM, rpp, { cap: 4 });
    for (const side of ['L', 'R']) {
      const leg = S.legs[side];
      let lm = Kit.legMask(S, side, 0, spec.end, spec.k);
      if (id === 'flares') {
        lm = M();
        const a = leg.hip, b = leg.ft, rr = S.G.legR;
        lm.capsule(a[0], a[1], b[0], b[1] + 1, rr[0] + 0.15, rr[1] + 1.6, 0, 1);
      }
      const ctx = lm.clone();
      shade(P, lm, rpp, { cap: 3, ctx: id === 'shorts' || id === 'joggers' ? lm : ctx });
      if (id === 'jeans' || id === 'baggy' || id === 'cargo' || id === 'slacks') {
        lm.each((x, y) => { if (y > leg.hip[1] + 4 && ((x + Math.floor(side === 'L' ? 3 : 1)) % 6 === 0) && !((y + x) & 3)) { /* whiskers */ } });
      }
      if (id === 'jeans') {
        const ox = side === 'L' ? -1 : 1, mid = leg.hip[0] + (leg.ft[0] - leg.hip[0]) * 0.4;
        lm.each((x, y) => { const edge = !lm.get(x + ox, y) && y > leg.hip[1] + 2; if (edge && (y % 3 !== 0)) P.px(x, y, rp.light); });
        lm.each((x, y) => { if (y >= leg.ft[1] - 1 && !lm.get(x, y + 1)) P.px(x, y, rp.light); });
        for (let r = 0; r < 3; r++) P.px(leg.hip[0] + (side === 'L' ? 1.5 : -1.5), leg.hip[1] + 1 + r, rp.deep);
      }
      if (id === 'cargo') {
        const px0 = leg.hip[0] + (side === 'L' ? -2.5 : 0.5) + 0, py0 = leg.hip[1] + 4;
        const pk = M().rect(Math.round(px0 - 0.5), Math.round(py0), 4, 4).and(lm);
        shade(P, pk, rp, { cap: 2, hi: true });
        for (let i = 0; i < 4; i++) P.px(Math.round(px0 - 0.5) + i, Math.round(py0), rp.deep);
        P.px(Math.round(px0 + 1), Math.round(py0 + 2), rp.hi);
        lm.each((x, y) => { if (!lm.get(x, y + 1)) P.px(x, y, rp.shade); });
      }
      if (id === 'shorts') { lm.each((x, y) => { if (!lm.get(x, y + 1)) P.px(x, y, rp.deep); if (!lm.get(x, y + 2) && lm.get(x, y + 1)) P.px(x, y, rp.light); }); }
      if (id === 'joggers') {
        lm.each((x, y) => { if (y >= leg.ft[1] - 2) P.px(x, y, ((x + y) & 1) ? rp.light : rp.base); });
        lm.each((x, y) => { if (y >= leg.ft[1] - 2 && !lm.get(x, y + 1)) P.px(x, y, rp.deep); });
        lm.each((x, y) => { if (y > leg.hip[1] + 2 && !lm.get(side === 'L' ? x + 1 : x - 1, y)) P.px(x, y, '#f7f2e8'); });
      }
      if (id === 'baggy') {
        lm.each((x, y) => { const yy = y - Math.round(leg.hip[1]); if (yy % 4 === 3 && ((x + yy) & 1)) P.px(x, y, rp.shade); });
        lm.each((x, y) => { if (y >= leg.ft[1] - 1) P.px(x, y, rp.shade); });
      }
      if (id === 'leggings') {
        lm.each((x, y) => { if (!lm.get(x - 1, y) && !lm.get(x - 1, y - 1) === false && side === 'L') { } });
        const ox = side === 'L' ? 1 : -1;
        lm.each((x, y) => { if (!lm.get(x - ox, y) && ((y & 3) !== 0)) P.px(x, y, rp.hi); });
      }
      if (id === 'trackpants') {
        const r2 = '#f7f2e8', o = side === 'L' ? -1 : 1;
        lm.each((x, y) => { if (y > leg.hip[1] + 2 && !lm.get(x + o, y)) { P.px(x, y, r2); P.px(x - o, y, r2); } });
        lm.each((x, y) => { if (y >= leg.ft[1] - 1 && !lm.get(x, y + 1)) P.px(x, y, rp.deep); });
      }
      if (id === 'slacks') {
        for (let y = Math.round(leg.hip[1]) + 3; y <= leg.ft[1]; y++) { const t = (y - leg.hip[1]) / (leg.ft[1] - leg.hip[1]); const x = Math.round(leg.hip[0] + (leg.ft[0] - leg.hip[0]) * t); if (lm.get(x, y)) P.px(x, y, rp.hi); }
        lm.each((x, y) => { if (!lm.get(x, y + 1)) P.px(x, y, rp.deep); });
      }
      if (id === 'flares') {
        lm.each((x, y) => { if (!lm.get(x, y + 1)) P.px(x, y, rp.deep); if (y > leg.ft[1] - 5 && ((x * 2 + y) % 5 === 0)) P.px(x, y, rp.shade); });
      }
      if (gold) {
        lm.each((x, y) => { if (((x * 5 + y * 3) % 11) === 0) P.px(x, y, '#ffffff'); if (!lm.get(x - 1, y) && side === 'L') P.px(x, y, rp.hi); });
        P.px(leg.hip[0] - 0.5, leg.hip[1] + 6, '#fff'); P.px(leg.hip[0] + 0.5, leg.hip[1] + 7, '#fff');
      }
    }
    // belt / waistband, fly
    const beltC = id === 'slacks' ? '#2a2236' : rp.deep;
    for (let dx = -6.5; dx <= 6.5; dx++) if (hips.get(Math.round(cx + dx), y0 + 13)) P.px(cx + dx, y0 + 13, id === 'jeans' || id === 'slacks' || id === 'cargo' ? beltC : rp.light);
    if (id === 'jeans' || id === 'slacks' || id === 'cargo') { P.px(cx - 0.5, y0 + 13, '#e8c050'); P.px(cx + 0.5, y0 + 13, '#fff0a0'); }
    if (id === 'jeans' || id === 'cargo') { P.px(cx - 0.5, y0 + 14, rp.deep); P.px(cx - 0.5, y0 + 15, rp.deep); }
    if (gold) for (let dx = -6.5; dx <= 6.5; dx++) P.px(cx + dx, y0 + 13, '#fff0a0');
  }

  /* ---------------------------------------------------------------- shoes */
  function shoes(X) {
    const L = X.L, id = L.shoes.id, P = X.P, S = X.S, rp = rpOf(L.shoes.color);
    const sole = { sneakers: '#f7f2e8', hightops: '#f7f2e8', skate: '#e8d8a8', loafers: '#2a2236', boots: '#2a2236', combat: '#1c1826', platform: mix(L.shoes.color, '#f7f2e8', 0.7), goldkicks: '#ffe56a', sandals: mix(L.shoes.color, '#2a2236', 0.2) }[id] || '#f7f2e8';
    for (const side of ['L', 'R']) {
      const leg = S.legs[side], sg = side === 'L' ? -1 : 1, fx = leg.ft[0], fy = Math.round(leg.ft[1]);
      const tall = { hightops: 3, boots: 6, combat: 5 }[id] || 0, plat = id === 'platform' ? 2 : 0;
      const wide = id === 'skate' || id === 'combat' || id === 'platform' ? 1 : 0;
      const x0 = Math.round(fx - 2 + (sg < 0 ? -1 - wide : 0)), x1 = Math.round(fx + 2 + (sg > 0 ? 1 + wide : 0));
      const m = M();
      const h = 4 + (id === 'platform' ? 0 : 0);
      for (let i = 0; i < h; i++) {
        const a = x0 + (i === 0 && sg < 0 ? 1 : 0), b = x1 - (i === 0 && sg > 0 ? 1 : 0);
        for (let x = a; x <= b; x++) m.set(x, fy + i);
      }
      // shaft above the foot
      const shaft = M(); if (tall) for (let i = 1; i <= tall; i++) for (let x = Math.round(fx - 2.2); x <= Math.round(fx + 2.2); x++) shaft.set(x, fy - i);
      const foot = m.clone().or(shaft);
      const sol = M(); for (let x = x0; x <= x1; x++) { sol.set(x, fy + h - 1); if (plat) sol.set(x, fy + h - 2); }
      const upper = foot.clone().sub(sol);
      if (id === 'sandals') {
        // bare foot with a sole and crossing straps
        shade(P, m.clone().sub(sol), X.K.r, { cap: 3 });
        flat(P, sol, sole);
        for (let x = x0; x <= x1; x++) { P.px(x, fy + 1, rp.base); }
        P.px(x0 + 2, fy + 2, rp.light); P.px(x1 - 2, fy + 2, rp.light);
        for (let i = 0; i < 4; i++) P.px(x0 + 1 + i, fy, X.K.r.light);
        P.px(Math.round(fx), fy + 2, X.K.r.shade);
        continue;
      }
      shade(P, upper, rp, { cap: 3, hi: true });
      flat(P, sol, sole);
      // sole edge shading
      sol.each((x, y) => { if (x === (sg < 0 ? x0 : x1) || (y === fy + h - 1 && ((x + y) & 1))) P.px(x, y, mix(sole, '#6a4a8f', 0.28)); });
      switch (id) {
        case 'sneakers': case 'skate': case 'goldkicks': case 'hightops': {
          // toe cap, laces, tongue
          for (let x = Math.round(fx - 1.5); x <= Math.round(fx + 1.5); x++) P.px(x, fy + 1, '#f7f2e8');
          P.px(Math.round(fx - 0.5), fy, '#ffffff'); P.px(Math.round(fx + 0.5), fy, '#e6dff2');
          const tc = id === 'goldkicks' ? '#ffe56a' : rp.deep;
          for (let x = x0 + 0; x <= x1; x++) if (x === x0 || x === x1) P.px(x, fy + 2, tc);
          P.px(Math.round(fx - 1.5), fy + 2, rp.deep); P.px(Math.round(fx + 1.5), fy + 2, rp.deep);
          if (id === 'hightops') for (let i = 1; i <= 3; i++) { P.px(Math.round(fx - 0.5), fy - i, '#f7f2e8'); P.px(Math.round(fx + 0.5), fy - i, i % 2 ? '#e6dff2' : '#f7f2e8'); }
          if (id === 'hightops') for (let x = Math.round(fx - 2); x <= Math.round(fx + 2); x++) P.px(x, fy - 3, '#f7f2e8');
          if (id === 'skate') { for (let x = x0; x <= x1; x++) P.px(x, fy + 1, rp.deep); P.px(Math.round(fx - 0.5), fy, '#ffffff'); P.px(Math.round(fx + 0.5), fy, '#ffffff'); }
          if (id === 'goldkicks') { P.px(x0 + 1, fy + 1, '#fff'); P.px(x1 - 1, fy + 2, '#fff'); P.px(Math.round(fx), fy - 0, '#ffffff'); for (let x = x0; x <= x1; x++) P.px(x, fy + 3, '#ffe56a'); }
          break;
        }
        case 'boots': case 'combat': {
          for (let i = 1; i <= tall; i += 2) { P.px(Math.round(fx - 0.5), fy - i, rp.light); P.px(Math.round(fx + 0.5), fy - i, rp.light); }
          if (id === 'combat') { for (let x = Math.round(fx - 2); x <= Math.round(fx + 2); x++) P.px(x, fy - tall, '#2a2236'); for (let i = 0; i <= 3; i++) { P.px(Math.round(fx - 1), fy - i, '#f7f2e8'); P.px(Math.round(fx + 1), fy - i, '#f7f2e8'); } }
          else { for (let x = Math.round(fx - 2.2); x <= Math.round(fx + 2.2); x++) P.px(x, fy - tall, rp.light); P.px(Math.round(fx - 1.5), fy + 1, rp.hi); }
          sol.each((x, y) => { if (!((x + y) & 1)) P.px(x, y, '#0f0b19'); });
          break;
        }
        case 'platform': {
          for (let x = Math.round(fx - 1.5); x <= Math.round(fx + 1.5); x++) P.px(x, fy + 1, rp.light);
          sol.each((x, y) => { if (y === fy + h - 2) P.px(x, y, mix(sole, '#ffffff', 0.4)); });
          for (let x = x0; x <= x1; x += 2) P.px(x, fy + h - 1, rp.deep);
          break;
        }
        case 'loafers': {
          P.px(Math.round(fx - 0.5), fy + 1, '#e8c050'); P.px(Math.round(fx + 0.5), fy + 1, '#fff0a0');
          for (let x = Math.round(fx - 1.5); x <= Math.round(fx + 1.5); x++) P.px(x, fy, rp.light);
          P.px(Math.round(fx - 1.5), fy + 2, rp.hi);
          break;
        }
      }
    }
  }

  /* ---------------------------------------------------------------- neck */
  function neck(X) {
    const L = X.L, a = L.acc.neck; if (!a || a.id === 'none_neck') return;
    const P = X.P, S = X.S, cx = CX + S.tx, y0 = T0 + S.dy, rp = rpOf(a.color), px = (dx, r, c) => P.px(cx + dx, y0 + r, c);
    switch (a.id) {
      case 'chain': {
        const gold = ramp(a.color);
        for (let r = 1; r <= 5; r++) { const dx = 4.5 - r * 0.9; px(-dx - 0.5, r, r % 2 ? gold.hi : gold.base); px(dx + 0.5, r, r % 2 ? gold.base : gold.hi); }
        px(-0.5, 6, gold.base); px(0.5, 6, gold.base);
        px(-0.5, 7, gold.hi); px(0.5, 7, gold.light); px(-0.5, 8, gold.base); px(0.5, 8, gold.shade); px(0, 9, gold.deep);
        break;
      }
      case 'scarf': {
        const m = M().rows(y0 + 0, [S.G.neck + 2.5, S.G.neck + 3, S.G.neck + 3], cx);
        const tail = M().rect(Math.round(cx + 1), y0 + 2, 4, 9).or(M().rect(Math.round(cx + 2), y0 + 11, 3, 1));
        shade(P, tail, rp, { cap: 3 });
        shade(P, m, rp, { cap: 3 });
        const r2 = rpOf(mix(a.color, '#ffffff', 0.55));
        for (let dx = -6; dx <= 6; dx++) if (((dx + 20) % 3) === 0) { px(dx, 1, r2.base); px(dx, 2, r2.base); }
        tail.each((x, y) => { if ((y - y0) % 3 === 0) P.px(x, y, r2.base); });
        for (let i = 0; i < 4; i++) P.px(Math.round(cx + 1) + i, y0 + 12, i % 2 ? rp.light : rp.shade);
        for (let dx = -5; dx <= 5; dx++) px(dx, 0, rp.light);
        break;
      }
      case 'bowtie': {
        P.px(cx - 0.5, y0 + 1, rp.deep); P.px(cx + 0.5, y0 + 1, rp.deep);
        for (const s of [-1, 1]) { px(s * 1.5 - 0.0 * s + (s > 0 ? 0 : 0), 0, rp.base); px(s * 2.5, 0, rp.light); px(s * 3.5, -0.0 + 0, rp.base); px(s * 3.5, 1, rp.shade); px(s * 2.5, 1, rp.base); px(s * 1.5, 1, rp.shade); px(s * 3.5, 2, rp.base); px(s * 2.5, 2, rp.shade); px(s * 1.5, 2, rp.shade); }
        px(-0.5, 1, rp.light); px(0.5, 1, rp.base); px(-0.5, 2, rp.shade); px(0.5, 2, rp.deep);
        break;
      }
      case 'hpneck': {
        const b = rpOf(a.color);
        for (let r = -1; r <= 2; r++) { px(-4.5, r, b.deep); px(4.5, r, b.deep); }
        px(-3.5, -1, b.deep); px(3.5, -1, b.deep);
        for (const s of [-1, 1]) {
          const cup = M().ellipse(cx + s * 7.5, y0 + 5.5, 2.2, 3.2);
          shade(P, cup, b, { cap: 3, hi: true });
          P.px(cx + s * 7.5, y0 + 5, b.deep); P.px(cx + s * 7.5, y0 + 6, b.deep);
          for (let r = 1; r <= 2; r++) px(s * 5.5, r, b.shade);
        }
        break;
      }
      case 'lanyard': {
        for (let r = 0; r <= 8; r++) { const dx = 3.5 - r * 0.4; px(-dx, r, rp.base); px(dx - 1, r, rp.light); }
        const card = M().rect(Math.round(cx - 2.5), y0 + 9, 5, 6);
        flat(P, card, '#f7f2e8');
        for (let i = 0; i < 5; i++) { P.px(Math.round(cx - 2.5) + i, y0 + 9, '#cfc6e4'); P.px(Math.round(cx - 2.5) + i, y0 + 14, '#cfc6e4'); }
        for (let i = 0; i < 5; i++) P.px(Math.round(cx - 2.5) + i, y0 + 10, rp.base);
        P.px(cx - 1.5, y0 + 12, '#4a3a6a'); P.px(cx - 0.5, y0 + 12, '#4a3a6a'); P.px(cx + 0.5, y0 + 13, '#9a8ab8'); P.px(cx - 1.5, y0 + 13, '#9a8ab8');
        break;
      }
      case 'medal': {
        const g = ramp('#e8b923');
        for (let r = 0; r <= 6; r++) { const dx = 3.5 - r * 0.45; px(-dx, r, '#e63946'); px(dx - 1, r, '#3a5fcd'); }
        px(-0.5, 7, '#e63946'); px(0.5, 7, '#3a5fcd');
        shade(P, M().ellipse(cx, y0 + 9.5, 2.5, 2.5), g, { cap: 3, hi: true });
        P.px(cx - 0.5, y0 + 9, '#fff7b0'); P.px(cx + 0.5, y0 + 10, g.deep);
        break;
      }
    }
  }

  /* ----------------------------------------------------------------- arms */
  function arm(X, side) {
    const P = X.P, S = X.S, B = X.B, K = X.K, a = S.arms[side];
    // contact shadow where the arm lies over the torso
    const am = B.arm[side];
    const rg = ring(am, X.torsoM);
    darkenAt(P, rg, X.hairR ? K.r.deep : K.r.deep, 0.0);
    // sleeve of the top first as skin, then the garment
    Kit.drawArmSkin(P, S, B, K, side);
    sleeve(X, side);
    // hand over the cuff
    const hm = B.hand[side];
    shade(P, hm, K.r, { cap: 3 });
    // thumb hint / knuckle line
    P.px(a.ha[0] - (side === 'L' ? 0 : 0), a.ha[1] + 1, K.r.shade);
    if (S.point === side) { const ox = side === 'L' ? -1 : 1; P.px(a.ha[0] + ox * 2, a.ha[1] - 1, K.r.light); P.px(a.ha[0] + ox * 3, a.ha[1] - 1, K.r.base); P.px(a.ha[0] + ox * 3, a.ha[1] - 2, K.r.hi); }
    wrist(X, side);
    if (side === 'R') heldItem(X);
  }

  function wrist(X, side) {
    const w = X.L.acc.wrist; if (!w || w.id === 'none_wrist') return;
    const P = X.P, S = X.S, a = S.arms[side], rp = rpOf(w.color);
    // a point 80% of the way from the elbow to the hand
    const wx = a.el[0] + (a.ha[0] - a.el[0]) * 0.82, wy = a.el[1] + (a.ha[1] - a.el[1]) * 0.82;
    const bm = M().ellipse(wx, wy, 1.9, 1.3);
    switch (w.id) {
      case 'wristband': { shade(P, M().ellipse(wx, wy, 2.1, 1.6), rp, { cap: 3, hi: true }); P.px(wx - 1, wy, rp.hi); break; }
      case 'watch': {
        if (side !== 'L') return;
        shade(P, M().ellipse(wx, wy, 1.8, 1.3), ramp('#2a2236'), { cap: 3, hi: true });
        P.px(wx, wy, rp.hi); P.px(wx + 1, wy, rp.base); P.px(wx, wy - 1, rp.light);
        break;
      }
      case 'bracelets': {
        const cs = [rp.base, '#ffe14d', '#ff4fa3'];
        for (let i = 0; i < 3; i++) { const yy = Math.round(wy) - 1 + i; for (const dx of [-1, 0, 1]) P.px(Math.round(wx) + dx, yy, i % 2 ? cs[i] : mix(cs[i], '#ffffff', 0.25)); }
        break;
      }
    }
  }

  /* ----------------------------------------------------------- held items */
  function micDraw(P, x, y, kind, col, mouth) {
    const metal = ramp(kind === 'goldmic' ? '#e8b923' : '#aab0c4'), dark = ramp('#2a2236');
    const mesh = kind === 'goldmic' ? ramp('#c98f1a') : kind === 'neonmic' ? ramp(col) : ramp('#8a8aa8');
    // ball head (4x4ish) at the top, handle below
    const hx = mouth ? x - 3 : x, hy = mouth ? y - 1 : y - 5;
    shade(P, M().ellipse(hx + 0.5, hy + 0.5, 1.9, 1.9), mesh, { cap: 3, hi: true });
    if (kind === 'neonmic') { P.px(hx, hy, '#ffffff'); P.px(hx + 1, hy + 1, ramp(col).hi); for (const [ox, oy] of [[-2, 0], [3, 1], [0, -2], [1, 3]]) P.add(hx + ox, hy + oy, col, 90); }
    else { P.px(hx, hy, '#ffffff'); if (kind !== 'goldmic') { P.px(hx + 1, hy + 1, '#4a4a60'); P.px(hx, hy + 1, '#6a6a80'); } else P.px(hx + 1, hy + 1, '#c98f1a'); }
    // collar ring and handle
    if (mouth) {
      P.line(hx + 1, hy + 2, x + 1, y + 1, kind === 'neonmic' ? mesh.light : metal.base);
      P.px(hx + 2, hy + 2, metal.hi); P.px(hx + 2, hy + 3, metal.shade);
    } else {
      P.px(hx, hy + 3, metal.hi); P.px(hx + 1, hy + 3, metal.base);
      for (let i = 0; i < 3; i++) { P.px(hx, hy + 4 + i, metal.light); P.px(hx + 1, hy + 4 + i, kind === 'neonmic' ? mesh.base : metal.shade); }
    }
  }
  function heldItem(X) {
    const h = X.L.acc.hand; if (!h || h.id === 'none_hand') return;
    const S = X.S, P = X.P, a = S.arms.R, hx = Math.round(a.ha[0]), hy = Math.round(a.ha[1]);
    if (h.id === 'boombox') {
      const bx = hx + (S.mic ? -1 : 2), by = S.mic ? hy - 7 : hy - 5, g = ramp(h.color);
      const box = M().rect(bx - 5, by, 11, 7);
      shade(P, box, g, { cap: 3, hi: true });
      for (const sx of [-2.5, 3.5]) { shade(P, M().ellipse(bx + sx, by + 3.5, 1.8, 1.8), ramp('#2a2236'), { cap: 3, hi: true }); P.px(bx + sx, by + 3, '#8a8aa8'); }
      P.rect(bx - 1, by + 1, 3, 2, '#9dff4a'); P.px(bx, by + 1, '#e8ffd0');
      P.px(bx - 4, by + 1, g.hi); P.px(bx - 5, by, g.hi);
      P.line(bx - 3, by, bx - 2, by - 2, '#cfd3e6'); P.px(bx - 2, by - 3, '#ffffff');
      P.line(bx - 3, by - 1, bx + 2, by - 1, g.deep);
      shade(P, X.B.hand.R, X.K.r, { cap: 3 });
      return;
    }
    micDraw(P, hx, hy, h.id, h.color, S.mic);
    shade(P, X.B.hand.R, X.K.r, { cap: 3 });
    // fingers over the handle
    P.px(hx, hy, X.K.r.light); P.px(hx + 1, hy, X.K.r.base);
  }

  /* ----------------------------------------------------------------- back */
  function back(X) {
    const a = X.L.acc.back; if (!a || a.id === 'none_back') return;
    const P = X.P, S = X.S, cx = CX + S.tx, y0 = T0 + S.dy, rp = rpOf(a.color);
    switch (a.id) {
      case 'cape': {
        const m = M().rows(y0 + 2, [5, 7, 8, 8.5, 9, 9.5, 10, 10.5, 11, 11, 11.5, 12, 12.5, 12.5, 13, 13, 13.5, 13.5, 14, 14, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5, 14.5], cx);
        m.clipY(0, 62);
        shade(P, m, rp, { cap: 5, hi: false, bias: 0 });
        m.each((x, y) => { if (!m.get(x, y + 1)) P.px(x, y, ((x + y) & 1) ? rp.shade : rp.deep); if (((x - Math.floor(cx)) % 5 === 0) && y > y0 + 6) P.px(x, y, rp.shade); });
        for (let dx = -7; dx <= 7; dx++) P.px(cx + dx, y0 + 2, rp.light);
        break;
      }
      case 'wings': {
        const g = rpOf(a.color);
        for (const s of [-1, 1]) {
          const wm = M();
          // three layered feather rows fanning out
          for (let i = 0; i < 5; i++) {
            const len = 15 - i * 1.8, ang = -0.9 + i * 0.32;
            wm.capsule(cx + s * 7, y0 + 4 + i * 1.2, cx + s * (7 + Math.cos(ang) * len * 0.9), y0 + 4 + i * 1.2 + Math.sin(ang + 0.35) * len * 0.55 - 5 + i * 2, 1.5, 0.7);
          }
          wm.or(M().poly([[cx + s * 7, y0 + 2], [cx + s * 15, y0 - 8], [cx + s * 20, y0 - 5], [cx + s * 12, y0 + 6]]));
          wm.clipY(0, 62);
          shade(P, wm, g, { cap: 4, hi: true });
          wm.each((x, y) => { if (((x * 3 + y * 5) % 7) === 0) P.px(x, y, g.hi); });
          wm.each((x, y) => { if (!wm.get(x, y + 1) && ((x + y) & 1)) P.add(x, y + 1, a.color, 120); });
          const halo = wm.grow(); halo.each((x, y) => { if (!wm.get(x, y) && ((x + y) & 1) && P.alphaAt(x, y) < 10) P.px(x, y, a.color, 70); });
        }
        break;
      }
      case 'guitar': {
        const g = ramp('#c4642a'), neckC = ramp('#6a3b1c');
        // body peeks out low on the left, neck + headstock above the right shoulder
        const body = M().ellipse(cx - 8, y0 + 18, 5, 5.5).or(M().ellipse(cx - 6, y0 + 13, 3.6, 3.6));
        const nk = M().capsule(cx - 5, y0 + 12, cx + 10, y0 - 4, 1.2, 1.2);
        const hs = M().rect(Math.round(cx + 9), y0 - 8, 4, 4);
        shade(P, nk, neckC, { cap: 2 }); shade(P, hs, ramp('#2a2236'), { cap: 2, hi: true });
        shade(P, body, g, { cap: 4, hi: true });
        P.px(cx - 8, y0 + 18, '#2a2236'); P.px(cx - 9, y0 + 18, '#2a2236'); P.px(cx - 8, y0 + 19, '#120d1f');
        for (const [x, y] of [[cx + 10, y0 - 7], [cx + 12, y0 - 7], [cx + 10, y0 - 5], [cx + 12, y0 - 5]]) P.px(x, y, '#e8c050');
        break;
      }
      case 'backpack': {
        const bag = M().rows(y0 + 1, [10, 10.5, 10.5, 10.5, 10.5, 10.5, 10.5, 10, 9, 8], cx);
        shade(P, bag, rp, { cap: 4, hi: true });
        bag.each((x, y) => { if (!bag.get(x, y - 1)) P.px(x, y, rp.light); });
        break;
      }
    }
  }
  // backpack straps over the shoulders (drawn on the front of the torso)
  function backStraps(X) {
    const a = X.L.acc.back; if (!a || a.id !== 'backpack') return;
    const P = X.P, S = X.S, cx = CX + S.tx, y0 = T0 + S.dy, rp = rpOf(a.color);
    for (const s of [-1, 1]) for (let r = 1; r <= 12; r++) { P.px(cx + s * 5.5, y0 + r, r % 4 === 0 ? rp.deep : rp.base); P.px(cx + s * 4.5, y0 + r, rp.shade); }
    P.px(cx - 5.5, y0 + 13, '#cfd3e6'); P.px(cx + 5.5, y0 + 13, '#cfd3e6');
    if (X.L.acc.back.id === 'guitar') { }
  }
  function strapGuitar(X) {
    const a = X.L.acc.back; if (!a || a.id !== 'guitar') return;
    const P = X.P, S = X.S, cx = CX + S.tx, y0 = T0 + S.dy;
    P.line(cx + 5, y0 + 1, cx - 6, y0 + 14, '#3a2a1a'); P.line(cx + 6, y0 + 1, cx - 5, y0 + 14, '#5a3a22');
  }

  /* --------------------------------------------------------------- glasses */
  function glasses(X) {
    const g = X.L.glasses; if (!g || g.id === 'none') return;
    const P = X.P, S = X.S, hx = Math.round(S.head.x), hy = Math.round(S.head.y), rp = rpOf(g.color);
    const lx = hx - 7, rx0 = 2 * hx - 1 - lx - 3;            // left eye x0 (15), right eye x0 (25)
    const ey = hy + 8;                                       // eye top row
    const px = (x, y, c) => P.px(x, y, c);
    const dark = '#1a1630';
    const lensTint = (m, c, glint) => { shade(P, m, ramp(c), { cap: 3, hi: true }); };
    const frameRing = (x, y, w, h, c, round) => {
      for (let i = 0; i < w; i++) { px(x + i, y, c); px(x + i, y + h - 1, c); }
      for (let j = 0; j < h; j++) { px(x, y + j, c); px(x + w - 1, y + j, c); }
      if (round) { for (const [a, b] of [[x, y], [x + w - 1, y], [x, y + h - 1], [x + w - 1, y + h - 1]]) { P.data[(b * P.w + a) * 4 + 3] = 0; } }
    };
    const temple = (c) => { px(lx - 2, ey + 1, c); px(lx - 3, ey + 1, c); px(rx0 + 5, ey + 1, c); px(rx0 + 6, ey + 1, c); };
    switch (g.id) {
      case 'round': case 'nerd': {
        const w = 6, h = id6(g.id), fx = lx - 1, fx2 = rx0 - 1;
        frameRing(fx, ey - 1, w, h, rp.base, g.id === 'round'); frameRing(fx2, ey - 1, w, h, rp.base, g.id === 'round');
        px(fx + 1, ey - 1, rp.hi); px(fx2 + 1, ey - 1, rp.hi);
        for (let x = fx + w; x < fx2; x++) px(x, ey, rp.base);
        temple(rp.shade);
        
        break;
      }
      case 'shades': case 'wayfarer': {
        const way = g.id === 'wayfarer';
        for (const x0 of [lx - 1, rx0 - 1]) {
          const m = M().rect(x0, ey, 6, 4); if (!way) { m.set(x0, ey + 3, 0); m.set(x0 + 5, ey + 3, 0); }
          flat(P, m, dark);
          for (let i = 0; i < 6; i++) px(x0 + i, ey - 1, rp.base);
          if (way) { px(x0, ey - 1, rp.hi); px(x0 + 5, ey - 1, rp.base); px(x0 - 1 + (x0 > hx ? 7 : 0), ey, rp.base); }
          px(x0 + 1, ey + 1, '#8a7ac8'); px(x0 + 2, ey, '#b8a8ff');
          px(x0 + 4, ey + 2, '#2a2060');
        }
        for (let x = lx + 5; x < rx0 - 1; x++) px(x, ey - 1, rp.base);
        temple(rp.shade);
        break;
      }
      case 'aviator': {
        for (const x0 of [lx - 1, rx0 - 1]) {
          const m = M().rows(ey, [3, 3, 3, 2.5, 1.5], x0 + 2.5);
          flat(P, m, '#2d4a5a');
          m.each((x, y) => { if (!m.get(x, y - 1) || !m.get(x - 1, y) || !m.get(x + 1, y) || !m.get(x, y + 1)) px(x, y, rp.base); });
          px(x0 + 1, ey + 1, '#cfe9ff'); px(x0 + 2, ey + 1, '#8fb8d8'); px(x0 + 3, ey + 2, '#4a7a98');
        }
        px(lx + 5, ey, rp.base); px(lx + 6, ey, rp.base); px(rx0 - 3, ey, rp.base); px(rx0 - 2, ey, rp.base); for (let x = lx + 5; x < rx0 - 1; x++) px(x, ey, rp.base);
        temple(rp.shade);
        break;
      }
      case 'sport': {
        const m = M().rect(lx - 2, ey, 21, 4);
        for (const [x, y] of [[lx - 2, ey + 3], [lx + 18, ey + 3], [lx - 2, ey], [lx + 18, ey]]) m.set(x, y, 0);
        const lens = ramp(g.color);
        shade(P, m, lens, { cap: 3, hi: true });
        for (let x = lx - 2; x <= lx + 18; x++) px(x, ey - 1, '#1a1630');
        for (let x = lx + 8; x <= lx + 10; x++) for (let y = ey; y <= ey + 3; y++) px(x, y, '#1a1630');
        for (let x = lx; x <= lx + 4; x += 2) px(x, ey + 1, '#ffffff');
        for (let x = rx0 - 1; x <= rx0 + 3; x += 2) px(x, ey + 1, '#ffffff');
        px(lx - 3, ey + 1, '#1a1630'); px(lx + 19, ey + 1, '#1a1630');
        break;
      }
      case 'heart': {
        const hmap = ['.##.##.', '#######', '.#####.', '..###..', '...#...'];
        const hr = ramp(g.color);
        for (const x0 of [lx - 2, rx0 - 2]) {
          for (let j = 0; j < hmap.length; j++) for (let i = 0; i < 7; i++) if (hmap[j][i] === '#') px(x0 + i, ey - 1 + j, (j === 0 && i < 3) || (j === 1 && i < 2) ? hr.hi : j > 2 ? hr.shade : hr.base);
          px(x0 + 1, ey, '#ffffff');
        }
        px(lx + 5, ey, hr.deep); px(rx0 - 2, ey, hr.deep); px(lx + 6, ey, hr.deep); px(rx0 - 3, ey, hr.deep);
        px(lx - 3, ey, hr.deep); px(rx0 + 6, ey, hr.deep);
        break;
      }
      case 'star': {
        const smap = ['...#...', '...#...', '#######', '.#####.', '..###..', '.##.##.'];
        const sr = ramp(g.color);
        for (const x0 of [lx - 2, rx0 - 2]) {
          for (let j = 0; j < smap.length; j++) for (let i = 0; i < 7; i++) if (smap[j][i] === '#') px(x0 + i, ey - 2 + j, j < 2 ? sr.hi : j > 3 ? sr.shade : sr.base);
          px(x0 + 3, ey, '#ffffff');
        }
        px(lx + 5, ey + 1, sr.deep); px(rx0 - 3, ey + 1, sr.deep); px(lx + 6, ey + 1, sr.deep); px(rx0 - 2, ey + 1, sr.deep);
        px(lx - 3, ey + 1, sr.deep); px(rx0 + 6, ey + 1, sr.deep);
        break;
      }
      case 'pixel': {
        const c = g.color, lt = mix(c, '#ffffff', 0.35);
        for (let x = lx - 2; x <= rx0 + 5; x++) px(x, ey - 1, c);
        for (let x = lx - 2; x <= lx + 5; x++) { px(x, ey, c); } for (let x = rx0 - 2; x <= rx0 + 5; x++) { px(x, ey, c); }
        for (let x = lx - 1; x <= lx + 4; x++) px(x, ey + 1, c); for (let x = rx0 - 1; x <= rx0 + 4; x++) px(x, ey + 1, c);
        for (let x = lx; x <= lx + 3; x++) px(x, ey + 2, c); for (let x = rx0; x <= rx0 + 3; x++) px(x, ey + 2, c);
        px(lx - 2, ey - 1, lt); px(lx - 1, ey - 1, lt); px(lx + 1, ey, lt); px(lx + 2, ey, lt); px(rx0 + 1, ey, lt); px(rx0 + 2, ey, lt);
        px(lx - 3, ey - 1, c); px(rx0 + 6, ey - 1, c);
        break;
      }
      case 'monocle': {
        const x0 = rx0 - 1, rr = ramp(g.color);
        frameRing(x0, ey - 1, 6, 6, rr.base, true);
        px(x0 + 1, ey - 1, rr.hi); px(x0, ey, rr.hi);
        px(x0 + 1, ey, '#ffffff');
        // chain
        for (let i = 0; i < 9; i++) px(x0 + 5 + (i > 3 ? 1 : 0), ey + 5 + i, i % 2 ? rr.base : rr.light);
        break;
      }
      case 'goggles': {
        const br = ramp('#8a5a30'), brass = ramp('#d4a017');
        for (let x = lx - 4; x <= rx0 + 7; x++) { px(x, ey - 1, br.base); px(x, ey - 2, x % 3 ? br.shade : br.deep); }
        for (const x0 of [lx - 1, rx0 - 1]) {
          const lens = M().ellipse(x0 + 2.5, ey + 1.5, 2.6, 2.6);
          shade(P, lens, ramp('#2a8aa8'), { cap: 3, hi: true });
          lens.grow().each((x, y) => { if (!lens.get(x, y)) px(x, y, brass.base); });
          px(x0, ey, brass.hi); px(x0 + 5, ey + 3, brass.shade);
          px(x0 + 1, ey, '#e8ffff'); px(x0 + 1, ey + 1, '#8fe0ff');
        }
        px(lx + 5, ey + 1, brass.shade); px(rx0 - 2, ey + 1, brass.shade); px(lx + 6, ey + 1, brass.base); px(rx0 - 3, ey + 1, brass.base);
        px(lx - 5, ey - 1, br.shade); px(rx0 + 8, ey - 1, br.shade);
        break;
      }
      case 'vr': {
        const m = M().rect(lx - 2, ey - 1, 21, 6); for (const [x, y] of [[lx - 2, ey - 1], [lx + 18, ey - 1], [lx - 2, ey + 4], [lx + 18, ey + 4]]) m.set(x, y, 0);
        shade(P, m, rp, { cap: 3, hi: true });
        const vis = M().rect(lx - 1, ey, 19, 4); vis.set(lx - 1, ey + 3, 0); vis.set(lx + 17, ey + 3, 0);
        flat(P, vis, '#120d1f');
        for (let x = lx; x <= lx + 16; x++) { px(x, ey + 1, '#2ee6ff'); if (x % 2 === 0) px(x, ey + 2, '#1a8aa8'); }
        for (let x = lx + 8; x <= lx + 9; x++) for (let y = ey; y <= ey + 3; y++) px(x, y, rp.shade);
        px(lx, ey, '#8ff0ff'); px(rx0 + 1, ey, '#8ff0ff');
        for (let x = lx - 1; x <= lx + 17; x += 3) P.add(x, ey + 4, '#2ee6ff', 90);
        px(lx - 3, ey + 1, rp.shade); px(lx + 19, ey + 1, rp.shade);
        break;
      }
      case 'neonbar': {
        const m = M().rect(lx - 2, ey + 0, 20, 3);
        flat(P, m, '#120d1f');
        for (let x = lx - 2; x <= lx + 17; x++) { px(x, ey + 1, g.color); px(x, ey - 1, rp.deep); if ((x & 1) === 0) { P.add(x, ey - 2, g.color, 90); P.add(x, ey + 3, g.color, 90); } }
        for (let x = lx - 1; x <= lx + 16; x++) px(x, ey + 1, x % 4 ? g.color : '#ffffff');
        px(lx - 3, ey + 1, rp.base); px(lx + 18, ey + 1, rp.base);
        break;
      }
      case 'eyepatch': {
        const x0 = lx - 1;
        const m = M().rows(ey - 1, [3.2, 3.5, 3.5, 3, 2], x0 + 2.5);
        shade(P, m, ramp(mix(g.color, '#3a3050', 0.25)), { cap: 3, hi: true });
        px(x0 + 1, ey, '#8a7ab0'); px(x0 + 2, ey, '#6a5a90');
        // strap across the forehead to the back of the head
        P.line(x0 + 3, ey - 2, rx0 + 3, ey - 6, mix(g.color, '#3a3050', 0.4));
        P.line(x0 + 3, ey - 1, rx0 + 4, ey - 5, mix(g.color, '#6a5a90', 0.3));
        P.line(x0 - 1, ey + 1, x0 - 5, ey - 1, mix(g.color, '#3a3050', 0.4));
        break;
      }
    }
  }
  const id6 = (id) => (id === 'round' ? 6 : 5);

  /* ----------------------------------------------------------------- ears */
  function ears(X) {
    const a = X.L.acc.ears; if (!a || a.id === 'none_ears') return;
    const P = X.P, S = X.S, hx = Math.round(S.head.x), hy = Math.round(S.head.y), rp = rpOf(a.color);
    const exs = [hx - 11, hx + 10];            // outer ear columns
    switch (a.id) {
      case 'studs': for (const x of exs) { P.px(x, hy + 11, rp.hi); P.px(x, hy + 12, rp.base); } break;
      case 'hoops': for (const [i, x] of exs.entries()) { const s = i ? 1 : -1; P.px(x, hy + 12, rp.base); P.px(x + s, hy + 13, rp.hi); P.px(x + s, hy + 14, rp.base); P.px(x, hy + 15, rp.shade); } break;
      case 'dangles': for (const [i, x] of exs.entries()) { P.px(x, hy + 11, rp.hi); P.px(x, hy + 12, rp.light); P.px(x, hy + 13, rp.base); const sy = hy + 15; const sc = '#ffe14d'; P.px(x, sy - 1, sc); P.px(x - 1, sy, sc); P.px(x, sy, '#fff7b0'); P.px(x + 1, sy, sc); P.px(x, sy + 1, sc); } break;
      case 'hpears': {
        const hm = Kit.headMask(S);
        const r1 = hm.clone().clipY(0, hy + 8).grow().grow(), r0 = hm.clone().clipY(0, hy + 8).grow();
        const band = r1.clone().sub(r0).clipY(0, hy + 9);
        shade(P, band, rp, { cap: 2, hi: true });
        for (const [i, x] of exs.entries()) {
          const s = i ? 1 : -1;
          const cup = M().rows(hy + 7, [3, 3.5, 3.5, 3.5, 3.5, 3.5, 3], x + 0.5 + s * 0.5 + (s > 0 ? -0.5 : 0.5) * 0);
          const c2 = M().rect(x - 2 + (s > 0 ? 0 : 0), hy + 7, 5, 7);
          c2.set(x - 2, hy + 7, 0); c2.set(x + 2, hy + 7, 0); c2.set(x - 2, hy + 13, 0); c2.set(x + 2, hy + 13, 0);
          shade(P, c2, rp, { cap: 3, hi: true });
          P.rect(x - 1 + (s > 0 ? 0 : 0), hy + 9, 3, 3, ramp(mix(a.color, '#17141f', 0.55)).base);
          P.px(x, hy + 10, rp.hi);
        }
        break;
      }
    }
  }

  Object.assign(BBH, { CharsGear: { back, bottom, shoes, top, neck, glasses, ears, arm, backStraps, strapGuitar, TOPS, BOT } });
  // straps are painted right after the top
  const _top = top;
  BBH.CharsGear.top = function (X) { _top(X); backStraps(X); strapGuitar(X); };
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsGear;
})(typeof globalThis !== 'undefined' ? globalThis : this);
