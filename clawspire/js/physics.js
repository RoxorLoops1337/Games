// Clawspire -- PHYS: a small 2D rigid body engine (circles + convex polygons,
// sequential impulses with warm starting, Coulomb friction, restitution,
// revolute joints with limits and a motor) plus the cabinet and the claw rig
// built on it.  Units: pixels and seconds, y grows downward.  Headless: no DOM,
// no Math.random (the rig takes a cfg.rand stream for its jitter).
//
// The hot loops (substep, narrowphase, solver) do not allocate per body or per
// contact: manifolds live in a Map keyed by body pair and are reused across
// substeps, and collision results go through module-level scratch structs.
const PHYS = (() => {
  'use strict';

  // ---- constants ---------------------------------------------------------
  const H = 1 / 240;             // fixed substep, seconds
  const MAX_SUB = 12;            // max substeps per W.step call
  const ITER = 16;               // velocity iterations per substep
  const BETA = 0.0;              // velocity-level Baumgarte for contacts (0: positions fix penetration)
  const SLOP = 0.5;              // allowed penetration (px)
  const SKIN = 0.6;              // contacts persist while this far apart (stable stacks)
  const POS_ITER = 4;            // position correction passes per substep
  const POS_BETA = 0.3;          // fraction of the penetration removed per pass
  const POS_MAX = 6;             // max correction per pass (px)
  const JOINT_BETA = 0.3;        // Baumgarte factor for joint drift
  const MAX_V = 2400;            // linear speed cap (px/s), anti-tunnelling
  const MAX_AV = 60;             // angular speed cap (rad/s)
  const REST_VEL = 80;           // bounce only above this approach speed
  const LIN_DAMP = 0.08;         // per second, keeps piles from creeping
  const ANG_DAMP = 0.6;
  const SLOW_V = 40;             // below this speed extra damping settles piles
  const SLOW_DAMP = 5.0;         // (rolling resistance stand-in; invisible on flying items)
  const ROLL_V = 12;             // circles creeping slower than this get strong rolling resistance
  const ROLL_DAMP = 30;          // (a ball on a 0.6 degree box top must stop, not creep forever)
  const PI = Math.PI;

  let nextId = 1;

  // ---- small helpers -----------------------------------------------------
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* Convex CCW (positive shoelace area) box verts centred on the origin. */
  function box(w, h) {
    const hw = w / 2, hh = h / 2;
    return [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
  }

  /* Signed shoelace area; positive means the winding we store internally. */
  function signedArea(v) {
    let a = 0;
    for (let i = 0, n = v.length; i < n; i++) {
      const p = v[i], q = v[(i + 1) % n];
      a += p.x * q.y - q.x * p.y;
    }
    return a / 2;
  }

  /* Copies verts, fixes winding, drops duplicate points, builds outward normals. */
  function prepPoly(verts) {
    let v = verts.map(p => ({ x: p.x, y: p.y }));
    if (signedArea(v) < 0) v.reverse();
    const out = [];
    for (let i = 0; i < v.length; i++) {
      const p = v[i], q = v[(i + 1) % v.length];
      if (Math.hypot(q.x - p.x, q.y - p.y) > 1e-6) out.push(p);
    }
    const normals = [];
    for (let i = 0; i < out.length; i++) {
      const p = out[i], q = out[(i + 1) % out.length];
      const dx = q.x - p.x, dy = q.y - p.y, len = Math.hypot(dx, dy) || 1;
      normals.push({ x: dy / len, y: -dx / len });
    }
    return { verts: out, normals };
  }

  /* Area centroid of a convex polygon (positive winding). */
  function centroid(v) {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, n = v.length; i < n; i++) {
      const p = v[i], q = v[(i + 1) % n], cr = p.x * q.y - q.x * p.y;
      a += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr;
    }
    if (Math.abs(a) < 1e-12) return { x: 0, y: 0 };
    return { x: cx / (3 * a), y: cy / (3 * a) };
  }

  /* Mass and inertia about the local origin (which body() makes the centre of mass). */
  function massProps(shape, density) {
    if (shape.kind === 'circle') {
      const m = density * PI * shape.r * shape.r;
      return { m, I: 0.5 * m * shape.r * shape.r };
    }
    const v = shape.verts;
    let area = 0, inertia = 0;
    for (let i = 0, n = v.length; i < n; i++) {
      const p = v[i], q = v[(i + 1) % n];
      const cr = p.x * q.y - q.x * p.y;
      area += cr / 2;
      inertia += (cr / 12) * (p.x * p.x + p.x * q.x + q.x * q.x + p.y * p.y + p.y * q.y + q.y * q.y);
    }
    return { m: density * area, I: density * inertia };
  }

  // ---- bodies ------------------------------------------------------------
  /* See DESIGN.md for the option list.  Returns the body; add it with W.add. */
  function body(o) {
    o = o || {};
    const kind = o.shape && o.shape.kind === 'circle' ? 'circle' : 'poly';
    let shape, lc = { x: 0, y: 0 };
    if (kind === 'circle') shape = { kind: 'circle', r: o.shape.r };
    else {
      const verts = o.shape && o.shape.verts ? o.shape.verts : box(20, 20);
      const pp = prepPoly(verts);
      // Simulate about the centre of mass: shift the verts so the local origin
      // is the centroid and remember where the shape's own origin went (lc).
      lc = centroid(pp.verts);
      for (const v of pp.verts) { v.x -= lc.x; v.y -= lc.y; }
      shape = { kind: 'poly', verts: pp.verts, normals: pp.normals };
    }
    const type = o.type || 'dynamic';
    const density = o.density == null ? 1 : o.density;
    const mp = massProps(shape, density);
    const dyn = type === 'dynamic';
    const a0 = o.angle || 0, c0 = Math.cos(a0), s0 = Math.sin(a0);
    const b = {
      id: nextId++,
      type, shape, density, lc,
      friction: o.friction == null ? 0.5 : o.friction,
      restitution: o.restitution == null ? 0.1 : o.restitution,
      group: o.group || 'item',
      mask: o.mask ? o.mask.slice() : null,
      sensor: !!o.sensor,
      data: o.data || {},
      // x/y is the centre of mass; the given x/y placed the shape's origin.
      x: (o.x || 0) + lc.x * c0 - lc.y * s0, y: (o.y || 0) + lc.x * s0 + lc.y * c0, a: a0,
      vx: 0, vy: 0, av: 0,
      m: mp.m, I: mp.I,
      invM: dyn && mp.m > 0 ? 1 / mp.m : 0,
      invI: dyn && mp.I > 0 ? 1 / mp.I : 0,
      c: 1, s: 0,                    // cached cos/sin of a
      wv: [], wn: [],                // world-space verts / normals (poly)
      box: { x0: 0, y0: 0, x1: 0, y1: 0 },
      noCollide: [],                 // bodies joined to this one
      world: null,
      aabb() { return this.box; },
      /* World position of the shape's original local origin (e.g. a prong hinge). */
      origin() { return { x: this.x - (this.lc.x * this.c - this.lc.y * this.s), y: this.y - (this.lc.x * this.s + this.lc.y * this.c) }; },
    };
    if (kind === 'poly') {
      for (let i = 0; i < shape.verts.length; i++) { b.wv.push({ x: 0, y: 0 }); b.wn.push({ x: 0, y: 0 }); }
    }
    syncBody(b);
    return b;
  }

  /* Refresh cached transform, world verts and AABB from x/y/a. */
  function syncBody(b) {
    b.c = Math.cos(b.a); b.s = Math.sin(b.a);
    const bx = b.box;
    if (b.shape.kind === 'circle') {
      bx.x0 = b.x - b.shape.r; bx.x1 = b.x + b.shape.r;
      bx.y0 = b.y - b.shape.r; bx.y1 = b.y + b.shape.r;
      return;
    }
    const v = b.shape.verts, n = b.shape.normals, c = b.c, s = b.s;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < v.length; i++) {
      const p = v[i], w = b.wv[i], q = n[i], wn = b.wn[i];
      w.x = b.x + p.x * c - p.y * s; w.y = b.y + p.x * s + p.y * c;
      wn.x = q.x * c - q.y * s; wn.y = q.x * s + q.y * c;
      if (w.x < x0) x0 = w.x; if (w.x > x1) x1 = w.x;
      if (w.y < y0) y0 = w.y; if (w.y > y1) y1 = w.y;
    }
    bx.x0 = x0; bx.y0 = y0; bx.x1 = x1; bx.y1 = y1;
  }

  /* Teleport a body (also used by the rig for kinematic placement). */
  function setPose(b, x, y, a) {
    b.x = x; b.y = y; if (a != null) b.a = a;
    syncBody(b);
  }

  // ---- narrowphase scratch -----------------------------------------------
  // One result struct reused for every pair: normal from A to B, up to 2 points.
  const SC = { n: 0, nx: 0, ny: 0, pts: [{ x: 0, y: 0, d: 0, id: 0 }, { x: 0, y: 0, d: 0, id: 0 }] };
  let sepBest = 0, sepIdx = 0;

  /* Max separation of B's verts along A's face normals (SAT half). */
  function maxSeparation(A, B) {
    const an = A.wn, av = A.wv, bv = B.wv;
    let best = -Infinity, bi = 0;
    for (let i = 0; i < an.length; i++) {
      const n = an[i], v = av[i];
      let mn = Infinity;
      for (let j = 0; j < bv.length; j++) {
        const d = (bv[j].x - v.x) * n.x + (bv[j].y - v.y) * n.y;
        if (d < mn) mn = d;
      }
      if (mn > best) { best = mn; bi = i; }
    }
    sepBest = best; sepIdx = bi;
  }

  const CLIP_IN = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];
  const CLIP_MID = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];
  const CLIP_OUT = [{ x: 0, y: 0, id: 0 }, { x: 0, y: 0, id: 0 }];

  /* Sutherland-Hodgman clip of a 2-point segment against the half plane
     dot(n, p) <= off.  Returns the number of points written to out. */
  function clipSegment(inp, out, nx, ny, off, clipId) {
    let n = 0;
    const d0 = nx * inp[0].x + ny * inp[0].y - off;
    const d1 = nx * inp[1].x + ny * inp[1].y - off;
    if (d0 <= 0) { out[n].x = inp[0].x; out[n].y = inp[0].y; out[n].id = inp[0].id; n++; }
    if (d1 <= 0) { out[n].x = inp[1].x; out[n].y = inp[1].y; out[n].id = inp[1].id; n++; }
    if (d0 * d1 < 0 && n < 2) {
      const t = d0 / (d0 - d1);
      out[n].x = inp[0].x + t * (inp[1].x - inp[0].x);
      out[n].y = inp[0].y + t * (inp[1].y - inp[0].y);
      out[n].id = clipId;
      n++;
    }
    return n;
  }

  /* Polygon vs polygon: SAT + reference face clipping, up to 2 contact points. */
  function collidePolyPoly(A, B) {
    maxSeparation(A, B);
    if (sepBest > SKIN) return 0;
    const sA = sepBest, iA = sepIdx;
    maxSeparation(B, A);
    if (sepBest > SKIN) return 0;
    const sB = sepBest, iB = sepIdx;
    let ref, inc, refIdx, flip;
    if (sB > sA * 0.98 + 0.002) { ref = B; inc = A; refIdx = iB; flip = true; }
    else { ref = A; inc = B; refIdx = iA; flip = false; }
    const rn = ref.wn[refIdx], v1 = ref.wv[refIdx], v2 = ref.wv[(refIdx + 1) % ref.wv.length];
    // Incident face: the one on inc most anti-parallel to the reference normal.
    let incIdx = 0, mn = Infinity;
    for (let j = 0; j < inc.wn.length; j++) {
      const d = inc.wn[j].x * rn.x + inc.wn[j].y * rn.y;
      if (d < mn) { mn = d; incIdx = j; }
    }
    const i1 = inc.wv[incIdx], i2 = inc.wv[(incIdx + 1) % inc.wv.length];
    CLIP_IN[0].x = i1.x; CLIP_IN[0].y = i1.y; CLIP_IN[0].id = incIdx;
    CLIP_IN[1].x = i2.x; CLIP_IN[1].y = i2.y; CLIP_IN[1].id = (incIdx + 1) % inc.wv.length;
    let tx = v2.x - v1.x, ty = v2.y - v1.y;
    const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
    const side1 = -(tx * v1.x + ty * v1.y);
    const side2 = tx * v2.x + ty * v2.y;
    if (clipSegment(CLIP_IN, CLIP_MID, -tx, -ty, side1, 8 + refIdx) < 2) return 0;
    if (clipSegment(CLIP_MID, CLIP_OUT, tx, ty, side2, 16 + refIdx) < 2) return 0;
    const front = rn.x * v1.x + rn.y * v1.y;
    let n = 0;
    for (let k = 0; k < 2; k++) {
      const p = CLIP_OUT[k];
      const sep = rn.x * p.x + rn.y * p.y - front;
      if (sep <= SKIN) {
        const out = SC.pts[n];
        // Contact point halfway between the incident vertex and the reference face.
        out.x = p.x - rn.x * sep * 0.5; out.y = p.y - rn.y * sep * 0.5;
        out.d = -sep; out.id = p.id + (flip ? 64 : 0) + refIdx * 128;
        n++;
      }
    }
    if (!n) return 0;
    SC.n = n;
    if (flip) { SC.nx = -rn.x; SC.ny = -rn.y; } else { SC.nx = rn.x; SC.ny = rn.y; }
    return n;
  }

  /* Circle vs polygon.  Normal written as poly -> circle; caller flips if needed. */
  function collideCirclePoly(C, P) {
    const cx = C.x, cy = C.y, r = C.shape.r;
    const pv = P.wv, pn = P.wn;
    let best = -Infinity, bi = 0;
    for (let i = 0; i < pv.length; i++) {
      const s = (cx - pv[i].x) * pn[i].x + (cy - pv[i].y) * pn[i].y;
      if (s > r + SKIN) return 0;
      if (s > best) { best = s; bi = i; }
    }
    const v1 = pv[bi], v2 = pv[(bi + 1) % pv.length];
    const out = SC.pts[0];
    if (best < 1e-6) {          // centre inside the polygon
      SC.nx = pn[bi].x; SC.ny = pn[bi].y;
      out.x = cx - SC.nx * r; out.y = cy - SC.ny * r; out.d = r - best; out.id = 0;
      SC.n = 1; return 1;
    }
    const ex = v2.x - v1.x, ey = v2.y - v1.y;
    const d1 = (cx - v1.x) * ex + (cy - v1.y) * ey;
    const d2 = (cx - v2.x) * -ex + (cy - v2.y) * -ey;
    let vx, vy;
    if (d1 <= 0) { vx = v1.x; vy = v1.y; }
    else if (d2 <= 0) { vx = v2.x; vy = v2.y; }
    else {
      SC.nx = pn[bi].x; SC.ny = pn[bi].y;
      out.x = cx - SC.nx * (r + best) * 0.5; out.y = cy - SC.ny * (r + best) * 0.5;
      out.d = r - best; out.id = 0;
      SC.n = 1; return 1;
    }
    const dx = cx - vx, dy = cy - vy, dist = Math.hypot(dx, dy);
    if (dist > r + SKIN) return 0;
    if (dist < 1e-9) { SC.nx = pn[bi].x; SC.ny = pn[bi].y; }
    else { SC.nx = dx / dist; SC.ny = dy / dist; }
    out.x = vx; out.y = vy; out.d = r - dist; out.id = d1 <= 0 ? 1 : 2;
    SC.n = 1; return 1;
  }

  function collideCircleCircle(A, B) {
    const dx = B.x - A.x, dy = B.y - A.y, ra = A.shape.r, rb = B.shape.r;
    const dist = Math.hypot(dx, dy);
    if (dist >= ra + rb + SKIN) return 0;
    if (dist < 1e-9) { SC.nx = 0; SC.ny = 1; } else { SC.nx = dx / dist; SC.ny = dy / dist; }
    const out = SC.pts[0];
    out.d = ra + rb - dist;
    out.x = A.x + SC.nx * (ra - out.d * 0.5); out.y = A.y + SC.ny * (ra - out.d * 0.5);
    out.id = 0; SC.n = 1;
    return 1;
  }

  /* Dispatch; on success SC holds the manifold with the normal from A to B. */
  function collide(A, B) {
    const ca = A.shape.kind === 'circle', cb = B.shape.kind === 'circle';
    if (ca && cb) return collideCircleCircle(A, B);
    if (!ca && !cb) return collidePolyPoly(A, B);
    if (ca) {
      if (!collideCirclePoly(A, B)) return 0;
      SC.nx = -SC.nx; SC.ny = -SC.ny;   // was poly(B) -> circle(A); want A -> B
      return SC.n;
    }
    return collideCirclePoly(B, A);     // poly(A) -> circle(B): already A -> B
  }

  // ---- contact manifolds -------------------------------------------------
  function newPoint() {
    return { x: 0, y: 0, d: 0, id: -1, rax: 0, ray: 0, rbx: 0, rby: 0,
      lax: 0, lay: 0, lbx: 0, lby: 0,
      Pn: 0, Pt: 0, mN: 0, mT: 0, bias: 0, velBias: 0 };
  }
  function newManifold(a, b) {
    return { a, b, n: 0, nx: 0, ny: 0, tx: 0, ty: 0, friction: 0, restitution: 0,
      pts: [newPoint(), newPoint()], stamp: 0, solve: true,
      block: false, k11: 0, k12: 0, k22: 0, nm11: 0, nm12: 0, nm22: 0 };
  }

  /* Merge the scratch result into the persistent manifold, keeping the
     accumulated impulses of points whose feature id survived (warm start). */
  function updateManifold(m, stamp) {
    const old0 = m.pts[0], old1 = m.pts[1];
    const oldN = m.n;
    // Save old impulses by id (at most two, so a couple of locals suffice).
    const id0 = oldN > 0 ? old0.id : -1, Pn0 = old0.Pn, Pt0 = old0.Pt, x0 = old0.x, y0 = old0.y;
    const id1 = oldN > 1 ? old1.id : -1, Pn1 = old1.Pn, Pt1 = old1.Pt, x1 = old1.x, y1 = old1.y;
    for (let k = 0; k < SC.n; k++) {
      const src = SC.pts[k], dst = m.pts[k];
      // Match by feature id, else by proximity: a clipped point and the vertex
      // it was clipped from swap ids on aligned faces, and losing the impulse
      // there makes stacks breathe.
      const near0 = id0 >= 0 && Math.abs(src.x - x0) + Math.abs(src.y - y0) < 1.5;
      const near1 = id1 >= 0 && Math.abs(src.x - x1) + Math.abs(src.y - y1) < 1.5;
      if (src.id === id0 || (near0 && src.id !== id1)) { dst.Pn = Pn0; dst.Pt = Pt0; }
      else if (src.id === id1 || near1) { dst.Pn = Pn1; dst.Pt = Pt1; }
      else { dst.Pn = 0; dst.Pt = 0; }
      dst.x = src.x; dst.y = src.y; dst.d = src.d; dst.id = src.id;
    }
    m.n = SC.n; m.nx = SC.nx; m.ny = SC.ny;
    m.tx = -SC.ny; m.ty = SC.nx;
    m.friction = Math.sqrt(m.a.friction * m.b.friction);
    m.restitution = Math.max(m.a.restitution, m.b.restitution);
    m.solve = !(m.a.sensor || m.b.sensor);
    m.stamp = stamp;
  }

  /* Precompute effective masses, position bias and the restitution target.
     Restitution reads the incoming velocity, so this must run for every
     manifold before any warm-start impulse is applied. */
  function prestepManifold(m) {
    const a = m.a, b = m.b, nx = m.nx, ny = m.ny, tx = m.tx, ty = m.ty;
    for (let k = 0; k < m.n; k++) {
      const p = m.pts[k];
      p.rax = p.x - a.x; p.ray = p.y - a.y; p.rbx = p.x - b.x; p.rby = p.y - b.y;
      // Body-local anchors so the position pass can re-evaluate the gap after moves.
      p.lax = p.rax * a.c + p.ray * a.s; p.lay = -p.rax * a.s + p.ray * a.c;
      p.lbx = p.rbx * b.c + p.rby * b.s; p.lby = -p.rbx * b.s + p.rby * b.c;
      const rnA = p.rax * ny - p.ray * nx, rnB = p.rbx * ny - p.rby * nx;
      const kN = a.invM + b.invM + a.invI * rnA * rnA + b.invI * rnB * rnB;
      p.mN = kN > 0 ? 1 / kN : 0;
      const rtA = p.rax * ty - p.ray * tx, rtB = p.rbx * ty - p.rby * tx;
      const kT = a.invM + b.invM + a.invI * rtA * rtA + b.invI * rtB * rtB;
      p.mT = kT > 0 ? 1 / kT : 0;
      p.bias = (BETA / H) * Math.max(0, p.d - SLOP);
      // Restitution: remember the approach speed before the solve.
      const dvx = (b.vx - b.av * p.rby) - (a.vx - a.av * p.ray);
      const dvy = (b.vy + b.av * p.rbx) - (a.vy + a.av * p.rax);
      const vn = dvx * nx + dvy * ny;
      p.velBias = vn < -REST_VEL ? -m.restitution * vn : 0;
    }
    // Two points on one manifold are solved together (Box2D's block solver):
    // solving them one after the other converges poorly and makes boxes rock.
    m.block = false;
    if (m.n === 2) {
      const p1 = m.pts[0], p2 = m.pts[1];
      const rn1A = p1.rax * ny - p1.ray * nx, rn1B = p1.rbx * ny - p1.rby * nx;
      const rn2A = p2.rax * ny - p2.ray * nx, rn2B = p2.rbx * ny - p2.rby * nx;
      const k11 = a.invM + b.invM + a.invI * rn1A * rn1A + b.invI * rn1B * rn1B;
      const k22 = a.invM + b.invM + a.invI * rn2A * rn2A + b.invI * rn2B * rn2B;
      const k12 = a.invM + b.invM + a.invI * rn1A * rn2A + b.invI * rn1B * rn2B;
      const det = k11 * k22 - k12 * k12;
      if (k11 * k22 < 1000 * det && det > 0) {
        m.block = true; m.k11 = k11; m.k12 = k12; m.k22 = k22;
        m.nm11 = k22 / det; m.nm12 = -k12 / det; m.nm22 = k11 / det;
      }
    }
  }

  /* Re-applies last substep's accumulated impulses (warm start). */
  function warmStartManifold(m) {
    const a = m.a, b = m.b, nx = m.nx, ny = m.ny, tx = m.tx, ty = m.ty;
    for (let k = 0; k < m.n; k++) {
      const p = m.pts[k];
      const Px = p.Pn * nx + p.Pt * tx, Py = p.Pn * ny + p.Pt * ty;
      a.vx -= a.invM * Px; a.vy -= a.invM * Py; a.av -= a.invI * (p.rax * Py - p.ray * Px);
      b.vx += b.invM * Px; b.vy += b.invM * Py; b.av += b.invI * (p.rbx * Py - p.rby * Px);
    }
  }

  /* Applies normal impulses d1/d2 (already deltas) at the two manifold points. */
  function applyPair(m, d1, d2) {
    const a = m.a, b = m.b, nx = m.nx, ny = m.ny, p1 = m.pts[0], p2 = m.pts[1];
    const P1x = d1 * nx, P1y = d1 * ny, P2x = d2 * nx, P2y = d2 * ny;
    a.vx -= a.invM * (P1x + P2x); a.vy -= a.invM * (P1y + P2y);
    a.av -= a.invI * (p1.rax * P1y - p1.ray * P1x + p2.rax * P2y - p2.ray * P2x);
    b.vx += b.invM * (P1x + P2x); b.vy += b.invM * (P1y + P2y);
    b.av += b.invI * (p1.rbx * P1y - p1.rby * P1x + p2.rbx * P2y - p2.rby * P2x);
  }

  function solveManifold(m) {
    const a = m.a, b = m.b, nx = m.nx, ny = m.ny, tx = m.tx, ty = m.ty, mu = m.friction;
    // Friction first (Box2D order), clamped to the Coulomb cone of the last normal impulse.
    for (let k = 0; k < m.n; k++) {
      const p = m.pts[k];
      const dvx = (b.vx - b.av * p.rby) - (a.vx - a.av * p.ray);
      const dvy = (b.vy + b.av * p.rbx) - (a.vy + a.av * p.rax);
      const vt = dvx * tx + dvy * ty;
      let dPt = p.mT * -vt;
      const maxPt = mu * p.Pn, Pt0 = p.Pt;
      p.Pt = clamp(Pt0 + dPt, -maxPt, maxPt);
      dPt = p.Pt - Pt0;
      const Px = dPt * tx, Py = dPt * ty;
      a.vx -= a.invM * Px; a.vy -= a.invM * Py; a.av -= a.invI * (p.rax * Py - p.ray * Px);
      b.vx += b.invM * Px; b.vy += b.invM * Py; b.av += b.invI * (p.rbx * Py - p.rby * Px);
    }
    if (!m.block) {
      for (let k = 0; k < m.n; k++) {
        const p = m.pts[k];
        const dvx = (b.vx - b.av * p.rby) - (a.vx - a.av * p.ray);
        const dvy = (b.vy + b.av * p.rbx) - (a.vy + a.av * p.rax);
        const vn = dvx * nx + dvy * ny;
        let dPn = p.mN * (p.bias + p.velBias - vn);
        const Pn0 = p.Pn;
        p.Pn = Math.max(Pn0 + dPn, 0);
        dPn = p.Pn - Pn0;
        const Px = dPn * nx, Py = dPn * ny;
        a.vx -= a.invM * Px; a.vy -= a.invM * Py; a.av -= a.invI * (p.rax * Py - p.ray * Px);
        b.vx += b.invM * Px; b.vy += b.invM * Py; b.av += b.invI * (p.rbx * Py - p.rby * Px);
      }
      return;
    }
    // Block solve: find x >= 0 with vn = K x + b >= 0 and x_i * vn_i = 0.
    const p1 = m.pts[0], p2 = m.pts[1];
    const a1 = p1.Pn, a2 = p2.Pn;
    const dv1x = (b.vx - b.av * p1.rby) - (a.vx - a.av * p1.ray);
    const dv1y = (b.vy + b.av * p1.rbx) - (a.vy + a.av * p1.rax);
    const dv2x = (b.vx - b.av * p2.rby) - (a.vx - a.av * p2.ray);
    const dv2y = (b.vy + b.av * p2.rbx) - (a.vy + a.av * p2.rax);
    const vn1 = dv1x * nx + dv1y * ny, vn2 = dv2x * nx + dv2y * ny;
    const b1 = vn1 - p1.velBias - p1.bias - (m.k11 * a1 + m.k12 * a2);
    const b2 = vn2 - p2.velBias - p2.bias - (m.k12 * a1 + m.k22 * a2);
    let x1 = -(m.nm11 * b1 + m.nm12 * b2), x2 = -(m.nm12 * b1 + m.nm22 * b2);
    if (x1 >= 0 && x2 >= 0) { /* both active */ }
    else {
      x1 = -b1 / m.k11; x2 = 0;
      if (!(x1 >= 0 && m.k12 * x1 + b2 >= 0)) {
        x1 = 0; x2 = -b2 / m.k22;
        if (!(x2 >= 0 && m.k12 * x2 + b1 >= 0)) {
          x1 = 0; x2 = 0;
          if (!(b1 >= 0 && b2 >= 0)) return;   // no consistent solution this pass; keep going
        }
      }
    }
    applyPair(m, x1 - a1, x2 - a2);
    p1.Pn = x1; p2.Pn = x2;
  }

  /* Split-impulse position pass: pushes bodies apart along the manifold
     normal without touching velocities, so resting stacks do not jitter. */
  function solvePositions(m) {
    const a = m.a, b = m.b, nx = m.nx, ny = m.ny;
    for (let k = 0; k < m.n; k++) {
      const p = m.pts[k];
      const rax = p.lax * a.c - p.lay * a.s, ray = p.lax * a.s + p.lay * a.c;
      const rbx = p.lbx * b.c - p.lby * b.s, rby = p.lbx * b.s + p.lby * b.c;
      const sep = -p.d + ((b.x + rbx) - (a.x + rax)) * nx + ((b.y + rby) - (a.y + ray)) * ny;
      // Walls get corrected harder: a light body crushed against a static
      // wall by a heavy one must not sink into it.
      const beta = (a.invM === 0 || b.invM === 0) ? POS_BETA * 1.6 : POS_BETA;
      const C = clamp(beta * (sep + SLOP), -POS_MAX, 0);
      if (C >= 0) continue;
      const rnA = rax * ny - ray * nx, rnB = rbx * ny - rby * nx;
      const K = a.invM + b.invM + a.invI * rnA * rnA + b.invI * rnB * rnB;
      if (K <= 0) continue;
      const imp = -C / K, Px = imp * nx, Py = imp * ny;
      if (a.invM > 0) {
        a.x -= a.invM * Px; a.y -= a.invM * Py; a.a -= a.invI * (rax * Py - ray * Px);
        a.c = Math.cos(a.a); a.s = Math.sin(a.a);
      }
      if (b.invM > 0) {
        b.x += b.invM * Px; b.y += b.invM * Py; b.a += b.invI * (rbx * Py - rby * Px);
        b.c = Math.cos(b.a); b.s = Math.sin(b.a);
      }
    }
  }

  // ---- revolute joint ----------------------------------------------------
  /* Pins bodyB to bodyA at a world anchor.  Limits and motor act on the
     relative angle bodyB.a - bodyA.a - (initial difference). */
  function revolute(bodyA, bodyB, anchor, o) {
    o = o || {};
    const J = {
      kind: 'revolute', a: bodyA, b: bodyB,
      la: { x: 0, y: 0 }, lb: { x: 0, y: 0 },  // local anchors
      ref: bodyB.a - bodyA.a,
      lower: o.lower == null ? -PI : o.lower, upper: o.upper == null ? PI : o.upper,
      enableLimit: !!o.enableLimit,
      motorSpeed: o.motorSpeed || 0, maxTorque: o.maxTorque || 0, enableMotor: !!o.enableMotor,
      // solver state
      rax: 0, ray: 0, rbx: 0, rby: 0, m11: 0, m12: 0, m22: 0, biasX: 0, biasY: 0, mA: 0,
      Px: 0, Py: 0, Pm: 0, Plo: 0, Phi: 0, world: null,
      setMotor(speed, maxTorque) { J.motorSpeed = speed; J.maxTorque = maxTorque; J.enableMotor = maxTorque > 0; },
      setLimits(lower, upper) { J.lower = lower; J.upper = upper; J.enableLimit = true; },
      angle() { return J.b.a - J.a.a - J.ref; },
    };
    // World anchor -> local frames.
    const ax = anchor.x - bodyA.x, ay = anchor.y - bodyA.y;
    J.la.x = ax * bodyA.c + ay * bodyA.s; J.la.y = -ax * bodyA.s + ay * bodyA.c;
    const bx = anchor.x - bodyB.x, by = anchor.y - bodyB.y;
    J.lb.x = bx * bodyB.c + by * bodyB.s; J.lb.y = -bx * bodyB.s + by * bodyB.c;
    return J;
  }

  function prestepJoint(J) {
    const a = J.a, b = J.b;
    J.rax = J.la.x * a.c - J.la.y * a.s; J.ray = J.la.x * a.s + J.la.y * a.c;
    J.rbx = J.lb.x * b.c - J.lb.y * b.s; J.rby = J.lb.x * b.s + J.lb.y * b.c;
    const k11 = a.invM + b.invM + a.invI * J.ray * J.ray + b.invI * J.rby * J.rby;
    const k12 = -a.invI * J.rax * J.ray - b.invI * J.rbx * J.rby;
    const k22 = a.invM + b.invM + a.invI * J.rax * J.rax + b.invI * J.rbx * J.rbx;
    const det = k11 * k22 - k12 * k12;
    if (Math.abs(det) > 1e-18) { J.m11 = k22 / det; J.m12 = -k12 / det; J.m22 = k11 / det; }
    else { J.m11 = J.m12 = J.m22 = 0; }
    const ex = (b.x + J.rbx) - (a.x + J.rax), ey = (b.y + J.rby) - (a.y + J.ray);
    J.biasX = -(JOINT_BETA / H) * ex; J.biasY = -(JOINT_BETA / H) * ey;
    const kA = a.invI + b.invI;
    J.mA = kA > 0 ? 1 / kA : 0;
    // Warm start.
    const Px = J.Px, Py = J.Py, ang = J.Pm + J.Plo - J.Phi;
    a.vx -= a.invM * Px; a.vy -= a.invM * Py; a.av -= a.invI * (J.rax * Py - J.ray * Px + ang);
    b.vx += b.invM * Px; b.vy += b.invM * Py; b.av += b.invI * (J.rbx * Py - J.rby * Px + ang);
  }

  function solveJoint(J) {
    const a = J.a, b = J.b;
    // Motor: drive the relative angular velocity, torque-limited.
    if (J.enableMotor) {
      const cdot = b.av - a.av - J.motorSpeed;
      let imp = -J.mA * cdot;
      const old = J.Pm, cap = J.maxTorque * H;
      J.Pm = clamp(old + imp, -cap, cap);
      imp = J.Pm - old;
      a.av -= a.invI * imp; b.av += b.invI * imp;
    }
    // Limits: one-sided angular constraints with a little position correction.
    // A zero-range limit (lower == upper) is a weld: solved as an equality.
    if (J.enableLimit && J.lower === J.upper) {
      const C = J.angle() - J.lower;
      const cdot = b.av - a.av;
      const imp = -J.mA * (cdot + (JOINT_BETA / H) * C);
      J.Plo += imp;
      a.av -= a.invI * imp; b.av += b.invI * imp;
    } else if (J.enableLimit) {
      const ang = J.angle();
      if (ang <= J.lower) {
        const C = ang - J.lower;
        const cdot = b.av - a.av;
        let imp = -J.mA * (cdot + (JOINT_BETA / H) * Math.min(C + 0.005, 0));
        const old = J.Plo;
        J.Plo = Math.max(old + imp, 0);
        imp = J.Plo - old;
        a.av -= a.invI * imp; b.av += b.invI * imp;
      } else J.Plo = 0;
      if (ang >= J.upper) {
        const C = J.upper - ang;
        const cdot = -(b.av - a.av);
        let imp = -J.mA * (cdot + (JOINT_BETA / H) * Math.min(C + 0.005, 0));
        const old = J.Phi;
        J.Phi = Math.max(old + imp, 0);
        imp = J.Phi - old;
        a.av += a.invI * imp; b.av -= b.invI * imp;
      } else J.Phi = 0;
    }
    // Point constraint.
    const dvx = (b.vx - b.av * J.rby) - (a.vx - a.av * J.ray) - J.biasX;
    const dvy = (b.vy + b.av * J.rbx) - (a.vy + a.av * J.rax) - J.biasY;
    const Px = -(J.m11 * dvx + J.m12 * dvy), Py = -(J.m12 * dvx + J.m22 * dvy);
    J.Px += Px; J.Py += Py;
    a.vx -= a.invM * Px; a.vy -= a.invM * Py; a.av -= a.invI * (J.rax * Py - J.ray * Px);
    b.vx += b.invM * Px; b.vy += b.invM * Py; b.av += b.invI * (J.rbx * Py - J.rby * Px);
  }

  // ---- world -------------------------------------------------------------
  function world(o) {
    o = o || {};
    const W = {
      gravity: { x: o.gravity ? o.gravity.x : 0, y: o.gravity ? o.gravity.y : 1400 },
      w: o.w || 480, h: o.h || 390,
      bodies: [], joints: [], hooks: [],
      time: 0, acc: 0, stamp: 0, steps: 0,
      manifolds: new Map(), mlist: [],
      order: [],
      add, remove, step, contactsOf, queryAABB, setGravity, energy, addHook, removeHook, sync: syncBody,
    };

    function pairKey(a, b) { return a.id < b.id ? a.id * 1048576 + b.id : b.id * 1048576 + a.id; }

    function add(x) {
      if (x.kind === 'revolute') {
        if (W.joints.indexOf(x) < 0) W.joints.push(x);
        x.world = W;
        x.a.noCollide.push(x.b); x.b.noCollide.push(x.a);
      } else {
        if (W.bodies.indexOf(x) < 0) { W.bodies.push(x); W.order.push(x); }
        x.world = W;
        syncBody(x);
      }
      return x;
    }

    function remove(x) {
      if (x.kind === 'revolute') {
        const i = W.joints.indexOf(x); if (i >= 0) W.joints.splice(i, 1);
        const ia = x.a.noCollide.indexOf(x.b); if (ia >= 0) x.a.noCollide.splice(ia, 1);
        const ib = x.b.noCollide.indexOf(x.a); if (ib >= 0) x.b.noCollide.splice(ib, 1);
        x.world = null;
        return;
      }
      const i = W.bodies.indexOf(x); if (i >= 0) W.bodies.splice(i, 1);
      const j = W.order.indexOf(x); if (j >= 0) W.order.splice(j, 1);
      for (let k = W.joints.length - 1; k >= 0; k--) {
        if (W.joints[k].a === x || W.joints[k].b === x) remove(W.joints[k]);
      }
      for (const [key, m] of W.manifolds) if (m.a === x || m.b === x) W.manifolds.delete(key);
      x.world = null;
    }

    function setGravity(x, y) { W.gravity.x = x; W.gravity.y = y; }

    function addHook(fn) { if (W.hooks.indexOf(fn) < 0) W.hooks.push(fn); }
    function removeHook(fn) { const i = W.hooks.indexOf(fn); if (i >= 0) W.hooks.splice(i, 1); }

    /* Sum of kinetic energy (linear + angular) of the dynamic bodies. */
    function energy() {
      let e = 0;
      for (const b of W.bodies) if (b.type === 'dynamic') e += 0.5 * b.m * (b.vx * b.vx + b.vy * b.vy) + 0.5 * b.I * b.av * b.av;
      return e;
    }

    function queryAABB(x0, y0, x1, y1) {
      const out = [];
      for (const b of W.bodies) {
        const bx = b.box;
        if (bx.x1 >= x0 && bx.x0 <= x1 && bx.y1 >= y0 && bx.y0 <= y1) out.push(b);
      }
      return out;
    }

    /* Contacts touching b from the last substep; normal points from b to other. */
    function contactsOf(b) {
      const out = [];
      for (const m of W.manifolds.values()) {
        if (m.stamp !== W.stamp || m.n === 0) continue;
        if (m.a !== b && m.b !== b) continue;
        const flip = m.b === b;
        const other = flip ? m.a : m.b;
        const nx = flip ? -m.nx : m.nx, ny = flip ? -m.ny : m.ny;
        for (let k = 0; k < m.n; k++) {
          const p = m.pts[k];
          out.push({ other, nx, ny, px: p.x, py: p.y, depth: p.d });
        }
      }
      return out;
    }

    /* Group/mask filter plus the "never both immovable" and joint rules. */
    function shouldCollide(a, b) {
      if (a.invM === 0 && b.invM === 0 && !(a.sensor || b.sensor)) {
        // Kinematic vs dynamic goes through invM; two immovables never collide.
        return false;
      }
      if (a.type !== 'dynamic' && b.type !== 'dynamic') return false;
      if (a.mask && a.mask.indexOf(b.group) < 0) return false;
      if (b.mask && b.mask.indexOf(a.group) < 0) return false;
      if (a.noCollide.length && a.noCollide.indexOf(b) >= 0) return false;
      return true;
    }

    /* Sort-and-sweep on AABB x, then narrowphase into persistent manifolds. */
    function collideAll() {
      const ord = W.order;
      // Insertion sort by x0: near-sorted from the previous substep.
      for (let i = 1; i < ord.length; i++) {
        const bi = ord[i]; const x = bi.box.x0; let j = i - 1;
        while (j >= 0 && ord[j].box.x0 > x) { ord[j + 1] = ord[j]; j--; }
        ord[j + 1] = bi;
      }
      W.stamp++;
      const stamp = W.stamp;
      for (let i = 0; i < ord.length; i++) {
        const A = ord[i], ab = A.box;
        for (let j = i + 1; j < ord.length; j++) {
          const B = ord[j], bb = B.box;
          if (bb.x0 > ab.x1) break;
          if (bb.y0 > ab.y1 || bb.y1 < ab.y0) continue;
          if (!shouldCollide(A, B)) continue;
          // Canonical order (lower id first) keeps manifold ids stable across sort swaps.
          const P = A.id < B.id ? A : B, Q = A.id < B.id ? B : A;
          if (!collide(P, Q)) continue;
          const key = pairKey(P, Q);
          let m = W.manifolds.get(key);
          if (!m) { m = newManifold(P, Q); W.manifolds.set(key, m); }
          updateManifold(m, stamp);
        }
      }
      // Drop manifolds that did not survive this substep.
      const ml = W.mlist; ml.length = 0;
      for (const [key, m] of W.manifolds) {
        if (m.stamp !== stamp) W.manifolds.delete(key);
        else if (m.solve) ml.push(m);
      }
    }

    function substep() {
      const g = W.gravity, bodies = W.bodies;
      for (let i = 0; i < W.hooks.length; i++) W.hooks[i](H, W);
      // Integrate velocities.
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.type === 'dynamic') {
          b.vx += g.x * H; b.vy += g.y * H;
          const spd = Math.hypot(b.vx, b.vy);
          let slow = spd < SLOW_V ? SLOW_DAMP * (1 - spd / SLOW_V) : 0;
          if (spd < ROLL_V && b.shape.kind === 'circle') slow += ROLL_DAMP * (1 - spd / ROLL_V);
          const ld = 1 / (1 + (LIN_DAMP + slow) * H), ad = 1 / (1 + (ANG_DAMP + slow) * H);
          b.vx *= ld; b.vy *= ld; b.av *= ad;
        }
        if (b.type !== 'static') {
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > MAX_V) { b.vx *= MAX_V / sp; b.vy *= MAX_V / sp; }
          if (b.av > MAX_AV) b.av = MAX_AV; else if (b.av < -MAX_AV) b.av = -MAX_AV;
          syncBody(b);
        }
      }
      collideAll();
      const ml = W.mlist, joints = W.joints;
      for (let i = 0; i < ml.length; i++) prestepManifold(ml[i]);
      for (let i = 0; i < joints.length; i++) prestepJoint(joints[i]);
      for (let i = 0; i < ml.length; i++) warmStartManifold(ml[i]);
      // Alternate the sweep direction so impulses propagate both ways through
      // a stack instead of one contact per iteration.
      for (let it = 0; it < ITER; it++) {
        for (let i = 0; i < joints.length; i++) solveJoint(joints[i]);
        if (it & 1) for (let i = ml.length - 1; i >= 0; i--) solveManifold(ml[i]);
        else for (let i = 0; i < ml.length; i++) solveManifold(ml[i]);
      }
      // Integrate positions, then resolve leftover penetration positionally.
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        if (b.type === 'static') continue;
        b.x += b.vx * H; b.y += b.vy * H; b.a += b.av * H;
        b.c = Math.cos(b.a); b.s = Math.sin(b.a);
      }
      for (let it = 0; it < POS_ITER; it++) for (let i = 0; i < ml.length; i++) solvePositions(ml[i]);
      W.time += H; W.steps++;
    }

    /* Fixed-step accumulator: runs whole substeps, at most MAX_SUB per call. */
    function step(dt) {
      if (!(dt > 0)) return;
      W.acc += Math.min(dt, MAX_SUB * H);
      let n = 0;
      while (W.acc >= H - 1e-9 && n < MAX_SUB) { substep(); W.acc -= H; n++; }
      if (W.acc < 1e-9) W.acc = 0;
      if (W.acc > H) W.acc = H;
      // Leave transforms fresh for queries and rendering.
      for (let i = 0; i < W.bodies.length; i++) if (W.bodies[i].type !== 'static') syncBody(W.bodies[i]);
    }

    return W;
  }

  // ---- cabinet -----------------------------------------------------------
  /* Static walls around the interior [0,w]x[0,h] plus the chute divider. */
  function cabinet(W, o) {
    o = o || {};
    const w = o.w || 480, h = o.h || 390, chuteW = o.chuteW || 64;
    const dividerH = o.dividerH == null ? 0.6 : o.dividerH, T = o.wallThick || 40;
    const chuteX = w - chuteW, divT = 8, dividerTop = h - dividerH * h;
    const mk = (bw, bh, x, y, name) => W.add(body({
      type: 'static', shape: { kind: 'poly', verts: box(bw, bh) }, x, y,
      friction: 0.6, restitution: 0.05, group: 'wall', data: { wall: name },
    }));
    const bodies = [
      mk(w + 2 * T, T, w / 2, h + T / 2, 'floor'),
      mk(w + 2 * T, T, w / 2, -T / 2, 'ceiling'),
      mk(T, h + 2 * T, -T / 2, h / 2, 'left'),
      mk(T, h + 2 * T, w + T / 2, h / 2, 'right'),
    ];
    // Divider: a thin wall whose top slopes down into the chute, so an item
    // clipping it slides into the chute rather than balancing on it.
    const dh = dividerH * h, hw = divT / 2, lip = 6;
    bodies.push(W.add(body({
      type: 'static', group: 'wall', friction: 0.3, restitution: 0.05, data: { wall: 'divider' },
      x: chuteX - hw, y: dividerTop,
      shape: { kind: 'poly', verts: [{ x: -hw, y: 0 }, { x: hw, y: lip }, { x: hw, y: dh }, { x: -hw, y: dh }] },
    })));
    // Optional bowl: two sloped wedges on the floor so the pile heaps up in the
    // middle instead of spreading into one jammed row the claw cannot dig into.
    const slopeW = o.slopeW || 0, slopeH = o.slopeH || 0;
    if (slopeW > 0 && slopeH > 0) {
      const wedge = (verts, name) => W.add(body({
        type: 'static', group: 'wall', friction: 0.35, restitution: 0.05, data: { wall: name },
        x: 0, y: 0, shape: { kind: 'poly', verts },
      }));
      bodies.push(wedge([{ x: 0, y: h - slopeH }, { x: slopeW, y: h }, { x: 0, y: h }], 'slopeL'));
      const r = chuteX - divT;
      bodies.push(wedge([{ x: r - slopeW, y: h }, { x: r, y: h - slopeH }, { x: r, y: h }], 'slopeR'));
    }
    const C = {
      bodies,
      bounds: { w, h, chuteX, chuteW, dividerTop, floorY: h, slopeW, slopeH },
      inChute(b) { return b.x > chuteX && b.x < w && b.y > dividerTop; },
    };
    return C;
  }

  // ---- claw rig ----------------------------------------------------------
  const RIG = {
    carSpeed: 260, dropSpeed: 520, liftSpeed: 300,
    liftAccel: 700,            // px/s^2: a 1 g jerk would double an item's weight at the lift start
    carAccel: 520,             // px/s^2 (0.37 g), also what shakes the palm
    brake: 1.15,               // >1: the carriage overshoots its target a touch
    swayZeta: 0.45,            // pendulum damping ratio
    swayShortDamp: 0.6,        // extra damping ratio when the cable is short (guided head)
    swayMax: 0.4,              // cap on the cable angle (rad)
    tiltMul: 0.6,              // palm tilt = sway * tiltMul
    minCable: 24,              // palm centre below the rail when fully lifted
    palmH: 14,
    pivot: 22,                 // hinge offset from the palm centre (x width)
    prongLen: 46,              // at width 1; grows sublinearly (see geometry()) so wide claws keep leverage
    prongLenWidth: 0.45,       // fraction of the length that scales with width
    prongLen3: 26,             // the keeper prong is short: it pins the item into the V from above
    tipHalf: 2,                // prong tip half width
    hookFrac: 0.36,            // fraction of the prong length that is the bent tip segment
    hookAngle: 0.37,           // rad: the tip segment bends inward by this much; equal to the closed
                               // angle at width 1 so the tip is vertical when closed and the sweep stays level
    openSpan: 74,              // tip to tip when open, times width
    closedGap: 1.5,            // tip to tip when closed
    jitter: 0.12,              // shared torque jitter while holding (fraction)
    jitterProng: 0.03,         // extra per-prong jitter
    open3: 0.85, closed3: 0.0,
    motorSpeed: 7,             // rad/s
    releaseSpeed: 3.5,         // rad/s while releasing: a slow open drops items straight down
    baseTorque: 2.4e8,         // times grip, closing
    openTorque: 4e7,           // opening torque, grip independent: enough to hold the prongs open, too weak to flip items
    releaseTorque: 1.2e7,      // while releasing: barely more than the prongs' own weight, so a held item's weight opens the loaded prong and it drops straight
    torque3: 0.04,             // keeper prong torque fraction (it rests on the item, it does not squeeze)
    pinch3: 1.0,               // side prong torque bonus with 3 prongs (the third finger is in the lock capacity)
    gripTorque0: 0.8, gripTorque1: 0.2,   // closing torque = base * (t0 + t1 * grip)
    prongFriction: 0.55, rubberFriction: 1.1,
    prongDensity: 1.2,
    quietAV: 0.3, quietT: 0.15, closeMax: 0.7, closeMin: 0.12,
    releaseT: 0.5,
    maxDrop: 2.5, maxLift: 3.5, maxCarry: 4, maxReturn: 4,
    magnetR: 80, magnetAcc: 6000,
    // Grip lock: a well-pinched item is welded to the palm with a breaking
    // force, so a solid pinch rides the lift and a heavy or badly held one slips.
    lockForce: 6e6,            // break force at grip 1 (about the weight of mass 4200)
    lockRubber: 1.45,          // rubber tips multiply the break force
    lock3: 1.3,                // third prong multiplies the break force
    lockPalmOnly: 0.8,         // one prong + palm pinch is this fraction as strong
    lockHoldMul: 0.12,         // prong torque while a lock carries the item
    lockGrace: 0.12,           // s after engaging before a lock can break
    lockWindow: 0.6,           // s into the lift during which newly pinched items still lock
    lockOmega: 60,             // spring stiffness (rad/s): weight sags the hold g/omega^2 px
    lockBreakDist: 16,         // px of sag that breaks the hold outright
    lockPeakMul: 8,            // instant force clamp, as a multiple of the grip
    lockTau: 0.06,             // s, time constant of the filtered load
    lockSpin: 30,              // per-second pull of the item's spin toward the palm's
    slowZone: 34,              // px above the pile where the drop slows down
    dig: 30,                   // px the claw keeps sinking after a prong first touches something
    floorClear: 2,             // closed prong tips stop this far above the floor
    edgeClear: 4,              // palm edge to wall clearance for the carriage travel
    slowMul: 0.45,
  };

  function clawRig(W, o) {
    o = o || {};
    const C = o.cabinet;
    const cw = C ? C.bounds.w : W.w, ch = C ? C.bounds.h : W.h;
    const cfg = {
      prongs: o.prongs === 3 ? 3 : 2, width: o.width == null ? 1 : o.width,
      grip: o.grip == null ? 1 : o.grip, speed: o.speed == null ? 1 : o.speed,
      rubber: o.rubber ? 1 : 0, magnet: o.magnet ? 1 : 0,
    };
    const rand = o.rand || (() => 0.5);
    /* Prong geometry for the current width: hinge offset, length and the
       open/closed outward angles that give the tip span and closed gap. */
    function geometry() {
      const wd = cfg.width;
      const piv = RIG.pivot * wd;
      const len = RIG.prongLen * (1 - RIG.prongLenWidth + RIG.prongLenWidth * wd);
      const lenT = len * RIG.hookFrac, lenU = len - lenT, beta = RIG.hookAngle;
      // Tip x offset from the hinge (outward positive) and tip depth at outward angle th.
      const tipX = (th) => lenU * Math.sin(th) + lenT * Math.sin(th - beta) + RIG.tipHalf * Math.cos(th - beta);
      const tipY = (th) => lenU * Math.cos(th) + lenT * Math.cos(th - beta);
      // Bisection: outward angle whose tip x equals target (tipX is monotonic here).
      const solve = (target) => {
        let lo = -1.2, hi = 1.2;
        for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (tipX(mid) < target) lo = mid; else hi = mid; }
        return (lo + hi) / 2;
      };
      const open = solve(RIG.openSpan * wd / 2 - piv);
      const closed = solve(RIG.closedGap / 2 - piv);
      let reach = 0;
      for (let th = closed; th <= open; th += 0.02) reach = Math.max(reach, tipY(th));
      return { piv, len, lenU, lenT, beta, len3: RIG.prongLen3 * wd, open, closed, reach, palmW: piv * 2 + 12 };
    }
    let geo = geometry();
    const railY = o.railY == null ? 26 : o.railY;
    const homeX = o.homeX == null ? cw * 0.5 : o.homeX;
    // Travel limit: the palm must clear the side walls (an open prong may
    // press against a wall; its motor is torque limited so that is harmless).
    const carLim = () => geo.palmW / 2 + RIG.edgeClear;
    const chuteX = clamp(o.chuteX == null ? (C ? C.bounds.chuteX + C.bounds.chuteW * 0.5 : cw - 32) : o.chuteX, carLim(), cw - carLim());

    const R = {
      phase: 'idle', x: homeX, y: railY + RIG.minCable, targetX: homeX,
      sway: 0, swayVel: 0, swayX: 0, cableLen: RIG.minCable,
      bodies: { carriage: null, palm: null, prongs: [], tips: [] },
      joints: [],
      cableTop: { x: homeX, y: railY },
      cfg, homeX, chuteX, railY,
      geo: null,   // {piv, len, lenU, lenT, beta, len3, open, closed, reach, palmW} for the current width (renderer + tests)
      setTarget, drop, update, held, open, setConfig, destroy, calm, locked, dbg: null,
    };
    // Internal motion state.
    let carX = homeX, carV = 0, carTarget = homeX;
    let phaseT = 0, quietT = 0, liftV = 0, forceOpen = false, carryCalm = 0, arrivedT = 0, digStart = -1;
    let closeState = 'open';   // what the motors are driving toward
    const heldScratch = new Map();

    // -- bodies --
    const carriage = W.add(body({
      type: 'kinematic', shape: { kind: 'poly', verts: box(46, 14) }, x: homeX, y: railY,
      friction: 0.3, restitution: 0, group: 'claw', mask: ['item'], data: { claw: 'carriage' },
    }));
    R.bodies.carriage = carriage;
    let palm = null;

    function prongVerts(len, w0, w1) {
      // Symmetric rod tapering from half width w0 to w1, hinge at the origin, tip at +y.
      return [{ x: -w0, y: 0 }, { x: w0, y: 0 }, { x: w0, y: 6 }, { x: w1, y: len }, { x: -w1, y: len }, { x: -w0, y: 6 }];
    }

    /* (Re)build the palm and prongs from cfg.  Keeps the palm position. */
    function build() {
      const px = palm ? palm.x : R.x, py = palm ? palm.y : R.y;
      if (palm) W.remove(palm);
      for (const j of R.joints) W.remove(j);
      for (const p of R.bodies.prongs) if (!p.ghost) W.remove(p);
      for (const p of R.bodies.tips) W.remove(p);
      R.joints.length = 0; R.bodies.prongs.length = 0;
      geo = geometry(); R.geo = geo;
      const wd = cfg.width, piv = geo.piv;
      palm = W.add(body({
        type: 'kinematic', shape: { kind: 'poly', verts: box(geo.palmW, RIG.palmH) }, x: px, y: py,
        friction: 0.4, restitution: 0, group: 'claw', mask: ['item', 'wall'], data: { claw: 'palm' },
      }));
      R.bodies.palm = palm;
      const fr = cfg.rubber ? RIG.rubberFriction : RIG.prongFriction;
      const specs = [
        { ox: -piv, dir: 1, len: geo.len, open: geo.open, closed: geo.closed, tq: 1, name: 'left' },
        { ox: piv, dir: -1, len: geo.len, open: geo.open, closed: geo.closed, tq: 1, name: 'right' },
      ];
      if (cfg.prongs === 3) {
        // Keeper prong: hinged at the palm centre, swings down to vertical and
        // presses a held item into the V of the side prongs (a 2D stand-in for
        // the third finger of a real claw).
        specs.push({ ox: 0, dir: -1, len: geo.len3, open: RIG.open3, closed: RIG.closed3, tq: RIG.torque3, name: 'mid', isMid: true });
      }
      R.bodies.tips.length = 0;
      R.mid = null;
      for (const s of specs) {
        const upperLen = s.isMid ? s.len : geo.lenU;
        if (s.isMid) {
          // The third prong is a ghost: drawn behind the others, following the
          // side prongs' closedness, never simulated. Its share of the pinch is
          // modelled by the torque bonus and the lock capacity instead, because
          // an off-axis physical third finger shoved items out in every geometry tried.
          const gb = body({
            type: 'kinematic', shape: { kind: 'poly', verts: prongVerts(upperLen, 5, 2) },
            x: px + s.ox, y: py, angle: s.dir * s.open, group: 'claw', mask: [],
            data: { claw: 'prong', prong: s.name, dir: s.dir, seg: 'upper', ghost: true },
          });
          gb.ghost = true;
          R.bodies.prongs.push(gb);
          R.mid = { b: gb, open: s.open, closed: s.closed, dir: s.dir };
          continue;
        }
        const b = W.add(body({
          type: 'dynamic', shape: { kind: 'poly', verts: prongVerts(upperLen, 5, s.isMid ? 2 : 4) },
          x: px + s.ox, y: py, angle: s.dir * s.open,
          density: RIG.prongDensity, friction: fr, restitution: 0,
          group: 'claw', mask: ['item', 'wall'], data: { claw: 'prong', prong: s.name, dir: s.dir, seg: 'upper' },
        }));
        // Positive body angle swings the tip toward -x, so the outward angle
        // of a prong is dir * bodyAngle and the limit order flips with dir.
        const lo = Math.min(s.dir * s.open, s.dir * s.closed), hi = Math.max(s.dir * s.open, s.dir * s.closed);
        const j = revolute(palm, b, { x: px + s.ox, y: py }, { lower: lo, upper: hi, enableLimit: true, enableMotor: true, maxTorque: 1 });
        j.ref = 0;                     // angle() == body angle (palm angle is subtracted live)
        j.dir = s.dir; j.tq = s.tq; j.isMid = s.isMid;
        W.add(j);
        R.joints.push(j);
        R.bodies.prongs.push(b);
        if (s.isMid) continue;
        // Bent tip segment, welded at the knee (a revolute with a zero range).
        const ka = s.dir * s.open;                       // upper body angle
        const kx = px + s.ox - upperLen * Math.sin(ka), ky = py + upperLen * Math.cos(ka);
        const ta = ka - s.dir * geo.beta;                // bends inward (positive angle swings a tip toward -x)
        const tb = W.add(body({
          type: 'dynamic', shape: { kind: 'poly', verts: prongVerts(geo.lenT, 4, RIG.tipHalf) },
          x: kx, y: ky, angle: ta,
          density: RIG.prongDensity, friction: fr, restitution: 0,
          group: 'claw', mask: ['item', 'wall'], data: { claw: 'prong', prong: s.name, dir: s.dir, seg: 'tip' },
        }));
        const weld = revolute(b, tb, { x: kx, y: ky }, { lower: 0, upper: 0, enableLimit: true });
        weld.isWeld = true;
        W.add(weld);
        R.joints.push(weld);
        R.bodies.tips.push(tb);
      }
      applyMotors();
    }

    /* Point the motors at open or closed.  jitter: true draws a fresh +-12%
       torque factor per prong (called per substep while holding). */
    function applyMotors(jitter) {
      const opening = closeState === 'open' || forceOpen;
      const toward = opening ? 1 : -1;
      // Closing torque barely depends on grip: it only has to close the prongs
      // around the item (more squeeze just pops it out like a seed). Grip is
      // the lock's break force, where it belongs.
      let tq = opening ? (R.phase === 'releasing' ? RIG.releaseTorque : RIG.openTorque) : RIG.baseTorque * (RIG.gripTorque0 + RIG.gripTorque1 * cfg.grip) * (cfg.prongs === 3 ? RIG.pinch3 : 1);
      // While a grip lock carries the item the prongs only need to stay
      // closed on it: full closing torque would squeeze it out like a seed.
      if (!opening && typeof locks !== 'undefined' && locks.length) tq *= RIG.lockHoldMul;
      const holding = !opening && typeof locks !== 'undefined' && locks.length > 0;
      // A holding prong brakes at its current angle instead of driving closed.
      const speed = holding ? 0 : (R.phase === 'releasing' ? RIG.releaseSpeed : RIG.motorSpeed);
      // Jitter: +-12% shared by all prongs (the motor), plus +-3% per prong.
      const common = jitter ? 1 + (rand() * 2 - 1) * RIG.jitter : 1;
      for (const j of R.joints) {
        if (j.isWeld) continue;
        const jit = jitter ? common + (rand() * 2 - 1) * RIG.jitterProng : 1;
        // Opening rotates the body toward dir * openAngle.
        j.setMotor(j.dir * toward * speed, tq * (opening ? 1 : j.tq) * jit);
      }
    }

    /* Per-substep: torque jitter while holding, magnet pull while grabbing. */
    function hook(h) {
      if (closeState === 'closed' && (R.phase === 'lifting' || R.phase === 'carrying')) {
        applyMotors(true);
        // The prongs keep settling into the pinch during the first part of the
        // lift, so items that become held then are locked too.
        if (R.phase === 'lifting' && phaseT < RIG.lockWindow) engageLocks(true);
        // Grace: the pinch impulses need a few substeps to relax after the torque drops.
        if (locks.length) checkLocks(h, 1 + (rand() * 2 - 1) * RIG.jitter);
      }
      if (cfg.magnet && (R.phase === 'dropping' || R.phase === 'closing')) {
        const r = RIG.magnetR * cfg.width, r2 = r * r;
        for (const b of W.bodies) {
          if (b.type !== 'dynamic' || b.group === 'claw' || !b.data || !b.data.tags || b.data.tags.indexOf('metal') < 0) continue;
          const dx = palm.x - b.x, dy = palm.y + 20 - b.y, d2 = dx * dx + dy * dy;
          if (d2 > r2 || d2 < 1) continue;
          const d = Math.sqrt(d2), f = RIG.magnetAcc * (1 - d / r) * h;
          b.vx += dx / d * f; b.vy += dy / d * f;
        }
      }
    }
    W.addHook(hook);

    /* True when b touches any body that passes pred. */
    function touching(b, pred) {
      for (const m of W.manifolds.values()) {
        if (m.stamp !== W.stamp || m.n === 0) continue;
        if (m.a === b) { if (pred(m.b)) return true; }
        else if (m.b === b) { if (pred(m.a)) return true; }
      }
      return false;
    }
    const notClaw = (b) => b.group !== 'claw';
    // A prong brushing a side wall on the way down is not a landing.
    const landing = (b) => b.group !== 'claw' && !(b.group === 'wall' && b.data && (b.data.wall === 'left' || b.data.wall === 'right' || b.data.wall === 'ceiling'));

    /* Highest item top under the palm footprint, for the soft-landing slowdown. */
    function pileTopBelow() {
      const half = geo.palmW / 2 + 40;
      let top = ch;
      for (const b of W.bodies) {
        if (b.type !== 'dynamic' || b.group === 'claw') continue;
        const bx = b.box;
        if (bx.x1 < palm.x - half || bx.x0 > palm.x + half) continue;
        if (bx.y0 > palm.y && bx.y0 < top) top = bx.y0;
      }
      return top;
    }

    // -- public API --
    /* True while idle with the carriage stopped and the cable hanging still. */
    function calm() {
      return R.phase === 'idle' && Math.abs(carX - R.targetX) < 1 && Math.abs(carV) < 1 && Math.abs(R.swayX) < 1.5 && Math.abs(R.swayVel) < 6;
    }
    function setTarget(x) {
      if (R.phase !== 'idle' && R.phase !== 'moving') return false;
      const lim = carLim();
      R.targetX = clamp(x, lim, cw - lim);
      return true;
    }
    function drop() {
      if (R.phase !== 'idle' && R.phase !== 'moving') return false;
      forceOpen = false;
      setPhase('dropping');
      return true;
    }
    function open() { forceOpen = true; closeState = 'open'; releaseLocks(); applyMotors(); }
    function setConfig(c) {
      c = c || {};
      let rebuild = false;
      for (const k of ['width', 'prongs', 'rubber']) {
        if (c[k] != null) {
          const v = k === 'prongs' ? (c[k] === 3 ? 3 : 2) : (k === 'rubber' ? (c[k] ? 1 : 0) : c[k]);
          if (v !== cfg[k]) { cfg[k] = v; rebuild = true; }
        }
      }
      if (c.grip != null) cfg.grip = c.grip;
      if (c.speed != null) cfg.speed = c.speed;
      if (c.magnet != null) cfg.magnet = c.magnet ? 1 : 0;
      if (rebuild) build(); else applyMotors();
    }
    function destroy() {
      releaseLocks();
      W.removeHook(hook);
      for (const j of R.joints) W.remove(j);
      for (const p of R.bodies.prongs) if (!p.ghost) W.remove(p);
      for (const p of R.bodies.tips) W.remove(p);
      if (palm) W.remove(palm);
      W.remove(carriage);
    }

    /* Bodies pinched by >= 2 prongs, or by 1 prong + the palm. */
    function held() {
      heldScratch.clear();
      for (const m of W.manifolds.values()) {
        if (m.stamp !== W.stamp || m.n === 0) continue;
        let claw = null, other = null;
        if (m.a.group === 'claw' && m.b.group !== 'claw') { claw = m.a; other = m.b; }
        else if (m.b.group === 'claw' && m.a.group !== 'claw') { claw = m.b; other = m.a; }
        else continue;
        if (claw === carriage) continue;
        const rec = heldScratch.get(other) || { prongs: 0, palm: 0, names: '' };
        if (claw === palm) rec.palm = 1;
        else if (rec.names.indexOf(claw.data.prong) < 0) { rec.prongs++; rec.names += claw.data.prong + ','; }
        heldScratch.set(other, rec);
      }
      const out = [];
      for (const [b, rec] of heldScratch) if (rec.prongs >= 2 || (rec.prongs >= 1 && rec.palm)) out.push(b);
      if (typeof locks !== 'undefined') for (const l of locks) if (out.indexOf(l.b) < 0) out.push(l.b);
      return out;
    }

    /* Grip locks. engageLocks() ties every pinched body to the palm with a
       stiff, force-capped spring when the closing phase ends. The spring can
       never jam (unlike a weld against the prongs), the cap is the grip: a
       load beyond it (weight, sway, a neighbour dragging on the item) lets
       the item sag, and past lockBreakDist the hold is lost ('slip'). */
    const locks = [];
    const dbg = { engaged: 0, broke: 0, lastF: 0, lastCap: 0, lastPhase: '', lastT: 0, peakF: 0, trace: false, breaks: [] };
    R.dbg = dbg;
    function lockCapacity(rec) {
      let f = RIG.lockForce * cfg.grip;
      if (cfg.rubber) f *= RIG.lockRubber;
      if (cfg.prongs === 3) f *= RIG.lock3;
      if (!(rec.prongs >= 2)) f *= RIG.lockPalmOnly;
      return f;
    }
    /* Freeze the prongs in the pose they closed with (the motor holds), so a
       prong cannot drift into an item it no longer collides with. */
    function freezeProngs() {
      for (const j of R.joints) {
        if (j.isWeld || j.frozen) continue;
        j.lower0 = j.lower; j.upper0 = j.upper; j.limit0 = j.enableLimit;
        const a = j.angle(); j.setLimits(a, a); j.frozen = true;
      }
    }
    function thawProngs() {
      for (const j of R.joints) {
        if (!j.frozen) continue;
        j.lower = j.lower0; j.upper = j.upper0; j.enableLimit = j.limit0; j.frozen = false;
      }
    }
    function engageLocks(more) {
      if (!more) releaseLocks();
      held();
      for (const [b, rec] of heldScratch) {
        if (!(rec.prongs >= 2 || (rec.prongs >= 1 && rec.palm))) continue;
        if (b.type !== 'dynamic') continue;
        if (more && locks.some(l => l.b === b)) continue;
        // Offset of the item in the palm frame.
        const dx = b.x - palm.x, dy = b.y - palm.y;
        const lx = dx * palm.c + dy * palm.s, ly = -dx * palm.s + dy * palm.c;
        locks.push({ b, lx, ly, cap: lockCapacity(rec), load: 0 });
        // The prongs stop colliding with the item they hold: they keep the
        // pose they closed with, and a wedged item can no longer jam the
        // kinematic palm against the floor through a prong.
        for (const p of clawParts()) { p.noCollide.push(b); b.noCollide.push(p); }
        freezeProngs();
        dbg.engaged++;
      }
    }
    function clawParts() { return R.bodies.prongs.filter(p => !p.ghost).concat(R.bodies.tips); }
    function unlockBody(b) {
      for (const p of clawParts()) {
        let i = p.noCollide.indexOf(b); if (i >= 0) p.noCollide.splice(i, 1);
        i = b.noCollide.indexOf(p); if (i >= 0) b.noCollide.splice(i, 1);
      }
    }
    function releaseLocks() { for (const l of locks) unlockBody(l.b); locks.length = 0; thawProngs(); }
    /* Per substep while lifting/carrying: pull each locked item toward its
       spot under the palm with a capped force; drop the lock when it sags. */
    function checkLocks(h, jit) {
      const w = RIG.lockOmega, w2 = w * w, c = 2 * w;
      for (let i = locks.length - 1; i >= 0; i--) {
        const l = locks[i], b = l.b;
        if (b.type !== 'dynamic' || W.bodies.indexOf(b) < 0) { unlockBody(b); locks.splice(i, 1); if (!locks.length) thawProngs(); continue; }
        const tx = palm.x + (l.lx * palm.c - l.ly * palm.s), ty = palm.y + (l.lx * palm.s + l.ly * palm.c);
        const ex = tx - b.x, ey = ty - b.y;
        const dist = Math.hypot(ex, ey);
        if (dist > RIG.lockBreakDist && !(R.phase === 'lifting' && phaseT < RIG.lockGrace)) {
          dbg.broke++; dbg.lastF = dist; dbg.lastCap = l.cap; dbg.lastPhase = R.phase; dbg.lastT = phaseT;
          if (dbg.trace) {
            const cts = [];
            for (const m of W.manifolds.values()) {
              if (m.stamp !== W.stamp || m.n === 0 || (m.a !== b && m.b !== b)) continue;
              const o = m.a === b ? m.b : m.a;
              cts.push((o.data && o.data.inst) ? 'item' : (o.data && (o.data.wall || o.data.claw)) || o.group);
            }
            dbg.breaks.push({ phase: R.phase, t: +phaseT.toFixed(2), dist: +dist.toFixed(1), ex: +ex.toFixed(1), ey: +ey.toFixed(1), palmVy: Math.round(palm.vy), palmVx: Math.round(palm.vx), sway: +R.sway.toFixed(2), cts, m: Math.round(b.m), id: b.data && b.data.inst ? b.data.inst.id : '?' });
          }
          unlockBody(b); locks.splice(i, 1); pending.push('slip'); if (!locks.length) thawProngs(); continue;
        }
        let ax = w2 * ex + c * (palm.vx - b.vx), ay = w2 * ey + c * (palm.vy - b.vy);
        let f = Math.hypot(ax, ay) * b.m;
        if (f > dbg.peakF) dbg.peakF = f;
        // A pop from the pile is absorbed (the instant clamp is generous); a
        // sustained pull beyond the grip (weight, sway, a wedged neighbour)
        // shows up in the filtered load and breaks the hold.
        l.load += (f - l.load) * Math.min(1, h / RIG.lockTau);
        if (l.load > l.cap * jit && !(R.phase === 'lifting' && phaseT < RIG.lockGrace)) {
          dbg.broke++; dbg.lastF = l.load; dbg.lastCap = l.cap; dbg.lastPhase = R.phase; dbg.lastT = phaseT;
          unlockBody(b); locks.splice(i, 1); pending.push('slip'); if (!locks.length) thawProngs(); continue;
        }
        const capI = l.cap * RIG.lockPeakMul;
        if (f > capI) { const k = capI / f; ax *= k; ay *= k; }
        b.vx += ax * h; b.vy += ay * h;
        b.av += RIG.lockSpin * (palm.av - b.av) * h;
      }
    }
    function locked() { return locks.map(l => l.b); }

    const EVENT_ON_ENTER = { dropping: 'drop', closing: 'touch', lifting: 'lift', carrying: 'carry', releasing: 'release', idle: 'home' };
    let pending = [];
    function setPhase(p) {
      R.phase = p; phaseT = 0;
      if (p === 'dropping') digStart = -1;
      if (p === 'closing') { closeState = 'closed'; quietT = 0; pending.push('touch', 'close'); }
      else if (EVENT_ON_ENTER[p]) pending.push(EVENT_ON_ENTER[p]);
      if (p === 'lifting') engageLocks();
      if (p === 'releasing' || p === 'idle' || p === 'dropping') releaseLocks();
      if (p === 'releasing') { closeState = 'open'; }
      if (p === 'lifting') liftV = 0;
      if (p === 'carrying') { carryCalm = 0; arrivedT = 0; }
      applyMotors();
    }

    /* Advance the phase machine and set the kinematic velocities for this frame. */
    function update(dt) {
      if (!(dt > 0)) dt = 1 / 60;
      const sp = cfg.speed;
      phaseT += dt;
      // Phase logic first (uses last step's contacts).
      switch (R.phase) {
        case 'idle':
          if (Math.abs(carX - R.targetX) > 1.5) R.phase = 'moving';
          break;
        case 'moving':
          if (Math.abs(carX - R.targetX) <= 1.5 && Math.abs(carV) < 6) R.phase = 'idle';
          break;
        case 'dropping': {
          const floorLimit = ch - (geo.reach + RIG.floorClear);
          let v = RIG.dropSpeed * sp;
          const top = pileTopBelow();
          const tipY = palm.y + geo.reach;
          if (top - tipY < RIG.slowZone) v *= RIG.slowMul;
          R.cableLen += v * dt;
          // A prong brushing an item is not a landing yet: keep digging so the
          // hooks slide down around the target instead of closing in mid-air
          // above a neighbour. The dig ends when the palm itself lands, when
          // the prongs have sunk RIG.dig px past the first touch, or at the floor.
          let touched = false, stop = false;
          if (phaseT > 0.05) {
            for (const p of R.bodies.prongs) if (touching(p, landing)) { touched = true; break; }
            if (!touched) for (const p of R.bodies.tips) if (touching(p, landing)) { touched = true; break; }
            if (touching(palm, notClaw)) stop = true;
          }
          if (touched && digStart < 0) digStart = R.cableLen;
          if (digStart >= 0 && R.cableLen - digStart >= RIG.dig) stop = true;
          if (R.cableLen >= floorLimit - railY) { R.cableLen = floorLimit - railY; stop = true; }
          if (stop || phaseT > RIG.maxDrop) setPhase('closing');
          break;
        }
        case 'closing': {
          let quiet = true;
          for (const p of R.bodies.prongs) if (Math.abs(p.av - palm.av) > RIG.quietAV) quiet = false;
          quietT = quiet ? quietT + dt : 0;
          if ((phaseT >= RIG.closeMin && quietT >= RIG.quietT) || phaseT >= RIG.closeMax) setPhase('lifting');
          break;
        }
        case 'lifting': {
          liftV = Math.min(liftV + RIG.liftAccel * dt, RIG.liftSpeed * sp);
          R.cableLen -= liftV * dt;
          if (R.cableLen <= RIG.minCable || phaseT > RIG.maxLift) { R.cableLen = Math.max(R.cableLen, RIG.minCable); setPhase('carrying'); }
          break;
        }
        case 'carrying': {
          carTarget = carryX();
          const arrived = Math.abs(carX - carTarget) < 2 && Math.abs(carV) < 8;
          arrivedT = arrived ? arrivedT + dt : 0;
          carryCalm = arrived && Math.abs(R.swayX) < 4 && Math.abs(R.swayVel) < 30 ? carryCalm + dt : 0;
          if (carryCalm >= 0.1 || arrivedT > 1.0 || phaseT > RIG.maxCarry) setPhase('releasing');
          break;
        }
        case 'releasing':
          carTarget = carryX();
          if (phaseT >= RIG.releaseT) setPhase('returning');
          break;
        case 'returning': {
          carTarget = homeX;
          if ((Math.abs(carX - homeX) < 2 && Math.abs(carV) < 8) || phaseT > RIG.maxReturn) {
            R.targetX = homeX; forceOpen = false; closeState = 'open';
            setPhase('idle');
          }
          break;
        }
      }
      if (R.phase === 'idle' || R.phase === 'moving' || R.phase === 'dropping' || R.phase === 'closing' || R.phase === 'lifting') carTarget = R.targetX;
      // Carriage: accelerate toward the target, brake late so it overshoots a touch.
      const vmax = RIG.carSpeed * sp, acc = RIG.carAccel * sp;
      const d = carTarget - carX;
      const lockCar = R.phase === 'dropping' || R.phase === 'closing';
      let want = lockCar ? 0 : Math.sign(d) * Math.min(vmax, Math.sqrt(2 * acc * RIG.brake * Math.abs(d)));
      if (Math.abs(d) < 0.5 && !lockCar) want = 0;
      const prevV = carV;
      if (carV < want) carV = Math.min(carV + acc * dt, want);
      else if (carV > want) carV = Math.max(carV - acc * dt, want);
      carX += carV * dt;
      if (!lockCar && Math.abs(carTarget - carX) < 0.6 && Math.abs(carV) < 20) { carX = carTarget; carV = 0; }
      const lim = carLim();
      if (carX < lim) { carX = lim; carV = 0; } else if (carX > cw - lim) { carX = cw - lim; carV = 0; }
      const carAcc = (carV - prevV) / dt;
      // Pendulum sway, tracked as the palm's horizontal offset (px) so a
      // lengthening cable keeps the swing's displacement rather than its angle.
      const Lc = Math.max(R.cableLen, 40), w2 = Math.abs(W.gravity.y) / Lc;
      const zeta = RIG.swayZeta + RIG.swayShortDamp * Math.max(0, 1 - R.cableLen / 80);
      const swayAcc = -w2 * R.swayX - 2 * zeta * Math.sqrt(w2) * R.swayVel - carAcc;
      R.swayVel += swayAcc * dt;
      R.swayX += R.swayVel * dt;
      const maxX = Math.sin(RIG.swayMax) * Lc;
      if (R.swayX > maxX) { R.swayX = maxX; if (R.swayVel > 0) R.swayVel = 0; }
      else if (R.swayX < -maxX) { R.swayX = -maxX; if (R.swayVel < 0) R.swayVel = 0; }
      R.sway = Math.asin(R.swayX / Lc);
      // Kinematic targets for this frame.
      const px = carX + Math.sin(R.sway) * R.cableLen;
      const py = railY + Math.cos(R.sway) * R.cableLen;
      R.x = px; R.y = py; R.cableTop.x = carX; R.cableTop.y = railY;
      carriage.vx = (carX - carriage.x) / dt; carriage.vy = (railY - carriage.y) / dt; carriage.av = 0;
      palm.vx = (px - palm.x) / dt; palm.vy = (py - palm.y) / dt;
      palm.av = (R.sway * RIG.tiltMul - palm.a) / dt;
      if (R.mid) updateGhost();
      const ev = pending; pending = [];
      return ev;
    }

    /* Carriage target over the chute: centres the held item, not the palm,
       so an item gripped off-centre still drops inside the column. */
    function carryX() {
      if (!locks.length) return chuteX;
      let off = 0;
      for (const l of locks) off += l.lx;
      off /= locks.length;
      return clamp(chuteX - off, carLim(), cw - carLim());
    }

    /* Pose the ghost third prong from the side prongs' mean closedness. */
    function updateGhost() {
      let frac = 0, n = 0;
      for (const j of R.joints) {
        if (j.isWeld || j.isMid) continue;
        const outward = j.dir * j.angle();
        frac += (outward - geo.open) / (geo.closed - geo.open); n++;
      }
      frac = n ? Math.max(0, Math.min(1, frac / n)) : 0;
      const m = R.mid, a = palm.a + m.dir * (m.open + (m.closed - m.open) * frac);
      setPose(m.b, palm.x, palm.y, a);
    }

    build();
    return R;
  }

  return { box, body, world, revolute, cabinet, clawRig, setPose, sync: syncBody, RIG, H };
})();
