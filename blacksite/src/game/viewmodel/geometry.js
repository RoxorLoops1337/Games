// Procedural gun-part geometry: profiles, lathes, extrusions and swept sections.
//
// A first-person weapon is on screen for the entire game, so it is the one place
// in the project where geometry budget is unambiguously worth spending. Nothing
// in here builds from stacked cuboids. What separates a weapon from a prop in
// silhouette is a real cross-section — an AR upper is not a box, it is a rounded
// slab with a rail welded along the top and a relief cut down the side, and you
// read that from twenty metres away. So every part starts as a 2D profile and
// gets revolved, extruded along an axis, or swept down a curve.
//
// Everything chamfers. A perfectly sharp 90° edge catches no specular highlight
// at any angle, which is why untextured CG reads as plastic: real objects have a
// 0.3 mm break on every edge that lights up as a thin bright line and tells the
// eye where the form turns. At 40 cm from the lens that break is several pixels
// wide, so it is the cheapest realism in the whole file.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ── 2D profiles ─────────────────────────────────────────────────────────────
// Point loops, counter-clockwise, so that a sweep along the +tangent direction
// comes out with its normals facing the world rather than the inside of the part.

export function roundRectPts(w, h, r, seg = 3) {
  const x = w / 2, y = h / 2;
  r = Math.max(1e-5, Math.min(r, x * 0.999, y * 0.999));
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (Math.PI / 2) * (i / seg);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x - r, -y + r, -Math.PI / 2);
  corner(x - r, y - r, 0);
  corner(-x + r, y - r, Math.PI / 2);
  corner(-x + r, -y + r, Math.PI);
  return pts;
}

// The receiver cross-section that does most of the silhouette work: a rounded
// body, flat-bottomed where it meets the magwell, with a raised rib along the
// spine that the rail sits on. Two numbers control how "military" it reads —
// the shoulder width and how far the rib stands proud.
export function receiverPts(w, h, rib = 0.4, ribW = 0.55, r = 0.006) {
  const x = w / 2, y = h / 2, ry = y + h * rib;
  r = Math.max(1e-5, Math.min(r, x * 0.6, y * 0.6));
  const rx = Math.min((w * ribW) / 2, x - r - 0.0008);
  const pts = [];
  const arc = (cx, cy, a0, a1, seg) => {
    for (let i = 0; i <= seg; i++) {
      const a = a0 + (a1 - a0) * (i / seg);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  arc(x - r, -y + r, -Math.PI / 2, 0, 3);          // up the right side
  arc(x - r, y - r, 0, Math.PI / 2, 3);            // ends at (x-r, y)
  // The rib, walked right to left so the loop stays counter-clockwise. Its own
  // corners are knocked off by 1.5 mm — the rail sits on this, and a square rib
  // under a square rail gives two coincident sharp edges and a black seam.
  pts.push([rx, y], [rx, ry - 0.0015], [rx - 0.0015, ry],
    [-rx + 0.0015, ry], [-rx, ry - 0.0015], [-rx, y]);
  arc(-x + r, y - r, Math.PI / 2, Math.PI, 3);
  arc(-x + r, -y + r, Math.PI, Math.PI * 1.5, 3);
  return pts;
}

export function shapeFrom(pts, holes) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  if (holes) for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h[0][0], h[0][1]);
    for (let i = 1; i < h.length; i++) p.lineTo(h[i][0], h[i][1]);
    p.closePath();
    s.holes.push(p);
  }
  return s;
}

