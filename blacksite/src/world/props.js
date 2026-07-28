// Prop geometry for the blacksite.
//
// Everything in here returns geometry in local space, already normalised so
// `BufferGeometryUtils.mergeGeometries` will swallow any mix of it: non-indexed,
// carrying exactly position/normal/uv/color and nothing else. The level places
// the parts, buckets them by (chunk, material) and merges each bucket, which is
// how a facility this dense arrives on screen in a couple of dozen draw calls.
//
// The rule every prop obeys: no perfectly sharp 90° edge anywhere. Cast concrete
// leaves the form with a 2 cm chamfer, rolled steel has a 1 cm radius on the
// arris, and at a low sun both of them catch a bright line that a mathematically
// sharp edge cannot. It is the cheapest thing you can do to stop geometry
// reading as CG, and it is why `chamferBox` and not `BoxGeometry` is the
// primitive the whole level is built from.

import * as THREE from 'three';

const WHITE = [1, 1, 1];

// A "part" is a lump of geometry destined for one material bucket. Props return
// arrays of these because almost nothing real is made of a single material — a
// floodlight is a steel mast, a painted head and a glass lens.
export const P = (g, m) => ({ g, m });

// ── merge hygiene ────────────────────────────────────────────────────────────

// mergeGeometries refuses a batch whose members disagree about indexing or about
// which attributes exist, so everything funnels through here on the way in.
export function prep(geo, color = WHITE) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  }
  const n = g.attributes.position.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  if (!g.attributes.color) {
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  return g;
}

export function xf(x, y, z, ry = 0, rx = 0, rz = 0, s = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ'));
  m.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s));
  return m;
}

// ── the primitive ────────────────────────────────────────────────────────────

