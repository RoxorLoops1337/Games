// Clawspire -- PHYS: the claw and item physics, ported from Claw Crawl.
//
// Bodies are compounds of circles (a ball, a capsule chain or a rounded blob)
// that collide with each other, with static capsule walls and with the
// kinematic claw (a hub circle plus two prongs of three capsule segments).
// Sequential impulses with Coulomb friction, restitution only on hard hits,
// bias-limited penetration recovery (with a lower cap against the claw so it
// can never fling anything), sleeping bodies that wake on hits, and hard
// floor / wall / lid clamps so nothing ever leaves the cabinet.  Fixed 1/240 s
// substeps.  Units: pixels and seconds, y grows downward.  Headless: no DOM,
// no Math.random (the rig takes a cfg.rand stream for loosen and jolt).
const PHYS = (() => {
  'use strict';

  // ---- constants ---------------------------------------------------------
  const H = 1 / 240;             // fixed substep, seconds
  const MAX_SUB = 12;            // max substeps per W.step call
  const TAU = Math.PI * 2;
  // Claw Crawl's solver dials.
  const PH = {
    it: 10,            // solver iterations per substep
    slop: 0.5,         // allowed penetration (px)
    beta: 0.24,        // fraction of the penetration removed per second-ish (bias = beta/h * pen)
    maxBias: 200,      // px/s cap on penetration recovery
    clawBias: 110,     // ...and a lower cap against the claw, so it never flings
    e: 0.12,           // default restitution
    bounceV: 90,       // restitution only above this approach speed (px/s)
    maxV: 1600,        // linear speed cap (px/s)
    linDamp: 0.15, angDamp: 1.6,
    sleepV: 14, sleepW: 0.35, sleepT: 0.45,   // rest this long below these speeds and sleep
    wakePen: 2.5, wakeV: 70,                   // a sleeper pushed this deep, or hit this fast, wakes
    wallMu: 0.4,
    heldDecay: 8,      // b.held counts down this fast per second (2 -> 0 in a quarter second)
  };
  // Item part shapes derived from Clawspire's shape descriptors.
  const SHAPE = {
    capRMax: 18,       // fat boxes stay pills no wider than this radius
    capThin: 12,       // long polygons (axe, shard, bottle) become thin pills
    capAspect: 1.8,    // polygons at least this elongated become capsules, rounder ones blobs
    blobK: 0.92,       // blob radius = half the long axis times this
  };
  // The claw (Claw Crawl's numbers; the base scale is tuned for Clawspire's
  // bigger prizes, see DESIGN.md).
  const PRONG = [[0, 0], [14, 28], [9, 48], [1, 57]];   // one prong, local (x out, y down), times size
  const PHI_OPEN = 0.62, PHI_CLOSED = -0.1;               // prong angles (rad)
  const RIG = {
    base: 0.74,            // claw size = base * cfg.width (* prong3Size with a third prong)
    prong3Size: 1.08,
    gripBase: 0.35, gripSlope: 0.3, gripMin: 0.15,   // grip_cc = clamp(gripBase + gripSlope * (grip - 0.75), gripMin, 1)
    rubberGrip: 0.15, prong3Grip: 0.1, greaseGrip: 0.3,
    hubR: 13, segR: 4.5, hingeX: 7, hingeY: 7,      // times size
    hubDrop: 14,           // hub centre below the rail when parked
    dropSpeed: 250, liftSpeed: 175, carSpeed: 330,
    closeRate: 2.6, openRate: 3.2, openT: 0.35, openHold: 1.2,
    closeMin: 0.18, closeMax: 0.8, blockT: 0.08,    // closing ends when both prongs have been blocked blockT (after closeMin), or at closeMax
    haltBase: 1.5, haltGrip: 3,                     // a prong stalls past halt = haltBase + haltGrip * grip px of penetration
    haltOpen: 7,                                    // ...plus haltOpen * open^2 while still wide open
    loosen: 0.12, loosenT: 0.4,                     // the lift loosens (1 - grip) * loosen rad over loosenT s
    joltP: 0.25, jolt: 0.05, joltT: 0.1,            // a twitch open at the top with probability (1 - grip) * joltP
    swayKick: 2.2,
    floorClear: 60,        // hub stops floorClear * size + 2 above the floor
    cargoY: 70,            // held items above hub y + cargoY * size are the cargo at the lift
    slipY: 95,             // cargo below hub y + slipY * size, falling, has slipped
    slipV: 60,
    carryWait: 0.2,        // s over the chute before opening
    magnetR: 110, magnetF: 420,
    tray: 44,              // the chute has no floor: a hidden tray this far below the cabinet floor catches prizes
    lid: -64,              // the lid segment's y (items may fly a little above the glass)
    clampTop: -50,
    floorSink: 3,          // an item's centre may sink to this far above the floor surface (the thinnest items, r 4, still touch it)
    touchHub: 1.2, touchProng: 3,   // penetration that counts as landing on something
  };
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  let nextId = 1;

  // ---- shapes ------------------------------------------------------------
  /* Box shape descriptor (maps to a capsule). */
  function box(w, h) { return { kind: 'box', w, h }; }

  /* Reduce any shape descriptor to ball / cap / blob with its dimensions.
     Capsules run along local x (ax 0) or y (ax pi/2) to match the art. */
  function partSpec(shape) {
    let sh = shape || { kind: 'circle', r: 16 };
    if (sh.kind === 'poly' && sh.verts && sh.verts.kind === 'box') sh = sh.verts;
    switch (sh.kind) {
      case 'ball': case 'circle': return { kind: 'ball', r: sh.r || 16, len: (sh.r || 16) * 2 };
      case 'cap': return { kind: 'cap', len: sh.len, r: sh.r, ax: sh.ax || 0 };
      case 'blob': return { kind: 'blob', r: sh.r, len: sh.r * 2 };
      case 'box': {
        const L = Math.max(sh.w, sh.h), S = Math.min(sh.w, sh.h);
        return { kind: 'cap', len: L, r: Math.min(S / 2, SHAPE.capRMax), ax: sh.w >= sh.h ? 0 : Math.PI / 2 };
      }
      default: {
        const v = sh.verts || [];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const p of v) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
        if (!v.length || !isFinite(x0)) return { kind: 'ball', r: 16, len: 32 };
        const w = x1 - x0, h = y1 - y0, L = Math.max(w, h), S = Math.min(w, h);
        if (S > 0 && L / S >= SHAPE.capAspect) return { kind: 'cap', len: L, r: Math.min(S / 2, SHAPE.capThin), ax: w >= h ? 0 : Math.PI / 2 };
        return { kind: 'blob', r: 0.5 * L * SHAPE.blobK, len: L };
      }
    }
  }

  /* Circle parts (local coordinates, not yet centred on the mass centre). */
  function mkParts(spec) {
    const out = [];
    if (spec.kind === 'cap') {
      const len = spec.len, r = spec.r, ax = spec.ax || 0, cx = Math.cos(ax), sy = Math.sin(ax);
      if (len - 2 * r < 1) { out.push({ x: 0, y: 0, r }); return out; }
      const n = Math.max(2, Math.round((len - 2 * r) / (r * 0.9)) + 1);
      for (let i = 0; i < n; i++) { const t = -len / 2 + r + (len - 2 * r) * i / (n - 1); out.push({ x: t * cx, y: t * sy, r }); }
    } else if (spec.kind === 'blob') {
      const r = spec.r;
      out.push({ x: 0, y: 0, r: r * 0.62 });
      for (let i = 0; i < 3; i++) { const a = -Math.PI / 2 + i * TAU / 3; out.push({ x: Math.cos(a) * r * 0.42, y: Math.sin(a) * r * 0.42, r: r * 0.58 }); }
    } else out.push({ x: 0, y: 0, r: spec.r });
    return out;
  }

  // ---- bodies ------------------------------------------------------------
  /* body({type, shape, x, y, angle, density, friction, restitution, group, data}).
     Mass and inertia come from the parts (pi r^2 * density * 0.01 each). */
  function body(o) {
    o = o || {};
    const spec = partSpec(o.shape);
    const dens = o.density == null ? 1 : o.density;
    const parts = mkParts(spec);
    let m = 0, cx = 0, cy = 0;
    for (const p of parts) { const pm = Math.PI * p.r * p.r * dens * 0.01; m += pm; cx += p.x * pm; cy += p.y * pm; }
    cx /= m; cy /= m;
    let I = 0, br = 0;
    for (const p of parts) { p.x -= cx; p.y -= cy; const pm = Math.PI * p.r * p.r * dens * 0.01; I += pm * (0.5 * p.r * p.r + p.x * p.x + p.y * p.y); br = Math.max(br, Math.hypot(p.x, p.y) + p.r); }
    const type = o.type || 'dynamic', dyn = type === 'dynamic';
    const b = {
      id: nextId++, type, shape: o.shape || { kind: 'circle', r: 16 }, spec, density: dens,
      friction: o.friction == null ? 0.5 : o.friction,
      restitution: o.restitution == null ? PH.e : o.restitution,
      group: o.group || 'item', data: o.data || {},
      x: o.x || 0, y: o.y || 0, a: o.angle || 0, vx: 0, vy: 0, av: 0,
      m, I, invM: dyn ? 1 / m : 0, invI: dyn ? 1 / I : 0,
      parts, br, px: new Float64Array(parts.length), py: new Float64Array(parts.length),
      sl: !dyn, slT: 0, held: 0, world: null,
      box: { x0: 0, y0: 0, x1: 0, y1: 0 },
      aabb() { return this.box; },
    };
    sync(b);
    return b;
  }

  /* Refresh the world positions of the parts and the AABB from x/y/a. */
  function sync(b) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < b.parts.length; i++) {
      const p = b.parts[i];
      const px = b.x + p.x * c - p.y * s, py = b.y + p.x * s + p.y * c;
      b.px[i] = px; b.py[i] = py;
      if (px - p.r < x0) x0 = px - p.r; if (px + p.r > x1) x1 = px + p.r;
      if (py - p.r < y0) y0 = py - p.r; if (py + p.r > y1) y1 = py + p.r;
    }
    b.box.x0 = x0; b.box.y0 = y0; b.box.x1 = x1; b.box.y1 = y1;
  }

  /* Teleport a body. */
  function setPose(b, x, y, a) { b.x = x; b.y = y; if (a != null) b.a = a; sync(b); }

  function wake(b) { if (b.type === 'dynamic') { b.sl = false; b.slT = 0; } }

  // ---- segments (walls and claw parts) -------------------------------------
  function mkSeg(ax, ay, bx, by, r, name) { return { ax, ay, bx, by, r, own: 9, vx: 0, vy: 0, om: 0, hx: 0, hy: 0, wall: name || null }; }
  const segTmp = { x: 0, y: 0 };
  function segClosest(s, px, py, out) {
    const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
    let t = l2 > 1e-6 ? ((px - s.ax) * dx + (py - s.ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    out.x = s.ax + dx * t; out.y = s.ay + dy * t;
    return out;
  }

  // ---- contacts ------------------------------------------------------------
  function addContact(W, a, b, px, py, nx, ny, pen, mu, seg) {
    W.contacts.push({ a, b, px, py, nx, ny, pen, mu, seg, jn: 0, jt: 0, kn: 0, kt: 0, bias: 0,
      rax: 0, ray: 0, rbx: 0, rby: 0, kvx: 0, kvy: 0, ima: 0, iIa: 0, imb: 0, iIb: 0 });
  }
  /* Parts of b against one capsule segment (a wall or a claw part).  Claw
     contacts also feed the rig: touch (the claw landed on something) and
     per-prong halt (something is in the way of the closing sweep). */
  function bodyVsSeg(W, b, s, claw) {
    const q = segClosest(s, b.x, b.y, segTmp);
    const R0 = b.br + s.r, qx0 = b.x - q.x, qy0 = b.y - q.y;
    if (qx0 * qx0 + qy0 * qy0 > R0 * R0) return;
    const K = claw ? W.ctl : null;
    for (let i = 0; i < b.parts.length; i++) {
      const r = b.parts[i].r, px = b.px[i], py = b.py[i];
      const c = segClosest(s, px, py, segTmp);
      const ex = c.x - px, ey = c.y - py, d2 = ex * ex + ey * ey, rr = r + s.r;
      if (d2 >= rr * rr) continue;
      const d = Math.sqrt(d2);
      const nx = d > 1e-6 ? ex / d : 0, ny = d > 1e-6 ? ey / d : -1;
      const pen = rr - d;
      let mu;
      if (claw) mu = K.mu * clamp(Math.sqrt(b.friction / 0.45), 0.35, 1.15);
      else mu = Math.sqrt(PH.wallMu * b.friction);
      addContact(W, b, null, px + nx * r, py + ny * r, nx, ny, pen, mu, s);
      if (claw) {
        wake(b);
        b.held = 2;
        if (s.own === 0 && pen > RIG.touchHub && ny < -0.2) K.touch = true;
        if (s.own !== 0 && pen > RIG.touchProng && ny < -0.3) K.touch = true;
        // a prong only stalls on something in the way of its closing sweep,
        // not on the pile leaning against its outside
        if (s.own !== 0) {
          const open = ((s.own < 0 ? K.pL : K.pR) - PHI_CLOSED) / (PHI_OPEN - PHI_CLOSED);
          if (pen > K.halt + RIG.haltOpen * open * open) {
            const omc = s.own * RIG.closeRate, cvx = -omc * (py - s.hy), cvy = omc * (px - s.hx);
            if (cvx * nx + cvy * ny < 0) { if (s.own < 0) K.hitL = true; else K.hitR = true; }
          }
        }
      }
    }
  }
  function collide(W) {
    const B = W.bodies; W.contacts.length = 0;
    for (const b of B) sync(b);
    for (let i = 0; i < B.length; i++) {
      const a = B[i];
      for (let j = i + 1; j < B.length; j++) {
        const b = B[j];
        if (a.sl && b.sl) continue;
        const dx = b.x - a.x, dy = b.y - a.y, RR = a.br + b.br;
        if (dx * dx + dy * dy > RR * RR) continue;
        const mu = Math.sqrt(a.friction * b.friction);
        for (let m = 0; m < a.parts.length; m++) {
          const ra = a.parts[m].r;
          for (let n = 0; n < b.parts.length; n++) {
            const rb = b.parts[n].r;
            const ex = b.px[n] - a.px[m], ey = b.py[n] - a.py[m], d2 = ex * ex + ey * ey, rr = ra + rb;
            if (d2 >= rr * rr) continue;
            const d = Math.sqrt(d2);
            const nx = d > 1e-6 ? ex / d : 0, ny = d > 1e-6 ? ey / d : 1;
            const pen = rr - d;
            addContact(W, a, b, a.px[m] + nx * (ra - pen * 0.5), a.py[m] + ny * (ra - pen * 0.5), nx, ny, pen, mu, null);
          }
        }
      }
    }
    for (const b of B) {
      if (b.type !== 'dynamic') continue;
      if (!b.sl) for (const s of W.segs) bodyVsSeg(W, b, s, false);
      for (const s of W.csegs) bodyVsSeg(W, b, s, true);
    }
  }
  function relVel(c, out) {
    const a = c.a;
    const vax = a.vx - a.av * c.ray, vay = a.vy + a.av * c.rax;
    let vbx = 0, vby = 0;
    if (c.b) { const b = c.b; vbx = b.vx - b.av * c.rby; vby = b.vy + b.av * c.rbx; }
    else if (c.seg) { vbx = c.kvx; vby = c.kvy; }
    out.x = vbx - vax; out.y = vby - vay;
    return out;
  }
  const rv = { x: 0, y: 0 };
  function prepContacts(W, h) {
    for (const c of W.contacts) {
      const a = c.a, b = c.b;
      // a sleeper hit hard or pushed deep wakes up
      if (b && a.sl !== b.sl) {
        const s = a.sl ? a : b, o = a.sl ? b : a;
        if (c.pen > PH.wakePen || Math.hypot(o.vx, o.vy) > PH.wakeV) wake(s);
      }
      const ima = a.sl ? 0 : a.invM, iIa = a.sl ? 0 : a.invI;
      const imb = b && !b.sl ? b.invM : 0, iIb = b && !b.sl ? b.invI : 0;
      c.ima = ima; c.iIa = iIa; c.imb = imb; c.iIb = iIb;
      c.rax = c.px - a.x; c.ray = c.py - a.y;
      if (b) { c.rbx = c.px - b.x; c.rby = c.py - b.y; }
      else if (c.seg) { const s = c.seg; c.kvx = s.vx - s.om * (c.py - s.hy); c.kvy = s.vy + s.om * (c.px - s.hx); }
      const nx = c.nx, ny = c.ny, tx = -ny, ty = nx;
      const rna = c.rax * ny - c.ray * nx, rta = c.rax * ty - c.ray * tx;
      let kn = ima + iIa * rna * rna, kt = ima + iIa * rta * rta;
      if (b) { const rnb = c.rbx * ny - c.rby * nx, rtb = c.rbx * ty - c.rby * tx; kn += imb + iIb * rnb * rnb; kt += imb + iIb * rtb * rtb; }
      c.kn = kn > 0 ? 1 / kn : 0; c.kt = kt > 0 ? 1 / kt : 0;
      const cap = c.seg && c.seg.own !== 9 ? PH.clawBias : PH.maxBias;
      c.bias = Math.min(cap, PH.beta / h * Math.max(0, c.pen - PH.slop));
      const v = relVel(c, rv), vn = v.x * nx + v.y * ny;
      const e = Math.max(a.restitution, b ? b.restitution : 0);
      if (vn < -PH.bounceV) c.bias = Math.max(c.bias, -e * vn);
      c.jn = 0; c.jt = 0;
    }
  }
  function applyImp(c, Px, Py) {
    const a = c.a;
    a.vx -= Px * c.ima; a.vy -= Py * c.ima; a.av -= c.iIa * (c.rax * Py - c.ray * Px);
    if (c.b) { const b = c.b; b.vx += Px * c.imb; b.vy += Py * c.imb; b.av += c.iIb * (c.rbx * Py - c.rby * Px); }
  }
  function solveContacts(W) {
    const C = W.contacts;
    for (let k = 0; k < PH.it; k++) {
      for (let i = 0; i < C.length; i++) {
        const c = C[i];
        if (!c.kn) continue;
        let v = relVel(c, rv);
        const vn = v.x * c.nx + v.y * c.ny;
        let j = (c.bias - vn) * c.kn;
        const o = c.jn; c.jn = Math.max(0, o + j); j = c.jn - o;
        applyImp(c, j * c.nx, j * c.ny);
        const tx = -c.ny, ty = c.nx;
        v = relVel(c, rv);
        const vt = v.x * tx + v.y * ty;
        let jt = -vt * c.kt;
        const mx = c.mu * c.jn, ot = c.jt;
        c.jt = clamp(ot + jt, -mx, mx); jt = c.jt - ot;
        applyImp(c, jt * tx, jt * ty);
      }
    }
  }
  /* One substep: gravity and damping, contacts, integration, the hard
     clamps, held decay and sleeping. */
  function physStep(W, h) {
    const g = W.gravity, B = W.bodies, cb = W.clampBox;
    for (const b of B) {
      if (b.sl || b.type !== 'dynamic') continue;
      b.vx += g.x * h; b.vy += g.y * h;
      const ld = 1 - PH.linDamp * h, ad = 1 - PH.angDamp * h;
      b.vx *= ld; b.vy *= ld; b.av *= ad;
    }
    collide(W);
    prepContacts(W, h);
    solveContacts(W);
    for (const b of B) {
      if (b.sl || b.type !== 'dynamic') continue;
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > PH.maxV * PH.maxV) { const k = PH.maxV / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
      b.x += b.vx * h; b.y += b.vy * h; b.a += b.av * h;
      // the claw can shove things into the floor; never let them through it
      if (b.x < cb.chuteX - 4) { if (b.y > cb.floorY) { b.y = cb.floorY; if (b.vy > 0) b.vy = 0; } }
      else if (b.y > cb.trayY) { b.y = cb.trayY; if (b.vy > 0) b.vy = 0; }
      // ...or through the side walls and the lid, however hard the claw shoves
      if (b.x < cb.xMin) { b.x = cb.xMin; if (b.vx < 0) b.vx = 0; }
      else if (b.x > cb.xMax) { b.x = cb.xMax; if (b.vx > 0) b.vx = 0; }
      if (b.y < cb.yMin) { b.y = cb.yMin; if (b.vy < 0) b.vy = 0; }
      if (b.held > 0) b.held -= h * PH.heldDecay;
      if (!W.busy && sp < PH.sleepV * PH.sleepV && Math.abs(b.av) < PH.sleepW && b.held <= 0) {
        b.slT += h;
        if (b.slT > PH.sleepT) { b.sl = true; b.vx = b.vy = b.av = 0; }
      } else b.slT = 0;
    }
  }

  // ---- world ---------------------------------------------------------------
  /* world({w, h, gravity}) -> W.  Pre hooks run before each substep (the rig
     plans its velocities there), post hooks after (the rig moves). */
  function world(o) {
    o = o || {};
    const w = o.w || 480, h = o.h || 390;
    const W = {
      gravity: { x: o.gravity ? o.gravity.x : 0, y: o.gravity ? o.gravity.y : 1400 },
      w, h, bodies: [], segs: [], csegs: [], contacts: [], ctl: null, busy: false,
      pre: [], post: [], time: 0, acc: 0, steps: 0,
      clampBox: { xMin: 5, xMax: w - 5, yMin: RIG.clampTop, floorY: h - RIG.floorSink, chuteX: w + 100, trayY: h - RIG.floorSink },
      add, remove, step, setGravity, energy, contactsOf, queryAABB, wakeAll, addHook, removeHook, addPost, removePost, sync,
    };
    function add(b) { if (W.bodies.indexOf(b) < 0) W.bodies.push(b); b.world = W; sync(b); return b; }
    function remove(b) {
      const i = W.bodies.indexOf(b); if (i >= 0) W.bodies.splice(i, 1);
      b.world = null;
      wakeAll();   // whatever rested on it must fall
    }
    function setGravity(x, y) { W.gravity.x = x; W.gravity.y = y; wakeAll(); }
    function wakeAll() { for (const b of W.bodies) wake(b); }
    function addHook(fn) { if (W.pre.indexOf(fn) < 0) W.pre.push(fn); }
    function removeHook(fn) { const i = W.pre.indexOf(fn); if (i >= 0) W.pre.splice(i, 1); }
    function addPost(fn) { if (W.post.indexOf(fn) < 0) W.post.push(fn); }
    function removePost(fn) { const i = W.post.indexOf(fn); if (i >= 0) W.post.splice(i, 1); }
    /* Sum of kinetic energy (linear + angular) of the dynamic bodies. */
    function energy() {
      let e = 0;
      for (const b of W.bodies) if (b.type === 'dynamic') e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.I * b.av * b.av;
      return e;
    }
    function queryAABB(x0, y0, x1, y1) {
      const out = [];
      for (const b of W.bodies) { const bx = b.box; if (bx.x1 >= x0 && bx.x0 <= x1 && bx.y1 >= y0 && bx.y0 <= y1) out.push(b); }
      return out;
    }
    /* Contacts touching b from the last substep; the normal points from b to
       other.  other is a body, or a segment ({wall} for cabinet walls, {own}
       -1/0/1 for claw parts). */
    function contactsOf(b) {
      const out = [];
      for (const c of W.contacts) {
        if (c.a === b) out.push({ other: c.b || c.seg, nx: c.nx, ny: c.ny, px: c.px, py: c.py, depth: c.pen, claw: !!(c.seg && c.seg.own !== 9) });
        else if (c.b === b) out.push({ other: c.a, nx: -c.nx, ny: -c.ny, px: c.px, py: c.py, depth: c.pen, claw: false });
      }
      return out;
    }
    function substep() {
      for (let i = 0; i < W.pre.length; i++) W.pre[i](H, W);
      physStep(W, H);
      for (let i = 0; i < W.post.length; i++) W.post[i](H, W);
      W.time += H; W.steps++;
    }
    /* Fixed-step accumulator: whole substeps, at most MAX_SUB per call. */
    function step(dt) {
      if (!(dt > 0)) return;
      W.acc += Math.min(dt, MAX_SUB * H);
      let n = 0;
      while (W.acc >= H - 1e-9 && n < MAX_SUB) { substep(); W.acc -= H; n++; }
      if (W.acc < 1e-9) W.acc = 0;
      if (W.acc > H) W.acc = H;
      for (const b of W.bodies) sync(b);
    }
    return W;
  }

  // ---- cabinet -----------------------------------------------------------
  /* Static capsule walls around the interior [0,w]x[0,h]: left, right, floor
     (none under the chute: prizes fall through it onto a hidden tray), the
     chute divider on the RIGHT, and the lid.  Also sets the world's hard
     clamps.  Returns {inChute(b), bounds, segs}. */
  function cabinet(W, o) {
    o = o || {};
    const w = o.w || 480, h = o.h || 390, chuteW = o.chuteW || 64;
    const dividerH = o.dividerH == null ? 0.6 : o.dividerH;
    const chuteX = w - chuteW, dividerTop = h - dividerH * h, trayY = h + RIG.tray;
    const segs = [
      mkSeg(-4, -120, -4, h + 4, 4, 'left'),
      mkSeg(w + 4, -120, w + 4, trayY + 40, 4, 'right'),
      mkSeg(-8, h + 4, chuteX, h + 4, 4, 'floor'),
      mkSeg(chuteX, dividerTop, chuteX, trayY + 4, 5, 'divider'),   // runs down to the tray: no pocket under the floor
      mkSeg(-8, RIG.lid, w + 8, RIG.lid, 4, 'lid'),
      mkSeg(chuteX - 2, trayY + 4, w + 8, trayY + 4, 4, 'tray'),
    ];
    W.segs = segs;
    W.clampBox = { xMin: 5, xMax: w - 5, yMin: RIG.clampTop, floorY: h - RIG.floorSink, chuteX, trayY: trayY - RIG.floorSink };
    return {
      segs, bodies: [],
      bounds: { w, h, chuteX, chuteW, dividerTop, floorY: h, trayY, slopeW: 0, slopeH: 0 },
      inChute(b) { return b.x > chuteX && b.x < w && b.y > dividerTop; },
    };
  }

  // ---- claw rig ----------------------------------------------------------
  /* clawRig(W, {cabinet, homeX, chuteX, railY, prongs, width, grip, speed,
     rubber, magnet, rand}).  Kinematic hub + two prongs driven by Claw
     Crawl's state machine: idle -> drop -> close -> lift -> carry -> open ->
     return.  See DESIGN.md for the public surface. */
  function clawRig(W, o) {
    o = o || {};
    const C = o.cabinet;
    const cw = C ? C.bounds.w : W.w, ch = C ? C.bounds.h : W.h;
    const binX = C ? C.bounds.chuteX : cw - 64;              // right edge of the bin (the divider)
    const cfg = {
      prongs: o.prongs === 3 ? 3 : 2, width: o.width == null ? 1 : o.width,
      grip: o.grip == null ? 1 : o.grip, speed: o.speed == null ? 1 : o.speed,
      rubber: o.rubber ? 1 : 0, magnet: o.magnet ? 1 : 0, grease: o.grease ? 1 : 0,
    };
    const rand = o.rand || (() => 0.5);
    const railY = o.railY == null ? 26 : o.railY;
    const RAIL = railY + RIG.hubDrop;
    const homeX = o.homeX == null ? binX * 0.5 : o.homeX;
    const chuteX = o.chuteX == null ? binX + (C ? C.bounds.chuteW : 64) * 0.5 : o.chuteX;
    // Internal claw state (Claw Crawl's F.claw), shared with bodyVsSeg through W.ctl.
    const K = {
      x: homeX, y: RAIL, tx: homeX, vx: 0, vy: 0, pL: PHI_OPEN, pR: PHI_OPEN, wL: 0, wR: 0,
      st: 'idle', t: 0, s: 1, grip: 0.5, mu: 1, halt: 2.2, pending: false, moving: false,
      touch: false, hitL: false, hitR: false, haltL: false, haltR: false, blkL: 0, blkR: 0,
      loosen: 0, jolt: 0, sway: 0, swayV: 0, cargo: [], returning: false,
    };
    const R = {
      phase: 'idle', x: homeX, y: RAIL, targetX: homeX, sway: 0,
      cableTop: { x: homeX, y: railY },
      bodies: { hub: { x: homeX, y: RAIL, r: RIG.hubR }, prongs: [[], []], ghost: null },
      cfg, homeX, chuteX, railY, geo: null, ctl: K, events: [],
      setTarget, drop, update, held, locked, cradle, open, setConfig, destroy, calm, size, gripCC,
    };
    function size() { return RIG.base * cfg.width * (cfg.prongs === 3 ? RIG.prong3Size : 1); }
    /* Clawspire's grip (0.75..2+) mapped onto Claw Crawl's 0..1 grip. */
    function gripCC() {
      let g = clamp(RIG.gripBase + RIG.gripSlope * (cfg.grip - 0.75), RIG.gripMin, 1);
      g += cfg.rubber ? RIG.rubberGrip : 0;
      g += cfg.prongs === 3 ? RIG.prong3Grip : 0;
      g -= cfg.grease ? RIG.greaseGrip : 0;
      return clamp(g, 0.05, 1);
    }
    function refresh() {
      K.s = size(); K.grip = gripCC(); K.mu = 0.6 + K.grip * 0.8;
      const s = K.s;
      R.geo = { s, grip: K.grip, hubR: RIG.hubR * s, reach: (RIG.hingeY + PRONG[3][1]) * s, span: openSpan() * 2, halt: RIG.haltBase + RIG.haltGrip * K.grip, mu: K.mu };
    }
    /* Horizontal reach of an open prong tip from the hub centre. */
    function openSpan() {
      const P = prongPts(1);
      let m = 0; for (const p of P) m = Math.max(m, p.x - K.x);
      return m;
    }
    function lim() { return 34 * K.s + 6; }
    function clampX(x) { return clamp(x, lim(), binX - lim()); }
    function prongPts(side) {
      const s = K.s, phi = side < 0 ? K.pL : K.pR;
      const hx = K.x + side * RIG.hingeX * s, hy = K.y + RIG.hingeY * s;
      const al = -side * phi, ca = Math.cos(al), sa = Math.sin(al);
      return PRONG.map(([lx, ly]) => { const x = side * lx * s, y = ly * s; return { x: hx + x * ca - y * sa, y: hy + x * sa + y * ca }; });
    }
    /* The drawn-only third finger: a shorter straight prong down the middle. */
    function ghostPts() {
      const s = K.s, phi = (K.pL + K.pR) * 0.5;
      const hy = K.y + RIG.hingeY * s, k = 0.86;
      return PRONG.map(([lx, ly]) => ({ x: K.x + lx * 0.25 * s * (1 - phi), y: hy + ly * k * s }));
    }
    function buildSegs() {
      const s = K.s, out = W.csegs; out.length = 0;
      const hub = mkSeg(K.x, K.y, K.x, K.y, RIG.hubR * s); hub.own = 0; hub.vx = K.vx; hub.vy = K.vy; hub.hx = K.x; hub.hy = K.y;
      out.push(hub);
      for (const side of [-1, 1]) {
        const dphi = side < 0 ? K.wL : K.wR;
        const hx = K.x + side * RIG.hingeX * s, hy = K.y + RIG.hingeY * s;
        const P = prongPts(side);
        for (let k = 0; k < P.length - 1; k++) {
          const g = mkSeg(P[k].x, P[k].y, P[k + 1].x, P[k + 1].y, RIG.segR * s);
          g.own = side; g.vx = K.vx; g.vy = K.vy; g.om = -side * dphi; g.hx = hx; g.hy = hy;
          out.push(g);
        }
      }
    }
    function emit(ev) { R.events.push(ev); }
    function phaseName() {
      switch (K.st) {
        case 'idle': return K.moving ? 'moving' : 'idle';
        case 'drop': return 'dropping';
        case 'close': return 'closing';
        case 'lift': return 'lifting';
        case 'carry': return 'carrying';
        case 'open': return 'releasing';
        default: return 'returning';
      }
    }
    function mirror() {
      R.x = K.x; R.y = K.y; R.phase = phaseName(); R.sway = K.sway; R.targetX = K.tx;
      R.cableTop.x = K.x - K.sway * 12; R.cableTop.y = railY;
      const hb = R.bodies.hub; hb.x = K.x; hb.y = K.y; hb.r = RIG.hubR * K.s;
      R.bodies.prongs[0] = prongPts(-1); R.bodies.prongs[1] = prongPts(1);
      R.bodies.ghost = cfg.prongs === 3 ? ghostPts() : null;
    }
    /* Travel toward tx at the carriage speed; true when arrived. */
    function travel(tx, h) {
      const d = tx - K.x;
      if (Math.abs(d) > 0.6) { K.vx = Math.sign(d) * Math.min(RIG.carSpeed * cfg.speed, Math.abs(d) / h); return false; }
      return true;
    }
    /* Decide this substep's claw velocities (pre hook). */
    function plan(h) {
      K.vx = 0; K.vy = 0; K.wL = 0; K.wR = 0; K.t += h;
      const maxY = ch - RIG.floorClear * K.s - 2;
      switch (K.st) {
        case 'idle': {
          const arrived = travel(clampX(K.tx), h);
          K.moving = !arrived;
          if (arrived && K.pending) {
            K.pending = false; K.st = 'drop'; K.t = 0; K.touch = false; K.cargo = [];
            W.wakeAll(); emit('drop');
          }
          break;
        }
        case 'return': {
          if (travel(clampX(K.tx), h)) { K.st = 'idle'; K.t = 0; K.moving = false; emit('home'); }
          break;
        }
        case 'drop':
          K.vy = RIG.dropSpeed;
          if (K.touch || K.y >= maxY) {
            if (K.touch) emit('touch');
            K.st = 'close'; K.t = 0; K.haltL = K.haltR = false; K.blkL = K.blkR = 0;
            K.halt = RIG.haltBase + RIG.haltGrip * K.grip;
            emit('close');
          }
          break;
        case 'close': {
          // keep squeezing; a prong that has been blocked for a moment has closed on something
          K.blkL = K.hitL ? K.blkL + h : 0;
          K.blkR = K.hitR ? K.blkR + h : 0;
          if (!K.hitL && K.pL > PHI_CLOSED) K.wL = -RIG.closeRate;
          if (!K.hitR && K.pR > PHI_CLOSED) K.wR = -RIG.closeRate;
          if (K.hitL && !K.haltL) K.haltL = true;
          if (K.hitR && !K.haltR) K.haltR = true;
          const doneL = K.blkL > RIG.blockT || K.pL <= PHI_CLOSED, doneR = K.blkR > RIG.blockT || K.pR <= PHI_CLOSED;
          if ((doneL && doneR && K.t > RIG.closeMin) || K.t > RIG.closeMax) {
            K.st = 'lift'; K.t = 0;
            K.loosen = (1 - K.grip) * RIG.loosen * (0.7 + rand() * 0.6);
            K.cargo = W.bodies.filter(b => b.type === 'dynamic' && b.held > 0 && b.y < K.y + RIG.cargoY * K.s);
            emit('lift');
          }
          break;
        }
        case 'lift':
          K.vy = -RIG.liftSpeed;
          if (K.t < RIG.loosenT) { K.wL = K.wR = K.loosen / RIG.loosenT; }
          if (K.y <= RAIL) {
            K.st = 'carry'; K.t = 0; K.swayV += RIG.swayKick;
            // the jolt at the top: a weak claw twitches open a touch
            K.jolt = rand() < (1 - K.grip) * RIG.joltP ? RIG.jolt : 0;
            emit('carry');
          }
          break;
        case 'carry': {
          if (K.jolt > 0 && K.t < RIG.joltT) { K.wL = K.wR = K.jolt / RIG.joltT; }
          if (travel(chuteX, h) && K.t > RIG.carryWait) { K.st = 'open'; K.t = 0; K.jolt = 0; emit('release'); }
          break;
        }
        case 'open':
          if (K.pL < PHI_OPEN) K.wL = RIG.openRate;
          if (K.pR < PHI_OPEN) K.wR = RIG.openRate;
          // hold still until the load has let go of the prongs (it can hang on a
          // tip for a moment), then travel back to the aim point
          if (K.t > RIG.openT && (K.t > RIG.openT + RIG.openHold || !W.bodies.some(b => b.held > 0))) { K.st = 'return'; K.t = 0; K.cargo = []; }
          break;
      }
      if (K.st === 'drop' && K.y + K.vy * h > maxY) K.vy = (maxY - K.y) / h;
      if (K.st === 'lift' && K.y + K.vy * h < RAIL) K.vy = (RAIL - K.y) / h;
      K.touch = false; K.hitL = false; K.hitR = false;
      W.busy = K.st === 'drop' || K.st === 'close' || K.st === 'lift';
      W.ctl = K;
      buildSegs();
      magnet(h);
    }
    /* The electromagnet: metal within magnetR of the hub drifts in while the
       claw drops and closes. */
    function magnet(h) {
      if (!cfg.magnet || (K.st !== 'drop' && K.st !== 'close')) return;
      const s = K.s, hx = K.x, hy = K.y + RIG.hingeY * s;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || !b.data || !b.data.tags || b.data.tags.indexOf('metal') < 0) continue;
        const dx = hx - b.x, dy = hy - b.y, d = Math.hypot(dx, dy);
        if (d > RIG.magnetR || d < RIG.hubR * s + b.br - 2) continue;
        const f = RIG.magnetF * h / Math.max(1, d / 40);
        if (b.sl && f < 2) continue;
        wake(b); b.vx += dx / d * f; b.vy += dy / d * f;
      }
    }
    /* Move the claw by this substep's velocities (post hook) and watch the cargo. */
    function move(h) {
      K.x += K.vx * h; K.y += K.vy * h;
      K.pL = clamp(K.pL + K.wL * h, PHI_CLOSED - 0.02, PHI_OPEN);
      K.pR = clamp(K.pR + K.wR * h, PHI_CLOSED - 0.02, PHI_OPEN);
      // purely visual cable sway
      K.swayV += (-K.sway * 40 - K.swayV * 3 - K.vx * 0.02) * h; K.sway += K.swayV * h;
      // cargo that slipped out of the prongs on the way
      if (K.st === 'lift' || K.st === 'carry') {
        for (let i = K.cargo.length - 1; i >= 0; i--) {
          const b = K.cargo[i];
          if (b.world !== W) { K.cargo.splice(i, 1); continue; }
          if (b.y > K.y + RIG.slipY * K.s && b.vy > RIG.slipV && b.x < binX) { K.cargo.splice(i, 1); emit('slip'); }
        }
      }
      mirror();
    }
    // ---- public
    function setTarget(x) {
      if (K.st !== 'idle') return false;
      K.tx = clampX(x); R.targetX = K.tx;
      return true;
    }
    function drop() {
      if (K.st !== 'idle') return false;
      K.pending = true;
      return true;
    }
    /* Drive events out; the world's substeps do the moving. */
    function update() {
      const ev = R.events; R.events = [];
      mirror();
      return ev;
    }
    function busy() { return K.st === 'drop' || K.st === 'close' || K.st === 'lift' || K.st === 'carry' || K.st === 'open'; }
    /* Bodies the claw is touching right now (only meaningful while busy). */
    function held() { return busy() ? W.bodies.filter(b => b.type === 'dynamic' && b.held > 0) : []; }
    /* The cargo: what was held above the hub when the lift started and has not slipped. */
    function locked() { return K.st === 'lift' || K.st === 'carry' ? K.cargo.slice() : []; }
    function cradle(b) { return b ? K.cargo.indexOf(b) >= 0 : K.cargo.slice(); }
    /* Force the prongs open: a busy claw goes straight to 'releasing' and then returns. */
    function open() {
      if (K.st === 'idle' || K.st === 'return') { K.pL = K.pR = PHI_OPEN; return; }
      K.st = 'open'; K.t = 0; K.cargo = []; K.pending = false; K.jolt = 0;
      mirror();
    }
    function setConfig(c) {
      c = c || {};
      if (c.width != null) cfg.width = c.width;
      if (c.prongs != null) cfg.prongs = c.prongs === 3 ? 3 : 2;
      if (c.rubber != null) cfg.rubber = c.rubber ? 1 : 0;
      if (c.grip != null) cfg.grip = c.grip;
      if (c.speed != null) cfg.speed = c.speed;
      if (c.magnet != null) cfg.magnet = c.magnet ? 1 : 0;
      if (c.grease != null) cfg.grease = c.grease ? 1 : 0;
      refresh(); mirror();
    }
    function destroy() {
      W.removeHook(plan); W.removePost(move);
      W.csegs.length = 0; W.ctl = null; W.busy = false;
      for (const b of W.bodies) b.held = 0;
    }
    function calm() { return K.st === 'idle' && !K.moving && Math.abs(K.x - K.tx) < 1; }

    refresh();
    K.tx = clampX(homeX); K.x = K.tx;
    W.addHook(plan); W.addPost(move);
    buildSegs(); mirror();
    return R;
  }

  return { box, body, world, cabinet, clawRig, setPose, sync, partSpec, RIG, PH, SHAPE, PRONG, PHI_OPEN, PHI_CLOSED, H };
})();