// Extrude a profile along +Z and centre it on the extrusion axis, so the caller
// positions the part by its middle rather than by an arbitrary end.
export function extrudePts(pts, depth, opts = {}) {
  const bevel = opts.bevel === undefined ? 0.0016 : opts.bevel;
  const g = new THREE.ExtrudeGeometry(shapeFrom(pts, opts.holes), {
    depth: Math.max(1e-4, depth - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel, bevelSize: bevel, bevelOffset: 0,
    bevelSegments: opts.bevelSegments === undefined ? 2 : opts.bevelSegments,
    curveSegments: opts.curveSegments === undefined ? 4 : opts.curveSegments,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2 + bevel);
  return g;
}

// A chamfered slab. Used everywhere a real gun has a milled block: gas blocks,
// sight bases, rail sections, magwell walls.
export function slab(w, h, d, r = 0.004, bevel = 0.0016) {
  return extrudePts(roundRectPts(w, h, r, 2), d, { bevel });
}

// ── lathes ──────────────────────────────────────────────────────────────────
// Profiles are given as [radius, z] pairs ordered from the shooter's end toward
// the muzzle, because that is how you describe a barrel out loud. -Z is forward
// (it is a camera-facing scene), so the y of the lathe is the negated z.

export function latheZ(profile, seg = 18) {
  const pts = profile.map(([r, z]) => new THREE.Vector2(Math.max(1e-5, r), -z));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateX(-Math.PI / 2);
  return g;
}

// A ring of flutes, ports or serrations cut *around* a cylinder. Real geometry
// rather than a texture, because at this distance a normal map on a silhouette
// edge fools nobody.
export function ringOfSlots(n, radius, z0, z1, w, depth, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const g = slab(w, depth, z1 - z0, w * 0.3, 0.0008);
    g.translate(0, radius, (z0 + z1) / 2);
    g.rotateZ(a);
    out.push(g);
  }
  return out;
}

// ── swept sections ──────────────────────────────────────────────────────────
// The one thing neither a lathe nor a straight extrusion can do: a curved
// magazine, a raked grip, a curled finger. Frames carry their own scale so a
// part can taper as it goes.

export function frameChain(points, up = [0, 1, 0]) {
  const frames = [];
  const U = new THREE.Vector3(up[0], up[1], up[2]).normalize();
  const t = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    const a = points[Math.max(0, i - 1)], b = points[Math.min(points.length - 1, i + 1)];
    t.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    // Gram-Schmidt against the up hint keeps the section from rolling as the
    // path bends — a Frenet frame would spin the magazine around its own axis
    // through an inflection, which looks like the part is being wrung out.
    v.copy(U).addScaledVector(t, -U.dot(t));
    if (v.lengthSq() < 1e-8) v.set(0, 0, 1).addScaledVector(t, -t.z);
    v.normalize();
    u.crossVectors(v, t).normalize();
    frames.push({ p: new THREE.Vector3(points[i][0], points[i][1], points[i][2]), u: u.clone(), v: v.clone(), sx: 1, sy: 1 });
  }
  return frames;
}

export function sweep(profile, frames, opts = {}) {
  const n = profile.length, m = frames.length;
  const cap = opts.cap !== false;
  const vcount = m * n + (cap ? 2 : 0);
  const pos = new Float32Array(vcount * 3);
  const uv = new Float32Array(vcount * 2);
  for (let j = 0; j < m; j++) {
    const f = frames[j], sx = f.sx === undefined ? 1 : f.sx, sy = f.sy === undefined ? 1 : f.sy;
    for (let i = 0; i < n; i++) {
      const a = profile[i][0] * sx, b = profile[i][1] * sy, k = (j * n + i) * 3;
      pos[k] = f.p.x + f.u.x * a + f.v.x * b;
      pos[k + 1] = f.p.y + f.u.y * a + f.v.y * b;
      pos[k + 2] = f.p.z + f.u.z * a + f.v.z * b;
      uv[(j * n + i) * 2] = i / n;
      uv[(j * n + i) * 2 + 1] = j / (m - 1 || 1);
    }
  }
  const idx = [];
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      const a = j * n + i, b = j * n + i2, c = (j + 1) * n + i2, d = (j + 1) * n + i;
      idx.push(a, b, c, a, c, d);
    }
  }
  if (cap) {
    const c0 = m * n, c1 = m * n + 1;
    for (const [ci, j] of [[c0, 0], [c1, m - 1]]) {
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < n; i++) { x += pos[(j * n + i) * 3]; y += pos[(j * n + i) * 3 + 1]; z += pos[(j * n + i) * 3 + 2]; }
      pos[ci * 3] = x / n; pos[ci * 3 + 1] = y / n; pos[ci * 3 + 2] = z / n;
      uv[ci * 2] = 0.5; uv[ci * 2 + 1] = j ? 1 : 0;
    }
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      idx.push(c0, i2, i);                                   // start cap faces -tangent
      idx.push(c1, (m - 1) * n + i, (m - 1) * n + i2);        // end cap faces +tangent
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// A curled tube, which is every finger on both hands and every cable on the gun.
export function tubeCurve(points, r, tubular = 8, radial = 6, taper = 1) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  const g = new THREE.TubeGeometry(curve, tubular, r, radial, false);
  if (taper !== 1) {
    // Fingers are fatter at the knuckle than at the tip. Scale the ring radius
    // by walking the v coordinate, which TubeGeometry lays out along the curve.
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const t = uv.getY(i), c = curve.getPointAt(Math.min(1, Math.max(0, t)));
      const s = 1 + (taper - 1) * t;
      p.setXYZ(i, c.x + (p.getX(i) - c.x) * s, c.y + (p.getY(i) - c.y) * s, c.z + (p.getZ(i) - c.z) * s);
    }
    g.computeVertexNormals();
  }
  return g;
}