// A box with all twelve edges chamfered: six inset face quads, twelve 45° edge
// strips and eight corner triangles. 44 triangles instead of 12, which buys a
// silhouette that softens under a rim light and an arris that reads at 40 m.
export function chamferBox(sx, sy, sz, c = 0.025, opts = {}) {
  const a = sx / 2, b = sy / 2, d = sz / 2;
  c = Math.max(0, Math.min(c, a * 0.48, b * 0.48, d * 0.48));
  const col = opts.color || WHITE;
  const us = opts.uvScale == null ? 1 : opts.uvScale;
  const uo = opts.uvOffset || [0, 0];

  const pos = [], nrm = [], uvs = [], cols = [];

  // Three vertex families per corner — one pushed out on each axis.
  const X = (i, j, k) => [i * a, j * (b - c), k * (d - c)];
  const Y = (i, j, k) => [i * (a - c), j * b, k * (d - c)];
  const Z = (i, j, k) => [i * (a - c), j * (b - c), k * d];

  const put = (p, n) => {
    pos.push(p[0], p[1], p[2]);
    nrm.push(n[0], n[1], n[2]);
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
    let u, v;
    if (ax >= ay && ax >= az) { u = p[2]; v = p[1]; }
    else if (ay >= az) { u = p[0]; v = p[2]; }
    else { u = p[0]; v = p[1]; }
    uvs.push(u * us + uo[0], v * us + uo[1]);
    cols.push(col[0], col[1], col[2]);
  };

  // Winding is fixed by comparing the polygon's own Newell normal to the face
  // normal, so the callers below can list corners in whatever order is readable.
  const poly = (vs, n) => {
    let nx = 0, ny = 0, nz = 0;
    for (let i = 0; i < vs.length; i++) {
      const p = vs[i], q = vs[(i + 1) % vs.length];
      nx += (p[1] - q[1]) * (p[2] + q[2]);
      ny += (p[2] - q[2]) * (p[0] + q[0]);
      nz += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const list = (nx * n[0] + ny * n[1] + nz * n[2]) < 0 ? vs.slice().reverse() : vs;
    for (let i = 1; i + 1 < list.length; i++) { put(list[0], n); put(list[i], n); put(list[i + 1], n); }
  };

  const R2 = Math.SQRT1_2, R3 = 1 / Math.sqrt(3);

  for (const s of [-1, 1]) {
    poly([X(s, -1, -1), X(s, -1, 1), X(s, 1, 1), X(s, 1, -1)], [s, 0, 0]);
    poly([Y(-1, s, -1), Y(-1, s, 1), Y(1, s, 1), Y(1, s, -1)], [0, s, 0]);
    poly([Z(-1, -1, s), Z(-1, 1, s), Z(1, 1, s), Z(1, -1, s)], [0, 0, s]);
  }
  for (const i of [-1, 1]) for (const j of [-1, 1]) {
    poly([X(i, j, -1), X(i, j, 1), Y(i, j, 1), Y(i, j, -1)], [i * R2, j * R2, 0]);         // edges ∥ Z
    poly([Y(-1, i, j), Y(1, i, j), Z(1, i, j), Z(-1, i, j)], [0, i * R2, j * R2]);         // edges ∥ X
    poly([Z(i, -1, j), Z(i, 1, j), X(i, 1, j), X(i, -1, j)], [i * R2, 0, j * R2]);         // edges ∥ Y
  }
  for (const i of [-1, 1]) for (const j of [-1, 1]) for (const k of [-1, 1]) {
    poly([X(i, j, k), Y(i, j, k), Z(i, j, k)], [i * R3, j * R3, k * R3]);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

// Extrudes a closed 2D profile (XY) along Z. Jersey barriers, kerbs, I-profiles
// and berm sections are all the same operation with a different outline.
export function extrude(profile, len, opts = {}) {
  const col = opts.color || WHITE;
  const smooth = !!opts.smooth;
  const hz = len / 2;
  const pos = [], nrm = [], uvs = [], cols = [];
  const n = profile.length;

  // Force the outline counter-clockwise up front. With a known winding the
  // outward normal of every edge is just (ey, −ex) and the triangle order that
  // falls out of the sweep is already correct — the alternative is a per-edge
  // sign test that is wrong in exactly one of the four cases, which is how you
  // end up with a jersey barrier lit from inside.
  let area = 0;
  for (let i = 0; i < n; i++) {
    const p = profile[i], q = profile[(i + 1) % n];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area < 0) profile = profile.slice().reverse();

  const put = (x, y, z, nx, ny, nz, u, v) => {
    pos.push(x, y, z); nrm.push(nx, ny, nz); uvs.push(u, v); cols.push(col[0], col[1], col[2]);
  };

  // side walls
  let run = 0;
  for (let i = 0; i < n; i++) {
    const p = profile[i], q = profile[(i + 1) % n];
    let ex = q[0] - p[0], ey = q[1] - p[1];
    const el = Math.hypot(ex, ey) || 1;
    ex /= el; ey /= el;
    const nx = ey, ny = -ex;
    const a = [p[0], p[1], -hz], b = [q[0], q[1], -hz], c = [q[0], q[1], hz], d = [p[0], p[1], hz];
    put(a[0], a[1], a[2], nx, ny, 0, run, 0);
    put(b[0], b[1], b[2], nx, ny, 0, run + el, 0);
    put(c[0], c[1], c[2], nx, ny, 0, run + el, len);
    put(a[0], a[1], a[2], nx, ny, 0, run, 0);
    put(c[0], c[1], c[2], nx, ny, 0, run + el, len);
    put(d[0], d[1], d[2], nx, ny, 0, run, len);
    run += el;
  }
  // caps, fanned from vertex 0 — every profile here is convex or near enough
  for (const s of [-1, 1]) {
    for (let i = 1; i + 1 < n; i++) {
      const tri = [profile[0], profile[i], profile[i + 1]];
      const order = s > 0 ? tri : [tri[0], tri[2], tri[1]];
      for (const p of order) put(p[0], p[1], s * hz, 0, 0, s, p[0], p[1]);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  if (smooth) { g.computeVertexNormals(); }
  return g;
}

export function cyl(rt, rb, h, seg = 12, opts = {}) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, !!opts.open);
  return prep(g, opts.color);
}

export function sphere(r, seg = 8, rings = 6, opts = {}) {
  return prep(new THREE.SphereGeometry(r, seg, rings), opts.color);
}

export function torus(r, tube, seg = 8, arcSeg = 16, arc = Math.PI * 2, opts = {}) {
  return prep(new THREE.TorusGeometry(r, tube, seg, arcSeg, arc), opts.color);
}

function place(g, x, y, z, ry = 0, rx = 0, rz = 0) {
  g.applyMatrix4(xf(x, y, z, ry, rx, rz));
  return g;
}
export { place };

// ── structural steel ─────────────────────────────────────────────────────────

// A real I-beam, built as three chamfered slabs rather than an extruded outline,
// because the flange-to-web reveal is what makes the silhouette read as steel
// and a chamfer on each of the six flange tips is what makes it read as *rolled*
// steel. Runs along +X, origin at the centroid.
export function iBeam(len, depth = 0.26, flange = 0.14, opts = {}) {
  const tw = opts.web || 0.016, tf = opts.flange || 0.022, c = 0.006;
  const col = opts.color;
  const g = [];
  g.push(place(chamferBox(len, tf, flange, c, { color: col }), 0, (depth - tf) / 2, 0));
  g.push(place(chamferBox(len, tf, flange, c, { color: col }), 0, -(depth - tf) / 2, 0));
  g.push(place(chamferBox(len, depth - tf * 2, tw, c * 0.6, { color: col }), 0, 0, 0));
  return g;
}

// Square hollow section — the other half of every gantry ever built.
export function shs(len, w = 0.12, opts = {}) {
  return [place(chamferBox(len, w, w, opts.c == null ? 0.012 : opts.c, { color: opts.color }), 0, 0, 0)];
}

// Trapezoidal corrugation, the profile stamped into every container and every
// clad wall on a site like this. Panel lies in XY, ribs run along Y, +Z is out.
export function corrugated(w, h, opts = {}) {
  const pitch = opts.pitch || 0.24, dep = opts.depth || 0.035, t = opts.thick || 0.02;
  const col = opts.color || WHITE;
  const pos = [], nrm = [], uvs = [], cols = [];
  const put = (x, y, z, nx, ny, nz, u, v) => {
    pos.push(x, y, z); nrm.push(nx, ny, nz); uvs.push(u, v); cols.push(col[0], col[1], col[2]);
  };
  const quad = (a, b, c2, d, n) => {
    put(a[0], a[1], a[2], n[0], n[1], n[2], a[0], a[1]); put(b[0], b[1], b[2], n[0], n[1], n[2], b[0], b[1]);
    put(c2[0], c2[1], c2[2], n[0], n[1], n[2], c2[0], c2[1]);
    put(a[0], a[1], a[2], n[0], n[1], n[2], a[0], a[1]); put(c2[0], c2[1], c2[2], n[0], n[1], n[2], c2[0], c2[1]);
    put(d[0], d[1], d[2], n[0], n[1], n[2], d[0], d[1]);
  };
  const y0 = -h / 2, y1 = h / 2;
  const nRib = Math.max(2, Math.round(w / pitch));
  const px = w / nRib;
  // Profile samples across one period: flat, ramp up, flat, ramp down.
  const zs = [];
  for (let i = 0; i <= nRib; i++) {
    const x0 = -w / 2 + i * px;
    zs.push([x0, 0], [x0 + px * 0.18, dep], [x0 + px * 0.55, dep], [x0 + px * 0.73, 0]);
  }
  for (let i = 0; i + 1 < zs.length; i++) {
    const [xa, za] = zs[i], [xb, zb] = zs[i + 1];
    if (xb > w / 2 + 1e-6) break;
    let nx = -(zb - za), nz = (xb - xa);
    const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
    quad([xa, y0, za], [xb, y0, zb], [xb, y1, zb], [xa, y1, za], [nx, 0, nz]);
    quad([xa, y1, za - t], [xb, y1, zb - t], [xb, y0, zb - t], [xa, y0, za - t], [-nx, 0, -nz]);
  }
  // Top and bottom returns so the panel is not a one-sided sheet in silhouette.
  for (const [y, s] of [[y1, 1], [y0, -1]]) {
    for (let i = 0; i + 1 < zs.length; i++) {
      const [xa, za] = zs[i], [xb, zb] = zs[i + 1];
      if (xb > w / 2 + 1e-6) break;
      const A = [xa, y, za], B = [xb, y, zb], C = [xb, y, zb - t], D = [xa, y, za - t];
      quad(s > 0 ? A : D, s > 0 ? B : C, s > 0 ? C : B, s > 0 ? D : A, [0, s, 0]);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
}

// ── site furniture ───────────────────────────────────────────────────────────

// Handrail along +X. Posts, top and mid rail, and the kick plate that stops a
// dropped spanner going over the edge — leave the kick plate off and a catwalk
// instantly looks like programmer art. Bullets pass through this; bodies do not.
export function railing(len, opts = {}) {
  const h = opts.h || 1.06, spacing = opts.spacing || 1.55;
  const col = opts.color, out = [];
  const n = Math.max(1, Math.round(len / spacing));
  const step = len / n;
  for (let i = 0; i <= n; i++) {
    if (opts.skip && opts.skip(i / n)) continue;
    const x = -len / 2 + i * step;
    out.push(place(chamferBox(0.048, h, 0.048, 0.008, { color: col }), x, h / 2, 0));
  }
  out.push(place(cyl(0.024, 0.024, len, 8, { color: col }), 0, h, 0, 0, 0, Math.PI / 2));
  out.push(place(cyl(0.019, 0.019, len, 6, { color: col }), 0, h * 0.55, 0, 0, 0, Math.PI / 2));
  if (opts.kick !== false) out.push(place(chamferBox(len, 0.10, 0.012, 0.004, { color: col }), 0, 0.06, 0));
  return out;
}

// Caged ladder. The hoops are what sell it — a bare ladder reads as a prop, a
// caged one reads as something a person was expected to climb 40 feet of.
export function ladder(h, opts = {}) {
  const w = opts.w || 0.46, col = opts.color, out = [];
  out.push(place(chamferBox(0.05, h, 0.11, 0.008, { color: col }), -w / 2, h / 2, 0));
  out.push(place(chamferBox(0.05, h, 0.11, 0.008, { color: col }), w / 2, h / 2, 0));
  for (let y = 0.30; y < h - 0.1; y += 0.30) {
    out.push(place(cyl(0.017, 0.017, w, 6, { color: col }), 0, y, 0, 0, 0, Math.PI / 2));
  }
  if (opts.cage !== false && h > 3) {
    for (let y = 2.2; y < h - 0.3; y += 0.75) {
      out.push(place(torus(0.38, 0.018, 5, 12, Math.PI * 1.25, { color: col }), 0, y, 0.06, 0, Math.PI / 2, -Math.PI * 0.125));
    }
    for (const sx of [-0.34, 0.34]) {
      out.push(place(chamferBox(0.035, Math.max(0.1, h - 2.5), 0.035, 0.006, { color: col }), sx, 2.2 + (h - 2.5) / 2, 0.42));
    }
  }
  return out;
}

// Switchback-free straight flight along +Z, treads rising in +Y.
export function stair(steps, rise, run, width, opts = {}) {
  const col = opts.color, out = [];
  for (let i = 0; i < steps; i++) {
    out.push(place(chamferBox(width, 0.045, run, 0.008, { color: col }), 0, (i + 1) * rise - 0.022, i * run + run / 2));
    out.push(place(chamferBox(width, rise * 0.55, 0.02, 0.005, { color: col }), 0, (i + 1) * rise - rise * 0.72, i * run));
  }
  const L = Math.hypot(steps * rise, steps * run);
  const ang = Math.atan2(steps * rise, steps * run);
  for (const sx of [-width / 2 - 0.03, width / 2 + 0.03]) {
    out.push(place(chamferBox(0.03, 0.30, L, 0.006, { color: col }),
      sx, steps * rise / 2 - 0.08, steps * run / 2, 0, ang, 0));
  }
  return out;
}

// Grated catwalk deck along +Z. The deck plate is thin, the two edge channels
// are deep, and that difference is the whole reason a catwalk looks structural
// from below instead of like a floating plank.
export function catwalk(len, width = 1.6, opts = {}) {
  const col = opts.color, out = [];
  out.push(place(chamferBox(width, 0.05, len, 0.008, { color: col }), 0, -0.025, 0));
  for (const sx of [-width / 2 + 0.06, width / 2 - 0.06]) {
    out.push(place(chamferBox(0.10, 0.22, len, 0.010, { color: col }), sx, -0.14, 0));
  }
  for (let z = -len / 2 + 0.9; z < len / 2; z += 1.8) {
    out.push(place(chamferBox(width, 0.09, 0.05, 0.008, { color: col }), 0, -0.14, z));
  }
  return out;
}

// Pipe run through a list of world-space points, with a ball at every knuckle
// and a bolted flange every few metres. Elbows are spheres rather than tori:
// at 0.2 m radius nobody can tell, and it costs a tenth of the triangles.
export function pipeRun(points, r = 0.16, opts = {}) {
  const col = opts.color, out = [];
  const flangeEvery = opts.flangeEvery || 4.5;
  for (let i = 0; i + 1 < points.length; i++) {
    const a = new THREE.Vector3(...points[i]), b = new THREE.Vector3(...points[i + 1]);
    const d = b.clone().sub(a), L = d.length();
    if (L < 1e-4) continue;
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const m = new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1));
    out.push(cyl(r, r, L, opts.seg || 10, { color: col }).applyMatrix4(m));
    for (let t = flangeEvery; t < L; t += flangeEvery) {
      const p = a.clone().addScaledVector(d.clone().normalize(), t);
      const fm = new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1));
      out.push(cyl(r * 1.45, r * 1.45, 0.05, opts.seg || 10, { color: col }).applyMatrix4(fm));
    }
    if (i > 0) out.push(place(sphere(r * 1.06, 8, 6, { color: col }), a.x, a.y, a.z));
  }
  return out;
}

// Cable tray — a perforated U-channel with rungs, run along +X. These live on
// every ceiling in the bunker and are most of what gives a corridor a scale cue.
export function cableTray(len, w = 0.42, opts = {}) {
  const col = opts.color, out = [];
  out.push(place(chamferBox(len, 0.02, w, 0.004, { color: col }), 0, 0, 0));
  for (const sz of [-w / 2, w / 2]) out.push(place(chamferBox(len, 0.09, 0.018, 0.004, { color: col }), 0, 0.045, sz));
  for (let x = -len / 2 + 0.4; x < len / 2; x += 0.8) {
    out.push(place(chamferBox(0.03, 0.05, w * 0.9, 0.005, { color: col }), x, 0.06, 0));
  }
  return out;
}

// New Jersey barrier, real profile: 25 cm toe, break at 33 cm, 81 cm slope, flat
// top. 1.07 m tall — exactly crouch cover, which is why they are everywhere in
// this level's approach.
export function jersey(len, opts = {}) {
  const half = [
    [0.305, 0], [0.305, 0.075], [0.19, 0.33], [0.115, 1.02], [0.115, 1.07],
  ];
  const prof = [];
  for (const p of half) prof.push([p[0], p[1]]);
  for (let i = half.length - 1; i >= 0; i--) prof.push([-half[i][0], half[i][1]]);
  const g = extrude(prof, len, { color: opts.color });
  // A chamfer pass would double the triangles for no gain here — the profile is
  // already all obtuse angles, which is the point of the shape.
  return [g];
}

// Sandbag emplacement. Bags are squashed low-poly spheres, staggered course to
// course and jittered, because a bag wall built on a grid looks like masonry.
export function sandbags(len, rows = 3, opts = {}) {
  const out = [];
  const bw = 0.44, bh = 0.20, bd = 0.28;
  const rnd = mulberry(opts.seed || 7);
  for (let r = 0; r < rows; r++) {
    // Every course is set back and a bag shorter at each end. A bag wall built
    // plumb and flush is the give-away — real ones are battered, because that is
    // the only way a stack of half-full sacks stands up.
    const batter = r * 0.05, end = r * bw * 0.34;
    const off = (r % 2) * bw * 0.5;
    for (let x = -len / 2 + off + end; x < len / 2 - end - 0.1; x += bw * 0.94) {
      const s = 0.88 + rnd() * 0.26;
      const v = 0.86 + rnd() * 0.26;
      const g = sphere(1, 7, 5, { color: [v, v * 0.985, v * 0.94] });
      g.applyMatrix4(new THREE.Matrix4().makeScale(bw * 0.5 * s, bh * 0.5 * s, bd * 0.5 * (2 - s)));
      out.push(place(g, x + (rnd() - 0.5) * 0.07, bh * (r + 0.5) - r * 0.035,
        (rnd() - 0.5) * 0.06 + batter, (rnd() - 0.5) * 0.7, (rnd() - 0.5) * 0.18, (rnd() - 0.5) * 0.22));
    }
  }
  return out;
}

// Cable spool: two chamfered cheeks, a hub, and the cable itself as a torus
// stack so the wound bulk reads even in silhouette.
export function spool(r = 0.85, w = 0.9, opts = {}) {
  const col = opts.color, wood = opts.wood, out = [];
  for (const sz of [-1, 1]) {
    const z = sz * (w / 2 - 0.035);
    out.push(place(cyl(r, r, 0.07, 16, { color: wood }), 0, 0, z, 0, Math.PI / 2, 0));
    // A bare disc reads as a coin at any distance. The rim band and the six
    // radial battens are what make it read as a cable drum instead.
    out.push(place(torus(r - 0.04, 0.05, 5, 18, Math.PI * 2, { color: col }), 0, 0, z + sz * 0.045));
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * Math.PI * 2;
      out.push(place(chamferBox(r * 0.92, 0.11, 0.05, 0.012, { color: wood }),
        Math.cos(a) * r * 0.44, Math.sin(a) * r * 0.44, z + sz * 0.05, 0, 0, a));
    }
  }
  out.push(place(cyl(r * 0.36, r * 0.36, w - 0.1, 12, { color: wood }), 0, 0, 0, 0, Math.PI / 2, 0));
  for (let i = 0; i < 5; i++) {
    out.push(place(torus(r * 0.42 + i * 0.082, 0.044, 5, 16, Math.PI * 2, { color: col }),
      0, 0, (i % 2 ? 0.05 : -0.05)));
  }
  return out;
}

