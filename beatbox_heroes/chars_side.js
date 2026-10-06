// BEATBOX HEROES -- chars_side.js
// Part 5 of the character renderer: the PROFILE views ('walkside', 'idleside', 'beatboxside'). The hero faces RIGHT;
// the game mirrors with opts.flip for left. This file holds the side skeleton (two-bone legs and arms with real
// walk-cycle kinematics), the profile body and head, the single eye, brow, mouth, marks, facial hair and every
// hair style adapted to profile. Hats, glasses, clothes, shoes and accessories live in chars_side2.js.
// Same design-unit authoring as the front view (44x64 design, rasterised natively on the current grid).
// Profile light comes from the upper FRONT so the face reads well; the flipped (left-facing) sprite is lit from the upper left.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
    if (!BBH.CharsHair) require('./chars_hair.js');
  }
  const { PAL, mix } = BBH;
  const Kit = BBH.CharsKit, Hair = BBH.CharsHair, { CX, HY, M, Painter, shade, flat, GR, X, Y, iX, iY, nx, ny, edge, ring } = Kit;
  const ramp = (c) => Kit.softRamp(c);
  const DIR = [1, -1];
  const sh = (P, m, rp, o) => shade(P, m, rp, Object.assign({ dir: DIR }, o || {}));
  const GROUND = 62.6;                                     // bottom of the soles (design y); the outline takes the row below
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000; };

  const SIDE = { walkside: { frames: 6, fps: 10 }, idleside: { frames: 2, fps: 2 }, beatboxside: { frames: 4, fps: 9 } };
  Object.assign(Kit.POSES, SIDE);
  const isSide = (p) => !!SIDE[p];

  /* ----------------------------------------------------------------- geometry */
  // torso depth per row (row 0 is the neck base): back / front half depths around x = 20.5
  const GS = {
    boy: { hb: [2.5, 4.2, 5.0, 5.4, 5.4, 5.3, 5.1, 5.0, 5.0, 5.0, 5.0, 5.0, 5.0, 5.1, 5.2, 5.2, 5.2], hf: [2.5, 3.8, 5.0, 5.5, 5.6, 5.6, 5.4, 5.2, 5.0, 5.0, 5.0, 5.1, 5.2, 5.2, 5.2, 5.2, 5.2], legR: [3.0, 2.6, 2.0], armR: [1.9, 1.6], neck: 2.3 },
    neutral: { hb: [2.4, 3.9, 4.6, 5.0, 5.0, 4.9, 4.7, 4.6, 4.5, 4.5, 4.5, 4.6, 4.7, 4.8, 4.9, 4.9, 4.9], hf: [2.4, 3.5, 4.6, 5.0, 5.2, 5.2, 5.0, 4.8, 4.6, 4.5, 4.5, 4.6, 4.7, 4.8, 4.8, 4.8, 4.8], legR: [2.8, 2.4, 1.9], armR: [1.8, 1.5], neck: 2.1 },
    girl: { hb: [2.2, 3.5, 4.2, 4.5, 4.5, 4.4, 4.2, 4.0, 3.9, 3.9, 4.0, 4.2, 4.5, 4.8, 5.0, 5.0, 5.0], hf: [2.2, 3.2, 4.2, 4.8, 5.4, 5.6, 5.0, 4.4, 4.0, 3.9, 4.0, 4.2, 4.5, 4.6, 4.7, 4.7, 4.7], legR: [2.5, 2.1, 1.7], armR: [1.6, 1.4], neck: 1.9 },
  };
  const LEG = { L1: 7.1, L2: 7.1 }, ARM = { L1: 5.9, L2: 5.7 };

  // frame tables. leg: [thigh angle, knee bend] (+angle = forward), arm: [shoulder swing, elbow flex] or 'mouth'
  const WALK = [
    { N: [0.55, 0.05], F: [-0.5, 0.2] }, { N: [0.28, 0.15], F: [-0.18, 0.95] }, { N: [0.0, 0.05], F: [0.35, 0.95] },
    { N: [-0.5, 0.2], F: [0.55, 0.05] }, { N: [-0.18, 0.95], F: [0.28, 0.15] }, { N: [0.35, 0.95], F: [0.0, 0.05] },
  ];
  const FR_S = {
    walkside: WALK.map((w) => ({ legs: w, arms: { N: [-0.95 * w.N[0], 0.25 + 0.5 * Math.max(0, -0.95 * w.N[0])], F: [-0.95 * w.F[0], 0.25 + 0.5 * Math.max(0, -0.95 * w.F[0])] }, mouth: 'smile', eyes: 'open', lean: 0.5 })),
    idleside: [
      { legs: { N: [0.07, 0.02], F: [-0.07, 0.02] }, arms: { N: [0.06, 0.2], F: [-0.08, 0.2] }, mouth: 'smile', eyes: 'open', lean: 0 },
      { legs: { N: [0.07, 0.02], F: [-0.07, 0.02] }, arms: { N: [0.08, 0.22], F: [-0.1, 0.22] }, mouth: 'smile', eyes: 'open', lean: 0, rise: -0.5 },
    ],
    beatboxside: [
      { legs: { N: [0.12, 0.1], F: [-0.14, 0.12] }, arms: { N: 'mouth', F: [-0.1, 0.3] }, mouth: 'o', eyes: 'open', lean: 0.3 },
      { legs: { N: [0.14, 0.32], F: [-0.16, 0.34] }, arms: { N: 'mouth', F: [0.0, 0.34] }, mouth: 'puff', eyes: 'happy', puff: 1, lean: 0.5 },
      { legs: { N: [0.12, 0.1], F: [-0.14, 0.12] }, arms: { N: 'mouth', F: [-0.1, 0.3] }, mouth: 'open', eyes: 'open', lean: 0.3 },
      { legs: { N: [0.14, 0.32], F: [-0.16, 0.34] }, arms: { N: 'mouth', F: [0.0, 0.34] }, mouth: 'puff', eyes: 'happy', puff: 1, lean: 0.5 },
    ],
  };
  const footAng = (t) => Math.max(-0.6, Math.min(0.5, 0.7 * t));
  const rotF = (an, phi, u, v) => [an[0] + u * Math.cos(phi) + v * Math.sin(phi), an[1] - u * Math.sin(phi) + v * Math.cos(phi)];

  function ik(sh0, target, l1, l2) {
    let dx = target[0] - sh0[0], dy = target[1] - sh0[1], d = Math.hypot(dx, dy);
    d = Math.min(d, l1 + l2 - 0.05); const ux = dx / (Math.hypot(dx, dy) || 1), uy = dy / (Math.hypot(dx, dy) || 1);
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const e1 = [sh0[0] + ux * a - uy * h, sh0[1] + uy * a + ux * h], e2 = [sh0[0] + ux * a + uy * h, sh0[1] + uy * a - ux * h];
    const el = e1[1] > e2[1] ? e1 : e2;
    return { el, ha: [sh0[0] + ux * d, sh0[1] + uy * d] };
  }

  function skelSide(body, pose, frame, opts) {
    opts = opts || {};
    const G = GS[body] || GS.neutral, tbl = FR_S[pose] || FR_S.idleside, f = tbl[((frame % tbl.length) + tbl.length) % tbl.length];
    const legs = {}; let maxY = -1e9;
    for (const sd of ['N', 'F']) {
      const [a, b] = f.legs[sd], hip = [sd === 'N' ? 20.9 : 20.1, 0];
      const kn = [hip[0] + LEG.L1 * Math.sin(a), hip[1] + LEG.L1 * Math.cos(a)], t = a - b;
      const an = [kn[0] + LEG.L2 * Math.sin(t), kn[1] + LEG.L2 * Math.cos(t)], phi = footAng(t);
      const low = Math.max(rotF(an, phi, -2.7, 4.4)[1], rotF(an, phi, 5.9, 4.4)[1]);
      maxY = Math.max(maxY, low); legs[sd] = { a, b, phi, hip, kn, an };
    }
    let hipY = Math.round((GROUND - maxY) * 2) / 2 + (f.rise || 0);
    for (const sd of ['N', 'F']) { const L = legs[sd]; L.hip = [L.hip[0], hipY]; L.kn = [L.kn[0], L.kn[1] + hipY]; L.an = [L.an[0], L.an[1] + hipY]; }
    const dyB = hipY - 44, lean = f.lean || 0;
    const S = {
      pose, frame, body, G, hipY, dyB, lean, legs, arms: {}, side: true, f,
      face: { mouth: f.mouth || 'smile', eyes: f.eyes || 'open', brow: 'neutral', puff: !!f.puff, tear: false },
      mic: pose === 'beatboxside', point: '',
    };
    if (opts.blink && S.face.eyes === 'open') S.face.eyes = 'blink';
    if (opts.mood) Object.assign(S.face, opts.mood);
    for (const sd of ['N', 'F']) {
      const sh0 = [sd === 'N' ? 20.7 + lean * 0.3 : 20.3 + lean * 0.3, hipY - 12];
      const spec = f.arms[sd];
      let el, ha;
      if (spec === 'mouth') {
        const tgt = [27.9 + lean * 0.2, 28.4 + dyB];
        ({ el, ha } = ik(sh0, tgt, ARM.L1, ARM.L2));
      } else {
        const [s, e] = spec;
        el = [sh0[0] + ARM.L1 * Math.sin(s), sh0[1] + ARM.L1 * Math.cos(s)];
        ha = [el[0] + ARM.L2 * Math.sin(s + e), el[1] + ARM.L2 * Math.cos(s + e)];
      }
      S.arms[sd] = { sh: sh0, el, ha };
    }
    return S;
  }

  /* ---------------------------------------------------------------- body masks */
  // polygon from per-row back / front edges (design units)
  function rowsLR(y0, back, front, cx, lean) {
    const n = back.length, Lp = [], Rp = [];
    for (let i = 0; i < n; i++) { const c = cx + lean * (1 - i / (n - 1)); Lp.push([c - back[i], y0 + i]); Rp.push([c + front[i], y0 + i]); }
    const c0 = cx + lean, c1 = cx;
    Lp.unshift([c0 - back[0], y0 - 0.5]); Rp.unshift([c0 + front[0], y0 - 0.5]);
    Lp.push([c1 - back[n - 1], y0 + n - 0.5]); Rp.push([c1 + front[n - 1], y0 + n - 0.5]);
    return M().poly(Lp.concat(Rp.reverse()));
  }
  function torsoSide(S) { return rowsLR(S.hipY - 15, S.G.hb, S.G.hf, 20.5, S.lean); }
  function hipsSide(S) { const G = S.G; return rowsLR(S.hipY - 2, [G.hb[14], G.hb[15], G.hb[16]], [G.hf[14], G.hf[15], G.hf[16]], 20.5, 0); }
  // a two-segment limb (thigh+shin or upper+forearm); t0..t1 select the covered part, k widens
  function limbMask(p0, p1, p2, r, t0, t1, k) {
    const m = M(), r0 = r[0] + k, r1 = r[1] + k, r2 = r[2] === undefined ? r[1] + k : r[2] + k;
    if (t0 < 0.5) m.capsule(p0[0], p0[1], p1[0], p1[1], r0, r1, Math.max(0, t0 * 2), Math.min(1, t1 * 2));
    if (t1 > 0.5) m.capsule(p1[0], p1[1], p2[0], p2[1], r1, r2, Math.max(0, t0 * 2 - 1), Math.min(1, t1 * 2 - 1));
    return m;
  }
  const legMaskS = (S, sd, t0, t1, k) => { const L = S.legs[sd]; return limbMask(L.hip, L.kn, L.an, S.G.legR, t0 === undefined ? 0 : t0, t1 === undefined ? 1 : t1, k || 0); };
  const armMaskS = (S, sd, t0, t1, k) => { const A = S.arms[sd]; return limbMask(A.sh, A.el, A.ha, [S.G.armR[0], (S.G.armR[0] + S.G.armR[1]) / 2, S.G.armR[1]], t0 === undefined ? 0 : t0, t1 === undefined ? 1 : t1, k || 0); };
  function bodyMasksS(S) {
    const B = { torso: torsoSide(S), leg: {}, arm: {}, hand: {} };
    for (const sd of ['N', 'F']) { B.leg[sd] = legMaskS(S, sd); B.arm[sd] = armMaskS(S, sd); B.hand[sd] = M().ellipse(S.arms[sd].ha[0], S.arms[sd].ha[1], 1.6, 1.7); }
    return B;
  }

  /* ----------------------------------------------------------------- head */
  const FACE_PTS = [[22, 12], [27.6, 13.2], [29.3, 15.6], [29.9, 17.6], [29.6, 19.0], [30.0, 19.9], [32.2, 22.3], [30.5, 23.5], [30.0, 24.2], [30.6, 24.9], [30.1, 26.0], [29.5, 26.8], [29.3, 28.3], [27.8, 29.6], [22.5, 29.4], [17.5, 26.5], [15.5, 21], [22, 17]];
  const FACEWIN = [[28.6, 13.4], [31.2, 14.6], [33.5, 21], [32, 31], [23.6, 31], [23.8, 17.6], [25.2, 15.4]];
  const HAIRLINE = [[33, 4], [29.4, 12.8], [27.4, 14.3], [24.6, 15.0], [22.4, 16.0], [21.6, 19.0], [21.2, 22.4], [19.4, 22.0], [18.0, 24.2], [16.2, 25.2], [10, 27], [8, 4]];
  function headLocal(S) {
    const m = M().ellipse(20.0, 19.2, 8.9, 8.4).or(M().poly(FACE_PTS));
    if (S.face.puff) m.or(M().ellipse(26.4, 24.4, 2.9, 2.7));
    return m;
  }
  const oyOf = (S) => ny(S.dyB);

  function skinColsS(look) { return Kit.skinCols(look.skin); }

  function drawHeadSkinS(P, S, look, K) {
    const oy = oyOf(S), hm = headLocal(S).shiftN(0, oy), D = new Painter(P).shiftN(0, oy);
    const nk = M().rect(18.8, 26, 4.4, 6).shiftN(0, oy); flat(P, nk, K.r.shade);
    nk.each((x, y) => { const v = iY(y - oy); if (v >= 28.6) P.px(x, y, mix(K.r.shade, K.r.deep, 0.5)); });
    sh(P, hm, K.r, { cap: 4, hi: K.dark });
    // forehead and cheekbone light, jaw shade
    const hl = M().ellipse(27.3, 15.4, 1.6, 1.3).shiftN(0, oy).and(hm); hl.each((x, y) => P.px(x, y, K.r.light));
    const ck = M().ellipse(26.0, 22.6, 1.6, 1.1).shiftN(0, oy).and(hm); ck.each((x, y) => { if ((x + y) & 1) P.px(x, y, K.r.light); });
    if (GR.k > 1.8) { const jw = hm.clone().and(M().fn(0, 27.2, 44, 31, () => true).shiftN(0, oy)); jw.each((x, y) => { if (((x + y) & 1) === 0) P.px(x, y, K.r.shade); }); }
    // ear
    const ear = M().ellipse(19.7, 20.6, 1.7, 2.6).shiftN(0, oy); sh(P, ear, K.r, { cap: 2 });
    D.px(19.6, 20.4, K.r.shade); D.px(19.2, 21.6, K.r.deep); D.px(19.8, 19.2, K.r.light);
    return hm;
  }

  /* --------------------------------------------------------------- face */
  const EYE_S = {
    round: { rw: 1.5, rh: 2.35, ri: 1.7 }, sharp: { rw: 1.65, rh: 2.0, ri: 1.45, tilt: -0.35, lash: 1 }, sleepy: { rw: 1.55, rh: 2.1, ri: 1.65, lid: 0.42 },
    wide: { rw: 1.7, rh: 3.0, ri: 2.05, big: 1 }, lashes: { rw: 1.5, rh: 2.35, ri: 1.7, lash: 3 }, cat: { rw: 1.8, rh: 2.0, ri: 1.55, tilt: 0.5, lash: 2, slit: 1 },
    happy: { rw: 1.6, rh: 2.2, ri: 1.5 }, star: { rw: 1.7, rh: 2.7, ri: 1.8, star: 1 },
  };
  const EYE_C = [27.5, 19.5];                                // eye centre (design)

  function drawEyeS(P, S, look, K) {
    const oy = oyOf(S), D = new Painter(P).shiftN(0, oy), st = EYE_S[look.eyes.style] || EYE_S.round, state = S.face.eyes;
    const [cx, cy] = EYE_C, ir = ramp(look.eyes.color), pup = mix(PAL.ink, look.eyes.color, 0.15), kk = GR.k, lw = GR.t;
    const put = (m, c) => m.each((x, y) => P.px(x, y + oy, c));
    if (state === 'blink' || state === 'closed') {
      put(M().fn(cx - 2.2, cy - 0.5, cx + 2.2, cy + 2.4, (x, y) => { const u = (x - cx) / 1.8; return Math.abs(u) <= 1 && Math.abs(y - (cy + 0.9 + 0.7 * u * u)) <= 0.42 + lw * 0.1; }), K.lid);
      if (st.lash) D.line(cx + 1.6, cy + 1.3, cx + 2.8, cy + 0.6, K.lid);
      return;
    }
    if (state === 'happy') {
      const A = (x, y) => { const u = (x - cx) / 1.9; return u * u + ((y - (cy + 1.2)) / 2.0) ** 2 <= 1; }, B = (x, y) => { const u = (x - cx) / 1.9; return u * u + ((y - (cy + 2.15)) / 2.0) ** 2 <= 1; };
      put(M().fn(cx - 2.4, cy - 2, cx + 2.4, cy + 3, (x, y) => A(x, y) && !B(x, y) && y < cy + 1.6), K.lid);
      D.line(cx + 1.8, cy + 0.5, cx + 3.0, cy - 0.3, K.lid);
      return;
    }
    if (state === 'hurt') { D.poly([[cx - 1.5, cy - 1.7], [cx + 1.6, cy + 0.1], [cx - 1.5, cy + 1.9]], K.lid); return; }
    const down = state === 'down', rw = st.rw, rh = down ? st.rh * 0.86 : st.rh, tilt = st.tilt || 0, ecy = cy + (down ? 0.5 : 0);
    const inSock = (x, y) => { const du = x - cx, dv = (y - ecy) + tilt * du; return (du / rw) ** 2 + (dv / rh) ** 2 <= 1; };
    const sock = M().fn(cx - rw - 1, ecy - rh - 2, cx + rw + 1, ecy + rh + 2, inSock);
    const lidCut = st.lid || (down ? 0.3 : 0), lidY = ecy - rh + rh * 2 * lidCut;
    const open = lidCut ? sock.clone().sub(M().fn(cx - 4, ecy - 4, cx + 4, lidY, () => true)) : sock;
    open.each((x, y) => { const yy = iY(y); P.px(x, y + oy, yy < ecy - rh + 1.05 + (lidCut ? rh * 2 * lidCut : 0) ? K.whiteSh : K.white); });
    const icx = cx + 0.4, icy = ecy - 0.05 + (down ? 0.6 : 0), ri = st.ri;
    const irisM = M().fn(icx - ri - 1, icy - ri - 1, icx + ri + 1, icy + ri + 1, (x, y) => { const a = (x - icx) / (ri * 0.8), b = (y - icy) / (ri * (st.slit ? 1.1 : 1)); return a * a + b * b <= 1; }).and(open);
    irisM.each((x, y) => {
      const yy = iY(y), t = (yy - (icy - ri)) / (2 * ri), dist = Math.hypot((iX(x) - icx) / 0.8, yy - icy) / ri;
      let c = t < 0.3 ? ir.deep : t < 0.62 ? ir.base : t < 0.85 ? mix(ir.base, ir.light, 0.5) : ir.light;
      if (dist > 0.82 && kk > 1.8) c = ir.shade;
      P.px(x, y + oy, c);
    });
    if (st.star) {
      const star = M().fn(icx - 2, icy - 2, icx + 2, icy + 2, (x, y) => { const dx = (x - icx) * 1.2, dy = y - icy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2, seg = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= 0.95 + 0.85 * Math.max(0, 1 - Math.abs(seg) / (Math.PI / 5)); });
      put(star, '#ffe14d'); D.px(icx, icy, '#fff7b0');
    } else {
      const pm = M().fn(icx - 1.2, icy - 1.5, icx + 1.2, icy + 1.5, (x, y) => ((x - icx) / (st.slit ? 0.3 : 0.7)) ** 2 + ((y - (icy + 0.05)) / (st.slit ? 1.4 : 0.9)) ** 2 <= 1).and(open);
      put(pm, pup);
      D.px(icx - 0.5, icy - 0.8, '#ffffff');
      if (kk > 1.8 || st.big) D.px(icx + 0.5, icy + 0.9, '#fff0f8');
    }
    const topEdge = M(); open.each((x, y) => { let free = true; for (let q = 1; q <= lw; q++) if (open.get(x, y - q)) { free = false; break; } if (free) topEdge.set(x, y); });
    put(topEdge, K.lid);
    const corner = M(); topEdge.each((x, y) => { if (iX(x) > cx - 0.2) corner.set(x, y - 1); }); put(corner, K.lid);
    if (lidCut) put(sock.clone().and(M().fn(cx - 4, ecy - 4, cx + 4, lidY, () => true)), K.r.shade);
    const lash = st.lash || 0, ox0 = cx + rw - 0.3, oy0 = ecy - rh * 0.45;
    if (lash >= 1) D.line(ox0, oy0, ox0 + 1.5, oy0 - 1.1, K.lid);
    if (lash >= 2) D.line(ox0 + 1.5, oy0 - 1.1, ox0 + 2.6, oy0 - 2.1, K.lid);
    if (lash >= 3) { D.line(ox0 - 0.8, oy0 - 1.2, ox0 + 0.5, oy0 - 2.6, K.lid); D.line(ox0 - 1.8, oy0 - 1.5, ox0 - 0.9, oy0 - 2.9, K.lid); }
  }

  function drawBrowS(P, S, look, hairR, K) {
    const id = look.brows, oy = oyOf(S), D = new Painter(P).shiftN(0, oy);
    const tilt = S.face.brow === 'angry' ? [0.5, 0, -0.9] : S.face.brow === 'sad' ? [-0.9, -0.2, 0.9] : S.face.brow === 'up' ? [-0.6, -1.0, -0.6] : [0, 0, 0];
    if (id !== 'none') {
      const SHP = {
        soft: [[-2.2, 0.5], [0, -0.1], [2.0, 0.3]], straight: [[-2.2, 0.1], [0, 0], [2.0, 0.1]], arched: [[-2.2, 0.9], [-0.2, -0.5], [2.0, 0.5]], thin: [[-1.8, 0.4], [0, 0], [1.8, 0.2]], thick: [[-2.3, 0.7], [0, -0.1], [2.1, 0.4]],
      }[id];
      const th = id === 'thick' ? Math.max(2, Math.round(GR.k * 1.45)) : id === 'thin' ? 1 : GR.t, base = 16.1;
      // eyebrow sits above the eye; the brow's inner end is the FRONT
      const pts = SHP.map((p, i) => [EYE_C[0] + 0.6 + p[0], base + p[1] + tilt[i]]);
      D.poly(pts, hairR.shade, th);
      if (th >= 2) D.poly(pts.map((p) => [p[0], p[1] - 0.45]), hairR.base, 1);
    }
    if (look.marks.indexOf('eyebrowslit') >= 0) D.line(EYE_C[0] + 0.1, 17.6 + tilt[1], EYE_C[0] + 1.3, 14.8 + tilt[1], K.r.base, Math.max(2, Math.round(GR.k * 1.2)));
  }

  function drawNoseS(P, S, K) {
    const D = new Painter(P).shiftN(0, oyOf(S));
    D.px(30.3, 23.0, K.r.shade); D.px(29.6, 22.2, mix(K.r.shade, K.r.deep, 0.3)); D.px(31.0, 21.8, K.r.light); D.px(30.4, 20.6, K.r.light);
    if (GR.k > 1.8) { D.px(30.9, 22.7, K.r.light); D.px(29.7, 23.6, K.r.shade); }
  }

  function drawMouthS(P, S, look, K) {
    const oy = oyOf(S), D = new Painter(P).shiftN(0, oy), m = S.face.mouth, dk = K.mouth, lip = K.lip;
    const gold = look.marks.indexOf('goldgrill') >= 0, tooth = gold ? '#ffd23f' : '#fffaf2', tg = '#ff6f8f';
    const put = (mk, c) => mk.each((x, y) => P.px(x, y + oy, c));
    const fx = 30.0, fy = 25.7;                                // front lip point
    const line = (pts, c) => D.poly(pts, c);
    switch (m) {
      case 'smile': line([[fx - 0.2, fy], [fx - 1.6, fy + 0.5], [fx - 2.9, fy + 0.2], [fx - 3.4, fy - 0.7]], dk); D.px(fx - 1.2, fy + 1.4, K.lipHi); D.px(fx - 3.6, fy - 0.2, K.r.shade); break;
      case 'closed': line([[fx - 0.2, fy + 0.2], [fx - 3.2, fy + 0.4]], dk); D.px(fx - 0.6, fy + 1.3, K.lipHi); break;
      case 'smirk': line([[fx - 0.2, fy + 0.5], [fx - 1.6, fy + 0.7], [fx - 3.0, fy - 0.1], [fx - 3.6, fy - 1.1]], dk); D.px(fx - 3.9, fy - 1.4, K.r.shade); break;
      case 'sad': line([[fx - 0.2, fy + 0.3], [fx - 1.6, fy], [fx - 3.0, fy + 0.2], [fx - 3.5, fy + 1.1]], dk); break;
      case 'puff': line([[fx - 0.3, fy + 0.4], [fx - 2.4, fy + 0.6]], dk); break;
      case 'grit': { const mk = M().rect(fx - 3.4, fy - 0.8, 3.6, 2.0); put(mk, tooth); const bd = M(); mk.each((x, y) => { if (!mk.get(x, y - 1) || !mk.get(x, y + 1) || !mk.get(x - 1, y)) bd.set(x, y); }); put(bd, dk); D.hl(fx - 3.2, fx - 0.2, fy + 0.2, dk, 1); break; }
      case 'grin': {
        const mk = M().poly([[fx, fy - 0.9], [fx - 3.8, fy - 0.9], [fx - 3.6, fy + 0.8], [fx - 1.8, fy + 2.2], [fx - 0.2, fy + 2.0]]);
        put(mk, dk); put(mk.clone().and(M().rect(fx - 4, fy - 1, 4.5, 1.7)), tooth); put(mk.clone().and(M().ellipse(fx - 1.8, fy + 1.9, 1.3, 0.8)), tg);
        put(M().rect(fx - 4, fy - 1.1, 4.5, 0.3), dk);
        break;
      }
      case 'o': { const mk = M().ellipse(fx - 0.7, fy + 0.9, 1.0, 1.55); put(mk.clone().grow(), lip); put(mk, dk); if (gold) D.px(fx - 0.9, fy + 0.2, tooth); break; }
      case 'open': case 'shout': {
        const big = m === 'shout', d = big ? 1.5 : 1.0;
        const mk = M().poly([[fx, fy - 0.4], [fx - 3.2 - (big ? 0.6 : 0), fy - 0.2], [fx - 3.0, fy + 1.6 * d + 0.8], [fx - 0.8, fy + 2.2 * d + 0.6], [fx + 0.2, fy + 1.4 * d]]);
        put(mk.clone().grow(), lip); put(mk, dk);
        put(mk.clone().and(M().rect(fx - 4.4, fy - 0.8, 5, 1.0 + (big ? 0.4 : 0))), tooth);
        put(mk.clone().and(M().ellipse(fx - 1.8, fy + 1.6 * d + 0.8, 1.4, 0.8)), tg);
        break;
      }
      default: line([[fx - 0.2, fy], [fx - 2.9, fy + 0.3]], dk);
    }
    if (gold && ['smile', 'smirk', 'closed', 'puff', 'sad'].indexOf(m) >= 0) { D.hl(fx - 2.6, fx - 0.4, fy + 0.9, '#ffd23f'); D.px(fx - 1.4, fy + 0.9, '#fff4a0'); }
  }

  function drawMarksS(P, S, look, K) {
    const oy = oyOf(S), D = new Painter(P).shiftN(0, oy), has = (id) => look.marks.indexOf(id) >= 0;
    const put = (mk, c, a) => mk.each((x, y) => P.px(x, y + oy, c, a));
    if (has('freckles')) { const fc = K.dark ? mix(K.r.light, '#e0a070', 0.3) : mix(K.r.deep, '#a05030', 0.45); for (const [x, y] of [[25.5, 22.0], [27.0, 22.8], [28.6, 21.8], [26.2, 24.0], [28.0, 24.1], [24.6, 23.2], [30.0, 21.0]]) D.px(x, y, fc); }
    if (has('blush')) put(M().ellipse(25.4, 23.6, 2.3, 1.2), K.blush, 170);
    if (has('beauty')) { D.px(26.8, 27.6, K.dark ? '#120d1f' : '#3a2230'); D.px(27.2, 27.8, K.dark ? '#120d1f' : '#3a2230'); }
    if (has('scar')) { const sc = K.dark ? '#b88a80' : '#e8a0a0'; D.poly([[27.0, 15.6], [27.6, 17.4], [28.4, 19.4], [28.8, 22.4]], sc, Math.max(2, GR.t)); D.hl(26.4, 29.0, 18.0, '#fff0e8'); D.hl(26.8, 29.2, 20.6, '#fff0e8'); }
    if (has('bandaid')) { put(M().poly([[24.2, 23.0], [28.6, 21.6], [29.2, 23.2], [24.8, 24.6]]), '#f2c9a0'); put(M().poly([[25.8, 22.6], [27.2, 22.1], [27.6, 23.4], [26.2, 23.9]]), '#e0b080'); D.poly([[24.2, 23.0], [24.8, 24.6]], '#d8a070'); D.poly([[28.6, 21.6], [29.2, 23.2]], '#d8a070'); }
    if (has('starpaint')) { const sx = 25.2, sy = 22.4; put(M().fn(sx - 2.2, sy - 2.2, sx + 2.2, sy + 2.2, (x, y) => { const dx = x - sx, dy = y - sy, r = Math.hypot(dx, dy), a = Math.atan2(dy, dx) + Math.PI / 2, s = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= 0.7 + 1.4 * Math.max(0, 1 - Math.abs(s) / (Math.PI / 5) * 1.05); }), '#2ee6ff'); D.px(sx, sy, '#e8ffff'); }
    if (has('tear')) { put(M().poly([[27.4, 22.4], [28.4, 24.2], [26.4, 24.2]]).or(M().ellipse(27.4, 24.9, 1.0, 1.0)), '#2a4fd6'); D.px(27.1, 24.5, '#9fb8ff'); }
    if (has('warpaint')) { put(M().poly([[24.6, 21.6], [29.4, 20.6], [29.6, 21.8], [24.8, 23.0]]), '#ff2f4f'); put(M().poly([[24.8, 23.2], [29.6, 22.1], [29.7, 22.9], [25.0, 24.2]]), '#fff6e8'); }
    if (S.face.tear) { D.px(27.4, 22.2, '#8fc0ff'); D.px(27.4, 23.2, '#cfe6ff'); D.px(27.4, 24.2, '#8fc0ff'); }
  }

  function drawFacialS(P, S, look, hairR) {
    const id = look.facial; if (id === 'none') return;
    const oy = oyOf(S), hm = headLocal(S), put = (mk) => mk.shiftN(0, oy);
    if (id === 'stubble') {
      hm.clone().and(M().poly([[19, 22], [26, 23.2], [30.8, 25.2], [30.4, 31], [18, 31]])).sub(M().ellipse(29.2, 25.9, 1.9, 1.4)).each((x, y) => { if (((x * 7 + y * 11) % 5) < 2) P.px(x, y + oy, hairR.shade, 190); });
      return;
    }
    const stache = () => { const sm = M().poly([[28.0, 23.7], [30.2, 23.7], [31.0, 25.0], [29.6, 25.4], [27.6, 24.8]]); sh(P, put(sm), hairR, { cap: 2, hi: true }); };
    if (id === 'mustache') { stache(); return; }
    if (id === 'goatee') { const gm = M().poly([[27.4, 27.4], [30.2, 27.2], [30.0, 30.6], [28.6, 31.4], [27.0, 30.4]]); sh(P, put(gm), hairR, { cap: 3, hi: true }); stache(); return; }
    const bm = M().poly([[19.6, 21.6], [24.6, 22.8], [28.0, 25.4], [30.4, 27.4], [30.4, 30.4], [28.2, 31.6], [21, 29.8], [17.4, 26]]);
    bm.sub(M().ellipse(29.0, 25.7, 2.0, 1.2)).sub(M().poly([[27.6, 23.6], [31.5, 23.6], [31.5, 25.4], [27.6, 25]]));
    if (id === 'longbeard') bm.or(M().poly([[26, 29], [30.2, 29], [29.4, 37.5], [27.6, 39.5], [25.4, 37]]));
    sh(P, put(bm), hairR, { cap: 3, hi: true, ctx: put(bm) });
    put(bm).each((x, y) => { if (iY(y - oy) > 26.5 && ((x * 5 + y * 3) % 7 === 0)) P.px(x, y, hairR.shade); });
    stache();
  }

  /* ------------------------------------------------------------------ hair */
  const C_ = (m, o) => Object.assign({ m, dir: DIR }, o || {});
  const ellM = (cx, cy, rx, ry) => M().ellipse(cx, cy, rx, ry);
  const bumpM = (cx, cy, r) => M().ellipse(cx, cy, r, r);
  const capP = (c, vol, poly) => {
    let m = c.hm.clone().and(M().poly(poly || HAIRLINE));
    if (vol) m = m.growD(vol);
    m.sub(M().poly(FACEWIN)); m.clipY(0, 26.8);
    return m;
  };
  const chain = (pts) => { const m = M(); for (let i = 0; i < pts.length - 1; i++) m.capsule(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], pts[i][2], pts[i + 1][2]); return m; };
  const STYS = {};
  STYS.bald = () => ({ back: [], front: [], shine: true });
  STYS.buzz = (c) => ({ back: [], front: [C_(capP(c, 0), { buzz: true })] });
  STYS.crop = (c) => { const m = capP(c, 1).or(ellM(22.4, 10.6, 5.6, 2)); m.or(M().rect(27.2, 13.4, 2.2, 1.6)); return { back: [], front: [C_(m, { tex: 'v', sheen: true })] }; };
  STYS.sidepart = (c) => { const m = capP(c, 2).or(M().poly([[26.5, 11.5], [31.4, 15.6], [30.4, 18.4], [28.2, 16.2], [24.8, 14.6]])); return { back: [], front: [C_(m, { tex: 'v', sheen: true })] }; };
  STYS.quiff = (c) => { const m = capP(c, 1).or(ellM(26.4, 8.4, 6.2, 4.2)).or(ellM(21.8, 9.8, 7.4, 3.6)); return { back: [], front: [C_(m, { tex: 'v', sheen: true })] }; };
  STYS.undercut = (c) => { const top = ellM(23.0, 10.2, 8.2, 4.2).or(M().poly([[25, 11], [30.4, 14.6], [28, 15.4], [22, 13]])); const sides = capP(c, 0).sub(top); return { back: [], front: [C_(sides, { buzz: true, fade: true }), C_(top, { tex: 'v', sheen: true })] }; };
  STYS.fade = (c) => { const top = ellM(22.2, 11.0, 8.8, 3.4).or(ellM(23.6, 12.2, 7, 2.6)).sub(M().poly(FACEWIN)); const sides = capP(c, 0).sub(top); return { back: [], front: [C_(sides, { buzz: true, fade: true }), C_(top, { tex: 'v', sheen: true })] }; };
  STYS.waves = (c) => { const m = capP(c, 2).or(M().poly([[12, 19], [10.4, 24], [12.4, 28.4], [17.6, 28.6], [18.4, 22.6]])); m.or(ellM(22.5, 21.6, 1.6, 3)); return { back: [], front: [C_(m, { tex: 'wave', sheen: true })] }; };
  STYS.curly = (c) => {
    const m = capP(c, 1.5);
    const pts = []; for (let i = 0; i <= 8; i++) { const a = (-0.25 + (i / 8) * 3.6); pts.push([19.8 + Math.cos(a) * 9.6, 17.4 - Math.sin(a) * 9.4, 3.2]); }
    const bm = M(); pts.forEach((b) => bm.or(bumpM(b[0], b[1], b[2]))); bm.sub(M().poly(FACEWIN)).clipY(0, 27);
    return { back: [], front: [C_(m.or(bm), { tex: 'curl', bumps: pts })] };
  };
  STYS.afro = () => {
    const m = ellM(18.8, 14.0, 12.6, 11.4), bumps = [];
    for (let i = 0; i <= 10; i++) { const a = -0.6 + (i / 10) * 4.1; bumps.push([18.8 + Math.cos(a) * 11.6, 14.4 - Math.sin(a) * 10.4, 3.0]); }
    bumps.forEach((b) => m.or(bumpM(b[0], b[1], b[2])));
    m.sub(M().poly(FACEWIN)).sub(M().poly([[26.5, 14.8], [32, 15.2], [34, 31], [24, 31], [24.4, 20.5], [26, 16.5]])).clipY(0, 27.5);
    return { back: [], front: [C_(m, { tex: 'curl', bumps, big: true })] };
  };
  STYS.bob = (c) => { const m = capP(c, 2).or(M().poly([[21.2, 15.6], [24.4, 17.2], [24.0, 25.8], [21.4, 28.2], [15.6, 28.6], [12, 23], [12.4, 16.4]])).sub(M().poly(FACEWIN)); return { back: [C_(M().poly([[11, 17], [10.6, 26], [13, 30], [19, 30], [18, 20]]), { bias: 1 })], front: [C_(m, { tex: 'v', sheen: true })] }; };
  STYS.long = (c) => {
    const m = capP(c, 2); const back = M().poly([[10.8, 15], [9.2, 27], [10.6, 40], [16.8, 42], [19.6, 40], [19.6, 28], [21, 19]]);
    const lock = M().capsule(21.0, 20, 21.4, 35, 1.7, 1.3);
    return { back: [C_(back, { bias: 1, tex: 'v' })], front: [C_(m.or(M().poly([[21.4, 14.6], [24.6, 15.8], [24.0, 22], [21.4, 24]])), { tex: 'v', sheen: true }), C_(lock, { tex: 'v' })] };
  };
  STYS.ponytail = (c) => {
    const m = capP(c, 1).or(ellM(22.0, 10.6, 6, 2));
    const tail = chain([[11.8, 17.5, 2.4], [9.6, 20.6, 2.8], [8.8, 25, 3.0], [9.6, 29.6, 2.8], [10.8, 33, 2.2], [11.4, 36.2, 1.4]]);
    return { back: [C_(tail, { tex: 'v', tailTie: [12.4, 17.4] })], front: [C_(m, { tex: 'v', sheen: true, tieAt: [[13.2, 17.0]] })] };
  };
  STYS.pigtails = (c) => {
    const m = capP(c, 1).or(ellM(22.0, 10.4, 6.4, 2));
    const near = chain([[16.2, 22.4, 2.6], [15.2, 26.6, 3.0], [15.0, 30.6, 3.0], [15.6, 34, 2.4], [16.0, 37, 1.4]]), far = chain([[13.2, 21.6, 2.4], [12.4, 25.6, 2.8], [12.4, 29.8, 2.8], [13.0, 33.4, 2.2], [13.4, 36, 1.3]]);
    return { back: [C_(far, { tex: 'v', bias: 1 })], front: [C_(m, { tex: 'v', sheen: true }), C_(near, { tex: 'v', tieAt: [[16.6, 21.4]] })] };
  };
  STYS.buns = (c) => {
    const m = capP(c, 1);
    const near = bumpM(22.4, 7.6, 3.4), far = bumpM(16.6, 8.6, 3.0);
    return { back: [C_(far, { tex: 'curl', bumps: [[16.6, 8.6, 3.0]], bias: 1 })], front: [C_(m, { tex: 'v', sheen: true }), C_(near, { tex: 'curl', bumps: [[22.4, 7.6, 3.4]], tieAt: [[22.2, 10.4]] })], topOnly: near };
  };
  STYS.topknot = (c) => { const m = capP(c, 0.6), knot = bumpM(20.6, 7.2, 3.5); return { back: [], front: [C_(m, { tex: 'v', sheen: true }), C_(knot, { tex: 'curl', bumps: [[20.6, 7.2, 3.5]], tieAt: [[20.6, 10.2]] })], topOnly: knot }; };
  STYS.braids = (c) => { const m = capP(c, 1); const braid = M().capsule(17.4, 22, 17.0, 38, 1.7, 1.4); return { back: [], front: [C_(m, { tex: 'v', sheen: true }), C_(braid, { plait: true, tieAt: [[17.0, 38.2]] })] }; };
  STYS.locs = (c) => {
    const m = capP(c, 2); const back = M(), front = M();
    [[13.4, 20, 12.8, 30], [11.6, 21, 10.6, 33], [15.4, 22, 14.8, 28], [10.4, 18, 8.8, 27]].forEach(([x0, y0, x1, y1]) => back.or(M().capsule(x0, y0, x1, y1, 1.5, 1.2)));
    [[17.6, 22, 17.2, 31], [19.6, 23, 19.4, 33]].forEach(([x0, y0, x1, y1]) => front.or(M().capsule(x0, y0, x1, y1, 1.4, 1.1)));
    for (const dx of [24.6, 26.8, 28.8]) m.or(M().capsule(dx, 14, dx + 0.6, 16.2 + (dx > 26 ? 0.4 : 0), 1.0, 0.9));
    return { back: [C_(back, { bias: 1, tex: 'loc' })], front: [C_(m, { tex: 'loc' }), C_(front, { tex: 'loc' })] };
  };
  STYS.mohawk = (c) => {
    const fin = M().poly([[28.6, 13.4], [29.4, 8.6], [25.6, 4.6], [20, 3.2], [14, 5.6], [11.4, 11.6], [12.6, 19], [14.8, 14.6], [19, 10.4], [24.2, 10.6]]);
    const sides = capP(c, 0).sub(fin);
    return { back: [], front: [C_(sides, { buzz: true, fade: true }), C_(fin, { tex: 'v', tipUp: true })], topOnly: fin };
  };
  STYS.mullet = (c) => { const m = capP(c, 1).or(ellM(22.0, 10.8, 6, 2)); const tail = M().poly([[13.6, 19], [11, 27], [11.8, 35], [16.8, 36.4], [19.2, 28], [18.4, 21]]); return { back: [C_(tail, { bias: 1, tex: 'v' })], front: [C_(m.or(M().poly([[20.4, 18], [22.4, 18.4], [22.2, 24.6], [19.2, 25.6]])), { tex: 'v', sheen: true })] }; };
  STYS.spiky = (c) => {
    const m = capP(c, 1), sp = M();
    [[26, 12.2, 4.2, 3.4], [23, 10.6, 5.6, 3.6], [19.6, 10, 6.8, 3.8], [16.2, 10.6, 6.0, 3.6], [13.2, 12.4, 4.4, 3.2]].forEach(([x, y, h, w], i) => sp.or(M().poly([[x - w / 2, y + 2.6], [x + w / 2, y + 2.6], [x - 0.8 - i * 0.3, y - h]])));
    m.or(sp);
    return { back: [], front: [C_(m, { tex: 'v', tipUp: true })], topOnly: sp };
  };
  STYS.flame = (c) => {
    const f = c.S.frame || 0, m = capP(c, 1), fl = M();
    [[26.4, 5, 0], [23, 8, 1], [19.6, 10.5, 0], [16.2, 9, 1], [13.2, 6, 0]].forEach(([x, h, ph], i) => { const wob = [0, 1, 0, -1][(f + i + ph) % 4]; fl.or(M().poly([[x - 2.4, 12.2], [x + 2.4, 12.2], [x - 0.6 + wob * 0.4, 12 - h * 0.5], [x - 1.2 + wob - 0.6, 12 - h], [x - 2.2, 12 - h * 0.45]])); });
    fl.sub(M().rect(0, 0, 44, 1)); m.or(fl);
    return { back: [], front: [C_(m, { tex: 'v', tipUp: true, flame: true })], topOnly: fl };
  };
  STYS.cornrows = (c) => ({ back: [], front: [C_(capP(c, 0.8), { tex: 'rowsP', lineUp: true })] });
  STYS.hightop = (c) => {
    const block = M().poly([[27.4, 13.4], [26.6, 6.2], [13.6, 5.8], [11.0, 13], [11.4, 19.4], [16, 17], [22, 15.4]]);
    const sides = capP(c, 0).sub(block);
    return { back: [], front: [C_(sides, { buzz: true, fade: true }), C_(block.clone().sub(M().poly(FACEWIN)), { tex: 'v', sheen: true, lineUp: true })], topOnly: block };
  };
  STYS.twists = (c) => {
    const base = capP(c, 1), nubs = [];
    [[-2, 5], [0.5, 5], [3, 5], [5.5, 5]].forEach(([r, n], ri) => { for (let i = 0; i < 5; i++) nubs.push([13.5 + i * 3.1 + ri * 0.4, 9.8 - Math.sin(i / 4 * Math.PI) * 1.8 + ri * 2.2, 1.6]); });
    [[12.0, 17.4], [12.6, 20.4], [14.2, 23.0], [10.4, 20.6]].forEach(([x, y]) => nubs.push([x, y, 1.5]));
    const nm = M(); nubs.forEach((b) => nm.or(M().capsule(b[0], b[1] - 0.8, b[0], b[1] + 0.9, b[2], b[2] - 0.1)));
    nm.sub(M().poly(FACEWIN)); nm.and(M().poly([[33, 3], [27.8, 12.4], [25, 14], [21.6, 16], [20.6, 20], [18.4, 22], [14, 27], [7, 27], [7, 3]]));
    return { back: [], front: [C_(base, { tex: 'v', bias: 0.6 }), C_(nm, { tex: 'twist', bumps: nubs.map((b) => [b[0], b[1], 1.6]) })], topOnly: nm };
  };
  STYS.dreadbun = (c) => {
    const m = capP(c, 1.5), bumps = [[20.4, 6.6, 4.4], [17.8, 7.8, 3.0], [23.0, 7.8, 2.8]], bun = M(); bumps.forEach((b) => bun.or(bumpM(b[0], b[1], b[2])));
    const back = M(); [[13.4, 20, 12.6, 31], [11.6, 21, 10.4, 33], [15.4, 22, 14.8, 29]].forEach(([x0, y0, x1, y1]) => back.or(M().capsule(x0, y0, x1, y1, 1.45, 1.15)));
    return { back: [C_(back, { bias: 1, tex: 'loc' })], front: [C_(m, { tex: 'rowsP' }), C_(bun, { tex: 'loc', bumps, bunTie: [20.4, 10.4] })], topOnly: bun };
  };
  STYS.fadewave = (c) => { const top = ellM(22.0, 10.8, 8.6, 4.0).or(ellM(23.4, 12.4, 6.6, 2.6)).sub(M().poly(FACEWIN)); const sides = capP(c, 0).sub(top); return { back: [], front: [C_(sides, { buzz: true, fade: true }), C_(top, { tex: 'ringP', sheen: true, lineUp: true })] }; };

  // hat zones for profile: hair above the band line is removed. [front y, back y] of the band; null = no cover.
  const HATZ = {
    cap: [16.4, 19.2], capback: [16.4, 19.2], beanie: [15.2, 18.6], bandana: [15.6, 18.8], snapback: [16.4, 19.2], bucket: [16.2, 19.0], beret: [14.0, 17.5],
    fedora: [16.0, 18.8], cowboy: [16.0, 18.8], tophat: [15.6, 18.6], pirate: [14.2, 18], chef: [15.6, 18.6], wizard: [15.6, 18.6], durag: [16.0, 19.4], fitted: [16.4, 19.2], trucker: [16.4, 19.2], hood: [40, 40], bucketfur: [16.2, 19.0],
  };
  function hairOpsS(X) {
    if (X._hairS) return X._hairS;
    const c = { hm: headLocal(X.S), S: X.S }, res = (STYS[X.L.hair.style] || STYS.crop)(c), z = HATZ[X.hatId];
    if (z) {
      const kill = M().poly([[4, 0], [40, 0], [40, z[0] - 0.2], [31, z[0]], [10, z[1]], [4, z[1] + 0.2]]);
      const lim = headLocal(X.S).growD(3.4);
      const cut = (op) => { op.m = op.m.clone().sub(kill); if (op.big || op.tex === 'curl') op.m.and(lim); return op; };
      res.front = res.front.map(cut).filter((o) => o.m.bounds());
      if (X.hatId === 'hood') res.back = [];
    }
    X._hairS = res;
    return res;
  }
  const hairDyB = (S) => S.dyB;
  function hairBackS(X) { const res = hairOpsS(X); for (const op of res.back) Hair.paintOp(X, op, 0, hairDyB(X.S)); }
  function hairFrontS(X) {
    const res = hairOpsS(X);
    for (const op of res.front) Hair.paintOp(X, op, 0, hairDyB(X.S));
    if (res.shine && !HATZ[X.hatId]) { const D = new Painter(X.P).shiftN(0, oyOf(X.S)), rp = X.K.r; D.hl(23.4, 26, 11.8, rp.hi); D.px(27.2, 12.6, rp.hi); D.px(21.2, 11.6, rp.light); }
  }
  // shadow the hair fringe / hat brim casts on the forehead (before the face is painted)
  function shadowS(X, extra) {
    const res = hairOpsS(X), P = X.P, K = X.K, oy = oyOf(X.S), all = M();
    for (const op of res.front) all.or(op.m);
    if (extra) all.or(extra);
    const sm = all.shiftN(0, oy), shd = M(), depth = Math.max(1, GR.t);
    sm.each((x, y) => { if (!sm.get(x, y + 1)) for (let q = 1; q <= depth; q++) shd.set(x, y + q); });
    const hm = headLocal(X.S).shiftN(0, oy); shd.and(hm).sub(sm);
    shd.each((x, y) => { if (iY(y - oy) < 20) { const p = P.get(x, y); if (p[3] > 200) P.px(x, y, mix([p[0], p[1], p[2]], mix(K.r.shade, K.r.deep, 0.3), 0.7)); } });
  }

  Object.assign(BBH, {
    CharsSide: {
      SIDE, isSide, skelSide, bodyMasksS, torsoSide, hipsSide, legMaskS, armMaskS, limbMask, rowsLR, headLocal, drawHeadSkinS, drawEyeS, drawBrowS, drawNoseS, drawMouthS, drawMarksS, drawFacialS,
      hairOpsS, hairBackS, hairFrontS, shadowS, STYS, HATZ, sh, DIR, GROUND, rotF, oyOf, FACE_PTS, FACEWIN, EYE_C, GS, LEG, ARM, hash, ik,
    },
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsSide;
})(typeof globalThis !== 'undefined' ? globalThis : this);
