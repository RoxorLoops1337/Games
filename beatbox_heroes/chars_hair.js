// BEATBOX HEROES -- chars_hair.js
// Part 2 of the character renderer: hair styles (a back layer behind the head and a front layer over it) and hats.
// Hats hide / lower the hair under them (hatInfo.zone) and cast a shadow on the forehead.
// All shapes are built in "head-local" design space (head top row HY, mirror axis CX) and shifted to the pose's head
// position when painted, so every pose and every hat/hair pair shares the same geometry at any grid size.
(function (root) {
  'use strict';
  const BBH = root.BBH || (root.BBH = {});
  if (typeof require !== 'undefined') {
    if (!BBH.Pix) require('./pix.js');
    if (!BBH.CATALOG) require('./catalog.js');
    if (!BBH.CharsKit) require('./chars_body.js');
  }
  const { PAL, mix } = BBH;
  const Kit = BBH.CharsKit, { CX, HY, M, Painter, shade, flat, headMask, GR, iX, iY, nx, ny } = Kit;
  const ramp = (c) => Kit.softRamp(c);
  const R = (r) => HY + r;

  /* ----------------------------------------------------------- local helpers */
  const localHead = (X) => headMask({ G: X.S.G, face: { puff: X.S.face.puff } }, true);
  const cap = (c, upto, vol) => {
    let m = c.hm.clone().clipY(0, R(upto));
    if (vol) m = m.growD(vol).clipY(0, R(upto));
    return m;
  };
  const win = (cy, rx, ry, dx) => M().ellipse(CX + (dx || 0), R(cy), rx, ry);
  const ell = (cx, cy, rx, ry) => M().ellipse(cx, cy, rx, ry);
  const rowsM = (r0, hws, cx) => M().rows(R(r0), hws, cx);
  const bump = (cx, cy, r) => M().ellipse(cx, cy, r, r);
  const dot1 = (m, x, y) => m.or(M().rect(x, y, 1, 1));
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) % 1000 / 1000; };
  const C_ = (m, o) => Object.assign({ m }, o || {});
  const TIE_COL = '#ff4fa3';

  /* ------------------------------------------------------------------- hair */
  // A style: (c) -> { back:[op], front:[op], topOnly?, shine? }. op = { m, tex, bias, rp, big, tieAt, tipUp, buzz, fade, bumps, ... }
  const STY = {};
  STY.bald = () => ({ back: [], front: [], shine: true });

  STY.buzz = (c) => ({ back: [], front: [C_(cap(c, 9, 0).sub(win(12.5, 8.6, 9.6)), { buzz: true })] });

  STY.crop = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.8, 9));
    m.or(ell(CX + 1.5, R(-1), 6, 2));
    for (const [dx, r] of [[-3, 3], [0, 3], [2, 3], [-1, 4], [4, 3], [-5, 3.5]]) dot1(m, CX + dx, R(r));
    return { back: [], front: [C_(m, { tex: 'v', sheen: true })] };
  };

  STY.sidepart = (c) => {
    const m = cap(c, 9, 2).sub(win(12.5, 7.3, 8.6, 1.2));
    m.or(M().poly([[CX - 11, R(2)], [CX + 3, R(1.5)], [CX + 7, R(4.5)], [CX + 1, R(5)], [CX - 5, R(7)], [CX - 9, R(10)], [CX - 11, R(10)]]));
    m.sub(M().poly([[CX + 7, R(8)], [CX + 12, R(8)], [CX + 12, R(0)]]).and(c.hm.clone().sub(c.hm.clone().clipY(0, R(1)))));
    return { back: [], front: [C_(m, { tex: 'v', sheen: true, part: [[CX - 4.3, R(-1)], [CX - 3.3, R(3.5)]] })] };
  };

  STY.quiff = (c) => {
    const m = cap(c, 8, 1).sub(win(12, 7.8, 8.6));
    m.or(ell(CX + 0.5, R(-2.5), 8.2, 4.4)).or(ell(CX - 2, R(0.5), 7, 3));
    m.sub(M().rect(0, R(-8), 44, 2));
    return { back: [], front: [C_(m, { tex: 'v', sheen: true })] };
  };

  STY.undercut = (c) => {
    const sides = cap(c, 9, 0).sub(win(12.5, 8.6, 9.8));
    const top = ell(CX + 0.5, R(-1.5), 8.5, 4.6).or(ell(CX + 1, R(1), 8.5, 3.4)).sub(win(12, 6.4, 8.2, 1));
    top.or(M().poly([[CX - 9, R(2)], [CX + 3, R(2)], [CX + 5, R(4)], [CX - 6, R(4)]]));
    return { back: [], front: [C_(sides.clone().sub(top), { buzz: true, fade: true }), C_(top, { tex: 'v', sheen: true })] };
  };

  STY.fade = (c) => {
    const sides = cap(c, 10, 0).sub(win(12.5, 8.4, 9.8));
    const top = ell(CX, R(0.5), 9.2, 3.8).or(ell(CX, R(1.5), 9.8, 3)).sub(win(12, 7.6, 8.8));
    return { back: [], front: [C_(sides.clone().sub(top), { buzz: true, fade: true }), C_(top, { tex: 'v', sheen: true })] };
  };

  STY.waves = (c) => {
    const m = cap(c, 10, 2).sub(win(13, 7.1, 9.6));
    for (const s of [-1, 1]) for (let r = 4; r <= 16; r += 0.5) {
      const w = Math.sin(r * 0.95 + (s < 0 ? 0 : 1.6)) * 1.1;
      m.or(M().rect(s < 0 ? CX - 11.5 - w : CX + 8.5, R(r), 3 + w * (s < 0 ? 1 : 1), 0.5).sub(win(13, 7.6, 9.6)));
    }
    m.or(M().poly([[CX - 10, R(2)], [CX + 2, R(2)], [CX + 3, R(5)], [CX - 3, R(5.5)], [CX - 8, R(8)], [CX - 10, R(8)]]));
    return { back: [C_(rowsM(8, [11, 11, 10, 10, 10, 9, 9, 8, 7]), { bias: 1 })], front: [C_(m, { tex: 'wave', sheen: true })] };
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
    for (let i = 0; i < 4; i++) { const yy = R(5 + i * 2.2); bumps.push([CX - 12, yy, 2.4], [CX + 12, yy, 2.4]); }
    for (const b of bumps) m.or(bump(b[0], b[1], b[2]));
    m.sub(win(12.8, 8.2, 9.4)); m.clipY(0, R(12));
    return { back: [], front: [C_(m, { tex: 'curl', bumps, big: true })] };
  };

  STY.bob = (c) => {
    const m = cap(c, 9, 2).sub(win(13, 7.5, 9.6));
    const side = M();
    for (const s of [-1, 1]) for (let r = 4; r <= 15; r += 0.5) {
      const hw = r < 13 ? 11.5 : 11.5 - (r - 12) * 0.8, inner = r < 6 ? 6.5 : 8;
      side.or(M().rect(s < 0 ? CX - hw : CX + inner, R(r), hw - inner, 0.5));
    }
    m.or(side);
    m.or(M().poly([[CX - 10, R(2)], [CX + 10, R(2)], [CX + 8, R(5)], [CX - 8, R(5)]]).sub(win(13.5, 6.4, 8.8)));
    return { back: [C_(rowsM(7, [11, 12, 12, 11, 11, 10, 10, 9, 8]), { bias: 1 })], front: [C_(m, { tex: 'v', sheen: true })] };
  };

  STY.long = (c) => {
    const m = cap(c, 10, 2).sub(win(13, 7.5, 9.6));
    m.or(M().poly([[CX - 10, R(2)], [CX + 3, R(2)], [CX + 6, R(4)], [CX + 1, R(5.5)], [CX - 6, R(7)], [CX - 9, R(10)], [CX - 10, R(10)]]).sub(win(13, 7.5, 9.6)));
    const locks = M();
    for (const s of [-1, 1]) for (let r = 8; r <= 26; r += 0.5) {
      const w = r > 22 ? 2 : 3, ox = Math.sin(r * 0.5) * 0.5;
      const x0 = s < 0 ? CX - 11.5 + ox : CX + 8.5 + (3 - w) + ox;
      locks.or(M().rect(x0, R(r), w, 0.5));
    }
    const back = rowsM(6, [11, 11, 11, 11, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 12, 11, 11, 10, 10, 9, 9, 8, 7]);
    return { back: [C_(back, { bias: 1, tex: 'v' })], front: [C_(m, { tex: 'v', sheen: true }), C_(locks, { tex: 'v' })] };
  };

  STY.ponytail = (c) => {
    const m = cap(c, 8, 1).sub(win(11.5, 8.0, 9.2));
    m.or(ell(CX + 1, R(-1), 6.5, 2));
    const tail = M();
    [[CX + 10, R(5), 2.6], [CX + 11.5, R(9), 3], [CX + 12, R(13), 3.2], [CX + 11.5, R(17), 3], [CX + 10.5, R(21), 2.4], [CX + 10, R(24), 1.4]].forEach((b) => tail.or(bump(b[0], b[1], b[2])));
    tail.or(M().capsule(CX + 10, R(5), CX + 10, R(24), 2.2, 1.3));
    return { back: [C_(tail, { tex: 'v', tailTie: [CX + 9.5, R(5.5)] })], front: [C_(m, { tex: 'v', sheen: true, tieAt: [[CX + 9.5, R(5.5)]] })] };
  };

  STY.pigtails = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.8, 9));
    m.or(ell(CX, R(-0.5), 7, 2.2));
    const back = M();
    for (const s of [-1, 1]) {
      const bx = CX + s * 12;
      [[bx - s * 0.5, R(8), 2.4], [bx + s * 0.5, R(12), 3.2], [bx + s * 0.8, R(16), 3.3], [bx + s * 0.6, R(20), 2.8], [bx, R(23), 1.6]].forEach((b) => back.or(bump(b[0], b[1], b[2])));
    }
    return { back: [C_(back, { tex: 'v' })], front: [C_(m, { tex: 'v', sheen: true, tieAt: [[CX - 11.5, R(7.5)], [CX + 11.5, R(7.5)]] })] };
  };

  STY.buns = (c) => {
    const m = cap(c, 8, 1).sub(win(11.5, 8, 9.2));
    const balls = [], bm = M(), bumps = [];
    for (const s of [-1, 1]) { balls.push(bump(CX + s * 7.5, R(-2.4), 3.4)); bumps.push([CX + s * 7.5, R(-2.4), 3.4]); }
    balls.forEach((b) => bm.or(b));
    const lowBuns = M();
    if (c.hatZone != null) for (const s of [-1, 1]) lowBuns.or(bump(CX + s * 12, R(7), 2.8));
    return {
      back: [C_(lowBuns, { tex: 'curl', bumps: [] })],
      front: [C_(m, { tex: 'v', sheen: true }), C_(bm.clone().sub(M().rect(0, R(5), 44, 20)), { tex: 'curl', bumps, tieAt: [[CX - 6.5, R(0.6)], [CX + 6.5, R(0.6)]] })],
      topOnly: bm,
    };
  };

  STY.topknot = (c) => {
    const m = cap(c, 9, 0).sub(win(12.5, 8.6, 9.8));
    m.or(cap(c, 3, 1));
    const knot = bump(CX, R(-3.6), 3.4);
    return { back: [], front: [C_(m, { tex: 'v', sheen: true }), C_(knot.clone(), { tex: 'curl', bumps: [[CX, R(-3.6), 3.4]], tieAt: [[CX, R(-0.6)]] })], topOnly: knot };
  };

  STY.braids = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.8, 9));
    m.or(M().poly([[CX - 10, R(1)], [CX + 10, R(1)], [CX + 9, R(3)], [CX - 9, R(3)]]));
    const braids = [];
    for (const s of [-1, 1]) braids.push(M().capsule(CX + s * 9.8, R(7), CX + s * 9.4, R(27), 1.6, 1.3));
    return { back: [], front: [C_(m, { tex: 'v', sheen: true })].concat(braids.map((b, i) => C_(b, { plait: true, tieAt: [[CX + (i ? 9.4 : -9.4), R(27.5)]] }))) };
  };

  STY.locs = (c) => {
    const m = cap(c, 9, 2).sub(win(12.5, 7.4, 9));
    m.or(M().poly([[CX - 10, R(1)], [CX + 10, R(1)], [CX + 8, R(4)], [CX - 8, R(4)]]).sub(win(12.5, 6.8, 8.6)));
    const strands = M(), xs = [-10.5, -8.5, 8.5, 10.5], ls = [24, 18, 18, 24];
    xs.forEach((dx, i) => strands.or(M().capsule(CX + dx, R(6), CX + dx + (dx < 0 ? -0.6 : 0.6), R(ls[i]), 1.4, 1.2)));
    const back = M();
    [-9.5, -7.5, 7.5, 9.5].forEach((dx, i) => back.or(M().capsule(CX + dx, R(7), CX + dx * 1.05, R(25 + (i % 2) * 2), 1.5, 1.2)));
    back.or(rowsM(6, [11, 11, 11, 10, 10]));
    for (const dx of [-5.5, -2.5, 0.5, 3.5, 6.5]) m.or(M().capsule(CX + dx, R(2), CX + dx, R(4 + (Math.abs(dx) < 3 ? 0 : 1)), 1.1, 0.9));
    return { back: [C_(back, { bias: 1, tex: 'loc' })], front: [C_(m, { tex: 'loc' }), C_(strands, { tex: 'loc' })] };
  };

  STY.mohawk = (c) => {
    const sides = cap(c, 8, 0).sub(win(12.5, 8.8, 9.8));
    const fin = M();
    const hws = [1, 2, 2, 2.5, 2.5, 3, 3, 3, 3];
    fin.rows(R(-7), hws);
    fin.or(M().rows(R(2), [2.5, 2.5, 2])).or(M().rows(R(-1), [3, 3, 3, 3, 3, 3]));
    fin.or(M().poly([[CX - 3, R(-4)], [CX - 5, R(-7)], [CX - 1.5, R(-5)]])).or(M().poly([[CX + 3, R(-4)], [CX + 5, R(-7)], [CX + 1.5, R(-5)]]));
    fin.or(M().poly([[CX - 1, R(-7)], [CX, R(-9)], [CX + 1, R(-7)]]));
    return { back: [], front: [C_(sides.clone().sub(fin), { buzz: true, fade: true }), C_(fin, { tex: 'v', tipUp: true })], topOnly: fin };
  };

  STY.mullet = (c) => {
    const m = cap(c, 9, 1).sub(win(12, 7.7, 9));
    m.or(ell(CX + 1, R(-1), 6.5, 2));
    const side = M();
    for (const s of [-1, 1]) for (let r = 7; r <= 17; r += 0.5) {
      const hw = 9.8 + (r - 7) * 0.2, inner = r < 11 ? 8.3 : 7.2;
      side.or(M().rect(s < 0 ? CX - hw - 1 : CX + inner + 0.5, R(r), hw + 0.5 - inner, 0.5));
    }
    m.or(side);
    return { back: [C_(rowsM(8, [12, 12, 12, 12, 12, 12, 11, 10, 9, 8, 7]), { bias: 1, tex: 'v' })], front: [C_(m, { tex: 'v', sheen: true })] };
  };

  STY.spiky = (c) => {
    const m = cap(c, 8, 1).sub(win(12, 7.8, 9));
    const sp = M();
    [[-9, 4, 3], [-5.5, 6, 3.5], [-1.5, 7.5, 4], [2.5, 6.5, 3.8], [6, 5.5, 3.4], [9.2, 3.5, 2.8]].forEach(([dx, h, w]) => sp.or(M().poly([[CX + dx - w / 2, R(2.2)], [CX + dx + w / 2, R(2.2)], [CX + dx + (dx > 0 ? 0.6 : -0.4), R(2 - h)]])));
    m.or(sp);
    return { back: [], front: [C_(m, { tex: 'v', tipUp: true })], topOnly: sp };
  };

  STY.flame = (c) => {
    const f = c.S.frame || 0, m = cap(c, 8, 1).sub(win(12, 7.8, 9)), fl = M();
    [[-8.5, 5, 0], [-5, 8, 1], [-1.5, 11, 0], [2, 9.5, 1], [5.5, 8, 0], [8.8, 5, 1]].forEach(([dx, h, ph], i) => {
      const wob = [0, 1, 0, -1][(f + i + ph) % 4], lean = (dx > 0 ? 1 : -1) * 1.2 + wob;
      fl.or(M().poly([[CX + dx - 2.4, R(3)], [CX + dx + 2.4, R(3)], [CX + dx + 1.4 + lean * 0.4, R(1 - h * 0.45)], [CX + dx + lean, R(1 - h)], [CX + dx - 1.2, R(1 - h * 0.5)]]));
    });
    fl.sub(M().rect(0, 0, 44, 1));
    m.or(fl);
    return { back: [], front: [C_(m, { tex: 'v', tipUp: true, flame: true })], topOnly: fl };
  };

  // ---- street styles
  STY.cornrows = (c) => {
    const m = cap(c, 9, 0.8).sub(win(12, 7.9, 9.2));
    m.or(ell(CX, R(0.2), 8.8, 2.6));
    // sharp line-up at the hairline: a thin rim of the edge is painted light by the paintOp (lineUp)
    return { back: [], front: [C_(m, { tex: 'rows', lineUp: true })] };
  };

  STY.hightop = (c) => {
    const top = M().rows(R(-6.5), [5.5, 7, 7.6, 7.8, 7.8, 7.8, 7.8, 7.8, 7.8, 7.8, 7.4, 7, 6.4]);
    const sides = cap(c, 10, 0).sub(win(12.5, 8.6, 9.8));
    const frontLine = top.clone().sub(win(12.2, 7.4, 8.4));
    const topM = frontLine.or(cap(c, 3, 1.2).sub(win(12.2, 7.4, 8.4)));
    return { back: [], front: [C_(sides.clone().sub(topM), { buzz: true, fade: true }), C_(topM, { tex: 'v', flatTop: true, sheen: true, lineUp: true })], topOnly: M().rows(R(-6.5), [5.5, 7, 7.6, 7.8, 7.8, 7.8, 7.8, 7.8]) };
  };

  STY.twists = (c) => {
    const base = cap(c, 9, 1).sub(win(12, 7.6, 9));
    const nubs = [];
    const rowsY = [-3.2, -0.6, 2.0, 4.4];
    rowsY.forEach((y, ri) => { const n = ri === 0 ? 4 : 5 + (ri > 1 ? 1 : 0), span = 7.2 + ri * 1.1; for (let i = 0; i < n; i++) { const u = -span + (2 * span * i) / (n - 1); nubs.push([CX + u, R(y) + Math.abs(u) * 0.12, 1.55]); } });
    const sidesN = [[-10.5, 6.2], [10.5, 6.2], [-10.8, 8.4], [10.8, 8.4]];
    sidesN.forEach(([u, v]) => nubs.push([CX + u, R(v), 1.5]));
    const nm = M(); nubs.forEach((b) => nm.or(M().capsule(b[0], b[1] - 0.8, b[0], b[1] + 0.9, b[2], b[2] - 0.1)));
    nm.sub(win(12, 7.0, 8.6));
    const fm = base.clone().or(nm);
    return { back: [], front: [C_(base, { tex: 'v', bias: 0.6 }), C_(nm, { tex: 'twist', bumps: nubs.map((b) => [b[0], b[1], 1.6]) })], topOnly: nm };
  };

  STY.dreadbun = (c) => {
    const m = cap(c, 9, 1.5).sub(win(12.5, 7.6, 9));
    const bun = M(); const bumps = [[CX, R(-4.6), 4.4], [CX - 2.6, R(-3.6), 3.0], [CX + 2.6, R(-3.6), 3.0], [CX, R(-6.2), 2.6]];
    bumps.forEach((b) => bun.or(bump(b[0], b[1], b[2])));
    const strands = M();
    [[-10.4, 20], [-8.6, 15], [8.6, 15], [10.4, 20]].forEach(([dx, l]) => strands.or(M().capsule(CX + dx, R(6), CX + dx * 1.04, R(l), 1.35, 1.1)));
    const back = M(); [-9.5, -7.5, 7.5, 9.5].forEach((dx) => back.or(M().capsule(CX + dx, R(7), CX + dx * 1.05, R(23), 1.4, 1.1))); back.or(rowsM(6, [11, 11, 11, 10]));
    return {
      back: [C_(back, { bias: 1, tex: 'loc' })],
      front: [C_(m, { tex: 'rows' }), C_(strands, { tex: 'loc' }), C_(bun, { tex: 'loc', bumps, bunTie: [CX, R(-0.9)] })], topOnly: bun,
    };
  };

  STY.fadewave = (c) => {
    const sides = cap(c, 10, 0).sub(win(12.5, 8.4, 9.8));
    const top = ell(CX, R(-0.5), 8.8, 4.4).or(ell(CX, R(1.2), 9.4, 3.2)).sub(win(12, 7.9, 8.8));
    return { back: [], front: [C_(sides.clone().sub(top), { buzz: true, fade: true }), C_(top, { tex: 'ring', sheen: true, lineUp: true })] };
  };

  /* --------------------------------------------------------------- painting */
  function paintOp(X, op, dx, dy) {
    const P = X.P, L = X.L, rp = op.rp || X.hairR, m = op.m.shift(dx, dy), b = m.bounds();
    if (!b) return;
    const sx = nx(dx), sy = ny(dy), k = GR.k;
    let tip = null;
    if (op.flame) {
      tip = { rp: ramp(L.hair.tip ? L.hair.tip : mix(L.hair.color, '#ffe14d', 0.8)), y0: b.y0, y1: b.y1, up: true, cut: 0.45 };
    } else if (L.hair.tip) tip = { rp: ramp(L.hair.tip), y0: b.y0, y1: b.y1, up: !!op.tipUp, cut: 0.6 };
    const lu = (x) => iX(x - sx) - CX, lv = (y) => iY(y - sy);
    const fnBase = (x, y, i) => {
      const k2 = op.tex, u = lu(x), v = lv(y);
      if (op.buzz) return i <= 1 ? rp.light : i === 2 ? rp.shade : rp.deep;
      const mid = i === 2 || i === 1;
      switch (k2) {
        case 'v': {
          const s = Math.floor((u + 30) * 1.9), run = Math.floor((v + 20) / (2.3 + (s % 3) * 0.9)), h = hash(s, run);
          if (mid && h < 0.13) return rp.shade;
          if (i === 2 && h > 0.9) return rp.light;
          break;
        }
        case 'wave': if (mid && ((u * 1.25 + v * 0.95 + Math.sin(v * 0.8) * 1.3 + 40) % 3) < 0.55) return rp.shade; if (i === 2 && ((u * 1.25 + v * 0.95 + Math.sin(v * 0.8) * 1.3 + 40) % 3) > 2.5) return rp.light; break;
        case 'loc': { const q = (v * 1.25 + u * 0.7 + 60) % 2.5; if (mid && q < 0.6) return rp.shade; if (i === 2 && q > 2.0) return rp.light; break; }
        case 'rows': {
          const per = Math.max(3, Math.round(2.3 * k)), nu = (x - sx) - (GR.W - 1) / 2, uu = nu * (1 + 0.02 * (v - 4)), q = ((Math.round(uu) % per) + per) % per, s = Math.floor(uu / per + 40);
          if (q === 0) return rp.deep;
          if (q === 1 && ((Math.floor(v / 1.1) + s) & 1)) return rp.light;
          if (q === 2 && ((Math.floor(v / 1.1) + s) & 1) === 0) return rp.shade;
          break;
        }
        case 'ring': {
          const d = Math.hypot(u * 0.85, (v - HY + 1.0 - 2) * 1.2), q = (d * 1.55) % 1;
          if (q < 0.26) return rp.deep; if (q > 0.74 && mid) return rp.light; break;
        }
        case 'rowsP': { const per = Math.max(3, Math.round(2.3 * k)), q = (((y - sy) % per) + per) % per, s2 = Math.floor((x - sx) / 5); if (q === 0) return rp.deep; if (q === 1 && (s2 & 1)) return rp.light; if (q === 2 && !(s2 & 1) && mid) return rp.shade; break; }
        case 'ringP': { const d = Math.hypot((u + CX - 20.5) * 0.9, (v - 12.5) * 1.2), q = (d * 1.55) % 1; if (q < 0.26) return rp.deep; if (q > 0.74 && mid) return rp.light; break; }
        case 'twist': { const q = (u * 0.9 + v * 1.5 + 60) % 2.0; if (q < 0.55) return rp.deep; if (q > 1.5) return rp.light; break; }
      }
      return null;
    };
    const tmp = new BBH.Pix(P.w, P.h);
    shade(tmp, m, rp, { cap: op.big ? 5 : 4, hi: true, bias: op.bias || 0, tip, fn: fnBase, dir: op.dir });
    if ((op.tex === 'curl' || op.tex === 'twist') && op.bumps) {
      op.bumps.forEach((bp) => {
        const bm = bump(bp[0], bp[1], bp[2]).shift(dx, dy).and(m);
        shade(tmp, bm, rp, { cap: 3, hi: true, tip, dir: op.dir, fn: op.tex === 'twist' ? (x, y, i) => fnBase(x, y, i) : undefined });
      });
    }
    if (op.plait) m.each((x, y) => { const v = lv(y), u = lu(x); const a = Math.floor(v / 1.5) & 1; const fr = ((u * 1.0) % 1 + 1) % 1; if ((a ? fr < 0.5 : fr >= 0.5)) tmp.px(x, y, rp.shade); });
    const d = tmp.data;
    m.each((x, y) => {
      const i = (y * P.w + x) * 4;
      if (op.buzz) {
        let dens = 0.62; if (op.fade) { const t = (y - b.y0) / Math.max(1, b.y1 - b.y0); dens = 0.98 - t * 0.98; }
        if (((x * 7 + y * 13) % 8) / 8 > dens) return;
      }
      if (d[i + 3]) P.px(x, y, [d[i], d[i + 1], d[i + 2], 255]);
    });
    if (op.sheen && !op.buzz) {
      // a curved highlight band across the upper left of the mass
      const cxN = (b.x0 + b.x1) / 2, w = b.x1 - b.x0;
      for (let x = b.x0; x <= b.x1; x++) {
        const u = (x - cxN) / (w / 2); if (u > 0.15 || u < -0.78) continue;
        let yt = -1; for (let y = b.y0; y <= b.y1; y++) if (m.get(x, y)) { yt = y; break; }
        if (yt < 0) continue;
        const off = Math.round(k * (1.5 + 2.4 * u * u));
        for (let q = 0; q < Math.max(1, GR.t); q++) if (m.get(x, yt + off + q)) P.px(x, yt + off + q, ((x + q) & 1) || Math.abs(u + 0.4) < 0.25 ? rp.hi : rp.light);
      }
    }
    if (op.lineUp && !op.buzz) {   // crisp light line along the front hairline
      const e = M(); m.each((x, y) => { if (!m.get(x, y + 1) && y > b.y0 + k * 3) e.set(x, y); });
      e.each((x, y) => { if (((x + y) & 1) === 0) P.px(x, y, rp.light); });
    }
    const D = new Painter(P).shift(dx, dy);
    if (op.part) { const [[x0, y0], [x1, y1]] = op.part; D.line(x0, y0, x1, y1, rp.hi); D.line(x0 + 0.9, y0, x1 + 0.9, y1, rp.deep); }
    const tieAt = (tx, ty) => { D.rect(tx - 1.2, ty - 0.6, 2.4, 1.5, TIE_COL); D.px(tx - 0.5, ty - 0.3, '#ffd0ea'); };
    if (op.tieAt) for (const [tx, ty] of op.tieAt) tieAt(tx, ty);
    if (op.tailTie) tieAt(op.tailTie[0], op.tailTie[1]);
    if (op.bunTie) { D.rect(CX - 4.2, op.bunTie[1] - 0.4, 8.4, 1.6, rp.deep); D.hl(CX - 3.6, CX + 3.6, op.bunTie[1] + 0.2, rp.light); }
  }

  function hairOps(X) {
    if (X._hair) return X._hair;
    const L = X.L, S = X.S, c = { hm: localHead(X), S, hatZone: X.hatInfo.zone, hatId: X.hatId };
    const res = (STY[L.hair.style] || STY.crop)(c);
    const zone = X.hatInfo.zone;
    if (zone != null) {
      const lim = R(zone);
      const cut = (op) => { const m = op.m.clone(); m.clipY(lim, 99); op.m = m; return op; };
      res.front = res.front.map(cut).filter((o) => o.m.bounds());
      if (X.hatInfo.hideBack) res.back = [];
    }
    X._hair = res;
    return res;
  }
  function back(X) {
    const res = hairOps(X), dx = Math.round(X.S.head.x - CX), dy = Math.round(X.S.head.y - HY);
    for (const op of res.back) paintOp(X, op, dx, dy);
    hatBack(X);
  }
  function front(X) {
    const res = hairOps(X), dx = Math.round(X.S.head.x - CX), dy = Math.round(X.S.head.y - HY), P = X.P;
    for (const op of res.front) paintOp(X, op, dx, dy);
    if (res.shine && X.hatInfo.zone == null) {
      const D = new Painter(P).shift(dx, dy), rp = X.K.r;
      D.hl(CX - 5.5, CX - 3.5, R(1.2), rp.hi); D.px(CX - 4.5, R(2.2), rp.hi); D.px(CX - 6.4, R(2.6), rp.light);
    }
  }
  // shadow cast on the forehead by the hair fringe and by the hat brim (before the face features are painted)
  function hatShadow(X) {
    const res = hairOps(X), dx = Math.round(X.S.head.x - CX), dy = Math.round(X.S.head.y - HY), P = X.P, K = X.K;
    const all = M(); for (const op of res.front) all.or(op.m);
    const hat = hatMaskOf(X); if (hat) all.or(hat);
    const sm = all.shift(dx, dy), sh = M(), depth = Math.max(1, GR.t);
    sm.each((x, y) => { for (let q = 1; q <= depth; q++) if (!sm.get(x, y + q)) { /* only the lowest edge */ } if (!sm.get(x, y + 1)) for (let q = 1; q <= depth; q++) sh.set(x, y + q); });
    const hm = headMask(X.S);
    sh.and(hm).sub(sm);
    const lim = ny(R(8) + dy);
    sh.each((x, y) => { if (y < lim) { const p = P.get(x, y); if (p[3] > 200) P.px(x, y, mix([p[0], p[1], p[2]], mix(K.r.shade, K.r.deep, 0.3), 0.7)); } });
  }

  /* -------------------------------------------------------------------- hats */
  const HAT_ZONE = { cap: 4, capback: 4, beanie: 5, bandana: 4, snapback: 4, bucket: 5, beret: 3, fedora: 4, cowboy: 4, tophat: 4, pirate: 3, chef: 4, wizard: 4, durag: 4, fitted: 4, trucker: 4, hood: 40, bucketfur: 5 };
  function hatInfo(X) { return { zone: X.hatId in HAT_ZONE ? HAT_ZONE[X.hatId] : null, hideBack: X.hatId === 'hood' }; }
  const HAT = {};
  const domeRows = (r0, hws) => rowsM(r0, hws);
  const R5 = (rp) => ({ hi: rp.hi, light: rp.light, base: rp.base, shade: rp.shade, deep: rp.deep });
  // draw helper wrappers: o = { rp, col, dx, dy, D (painter shifted to the head), sx, sy }
  const stitchRow = (o, r, hw, c, step) => { for (let x = CX - hw; x <= CX + hw; x += step || 1.6) o.D.px(x, R(r), c); };

  HAT.cap = () => {
    const dome = domeRows(-3, [4, 7, 9, 10, 11, 11, 11]), brim = M().rows(R(4), [11.5, 10.5, 8]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        // panel seams, button, eyelets, hat band
        for (let r = -2.5; r <= 2.6; r += 1) { D.px(CX - 3.6 + Math.abs(r) * 0.1, R(r), rp.shade); D.px(CX + 3.6 - Math.abs(r) * 0.1, R(r), rp.shade); }
        D.vl(CX - 0.5, R(-2.4), R(2.6), rp.shade); D.vl(CX + 0.5, R(-2.4), R(2.6), rp.shade, 1);
        D.rect(CX - 1, R(-3.8), 2, 1.2, rp.light); D.px(CX - 0.4, R(-3.7), rp.hi);
        D.px(CX - 2.2, R(-1.2), rp.deep); D.px(CX + 2.2, R(-1.2), rp.deep);
        D.hl(CX - 10.5, CX + 10.5, R(3.1), rp.deep);
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        D.hl(CX - 6.6, CX + 6.6, R(5.4), rp.deep); D.hl(CX - 9, CX + 9, R(4.1), rp.light);
        D.px(CX - 8, R(4.6), rp.hi); D.px(CX - 7, R(4.6), rp.hi);
      },
    };
  };

  HAT.capback = () => {
    const dome = domeRows(-3, [4, 7, 9, 10, 11, 11, 11, 11]);
    const peeks = M(); for (const s of [-1, 1]) peeks.or(M().rect(s < 0 ? CX - 13.2 : CX + 11, R(3), 2.2, 2.2));
    return {
      m: dome.clone().or(peeks),
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, peeks.shift(dx, dy), rp, { cap: 2 });
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        D.vl(CX - 0.5, R(-2.4), R(3.4), rp.shade); D.vl(CX + 0.5, R(-2.4), R(3.4), rp.shade);
        D.hl(CX - 10.5, CX + 10.5, R(4.1), rp.deep); D.hl(CX - 10.5, CX + 10.5, R(0.6), rp.shade, 1);
        D.rect(CX - 2.5, R(1.6), 5, 2.2, rp.deep); D.px(CX - 1.6, R(2.1), '#e8d28a'); D.px(CX - 0.6, R(2.1), '#fff0b8'); D.px(CX + 0.6, R(2.1), '#e8d28a'); D.px(CX + 1.6, R(2.1), '#e8d28a');
        D.px(CX - 1.6, R(3.0), '#b8984a'); D.px(CX + 1.6, R(3.0), '#b8984a');
      },
    };
  };

  HAT.snapback = () => {
    const dome = domeRows(-4, [5, 8, 10, 11, 11, 11, 11, 11]), brim = M().rows(R(4), [13, 12.4, 10]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy, col } = o, front = ramp(mix(col, '#ffffff', 0.28));
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        const panel = M().rows(R(-3), [5, 6, 6.5, 7, 7, 7, 7]).shift(dx, dy);
        shade(P, panel, front, { cap: 3, hi: true });
        const edgeP = M(); panel.each((x, y) => { if (!panel.get(x - 1, y) || !panel.get(x + 1, y)) edgeP.set(x, y); }); edgeP.each((x, y) => P.px(x, y, rp.shade));
        const st = '#ffe14d', sc = M().fn(CX - 2.4, R(-2.6), CX + 2.4, R(1.8), (x, y) => { const dxx = x - CX, dyy = y - R(-0.4), r = Math.hypot(dxx, dyy), a = Math.atan2(dyy, dxx) + Math.PI / 2, s = ((a % (2 * Math.PI / 5)) + 2 * Math.PI / 5) % (2 * Math.PI / 5) - Math.PI / 5; return r <= 0.6 + 1.5 * Math.max(0, 1 - Math.abs(s) / (Math.PI / 5)); }).shift(dx, dy);
        flat(P, sc, st); P.px(...[Math.round((sc.bounds().x0 + sc.bounds().x1) / 2), Math.round((sc.bounds().y0 + sc.bounds().y1) / 2)], '#fff7b0');
        D.hl(CX - 10.5, CX + 10.5, R(3.1), rp.deep);
        shade(P, brim.shift(dx, dy), R5(rp), { cap: 2 });
        D.hl(CX - 12, CX + 12, R(5.3), rp.deep); D.hl(CX - 9.6, CX + 9.6, R(4.15), rp.light); D.px(CX - 9.5, R(4.6), rp.hi); D.px(CX - 8.4, R(4.6), rp.hi);
        D.px(CX - 0.5, R(5.5), rp.shade); D.px(CX + 0.5, R(5.5), rp.shade);
      },
    };
  };

  HAT.fitted = () => {
    const dome = domeRows(-3.5, [4.5, 7.5, 9.5, 10.5, 11, 11, 11, 11]), brim = M().rows(R(4), [12.6, 12.2, 11.2, 8.4]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true });
        // six panels with tone-on-tone stitching and a flat, stiff brim with a foil sticker
        for (const u of [-6.2, -3.1, 0, 3.1, 6.2]) { for (let r = -3.2; r <= 3.2; r += 0.7) D.px(CX + u * (1 + Math.max(0, r - 1) * 0.04) * (1 - Math.max(0, -r - 1) * 0.12), R(r), rp.shade); }
        D.rect(CX - 1.2, R(-4.7), 2.4, 1.2, rp.light); D.px(CX - 0.5, R(-4.6), rp.hi);
        D.hl(CX - 11, CX + 11, R(3.4), rp.deep); D.hl(CX - 10.4, CX + 10.4, R(2.7), rp.light, 1);
        // embroidered emblem: a tiny crown-less diamond on the front panel
        const gem = '#ffe14d'; D.px(CX - 0.5, R(-0.4), gem); D.px(CX + 0.5, R(-0.4), '#fff7b0'); D.px(CX - 1.4, R(0.5), gem); D.px(CX + 1.4, R(0.5), gem); D.px(CX - 0.5, R(1.2), gem); D.px(CX + 0.5, R(1.2), '#b8984a');
        shade(P, brim.shift(dx, dy), R5(rp), { cap: 2 });
        D.hl(CX - 11.6, CX + 11.6, R(5.5), rp.deep); D.hl(CX - 10.6, CX + 10.6, R(4.2), rp.light);
        for (let q = 0; q < 3; q++) D.px(CX - 8 + q * 0.9, R(4.8), rp.hi);
        // foil sticker still on the brim
        const sticker = M().ellipse(CX + 6.4, R(4.9), 1.7, 0.9).shift(dx, dy); flat(P, sticker, '#c9f0ff'); P.px(Math.round(sticker.bounds().x0 + 1), Math.round(sticker.bounds().y0), '#ffffff'); D.px(CX + 7.2, R(4.9), '#ff9ad0');
      },
    };
  };

  HAT.trucker = () => {
    const dome = domeRows(-3, [4, 7, 9, 10, 11, 11, 11]), brim = M().rows(R(4), [11.5, 10.5, 8]);
    const panel = M().rows(R(-3), [3.5, 5.5, 6.2, 6.5, 6.5, 6.5, 6.5]);
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy, col } = o, mesh = ramp(mix(col, '#e8e0f0', 0.5));
        shade(P, dome.shift(dx, dy), mesh, { cap: 4, hi: true });
        dome.shift(dx, dy).each((x, y) => { if (((x + y) & 1) === 0) P.px(x, y, mesh.shade); });
        const pm = panel.shift(dx, dy);
        shade(P, pm, rp, { cap: 3, hi: true, dither: true });
        const e = M(); pm.each((x, y) => { if (!pm.get(x - 1, y) || !pm.get(x + 1, y)) e.set(x, y); }); e.each((x, y) => P.px(x, y, rp.deep));
        D.rect(CX - 1, R(-4.1), 2, 1.2, rp.light);
        const pat = '#ffe14d'; D.px(CX - 1.6, R(-0.4), pat); D.px(CX - 0.6, R(-1.2), pat); D.px(CX + 0.6, R(-0.4), pat); D.px(CX + 1.6, R(-1.2), pat); D.hl(CX - 1.6, CX + 1.6, R(0.8), '#fff7b0');
        D.hl(CX - 10.5, CX + 10.5, R(3.1), rp.deep);
        shade(P, brim.shift(dx, dy), R5(rp), { cap: 2, hi: true });
        D.hl(CX - 6.6, CX + 6.6, R(5.4), rp.deep); D.hl(CX - 9.6, CX + 9.6, R(4.1), rp.light);
      },
    };
  };

  HAT.beanie = () => {
    const dome = domeRows(-3, [5, 8, 10, 11, 11, 11, 11, 11]), cuff = domeRows(2, [11, 11, 11]);
    return {
      m: dome.clone().or(cuff).or(bump(CX, R(-4.6), 2.4)),
      draw(P, o) {
        const { rp, D, dx, dy, col, sx, sy } = o, pp = ramp(mix(col, '#ffffff', 0.3));
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        dome.each((x, y) => { const v = iY(y), u = iX(x) - CX; if (v < 2 && v > -2.2 && (Math.floor((u + 40) * 1.15) % 3 === 0)) P.px(x + sx, y + sy, rp.shade); });
        const cf = cuff.shift(dx, dy);
        shade(P, cf, ramp(mix(col, '#ffffff', 0.12)), { cap: 3, hi: true });
        cuff.each((x, y) => { const u = iX(x) - CX; if (Math.floor((u + 40) * 1.5) % 2 === 0) P.px(x + sx, y + sy, rp.shade); });
        D.hl(CX - 10.5, CX + 10.5, R(1.1), rp.deep); D.hl(CX - 10.5, CX + 10.5, R(4.3), rp.shade);
        const pom = bump(CX, R(-4.6), 2.4).shift(dx, dy); shade(P, pom, pp, { cap: 3, hi: true });
        pom.each((x, y) => { if (((x * 5 + y * 7) % 6) === 0) P.px(x, y, pp.hi); else if (((x * 3 + y * 5) % 7) === 0) P.px(x, y, pp.shade); });
      },
    };
  };

  HAT.bandana = () => {
    const cloth = domeRows(-1, [5, 8, 10, 10.5, 10.5, 10.5]);
    const knot = M().ellipse(CX + 11.4, R(3.6), 1.7, 1.7).or(M().poly([[CX + 10.6, R(4)], [CX + 14, R(9)], [CX + 11, R(8.4)]])).or(M().poly([[CX + 11, R(4.4)], [CX + 13.6, R(6)], [CX + 14.8, R(11)], [CX + 12.2, R(9)]]));
    return {
      m: cloth.clone().or(knot),
      draw(P, o) {
        const { rp, D, dx, dy, sx, sy } = o;
        shade(P, cloth.shift(dx, dy), rp, { cap: 4, hi: true });
        shade(P, knot.shift(dx, dy), rp, { cap: 2 });
        cloth.each((x, y) => { const v = iY(y); if (v < 3.2) { const q = (x * 5 + y * 7) % 11; if (q === 0) P.px(x + sx, y + sy, rp.hi); if (q === 5) P.px(x + sx, y + sy, rp.shade); } });
        for (let i = 0; i < 6; i++) { const u = -8 + i * 3.2, v = 0.2 + (i % 2) * 1.4; D.px(CX + u, R(v), rp.hi); D.px(CX + u + 0.7, R(v + 0.6), rp.light); D.px(CX + u + 0.7, R(v - 0.6), rp.light); }
        D.hl(CX - 10.5, CX + 10.5, R(4.3), rp.deep); D.hl(CX - 10.2, CX + 10.2, R(3.3), rp.light, 1);
        D.px(CX + 11.4, R(3.4), rp.deep); D.px(CX + 12.6, R(6.4), rp.shade); D.px(CX + 13.4, R(9.2), rp.shade);
      },
    };
  };

  HAT.headband = () => {
    const band = domeRows(3, [10.6, 10.6]);
    return {
      m: band,
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, band.shift(dx, dy), rp, { cap: 2, hi: true });
        D.hl(CX - 10.5, CX + 10.5, R(4.4), rp.shade);
        for (let x = CX - 8.5; x <= CX + 8.5; x += 2.2) D.px(x, R(3.2), rp.light);
        D.px(CX - 9.5, R(3.2), rp.hi); D.px(CX + 6.2, R(3.7), rp.deep);
      },
    };
  };

  HAT.bucket = () => {
    const dome = domeRows(-2, [5, 8, 10, 11, 11]);
    const brim = M().rows(R(3), [11.5, 13, 13.5, 12.5]).or(M().rows(R(5), [13.5, 13.5])).or(M().rows(R(6), [13, 12]).sub(M().rows(R(6), [9, 9])));
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy, sx, sy } = o;
        shade(P, dome.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        shade(P, brim.shift(dx, dy), rp, { cap: 3 });
        D.hl(CX - 12.5, CX + 12.5, R(3.2), rp.deep);
        for (let x = CX - 12.5; x <= CX + 12.5; x += 1.4) D.px(x, R(5.2), rp.shade);
        for (let x = CX - 10; x <= CX + 10; x += 1.5) D.px(x, R(1.2), rp.shade);
        D.rect(CX - 1, R(-3.2), 2, 1.1, rp.light); D.px(CX - 9.5, R(4.2), rp.hi); D.px(CX - 8.5, R(4.2), rp.hi);
        D.px(CX - 10.2, R(0.2), '#cfd3e6'); D.px(CX + 10.2, R(0.2), '#cfd3e6'); D.px(CX - 10.2, R(0.9), '#8a8aa8'); D.px(CX + 10.2, R(0.9), '#8a8aa8');
      },
    };
  };

  HAT.bucketfur = () => {
    const dome = domeRows(-3, [5, 8, 10, 11.5, 11.5, 11.5]);
    const brim = M().rows(R(3), [12, 13.5, 14, 13.2]).or(M().rows(R(5), [14, 14])).or(M().rows(R(6), [13, 12]).sub(M().rows(R(6), [9, 9])));
    return {
      m: dome.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy, sx, sy } = o, fur = ramp(mix(o.col, '#fff6ea', 0.28));
        const all = dome.clone().or(brim).shift(dx, dy);
        shade(P, all, fur, { cap: 4, hi: true });
        // fur: short vertical streaks, light and dark tufts, and a ragged silhouette
        all.each((x, y) => {
          const h = hash(x * 3 + 7, (y >> 1) * 5 + 3), h2 = hash(x, y);
          if (h < 0.16) P.px(x, y, fur.hi); else if (h < 0.27) P.px(x, y, fur.shade); else if (h2 > 0.93) P.px(x, y, fur.light);
        });
        const rag = M(); all.each((x, y) => { for (const [ox, oy] of [[0, 1], [1, 0], [-1, 0], [0, -1]]) if (!all.get(x + ox, y + oy) && hash(x + ox * 7, y + oy * 5) < 0.55) rag.set(x + ox, y + oy); });
        rag.each((x, y) => P.px(x, y, hash(x + 2, y) < 0.5 ? fur.base : fur.light));
        const nick = M(); all.each((x, y) => { if (!all.get(x, y - 1) && hash(x * 5, y) < 0.3) nick.set(x, y); }); nick.each((x, y) => P.px(x, y, fur.shade));
        D.hl(CX - 11, CX + 11, R(3.4), fur.deep, 1);
      },
    };
  };

  HAT.beret = () => {
    const body = ell(CX - 1, R(-0.5), 11, 4.2).or(rowsM(2, [10, 10, 9], CX - 1)), stem = M().rect(CX - 1.5, R(-5), 2, 2);
    return {
      m: body.clone().or(stem),
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, body.shift(dx, dy), rp, { cap: 5, hi: true, dither: true });
        shade(P, stem.shift(dx, dy), rp, { cap: 2 });
        for (let i = 0; i < 5; i++) { D.line(CX - 8 + i * 2.7, R(-1.8 + (i % 2)), CX - 6.5 + i * 2.7, R(1 + (i % 2) * 0.5), rp.shade); }
        D.hl(CX - 10.5, CX + 8.5, R(3.1), rp.deep); D.hl(CX - 9.5, CX + 7.5, R(2.2), rp.light, 1);
        D.px(CX - 7.5, R(-2), rp.hi); D.px(CX - 6.5, R(-2), rp.hi); D.px(CX - 5.5, R(-2.4), rp.hi);
      },
    };
  };

  HAT.fedora = () => {
    const crown = domeRows(-5, [4.5, 6.5, 8, 8.5, 9, 9, 9, 9]), brim = M().rows(R(3), [13.8, 13.8, 12.6]).or(M().rows(R(5), [11.5])), bandM = domeRows(1, [9.2, 9.2, 9.2]);
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy, col } = o, bc = ramp(mix(col, PAL.ink, 0.45));
        shade(P, crown.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        D.vl(CX - 0.5, R(-4.8), R(-1.8), rp.deep); D.vl(CX + 0.5, R(-4.8), R(-1.8), rp.deep);
        D.px(CX - 2.8, R(-4), rp.shade); D.px(CX + 2.8, R(-4), rp.shade); D.px(CX - 2.4, R(-3), rp.shade); D.px(CX + 2.4, R(-3), rp.shade);
        shade(P, bandM.shift(dx, dy), bc, { cap: 2, hi: true });
        D.rect(CX + 5.6, R(0.9), 2.2, 2.4, '#e8c050'); D.px(CX + 6.2, R(1.2), '#fff0a0');
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        D.hl(CX - 13, CX + 13, R(4.3), rp.shade); D.hl(CX - 11, CX + 11, R(5.4), rp.deep);
        for (let x = CX - 12; x <= CX + 12; x += 6) D.px(x, R(3.2), rp.hi);
      },
    };
  };

  HAT.cowboy = () => {
    const crown = domeRows(-4, [5, 7.5, 8, 8.5, 9, 9, 9, 9]);
    const brim = M().rows(R(2), [14.8]).or(M().rows(R(3), [14.3, 14.3])).or(M().rows(R(5), [10.8])).or(M().rows(R(4), [12.8])).sub(M().rect(CX - 9, R(2), 18, 1));
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy, col } = o, bc = ramp(mix(col, PAL.ink, 0.5));
        shade(P, crown.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        D.vl(CX - 0.5, R(-4.2), R(-2.4), rp.deep); D.vl(CX + 0.5, R(-4.2), R(-2.4), rp.deep); D.px(CX - 2.8, R(-3.2), rp.shade); D.px(CX + 2.8, R(-3.2), rp.shade);
        shade(P, domeRows(1, [9, 9, 9]).shift(dx, dy), bc, { cap: 2, hi: true });
        for (let x = CX - 8.5; x <= CX + 8.5; x += 2) D.px(x, R(1.9), '#e8c050', 130);
        D.rect(CX - 1.2, R(1), 2.4, 2.4, '#e8c050'); D.px(CX - 0.5, R(1.3), '#fff0a0');
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        D.hl(CX - 12.6, CX + 12.6, R(5.4), rp.deep);
        for (const s of [-1, 1]) { D.px(CX + s * 14.2, R(2.2), rp.hi); D.px(CX + s * 11.5, R(3.4), rp.shade); }
      },
    };
  };

  HAT.tophat = () => {
    const crown = domeRows(-9, [7.5, 8, 8, 8, 8, 8, 8, 8, 8, 8]), brim = rowsM(2, [12.8, 12.2]);
    return {
      m: crown.clone().or(brim),
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, crown.shift(dx, dy), rp, { cap: 4, hi: true, dither: true });
        D.vl(CX - 4.5, R(-8), R(-2), rp.light); D.px(CX - 4.5, R(-8.6), rp.hi); D.px(CX - 5.4, R(-8), rp.hi); D.vl(CX - 3.6, R(-7), R(-3.5), rp.hi, 1);
        const bc = ramp('#c42a45'); shade(P, domeRows(-1, [8, 8, 8]).shift(dx, dy), bc, { cap: 2, hi: true });
        D.rect(CX - 1.2, R(-1), 2.4, 2.4, '#ffe14d'); D.px(CX - 0.6, R(-0.7), '#fff7b0');
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        D.hl(CX - 12, CX + 12, R(3.4), rp.deep); D.px(CX - 9.5, R(2.2), rp.hi); D.px(CX - 8.4, R(2.2), rp.hi);
      },
    };
  };

  HAT.catears = (c) => {
    const hm = c.hm, ringM = hm.clone().clipY(0, R(6)).growD(1).sub(hm.clone().clipY(0, R(6))).clipY(0, R(6));
    const ears = [-1, 1].map((s) => M().poly([[CX + s * 10, R(0)], [CX + s * 8.8, R(-6)], [CX + s * 3.2, R(-2.4)]]));
    const em = M(); ears.forEach((e) => em.or(e));
    return {
      m: ringM.clone().or(em),
      draw(P, o) {
        const { rp, dx, dy } = o, pk = ramp('#ff7ab6');
        shade(P, ringM.shift(dx, dy), rp, { cap: 2, hi: true });
        ears.forEach((e) => shade(P, e.shift(dx, dy), rp, { cap: 3, hi: true }));
        for (const s of [-1, 1]) {
          const inner = M().poly([[CX + s * 8.6, R(-0.4)], [CX + s * 8.0, R(-3.8)], [CX + s * 4.8, R(-1.6)]]).shift(dx, dy);
          shade(P, inner, pk, { cap: 3, hi: true });
        }
      },
    };
  };

  HAT.crown = () => {
    const base = domeRows(-1, [8.5, 9, 9]), pts = M();
    [[-8, 4], [-4, 6], [0, 7.5], [4, 6], [8, 4]].forEach(([dx, h]) => pts.or(M().poly([[CX + dx - 2, R(-1)], [CX + dx + 2, R(-1)], [CX + dx, R(-1 - h)]])));
    pts.or(rowsM(-3, [8.5, 8.5]));
    return {
      m: base.clone().or(pts),
      draw(P, o) {
        const { D, dx, dy, col } = o, rp = ramp('#e8b923');
        shade(P, pts.clone().sub(base).shift(dx, dy), rp, { cap: 3, hi: true });
        shade(P, base.shift(dx, dy), rp, { cap: 2, hi: true });
        for (const [x, y] of [[-8, -4.6], [-4, -6.4], [0, -8.5], [4, -6.4], [8, -4.6]]) { D.px(CX + x, R(y), '#fff3b0'); D.px(CX + x - 0.6, R(y + 0.7), '#fff3b0'); }
        for (const gx of [-5.5, -0.5, 4.5]) { D.rect(CX + gx - 0.4, R(-0.2), 1.8, 1.6, col); D.px(CX + gx, R(0), mix(col, '#ffffff', 0.6)); }
        D.hl(CX - 8.5, CX + 8.5, R(1.4), rp.deep);
      },
    };
  };

  HAT.halo = () => {
    const ring = M().ellipse(CX, R(-5), 8, 2.3).sub(M().ellipse(CX, R(-5), 5.8, 1.1));
    return {
      m: M(), noClip: true,
      draw(P, o) {
        const { dx, dy, sx, sy } = o, g = '#ffe56a', g2 = '#fff9c0', d = '#c98f1a', rg = ring.shift(dx, dy);
        const glow = M().ellipse(CX, R(-5), 10.5, 4.6).shift(dx, dy);
        glow.each((x, y) => { if (!rg.get(x, y) && ((x + y) & 1) && P.alphaAt(x, y) < 10) P.px(x, y, g, 70); });
        const b = rg.bounds(), mid = (b.y0 + b.y1) / 2;
        rg.each((x, y) => P.px(x, y, y > mid + 0.5 ? d : x < (b.x0 + b.x1) / 2 - 3 ? g2 : g));
        o.D.px(CX - 4.5, R(-7), '#ffffff');
      },
    };
  };

  HAT.visor = () => {
    const band = domeRows(1, [10.6, 10.6, 10.6]), bill = M().rows(R(3), [12.8, 12.2, 11.2]);
    return {
      m: band.clone().or(bill),
      draw(P, o) {
        const { rp, D, dx, dy, col } = o, nc = '#2ee6ff', tint = ramp(mix(col, nc, 0.45));
        shade(P, band.shift(dx, dy), rp, { cap: 2, hi: true });
        const bm = bill.shift(dx, dy), bb = bm.bounds();
        bm.each((x, y) => { const q = (y - bb.y0) / Math.max(1, bb.y1 - bb.y0); P.px(x, y, q < 0.3 ? tint.hi : ((x + y) & 1) ? tint.base : tint.light); });
        D.hl(CX - 12.5, CX + 12.5, R(5.2), nc); D.hl(CX - 11, CX + 11, R(6.1), nc, 1);
        for (let x = CX - 11; x <= CX + 11; x += 2) D.add(x, R(6.3), nc, 70);
        for (let x = CX - 8; x <= CX + 8; x += 3) D.px(x, R(2.2), nc);
      },
    };
  };

  HAT.chef = () => {
    const puff = ell(CX - 5.5, R(-2.5), 5.4, 4.6).or(ell(CX + 5.5, R(-2.5), 5.4, 4.6)).or(ell(CX, R(-5), 6.2, 4.4)).or(rowsM(-1, [8.5, 9, 9.5, 9.5, 9.5])), band = domeRows(2, [9.8, 9.8]);
    return {
      m: puff.clone().or(band),
      draw(P, o) {
        const { rp, D, dx, dy } = o;
        shade(P, puff.shift(dx, dy), rp, { cap: 5, hi: true, dither: true });
        for (const [x, y] of [[-6, -1], [6, -1], [-2, -5], [3, -4], [0, 0]]) { D.vl(CX + x, R(y), R(y + 1.6), rp.shade); }
        shade(P, band.shift(dx, dy), rp, { cap: 2, hi: true });
        D.hl(CX - 9.5, CX + 9.5, R(3.4), rp.deep);
      },
    };
  };

  HAT.wizard = () => {
    const brim = ell(CX, R(3), 13, 2.2);
    const cone = M().poly([[CX - 8.5, R(3)], [CX - 6, R(-2)], [CX - 2.5, R(-6)], [CX + 2, R(-9)], [CX + 5.5, R(-9.4)], [CX + 4.2, R(-6)], [CX + 5.5, R(-1)], [CX + 8.5, R(3)]]);
    return {
      m: brim.clone().or(cone),
      draw(P, o) {
        const { rp, D, dx, dy, col } = o;
        shade(P, cone.shift(dx, dy), rp, { cap: 5, hi: true, dither: true });
        shade(P, brim.shift(dx, dy), rp, { cap: 2, hi: true });
        const bc = ramp(mix(col, '#ffe14d', 0.7));
        D.hl(CX - 8.5, CX + 8.5, R(2.2), bc.base, 2); D.px(CX - 6.5, R(2.2), bc.light);
        const st = '#ffe14d', star = (cx, cy, r) => { D.px(cx, cy, '#fff7b0'); D.px(cx - r, cy, st); D.px(cx + r, cy, st); D.px(cx, cy - r, st); D.px(cx, cy + r, st); };
        star(CX - 2.5, R(-0.8), 1); star(CX + 3, R(-4.4), 1); D.px(CX - 0.6, R(-5), st);
        D.hl(CX - 12, CX + 12, R(5.3), rp.deep, 1);
      },
    };
  };

  HAT.pirate = () => {
    const body = M().rows(R(-5), [4.5, 8, 10.5, 12, 13.5, 13.5, 12.5]).or(M().poly([[CX - 14, R(1)], [CX - 12, R(-2)], [CX - 11, R(2.5)]])).or(M().poly([[CX + 14, R(1)], [CX + 12, R(-2)], [CX + 11, R(2.5)]]));
    return {
      m: body,
      draw(P, o) {
        const { rp, D, dx, dy } = o, gd = '#e8b923', bm = body.shift(dx, dy);
        shade(P, bm, rp, { cap: 4, hi: true, dither: true });
        bm.each((x, y) => { if (!bm.get(x, y + 1) && iY(y - o.sy) > R(-1)) P.px(x, y, gd); if (!bm.get(x, y - 1)) P.px(x, y, gd); });
        const sk = '#fffaf0', dk = '#120d1f';
        D.rect(CX - 2, R(-3.6), 4, 2.2, sk); D.rect(CX - 1, R(-1.4), 2, 1.2, sk); D.px(CX - 1, R(-2.8), dk); D.px(CX + 1, R(-2.8), dk); D.px(CX, R(-1.8), dk);
        D.line(CX - 4, R(-1.4), CX + 4, R(0.6), sk); D.line(CX + 4, R(-1.4), CX - 4, R(0.6), sk);
      },
    };
  };

  HAT.headphonehat = (c) => {
    const hm = c.hm, ringM = hm.clone().clipY(0, R(9)).growD(1).sub(hm.clone().clipY(0, R(9))).clipY(0, R(9)).sub(M().rect(0, R(0), 4, 20).clipY(R(0), R(20)));
    const bandM = hm.clone().clipY(0, R(8)).growD(2).sub(hm.clone().clipY(0, R(8)).growD(0.4)).clipY(0, R(7));
    const puffs = [-1, 1].map((s) => M().ellipse(CX + s * 11.2, R(9.5), 3.3, 4.2)), pm = M(); puffs.forEach((p) => pm.or(p));
    return {
      m: pm.clone().or(bandM),
      draw(P, o) {
        const { rp, dx, dy } = o;
        shade(P, bandM.shift(dx, dy), rp, { cap: 2, hi: true });
        puffs.forEach((p) => {
          const ps = p.shift(dx, dy); shade(P, ps, rp, { cap: 4, hi: true });
          ps.each((x, y) => { if (((x * 3 + y * 5) % 4) === 0) P.px(x, y, rp.hi); else if (((x * 5 + y * 3) % 7) === 0) P.px(x, y, rp.shade); });
        });
        puffs.forEach((p, i) => { const s = i ? 1 : -1; o.D.px(CX + s * 14.4, R(8), rp.light); o.D.px(CX + s * 14.4, R(11), rp.light); });
      },
    };
  };

  // durag: silky tight skullcap with a wide band, seam and long tails behind the neck
  HAT.durag = () => {
    const dome = domeRows(-2, [4.5, 7.5, 9.5, 10.5, 10.8, 10.8, 10.8]);
    const tails = M(); for (const s of [-1, 1]) tails.or(M().poly([[CX + s * 6, R(6)], [CX + s * 10, R(6)], [CX + s * 13.2, R(22)], [CX + s * 10.6, R(24.4)], [CX + s * 8.2, R(21)]]));
    return {
      m: dome, back: tails,
      drawBack(P, o) {
        const { rp, dx, dy, D } = o, tm = tails.shift(dx, dy);
        shade(P, tm, rp, { cap: 3, hi: true });
        tm.each((x, y) => { const u = iX(x - o.sx) - CX, v = iY(y - o.sy); if ((Math.abs(u) * 1.1 + v * 0.6) % 3 < 0.5) P.px(x, y, rp.light); });
        for (const s of [-1, 1]) { D.px(CX + s * 11.6, R(23.2), rp.deep); }
      },
      draw(P, o) {
        const { rp, D, dx, dy } = o, dm = dome.shift(dx, dy);
        shade(P, dm, rp, { cap: 4, hi: true, dither: true });
        // silky sheen streaks following the head curve
        for (let i = 0; i < 3; i++) { const u = -6.2 + i * 1.6; D.line(CX + u, R(-1.4 + i * 0.6), CX + u - 1.0, R(2.6), rp.hi); }
        D.vl(CX - 0.5, R(-2.2), R(2.6), rp.deep); D.vl(CX + 0.5, R(-2.2), R(2.6), rp.shade);
        // wide band across the forehead with a knot hint at the side
        const band = M().rows(R(2.6), [10.8, 10.8, 10.8]).shift(dx, dy);
        shade(P, band, ramp(mix(o.col, '#000000', 0.2)), { cap: 2, hi: true });
        D.hl(CX - 10.5, CX + 10.5, R(2.1), rp.light, 1); D.hl(CX - 10.5, CX + 10.5, R(4.6), rp.deep);
        D.px(CX - 8, R(3.4), rp.hi); D.px(CX - 6.8, R(3.4), rp.hi);
      },
    };
  };

  // hood up: big rounded hood over the hair with a face opening, drawstrings and a drape on the shoulders
  HAT.hood = () => {
    const hood = ell(CX, R(2), 13.3, 12.4).or(rowsM(5, [13.2, 13.2, 13, 12.6, 12, 11.6, 11])).sub(ell(CX, R(11.8), 8.2, 8.8)).clipY(0, R(15.5));
    const drape = M().rows(R(14), [11.5, 12.5, 12.8, 12.8, 12.4, 11.6]).sub(ell(CX, R(11.8), 7, 8.8)).sub(M().rect(CX - 3, R(16), 6, 8));
    const inner = ell(CX, R(11.8), 8.2, 8.8).sub(ell(CX, R(12.6), 7.1, 8.1));
    return {
      m: hood.clone().or(drape),
      draw(P, o) {
        const { rp, D, dx, dy, sx, sy } = o, hm = hood.shift(dx, dy);
        shade(P, drape.shift(dx, dy), rp, { cap: 4, hi: false });
        shade(P, hm, rp, { cap: 5, hi: true, dither: true });
        flat(P, inner.shift(dx, dy).and(hm.clone().or(M())), rp.deep);
        const ring = inner.shift(dx, dy); ring.each((x, y) => P.px(x, y, rp.deep));
        // face opening lit rim
        const rim = M(); ring.each((x, y) => { if (!ring.get(x, y - 1) && iY(y - sy) < HY + 8) rim.set(x, y - 1); }); rim.each((x, y) => P.px(x, y, rp.light));
        // folds
        for (const s of [-1, 1]) { D.line(CX + s * 11, R(4), CX + s * 12.2, R(12), rp.shade); D.line(CX + s * 9.4, R(-1), CX + s * 10.6, R(5), rp.shade); }
        D.line(CX - 4, R(-8), CX - 3, R(-4), rp.light); D.px(CX - 6.4, R(-6.2), rp.hi);
        // drawstrings with metal tips
        for (const s of [-1, 1]) { D.vl(CX + s * 3.2, R(17), R(23), '#f7f2e8'); D.vl(CX + s * 3.8 - s * 0.2, R(17), R(22), '#cfc6e4'); D.px(CX + s * 3.4, R(23.6), '#e8c050'); D.px(CX + s * 3.4, R(24.4), '#b8984a'); }
        D.px(CX - 3.2, R(16.4), '#cfd3e6'); D.px(CX + 3.2, R(16.4), '#cfd3e6');
      },
    };
  };

  /* ------------------------------------------------------------------ hat api */
  function hatMaskOf(X) {
    if (X.hatId === 'none') return null;
    if (!X._hat) X._hat = buildHat(X);
    const h = X._hat; if (!h || h.noClip) return null;
    return h.m;
  }
  function buildHat(X) { const fn = HAT[X.hatId]; return fn ? fn({ hm: localHead(X), S: X.S, X }) : null; }
  function hatCtx(X) {
    const dx = Math.round(X.S.head.x - CX), dy = Math.round(X.S.head.y - HY), col = X.L.hat.color;
    return { rp: ramp(col), col, dx, dy, sx: nx(dx), sy: ny(dy), D: new Painter(X.P).shift(dx, dy) };
  }
  function hat(X) {
    if (X.hatId === 'none') return;
    if (!X._hat) X._hat = buildHat(X);
    if (X._hat) X._hat.draw(X.P, hatCtx(X));
  }
  function hatBack(X) {
    if (X.hatId === 'none') return;
    if (!X._hat) X._hat = buildHat(X);
    if (X._hat && X._hat.drawBack) X._hat.drawBack(X.P, hatCtx(X));
  }

  Object.assign(BBH, { CharsHair: { hatInfo, back, front, hatShadow, hat, STY, HAT, R, paintOp, hash, TIE_COL } });
  if (typeof module !== 'undefined' && module.exports) module.exports = BBH.CharsHair;
})(typeof globalThis !== 'undefined' ? globalThis : this);