// Steel drum with the two rolling hoops. Rolled, not moulded, so the hoops sit
// proud rather than being a texture.
export function drum(opts = {}) {
  const col = opts.color, out = [];
  out.push(place(cyl(0.29, 0.29, 0.88, 14, { color: col }), 0, 0.44, 0));
  for (const y of [0.30, 0.58]) out.push(place(cyl(0.315, 0.315, 0.055, 14, { color: col }), 0, y, 0));
  out.push(place(cyl(0.30, 0.30, 0.03, 14, { color: col }), 0, 0.885, 0));
  return out;
}

export function crate(w, h, d, opts = {}) {
  const col = opts.color, out = [];
  out.push(place(chamferBox(w, h, d, 0.012, { color: col }), 0, h / 2, 0));
  const t = 0.055;
  for (const sz of [-d / 2, d / 2]) {
    out.push(place(chamferBox(w + 0.01, t, 0.02, 0.004, { color: col }), 0, h * 0.16, sz));
    out.push(place(chamferBox(w + 0.01, t, 0.02, 0.004, { color: col }), 0, h * 0.84, sz));
  }
  for (const sx of [-w / 2, w / 2]) {
    out.push(place(chamferBox(0.02, t, d + 0.01, 0.004, { color: col }), sx, h * 0.16, 0));
    out.push(place(chamferBox(0.02, t, d + 0.01, 0.004, { color: col }), sx, h * 0.84, 0));
  }
  return out;
}

