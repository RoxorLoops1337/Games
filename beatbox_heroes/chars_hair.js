// BEATBOX HEROES -- chars_hair.js
// Part 2 of the character renderer: hair styles (a back layer behind the head and a front layer over it)
// and hats. Hats hide / lower the hair under them (hat.zone) and cast a shadow on the forehead.
// All shapes are built in "head-local" space (head top row y=HY, mirror axis x=21.5) and shifted to the
// pose's head position when painted, so every pose and every hat/hair pair uses the same geometry.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
  }
  const { PAL, ramp, mix, lighten, darken } = BBH;
  const Kit = BBH.CharsKit, { CX, HY, M, shade, flat, darkenAt, headMask } = Kit;
  const R = (r) => HY + r;                  // head row -> y

  /* ----------------------------------------------------------- local helpers */
  // the un-posed head mask (so hair is built once in local space)
  function localHead(X) { return headMask({ G: X.S.G, head: { x: CX, y: HY }, face: { puff: X.S.face.puff } }); }
  const cap = (c, upto, vol) => {
    let m = c.hm.clone().clipY(0, R(upto));
    for (let i = 0; i < vol; i++) m = m.grow();
    return vol ? m.clipY(0, R(upto)) : m;
  };
  const win = (cy, rx, ry, dx) => M().ellipse(CX + (dx || 0), R(cy), rx, ry);
  const ell = (cx, cy, rx, ry) => M().ellipse(cx, cy, rx, ry);
  const rowsM = (r0, hws, cx) => M().rows(R(r0), hws, cx);
  const bump = (cx, cy, r) => M().ellipse(cx, cy, r, r);
  const shiftM = (m, dx, dy) => (dx || dy ? m.shift(dx, dy) : m);

  /* ------------------------------------------------------------------- hair */
  // A style is a function (c) -> { back:[op], front:[op] }. op = { m, opt, rp, det(px), tip }
  //   m: mask   opt: shade options   rp: ramp override   det: detail painter   tipUp: dye the top instead of the bottom
  const C_ = (m, o) => Object.assign({ m }, o || {});
  const tie = (c) => c.tieCol;

  const STY = {};
  STY.bald = (c) => ({ back: [], front: [], shine: true });

  STY.buzz = (c) => {
    const m = cap(c, 9, 0).sub(win(12.5, 8.6, 9.6));
    return { back: [], front: [C_(m, { buzz: true })] };
  };

  STY.crop = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.8, 9));
    m.or(ell(CX + 1.5, R(-1), 6, 2));
    // little fringe teeth
    for (const [dx, r] of [[-3, 3], [0, 3], [2, 3], [-1, 4], [4, 3]]) m.set(Math.round(CX + dx), R(r));
    return { back: [], front: [C_(m, { tex: 'v' })] };
  };

  STY.sidepart = (c) => {
    const m = cap(c, 9, 2).sub(win(12.5, 7.3, 8.6, 1.2));
    m.or(M().poly([[CX - 11, R(2)], [CX + 3, R(1.5)], [CX + 7, R(4.5)], [CX + 1, R(5)], [CX - 5, R(7)], [CX - 9, R(10)], [CX - 11, R(10)]]));
    m.sub(M().poly([[CX + 7, R(8)], [CX + 12, R(8)], [CX + 12, R(0)]]).and(c.hm.clone().sub(c.hm.clone().clipY(0, R(1)))));
    return {
      back: [], front: [C_(m, { tex: 'v', det: (px, rp) => { for (let i = 0; i < 4; i++) px(CX - 4 + (i >> 1) - 0.5 + 0.5 - 0, R(-1) + i, rp.hi); } })],
    };
  };

  STY.quiff = (c) => {
    const m = cap(c, 8, 1).sub(win(12, 7.8, 8.6));
    m.or(ell(CX + 0.5, R(-2.5), 8.2, 4.4)).or(ell(CX - 2, R(0.5), 7, 3));
    m.sub(M().rect(0, R(-8), 44, 2));
    return { back: [], front: [C_(m, { tex: 'v', hiTop: true })] };
  };

  STY.undercut = (c) => {
    const sides = cap(c, 9, 0).sub(win(12.5, 8.6, 9.8));
    const top = ell(CX + 0.5, R(-1.5), 8.5, 4.6).or(ell(CX + 1, R(1), 8.5, 3.4)).sub(win(12, 6.4, 8.2, 1));
    top.or(M().poly([[CX - 9, R(2)], [CX + 3, R(2)], [CX + 5, R(4)], [CX - 6, R(4)]]));
    return { back: [], front: [C_(sides.clone().sub(top), { buzz: true, fade: true }), C_(top, { tex: 'v', hiTop: true })] };
  };

  STY.fade = (c) => {
    const sides = cap(c, 10, 0).sub(win(12.5, 8.4, 9.8));
    const top = ell(CX, R(0.5), 9.2, 3.8).or(ell(CX, R(1.5), 9.8, 3)).sub(win(12, 7.6, 8.8));
    return { back: [], front: [C_(sides.clone().sub(top), { buzz: true, fade: true }), C_(top, { tex: 'v', flatTop: true })] };
  };

  STY.waves = (c) => {
    const m = cap(c, 10, 2).sub(win(13, 7.1, 9.6));
    for (const s of [-1, 1]) for (let r = 4; r <= 16; r++) {
      const w = Math.round(Math.sin(r * 0.95 + (s < 0 ? 0 : 1.6)) * 1.1), x0 = s < 0 ? CX - 11.5 - w : CX + 8.5, x1 = s < 0 ? CX - 8.5 : CX + 11.5 + w;
      for (let x = Math.ceil(x0 - 0.5); x <= Math.floor(x1 + 0.5); x++) if (Math.abs(x - CX) > 8 || r < 5) m.set(x, R(r));
    }
    m.sub(M().poly([[CX - 8, R(2)], [CX - 6, R(3.5)], [CX - 3, R(2)]]).sub(M()));
    m.or(M().poly([[CX - 10, R(2)], [CX + 2, R(2)], [CX + 3, R(5)], [CX - 3, R(5.5)], [CX - 8, R(8)], [CX - 10, R(8)]]));
    const back = rowsM(8, [11, 11, 10, 10, 10, 9, 9, 8, 7]);
    return { back: [C_(back, { bias: 1 })], front: [C_(m, { tex: 'wave', hiTop: true })] };
  };

  STY.curly = (c) => {
    const m = cap(c, 9, 2).sub(win(12.5, 7.4, 9));
    const bumps = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (0.02 + i / 8 * 0.96); bumps.push([CX - Math.cos(a) * 10.5, R(6) - Math.sin(a) * 10.5, 3.2]); }
    bumps.push([CX - 11, R(8), 2.6], [CX + 11, R(8), 2.6], [CX - 10.5, R(11), 2.2], [CX + 10.5, R(11), 2.2]);
    const bm = M(); for (const b of bumps) bm.or(bump(b[0], b[1], b[2]));
    bm.sub(win(12.5, 7.4, 9));
    return { back: [C_(rowsM(8, [11, 11, 10, 9]), { bias: 1 })], front: [C_(m.or(bm), { tex: 'curl', bumps })] };
  };

  STY.afro = (c) => {
    const m = ell(CX, R(1), 12.6, 10.6).or(ell(CX, R(5), 12.9, 8));
    const bumps = [];
    for (let i = 0; i <= 11; i++) { const a = Math.PI * (i / 11); bumps.push([CX - Math.cos(a) * 11.2, R(3.5) - Math.sin(a) * 9.6, 3.0]); }
    for (let i = 0; i < 4; i++) { const yy = R(5 + i * 2.2); bumps.push([CX - 12, yy, 2.4], [CX + 11 + 1, yy, 2.4]); }
    for (const b of bumps) m.or(bump(b[0], b[1], b[2]));
    m.sub(win(12.8, 8.2, 9.4));
    m.clipY(0, R(12));
    return { back: [], front: [C_(m, { tex: 'curl', bumps, big: true })] };
  };

  STY.bob = (c) => {
    const m = cap(c, 9, 2).sub(win(13, 7.5, 9.6));
    const side = M();
    for (const s of [-1, 1]) for (let r = 4; r <= 15; r++) {
      const hw = r < 13 ? 11.5 : 11.5 - (r - 12) * 0.8, inner = r < 6 ? 6.5 : 8;
      for (let x = Math.ceil(CX - hw + 0.5); x <= Math.floor(CX + hw - 0.5); x++) if (Math.abs(x - CX) > inner) side.set(x, R(r));
    }
    m.or(side);
    m.or(M().poly([[CX - 10, R(2)], [CX + 10, R(2)], [CX + 8, R(5)], [CX - 8, R(5)]]).sub(win(13.5, 6.4, 8.8)));
    return { back: [C_(rowsM(7, [11, 12, 12, 11, 11, 10, 10, 9, 8]), { bias: 1 })], front: [C_(m, { tex: 'v', hiTop: true })] };
  };

  STY.long = (c) => {
    const m = cap(c, 10, 2).sub(win(13, 7.5, 9.6));
    m.or(M().poly([[CX - 10, R(2)], [CX + 3, R(2)], [CX + 6, R(4)], [CX + 1, R(5.5)], [CX - 6, R(7)], [CX - 9, R(10)], [CX - 10, R(10)]]).sub(win(13, 7.5, 9.6)));
    const locks = M();
    for (const s of [-1, 1]) for (let r = 8; r <= 26; r++) {
      const w = r > 22 ? 2 : 3, x0 = s < 0 ? CX - 11.5 : CX + 8.5 + (3 - w) * 0, x1 = s < 0 ? CX - 8.5 : CX + 11.5;
      const ox = Math.round(Math.sin(r * 0.5) * 0.5);
      for (let x = Math.ceil(x0 + 0.5); x <= Math.floor(x1 - 0.5); x++) if (r > 22 ? (s < 0 ? x < CX - 9.4 : x > CX + 9.4) : true) locks.set(x + ox, R(r));
    }
    const back = rowsM(6, [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7]);
    return { back: [C_(back, { bias: 1, tex: 'v' })], front: [C_(m, { tex: 'v', hiTop: true }), C_(locks, { tex: 'v' })] };
  };

  STY.ponytail = (c) => {
    const m = cap(c, 8, 1).sub(win(11.5, 8.0, 9.2));
    m.or(ell(CX + 1, R(-1), 6.5, 2));
    const tail = M();
    [[CX + 10, R(5), 2.6], [CX + 11.5, R(9), 3], [CX + 12, R(13), 3.2], [CX + 11.5, R(17), 3], [CX + 10.5, R(21), 2.4], [CX + 10, R(24), 1.4]].forEach((b) => tail.or(bump(b[0], b[1], b[2])));
    tail.or(M().capsule(CX + 10, R(5), CX + 10, R(24), 2.2, 1.3));
    return { back: [C_(tail, { tex: 'v', tailTie: [CX + 9.5, R(5.5)] })], front: [C_(m, { tex: 'v', hiTop: true, tieAt: [[CX + 9.5, R(5.5)]] })] };
  };

  STY.pigtails = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.8, 9));
    m.or(ell(CX, R(-0.5), 7, 2.2));
    const back = M();
    for (const s of [-1, 1]) {
      const bx = CX + s * 12;
      [[bx - s * 0.5, R(8), 2.4], [bx + s * 0.5, R(12), 3.2], [bx + s * 0.8, R(16), 3.3], [bx + s * 0.6, R(20), 2.8], [bx, R(23), 1.6]].forEach((b) => back.or(bump(b[0], b[1], b[2])));
    }
    return { back: [C_(back, { tex: 'v' })], front: [C_(m, { tex: 'v', hiTop: true, tieAt: [[CX - 11.5, R(7.5)], [CX + 11.5, R(7.5)]] })] };
  };

  STY.buns = (c) => {
    const m = cap(c, 8, 1).sub(win(11.5, 8, 9.2));
    const balls = [];
    for (const s of [-1, 1]) balls.push(bump(CX + s * 7.5, R(-2.4), 3.4));
    const hatLow = c.hatZone != null;
    const lowBuns = M();
    if (hatLow) for (const s of [-1, 1]) lowBuns.or(bump(CX + s * 12, R(7), 2.8));
    const bm = M(); balls.forEach((b) => bm.or(b));
    return {
      back: [C_(lowBuns, { tex: 'curl', bumps: [] })],
      front: [C_(m, { tex: 'v', hiTop: true }), C_(bm.clone().sub(M().rect(0, R(5), 44, 20)), { tex: 'curl', bumps: balls.map((b, i) => [CX + (i ? 7.5 : -7.5), R(-2.4), 3.4]), top: true, tieAt: [[CX - 6.5, R(0.6)], [CX + 6.5, R(0.6)]] })],
      topOnly: bm,
    };
  };

  STY.topknot = (c) => {
    const m = cap(c, 9, 0).sub(win(12.5, 8.6, 9.8));
    m.or(cap(c, 3, 1));
    const knot = bump(CX, R(-3.6), 3.4);
    return { back: [], front: [C_(m, { tex: 'v', hiTop: true }), C_(knot.clone(), { tex: 'curl', bumps: [[CX, R(-3.6), 3.4]], tieAt: [[CX, R(-0.6)]], top: true })], topOnly: knot };
  };

  STY.braids = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.8, 9));
    m.or(M().poly([[CX - 10, R(1)], [CX + 10, R(1)], [CX + 9, R(3)], [CX - 9, R(3)]]));
    const braids = [];
    for (const s of [-1, 1]) {
      const bm = M();
      for (let r = 7; r <= 27; r++) { const x = CX + s * (r < 10 ? 10 : 9.5) + (s < 0 ? 0 : 0); bm.set(Math.round(x - 1 * (s < 0 ? 0 : 0) - 0.5 * s), R(r)); bm.set(Math.round(x + (s < 0 ? -1.5 : 1.5) - 0.5 * s), R(r)); bm.set(Math.round(x - 0.5 * s + (s < 0 ? 1.5 : -1.5)), R(r)); }
      braids.push(bm);
    }
    return { back: [], front: [C_(m, { tex: 'v', hiTop: true })].concat(braids.map((b, i) => C_(b, { plait: true, tieAt: [[CX + (i ? 9 : -10), R(27.5)]] }))) };
  };

  STY.locs = (c) => {
    const m = cap(c, 9, 2).sub(win(12.5, 7.4, 9));
    m.or(M().poly([[CX - 10, R(1)], [CX + 10, R(1)], [CX + 8, R(4)], [CX - 8, R(4)]]).sub(win(12.5, 6.8, 8.6)));
    const strands = M();
    const xs = [-10.5, -8.5, 8.5, 10.5], ls = [24, 18, 18, 24];
    xs.forEach((dx, i) => { strands.or(M().capsule(CX + dx, R(6), CX + dx + (dx < 0 ? -0.6 : 0.6), R(ls[i]), 1.4, 1.2)); });
    const back = M();
    [-9.5, -7.5, 7.5, 9.5].forEach((dx, i) => back.or(M().capsule(CX + dx, R(7), CX + dx * 1.05, R(25 + (i % 2) * 2), 1.5, 1.2)));
    back.or(rowsM(6, [11, 11, 11, 10, 10]));
    // fringe locs hanging over the forehead
    for (const dx of [-5.5, -2.5, 0.5, 3.5, 6.5]) m.or(M().capsule(CX + dx, R(2), CX + dx, R(4 + (Math.abs(dx) < 3 ? 0 : 1)), 1.1, 0.9));
    return { back: [C_(back, { bias: 1, tex: 'loc' })], front: [C_(m, { tex: 'curl', bumps: [] }), C_(strands, { tex: 'loc' })] };
  };

  STY.mohawk = (c) => {
    const sides = cap(c, 8, 0).sub(win(12.5, 8.8, 9.8));
    const fin = M();
    const hws = [1, 2, 2, 2.5, 2.5, 3, 3, 3, 3];
    for (let i = 0; i < hws.length; i++) for (let x = Math.ceil(CX - hws[i] + 0.5); x <= Math.floor(CX + hws[i] - 0.5); x++) fin.set(x, R(-7 + i));
    fin.or(M().rows(R(2), [2.5, 2.5, 2])).or(M().rows(R(-1), [3, 3, 3, 3, 3, 3]));
    fin.set(Math.round(CX - 0.5), R(-8)); fin.set(Math.round(CX + 0.5), R(-8));
    fin.or(M().poly([[CX - 3, R(-4)], [CX - 5, R(-7)], [CX - 1.5, R(-5)]])).or(M().poly([[CX + 3, R(-4)], [CX + 5, R(-7)], [CX + 1.5, R(-5)]]));
    return { back: [], front: [C_(sides.clone().sub(fin), { buzz: true, fade: true }), C_(fin, { tex: 'v', tipUp: true, spike: true })], topOnly: fin };
  };

  STY.mullet = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.7, 9));
    m.or(ell(CX + 1, R(-1), 6.5, 2));
    const side = M();
    for (const s of [-1, 1]) for (let r = 7; r <= 17; r++) {
      const hw = 9.8 + (r - 7) * 0.2, inner = r < 11 ? 8.3 : 7.2;
      for (let x = Math.ceil(CX - hw - 0.5); x <= Math.floor(CX + hw + 0.5); x++) if (Math.abs(x - CX) > inner + 0.5 && Math.abs(x - CX) < hw + 1) side.set(x, R(r));
    }
    m.or(side);
    const back = rowsM(8, [12, 12, 12, 12, 12, 12, 11, 10, 9, 8, 7]);
    return { back: [C_(back, { bias: 1, tex: 'v' })], front: [C_(m, { tex: 'v', hiTop: true })] };
  };

  STY.spiky = (c) => {
    const m = cap(c, 8, 1).sub(win(12, 7.8, 9));
    const sp = M();
    const defs = [[-9, 4, 3], [-5.5, 6, 3.5], [-1.5, 7.5, 4], [2.5, 6.5, 3.8], [6, 5.5, 3.4], [9.2, 3.5, 2.8]];
    defs.forEach(([dx, h, w]) => sp.or(M().poly([[CX + dx - w / 2, R(2.2)], [CX + dx + w / 2, R(2.2)], [CX + dx + (dx > 0 ? 0.6 : -0.4), R(2 - h)]])));
    m.or(sp);
    return { back: [], front: [C_(m, { tex: 'v', tipUp: true, spike: true })], topOnly: sp };
  };

  STY.flame = (c) => {
    const f = c.S.frame || 0, m = cap(c, 8, 1).sub(win(12, 7.8, 9));
    const fl = M();
    const defs = [[-8.5, 5, 0], [-5, 8, 1], [-1.5, 11, 0], [2, 9.5, 1], [5.5, 8, 0], [8.8, 5, 1]];
    defs.forEach(([dx, h, ph], i) => {
      const wob = [0, 1, 0, -1][(f + i + ph) % 4], lean = (dx > 0 ? 1 : -1) * 1.2 + wob;
      fl.or(M().poly([[CX + dx - 2.4, R(3)], [CX + dx + 2.4, R(3)], [CX + dx + 1.4 + lean * 0.4, R(1 - h * 0.45)], [CX + dx + lean, R(1 - h)], [CX + dx - 1.2, R(1 - h * 0.5)]]));
    });
    fl.sub(M().rect(0, 0, 44, 1));
    m.or(fl);
    return { back: [], front: [C_(m, { tex: 'v', tipUp: true, flame: true, spike: true })], topOnly: fl };
  };

  /* --------------------------------------------------------------- painting */
  const TIE_COL = '#ff4fa3';
  function paintOp(X, op, dx, dy, layer) {
    const P = X.P, L = X.L, rp = op.rp || X.hairR, m = shiftM(op.m, dx, dy);
    const b = m.bounds(); if (!b) return;
    let tip = null;
    if (op.flame) {
      tip = { rp: ramp(mix(L.hair.color, '#ffe14d', 0.8)), y0: b.y0, y1: b.y1, up: true, cut: 0.45 };
      if (L.hair.tip) tip.rp = ramp(L.hair.tip);
    } else if (L.hair.tip) {
      tip = { rp: ramp(L.hair.tip), y0: b.y0, y1: b.y1, up: !!op.tipUp, cut: 0.6 };
    }
    const hair = L.hair.color;
    const fnBase = (x, y, i, col) => {
      const k = op.tex;
      if (op.buzz) {
        // short stubble: hair colour dithered with skin; fade = denser at the top, sparser at the bottom
        return i === 0 || i === 1 ? rp.light : i === 2 ? rp.shade : rp.deep;
      }
      if (i === 2 || i === 1) {
        if (k === 'v' && ((x * 5 + (y >> 2) * 3) % 7 === 0)) return rp.shade;
        if (k === 'wave' && (((x + ((y + (x >> 1)) >> 1)) % 4) === 0)) return rp.shade;
        if (k === 'loc' && ((y + (x >> 1) * 2) % 5 === 0)) return rp.shade;
      }
      return null;
    };
    const o = { cap: op.big ? 5 : 4, hi: true, bias: op.bias || 0, tip, fn: fnBase };
    // the shade() helper paints px; to skip pixels we paint into a scratch and copy
    const tmp = new BBH.Pix(P.w, P.h);
    shade(tmp, m, rp, o);
    if (op.tex === 'curl' && op.bumps) {
      // per-curl shading: each bump gets its own volume so the cloud reads as individual curls
      op.bumps.forEach((bp) => {
        const bm = bump(bp[0] + dx, bp[1] + dy, bp[2]).and(m);
        shade(tmp, bm, rp, { cap: 3, hi: true, tip });
      });
    }
    if (op.plait) {
      m.each((x, y) => { const k = (y + (x - dx)) >> 0; if (((y - dy) & 3) < 2 ? ((x + ((y - dy) >> 1)) & 1) : !((x + ((y - dy) >> 1)) & 1)) tmp.px(x, y, rp.shade); });
    }
    // copy (skipping pixels flagged by the stubble pattern)
    const d = tmp.data, pd = P.data;
    m.each((x, y) => {
      const i = (y * P.w + x) * 4;
      if (op.buzz) { const th = ((x * 7 + y * 13) % 8) / 8; let dens = 0.62; if (op.fade) { const t = (y - b.y0) / Math.max(1, b.y1 - b.y0); dens = 0.95 - t * 0.95; } if (th > dens) return; }
      if (d[i + 3]) P.px(x, y, [d[i], d[i + 1], d[i + 2], 255]);
    });
    if (op.hiTop) {   // sheen: a light arc on the upper left
      const hb = m.bounds();
      for (let x = hb.x0; x <= hb.x1; x++) {
        for (let y = hb.y0; y < hb.y0 + 6; y++) if (m.get(x, y)) { if (x < CX + dx - 2 && x > CX + dx - 8 && ((x + y) % 2 === 0) && y <= hb.y0 + 2 + ((x - hb.x0) < 5 ? 2 : 0)) P.px(x, y, rp.hi); break; }
      }
    }
    if (op.det) op.det((x, y, c) => P.px(x + dx, y + dy, c), rp);
    if (op.tieAt) for (const [tx, ty] of op.tieAt) { P.px(tx + dx - 0.5, ty + dy, TIE_COL); P.px(tx + dx + 0.5, ty + dy, TIE_COL); P.px(tx + dx - 0.5, ty + dy + 1, mix(TIE_COL, PAL.ink, 0.35)); P.px(tx + dx + 0.5, ty + dy + 1, mix(TIE_COL, PAL.ink, 0.35)); }
    if (op.tailTie) { const [tx, ty] = op.tailTie; P.px(tx + dx - 0.5, ty + dy, TIE_COL); P.px(tx + dx + 0.5, ty + dy, TIE_COL); }
  }

  function hairOps(X) {
    if (X._hair) return X._hair;
    const L = X.L, S = X.S;
    const c = { hm: localHead(X), S, hairR: X.hairR, hatZone: X.hatInfo.zone, tieCol: TIE_COL };
    const fn = STY[L.hair.style] || STY.crop;
    const res = fn(c);
    const zone = X.hatInfo.zone;
    if (zone != null) {
      const cut = (op) => { const m = op.m.clone(); const lim = R(zone); for (let y = 0; y < lim; y++) for (let x = 0; x < 44; x++) m.set(x, y, 0); op.m = m; return op; };
      res.front = res.front.map(cut).filter((o) => o.m.bounds());
      res.back = res.back.map((o) => (o.m.bounds() ? o : o));
      if (res.topOnly) res.back = res.back.filter((o) => o.m.bounds());
    }
    // hair style 'buns' / 'topknot' under a hat: drop the high parts
    X._hair = res;
    return res;
  }

  function back(X) {
    const res = hairOps(X), dx = X.S.head.x - CX, dy = X.S.head.y - HY;
    for (const op of res.back) paintOp(X, op, dx, dy, 'back');
  }
  function front(X) {
    const res = hairOps(X), dx = X.S.head.x - CX, dy = X.S.head.y - HY, P = X.P;
    for (const op of res.front) paintOp(X, op, dx, dy, 'front');
    if (res.shine && X.hatInfo.zone == null) {
      const rp = X.K.r; P.px(CX + dx - 4.5, R(1.5) + dy, rp.hi); P.px(CX + dx - 3.5, R(1) + dy, rp.hi); P.px(CX + dx - 5.5, R(2.5) + dy, rp.light);
    }
  }
  // shadow cast on the forehead by the hair fringe and by the hat brim (before the face features are painted)
  function hatShadow(X) {
    const res = hairOps(X), dx = X.S.head.x - CX, dy = X.S.head.y - HY, P = X.P, K = X.K;
    const all = M(); for (const op of res.front) all.or(op.m);
    const hat = hatMaskOf(X);
    if (hat) all.or(hat);
    const sh = M(); const sm = shiftM(all, dx, dy);
    sm.each((x, y) => { if (!sm.get(x, y + 1)) sh.set(x, y + 1); });
    const hm = headMask(X.S);
    sh.and(hm).sub(sm);
    const lim = R(8) + dy;
    sh.each((x, y) => { if (y < lim) { const p = P.get(x, y); if (p[3] > 200) P.px(x, y, mix([p[0], p[1], p[2]], mix(K.r.shade, K.r.deep, 0.3), 0.7)); } });
  }

  /* -------------------------------------------------------------------- hats */
  // zone: first head row where hair may show (rows above are covered by the hat). null = hair untouched.
  const HAT_ZONE = { cap: 4, capback: 4, beanie: 5, bandana: 4, snapback: 4, bucket: 5, beret: 3, fedora: 4, cowboy: 4, tophat: 4, pirate: 3, chef: 4, wizard: 4 };
  function hatInfo(X) { return { zone: X.hatId in HAT_ZONE ? HAT_ZONE[X.hatId] : null }; }

  const HAT = {};
  // each hat: (c) -> { m (silhouette mask, for shadows and clipping), draw(P, px, c) }
  const domeRows = (r0, hws) => rowsM(r0, hws);

  HAT.cap = (c) => {
    const dome = domeRows(-3, [4, 7, 9, 10, 11, 11, 11]);
    const brim = domeRows(4, [11, 10]);
    const brimU = domeRows(6, [6]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true });
        shade(P, brim.shift(dx, dy), { hi: rp.light, light: rp.light, base: rp.base, shade: rp.shade, deep: rp.deep }, { cap: 2 });
        // seams, button, band line
        for (let r = -2; r <= 2; r++) { P.px(CX - 3.5 + dx, R(r) + dy + (r < 0 ? 0 : 0), rp.shade); P.px(CX + 3.5 + dx, R(r) + dy, rp.shade); }
        P.px(CX - 0.5 + dx, R(-4) + dy, rp.light); P.px(CX + 0.5 + dx, R(-4) + dy, rp.light);
        for (let x = CX - 10.5; x <= CX + 10.5; x++) P.px(x + dx, R(3) + dy, rp.deep);
        for (let x = CX - 6.5; x <= CX + 6.5; x++) P.px(x + dx, R(5) + dy, rp.deep);
        P.px(CX - 7.5 + dx, R(4) + dy, rp.hi); P.px(CX - 6.5 + dx, R(4) + dy, rp.hi);
      },
    };
  };

  HAT.capback = (c) => {
    const dome = domeRows(-3, [4, 7, 9, 10, 11, 11, 11, 11]);
    const peeks = M(); for (const s of [-1, 1]) { peeks.set(Math.round(CX + s * 11.5), R(4)); peeks.set(Math.round(CX + s * 12.5), R(4)); peeks.set(Math.round(CX + s * 12.5), R(3)); peeks.set(Math.round(CX + s * 11.5), R(5)); }
    return {
      m: dome.clone().or(peeks),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, peeks.shift(dx, dy), rp, { cap: 2 });
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true });
        for (let r = -2; r <= 3; r++) { P.px(CX - 0.5 + dx, R(r) + dy, rp.shade); P.px(CX + 0.5 + dx, R(r) + dy, rp.shade); }
        for (let x = CX - 10.5; x <= CX + 10.5; x++) P.px(x + dx, R(4) + dy, rp.deep);
        // size strap + buckle at the front
        P.rect(CX - 2.5 + dx, R(2) + dy, 5, 2, rp.deep); P.px(CX - 1.5 + dx, R(2) + dy, '#e8d28a'); P.px(CX - 0.5 + dx, R(2) + dy, '#fff0b8');
        P.px(CX + 0.5 + dx, R(2) + dy, '#e8d28a'); P.px(CX + 1.5 + dx, R(2) + dy, '#e8d28a');
      },
    };
  };

  HAT.snapback = (c) => {
    const dome = domeRows(-4, [5, 8, 10, 11, 11, 11, 11, 11]);
    const brim = domeRows(4, [12.5, 12]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, front = mix(o.col, '#ffffff', 0.28);
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true });
        // two-tone front panel
        const panel = M().rows(R(-3), [5, 6, 6.5, 7, 7, 7, 7]).shift(dx, dy);
        shade(P, panel, ramp(front), { cap: 3, hi: true });
        // star logo
        P.px(CX - 0.5 + dx, R(-1) + dy, '#ffe14d'); P.px(CX + 0.5 + dx, R(-1) + dy, '#ffe14d'); P.px(CX - 0.5 + dx, R(0) + dy, '#fff7b0'); P.px(CX + 0.5 + dx, R(0) + dy, '#ffe14d'); P.px(CX - 1.5 + dx, R(0) + dy, '#ffe14d'); P.px(CX + 1.5 + dx, R(0) + dy, '#ffe14d');
        for (let x = CX - 10.5; x <= CX + 10.5; x++) P.px(x + dx, R(3) + dy, rp.deep);
        const bs = { hi: rp.hi, light: rp.light, base: rp.base, shade: rp.shade, deep: rp.deep };
        shade(P, brim.shift(dx, dy), bs, { cap: 2 });
        for (let x = CX - 12; x <= CX + 12; x++) P.px(x + dx, R(5) + dy, rp.deep);
        P.px(CX - 9.5 + dx, R(4) + dy, rp.hi); P.px(CX - 8.5 + dx, R(4) + dy, rp.hi);
        P.px(CX - 0.5 + dx, R(5) + dy, rp.shade); P.px(CX + 0.5 + dx, R(5) + dy, rp.shade);
      },
    };
  };

  HAT.beanie = (c) => {
    const dome = domeRows(-3, [5, 8, 10, 11, 11, 11, 11, 11]);
    const cuff = domeRows(2, [11, 11, 11]);
    return {
      m: dome.clone().or(cuff).or(bump(CX, R(-4.6), 2.4)),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, pp = ramp(mix(o.col, '#ffffff', 0.3));
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true });
        // knit ribs on the body, a folded cuff
        dome.each((x, y) => { if (y < R(2) && (x % 3 === 0) && y > R(-2)) P.px(x + dx, y + dy, rp.shade); });
        const cf = cuff.shift(dx, dy);
        shade(P, cf, ramp(mix(o.col, '#ffffff', 0.12)), { cap: 3, hi: true });
        cuff.each((x, y) => { if (x % 2 === 0) P.px(x + dx, y + dy, rp.shade); });
        for (let x = CX - 10.5; x <= CX + 10.5; x++) P.px(x + dx, R(1) + dy, rp.deep);
        shade(P, bump(CX + dx, R(-4.6) + dy, 2.4), pp, { cap: 3, hi: true });
        P.px(CX - 1 + dx, R(-5.5) + dy, pp.hi); P.px(CX + 1.5 + dx, R(-4) + dy, pp.shade);
      },
    };
  };

  HAT.bandana = (c) => {
    const cloth = domeRows(-1, [5, 8, 10, 10.5, 10.5, 10.5]);
    const knot = M().rows(R(3), [1.5, 1.5], CX + 11.5).or(M().poly([[CX + 11, R(4)], [CX + 14, R(9)], [CX + 11, R(8)]])).or(M().poly([[CX + 11, R(4)], [CX + 13.5, R(6)], [CX + 14.5, R(11)], [CX + 12, R(9)]]));
    return {
      m: cloth.clone().or(knot),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, pat = rp.hi;
        shade(P, cloth.shift(dx, dy), rp, { cap: 4, hi: true });
        shade(P, knot.shift(dx, dy), rp, { cap: 2 });
        // paisley dots + a darker edge along the forehead
        cloth.each((x, y) => { const q = (x * 2 + y * 3) % 7; if (q === 0 && y < R(3)) P.px(x + dx, y + dy, pat); if (q === 3 && y < R(3)) P.px(x + dx, y + dy, rp.shade); });
        for (let x = CX - 10.5; x <= CX + 10.5; x++) P.px(x + dx, R(4) + dy, rp.deep);
        P.px(CX + 11.5 + dx, R(3) + dy, rp.deep); P.px(CX + 12.5 + dx, R(6) + dy, rp.shade);
      },
    };
  };

  HAT.headband = (c) => {
    const band = domeRows(3, [10.5, 10.5]);
    return {
      m: band,
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, band.shift(dx, dy), rp, { cap: 2, hi: true });
        for (let x = CX - 10; x <= CX + 10; x += 5) { P.px(x + dx, R(3) + dy, rp.hi); }
        for (let x = CX - 10.5; x <= CX + 10.5; x++) P.px(x + dx, R(4) + dy, rp.shade);
        // sweat-band stripe
        for (let x = CX - 8.5; x <= CX + 8.5; x++) if (((x * 2) | 0) % 4 === 1) P.px(x + dx, R(3) + dy, rp.light);
      },
    };
  };

  HAT.bucket = (c) => {
    const dome = domeRows(-2, [5, 8, 10, 11, 11]);
    const brim = M().rows(R(3), [11.5, 13, 13.5, 12.5]).or(M().rows(R(5), [13.5, 13.5])).or(M().rows(R(6), [13, 12]).sub(M().rows(R(6), [9, 9])));
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true });
        shade(P, brim.shift(dx, dy), rp, { cap: 3 });
        for (let x = CX - 12.5; x <= CX + 12.5; x++) P.px(x + dx, R(3) + dy, rp.deep);
        for (let x = CX - 12; x <= CX + 12; x += 2) P.px(x + dx, R(5) + dy, rp.shade);
        for (let x = CX - 10; x <= CX + 10; x += 2) P.px(x + dx, R(1) + dy, rp.shade);
        P.px(CX - 0.5 + dx, R(-3) + dy, rp.light); P.px(CX + 0.5 + dx, R(-3) + dy, rp.light);
        P.px(CX - 10.5 + dx, R(4) + dy, rp.hi);
      },
    };
  };

  HAT.beret = (c) => {
    const body = ell(CX - 1, R(-0.5), 11, 4.2).or(rowsM(2, [10, 10, 9], CX - 1));
    const stem = M().rect(Math.round(CX - 1.5), R(-5), 2, 2);
    return {
      m: body.clone().or(stem),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, body.shift(dx, dy), rp, { cap: 5, hi: true });
        shade(P, stem.shift(dx, dy), rp, { cap: 2 });
        // fabric folds
        for (let i = 0; i < 4; i++) { P.px(CX - 7 + i * 3 + dx, R(-1) + dy + (i % 2), rp.shade); P.px(CX - 6 + i * 3 + dx, R(0) + dy + (i % 2), rp.shade); }
        for (let x = CX - 10.5; x <= CX + 8.5; x++) P.px(x + dx, R(3) + dy, rp.deep);
        P.px(CX - 7.5 + dx, R(-2) + dy, rp.hi); P.px(CX - 6.5 + dx, R(-2) + dy, rp.hi);
      },
    };
  };

  HAT.fedora = (c) => {
    const crown = domeRows(-5, [4.5, 6.5, 8, 8.5, 9, 9, 9, 9]);
    const brim = M().rows(R(3), [13.5, 13.5]).or(M().rows(R(5), [11.5]));
    const bandM = domeRows(1, [9.2, 9.2]);
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, bc = ramp(mix(o.col, '#ffffff', 0.0) === o.col ? mix(o.col, PAL.ink, 0.45) : o.col);
        shade(P, crown.shift(dx, dy), rp, { cap: 4, hi: true });
        // pinch dent
        for (let r = -5; r <= -2; r++) { P.px(CX - 0.5 + dx, R(r) + dy, rp.deep); P.px(CX + 0.5 + dx, R(r) + dy, rp.deep); }
        P.px(CX - 2.5 + dx, R(-4) + dy, rp.shade); P.px(CX + 2.5 + dx, R(-4) + dy, rp.shade);
        shade(P, bandM.shift(dx, dy), bc, { cap: 2, hi: true });
        P.px(CX + 6.5 + dx, R(1) + dy, '#e8c050'); P.px(CX + 6.5 + dx, R(2) + dy, '#b88a30');
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        for (let x = CX - 13; x <= CX + 13; x++) P.px(x + dx, R(4) + dy, rp.shade);
        for (let x = CX - 11; x <= CX + 11; x++) P.px(x + dx, R(5) + dy, rp.deep);
        for (let x = CX - 12; x <= CX + 12; x += 6) P.px(x + dx, R(3) + dy, rp.hi);
      },
    };
  };

  HAT.cowboy = (c) => {
    const crown = domeRows(-4, [5, 7.5, 8, 8.5, 9, 9, 9, 9]);
    const brim = M().rows(R(2), [14.5]).or(M().rows(R(3), [14, 14])).or(M().rows(R(5), [10.5])).sub(M().rect(Math.round(CX - 9), R(2), 18, 1));
    brim.or(M().rows(R(4), [12.5]));
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, crown.shift(dx, dy), rp, { cap: 4, hi: true });
        P.px(CX - 0.5 + dx, R(-4) + dy, rp.deep); P.px(CX + 0.5 + dx, R(-4) + dy, rp.deep); P.px(CX - 2.5 + dx, R(-3) + dy, rp.shade); P.px(CX + 2.5 + dx, R(-3) + dy, rp.shade);
        const bc = ramp(mix(o.col, PAL.ink, 0.5));
        shade(P, domeRows(1, [9, 9]).shift(dx, dy), bc, { cap: 2, hi: true });
        P.rect(CX - 1 + dx, R(1) + dy, 2, 2, '#e8c050'); P.px(CX - 0.5 + dx, R(1) + dy, '#fff0a0');
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        for (let x = CX - 12.5; x <= CX + 12.5; x++) P.px(x + dx, R(5) + dy, rp.deep);
        for (const s of [-1, 1]) { P.px(CX + s * 14 + dx - (s > 0 ? 0 : 0), R(2) + dy, rp.hi); P.px(CX + s * 11.5 + dx, R(3) + dy, rp.shade); }
      },
    };
  };

  HAT.tophat = (c) => {
    const crown = domeRows(-9, [7.5, 8, 8, 8, 8, 8, 8, 8, 8, 8]);
    const brim = rowsM(2, [12.5, 12]);
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, crown.shift(dx, dy), rp, { cap: 4, hi: true });
        // silk sheen
        for (let r = -8; r <= -2; r++) P.px(CX - 4.5 + dx, R(r) + dy, rp.light);
        P.px(CX - 4.5 + dx, R(-9) + dy, rp.hi); P.px(CX - 5.5 + dx, R(-8) + dy, rp.hi);
        const bc = ramp(mix(o.col, '#d4a017', 0.0) && '#c42a45');
        shade(P, domeRows(-1, [8, 8]).shift(dx, dy), bc, { cap: 2, hi: true });
        P.rect(CX - 1 + dx, R(-1) + dy, 2, 2, '#ffe14d');
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        for (let x = CX - 12; x <= CX + 12; x++) P.px(x + dx, R(3) + dy, rp.deep);
        P.px(CX - 9.5 + dx, R(2) + dy, rp.hi); P.px(CX - 8.5 + dx, R(2) + dy, rp.hi);
      },
    };
  };

  HAT.catears = (c) => {
    const ringM = cap(c, 6, 1).sub(cap(c, 6, 0)).sub(M().rect(0, R(6), 44, 9));
    const ears = [];
    for (const s of [-1, 1]) ears.push(M().poly([[CX + s * 10, R(0)], [CX + s * 8.5, R(-6)], [CX + s * 3.2, R(-2.4)]]));
    const em = M(); ears.forEach((e) => em.or(e));
    return {
      m: ringM.clone().or(em),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, pk = ramp('#ff7ab6');
        shade(P, ringM.shift(dx, dy), rp, { cap: 2, hi: true });
        ears.forEach((e) => { shade(P, e.shift(dx, dy), rp, { cap: 3, hi: true }); });
        for (const s of [-1, 1]) {
          const inner = M().poly([[CX + s * 8.6, R(-0.4)], [CX + s * 7.9, R(-3.6)], [CX + s * 4.8, R(-1.6)]]);
          flat(P, inner.shift(dx, dy), pk.base); inner.shift(dx, dy).each((x, y) => { if (!inner.shift(dx, dy).get(x - s, y)) P.px(x, y, pk.light); });
        }
      },
    };
  };

  HAT.crown = (c) => {
    const base = domeRows(-1, [8.5, 9, 9]);
    const pts = M();
    [[-8, 4], [-4, 6], [0, 7.5], [4, 6], [8, 4]].forEach(([dx, h]) => pts.or(M().poly([[CX + dx - 2, R(-1)], [CX + dx + 2, R(-1)], [CX + dx, R(-1 - h)]])));
    pts.or(rowsM(-3, [8.5, 8.5]));
    return {
      m: base.clone().or(pts),
      draw(P, o) {
        const rp = ramp('#e8b923'), dx = o.dx, dy = o.dy;
        shade(P, pts.clone().sub(base).shift(dx, dy), rp, { cap: 3, hi: true });
        shade(P, base.shift(dx, dy), rp, { cap: 2, hi: true });
        for (const [x, y, cc] of [[-8, -8, '#ff4fa3'], [-4, -6, '#2ee6ff'], [0, -8.5, '#ff4fa3'], [4, -6, '#2ee6ff'], [8, -8, '#ff4fa3']]) { /* ball tips */ P.px(CX + x + dx + (x < 0 ? 0 : 0) + 0.0, R(y + 0) + dy, '#fff3b0'); }
        const gem = o.col;
        for (const gx of [-5.5, -0.5, 4.5]) { P.px(CX + gx + dx, R(0) + dy, gem); P.px(CX + gx + 1 + dx, R(0) + dy, mix(gem, '#ffffff', 0.5)); }
        for (let x = CX - 8.5; x <= CX + 8.5; x++) P.px(x + dx, R(1) + dy, rp.deep);
      },
    };
  };

  HAT.halo = (c) => {
    const ring = M().ellipse(CX, R(-5), 8, 2.3).sub(M().ellipse(CX, R(-5), 5.8, 1.1));
    return {
      m: M(), noClip: true,
      draw(P, o) {
        const dx = o.dx, dy = o.dy, g = '#ffe56a', g2 = '#fff9c0', d = '#c98f1a';
        // soft dithered glow around the ring
        const glow = M().ellipse(CX, R(-5), 10, 4.2);
        glow.each((x, y) => { if (!ring.get(x, y) && ((x + y) & 1) && P.alphaAt(x + dx, y + dy) < 10) P.px(x + dx, y + dy, g, 70); });
        ring.each((x, y) => { P.px(x + dx, y + dy, y > R(-5) ? d : (x < CX - 2 ? g2 : g)); });
        P.px(CX - 4.5 + dx, R(-7) + dy, '#ffffff');
      },
    };
  };

  HAT.visor = (c) => {
    const band = domeRows(1, [10.5, 10.5, 10.5]);
    const bill = M().rows(R(3), [12.5, 12, 11]);
    return {
      m: band.clone().or(bill),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, nc = '#2ee6ff';
        shade(P, band.shift(dx, dy), rp, { cap: 2, hi: true });
        // translucent neon bill: tinted, dithered
        const tint = ramp(mix(o.col, nc, 0.45));
        bill.each((x, y) => { const r = y - HY; const col = r === 3 ? tint.hi : ((x + y) & 1) ? tint.base : tint.light; P.px(x + dx, y + dy, col); });
        for (let x = CX - 12; x <= CX + 12; x++) P.px(x + dx, R(5) + dy, nc);
        for (let x = CX - 11; x <= CX + 11; x++) if (!((x + 1) & 1)) P.add(x + dx, R(6) + dy, nc, 70);
        for (let x = CX - 8; x <= CX + 8; x += 3) P.px(x + dx, R(2) + dy, nc);
      },
    };
  };

  HAT.chef = (c) => {
    const puff = ell(CX - 5.5, R(-2.5), 5.4, 4.6).or(ell(CX + 5.5, R(-2.5), 5.4, 4.6)).or(ell(CX, R(-5), 6.2, 4.4)).or(rowsM(-1, [8.5, 9, 9.5, 9.5, 9.5]));
    const band = domeRows(2, [9.8, 9.8]);
    return {
      m: puff.clone().or(band),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, puff.shift(dx, dy), rp, { cap: 5, hi: true });
        for (const [x, y] of [[-6, -1], [6, -1], [-2, -5], [3, -4], [0, 0]]) { P.px(CX + x + dx, R(y) + dy, rp.shade); P.px(CX + x + dx, R(y + 1) + dy, rp.shade); }
        shade(P, band.shift(dx, dy), rp, { cap: 2, hi: true });
        for (let x = CX - 9.5; x <= CX + 9.5; x++) P.px(x + dx, R(3) + dy, rp.deep);
      },
    };
  };

  HAT.wizard = (c) => {
    const brim = ell(CX, R(3), 13, 2.2);
    const cone = M().poly([[CX - 8.5, R(3)], [CX - 6, R(-2)], [CX - 2.5, R(-6)], [CX + 2, R(-9)], [CX + 5.5, R(-9.4)], [CX + 4.2, R(-6)], [CX + 5.5, R(-1)], [CX + 8.5, R(3)]]);
    return {
      m: brim.clone().or(cone),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, cone.shift(dx, dy), rp, { cap: 5, hi: true });
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        const bc = ramp(mix(o.col, '#ffe14d', 0.7));
        for (let x = CX - 8.5; x <= CX + 8.5; x++) { P.px(x + dx, R(2) + dy, bc.base); }
        P.px(CX - 6.5 + dx, R(2) + dy, bc.light);
        // star + moon decals
        const st = '#ffe14d';
        P.px(CX - 2.5 + dx, R(-2) + dy, st); P.px(CX - 3.5 + dx, R(-1) + dy, st); P.px(CX - 2.5 + dx, R(-1) + dy, '#fff7b0'); P.px(CX - 1.5 + dx, R(-1) + dy, st); P.px(CX - 2.5 + dx, R(0) + dy, st);
        P.px(CX + 2.5 + dx, R(-4) + dy, st); P.px(CX + 3.5 + dx, R(-5) + dy, st); P.px(CX + 3.5 + dx, R(-3) + dy, '#fff7b0');
        for (let x = CX - 12; x <= CX + 12; x++) if (!M().ellipse(CX, R(3), 13, 2.2).get(x, R(5))) P.px(x + dx, R(5) + dy, rp.deep);
        P.px(CX - 9.5 + dx, R(3) + dy, rp.hi);
      },
    };
  };

  HAT.pirate = (c) => {
    const body = M().rows(R(-5), [4.5, 8, 10.5, 12, 13.5, 13.5, 12.5]).or(M().poly([[CX - 14, R(1)], [CX - 12, R(-2)], [CX - 11, R(2.5)]])).or(M().poly([[CX + 14, R(1)], [CX + 12, R(-2)], [CX + 11, R(2.5)]]));
    body.sub(M().poly([[CX - 14, R(3)], [CX - 6, R(3)], [CX - 8, R(2)], [CX - 14, R(2.5)]]).sub(M())).sub(M().rect(0, R(2), 3, 1));
    return {
      m: body,
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy, gd = '#e8b923';
        shade(P, body.shift(dx, dy), rp, { cap: 4, hi: true });
        // gold trim along the lower edge
        body.each((x, y) => { if (!body.get(x, y + 1) && y > R(-1)) P.px(x + dx, y + dy, gd); });
        for (let x = CX - 12; x <= CX + 12; x++) if (body.get(x, R(-5))) P.px(x + dx, R(-5) + dy, gd);
        // skull and crossbones
        const sk = '#fffaf0', dk = '#120d1f';
        P.px(CX - 1.5 + dx, R(-3) + dy, sk); P.px(CX - 0.5 + dx, R(-3) + dy, sk); P.px(CX + 0.5 + dx, R(-3) + dy, sk); P.px(CX + 1.5 + dx, R(-3) + dy, sk);
        P.px(CX - 1.5 + dx, R(-2) + dy, sk); P.px(CX - 0.5 + dx, R(-2) + dy, dk); P.px(CX + 0.5 + dx, R(-2) + dy, dk); P.px(CX + 1.5 + dx, R(-2) + dy, sk);
        P.px(CX - 0.5 + dx, R(-1) + dy, sk); P.px(CX + 0.5 + dx, R(-1) + dy, sk);
        P.px(CX - 3.5 + dx, R(-1) + dy, sk); P.px(CX + 3.5 + dx, R(-1) + dy, sk); P.px(CX - 2.5 + dx, R(0) + dy, sk); P.px(CX + 2.5 + dx, R(0) + dy, sk);
        P.px(CX - 3.5 + dx, R(0) + dy, rp.shade); P.px(CX + 3.5 + dx, R(0) + dy, rp.shade);
      },
    };
  };

  HAT.headphonehat = (c) => {
    const ringM = cap(c, 9, 1).sub(cap(c, 9, 0)).sub(M().rect(0, R(9), 44, 9)).sub(M().rect(0, R(0), 4, 20));
    const bandM = ringM.clone().or(cap(c, 8, 2).sub(cap(c, 8, 1)).and(M().rect(0, 0, 44, R(5))));
    const puffs = [];
    for (const s of [-1, 1]) puffs.push(M().ellipse(CX + s * 11.2, R(9.5), 3.3, 4.2));
    const pm = M(); puffs.forEach((p) => pm.or(p));
    return {
      m: pm.clone().or(bandM),
      draw(P, o) {
        const rp = o.rp, dx = o.dx, dy = o.dy;
        shade(P, bandM.shift(dx, dy), rp, { cap: 2, hi: true });
        puffs.forEach((p) => { shade(P, p.shift(dx, dy), rp, { cap: 4, hi: true });
          p.each((x, y) => { if (((x * 3 + y * 5) % 4) === 0) P.px(x + dx, y + dy, rp.hi); else if (((x * 5 + y * 3) % 7) === 0) P.px(x + dx, y + dy, rp.shade); }); });
        // fur fuzz on the silhouette
        puffs.forEach((p, i) => { const s = i ? 1 : -1; P.px(CX + s * 14.5 + dx, R(8) + dy, rp.light); P.px(CX + s * 14.5 + dx, R(11) + dy, rp.light); });
      },
    };
  };

  function hatMaskOf(X) {
    if (X.hatId === 'none') return null;
    if (!X._hat) X._hat = buildHat(X);
    const h = X._hat; if (!h) return null;
    return h.noClip ? null : shiftM(h.m, X.S.head.x - CX, X.S.head.y - HY);
  }
  function buildHat(X) {
    const fn = HAT[X.hatId]; if (!fn) return null;
    return fn({ hm: localHead(X), S: X.S, X });
  }
  function hat(X) {
    if (X.hatId === 'none') return;
    if (!X._hat) X._hat = buildHat(X);
    const h = X._hat; if (!h) return;
    const col = X.L.hat.color;
    h.draw(X.P, { rp: ramp(col), col, dx: X.S.head.x - CX, dy: X.S.head.y - HY });
  }

  Object.assign(BBH, { CharsHair: { hatInfo, back, front, hatShadow, hat, STY, HAT, R } });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsHair;
})(typeof globalThis !== 'undefined' ? globalThis : this);