// ── shading ─────────────────────────────────────────────────────────────────
// Colour and wear go into vertex colours rather than into a material, for two
// reasons: it lets thirty parts merge into one draw call while still reading as
// different alloys, and it puts the edge wear exactly where the chamfers are.
//
// A gun that has been carried wears silver on every corner it has knocked
// against a door frame, and stays dark in every recess where the finish never
// gets touched. Both fall straight out of the normal: a vertex whose normal is
// off all three axes is on a chamfer, and a vertex low in the part is on the
// underside where the light does not reach.

const _bb = new THREE.Box3();

export function shade(geo, hex, opts = {}) {
  const wear = opts.wear === undefined ? 0.5 : opts.wear;
  const ao = opts.ao === undefined ? 0.35 : opts.ao;
  const grain = opts.grain === undefined ? 0.035 : opts.grain;
  const round = !!opts.round;   // lathed parts have no flat faces to compare against

  const c = new THREE.Color(hex);
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const n = pos.count, col = new Float32Array(n * 3);
  geo.computeBoundingBox();
  _bb.copy(geo.boundingBox);
  const yr = Math.max(1e-4, _bb.max.y - _bb.min.y);

  for (let i = 0; i < n; i++) {
    let k = 1;
    if (wear > 0 && !round) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      // 0 on a face square to an axis, ~0.42 on a 45° break, which is what a
      // chamfer is. Squared so only the genuine corners go bright.
      const edge = Math.min(1, Math.max(0, (1 - Math.max(ax, ay, az)) * 2.5));
      k += wear * edge * edge;
    } else if (wear > 0) {
      // On a revolved part the wear lives on the crest facing up and outward.
      k += wear * 0.35 * Math.max(0, nrm.getY(i));
    }
    if (ao > 0) {
      // Two cheap occlusion terms standing in for the ambient shadow the view
      // scene cannot cast: height within the part, because the underside of a
      // receiver never sees the sky, and how far the normal faces down, because
      // that is where a real bake would go dark. Without them every surface
      // returns the same irradiance and the weapon reads as one flat cut-out.
      const t = (pos.getY(i) - _bb.min.y) / yr;
      const down = 0.5 - 0.5 * nrm.getY(i);
      k *= 1 - ao * (0.55 * (1 - t) * (1 - t) + 0.45 * down * down);
    }
    if (grain > 0) {
      const h = Math.sin(pos.getX(i) * 517.3 + pos.getY(i) * 311.7 + pos.getZ(i) * 727.1) * 43758.5453;
      k *= 1 + (h - Math.floor(h) - 0.5) * grain * 2;
    }
    col[i * 3] = c.r * k; col[i * 3 + 1] = c.g * k; col[i * 3 + 2] = c.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// ── assembly ────────────────────────────────────────────────────────────────

// One bucket per material. Parts go in, one merged geometry per material comes
// out, so a whole rifle is five or six draw calls instead of sixty.
export function partBin() {
  const bins = new Map();
  return {
    add(mat, geo, hex, opts) {
      shade(geo, hex, opts);
      let a = bins.get(mat);
      if (!a) bins.set(mat, a = []);
      a.push(geo);
      return geo;
    },
    addAll(mat, geos, hex, opts) { for (const g of geos) this.add(mat, g, hex, opts); },
    bake() {
      const out = new Map();
      for (const [mat, list] of bins) {
        const g = mergeParts(list);
        if (g) out.set(mat, g);
      }
      bins.clear();
      return out;
    },
  };
}

export function mergeParts(list) {
  if (!list || !list.length) return null;
  if (list.length === 1) return list[0];
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    // mergeGeometries is unforgiving about mismatched attribute sets, and a
    // failure here would take the whole boot down rather than one part.
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  }
  try {
    const m = mergeGeometries(flat, false);
    if (m) return m;
  } catch { /* fall through to the un-merged path */ }
  return flat[0];
}