// ISO container, long axis +X. Corrugated on all four sides, chamfered corner
// posts, corner castings, and the door-end hardware — the locking bars are what
// stops it being a rectangle.
export function container(len = 6.06, opts = {}) {
  const h = 2.59, d = 2.44;
  const shell = opts.color, hard = opts.hardware || shell, out = [];
  for (const sz of [-1, 1]) {
    const g = corrugated(len - 0.3, h - 0.28, { pitch: 0.28, depth: 0.045, color: shell });
    out.push(place(g, 0, h / 2, sz * (d / 2 - 0.02), sz > 0 ? 0 : Math.PI));
  }
  // door end
  const dg = corrugated(d - 0.3, h - 0.28, { pitch: 0.30, depth: 0.03, color: shell });
  out.push(place(dg, len / 2 - 0.02, h / 2, 0, -Math.PI / 2));
  const bg = corrugated(d - 0.3, h - 0.28, { pitch: 0.30, depth: 0.03, color: shell });
  out.push(place(bg, -len / 2 + 0.02, h / 2, 0, Math.PI / 2));
  for (const x of [len / 2 - 0.06]) {
    for (const sz of [-0.72, -0.24, 0.24, 0.72]) {
      out.push(place(cyl(0.028, 0.028, h - 0.42, 6, { color: hard }), x, h / 2, sz));
    }
    out.push(place(chamferBox(0.05, 0.10, d - 0.2, 0.008, { color: hard }), x, 1.30, 0));
  }
  // frame: corner posts, top and bottom rails, corner castings
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    out.push(place(chamferBox(0.14, h, 0.14, 0.02, { color: hard }), sx * (len / 2 - 0.07), h / 2, sz * (d / 2 - 0.07)));
    for (const y of [0.07, h - 0.07]) {
      out.push(place(chamferBox(0.20, 0.16, 0.20, 0.03, { color: hard }), sx * (len / 2 - 0.10), y, sz * (d / 2 - 0.10)));
    }
  }
  for (const sz of [-1, 1]) for (const y of [0.09, h - 0.09]) {
    out.push(place(chamferBox(len - 0.2, 0.16, 0.13, 0.02, { color: hard }), 0, y, sz * (d / 2 - 0.06)));
  }
  for (const sx of [-1, 1]) for (const y of [0.09, h - 0.09]) {
    out.push(place(chamferBox(0.13, 0.16, d - 0.24, 0.02, { color: hard }), sx * (len / 2 - 0.06), y, 0));
  }
  // ribbed roof
  out.push(place(corrugated(len - 0.2, d - 0.2, { pitch: 0.42, depth: 0.025, color: shell }), 0, h - 0.03, 0, 0, -Math.PI / 2));
  return out;
}

// Floodlight mast: tapered pole, a head frame carrying four housings, and a
// diagonal stay. Nine metres, so it is the thing that gives the apron a sense of
// ceiling and the skyline something to interrupt it.
export function floodMast(h = 9, opts = {}) {
  const col = opts.color, paint = opts.paint || col, lens = opts.lens, out = [];
  out.push(place(cyl(0.09, 0.17, h, 10, { color: col }), 0, h / 2, 0));
  out.push(place(chamferBox(0.62, 0.06, 0.62, 0.012, { color: col }), 0, 0.05, 0));
  for (let y = 1.2; y < h - 1.4; y += 2.4) {
    out.push(place(cyl(0.185, 0.185, 0.05, 10, { color: col }), 0, y, 0));
  }
  const armLen = opts.arm || 1.5;
  out.push(place(chamferBox(armLen, 0.09, 0.09, 0.012, { color: col }), 0, h, 0));
  out.push(place(chamferBox(0.09, 0.09, armLen * 0.6, 0.012, { color: col }), 0, h, 0));
  const lamps = [];
  for (const [dx, dz] of [[-armLen / 2, 0], [armLen / 2, 0], [0, -armLen * 0.3], [0, armLen * 0.3]]) {
    out.push(place(chamferBox(0.46, 0.20, 0.34, 0.02, { color: paint }), dx, h + 0.16, dz, 0, -0.55));
    lamps.push([dx, h + 0.05, dz]);
  }
  return { parts: out, lamps, lens };
}

// Bulkhead lamp — the fitting that gets bolted to a wall, a parapet or the
// underside of a walkway. Lens faces +Z, everything else hangs off behind it.
//
// The wire guard is the whole read. A glowing box is a light source; a glowing
// box behind four bars and a hoop is something a fitter mounted at head height
// where it was going to get hit. Returned as body/lens rather than one bag,
// because the lens has to be able to go dark independently of the housing —
// which is how a dead fitting gets modelled here.
export function bulkhead(opts = {}) {
  const r = opts.r || 0.16, col = opts.color;
  const body = [], lens = [];
  body.push(place(chamferBox(r * 2.4, r * 2.4, 0.09, 0.02, { color: col }), 0, 0, -0.075));
  body.push(place(cyl(r * 1.2, r * 1.36, 0.10, 10, { color: col }), 0, 0, -0.01, 0, Math.PI / 2, 0));
  // The conduit gland underneath. Nothing is wired from the top — water.
  body.push(place(cyl(0.032, 0.032, 0.14, 6, { color: col }), 0, -r * 1.55, -0.09));
  body.push(place(torus(r * 1.06, 0.014, 4, 12, Math.PI * 2, { color: col }), 0, 0, 0.075));
  for (let i = 0; i < 4; i++) {
    body.push(place(chamferBox(0.022, r * 2.12, 0.022, 0.004, { color: col }), 0, 0, 0.075, 0, 0, i * Math.PI / 4));
  }
  lens.push(place(cyl(r, r, 0.05, 12, { color: opts.lens }), 0, 0, 0.042, 0, Math.PI / 2, 0));
  return { body, lens };
}

// Tripod work light — the thing somebody wheels out when the mains lighting has
// been off for thirty years. It is the only fixture on this site that sits at
// head height instead of nine metres up, which makes it the only one that
// really lights a floor, and it earns its place by standing next to the open
// cable trench somebody was last working in. Head faces +Z, raked down.
export function workLamp(opts = {}) {
  const h = opts.h || 1.72, R = opts.spread || 0.42, tilt = opts.tilt == null ? 0.30 : opts.tilt;
  const col = opts.color;
  const body = [], lens = [];
  const strut = (a, b, r, seg = 5) => {
    const d = b.clone().sub(a), L = d.length();
    if (L < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    body.push(cyl(r, r, L, seg, { color: col })
      .applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1))));
  };
  const knuckle = new THREE.Vector3(0, h * 0.60, 0);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.5;
    strut(new THREE.Vector3(Math.cos(a) * R, 0, Math.sin(a) * R), knuckle, 0.022);
    body.push(place(chamferBox(0.09, 0.02, 0.09, 0.004, { color: col }), Math.cos(a) * R, 0.012, Math.sin(a) * R));
  }
  // The inner column telescopes out of the knuckle — two diameters, so the
  // silhouette says "extended" rather than "one stick".
  strut(new THREE.Vector3(0, h * 0.28, 0), new THREE.Vector3(0, h * 0.64, 0), 0.030, 6);
  strut(knuckle, new THREE.Vector3(0, h, 0), 0.021, 6);
  body.push(place(cyl(0.048, 0.048, 0.07, 8, { color: col }), 0, h * 0.62, 0));
  body.push(place(chamferBox(0.30, 0.20, 0.13, 0.02, { color: col }), 0, h, 0.055, 0, tilt));
  body.push(place(chamferBox(0.34, 0.022, 0.03, 0.006, { color: col }), 0, h + 0.115, 0.02, 0, tilt));
  // Lens on the head's front face, carried round by the same rake as the head.
  const c = Math.cos(tilt), s = Math.sin(tilt);
  lens.push(place(chamferBox(0.26, 0.15, 0.02, 0.006, { color: opts.lens }),
    0, h - 0.075 * s, 0.055 + 0.075 * c, 0, tilt));
  return { body, lens };
}

// Three-leg lattice mast. The zigzag bracing is generated rather than boxed so
// the taper reads honestly from any angle — this is the level's tallest
// landmark and it is seen mostly as a silhouette.
export function latticeMast(h, opts = {}) {
  const rBase = opts.rBase || 0.85, rTop = opts.rTop || 0.30;
  const col = opts.color, out = [];
  const bays = Math.max(4, Math.round(h / 2.0));
  const legs = [];
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    legs.push([Math.cos(a), Math.sin(a)]);
  }
  const at = (i, t) => {
    const r = rBase + (rTop - rBase) * t;
    return new THREE.Vector3(legs[i][0] * r, t * h, legs[i][1] * r);
  };
  const strut = (a, b, r) => {
    const d = b.clone().sub(a), L = d.length();
    if (L < 1e-4) return;
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
    const m = new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1));
    out.push(cyl(r, r, L, 5, { color: col }).applyMatrix4(m));
  };
  for (let i = 0; i < 3; i++) {
    for (let b = 0; b < bays; b++) strut(at(i, b / bays), at(i, (b + 1) / bays), 0.055);
  }
  for (let b = 0; b <= bays; b++) {
    const t = b / bays;
    for (let i = 0; i < 3; i++) strut(at(i, t), at((i + 1) % 3, t), 0.03);
    if (b < bays) {
      const t2 = (b + 1) / bays;
      for (let i = 0; i < 3; i++) strut(at(i, t), at((i + 1) % 3, t2), 0.026);
    }
  }
  // dipoles and a dish near the top, so the silhouette is not a bare triangle
  out.push(place(cyl(0.035, 0.035, h * 0.13, 5, { color: col }), 0, h + h * 0.065, 0));
  for (const t of [0.62, 0.78]) {
    out.push(place(chamferBox(1.7, 0.05, 0.05, 0.008, { color: col }), 0, t * h, 0, t * 4.1));
  }
  return out;
}

// Blast wall / revetment along +X, with embrasures cut into it. The slots sit at
// 1.15–1.65 m: you shoot through them standing, and you are covered everywhere
// else. Built as segments rather than a CSG cut for obvious reasons.
export function revetment(len, h = 3.4, opts = {}) {
  const t = opts.t || 0.7, col = opts.color, out = [];
  const slots = opts.slots || [];
  const sy0 = 1.15, sy1 = 1.65, sw = 0.55;
  const cuts = [];
  for (const s of slots) cuts.push([s - sw / 2, s + sw / 2]);
  cuts.sort((a, b) => a[0] - b[0]);
  let x = -len / 2;
  for (const [a, b] of cuts) {
    if (a > x) out.push(place(chamferBox(a - x, h, t, 0.03, { color: col }), (x + a) / 2, h / 2, 0));
    out.push(place(chamferBox(b - a, sy0, t, 0.03, { color: col }), (a + b) / 2, sy0 / 2, 0));
    out.push(place(chamferBox(b - a, h - sy1, t, 0.03, { color: col }), (a + b) / 2, (h + sy1) / 2, 0));
    x = b;
  }
  if (x < len / 2) out.push(place(chamferBox(len / 2 - x, h, t, 0.03, { color: col }), (x + len / 2) / 2, h / 2, 0));
  // buttress ribs on the back face and a capping band, both cast-in-place cues
  if (opts.ribs !== false) {
    for (let bx = -len / 2 + 1.6; bx < len / 2; bx += 3.2) {
      out.push(place(chamferBox(0.4, h - 0.5, 0.55, 0.03, { color: col }), bx, (h - 0.5) / 2, -t / 2 - 0.25));
    }
  }
  out.push(place(chamferBox(len + 0.12, 0.16, t + 0.12, 0.035, { color: col }), 0, h + 0.02, 0));
  return out;
}

// Chain-link fence: the posts, rails and barbed-wire arms as geometry, the mesh
// itself as a separate alpha-mapped quad the level builds once and reuses.
export function fenceFrame(len, h = 2.6, opts = {}) {
  const col = opts.color, out = [];
  const spacing = opts.spacing || 3.0;
  const n = Math.max(1, Math.round(len / spacing));
  for (let i = 0; i <= n; i++) {
    const x = -len / 2 + (len / n) * i;
    out.push(place(cyl(0.05, 0.055, h, 7, { color: col }), x, h / 2, 0));
    if (opts.barbed !== false) {
      out.push(place(cyl(0.028, 0.028, 0.52, 5, { color: col }), x, h + 0.20, 0.16, 0, 0.9));
      for (let k = 0; k < 3; k++) {
        out.push(place(cyl(0.008, 0.008, len / n, 4, { color: col }),
          x + len / n / 2, h + 0.14 + k * 0.14, 0.09 + k * 0.09, 0, 0, Math.PI / 2));
      }
    }
  }
  out.push(place(cyl(0.028, 0.028, len, 6, { color: col }), 0, h - 0.03, 0, 0, 0, Math.PI / 2));
  out.push(place(cyl(0.022, 0.022, len, 5, { color: col }), 0, 0.09, 0, 0, 0, Math.PI / 2));
  return out;
}

// A sand drift: a soft berm section swept along +X with a concave face and a
// jittered crest. Sand piles against the windward side of everything out here,
// and nothing kills a "props dropped on a plane" look faster.
export function drift(len, h, dep, opts = {}) {
  const nx = Math.max(4, Math.round(len / 1.4)), nz = 5;
  const col = opts.color || WHITE;
  const rnd = mulberry(opts.seed || 3);
  const jag = [];
  for (let i = 0; i <= nx; i++) jag.push(0.72 + rnd() * 0.56);
  const pos = [], nrm = [], uvs = [], cols = [];
  const pt = (i, j) => {
    const u = i / nx, v = j / nz;
    const hh = h * jag[i];
    // concave leading face, tapering to nothing at both ends of the run
    const taper = Math.min(1, Math.sin(Math.PI * Math.min(1, u * 1.0)) * 1.35);
    const y = hh * Math.pow(1 - v, 1.9) * taper;
    return [-len / 2 + u * len, y, v * dep];
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const a = pt(i, j), b = pt(i + 1, j), c = pt(i + 1, j + 1), d = pt(i, j + 1);
    // Wound so the surface faces up: (+x)×(+z) points down, so the pairs go the
    // other way round.
    for (const tri of [[a, c, b], [a, d, c]]) {
      for (const p of tri) { pos.push(p[0], p[1], p[2]); uvs.push(p[0], p[2]); cols.push(col[0], col[1], col[2]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  return [g];
}

// Rubble field — chamfered chunks of broken concrete, sized on a power law so
// there are a few big slabs and a lot of gravel. Used at the blown wall and
// under anything that has collapsed.
export function rubble(n, radius, opts = {}) {
  const col = opts.color, out = [];
  const rnd = mulberry(opts.seed || 11);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * radius;
    const s = 0.10 + Math.pow(rnd(), 3) * (opts.big || 0.7);
    out.push(place(chamferBox(s * (1 + rnd()), s * (0.35 + rnd() * 0.4), s * (1 + rnd()), s * 0.12, { color: col }),
      Math.cos(a) * r, s * 0.2, Math.sin(a) * r, rnd() * 3.14, (rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.5));
  }
  return out;
}

// Control console: a slab desk, a raked instrument face and a bank of panels.
// The rake is the whole read — a vertical face looks like a filing cabinet.
export function console3(w, opts = {}) {
  const col = opts.color, dark = opts.dark || col, out = [];
  out.push(place(chamferBox(w, 0.78, 0.86, 0.02, { color: col }), 0, 0.39, 0));
  out.push(place(chamferBox(w, 0.62, 0.14, 0.02, { color: dark }), 0, 1.05, -0.22, 0, -0.45));
  out.push(place(chamferBox(w - 0.1, 0.06, 0.9, 0.015, { color: dark }), 0, 0.80, 0.02));
  for (let x = -w / 2 + 0.25; x < w / 2; x += 0.5) {
    out.push(place(chamferBox(0.36, 0.42, 0.03, 0.01, { color: dark }), x, 1.06, -0.28, 0, -0.45));
  }
  return out;
}

// Rooftop air handler. Louvred sides and a recessed fan cowl, because the two
// things that identify one at 60 m are the louvre stripe and the round hole.
export function hvac(w, h, d, opts = {}) {
  const col = opts.color, out = [];
  out.push(place(chamferBox(w, h, d, 0.02, { color: col }), 0, h / 2, 0));
  for (const sz of [-1, 1]) {
    for (let y = 0.18; y < h - 0.14; y += 0.13) {
      out.push(place(chamferBox(w * 0.8, 0.075, 0.035, 0.006, { color: col }), 0, y, sz * (d / 2 + 0.012), 0, 0, 0));
    }
  }
  out.push(place(cyl(w * 0.26, w * 0.26, 0.14, 12, { color: col }), 0, h + 0.05, 0));
  out.push(place(torus(w * 0.26, 0.03, 5, 12, Math.PI * 2, { color: col }), 0, h + 0.13, 0, 0, Math.PI / 2));
  return out;
}

// ── helpers ──────────────────────────────────────────────────────────────────

export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
